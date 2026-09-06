"""Application settings with a layered resolver.

Precedence (highest first):
    1. Explicit constructor kwargs (used internally)
    2. Environment variables  -> contributors set these via .env
    3. .env file
    4. <DATA_DIR>/config.json  -> package mode persists generated values here
    5. Hardcoded field defaults

The same class serves both audiences: a contributor's env wins, while a
package user who sets nothing still boots on file + default layers.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Annotated, List, Optional

from pydantic import AnyUrl, BeforeValidator, computed_field, model_validator
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class JsonConfigSource(PydanticBaseSettingsSource):
    """Lowest-priority source (above field defaults): reads persisted config
    written by the bootstrap step at <DATA_DIR>/config.json."""

    def __init__(self, settings_cls, path: Path):
        super().__init__(settings_cls)
        self._path = path

    def get_field_value(self, field, field_name):  # abstract, unused here
        return None, field_name, False

    def __call__(self) -> dict:
        try:
            return json.loads(self._path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {}


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


# ==============================================================================
# Naming and Casing Convention:
#   1. Connection URLs, third-party API Keys, and standard system-level environment
#      variables remain UPPERCASE (e.g. DATABASE_URL, REDIS_URL, OPENAI_API_KEY, etc.)
#      to mirror the standard Unix env-var naming expected by external integrations.
#   2. Local directories, feature switches, generated secrets, and runtime-mode flags
#      remain lowercase (e.g. data_dir, lite_mode, encryption_key, jwt_secret, features)
#      for internal system consistency.
# ==============================================================================
class Settings(BaseSettings):
    # --- dual mode ---
    lite_mode: bool = True
    data_dir: str = "/data"
    web_concurrency: int = 1
    database_url_default: str = ""  # bundled DSN injected by compose in lite mode
    allow_self_restart: bool = False  # if true, app SIGTERMs itself after a switch
    features: str = "chat,agents,workflow,vibecoder"
    encryption_key: str = ""

    # --- existing configs (made optional with defaults for zero-env boot) ---
    FRONTEND_HOST: str = "*"

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Fagoon Agents Workflow"
    API_SWAGGER_PATH: str = "docs"
    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    @computed_field
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [self.FRONTEND_HOST]

    ALLOWED_CORS_ORIGIN: List[str] = [
        "http://localhost:3000",
        "https://develop-upgrade.fagoon.ai",
        "https://upgrade.fagoon.ai",
        "http://0.0.0.0:2321",
        "http://localhost:8000",
        "https://upgrade.devfagoon.online",# new added
        "http://localhost:9999", # Added for testing QR.html
        "http://127.0.0.1:9999",
    ]

    # LLM Related Configuration
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    HUGGINGFACE_API_KEY: Optional[str] = None
    ELEVENLABS_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    ENV: str = "development"

    # PostgreSQL Connection
    DATABASE_URL: str = ""

    # External APIs
    GROQ_MODEL_NAME: str = "llama3-8b-8192"

    # Google OAuth Settings
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    FRONTEND_REDIRECT_URI: str = "http://localhost:3000"

    GOOGLE_AUTH_SCOPES: list[str] = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/spreadsheets",
    ]

    # Video related configs
    GCS_BUCKET_NAME: str = ""
    GEMINI_API_KEY: Optional[str] = None
    VIDEO_STORAGE_PATH: str = ""
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""
    SECRET_KEY: str = ""
    LOG_LEVEL: str = "INFO"
    ENABLE_VEO_GENERATION: bool = True
    MAX_VEO_GENERATIONS_PER_JOB: int = 15
    MAX_VEO_VIDEO_DURATION_SECONDS: int = 5
    MOCK_VEO_API_IF_DISABLED: bool = True

    # Upgrade Authentication
    jwt_secret: str = ""
    JWT_EXPIRES_IN: str = "90d"
    JWT_ALGORITHM: str = "HS256"
    JWT_COOKIE_EXPIRES_IN_DAYS: int = 90
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie Domain Settings
    COOKIE_DOMAIN_1: str = ""
    COOKIE_DOMAIN_2: str = ""
    COOKIE_DOMAIN_3: str = ""
    # Email Settings
    EMAIL_HOST: str = "localhost"
    EMAIL_PORT: int = 587
    EMAIL_USERNAME: str = "mock_username"
    EMAIL_PASSWORD: str = "mock_password"
    EMAIL_FROM: str = "mock_from@example.com"

    FAGOON_URL: str = ""
    DEFAULT_URL: str = ""
    SERPER_API_KEY: str = ""
    SERPAPI_API_KEY: str = ""
    FAL_KEY: Optional[str] = None
    FAST_MODEL_PROVIDER: str = "gemini"
    FAST_MODEL_ID: str = "gemini-2.5-flash"

    SMART_MODEL_PROVIDER: str = "gemini"
    SMART_MODEL_ID: str = "gemini-flash-latest"

    FALLBACK_MODEL_NAME: str = "llama3.2:latest"
    FALLBACK_MODEL_PROVIDER: str = "ollama"

    # Channel webhook / integration configuration
    REDIS_URL: str = ""
    WEBHOOK_VERIFY_TOKEN: Optional[str] = None
    WHATSAPP_APP_SECRET: Optional[str] = None
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    WHATSAPP_ACCESS_TOKEN: Optional[str] = None
    FACEBOOK_APP_SECRET: Optional[str] = None
    FACEBOOK_PAGE_ACCESS_TOKEN: Optional[str] = None
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_BOT_SECRET_TOKEN: Optional[str] = None
    
    EVOLUTION_API_KEY: Optional[str] = None
    EVOLUTION_API_URL: Optional[str] = None
    WEBHOOK_URL: Optional[str] = None

    # ==================== WORKFLOW: DATABASE TUNING ====================
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_ECHO: Optional[bool] = None

    # ==================== WORKFLOW: SECURITY ====================
    ENCRYPTION_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_HASH_ROUNDS: int = 12

    # ==================== WORKFLOW: API / CORS ====================
    VERSION: str = "2.0.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_HOSTS: List[str] = ["*"]
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    # ==================== VIBE CODE MODE ====================
    VIBE_MAX_CODE_LENGTH: int = 50000

    # ==================== WORKFLOW: REDIS (individual fields) ====================
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_SSL: bool = False
    REDIS_DB: int = 0
    REDIS_MAX_CONNECTIONS: int = 10

    # ==================== WORKFLOW: GCS / STORAGE ====================
    GCS_SIGNED_URL_EXPIRY: int = 3600
    MAX_UPLOAD_SIZE_MB: int = 100
    GOOGLE_APPLICATION_CREDENTIALS: str = ""

    # ==================== WORKFLOW: CELERY ====================
    CELERY_TASK_TIMEOUT: int = 3600

    # ==================== WORKFLOW: FEATURE FLAGS ====================
    FEATURE_ENABLE_REGISTRATION: bool = True
    FEATURE_ENABLE_OAUTH: bool = True
    FEATURE_ENABLE_WEBHOOKS: bool = True
    FEATURE_ENABLE_BROWSER_NODE: bool = True
    FEATURE_ENABLE_CODE_NODE: bool = True

    # ==================== WORKFLOW: SANDBOX ====================
    SANDBOX_MODE: str = "docker"
    SANDBOX_DOCKER_IMAGE: str = "workflow-sandbox-python:latest"
    SANDBOX_TIMEOUT_SECONDS: int = 10
    SANDBOX_MAX_MEMORY_MB: int = 128
    SANDBOX_MAX_CPU_PERCENT: int = 50
    SANDBOX_MAX_OUTPUT_BYTES: int = 1000000
    SANDBOX_NETWORK_ENABLED: bool = False

    # ==================== WORKFLOW: RATE LIMITING ====================
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_BACKEND: str = "redis"
    RATE_LIMIT_FAIL_OPEN: bool = True
    RATE_LIMIT_TIER_ANONYMOUS: int = 30
    RATE_LIMIT_TIER_FREE: int = 60
    RATE_LIMIT_TIER_PRO: int = 300
    RATE_LIMIT_TIER_ENTERPRISE: int = 1000
    RATE_LIMIT_EXECUTE_PER_MINUTE: int = 30
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10
    RATE_LIMIT_BYPASS_IPS: List[str] = []
    RATE_LIMIT_BYPASS_HEADER: str = ""
    RATE_LIMIT_BYPASS_SECRET: str = ""

    # ==================== WORKFLOW: LOGGING ====================
    LOG_FORMAT: str = "json"
    LOG_FILE_PATH: Optional[str] = None

    # ==================== WORKFLOW: EXTERNAL SERVICES ====================
    BROWSERLESS_API_URL: str = "https://production-sfo.browserless.io"
    SENTRY_DSN: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_ignore_empty=True,
        env_file_encoding='utf-8',
        case_sensitive=False,
        override=True
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        data_dir = Path(
            init_settings.init_kwargs.get("data_dir")
            or os.environ.get("DATA_DIR")
            or "/data"
        )
        json_source = JsonConfigSource(settings_cls, data_dir / "config.json")
        return (init_settings, env_settings, dotenv_settings, json_source)

    @property
    def enabled_features(self) -> set[str]:
        return {f.strip() for f in self.features.split(",") if f.strip()}

    def feature_enabled(self, name: str) -> bool:
        return name in self.enabled_features

    @model_validator(mode="after")
    def _resolve(self):
        # DB url falls back to the bundled DSN (lite mode) when nothing explicit.
        if not self.DATABASE_URL and self.database_url_default:
            self.DATABASE_URL = self.database_url_default

        # Fallback REDIS_URL to CELERY_BROKER_URL if empty to prevent local dev hard-crashing.
        if not self.REDIS_URL and self.CELERY_BROKER_URL:
            self.REDIS_URL = self.CELERY_BROKER_URL

        # Full mode requires Redis: fail loud rather than silently degrade.
        if not self.lite_mode and not self.REDIS_URL:
            raise ValueError(
                "REDIS_URL is required when LITE_MODE is false. "
                "Set REDIS_URL, or run with LITE_MODE=true."
            )
        # Lite mode ignores redis_url even if present (explicit contract).
        return self

    @staticmethod
    def get_value(key: str) -> str:
        """Fetches the value of an environment variable by key."""
        return os.getenv(key)


@lru_cache
def get_settings(env_file: str | None = ".env") -> Settings:
    return Settings(data_dir=os.environ.get("DATA_DIR", "/data"), _env_file=env_file)


# Dynamic module-level attribute lookup to proxy system_setting to get_settings()
def __getattr__(name: str) -> Any:
    if name == "system_setting":
        return get_settings()
    raise AttributeError(f"module {__name__} has no attribute {name}")

