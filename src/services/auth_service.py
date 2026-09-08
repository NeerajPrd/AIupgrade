import secrets
import hashlib
from datetime import datetime, timezone
import asyncio
import bcrypt
import uuid
from loguru import logger
from typing import Optional, Tuple, Union, Any, Dict

from src.models.auth_models.user_model import (
    UserCreate,
    UserInDB,
    UserLogin,
    PasswordUpdate,
    ForgotPasswordRequest,
    PasswordResetRequest,
)
from src.utils.upgrade_auth.app_error import AppError
from src.services.email_service import EmailService
from src.core.settings import system_setting
from fastapi import status, Response, Request
from src.services.nosql.postgres_services import PostgresServices
from src.core.database.postgres import PostgresManager
from src.utils.upgrade_auth.auth_utils import (
    invalidate_all_refresh_tokens_for_user,
    clear_auth_cookies,
)


class AuthService:
    def __init__(
            self,
            email_service: EmailService,
            postgres_manager: PostgresManager,
    ):
        self.email_service = email_service
        self.postgres_manager = postgres_manager

    async def _get_user_by_email(self, email: str) -> Tuple[Optional[UserInDB], Optional[Any]]:
        """Helper to find user in Postgres."""
        async with self.postgres_manager.get_session() as session:
            try:
                pg_services = PostgresServices(session)
                sql_user = await pg_services.get_user_by_email(email)
                if sql_user:
                    return UserInDB(
                        _id=str(sql_user.id),
                        name=sql_user.name,
                        email=sql_user.email,
                        password=sql_user.password_hash,
                        photo=sql_user.photo,
                        role=sql_user.role,
                        active=sql_user.active,
                        verified=sql_user.verified,
                        visited=sql_user.visited,
                        bio=sql_user.bio,
                        description=sql_user.description,
                        social_media=sql_user.social_media,
                        password_changed_at=sql_user.password_changed_at,
                    ), sql_user
                return None, None
            except Exception as e:
                import traceback
                logger.error(f"Database error while getting user by email: {e}\n{traceback.format_exc()}")
                raise AppError("Service unavailable. Database connection failed.", status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

    async def signup_user(
            self, user_data: UserCreate, response: Response, request: Request
    ) -> UserInDB:
        existing_user, _ = await self._get_user_by_email(user_data.email)
        if existing_user:
            raise AppError(
                "User with that email already exists.",
                status_code=status.HTTP_409_CONFLICT,
            )

        hashed_password = await asyncio.to_thread(
            bcrypt.hashpw, user_data.password.encode("utf-8"), bcrypt.gensalt()
        )
        verification_token_raw = secrets.token_urlsafe(32)
        verification_token_hashed = hashlib.sha256(verification_token_raw.encode("utf-8")).hexdigest()

        async with self.postgres_manager.get_session() as session:
            try:
                pg_services = PostgresServices(session)
                user_dict = {
                    "id": uuid.uuid4(),
                    "name": user_data.name,
                    "email": user_data.email,
                    "password_hash": hashed_password.decode("utf-8"),
                    "photo": user_data.photo,
                    "role": user_data.role,
                    "verified": False,
                    "active": True,
                    "token": verification_token_hashed,
                    "password_changed_at": datetime.now(timezone.utc),
                    "social_media": user_data.social_media
                }
                sql_user = await pg_services.create_user(user_dict)
                user_in_db = UserInDB(
                    _id=str(sql_user.id),
                    name=sql_user.name,
                    email=sql_user.email,
                    password=sql_user.password_hash,
                    photo=sql_user.photo,
                    role=sql_user.role,
                    active=sql_user.active,
                    verified=sql_user.verified,
                    social_media=sql_user.social_media,
                    password_changed_at=sql_user.password_changed_at
                )
                await self._send_verification_email(user_data.email, verification_token_raw)
                return user_in_db
            except Exception as e:
                import traceback
                logger.error(f"Postgres signup failed: {e}\n{traceback.format_exc()}")
                raise AppError("Failed to register user. Database connection failed.", status.HTTP_503_SERVICE_UNAVAILABLE)

    async def _send_verification_email(self, email: str, token: str):
        verification_url = f"{system_setting.FAGOON_URL}/verify-email/{token}"
        try:
            sent = await self.email_service.send_signup_email(email, verification_url)
            if sent:
                logger.info("Verification email sent to {}", email)
        except Exception as e:
            logger.error("Failed to send signup email for {}: {}", email, e)
            # We don't raise an error here to avoid failing the whole registration
            # if the user was already created in the DB.

    async def verify_email_token(
            self, verification_token: str, response: Response, request: Request
    ) -> UserInDB:
        hashed_token = hashlib.sha256(verification_token.encode("utf-8")).hexdigest()

        async with self.postgres_manager.get_session() as session:
            from src.models.sql.models import User as SQLUser
            from sqlalchemy import select
            stmt = select(SQLUser).where(SQLUser.token == hashed_token)
            res = await session.execute(stmt)
            sql_user = res.scalar_one_or_none()
            if sql_user:
                sql_user.verified = True
                sql_user.token = None
                await session.commit()
                return UserInDB(
                    _id=str(sql_user.id), name=sql_user.name, email=sql_user.email,
                    password=sql_user.password_hash, photo=sql_user.photo,
                    role=sql_user.role, active=sql_user.active, verified=True
                )

        raise AppError("Invalid or expired verification token.", status_code=status.HTTP_400_BAD_REQUEST)

    async def login_user(
            self, request_data: UserLogin, response: Response, request: Request
    ) -> UserInDB:
        user_in_db, sql_user = await self._get_user_by_email(request_data.email)
        if not user_in_db:
            raise AppError("Incorrect email or password.", status_code=status.HTTP_401_UNAUTHORIZED)

        is_correct_password = await asyncio.to_thread(user_in_db.correct_password, request_data.password)
        if not is_correct_password:
            raise AppError("Incorrect email or password.", status_code=status.HTTP_401_UNAUTHORIZED)

        logger.info("User {} logged in successfully.", user_in_db.email)
        return user_in_db

    async def logout_user(self, user_id: str):
        """Invalidates all refresh tokens for the logged-out user."""
        await invalidate_all_refresh_tokens_for_user(user_id, self.postgres_manager)
        logger.info(f"All refresh tokens for user {user_id} invalidated upon logout.")

    async def refresh_access_token(self, request: Request, response: Response, refresh_token: str) -> UserInDB:
        """Validates a refresh token and returns the associated user if valid."""
        hashed_token = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()

        async with self.postgres_manager.get_session() as session:
            from src.models.sql.models import RefreshToken as SQLRefreshToken, User as SQLUser
            from sqlalchemy import select
            
            # Find the refresh token in the database
            stmt = select(SQLRefreshToken).where(SQLRefreshToken.token == hashed_token)
            res = await session.execute(stmt)
            db_token = res.scalar_one_or_none()

            if not db_token:
                logger.warning("Attempted to refresh with an invalid or non-existent token.")
                raise AppError("Invalid refresh token.", status_code=status.HTTP_401_UNAUTHORIZED)
            
            if db_token.expires_at < datetime.now(timezone.utc):
                logger.warning(f"Refresh token for user {db_token.user_id} expired.")
                # Automatically clean up expired token
                await session.delete(db_token)
                await session.commit()
                raise AppError("Refresh token has expired. Please log in again.", status_code=status.HTTP_401_UNAUTHORIZED)

            # Get the associated user
            user_stmt = select(SQLUser).where(SQLUser.id == db_token.user_id)
            user_res = await session.execute(user_stmt)
            sql_user = user_res.scalar_one_or_none()

            if not sql_user or not sql_user.active:
                raise AppError("User not found or is inactive.", status_code=status.HTTP_401_UNAUTHORIZED)

            # Invalidate the used refresh token so it cannot be reused (Rotation)
            await session.delete(db_token)
            await session.commit()

            return UserInDB(
                _id=str(sql_user.id),
                name=sql_user.name,
                email=sql_user.email,
                password=sql_user.password_hash,
                photo=sql_user.photo,
                role=sql_user.role,
                active=sql_user.active,
                verified=sql_user.verified,
                social_media=sql_user.social_media,
                password_changed_at=sql_user.password_changed_at
            )
