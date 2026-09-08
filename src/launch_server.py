import sys
import asyncio

# --- CRITICAL WINDOWS PLAYWRIGHT PATCH ---
# This MUST run at line 1 before ANY other modules or services are imported!
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass
# ----------------------------------------

import types

# --- Monkey Patch for older gpt-researcher compatibility ---
try:
    import langchain_core.documents
    import langchain
    
    # Patch docstore only, as Langchain 0.2 handles the rest natively with deprecation aliases
    docstore = types.ModuleType("langchain.docstore")
    docstore_document = types.ModuleType("langchain.docstore.document")
    docstore_document.Document = langchain_core.documents.Document
    docstore.document = docstore_document
    langchain.docstore = docstore
    sys.modules["langchain.docstore"] = docstore
    sys.modules["langchain.docstore.document"] = docstore_document
except ImportError:
    pass
# -----------------------------------------------------------

import os
import asyncio
import httpx
from loguru import logger
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from typing import Optional
from src.api.custom_middleware import LoggingMiddleware, AuthMiddleware, PublicAgentApiCORSMiddleware
from src.api.logging_config import setup_logging
from src.api.setup_api import setup_and_combine_all_routers
from src.core.settings import get_settings, system_setting
from src.core.bootstrap import ensure_bootstrap
from src.core.runtime import build_runtime
from src.core.database.postgres import PostgresManager
from src.services.nosql.postgres_services import PostgresServices
from src.utils.upgrade_auth.app_error import AppError
from src.upgrade_authentication.exceptions import app_error_handler, validation_exception_handler, generic_exception_handler
from src.video_generation.websocket_manager import periodic_status_broadcaster

from src.storages.file_storage import FileStorageService
from src.storages.vectordb_storages.pgvector import PgVectorStorage
from src.agents.agent_manager import AgentManager
from src.services.agents.chat_orchestrator import ChatOrchestrator
from src.services.crawl4ai_service import Crawl4AIService
from src.services.agents.chat import AgentChatService
import logging

logging.getLogger("passlib").setLevel(logging.WARNING)
logging.getLogger("pdfminer").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.INFO)

setup_logging()

postgres_manager_instance_local: Optional[PostgresManager] = None

async def _auto_pull_ollama_model():
    from src.core.settings import system_setting
    import httpx
    
    ollama_url = os.environ.get("OLLAMA_BASE_URL") or system_setting.OLLAMA_BASE_URL
    provider = os.environ.get("FALLBACK_MODEL_PROVIDER") or getattr(system_setting, "FALLBACK_MODEL_PROVIDER", "ollama")
    model_name = os.environ.get("FALLBACK_MODEL_NAME") or getattr(system_setting, "FALLBACK_MODEL_NAME", "llama3.2:latest")
    
    if provider == "ollama" and ollama_url:
        # Strip trailing slash if present
        ollama_url = ollama_url.rstrip("/")
        logger.info(f"Ollama Auto-Pull: Checking local model status for '{model_name}' at {ollama_url}...")
        try:
            # Check if model already exists to avoid pulling again
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    r = await client.get(f"{ollama_url}/api/tags")
                    if r.status_code == 200:
                        local_models = [m.get("name") for m in r.json().get("models", [])]
                        if model_name in local_models or f"{model_name}:latest" in local_models:
                            logger.info(f"Ollama Auto-Pull: Model '{model_name}' is already present locally.")
                            return
                except Exception:
                    pass # Continue to pull if the tag API is missing or fails
                
                # Model is not present, pull it
                logger.info(f"Ollama Auto-Pull: Model '{model_name}' is missing locally. Initiating background pull from Ollama library...")
                # Use long timeout for pulling
                r = await client.post(
                    f"{ollama_url}/api/pull",
                    json={"name": model_name, "stream": False},
                    timeout=600.0
                )
                if r.status_code == 200:
                    logger.success(f"Ollama Auto-Pull: Model '{model_name}' successfully pulled and ready!")
                else:
                    logger.error(f"Ollama Auto-Pull: Failed to pull model '{model_name}'. Status code: {r.status_code}, Response: {r.text}")
        except Exception as e:
            logger.warning(f"Ollama Auto-Pull: Could not connect to Ollama at {ollama_url} to verify/pull model. Error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global postgres_manager_instance_local
    logger.info("Application starting (Strict PostgreSQL Mode)...")

    # Bootstrap settings and build runtime
    settings = ensure_bootstrap(get_settings())
    app.state.settings = settings

    # Hard invariant: lite mode is single-process only.
    if settings.lite_mode and settings.web_concurrency != 1:
        raise RuntimeError(
            "LITE_MODE requires WEB_CONCURRENCY=1. In-memory limiter/queue "
            "fragment across workers. Use full mode for concurrency."
        )

    rt = await build_runtime(settings)
    app.state.limiter = rt.limiter
    app.state.queue = rt.queue
    app.state.cache = rt.cache
    app.state.pubsub = rt.pubsub
    app.state.redis = rt.redis

    # Create 'outputs' directory and mount static files
    os.makedirs("outputs", exist_ok=True)
    app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

    app.state.httpx_client = httpx.AsyncClient(
        http2=True,
        follow_redirects=True,
        timeout=httpx.Timeout(10.0, connect=3.0),
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=50),
    )
    logger.info("Singleton httpx.AsyncClient initialized.")

    # Initialize PostgresManager
    if settings.DATABASE_URL:
        from src.core.database import set_manager
        postgres_manager_instance_local = PostgresManager(settings.DATABASE_URL)
        app.state.postgres_manager = postgres_manager_instance_local
        set_manager(postgres_manager_instance_local)
        logger.info("PostgresManager initialized and connected via lifespan.")
    else:
        logger.critical("DATABASE_URL is not set! PostgreSQL is required for this application.")
        raise RuntimeError("DATABASE_URL is missing.")

    # Starts the periodic status broadcaster
    asyncio.create_task(periodic_status_broadcaster())

    app.state.crawl_service = Crawl4AIService()
    logger.info("Singleton Crawl4AIService initialized.")

    app.state.file_storage = FileStorageService()
    logger.info("Singleton FileStorageService initialized.")

    app.state.vector_store = PgVectorStorage(
        postgres_manager=postgres_manager_instance_local,
        vector_dim=1536
    )
    logger.info("Singleton PgVectorStorage initialized.")

    app.state.agent_manager = AgentManager(
        postgres_manager_instance_local,
        app.state.file_storage
    )
    logger.info("Singleton AgentManager initialized.")

    app.state.agent_chat_service = AgentChatService(
        postgres_manager_instance_local
    )
    logger.info("Singleton AgentChatService initialized.")

    app.state.chat_orchestrator = ChatOrchestrator(
        agent_manager=app.state.agent_manager,
        vector_store=app.state.vector_store,
        chat_service=app.state.agent_chat_service
    )
    logger.info("Singleton ChatOrchestrator initialized.")

    # Automatically pull configured Ollama fallback model in the background
    asyncio.create_task(_auto_pull_ollama_model())

    yield

    logger.info("Application shutting down...")
    try:
        await rt.shutdown()
        logger.info("Runtime shut down successfully.")
    except Exception as e:
        logger.error("Error shutting down runtime: {}", e)

    if hasattr(app.state, "httpx_client"):
        await app.state.httpx_client.aclose()
        logger.info("Singleton httpx.AsyncClient connection closed.")

    if hasattr(app.state, "crawl_service"):
        await app.state.crawl_service.close()
        logger.info("Crawl4AIService instance closed.")

    if postgres_manager_instance_local:
        await postgres_manager_instance_local.close()
        logger.info("PostgresManager connection closed during shutdown.")


