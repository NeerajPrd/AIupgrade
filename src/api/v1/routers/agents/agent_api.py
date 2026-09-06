"""Agent-as-API: publish an agent's RAG chat as a callable REST endpoint."""

import re
import asyncio
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from loguru import logger

from src.core.database import get_db
from src.models.sql.models import Agent
from src.models.sql.agent_api import AgentAPI
from src.schemas.common import SuccessResponse, FailureResponse

router = APIRouter()


def _get_user_id(request: Request) -> str:
    return request.state.user_id


# ============================================================
# MANAGEMENT ENDPOINTS (require user auth)
# ============================================================

@router.post("/agent/{agent_id}/publish-api", operation_id="publish_agent_api")
async def publish_agent_api(
    agent_id: str,
    request: Request,
    slug: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Publish an agent as a callable chat API endpoint. Returns the API key (shown only once)."""
    user_id = _get_user_id(request)

    agent = await db.get(Agent, UUID(agent_id))
    if not agent:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=FailureResponse(status="fail", message="Agent not found").model_dump(),
        )
    if str(agent.user_id) != str(user_id):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content=FailureResponse(status="fail", message="Not your agent").model_dump(),
        )

    existing = await db.execute(select(AgentAPI).where(AgentAPI.agent_id == UUID(agent_id)))
    if existing.scalar_one_or_none():
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=FailureResponse(
                status="fail",
                message="Agent already has an API. Revoke first to regenerate.",
            ).model_dump(),
        )

    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "-", (agent.name or "agent").lower()).strip("-")
        slug = f"{slug}-{agent_id[:8]}"

    slug_exists = await db.execute(select(AgentAPI).where(AgentAPI.slug == slug))
    if slug_exists.scalar_one_or_none():
        slug = f"{slug}-{int(datetime.now().timestamp()) % 10000}"

    raw_key, key_hash, key_prefix = AgentAPI.generate_api_key()

    api_record = AgentAPI(
        agent_id=UUID(agent_id),
        user_id=UUID(str(user_id)),
        slug=slug,
        api_key_hash=key_hash,
        api_key_prefix=key_prefix,
        is_active=True,
    )
    db.add(api_record)
    await db.commit()
    await db.refresh(api_record)

    base_url = str(request.base_url).rstrip("/")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=SuccessResponse(
            status="success",
            message="Agent API published successfully",
            data={
                "api_id": str(api_record.id),
                "slug": slug,
                "api_key": raw_key,  # Only shown once!
                "endpoint": f"{base_url}/api/v1/agent-api/{slug}/chat",
                "rate_limit_per_minute": api_record.rate_limit_per_minute,
                "warning": "Save your API key now. It cannot be retrieved later.",
            },
        ).model_dump(),
    )


@router.get("/agent/{agent_id}/api-info", operation_id="get_agent_api_info")
async def get_agent_api_info(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get API info for an agent (without the full key)."""
    user_id = _get_user_id(request)

    result = await db.execute(
        select(AgentAPI).where(
            AgentAPI.agent_id == UUID(agent_id),
            AgentAPI.user_id == UUID(str(user_id)),
        )
    )
    api_record = result.scalar_one_or_none()
    if not api_record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=FailureResponse(status="fail", message="No API published for this agent").model_dump(),
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=SuccessResponse(
            status="success",
            message="Agent API info",
            data={
                "api_id": str(api_record.id),
                "slug": api_record.slug,
                "api_key_prefix": api_record.api_key_prefix,
                "is_active": api_record.is_active,
                "rate_limit_per_minute": api_record.rate_limit_per_minute,
                "timeout_seconds": api_record.timeout_seconds,
                "total_calls": api_record.total_calls,
                "last_called_at": api_record.last_called_at.isoformat() if api_record.last_called_at else None,
                "created_at": api_record.created_at.isoformat(),
            },
        ).model_dump(),
    )


