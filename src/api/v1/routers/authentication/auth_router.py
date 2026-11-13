from fastapi import APIRouter, Depends, Request, Response, status, Cookie
import jwt
from loguru import logger
from typing import Dict, Any, Optional, Union

from src.models.auth_models.user_model import (
    UserCreate, UserInDB, UserResponse, PasswordUpdate,
    UserLogin, ForgotPasswordRequest, PasswordResetRequest, LoginSuccessResponse, LoginFailureResponse
)
from src.services.auth_service import AuthService
from src.services.email_service import EmailService
from src.core.handler.email_handler import SMTPHandler
from src.core.database.postgres import PostgresManager
from src.utils.upgrade_auth.auth_utils import create_and_send_token, clear_auth_cookies
from src.utils.upgrade_auth.app_error import AppError
from src.core.settings import system_setting
from src.services.security import policy


router = APIRouter()


async def get_smtp_handler() -> SMTPHandler:
    handler = SMTPHandler()
    yield handler
    await handler.disconnect_client()


async def get_email_service(
    smtp_handler: SMTPHandler = Depends(get_smtp_handler),
) -> EmailService:
    return EmailService(smtp_handler)


async def get_auth_service(
    request: Request,
    email_service: EmailService = Depends(get_email_service),
) -> AuthService:
    postgres_manager: PostgresManager = getattr(request.app.state, "postgres_manager", None)
    if not postgres_manager:
        raise RuntimeError("PostgresManager not initialized in app.state.")

    return AuthService(
        email_service=email_service,
        postgres_manager=postgres_manager,
    )


def _get_authenticated_user(request: Request) -> UserInDB:
    user = request.state.user
    if not user:
        raise AppError("You are not logged in! Please log in to get access.",
                       status_code=status.HTTP_401_UNAUTHORIZED)
    if not user.active:
        raise AppError("User account is inactive. Please contact support.",
                       status_code=status.HTTP_403_FORBIDDEN)
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Handles user registration (signup). Off unless ALLOW_PUBLIC_SIGNUP=true."""
    if not policy.public_signup_allowed():
        raise AppError(
            "Sign-up is closed. Please contact Spirit Monkey to get an account.",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    user_in_db = await auth_service.signup_user(user_data, response, request)
    return UserResponse.model_validate(user_in_db.model_dump(by_alias=True))


@router.get("/verify-email/{verification_token}", response_model=UserResponse)
async def verify_email(
    verification_token: str,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Verifies user email."""
    user_in_db = await auth_service.verify_email_token(verification_token, response, request)
    return await create_and_send_token(user_in_db, response, request)


@router.post("/login", response_model=Union[LoginSuccessResponse, LoginFailureResponse])
async def login(
    request_data: UserLogin,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Handles user login and returns only a success or failure message."""
    try:
        user_in_db = await auth_service.login_user(request_data, response, request)
        token = await create_and_send_token(user_in_db, response, request)
        return LoginSuccessResponse(id=str(user_in_db.id), token=token, status="success", message="Login successful")
    except AppError as e:
        response.status_code = e.status_code
        return LoginFailureResponse(status="failed", message="Invalid credentials or authentication failed")


@router.get("/logout", status_code=status.HTTP_200_OK)
async def logout(response: Response, request: Request, auth_service: AuthService = Depends(get_auth_service)):
    """Logs out the user by clearing the JWT cookies and invalidating refresh token(s)."""
    user_id_to_logout: Optional[str] = None
    if request.state.user:
        user_id_to_logout = str(request.state.user.id)
    else:
        jwt_token = request.cookies.get("jwt") or request.headers.get("Authorization", "").replace("Bearer ", "")
        if jwt_token:
            try:
                decoded_token = jwt.decode(jwt_token, system_setting.jwt_secret, algorithms=[system_setting.JWT_ALGORITHM])
                user_id_to_logout = decoded_token.get("_id")
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                logger.debug("Logout: Could not extract user_id from expired/invalid access token.")
                pass

    if user_id_to_logout:
        await auth_service.logout_user(user_id_to_logout)

    await clear_auth_cookies(response)
    return {"status": "success", "message": "Logged out successfully."}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    request_data: ForgotPasswordRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Initiates the password reset process."""
    # TODO: Implement in AuthService
    return {"status": "success", "message": "If a user exists, a reset link has been sent."}


@router.patch("/reset-password/{token}", response_model=UserResponse)
async def reset_password(
    token: str,
    password_data: PasswordResetRequest,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Resets user password using the provided reset token."""
    # TODO: Implement in AuthService
    return JSONResponse(status_code=501, content={"detail": "Not implemented"})


@router.patch("/update-my-password", response_model=UserResponse)
async def update_my_password(
    password_data: PasswordUpdate,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Allows an authenticated user to update their password."""
    current_user = _get_authenticated_user(request)
    # TODO: Implement in AuthService
    return JSONResponse(status_code=501, content={"detail": "Not implemented"})


@router.post("/refresh-token", response_model=UserResponse)
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(None, alias="refresh_token"),
    auth_service: AuthService = Depends(get_auth_service),
):
    """
    Exchanges a valid refresh token for a new access token and (optionally) a new refresh token.
    """
    if not refresh_token:
        logger.warning("Refresh token endpoint called without 'refresh_token' cookie.")
        raise AppError("No refresh token provided.", status_code=status.HTTP_401_UNAUTHORIZED)

    user_to_reauthenticate = await auth_service.refresh_access_token(request, response, refresh_token)
    await create_and_send_token(user_to_reauthenticate, response, request)
    return UserResponse.model_validate(user_to_reauthenticate.model_dump(by_alias=True))


@router.get("/protect", response_model=Dict[str, Any])
async def protect_endpoint_external(
    request: Request,
):
    """
    External protection endpoint to verify a token and return user details with access.
    """
    current_user = _get_authenticated_user(request)
    user_dict = current_user.model_dump(by_alias=True, exclude={'password'})
    user_dict["access"] = getattr(request.state, "access", [])
    return {"status": "success", "freshUser": user_dict}
