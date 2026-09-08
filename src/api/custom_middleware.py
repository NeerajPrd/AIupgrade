import json
import jwt
import uuid
from loguru import logger
from typing import Optional, Tuple, Any, Dict, List
from starlette.responses import JSONResponse
from starlette.status import HTTP_401_UNAUTHORIZED
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message
from starlette.datastructures import MutableHeaders
from datetime import datetime, timezone
import hashlib
import traceback

from src.constants import ALLOWED_URL_PATH_WITHOUT_AUTHORIZATION
from src.core.settings import system_setting
from src.models.auth_models.user_model import UserInDB
from src.services.nosql.postgres_services import PostgresServices
from src.core.database.postgres import PostgresManager
from src.utils.upgrade_auth.app_error import AppError
from src.utils.upgrade_auth.auth_utils import (
    create_access_token,
    create_refresh_token,
    set_auth_cookies,
    clear_auth_cookies,
)

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method == "OPTIONS" or self._is_public_path(request.url.path):
            return await call_next(request)

        request.state.user = None
        request.state.access = []
        request.state.user_id = None

        postgres_manager: Optional[PostgresManager] = getattr(request.app.state, "postgres_manager", None)

        access_token = self._get_access_token(request)
        refresh_token_cookie = request.cookies.get("refresh_token")

        if not access_token:
            if refresh_token_cookie and request.url.path != f"{system_setting.API_V1_STR}/auth/refresh-token":
                logger.info("Access token missing, attempting refresh.")
                return await self._handle_refresh_and_proceed(request, call_next, refresh_token_cookie)
            else:
                logger.warning(f"401 Unauthorized: Access token is missing. Path: {request.url.path} | Headers: {dict(request.headers)} | Cookies: {dict(request.cookies)}")
                return JSONResponse(
                    status_code=HTTP_401_UNAUTHORIZED,
                    content={"detail": "Authentication failed: Access token is missing."}
                )

        # 1. Perform Authentication
        try:
            decoded_token = jwt.decode(
                access_token,
                system_setting.jwt_secret,
                algorithms=[system_setting.JWT_ALGORITHM],
            )
            user_id = decoded_token.get("_id")
            issued_at = decoded_token.get("iat")

            if not user_id:
                raise AppError("Invalid token: missing user ID", status_code=HTTP_401_UNAUTHORIZED)

            current_user = None
            
            # PostgreSQL lookup
            if postgres_manager:
                async with postgres_manager.get_session() as session:
                    pg_services = PostgresServices(session)
                    try:
                        user_uuid = None
                        if len(user_id) == 36:
                            user_uuid = uuid.UUID(user_id)
                        
                        if user_uuid:
                            sql_user = await pg_services.get_user_by_id(user_uuid)
                            if sql_user and sql_user.active:
                                current_user = UserInDB(
                                    _id=str(sql_user.id),
                                    name=sql_user.name,
                                    email=sql_user.email,
                                    password=sql_user.password_hash,
                                    photo=sql_user.photo,
                                    role=sql_user.role,
                                    active=sql_user.active,
                                    social_media=sql_user.social_media
                                )
                                if sql_user.password_changed_at:
                                    current_user.password_changed_at = sql_user.password_changed_at
                    except Exception as pg_err:
                        logger.warning("Postgres auth lookup failed: {}", pg_err)

            if not current_user:
                raise AppError("Unauthorized: user not found or inactive", status_code=HTTP_401_UNAUTHORIZED)

            if (current_user.password_changed_at and issued_at and 
                issued_at < current_user.password_changed_at.timestamp()):
                raise AppError("Token invalid due to password change. Please log in again.", status_code=HTTP_401_UNAUTHORIZED)

            request.state.user = current_user
            request.state.user_id = user_id
            
            # Access control is also tied to User model now
            request.state.access = [{"role": current_user.role}] if current_user.role else []

            logger.debug(f"User {user_id} successfully authenticated.")

        except jwt.ExpiredSignatureError:
            logger.info("Access token expired. Attempting refresh...")
            if refresh_token_cookie:
                return await self._handle_refresh_and_proceed(request, call_next, refresh_token_cookie)
            else:
                response = JSONResponse(
                    status_code=HTTP_401_UNAUTHORIZED,
                    content={"detail": "Token expired. Please log in again."}
                )
                await clear_auth_cookies(response)
                return response

        except (jwt.InvalidTokenError, AppError) as e:
            detail = e.message if isinstance(e, AppError) else "Invalid token. Please log in again."
            status_code = e.status_code if isinstance(e, AppError) else HTTP_401_UNAUTHORIZED
            logger.warning(f"Authentication failed: {detail}")
            response = JSONResponse(status_code=status_code, content={"detail": detail})
            await clear_auth_cookies(response)
            return response

        except Exception as e:
            logger.error("An unexpected error occurred in auth middleware during verification", exc_info=True)
            response = JSONResponse(
                status_code=500,
                content={"detail": "An internal server error occurred during authentication."}
            )
            await clear_auth_cookies(response)
            return response

        # 2. Dispatch to Downstream Router (outside of Auth try-except)
        return await call_next(request)

    async def _handle_refresh_and_proceed(
        self, request: Request, call_next: RequestResponseEndpoint, refresh_token_raw: str
    ) -> Response:
        try:
            refresh_result = await self._perform_token_refresh(request, refresh_token_raw)
            if not refresh_result:
                raise AppError("Your session has expired. Please log in again.", HTTP_401_UNAUTHORIZED)

            (new_access_token, new_refresh_token_raw, access_expires, refresh_expires, refreshed_user) = refresh_result

            request.state.user = refreshed_user
            request.state.user_id = refreshed_user.id
            request.state.access = [{"role": refreshed_user.role}] if refreshed_user.role else []

            new_headers = MutableHeaders(request.headers)
            new_headers["Authorization"] = f"Bearer {new_access_token}"
            request.scope["headers"] = new_headers.raw

            response = await call_next(request)
            await set_auth_cookies(response, new_access_token, new_refresh_token_raw, access_expires, refresh_expires)
            return response

        except AppError as e:
            response = JSONResponse(status_code=e.status_code, content={"detail": e.message})
            await clear_auth_cookies(response)
            return response
        except Exception as e:
            logger.error("Token refresh failed", exc_info=True)
            response = JSONResponse(status_code=500, content={"detail": "An internal error occurred during token refresh."})
            await clear_auth_cookies(response)
            return response

    async def _perform_token_refresh(self, request: Request, refresh_token_raw: str):
        from src.utils.upgrade_auth.auth_utils import create_access_token, create_refresh_token
        
        postgres_manager = getattr(request.app.state, "postgres_manager", None)
        
        hashed_token = hashlib.sha256(refresh_token_raw.encode("utf-8")).hexdigest()
        
        if postgres_manager:
            async with postgres_manager.get_session() as session:
                from src.models.sql.models import RefreshToken as SQLRefreshToken, User as SQLUser
                from sqlalchemy import select
                stmt = select(SQLRefreshToken).where(
                    SQLRefreshToken.token == hashed_token,
                    SQLRefreshToken.expires_at > datetime.now(timezone.utc)
                )
                res = await session.execute(stmt)
                token_doc = res.scalar_one_or_none()
                if token_doc:
                    user = await session.get(SQLUser, token_doc.user_id)
                    if user and user.active:
                        await session.delete(token_doc)
                        await session.commit()
                        
                        refreshed_user = UserInDB(
                            _id=str(user.id), name=user.name, email=user.email,
                            password=user.password_hash, photo=user.photo,
                            role=user.role, active=user.active,
                            password_changed_at=user.password_changed_at,
                            social_media=user.social_media
                        )
                        
                        new_access = await create_access_token(str(refreshed_user.id))
                        new_refresh_raw, new_refresh_exp = await create_refresh_token(str(refreshed_user.id), PostgresServices(session))
                        
                        payload = jwt.decode(new_access, system_setting.jwt_secret, algorithms=[system_setting.JWT_ALGORITHM])
                        return (new_access, new_refresh_raw, datetime.fromtimestamp(payload["exp"], tz=timezone.utc), new_refresh_exp, refreshed_user)

        return None

    def _is_public_path(self, path: str) -> bool:

        if "/webhook/" in path or "/file/image/" in path or "/workflow-api/" in path or "/agent-api/" in path:
            return True
        # Normalize path: remove trailing slash for comparison
        path_to_check = path.rstrip("/") if path != "/" else path
        
        # 1. Check against static ALLOWED_URL_PATH_WITHOUT_AUTHORIZATION
        normalized_allowed = [p.rstrip("/") for p in ALLOWED_URL_PATH_WITHOUT_AUTHORIZATION]
        if path_to_check in normalized_allowed:
            return True

        # 2. Check against dynamic paths based on current API_V1_STR
        v1 = system_setting.API_V1_STR.rstrip("/")
        dynamic_allowed = [
            f"{v1}/auth/login",
            f"{v1}/auth/register",
            f"{v1}/auth/forgot-password",
            f"{v1}/auth/refresh-token",
            f"{v1}/users/login",
            f"{v1}/users/signup",
            f"{v1}/users/forgot-password",
            f"{v1}/users/refresh-token",
        ]
        if path_to_check in dynamic_allowed:
            return True

        # 3. Dynamic prefix-based paths
        dynamic_prefixes = [
            f"{v1}/auth/verify-email/",
            f"{v1}/auth/reset-password/",
            f"{v1}/users/verify-email/",
            f"{v1}/users/reset-password/",
            f"{v1}/webhook/",
        ]
        if any(path.startswith(dp) for dp in dynamic_prefixes):
            return True

        # 4. Handle potential prefixes (swagger path, /agent-api, /api)
        possible_prefixes = [
            system_setting.API_SWAGGER_PATH.rstrip("/"),
            "/agent-api",
            "/api"
        ]
        
        for prefix in possible_prefixes:
            if prefix and path.startswith(prefix) and path != prefix:
                sub_path = path[len(prefix):]
                if not sub_path.startswith("/"):
                    sub_path = "/" + sub_path
                # Recursively check the sub-path
                if self._is_public_path(sub_path):
                    return True

        return False

    def _get_access_token(self, request: Request) -> Optional[str]:
        authorization: str = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            return authorization.split(" ")[1]
        # Support alternative token transports for development/debugging:
        # 1. Cookie named 'jwt' (primary)
        # 2. Header 'X-Access-Token' (alternative)
        # 3. Query param 'access_token' (convenience)
        token = request.cookies.get("jwt")
        if token:
            return token
        token = request.headers.get("X-Access-Token") or request.headers.get("x-access-token")
        if token:
            return token
        return request.query_params.get("access_token")


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        log_parts = [f"Incoming request: {request.method} {request.url}"]
        query_params = dict(request.query_params)
        if query_params: log_parts.append(f"Params: {query_params}")

        # Skip body reading for webhook routes to avoid consuming the stream for signature verification
        if "/webhook/" in request.url.path:
            logger.info(" | ".join(log_parts) + " | Body: [SKIPPED FOR WEBHOOK]")
            return await call_next(request)

        body_bytes = await request.body()
        content_type = request.headers.get("content-type", "")
        
        async def receive() -> Message:
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        request = Request(request.scope, receive)

        if "application/json" in content_type:
            try:
                body = json.loads(body_bytes.decode("utf-8"))
                log_parts.append(f"Body: {body}")
            except Exception:
                pass

        logger.info(" | ".join(log_parts))
        response = await call_next(request)
        logger.info(f"Response: {response.status_code}")
        return response