@router.delete("/agent/{agent_id}/api", operation_id="revoke_agent_api")
async def revoke_agent_api(
    agent_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Revoke API access for an agent."""
    user_id = _get_user_id(request)

    result = await db.execute(
        select(AgentAPI).where(
            AgentAPI.agent_id == UUID(agent_id),
            AgentAPI.user_id == UUID(str(user_id)),
        )
    )
    api_record = result.scalar_one_or_none()
    if not api_record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=FailureResponse(status="fail", message="No API found for this agent").model_dump(),
        )

    await db.delete(api_record)
    await db.commit()

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=SuccessResponse(status="success", message="Agent API revoked", data={}).model_dump(),
    )


class UpdateAgentApiRequest(BaseModel):
    is_active: Optional[bool] = None
    rate_limit: Optional[int] = None
    timeout: Optional[int] = None


@router.patch("/agent/{agent_id}/api", operation_id="update_agent_api")
async def update_agent_api(
    agent_id: str,
    body: UpdateAgentApiRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update API settings (active status, rate limit, timeout)."""
    user_id = _get_user_id(request)

    result = await db.execute(
        select(AgentAPI).where(
            AgentAPI.agent_id == UUID(agent_id),
            AgentAPI.user_id == UUID(str(user_id)),
        )
    )
    api_record = result.scalar_one_or_none()
    if not api_record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=FailureResponse(status="fail", message="No API found").model_dump(),
        )

    if body.is_active is not None:
        api_record.is_active = body.is_active
    if body.rate_limit is not None:
        api_record.rate_limit_per_minute = max(1, min(body.rate_limit, 1000))
    if body.timeout is not None:
        api_record.timeout_seconds = max(10, min(body.timeout, 600))

    await db.commit()

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=SuccessResponse(status="success", message="API settings updated", data={}).model_dump(),
    )


# ============================================================
# PUBLIC CHAT ENDPOINT (API key auth, no user session)
# ============================================================

class AgentApiChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    file_data: Optional[str] = None
    file_name: Optional[str] = None


@router.post("/agent-api/{slug}/chat", operation_id="agent_chat_via_api")
async def chat_via_agent_api(
    slug: str,
    body: AgentApiChatRequest,
    request: Request,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
):
    """
    Chat with a published agent (grounded in its ingested documents via RAG).

    Auth: X-API-Key header
    Input: JSON body with 'message' (and optional 'conversation_id' to continue a thread)
    Output: Final agent response

    Example:
        curl -X POST https://your-domain/api/v1/agent-api/my-agent/chat \\
          -H "X-API-Key: agapi_xxxxx" \\
          -H "Content-Type: application/json" \\
          -d '{"message": "What does the document say about pricing?"}'
    """
    # 1. Find API record by slug
    result = await db.execute(select(AgentAPI).where(AgentAPI.slug == slug))
    api_record = result.scalar_one_or_none()

    if not api_record:
        raise HTTPException(status_code=404, detail="API endpoint not found")

    if not api_record.is_active:
        raise HTTPException(status_code=403, detail="This API endpoint is disabled")

    # 2. Validate API key
    key_hash = AgentAPI.hash_key(x_api_key)
    if key_hash != api_record.api_key_hash:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # 2b. Enforce this endpoint's own per-minute rate limit
    allowed = await request.app.state.limiter.allow(
        key=f"agent_api:{api_record.id}",
        limit=api_record.rate_limit_per_minute,
        window_s=60,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again in a moment.",
            headers={"Retry-After": "60"},
        )

    # 3. Load agent
    agent = await db.get(Agent, api_record.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 4. Get or create the conversation thread (owned by the agent's owner)
    chat_service = request.app.state.agent_chat_service
    conversation_id = body.conversation_id
    if not conversation_id:
        conversation_id = await chat_service.create_conversation(
            user_id=str(agent.user_id),
            agent_id=str(agent.id),
        )

    # 5. Run the chat synchronously (within timeout), accumulating streamed tokens
    orchestrator = request.app.state.chat_orchestrator
    start_time = datetime.now(timezone.utc)

    async def _collect() -> str:
        full_response = ""
        async for token in orchestrator.stream_chat(
            user_id=str(agent.user_id),
            agent_id=str(agent.id),
            history_id=conversation_id,
            message=body.message,
            http_client=getattr(request.app.state, "httpx_client", None),
            crawl_service=getattr(request.app.state, "crawl_service", None),
            file_data=body.file_data,
            file_name=body.file_name,
        ):
            full_response += token
        return full_response

    try:
        full_response = await asyncio.wait_for(_collect(), timeout=api_record.timeout_seconds)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Agent chat timed out")
    except Exception as e:
        logger.error(f"Agent API chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

    # 6. Update API usage stats
    api_record.total_calls += 1
    api_record.last_called_at = datetime.now(timezone.utc)
    await db.commit()

    duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

    return {
        "success": True,
        "conversation_id": conversation_id,
        "response": full_response,
        "usage": {"duration_ms": duration_ms},
    }
