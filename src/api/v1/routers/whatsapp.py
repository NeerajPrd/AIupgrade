import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from loguru import logger

# Import the schemas and services we built earlier
from src.schemas.whatsapp import StartWhatsAppSessionRequest, WhatsAppSessionStatusResponse, EvolutionWebhookPayload
from src.services.deployment.evolution_api import EvolutionAPIService, ws_manager
from src.models.sql.models import WhatsAppSession
from src.services.nosql.postgres_services import PostgresServices

whatsapp_router = APIRouter(tags=["WhatsApp Deployment"])
evolution_service = EvolutionAPIService()

def _ensure_base64_prefix(qr_str: str) -> str:
    if not qr_str:
        return qr_str
    if not qr_str.startswith("data:image"):
        return f"data:image/png;base64,{qr_str}"
    return qr_str

# ==========================================
# REST ENDPOINTS FOR THE FRONTEND
# ==========================================

@whatsapp_router.post("/start", response_model=WhatsAppSessionStatusResponse)
async def start_session(
    request_data: StartWhatsAppSessionRequest,
    request: Request,
):
    """Starts a new WhatsApp Web session and triggers QR generation."""
    try:
        agent_id = request_data.agent_id
        
        # Ensure agent exists and is valid
        async with request.app.state.postgres_manager.get_session() as db_session:
            pg_services = PostgresServices(db_session)
            agent = await pg_services.get_agent_by_id(uuid.UUID(agent_id))
            if not agent:
                raise HTTPException(status_code=404, detail="Agent not found.")
            # Only the agent's owner (or an admin) may link a WhatsApp number to it.
            caller = getattr(request.state, "user", None)
            is_admin = getattr(caller, "role", "user") in {"admin", "superadmin"}
            if not is_admin and str(agent.user_id) != str(getattr(request.state, "user_id", None)):
                raise HTTPException(status_code=403, detail="Not your agent.")
                
            try:
                session_query = select(WhatsAppSession).where(WhatsAppSession.agent_id == uuid.UUID(agent_id))
                result = await db_session.execute(session_query)
                existing_session = result.scalars().first()
                
                # Use the agent's owner as the user_id for the session to prevent foreign key errors
                agent_owner_id = agent.user_id
                
                if existing_session:
                    existing_session.state = "initializing"
                    existing_session.user_id = agent_owner_id
                    existing_session.session_id = f"{agent_id}"
                else:
                    new_session = WhatsAppSession(
                        agent_id=uuid.UUID(agent_id),
                        user_id=agent_owner_id,
                        session_id=f"{agent_id}",
                        state="initializing"
                    )
                    db_session.add(new_session)
                    
                await db_session.commit()
            except Exception as e:
                logger.error(f"Failed to save WhatsAppSession: {e}")
                await db_session.rollback()
                raise HTTPException(status_code=500, detail="Database error when creating session.")
        
        # 1. Tell the Docker container to create the instance and start once
        connect_response = await evolution_service.create_instance(agent_id)
        logger.info(f"Connect Response from Evolution: {connect_response}")
        
        # Check if Evolution returned the QR code immediately in the response
        if connect_response and "base64" in connect_response:
            qr_base64 = connect_response["base64"]
            qr_base64 = _ensure_base64_prefix(qr_base64)
            await ws_manager.send_event(agent_id, "qr", {"qr_base64": qr_base64})
            logger.info(f"Pushed synchronous QR code to WebSocket for {agent_id}!")
        
        # We will rely entirely on the Webhook to catch the QR code when it finishes!
        return WhatsAppSessionStatusResponse(
            state="qr_ready",
            session_id=f"{agent_id}"
        )
    except Exception as e:
        logger.error(f"START SESSION FATAL CRASH: {e}", exc_info=True)
        raise e

