from datetime import datetime, timezone
from typing import List, Optional, Any, Dict
import asyncio
import uuid
from loguru import logger
from src.storages.file_storage import FileStorageService
from src.schemas.agents import AgentDefaultModel, AgentUpdateModel
from src.core.database.postgres import PostgresManager
from src.services.nosql.postgres_services import PostgresServices
from sqlalchemy import select, update, delete

def _deep_merge(base: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge `updates` into `base`, preserving keys within nested
    dicts that `updates` doesn't mention instead of replacing them wholesale."""
    merged = dict(base)
    for key, value in updates.items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge(existing, value)
        else:
            merged[key] = value
    return merged


class AgentManager:
    def __init__(self, postgres_manager: PostgresManager, file_storage: FileStorageService):
        self.postgres_manager = postgres_manager
        self.file_storage = file_storage
        logger.info("AgentManager initialized with PostgreSQL.")

    async def create_agent(self, user_id: str, agent_data: AgentDefaultModel) -> Dict[str, Any]:
        try:
            user_uuid = uuid.UUID(user_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid user_id provided to create_agent: {user_id}")
            raise ValueError("Invalid user ID format. UUID expected.")

        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            
            agent_name = agent_data.name or "Unnamed Agent"
            agent_instructions = agent_data.instructions or "You are a helpful assistant."

            agent_dict = {
                "id": uuid.uuid4(),
                "user_id": user_uuid,
                "name": agent_name,
                "instructions": agent_instructions,
                "config": agent_data.model_dump(exclude={"name", "instructions", "created_at", "updated_at"}),
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            
            sql_agent = await pg_services.create_agent(agent_dict)
            return {
                "id": str(sql_agent.id),
                "name": sql_agent.name,
                "instructions": sql_agent.instructions,
                **sql_agent.config
            }

    async def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        try:
            agent_uuid = uuid.UUID(agent_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid agent_id provided to get_agent: {agent_id}")
            return None

        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            sql_agent = await pg_services.get_agent_by_id(agent_uuid)
            if sql_agent and not sql_agent.is_deleted:
                # Unpack config first, then explicitly set fields to override any stale data in config
                agent_dict = {
                    **sql_agent.config,
                    "id": str(sql_agent.id),
                    "user_id": str(sql_agent.user_id),
                    "name": sql_agent.name,
                    "instructions": sql_agent.instructions,
                }
                # Remove redundant fields from the config that are now top-level
                agent_dict.pop("agent_id", None)

                # Query all uploaded files and urls dynamically from DocumentChunk to populate knowledge_base
                from src.models.sql.models import DocumentChunk
                from sqlalchemy import text
                
                try:
                    stmt = select(DocumentChunk.extra_metadata).where(
                        text("(extra_metadata->>'agent_id' = :agent_id) OR (extra_metadata->>'collection' = :collection_name)").bindparams(
                            agent_id=agent_id,
                            collection_name=f"agent_{agent_id}"
                        )
                    )
                    chunks_result = await session.execute(stmt)
                    
                    uploaded_files = set()
                    urls = set()
                    for meta in chunks_result.scalars():
                        if not meta:
                            continue
                        if meta.get("file_name"):
                            uploaded_files.add(meta["file_name"])
                        elif meta.get("file_id"):
                            val = meta["file_id"]
                            if val.startswith("http"):
                                urls.add(val)
                            else:
                                uploaded_files.add(val.split("/")[-1])
                                
                        if meta.get("url"):
                            urls.add(meta["url"])
                        elif meta.get("source"):
                            source = meta["source"]
                            if isinstance(source, str) and source.startswith("http"):
                                urls.add(source)
                    
                    # Merge existing knowledge_base config if any
                    kb_config = agent_dict.get("knowledge_base") or {}
                    if isinstance(kb_config, list):
                        kb_config = {"uploaded_files": kb_config}
                    elif not isinstance(kb_config, dict):
                        kb_config = {}
                    
                    existing_uploaded = set(kb_config.get("uploaded_files") or [])
                    existing_urls = set(kb_config.get("urls") or [])
                    
                    all_uploaded_files = list(existing_uploaded | uploaded_files)
                    all_urls = list(existing_urls | urls)
                    
                    agent_dict["knowledge_base"] = {
                        "uploaded_files": all_uploaded_files,
                        "urls": all_urls
                    }
                except Exception as ex:
                    logger.error(f"Failed to fetch dynamically associated files for agent {agent_id}: {ex}")

                return agent_dict
        return None

    async def list_agents(self, user_id: str) -> List[Dict[str, Any]]:
        try:
            user_uuid = uuid.UUID(user_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid user_id provided to list_agents: {user_id}")
            return []

        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            sql_agents = await pg_services.get_all_agents_by_user_id(user_uuid)
            
            # List of fields to filter out from agent.config
            fields_to_exclude = {"user_id", "agent_id", "id"}
            
            return [
                {
                    "id": str(agent.id),
                    "user_id": str(agent.user_id),
                    "name": agent.name,
                    "instructions": agent.instructions,
                    **{k: v for k, v in agent.config.items() if k not in fields_to_exclude}
                } for agent in sql_agents
            ]

    async def update_agent(self, agent_id: str, update_data: AgentUpdateModel | dict) -> bool:
        try:
            agent_uuid = uuid.UUID(agent_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid agent_id provided to update_agent: {agent_id}")
            return False

        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            if hasattr(update_data, "model_dump"):
                data = update_data.model_dump(exclude_unset=True)
            else:
                data = dict(update_data or {})

            if not data:
                return False
            
            # Split standard fields from config
            std_fields = {"name", "instructions"}
            update_dict = {k: v for k, v in data.items() if k in std_fields}
            config_updates = {k: v for k, v in data.items() if k not in std_fields}
            
            if config_updates:
                sql_agent = await pg_services.get_agent_by_id(agent_uuid)
                if sql_agent:
                    new_config = _deep_merge(sql_agent.config, config_updates)
                    update_dict["config"] = new_config

            update_dict["updated_at"] = datetime.now(timezone.utc)
            return await pg_services.update_agent(agent_uuid, update_dict)

    async def delete_agent(self, agent_id: str) -> bool:
        try:
            agent_uuid = uuid.UUID(agent_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid agent_id provided to delete_agent: {agent_id}")
            return False

        async with self.postgres_manager.get_session() as session:
            pg_services = PostgresServices(session)
            return await pg_services.delete_agent(agent_uuid)
