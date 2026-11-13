import os
import uuid
import asyncio
from fastapi import APIRouter, status, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger
from alembic.config import Config
from alembic import command

from src.api.v1.routers.database.db_switch import require_admin
from src.core.database.postgres import PostgresManager
from src.core.settings import system_setting
from src.services.security import policy


async def require_setup_enabled():
    # 404, not 403: when the feature is off (the default) the endpoint should not look like it exists.
    if not policy.setup_endpoint_enabled():
        raise HTTPException(status_code=404, detail="Not Found")


# Repointing the database is as privileged as it gets: off unless ENABLE_SETUP_ENDPOINT=true,
# and then only for a logged-in admin.
router = APIRouter(dependencies=[Depends(require_setup_enabled), Depends(require_admin)])

class DatabaseSetupRequest(BaseModel):
    database_url: str = Field(
        ..., 
        description="PostgreSQL Connection URL. Supports Local and Cloud DBs (Neon, Supabase, pgcloud, etc.). Must start with postgresql+asyncpg://"
    )

def update_env_file(database_url: str):
    env_path = ".env"
    db_url_line = f"DATABASE_URL={database_url}"
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        
        updated = False
        new_lines = []
        for line in lines:
            if line.strip().startswith("DATABASE_URL="):
                new_lines.append(f"{db_url_line}\n")
                updated = True
            else:
                new_lines.append(line)
        
        if not updated:
            new_lines.append(f"\n{db_url_line}\n")
            
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        logger.info("Updated existing .env file with new DATABASE_URL.")
    else:
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(f"{db_url_line}\nDEFAULT_STORAGE_MANAGER=LOCAL\nDEFAULT_URL=http://localhost:8000\n")
        logger.info("Created new .env file with new DATABASE_URL.")

def run_alembic_upgrade(database_url: str):
    # Temporarily override settings so env.py reads the correct URL
    system_setting.DATABASE_URL = database_url
    
    # Run Alembic upgrade programmatically
    logger.info("Beginning programmatic database migrations...")
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations completed successfully.")

@router.post("", operation_id="setup_database")
async def setup_database(
    request: Request,
    payload: DatabaseSetupRequest
):
    """
    Dynamically configures the system database (Local or Cloud),
    runs all schema migrations automatically, seeds default data, and activates the new connection.
    """
    db_url = payload.database_url.strip()
    
    if not db_url.startswith("postgresql+asyncpg://"):
        # Automatically fix prefix for the user if they input a standard postgresql:// URL
        if db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
        else:
            raise HTTPException(
                status_code=400, 
                detail="Database URL must be a PostgreSQL connection string starting with postgresql+asyncpg://"
            )

    try:
        # 1. Update local .env file so the setting is persistent on next boot
        update_env_file(db_url)
        
        # 2. Run Alembic database migrations in a separate thread to prevent event loop blocks
        await asyncio.to_thread(run_alembic_upgrade, db_url)
        
        # 3. Initialize the new PostgresManager connection pool
        new_manager = PostgresManager(db_url)
        
        
        # 5. Hot-swap the connection manager in the running FastAPI application state
        request.app.state.postgres_manager = new_manager
        
        logger.success(f"Successfully hot-swapped database connection to: {db_url}")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "success",
                "message": (
                    "Database configured, migrated, and activated successfully. No account is created "
                    "automatically: run scripts/create_admin.py to add an admin to the new database."
                ),
            }
        )
    except Exception as e:
        logger.exception("Database configuration or migration failed: {}", e)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "fail",
                "message": f"Database setup failed: {str(e)}"
            }
        )
