from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.api.v1.routers.misc import files_router, setup_router
from src.api.v1.routers.workflow import (
    image_generation,
    llm,
    text_to_speech,
    web_loader,
    speech_to_text,
    workflows,
    executions,
    connections,
    hooks,
    nodes,
    schedules,
    streams,
    templates,
    usage,
    variables,
    workflow_templates,
    discovery,
    workflow_api,
)
from src.api.v1.routers import webhook_router
from src.api.v1.routers.agents import (
    agents_router,
    modelcard_router,
    agent_chat,
    agent_api,
)
from src.api.v1.routers.upgrade import chat, support_bot
from src.api.v1.routers.external import rfm_support_bot
from src.api.v1.routers.upgrade import upgrade_agents
from src.deep_research.server import server
from src.api.v1.routers.workspace import ai, google_auth, docs, drive, gmail, llm_models
from src.api.v1.routers.video_gen.video_gen_routes import router as video_gen_router
from src.api.v1.routers.authentication import auth_router, user_router
from src.api.v1.routers.whatsapp import whatsapp_router
from src.api.v1.routers.database import db_switch
from src.api.v1.routers.admin import agent_usage as admin_agent_usage


def setup_and_combine_all_routers() -> APIRouter:
    router = APIRouter()

    router.include_router(
        image_generation.router,
        prefix="/generate-image",
        tags=["Image Generation", "Workflow"],
    )

    router.include_router(
        llm.router,
        prefix="/chat",
        tags=["LLM", "Workflow"],
    )

    router.include_router(
        speech_to_text.router,
        prefix="/transcribe",
        tags=["Speech-To-Text", "Workflow"],
    )

    router.include_router(
        text_to_speech.router,
        prefix="/tts",
        tags=["Text-To-Speech", "Workflow"],
    )

    router.include_router(
        web_loader.router,
        prefix="/fetch",
        tags=["Web Loader", "Workflow"],
        default_response_class=JSONResponse,
    )

    router.include_router(
        agents_router.agents_router,
        prefix="/agent",
        tags=["Manage Agents", "Agents"],
    )

    router.include_router(
        agent_chat.chat_router,
        prefix="/agent/chat",
        tags=["Agent Conversation", "Manage Agent", "Agents"],
    )

    router.include_router(
        files_router.router,
        prefix="/file",
        tags=["File Upload", "Agents"],
    )

    router.include_router(
        setup_router.router,
        prefix="/setup",
        tags=["System Setup"],
    )

    router.include_router(
        webhook_router.router,
        prefix="/webhook",
        tags=["Channel Webhooks"],
    )

    router.include_router(
        modelcard_router.router,
        prefix="/models",
        tags=["Available LLM Models", "Upgrade"],
    )

    router.include_router(
        chat.router,
        prefix="/upgrade/chat",
        tags=["Chat", "Upgrade"],
    )

    router.include_router(
        support_bot.router,
        prefix="/service",
        tags=["Support Bot", "Upgrade"],
    )

    router.include_router(
        upgrade_agents.router,
        prefix="/enhance",
        tags=["Upgrade Prompt Enhance", "Upgrade"],
    )

    router.include_router(
        rfm_support_bot.router,
        prefix="/service",
        tags=["Support Bot", "RFM"],
    )

    router.include_router(
        server.router, 
        tags=["GPT Researcher, Upgrade"]
    )

    # Google Workspace
    router.include_router(
        google_auth.router,
        prefix="/google-auth",
        tags=["Google Authorization"]
    )
    router.include_router(gmail.router, prefix="/gmail", tags=["Gmail"])
    router.include_router(drive.router, prefix="/drive", tags=["Drive"])
    router.include_router(docs.router, prefix="/docs", tags=["Docs"])
    router.include_router(ai.router, prefix="/ai", tags=["AI Services"])

    router.include_router(
        llm_models.router,
        prefix="/llm-models",
        tags=["LLM Models", "Workspace"],
    )

    # Video Gen Routes
    router.include_router(
        video_gen_router,
        prefix="/video-generation",
        tags=["Video Generation"],
    )

    # Upgrade Auth Routes
    from src.api.v1.routers.authentication import preferences_router
    router.include_router(auth_router.router, prefix="/auth", tags=["Upgrade Authentication"])
    router.include_router(user_router.router, prefix="/users", tags=["User Management"])
    router.include_router(preferences_router.router, prefix="/userPreferences", tags=["User Preferences"])
    # WhatsApp Deployment Routes
    router.include_router(whatsapp_router, prefix="/whatsapp-session", tags=["WhatsApp Deployment"])
    # Database Switch Routes
    router.include_router(db_switch.router)
    
    # Vibe Coder Routes (Option B: UI Prototyper)
    from src.api.v1.routers.vibe_coder import execution_routes as vibe_execution_routes
    router.include_router(vibe_execution_routes.router)

    # -- Workflow Engine Routes --
    router.include_router(workflows.router, prefix="/workflows", tags=["Workflows"])
    router.include_router(executions.router, prefix="/executions", tags=["Executions"])
    router.include_router(connections.router, prefix="/connections", tags=["Connections"])
    router.include_router(hooks.router, prefix="/hooks", tags=["Hooks"])
    router.include_router(nodes.router, prefix="/nodes", tags=["Nodes"])
    router.include_router(schedules.router, prefix="/schedules", tags=["Schedules"])
    router.include_router(streams.router, prefix="/streams", tags=["Streams"])
    router.include_router(templates.router, prefix="/templates", tags=["Workflow Templates"])
    router.include_router(usage.router, prefix="/usage", tags=["Usage Tracking"])
    router.include_router(variables.router, prefix="/variables", tags=["Variables"])
    router.include_router(workflow_templates.router, prefix="/workflow-templates", tags=["Workflow Presets"])
    router.include_router(discovery.router, prefix="/discovery", tags=["Discovery"])
    router.include_router(workflow_api.router, tags=["Workflow API"])
    router.include_router(agent_api.router, tags=["Agent API"])
    # Admin-only conversation usage / chat caps (Nepalland pilot)
    router.include_router(admin_agent_usage.router)

    return router