class PublicAgentApiCORSMiddleware(BaseHTTPMiddleware):
    """
    The /agent-api/* chat endpoint is called directly from arbitrary
    third-party websites embedding the chat widget, authenticated by an
    X-API-Key header rather than cookies. The app-wide CORSMiddleware
    keeps a strict origin allowlist for the cookie-authenticated app and
    must stay that way, so this middleware carves out an open,
    credential-less CORS policy for just this path prefix.

    Must be registered with app.add_middleware() AFTER CORSMiddleware so
    it wraps outside it (Starlette's add_middleware prepends, so the
    last-added middleware runs first) and can answer preflight requests
    before the strict allowlist ever sees them.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if "/agent-api/" not in request.url.path:
            return await call_next(request)

        origin = request.headers.get("origin")

        if request.method == "OPTIONS":
            headers = {
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": request.headers.get(
                    "access-control-request-headers", "Content-Type, X-API-Key"
                ),
                "Access-Control-Max-Age": "600",
            }
            if origin:
                headers["Access-Control-Allow-Origin"] = origin
                headers["Vary"] = "Origin"
            return Response(status_code=204, headers=headers)

        response = await call_next(request)
        # The response has already passed through the app-wide CORSMiddleware,
        # which unconditionally stamps Access-Control-Allow-Credentials: true.
        # This endpoint is key-authenticated, not cookie-authenticated, and
        # must never pair a reflected/wildcard origin with allow-credentials
        # (that combination is a browser-exploitable CORS misconfiguration).
        if "access-control-allow-credentials" in response.headers:
            del response.headers["access-control-allow-credentials"]
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response
