from typing import AsyncGenerator, List, Dict, Any
from src.services.tool_handlers.base import BaseToolHandler
from src.services.agents.llm_tasks import generate_general_response_with_retry
from src.schemas.llm import BaseLLMConfig
from src.utils.misc import get_model_id_and_service
from src.schemas.upgrade_chat import ChatEventType as EventType

class GeneralChatHandler(BaseToolHandler):
    """Handles standard conversational responses using the LLM's general knowledge."""
    async def execute(self, conversation_history: List[Dict[str, Any]]) -> AsyncGenerator[str, None]:
        # Attempt to get the model the user requested
        model, provider = get_model_id_and_service(
            path="src/tmp/model_card.yml", model_name=self.context.request.selected_model
        )
        
        # 1st Priority Fallback: If missing or not found, check if the user has a custom LLM provider in Postgres
        if not model:
            try:
                import uuid
                from src.services.nosql.postgres_services import PostgresServices
                async with self.context.postgres_manager.get_session() as session:
                    services = PostgresServices(session)
                    configs = await services.get_llm_model_configs_by_user_id(uuid.UUID(str(self.context.user_id)))
                    
                    # Filter for configs that have an api_key and are not deleted
                    valid_configs = [c for c in configs if c.api_key]
                    if valid_configs:
                        # Grab the first custom configured provider
                        chosen_config = valid_configs[0]
                        provider = chosen_config.provider.lower()
                        model = chosen_config.model_id
                        
                        # Handle generic model IDs (like "gemini" or "openai") to map to proper working model IDs
                        if provider == "gemini" and model in ("gemini", None, ""):
                            model = "gemini-2.5-flash"
                        elif provider == "openai" and model in ("openai", None, ""):
                            model = "gpt-4o-mini"
                        elif provider == "groq" and model in ("groq", None, ""):
                            model = "llama-3.3-70b-versatile"
                            
                        self.response_manager.add_log(f"Falling back to user's custom configured provider: {provider} ({model})")
            except Exception as e:
                from loguru import logger
                logger.error(f"Failed to check for user custom fallback config: {e}")

        # 2nd Priority Fallback: Fallback to the default system setting
        if not model:
            from src.core.settings import system_setting
            model = system_setting.FAST_MODEL_ID
            provider = system_setting.FAST_MODEL_PROVIDER
            self.response_manager.add_log(f"Requested model not found. Falling back to default: {model}")

        messages = await self.chat_service.prepare_messages_with_system_prompt(
            conversation_history, self.context.user_preferences
        )

        # Resolve user's API key for standard chat
        from src.services.api_key_resolver import resolve_api_key
        import uuid
        from loguru import logger
        api_key = None
        try:
            resolved_api_key = await resolve_api_key(
                user_id=uuid.UUID(str(self.context.user_id)),
                provider=provider,
                feature="chat"
            )
            if resolved_api_key:
                api_key = resolved_api_key
        except Exception as e:
            logger.error(f"Failed to resolve custom API key for chat: {e}")

        llm_config = BaseLLMConfig(
            model=model,
            provider=provider,
            api_key=api_key
        )

        async for chunk in generate_general_response_with_retry(messages=messages, llm_config=llm_config):
            if chunk:
                self.response_manager.append_message_chunk(chunk)
                async for event_chunk in self.response_manager.send_event(EventType.LLM_RESPONSE, chunk):
                    yield event_chunk