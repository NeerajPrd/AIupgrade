MODEL_CARD_FILE_PATH = "src/tmp/agents_model_card.yml"

RFM_SUPPORT_BOT_COLLECTION_NAME = "rfm_bot_collection"
UPGRADE_SUPPORT_BOT_COLLECTION_NAME = "support_bot_collection"
CAREER_GATEWAY_SUPPORT_BOT_COLLECTION_NAME = "career_gateway_bot_collection"

# File content type
IMAGE_FILE = "image/png"
IMAGE_FILE_WEBP = "image/webp"
AUDIO_FILE = "audio/mpeg"

DEFAULT_AGENT_SYSTEM_PROMPT = "You are an helpful agent"

MAX_FILE_SIZE = 5 * 1024 * 1024


ALLOWED_URL_PATH_WITHOUT_AUTHORIZATION = [
    "/openapi.json",
    "/docs",
    "/favicon.ico",
    "/api/v1/auth/login",
    "/api/v1/workflow-api/",  # Public workflow API (uses X-API-Key auth)
    "/api/v1/auth/register",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/refresh-token",
    "/api/v1/users/login",
    "/api/v1/users/signup",
    "/api/v1/users/forgot-password",
    "/api/v1/users/refresh-token",
    "/api/v1/users/verify-email/",
    "/api/v1/users/reset-password/",
    "/api/v1/google-auth/google/login",
    "/api/v1/google-auth/google/callback",
    "/ws",
    "/api/v1/ws",
    "/api/v1/whatsapp-session/webhook",
]
