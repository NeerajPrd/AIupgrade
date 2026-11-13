from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import RedirectResponse, JSONResponse, Response
from loguru import logger
import uuid
from src.core.settings import system_setting
from src.services.security import policy
from src.core.exceptions import UnauthorizedGoogleAccess
from src.workspace_crud.crud.google_token import GoogleTokenCRUD
from src.workspace_crud.crud.user import UserCRUD
from src.schemas.workspace.auth import GoogleUserDetails
from src.schemas.common import SuccessResponse, FailureResponse
from src.schemas.workspace.common import GoogleAuthURL
from src.services.google_workspace.google_auth import GoogleAuthService
from src.core.globals import get_postgres_services
from src.models.sql.models import GoogleUser as SQLGoogleUser
from sqlalchemy import insert

from src.services.nosql.postgres_services import PostgresServices
from src.utils.upgrade_auth.auth_utils import create_and_send_token
from src.models.auth_models.user_model import UserInDB
import bcrypt
import secrets
import asyncio

router = APIRouter()

async def get_google_auth_service(request: Request) -> GoogleAuthService:
    pg_manager = request.app.state.postgres_manager
    user_crud = UserCRUD(pg_manager)
    google_token_crud = GoogleTokenCRUD(pg_manager)
    return GoogleAuthService(user_crud, google_token_crud)

@router.get("/google/login", response_model=GoogleAuthURL)
async def google_login(request: Request, google_auth_service: GoogleAuthService = Depends(get_google_auth_service)):
    try:
        # Create a Flow and generate the authorization URL so we can persist the PKCE verifier
        flow = google_auth_service.get_auth_flow()
        authorization_url, state = flow.authorization_url(access_type="offline", include_granted_scopes="true")

        code_verifier = getattr(flow, "code_verifier", None)
        
        redirect_response = RedirectResponse(url=authorization_url)
        if code_verifier:
            # FIX: Store the state and code_verifier in an HttpOnly cookie instead of app.state
            secure_flag = False if getattr(system_setting, "ENV", "development") == "development" else True
            redirect_response.set_cookie(
                key=f"oauth_state_{state}", 
                value=code_verifier, 
                httponly=True, 
                max_age=600, # Expires in 10 minutes
                secure=secure_flag,
                samesite="lax"
            )

        logger.info(f"Redirecting user to Google auth URL (state={state})")
        return redirect_response
    except Exception as e:
        logger.error("Error generating Google auth URL: {}", e)
        raise HTTPException(status_code=500, detail="Could not initiate Google authentication.")

@router.get("/google/callback", response_class=RedirectResponse)
async def google_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(None),
    google_auth_service: GoogleAuthService = Depends(get_google_auth_service),
):
    try:
        # FIX: Retrieve the PKCE code_verifier from the cookie, not app.state
        cookie_name = f"oauth_state_{state}" if state else None
        code_verifier = request.cookies.get(cookie_name) if cookie_name else None

        token_info = await google_auth_service.exchange_code_for_token(code, code_verifier=code_verifier)

        # Attempt to find or create a corresponding system user, then issue JWT cookies
        pg_manager = request.app.state.postgres_manager
        system_user = None
        async with pg_manager.get_session() as session:
            pg_services = PostgresServices(session)

            # Try to locate by returned user_id
            user_id = token_info.get("user_id")
            if user_id:
                try:
                    uid = uuid.UUID(user_id) if isinstance(user_id, str) and len(user_id) == 36 else uuid.UUID(str(user_id))
                    system_user = await pg_services.get_user_by_id(uid)
                except Exception:
                    system_user = None

            # Fallback: try locate by email
            if not system_user and token_info.get("email"):
                system_user = await pg_services.get_user_by_email(token_info.get("email"))

            # If still not found, create a new system user with a random password -
            # but only when public signup is on. Otherwise Google login would be an open signup door.
            if not system_user and not policy.public_signup_allowed():
                logger.warning("Google login refused: no existing account and public signup is off.")
                return RedirectResponse(url=f"{system_setting.FRONTEND_REDIRECT_URI}?error=signup_closed", status_code=302)
            if not system_user:
                raw_pw = secrets.token_urlsafe(16)
                hashed = await asyncio.to_thread(bcrypt.hashpw, raw_pw.encode("utf-8"), bcrypt.gensalt())
                user_dict = {
                    "id": uuid.uuid4(),
                    "name": token_info.get("email", "google_user").split("@")[0],
                    "email": token_info.get("email"),
                    "password_hash": hashed.decode("utf-8"),
                    "photo": token_info.get("profile_pic_url") or "",
                    "role": "user",
                    "verified": True,
                    "active": True,
                    "social_media": {},
                }
                system_user = await pg_services.create_user(user_dict)

            # Build UserInDB for token creation
            user_in_db = UserInDB(
                _id=str(system_user.id),
                name=system_user.name,
                email=system_user.email,
                password=system_user.password_hash,
                photo=getattr(system_user, "photo", ""),
                role=getattr(system_user, "role", "user"),
                active=getattr(system_user, "active", True),
                verified=getattr(system_user, "verified", True),
                social_media=getattr(system_user, "social_media", {}),
            )

        # Issue access + refresh tokens as cookies on a redirect response
        # Redirect the user to the frontend dashboard or to an authorize page on error
        try:
            redirect_url = f"{system_setting.FRONTEND_REDIRECT_URI.rstrip('/')}/dashboard/{user_in_db.role}"
        except Exception:
            redirect_url = system_setting.FRONTEND_REDIRECT_URI

        redirect_resp = RedirectResponse(url=redirect_url, status_code=302)

        # Delete the temporary state cookie
        if cookie_name:
            redirect_resp.delete_cookie(key=cookie_name)

        await create_and_send_token(user_in_db, redirect_resp, request)
        try:
            # Log Set-Cookie header(s) on the redirect response for debugging
            sc = redirect_resp.headers.get("set-cookie")
            logger.debug(f"Redirect response Set-Cookie: {sc}")
        except Exception:
            logger.debug("Could not read Set-Cookie header from redirect response.")
        return redirect_resp
    except UnauthorizedGoogleAccess:
        # Specific unauthorized Google access (e.g., org restriction)
        logger.warning("Unauthorized Google access during OAuth callback")
        return RedirectResponse(url=f"{system_setting.FRONTEND_REDIRECT_URI.rstrip('/')}/authorize", status_code=302)
    except Exception as e:
        logger.error(f"Google OAuth callback failed: {e}", exc_info=True)
        return RedirectResponse(url=f"{system_setting.FRONTEND_REDIRECT_URI}?error=auth_failed", status_code=302)

@router.post("/save")
async def save_user_details(
    request: Request,
    input_request: GoogleUserDetails,
):
    pg_manager = request.app.state.postgres_manager
    async with pg_manager.get_session() as session:
        try:
            # Check if exists
            from sqlalchemy import select
            stmt = select(SQLGoogleUser).where(SQLGoogleUser.google_id == input_request.google_id)
            res = await session.execute(stmt)
            if res.scalar_one_or_none():
                return SuccessResponse(status="success", message="Already linked", data={})

            new_g_user = SQLGoogleUser(
                id=uuid.uuid4(),
                google_id=input_request.google_id,
                system_user_id=uuid.UUID(input_request.system_user_id),
                email=input_request.email or "unknown@gmail.com",
            )
            session.add(new_g_user)
            await session.commit()
            return SuccessResponse(status="success", message="Linked successfully", data={})
        except Exception as e:
            logger.error("Failed to link Google user: {}", e)
            return JSONResponse(status_code=400, content={"detail": "Link failed"})