app = FastAPI(
    title=system_setting.PROJECT_NAME,
    lifespan=lifespan,
    redoc_url=None,
    docs_url=None,
    openapi_url=None,
    exception_handlers={
            AppError: app_error_handler,
            RequestValidationError: validation_exception_handler,
            Exception: generic_exception_handler,
    },
    openapi_tags=[
        {"name": "Google Authorization", "description": "Endpoints for Google OAuth2.0"},
        {"name": "Gmail", "description": "Endpoints for Gmail operations"},
        {"name": "Drive", "description": "Endpoints for Google Drive operations"},
        {"name": "Docs", "description": "Endpoints for Google Docs operations"},
        {"name": "AI Services", "description": "Endpoints for AI-powered features like summarization and reply generation"},
    ],
    security=[{"APIKeyHeader": []}],
    swagger_ui_parameters={"docExpansion": "none"},
    swagger_ui_init_oauth={
        "clientId": system_setting.GOOGLE_CLIENT_ID,
        "scopes": " ".join(system_setting.GOOGLE_AUTH_SCOPES),
    }
)


app.add_middleware(AuthMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        *system_setting.ALLOWED_CORS_ORIGIN,
    ],
    allow_origin_regex=r"https://.*\.ngrok-free\.dev|https://.*\.ngrok\.io|https://.*\.ngrok-free\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Registered after CORSMiddleware so it wraps outside it (last-added runs
# first) and can open up CORS just for the public agent-api chat endpoint,
# used by the embeddable widget from arbitrary third-party origins.
app.add_middleware(PublicAgentApiCORSMiddleware)

try:
    from fastapi import APIRouter
    combined = setup_and_combine_all_routers()
    logger.info(f"DEBUG: APIRouter class ID: {id(APIRouter)}")
    logger.info(f"DEBUG: combined router type: {type(combined)}")
    logger.info(f"DEBUG: combined router type ID: {id(type(combined))}")
    logger.info(f"DEBUG: isinstance(combined, APIRouter): {isinstance(combined, APIRouter)}")
    
    logger.info(f"DEBUG: combined router has {len(combined.routes)} sub-routes before include")
    for i, r in enumerate(combined.routes):
        path = getattr(r, "path", "NO_PATH")
        methods = getattr(r, "methods", "NO_METHODS")
        logger.info(f"DEBUG: Combined Route {i}: {type(r).__name__} | {path} | {methods}")
    
    prefix = system_setting.API_V1_STR
    logger.info(f"DEBUG: Including combined router with prefix: '{prefix}'")
    app.include_router(combined, prefix=prefix)
    
    logger.info(f"DEBUG: app has {len(app.routes)} total routes after include")
    for i, r in enumerate(app.routes):
        path = getattr(r, "path", "NO_PATH")
        logger.info(f"DEBUG: App Route {i}: {type(r).__name__} | {path}")
except Exception:
    logger.exception("DEBUG: setup_and_combine_all_routers or include_router raised")
    raise