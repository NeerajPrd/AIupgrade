import os
import json
from loguru import logger
from dotenv import load_dotenv
from typing import Any, Optional, Literal

load_dotenv()

STORAGE_MANAGER = os.getenv("DEFAULT_STORAGE_MANAGER", "LOCAL")

class LocalFileStorageManager:
    def __init__(self, base_dir: str = "outputs"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)
        logger.info(f"LocalFileStorageManager initialized. Base directory: {self.base_dir}")

    def upload_binary_file(
        self,
        file_bytes: bytes,
        destination_path: str,
        file_prefix: Literal["workflow", "agents", "upgrade", "users"] = "agents",
        content_type: str = "application/octet-stream",
        bucket_name: Optional[str] = None,
    ) -> str:
        # Clean destination path to prevent directory traversal
        clean_path = destination_path.lstrip("/\\")
        prefixed_path = f"{file_prefix}/{clean_path}"
        full_path = os.path.join(self.base_dir, prefixed_path)
        
        # Ensure parent directory exists
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, "wb") as f:
            f.write(file_bytes)
        logger.info(f"File uploaded locally to {full_path}")
        
        # Return the relative path served by /outputs
        return prefixed_path.replace("\\", "/")

    def read_binary_file(
        self, file_path: str, bucket_name: Optional[str] = None
    ) -> bytes:
        full_path = os.path.join(self.base_dir, file_path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File not found: {full_path}")
        with open(full_path, "rb") as f:
            return f.read()

    def generate_signed_url(self, blob_name: str, expiration_in_hours: int = 24) -> Optional[str]:
        from src.core.settings import system_setting
        base_url = system_setting.get_value("DEFAULT_URL") or "http://localhost:8000"
        normalized_blob_name = blob_name.replace("\\", "/")
        return f"{base_url.rstrip('/')}/outputs/{normalized_blob_name}"

    def upload_json_data(
        self,
        data: Any,
        destination_path: str,
        file_prefix: Literal["workflow", "agents", "upgrade"],
    ) -> str:
        file_bytes = json.dumps(data, indent=2).encode("utf-8")
        return self.upload_binary_file(
            file_bytes=file_bytes,
            destination_path=destination_path,
            file_prefix=file_prefix,
            content_type="application/json"
        )


class FileStorageService:
    def __init__(self, file_storage_manager: str = STORAGE_MANAGER):
        self._storage_manager = file_storage_manager
        self._manager = None

    @property
    def manager(self):
        if self._manager is None:
            if self._storage_manager.upper() == "GOOGLE":
                try:
                    from src.cloud.google_storage import GCSFileStorageManager
                    self._manager = GCSFileStorageManager()
                    logger.info("Using Google Cloud Storage Manager.")
                except Exception as e:
                    logger.error(f"Failed to initialize GCSFileStorageManager ({e}). Falling back to LocalFileStorageManager.")
                    self._manager = LocalFileStorageManager()
            else:
                self._manager = LocalFileStorageManager()
                logger.info("Using Local File Storage Manager.")
        return self._manager

    def upload_file_to_agent_folder(
        self,
        file_bytes: bytes,
        destination_path: str,
        content_type: str,
        bucket_name: Optional[str] = None,
        file_prefix: Literal["workflow", "agents", "upgrade", "users"] = "agents",
    ):
        return self.upload_file(
            file_bytes=file_bytes,
            destination_path=destination_path,
            content_type=content_type,
            file_prefix=file_prefix,
            bucket_name=bucket_name,
        )

    def generate_signed_url(self, blob_name: str, expiration_in_hours: int = 24) -> Optional[str]:
        logger.info(f"Generating signed URL for blob: {blob_name}")
        return self.manager.generate_signed_url(
            blob_name=blob_name,
            expiration_in_hours=expiration_in_hours,
        )

    def upload_file_to_workflow_folder(
        self,
        file_bytes: bytes,
        destination_path: str,
        content_type: str,
        file_prefix: Literal["workflow", "agents", "upgrade"] = "workflow",
        bucket_name: Optional[str] = None,
    ):
        return self.upload_file(
            file_bytes=file_bytes,
            destination_path=destination_path,
            content_type=content_type,
            file_prefix=file_prefix,
            bucket_name=bucket_name,
        )

    def upload_file_to_upgrade_folder(
        self,
        file_bytes: bytes,
        destination_path: str,
        content_type: str,
        file_prefix: Literal["workflow", "agents", "upgrade"] = "upgrade",
        bucket_name: Optional[str] = None,
    ):
        return self.upload_file(
            file_bytes=file_bytes,
            destination_path=destination_path,
            content_type=content_type,
            file_prefix=file_prefix,
            bucket_name=bucket_name,
        )

    def upload_file(
        self,
        file_bytes: bytes,
        destination_path: str,
        content_type: str,
        file_prefix: Literal["workflow", "agents", "upgrade"],
        bucket_name: Optional[str] = None,
    ) -> str:
        return self.manager.upload_binary_file(
            file_bytes=file_bytes,
            destination_path=destination_path,
            file_prefix=file_prefix,
            content_type=content_type,
            bucket_name=bucket_name,
        )

    def read_file(self, file_path: str, bucket_name: Optional[str] = None) -> bytes:
        return self.manager.read_binary_file(
            file_path=file_path, bucket_name=bucket_name
        )

    def write_json_file(
        self,
        data: Any,
        file_path: str,
        file_prefix: Literal["workflow", "agents", "upgrade"],
    ):
        if hasattr(self.manager, 'upload_json_data'):
            return self.manager.upload_json_data(
                data=data, destination_path=file_path, file_prefix=file_prefix
            )
        elif hasattr(self.manager, 'upload_json_file'): # Compatibility
            return self.manager.upload_json_file(
                data=data, destination_path=file_path, file_prefix=file_prefix
            )
        else:
            # Fallback
            file_bytes = json.dumps(data, indent=2).encode("utf-8")
            return self.upload_file(
                file_bytes=file_bytes,
                destination_path=file_path,
                content_type="application/json",
                file_prefix=file_prefix,
            )
