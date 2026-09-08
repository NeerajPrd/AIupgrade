import base64
import json
from typing import Optional
from datetime import datetime, timezone
from cryptography.fernet import Fernet, InvalidToken
from loguru import logger
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


class EncryptionError(Exception):
    """Base exception for encryption operations."""
    pass


class DecryptionError(EncryptionError):
    """Raised when decryption fails."""
    pass


class EncryptionService:
    """
    Encryption service with key rotation support.

    Features:
    - Fernet symmetric encryption (AES-128-CBC + HMAC)
    - Key versioning for rotation
    - Transparent retry with old keys
    - Secure key derivation
    """

    def __init__(self, encryption_key: Optional[str] = None):
        """
        Initialize encryption service.

        Args:
            encryption_key: Base64-encoded Fernet key. If None, loaded from settings.
        """
        self._key = encryption_key
        self._fernet: Optional[Fernet] = None
        self._old_keys: list = []  # For key rotation

    def _get_fernet(self) -> Fernet:
        """Lazy-load Fernet instance."""
        if self._fernet is None:
            if self._key is None:
                try:
                    from src.core.config import settings
                    key = settings.ENCRYPTION_KEY
                    # Handle SecretStr type
                    self._key = (
                        key.get_secret_value()
                        if hasattr(key, 'get_secret_value')
                        else key
                    )
                except ImportError:
                    raise EncryptionError("Encryption key not configured")

            try:
                self._fernet = Fernet(self._key.encode() if isinstance(self._key, str) else self._key)
            except Exception as e:
                raise EncryptionError(f"Invalid encryption key: {e}")

        return self._fernet

    def encrypt(self, data: str) -> str:
        """
        Encrypts a string using Fernet encryption.

        Args:
            data: Plain text to encrypt

        Returns:
            Base64-encoded encrypted string

        Raises:
            EncryptionError: If encryption fails
        """
        if not data:
            raise EncryptionError("Cannot encrypt empty data")

        try:
            fernet = self._get_fernet()
            encrypted = fernet.encrypt(data.encode('utf-8'))
            return encrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise EncryptionError(f"Encryption failed: {e}")

    def decrypt(self, token: str) -> str:
        """
        Decrypts a Fernet token back to plain text.

        Attempts decryption with current key first, then falls back
        to old keys for key rotation support.

        Args:
            token: Base64-encoded encrypted string

        Returns:
            Decrypted plain text

        Raises:
            DecryptionError: If decryption fails with all keys
        """
        if not token:
            raise DecryptionError("Cannot decrypt empty token")

        # Try current key
        try:
            fernet = self._get_fernet()
            decrypted = fernet.decrypt(token.encode('utf-8'))
            return decrypted.decode('utf-8')
        except InvalidToken:
            pass
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise DecryptionError(f"Decryption failed: {e}")

        # Try old keys for rotation support
        for old_key in self._old_keys:
            try:
                old_fernet = Fernet(old_key.encode() if isinstance(old_key, str) else old_key)
                decrypted = old_fernet.decrypt(token.encode('utf-8'))
                logger.info("Decrypted with old key - consider re-encrypting")
                return decrypted.decode('utf-8')
            except InvalidToken:
                continue
            except Exception:
                continue

        raise DecryptionError("Decryption failed: Invalid token or wrong key")

    def add_rotation_key(self, old_key: str) -> None:
        """
        Adds an old key for rotation support.

        During key rotation, add old keys here to allow decryption
        of data encrypted with previous keys.

        Args:
            old_key: Base64-encoded old Fernet key
        """
        self._old_keys.append(old_key)
        logger.info("Added rotation key")

    def rotate_and_reencrypt(self, token: str) -> str:
        """
        Decrypts with any valid key and re-encrypts with current key.

        Use this during key rotation to migrate encrypted data.

        Args:
            token: Encrypted token (possibly with old key)

        Returns:
            Token encrypted with current key
        """
        plaintext = self.decrypt(token)
        return self.encrypt(plaintext)

    @staticmethod
    def generate_key() -> str:
        """
        Generates a new Fernet encryption key.

        Returns:
            Base64-encoded key string
        """
        return Fernet.generate_key().decode('utf-8')


# Global singleton instance
crypto = EncryptionService()


def encrypt_credentials(credentials: dict) -> str:
    """
    Convenience function to encrypt a credentials dictionary.

    Args:
        credentials: Dictionary of credentials

    Returns:
        Encrypted JSON string
    """
    return crypto.encrypt(json.dumps(credentials))


def decrypt_credentials(encrypted: str) -> dict:
    """
    Convenience function to decrypt a credentials dictionary.

    Args:
        encrypted: Encrypted JSON string

    Returns:
        Dictionary of credentials
    """
    return json.loads(crypto.decrypt(encrypted))


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy column type that transparently encrypts on write and
    decrypts on read, storing Fernet ciphertext in an underlying TEXT
    column. Column-level, so every query path (ORM attribute access,
    Core select()/update(), raw session.get()) gets the same behavior
    without call sites needing to know about it.

    Rows written before this type was applied to a column are plain
    text and won't parse as a Fernet token; process_result_value falls
    back to returning them as-is so existing data keeps working until
    it's migrated (see scripts/encrypt_llm_api_keys.py).
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:
        if not value:
            return value
        return crypto.encrypt(value)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:
        if not value:
            return value
        try:
            return crypto.decrypt(value)
        except DecryptionError:
            return value