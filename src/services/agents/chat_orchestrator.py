from typing import Any, AsyncGenerator, Dict, List, Optional
import uuid
import asyncio
from loguru import logger
import json

from src.agents.agent_manager import AgentManager
from src.services.agents.chat import AgentChatService
from src.storages.vectordb_storages.pgvector import PgVectorStorage
from src.services.llm import LLMService
from src.schemas.llm import BaseLLMConfig
from src.services.map_model_provider import get_model_provider
from src.storages.vectordb_storages.base import VectorDBQuery
from src.core.settings import system_setting
from src.services.agents.llm_tasks import generate_general_response

# Missing imports for tools
from src.services.query_analyzer import analyze_and_select_tools
from src.services.web_search_service import WebSearchService
from src.services.imagen import ImageGenerationService
from src.schemas.diffusion import BaseDiffusionConfig
from src.storages.file_storage import FileStorageService


class ChatOrchestrator:
    def __init__(
        self,
        agent_manager: AgentManager,
        vector_store: PgVectorStorage,
        chat_service: AgentChatService
    ):
        self.agent_manager = agent_manager
        self.vector_store = vector_store
        self.chat_service = chat_service

    async def _build_llm_service_for_agent(self, agent_id: str, agent: Any, user_id: str) -> tuple[LLMService, str]:
        """
        Safely builds an LLMService instance by resolving model settings
        nested deep inside an agent's 'config' field layer.
        """
        model = system_setting.SMART_MODEL_ID
        provider = None
        temperature = 0.1
        top_p = 0.1
        max_tokens = None
        api_key = None

        config_data = {}
        if isinstance(agent, dict):
            config_data = agent.get("config") or agent.get("model_settings") or agent
        else:
            config_data = getattr(agent, "config", None) or getattr(agent, "model_settings", None) or agent

        model_settings = {}
        if isinstance(config_data, dict):
            model_settings = config_data.get("model_settings") or config_data
        elif config_data is not None:
            model_settings = getattr(config_data, "model_settings", config_data)

        if model_settings and hasattr(model_settings, "model_dump"):
            model_settings = model_settings.model_dump()
        elif not isinstance(model_settings, dict):
            model_settings = {}

        model = model_settings.get("llm_model") or model_settings.get("model") or model
        provider = model_settings.get("provider")

        # If model is passed as a generic provider name but provider is empty, sync them
        if model and not provider and model.lower() in ("openai", "gemini", "groq", "fal_ai", "anthropic", "hugging_face"):
            provider = model.lower()

        # Guardrail: Handle generic model IDs to map to proper working model IDs
        if provider:
            provider_lower = provider.lower()
            if provider_lower == "gemini" and model in ("gemini", None, ""):
                model = "gemini-2.5-flash"
            elif provider_lower == "openai" and model in ("openai", None, ""):
                model = "gpt-4o-mini"
            elif provider_lower == "groq" and model in ("groq", None, ""):
                model = "llama-3.3-70b-versatile"

        temperature = model_settings.get("temperature", temperature)
        top_p = model_settings.get("top_p", top_p)
        max_tokens = model_settings.get("max_tokens", max_tokens)
        
        # Safeguard max_tokens to prevent INT32 overflow and invalid ranges
        if max_tokens is not None:
            try:
                max_tokens = int(max_tokens)
                if max_tokens > 32768:
                    max_tokens = 32768
                elif max_tokens < 1:
                    max_tokens = None
            except (ValueError, TypeError):
                max_tokens = None
                
        api_key = model_settings.get("api_key")

        if not provider and model:
            try:
                provider = get_model_provider(model)
            except ValueError:
                provider = system_setting.SMART_MODEL_PROVIDER

        # Resolve user's API key for agents
        from src.services.api_key_resolver import resolve_api_key
        try:
            resolved_api_key = await resolve_api_key(
                user_id=uuid.UUID(str(user_id)),
                provider=provider,
                feature="agents",
                specific_id=agent_id
            )
            if resolved_api_key:
                api_key = resolved_api_key
        except Exception as e:
            logger.error(f"Failed to resolve custom API key: {e}")

        logger.info(
            f"[Key Resolution] Agent: {agent_id}. "
            f"Model: {model} | Provider: {provider} | "
            f"Using Custom Database Key: {bool(api_key)}"
        )

        llm_config = BaseLLMConfig(
            model=model,
            provider=provider,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            api_key=api_key,
        )
        return LLMService(llm_config), model

    async def stream_chat(
        self,
        user_id: str,
        agent_id: str,
        history_id: str,
        message: str,
        llm_config: Optional[BaseLLMConfig] = None,
        http_client = None,
        crawl_service = None,
        file_data: Optional[str] = None,
        file_name: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        # 1. Get Agent
        agent = await self.agent_manager.get_agent(agent_id)
        if not agent:
            yield "Agent not found."
            return

        # 2. Build Text Generation Service
        llm_service, model_name = await self._build_llm_service_for_agent(agent_id, agent, user_id)
        collection_name = f"agent_{agent_id}"
        
        # 2.5 Process File Injection (Direct Injection)
        processed_message = message
        vision_messages_extension = None
        if file_data:
            # Simple heuristic: if it's base64 starting with data:image or just an image file
            is_image = False
            if file_data.startswith("data:image"):
                is_image = True
            elif file_name and any(file_name.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp", ".gif"]):
                is_image = True
                
            if is_image:
                # Store the image for the LLM to process visually later in the pipeline
                vision_messages_extension = {
                    "type": "image_url",
                    "image_url": {"url": file_data if file_data.startswith("data:") else f"data:image/jpeg;base64,{file_data}"}
                }
                processed_message = f"{message}\n[User attached an image: {file_name or 'image'}]"
            else:
                # Treat as text extraction
                import base64
                try:
                    # Strip data URI prefix if present
                    b64_content = file_data.split(",")[-1] if "," in file_data else file_data
                    decoded_bytes = base64.b64decode(b64_content)
                    
                    extracted_text = ""
                    # Use DocumentProcessor for PDFs
                    if file_name and file_name.lower().endswith('.pdf'):
                        from src.services.document_processor import DocumentProcessor
                        doc_processor = DocumentProcessor()
                        # Need to await this
                        processed_doc = await doc_processor.process_single_file(file_name, decoded_bytes)
                        if processed_doc.status == "success" and processed_doc.data:
                            extracted_text = "\n\n".join([page.content for page in processed_doc.data])
                        else:
                            logger.error(f"Failed to process PDF {file_name}: {processed_doc.error}")
                            extracted_text = "[Failed to extract PDF text]"
                    else:
                        # Fallback for plain text, csv, etc.
                        extracted_text = decoded_bytes.decode('utf-8', errors='ignore')
                        
                    processed_message = f"{message}\n\n--- Attached File ({file_name or 'document'}) ---\n{extracted_text}\n--- End of File ---"
                except Exception as e:
                    logger.error(f"Failed to decode uploaded file {file_name}: {e}")
                    processed_message = f"{message}\n[User attached a file, but it could not be read]"

        # 3. Analyze Query Intent
        db_history = await self.chat_service.get_history(history_id)
        temp_history = list(db_history) + [{"role": "user", "content": processed_message}]

        agent_tools = (agent.get("tools") if isinstance(agent, dict) else getattr(agent, "tools", None)) or []
        web_search_enabled = "web_search" in agent_tools or "webSearch" in agent_tools or "websearch" in agent_tools

        selected_tools = await analyze_and_select_tools(temp_history, web_search_enabled=web_search_enabled, user_id=user_id)
        selected_tool = selected_tools[0] if selected_tools else "rag"
        logger.info(f"Query Analyzer decided to route to: {selected_tool}")

        # 4. Save User Message
        await self.chat_service.add_message(history_id, "user", processed_message)
        db_history = await self.chat_service.get_history(history_id)

        base_instructions = agent.instructions if hasattr(agent, "instructions") else agent.get("instructions", "You are a helpful assistant.")
        full_response = ""

        # ==========================================
        # ROUTE 1: WEB SEARCH
        # ==========================================
        if selected_tool == "web_search" and http_client and crawl_service:
            web_search_service = WebSearchService(
                query=message,
                async_client=http_client,
                crawler_service=crawl_service,
                selected_model=model_name,
                history=db_history
            )
            try:
                async for event in web_search_service.search_and_respond():
                    if event["type"] == "llm_token":
                        token = event["data"]
                        full_response += token
                        yield token
                    elif event["type"] == "status":
                        # Optional: yield status updates to frontend
                        logger.debug(f"WebSearch status: {event['data']}")
            except Exception as stream_err:
                logger.error(f"WebSearch streaming failed: {stream_err}")
                yield f"Error during web search: {str(stream_err)}"
                return

        # ==========================================
        # ROUTE 2: IMAGE GENERATION
        # ==========================================
        elif selected_tool == "image_generation":
            image_provider = "gemini"
            image_api_key = None
            
            # Dynamically fetch the user's API key for image generation
            from src.services.api_key_resolver import resolve_api_key
            try:
                resolved_key = await resolve_api_key(
                    user_id=uuid.UUID(str(user_id)),
                    provider=image_provider,
                    feature="agents",
                    specific_id=agent_id
                )
                if resolved_key:
                    image_api_key = resolved_key
            except Exception as e:
                logger.error(f"Failed to resolve custom Image Generation API key: {e}")
                
            diffusion_config = BaseDiffusionConfig(provider=image_provider, api_key=image_api_key)
            
            # Pass the postgres_manager from the vector store
            image_service = ImageGenerationService(
                config=diffusion_config, 
                postgres_manager=self.vector_store.postgres_manager
            )

            try:
                # First yield a starting status
                logger.info("Triggering image generation service...")
                
                async for event in image_service.generate_and_upload_image(
                    user_id=str(user_id), 
                    original_prompt=message, 
                    generate_summary=True
                ):
                    event_type = event.get("type")
                    event_data = event.get("data")

                    if event_type == "status":
                        logger.debug(f"ImageGen status: {event_data}")
                        # Not yielding status to SSE as the frontend structure for agents isn't fully set up for it yet, 
                        # but we could yield it as a special token if needed.

                    elif event_type == "error":
                        full_response = event_data
                        yield full_response

                    elif event_type == "final_asset":
                        summary = event_data.get('summary', 'an image')
                        url = event_data.get('url', '')
                        # Send back a markdown formatted image and summary so the frontend renders it naturally
                        full_response = f"Here is the image I created for you: {summary}\n\n![Generated Image]({url})"
                        yield full_response
                        
            except Exception as stream_err:
                logger.error(f"Image generation failed: {stream_err}")
                yield f"I'm sorry, an error occurred during image generation: {str(stream_err)}"
                return

        # ==========================================
        # ROUTE 3: GENERAL CHAT (No RAG Guardrails)
        # ==========================================
        elif selected_tool == "general":
            messages = [{"role": "system", "content": base_instructions}]
            for msg in db_history:
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

            if vision_messages_extension:
                # The last message is the current user message, convert it to a list of blocks
                last_msg = messages[-1]["content"]
                messages[-1]["content"] = [
                    {"type": "text", "text": last_msg},
                    vision_messages_extension
                ]

            try:
                async for token in generate_general_response(messages=messages, llm_config=llm_service.config):
                    full_response += token
                    yield token
            except Exception as stream_err:
                logger.error(f"General streaming failed: {stream_err}")
                err_str = str(stream_err).lower()
                if "rate_limit" in err_str or "429" in err_str:
                    yield "I apologize, but our servers are currently experiencing extremely high volume. Please try again in a few minutes."
                else:
                    yield "I apologize, but I am experiencing some brief technical difficulties right now. Please try again in a moment."
                return

        # ==========================================
        # ROUTE 4: RAG (Default)
        # ==========================================
        else:
            context = ""
            try:
                from src.services.embeddings import get_embedding_service
                embedding_service = await get_embedding_service(user_id=user_id, agent_id=agent_id)
                query_vector = await embedding_service.get_embeddings(message)

                vector_query = VectorDBQuery(query_vector=query_vector, top_k=5)
                search_results = await self.vector_store.query(vector_query, collection_name)
                context = "\n".join([res.payload.get("content", "") for res in search_results])
            except Exception as e:
                logger.warning(f"Skipping knowledge retrieval layer: {e}")

            if context:
                guardrail_rules = (
                    "\n\n--- KNOWLEDGE BASE GUARDRAILS ---\n"
                    "1. For specific user queries, you MUST base your answers primarily on the 'Knowledge Base Context' provided below.\n"
                    "3. If the user asks a factual question that is NOT covered by your base instructions or the context below, DO NOT hallucinate or use outside knowledge. Reply with: 'I apologize, but I can only answer questions related to my specific expertise.'\n"
                    "-----------------------------------\n"
                    f"\nKnowledge Base Context:\n{context}"
                )
            else:
                guardrail_rules = (
                    "\n\n--- OPERATING RULES ---\n"
                    "1. If the user asks a specific factual question that goes beyond your base instructions, DO NOT guess or use general internet knowledge. You must reply with: 'I apologize, but I can only answer questions related to my specific expertise.'\n"
                    "-----------------------------------\n"
                )

            system_prompt = f"{base_instructions}{guardrail_rules}"
            messages = [{"role": "system", "content": system_prompt}]
            for msg in db_history:
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

            if vision_messages_extension:
                last_msg = messages[-1]["content"]
                messages[-1]["content"] = [
                    {"type": "text", "text": last_msg},
                    vision_messages_extension
                ]

            # Stream from LLM Task Layer for RAG
            try:
                async for token in generate_general_response(messages=messages, llm_config=llm_service.config):
                    full_response += token
                    yield token
            except Exception as stream_err:
                logger.error(f"Streaming failed: {stream_err}")
                err_str = str(stream_err).lower()
                if "rate_limit" in err_str or "429" in err_str:
                    yield "I apologize, but our servers are currently experiencing extremely high volume. Please try again in a few minutes."
                else:
                    yield "I apologize, but I am experiencing some brief technical difficulties right now. Please try again in a moment."
                return

        # Save AI Response for all routes
        await self.chat_service.add_message(history_id, "assistant", full_response)