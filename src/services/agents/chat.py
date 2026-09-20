from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import uuid
from loguru import logger
from src.core.database.postgres import PostgresManager
from src.services.nosql.postgres_services import PostgresServices
from src.models.sql.models import AgentChatHistory, AgentChat
from sqlalchemy import select, delete

class AgentChatService:
    def __init__(self, postgres_manager: PostgresManager):
        self.postgres_manager = postgres_manager
        logger.info("AgentChatService initialized with PostgreSQL.")

    async def create_conversation(self, user_id: str, agent_id: str, title: Optional[str] = None) -> str:
        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            history_dict = {
                "id": uuid.uuid4(),
                "user_id": uuid.UUID(user_id),
                "agent_id": uuid.UUID(agent_id),
                "title": title or "New Conversation",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            history = await pg_services.create_agent_chat_history(history_dict)
            return str(history.id)

    async def add_message(self, history_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            message_dict = {
                "id": uuid.uuid4(),
                "history_id": uuid.UUID(history_id),
                "role": role,
                "content": content,
                "extra_metadata": metadata or {},
                "created_at": datetime.now(timezone.utc)
            }
            await pg_services.insert_agent_message(message_dict)

    async def get_history(self, history_id: str) -> List[Dict[str, Any]]:
        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            messages = await pg_services.get_agent_conversation_history(uuid.UUID(history_id))
            return [
                {
                    "role": msg.role,
                    "content": msg.content,
                    "metadata": msg.extra_metadata,
                    "created_at": msg.created_at.isoformat()
                } for msg in messages
            ]

    async def list_user_conversations(self, user_id: str, agent_id: Optional[str] = None) -> List[Dict[str, Any]]:
        async with self.postgres_manager.get_session() as session:
            from sqlalchemy import select
            stmt = select(AgentChatHistory).where(AgentChatHistory.user_id == uuid.UUID(user_id), AgentChatHistory.is_deleted == False)
            if agent_id:
                stmt = stmt.where(AgentChatHistory.agent_id == uuid.UUID(agent_id))
            
            stmt = stmt.order_by(AgentChatHistory.updated_at.desc())
            result = await session.execute(stmt)
            histories = result.scalars().all()
            return [
                {
                    "id": str(h.id),
                    "agent_id": str(h.agent_id),
                    "title": h.title,
                    "updated_at": h.updated_at.isoformat()
                } for h in histories
            ]

    async def delete_conversation(self, history_id: str) -> bool:
        async with self.postgres_manager.get_session() as session:
            stmt = select(AgentChatHistory).where(AgentChatHistory.id == uuid.UUID(history_id))
            res = await session.execute(stmt)
            history = res.scalar_one_or_none()
            if history:
                history.is_deleted = True
                history.updated_at = datetime.now(timezone.utc)
                await session.commit()
                return True
        return False

    async def list_conversations_for_export(self, agent_id: str, start: datetime, end: datetime) -> List[Dict[str, Any]]:
        """All conversations (with full message bodies) for an agent within [start, end)."""
        async with self.postgres_manager.get_session() as session:
            stmt = (
                select(AgentChatHistory)
                .where(
                    AgentChatHistory.agent_id == uuid.UUID(agent_id),
                    AgentChatHistory.is_deleted == False,
                    AgentChatHistory.created_at >= start,
                    AgentChatHistory.created_at < end,
                )
                .order_by(AgentChatHistory.created_at.asc())
            )
            histories = (await session.execute(stmt)).scalars().all()

            conversations = []
            for history in histories:
                msg_stmt = (
                    select(AgentChat)
                    .where(AgentChat.history_id == history.id)
                    .order_by(AgentChat.created_at.asc())
                )
                messages = (await session.execute(msg_stmt)).scalars().all()
                conversations.append({
                    "title": history.title,
                    "created_at": history.created_at.isoformat(),
                    "messages": [
                        {
                            "role": m.role,
                            "content": m.content,
                            "created_at": m.created_at.isoformat(),
                        } for m in messages
                    ],
                })
            return conversations

    async def get_chat_history_metadata(self, history_id: str) -> Optional[AgentChatHistory]:
        """Fetch the AgentChatHistory object for metadata access."""
        async with self.postgres_manager.get_session() as session:
            stmt = select(AgentChatHistory).where(AgentChatHistory.id == uuid.UUID(history_id))
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    # --- ADDED: TITLE UPDATE METHOD ---
    async def update_chat_title(self, history_id: str, title: str) -> bool:
        """
        Updates the title of a specific conversation in the database.
        """
        try:
            async with self.postgres_manager.get_session() as session:
                stmt = select(AgentChatHistory).where(AgentChatHistory.id == uuid.UUID(history_id))
                res = await session.execute(stmt)
                history = res.scalar_one_or_none()
                
                if history:
                    history.title = title
                    history.updated_at = datetime.now(timezone.utc)
                    await session.commit()
                    return True
                return False
        except Exception as e:
            logger.error(f"Failed to update chat title in database for history {history_id}: {e}")
            return False
        