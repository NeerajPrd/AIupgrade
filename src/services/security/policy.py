"""Security switches and helpers shared by the API layer.

Everything here is safe-by-default: public signup and the database setup endpoint are OFF unless
the operator turns them on in .env, and a default admin account with a publicly known password is
never created (and is switched off at startup if an old install still has one).
"""

from typing import Any, Dict, Optional

from loguru import logger

# The account older versions seeded automatically, with a password published in the source code.
LEGACY_DEFAULT_ADMIN_EMAIL = "admin@fagoon.ai"
_LEGACY_DEFAULT_ADMIN_PASSWORD = "adminpassword123"

REDACTED = "[REDACTED]"
_SENSITIVE_KEY_PARTS = ("password", "passwd", "secret", "token", "api_key", "apikey", "authorization", "file_data")
_SENSITIVE_QUERY_KEYS = ("access_token", "token", "api_key", "key", "code", "state")


def public_signup_allowed() -> bool:
    """ALLOW_PUBLIC_SIGNUP=true lets anyone create an account. Default: only admins create accounts."""
    from src.core.settings import system_setting

    return bool(system_setting.ALLOW_PUBLIC_SIGNUP)


def setup_endpoint_enabled() -> bool:
    """ENABLE_SETUP_ENDPOINT=true exposes POST /setup (repoints the database) to admins. Default: off."""
    from src.core.settings import system_setting

    return bool(system_setting.ENABLE_SETUP_ENDPOINT)


def _is_sensitive(key: Any) -> bool:
    lowered = str(key).lower()
    return any(part in lowered for part in _SENSITIVE_KEY_PARTS)


def redact_for_log(value: Any, _depth: int = 0) -> Any:
    """Copy of a JSON body with passwords, tokens, keys and uploaded file contents replaced."""
    if _depth > 6:
        return "[...]"
    if isinstance(value, dict):
        return {
            k: (REDACTED if _is_sensitive(k) and v not in (None, "") else redact_for_log(v, _depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact_for_log(v, _depth + 1) for v in value[:50]]
    return value


def redact_query_for_log(params: Dict[str, str]) -> Dict[str, str]:
    """Query parameters with login tokens and OAuth codes replaced (they would otherwise sit in the logs)."""
    return {
        k: (REDACTED if k.lower() in _SENSITIVE_QUERY_KEYS or _is_sensitive(k) else v) for k, v in params.items()
    }


def is_legacy_default_password(password_hash: Optional[str]) -> bool:
    import bcrypt

    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(_LEGACY_DEFAULT_ADMIN_PASSWORD.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False  # not a bcrypt hash, so not the seeded one


async def disable_legacy_default_admin(postgres_manager) -> bool:
    """Switch off the old seeded admin account if it still has its published default password.

    An account whose password was changed is left alone. Nothing is deleted: the row stays, set
    to inactive, and can be re-enabled by an operator after giving it a real password.
    Returns True if an account was switched off. Never raises (startup must not fail on this).
    """
    try:
        from src.services.nosql.postgres_services import PostgresServices

        async with postgres_manager.get_session() as session:
            user = await PostgresServices(session).get_user_by_email(LEGACY_DEFAULT_ADMIN_EMAIL)
            if user is None or not user.active or not is_legacy_default_password(user.password_hash):
                return False
            user.active = False
            await session.commit()
            logger.warning(
                "SECURITY: the default admin account {} still had its published default password and has been "
                "switched off. Create your own admin with scripts/create_admin.py.",
                LEGACY_DEFAULT_ADMIN_EMAIL,
            )
            return True
    except Exception as err:
        logger.error("Could not check the legacy default admin account: {}", type(err).__name__)
        return False