@whatsapp_router.delete("/{agent_id}")
async def stop_session(agent_id: str, request: Request):
    """Destroys the session and logs the agent out of WhatsApp."""
    success = await evolution_service.delete_instance(agent_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to destroy session")
    
    async with request.app.state.postgres_manager.get_session() as db_session:
        try:
            stmt = update(WhatsAppSession).where(WhatsAppSession.agent_id == uuid.UUID(agent_id)).values(state="disconnected")
            await db_session.execute(stmt)
            await db_session.commit()
        except Exception as e:
            logger.error(f"Failed to update WhatsAppSession state on delete: {e}")
            await db_session.rollback()
    
    return {"status": "success", "message": "WhatsApp connection terminated."}

# ==========================================
# WEBSOCKET FOR LIVE QR STREAMING
# ==========================================

@whatsapp_router.websocket("/ws/{agent_id}")
async def websocket_session_relay(websocket: WebSocket, agent_id: str):
    """Frontend connects here to see the QR code pop up instantly."""
    await ws_manager.connect(websocket, agent_id)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(agent_id)

# ==========================================
# WEBHOOK RECEIVER (THE "GOD" ENDPOINT)
# ==========================================

async def process_whatsapp_message(agent_id: str, remote_jid: str, text: str, app_state: Any, sender: str = None):
    try:
        from src.services.channel_adapter.webhook_gateway import WebhookGatewayService
        from src.services.agents.chat_orchestrator import ChatOrchestrator
        
        chat_service = app_state.agent_chat_service
        agent_manager = app_state.agent_manager
        vector_store = app_state.vector_store
        
        # We need to map remote_jid to a history_id.
        webhook_gateway = WebhookGatewayService(agent_manager, chat_service, queue=app_state.queue)
        history_id = await webhook_gateway._get_or_create_history_id("whatsapp", agent_id, remote_jid)
        
        agent = await agent_manager.get_agent(agent_id)
        if not agent:
            logger.error(f"Agent {agent_id} not found.")
            return
            
        owner_user_id = str(agent.user_id) if hasattr(agent, "user_id") else str(agent.get("user_id"))

        # Now run ChatOrchestrator
        orchestrator = ChatOrchestrator(agent_manager, vector_store, chat_service)
        
        response_text = ""
        # stream_chat yields string chunks.
        async for chunk in orchestrator.stream_chat(
            user_id=owner_user_id,
            agent_id=agent_id,
            history_id=history_id,
            message=text
        ):
            response_text += chunk
            
        if response_text:
            # We MUST reply to the remote_jid (the person who sent the message).
            target_number = remote_jid
            await evolution_service.send_message(agent_id, target_number, response_text)
            
    except Exception as e:
        logger.error(f"Error processing WhatsApp message: {e}")

@whatsapp_router.post("/webhook/{instance_name}")
@whatsapp_router.post("/webhook/{instance_name}/{event_path}")
async def evolution_webhook(
    request: Request,
    instance_name: str, 
    payload: dict,  
    background_tasks: BackgroundTasks,
    event_path: str = None  # Add this so FastAPI doesn't crash if it's missing
):
    """Evolution API Docker container sends ALL updates to this exact URL."""
    
    # 1. Clean the ID safely
    agent_id = instance_name[6:] if instance_name.startswith("agent-") else instance_name
    
    event_type = payload.get("event")
    data = payload.get("data", {})
    
    logger.info(f"Evolution Webhook Triggered: {event_type} for Agent {agent_id} | Payload: {payload}")

    def extract_qr(data_dict, payload_dict):
        qr_val = data_dict.get("qrcode") or payload_dict.get("qrcode")
        if isinstance(qr_val, dict):
            return qr_val.get("base64") or qr_val.get("qrcode")
        if isinstance(qr_val, str):
            return qr_val
        return data_dict.get("base64") or payload_dict.get("base64")

    # 1. Handle explicit live QR Code Updates
    if event_type in ["qrcode.updated", "QRCODE_UPDATED", "qrcode", "qr"]:
        qr_base64 = extract_qr(data, payload)
        if qr_base64:
            qr_base64 = _ensure_base64_prefix(qr_base64)
            await ws_manager.send_event(agent_id, "qr", {"qr_base64": qr_base64})
            logger.info(f"Successfully pushed rotated QR code to WebSocket for {agent_id}!")

    # 2. Handle Connection Status (And catch embedded QR codes!)
    elif event_type in ["connection.update", "CONNECTION_UPDATE"]:
        state = data.get("state")
        
        # Catch the QR code if it is riding inside the connection update payload
        embedded_qr = extract_qr(data, payload)
        
        if embedded_qr and state in ["connecting", "qr", "qrcode", None]:
            embedded_qr = _ensure_base64_prefix(embedded_qr)
            await ws_manager.send_event(agent_id, "qr", {"qr_base64": embedded_qr})
            logger.info(f"Extracted embedded QR code from connection update for {agent_id}!")
        
        state_map = {"connecting": "connecting", "open": "connected", "close": "disconnected"}
        mapped_state = state_map.get(state, "disconnected")

        # update DB
        async with request.app.state.postgres_manager.get_session() as db_session:
            try:
                update_values = {"state": mapped_state}
                if mapped_state == "connected":
                    sender = payload.get("sender")
                    if sender and "@" in sender:
                        update_values["phone_number"] = sender.split("@")[0]

                stmt = update(WhatsAppSession).where(WhatsAppSession.agent_id == uuid.UUID(agent_id)).values(**update_values)
                await db_session.execute(stmt)
                await db_session.commit()
            except Exception as e:
                logger.error(f"Failed to update WhatsAppSession state: {e}")
                await db_session.rollback()

        await ws_manager.send_event(agent_id, "status", {"state": mapped_state})

    # 3. Handle Messages
    elif event_type in ["messages.upsert", "MESSAGES_UPSERT"]:
        messages = data.get("messages", [])
        if not messages:
            messages = payload.get("data", {}).get("messages", [])

        if not messages and isinstance(data, dict) and "message" in data and "key" in data:
            messages = [data]

        for msg in messages:
            key = msg.get("key", {})
            if key.get("fromMe"):
                continue # Ignore our own messages
                
            remote_jid = key.get("remoteJid")
            if not remote_jid or "@g.us" in remote_jid:
                continue # Ignore groups for now, or handle as needed
                
            msg_content = msg.get("message", {})
            
            # Extract text
            text = msg_content.get("conversation") or msg_content.get("extendedTextMessage", {}).get("text")
            if not text:
                continue
                
            sender = payload.get("sender")
                
            # Process the message using the agent!
            background_tasks.add_task(
                process_whatsapp_message, 
                agent_id=agent_id, 
                remote_jid=remote_jid, 
                text=text, 
                app_state=request.app.state,
                sender=sender
            )

    return {"status": "received"}