import asyncio
import calendar
from fastapi import APIRouter, Depends, status, Request, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from src.schemas.agents_chat import (
    AgentChatResponseModel,
    AgentChatInputRequest,
    CreateAgentChatInputRequest,
    EventType,
    TitleGenerationInputRequest,
)
from src.agents.agent_manager import AgentManager
from src.schemas.agent_enums import ToolType
from src.schemas.llm import BaseLLMConfig
from src.schemas.common import SuccessResponse, FailureResponse, ConversationRoleEnum
from src.services.agents.chat import AgentChatService
from src.services.agents.export import build_conversations_docx
from src.services.nosql.postgres_services import PostgresServices
from src.core.database import get_db
from src.core.globals import get_postgres_services
from src.models.sql.models import Agent
from src.utils.common import send_event_data
from src.services.agents.llm_tasks import generate_general_chat_response
from src.core.settings import system_setting
from src.schemas.agents import ChatTitleRequest

chat_router = APIRouter()

class ConversationSummary(BaseModel):
    id: str
    agent_id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime

@chat_router.post("", operation_id="create_agent_chat_entrypoint")
async def create_chat(
    request: Request,
    input_request: CreateAgentChatInputRequest,
):
    try:
        chat_service = request.app.state.agent_chat_service
        conversation_id = await chat_service.create_conversation(
            user_id=input_request.user_id,
            agent_id=input_request.agent_id
        )
        
        response = SuccessResponse(
            status="success",
            message="Successfully created chat entry",
            data=AgentChatResponseModel(conversation_id=conversation_id).model_dump(),
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED, content=response.model_dump()
        )

    except Exception as e:
        logger.error("Unable to create chat entrypoint: {}", e)
        response = FailureResponse(
            status="fail", data=None, message="Unable to create chat entrypoint"
        )
        return JSONResponse(
            content=response.model_dump(),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@chat_router.get("/{agent_id}/conversations", operation_id="get_all_chat_history")
async def get_all_conversations_list(
        request: Request,
        agent_id: str
):
    try:
        chat_service = request.app.state.agent_chat_service
        user_id = request.state.user_id
        
        # 1. Fetch the base conversation rows (agent_chat_histories)
        chat_list = await chat_service.list_user_conversations(user_id=user_id, agent_id=agent_id)

        # 2. Filter and format the conversations
        filtered_chat_list = []
        for chat in chat_list:
            # Normalize chat to a dictionary so we can easily modify it
            chat_dict = chat if isinstance(chat, dict) else chat.__dict__
            chat_id = chat_dict.get("id")
            
            if not chat_id:
                continue

            # Fetch the actual messages for this conversation
            db_history = await chat_service.get_history(chat_id)
            
            # Extract roles and find the first two messages
            roles = []
            early_messages = []
            
            for msg in db_history:
                msg_dict = msg if isinstance(msg, dict) else msg.__dict__
                role = msg_dict.get("role")
                content = msg_dict.get("content", "").strip()
                
                if role:
                    roles.append(role)
                    # Grab up to the first two non-empty messages
                    if content and len(early_messages) < 2:
                        early_messages.append(content)
            
            # Only keep the chat if BOTH the user and assistant have spoken
            if "user" in roles and "assistant" in roles:
                
                # --- TITLE INJECTION LOGIC ---
                current_title = chat_dict.get("title")
                
                # If there is no title, OR if the title is still the default placeholder
                if not current_title or current_title in ["New Conversation", "Whatsapp Conversation"]:
                    
                    # Fallback: Combine the first two messages and truncate cleanly
                    if early_messages:
                        combined_text = " - ".join(early_messages)
                        # Remove newlines for a clean UI string
                        combined_text = combined_text.replace("\n", " ") 
                        chat_dict["title"] = combined_text[:35] + "..." if len(combined_text) > 35 else combined_text
                    else:
                        chat_dict["title"] = "AI Conversation"

                filtered_chat_list.append(chat_dict)

        response = SuccessResponse(
            status="success",
            data={"history": filtered_chat_list, "total": len(filtered_chat_list)},
            message="Successfully retrieved conversations",
        )
        return JSONResponse(
            content=response.model_dump(), status_code=status.HTTP_200_OK
        )
    except Exception as e:
        logger.error(f"Unable to get conversation history: {e}", exc_info=True)
        return JSONResponse(
            content=FailureResponse(status="fail", message="An error occurred").model_dump(),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        

@chat_router.get("/{agent_id}/export", operation_id="export_agent_conversations")
async def export_conversations(
    request: Request,
    agent_id: str,
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    """Download all of an agent's conversations for a given month as a .docx report."""
    try:
        if not (1 <= month <= 12):
            return JSONResponse(
                content=FailureResponse(status="fail", message="month must be between 1 and 12").model_dump(),
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user_id = request.state.user_id
        agent = await db.get(Agent, uuid.UUID(agent_id))
        if not agent:
            return JSONResponse(
                content=FailureResponse(status="fail", message="Agent not found").model_dump(),
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if str(agent.user_id) != str(user_id):
            return JSONResponse(
                content=FailureResponse(status="fail", message="Not your agent").model_dump(),
                status_code=status.HTTP_403_FORBIDDEN,
            )

        start = datetime(year, month, 1, tzinfo=timezone.utc)
        last_day = calendar.monthrange(year, month)[1]
        end = datetime(year, month, last_day, 23, 59, 59, 999999, tzinfo=timezone.utc)

        chat_service = request.app.state.agent_chat_service
        conversations = await chat_service.list_conversations_for_export(agent_id, start, end)

        period_label = f"{calendar.month_name[month]} {year}"
        buffer = build_conversations_docx(agent.name, period_label, conversations)

        filename = f"{agent.name.replace(' ', '_')}_{year}-{month:02d}_conversations.docx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error(f"Unable to export conversations for agent {agent_id}: {e}", exc_info=True)
        return JSONResponse(
            content=FailureResponse(status="fail", message="An error occurred").model_dump(),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@chat_router.get("/{conversation_id}", operation_id="get_chat_by_id")
async def get_chat(
    request: Request,
    conversation_id: str
):
    try:
        chat_service = request.app.state.agent_chat_service
        messages = await chat_service.get_history(conversation_id)
        
        response = SuccessResponse(
            status="success",
            data={"history": messages},
            message="Successfully retrieved conversation history",
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK, content=response.model_dump()
        )

    except Exception as e:
        logger.error("Failed to get conversation history: {}", e)
        return JSONResponse(
            content=FailureResponse(status="fail", message="An error occurred").model_dump(),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@chat_router.delete("/{conversation_id}", operation_id="delete_agent_conversation")
async def delete_conversation(
    request: Request,
    conversation_id: str
):
    try:
        chat_service = request.app.state.agent_chat_service
        await chat_service.delete_conversation(conversation_id)
        
        response = SuccessResponse(
            status="success",
            data={"message": "Successfully deleted agent conversation"},
            message="Successfully deleted agent conversation",
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK, content=response.model_dump()
        )

    except Exception as e:
        logger.error("Unable to delete conversation: {}", e)
        return JSONResponse(
            content=FailureResponse(status="fail", message="An error occurred").model_dump(),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@chat_router.post("/stream", operation_id="agent_chat_streaming_rag")
async def agent_chat_streaming(
        request: Request,
        input_request: AgentChatInputRequest,
):
    """
    Handles RAG chat streaming using ChatOrchestrator and PostgreSQL.
    """
    orchestrator = request.app.state.chat_orchestrator
    user_id = request.state.user_id
    
    # Optional LLM Config override will be resolved from the agent's saved model settings.
    llm_config = None

    async def event_generator():
        async for token in orchestrator.stream_chat(
            user_id=user_id,
            agent_id=input_request.agent_id,
            history_id=input_request.conversation_id,
            message=input_request.message,
            llm_config=llm_config,
            http_client=getattr(request.app.state, "httpx_client", None),
            crawl_service=getattr(request.app.state, "crawl_service", None),
            file_data=input_request.file_data,
            file_name=input_request.file_name
        ):
            # Wrap token in SSE event
            yield f"data: {token}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@chat_router.post("/title", operation_id="generate_chat_title")
async def generate_chat_title(
    request: Request,
    input_request: ChatTitleRequest
):
    try:
        # 1. Access your existing chat service (Fixed state property)
        chat_service = request.app.state.agent_chat_service
        
        # 2. Fetch the conversation history
        db_history = await chat_service.get_history(input_request.conversation_id)
        
        if not db_history:
            return {"data": {"data": "New Chat"}}

        # 3. Find the first TWO messages to give the LLM better context
        early_messages = [
            msg.get("content", "") for msg in db_history[:2] if msg.get("content")
        ]
        message_content = "\n---\n".join(early_messages) if early_messages else "Hello"

        # 4. Create a strict prompt forcing a short title
        messages = [
            {
                "role": "system", 
                "content": "You are a title generator. Summarize the following conversation snippet into a short, professional chat title (maximum 4 words). Output ONLY the title. Do not use quotes, punctuation, or filler words."
            },
            {
                "role": "user", 
                "content": message_content
            }
        ]

        # 5. Generate the title using your fast default model
        title = ""
        # Get the agent_id to resolve the specific API key for the agent
        db_chat = await chat_service.get_chat_history_metadata(input_request.conversation_id)
        agent_id = str(db_chat.agent_id) if db_chat and db_chat.agent_id else None

        async for token in generate_general_chat_response(
            messages=messages,
            model_name=system_setting.FAST_MODEL_ID,
            user_id=request.state.user_id,
            feature="agents",
            agent_id=agent_id
        ):
            title += token

        # Clean up any rogue quotes the LLM might have added
        clean_title = title.strip('".\'\n ')

        # 6. Save the title to the database
        await chat_service.update_chat_title(input_request.conversation_id, clean_title)

        # 7. Return the deeply nested dictionary to satisfy the frontend
        return {
            "data": {
                "data": clean_title
            }
        }

    except Exception as e:
        logger.error(f"Failed to generate chat title: {str(e)}")
        # Fallback so the frontend doesn't crash
        return {"data": {"data": "AI Conversation"}}