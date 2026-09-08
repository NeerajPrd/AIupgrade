"""
One-off data migration: encrypt any plaintext api_key values in llm_model_configs.

LLMModelConfig.api_key moved from a plain Text column to EncryptedString
(src/core/encryption.py), which encrypts on write and decrypts on read going
forward. Rows written before that change still hold plaintext in the DB and
won't be touched by app code until they're read/written again through the
ORM. This script finds them and re-encrypts them in place.

Safe to re-run: rows that already decrypt as valid Fernet ciphertext are left
alone.
"""
import asyncio
from sqlalchemy import text
from src.core.database.postgres import PostgresManager
from src.core.settings import system_setting
from src.core.encryption import crypto, DecryptionError


async def encrypt_llm_api_keys():
    print("Starting migration: encrypt plaintext api_key values in llm_model_configs...")
    if not system_setting.DATABASE_URL:
        print("Error: DATABASE_URL not found in settings.")
        return
    if not system_setting.ENCRYPTION_KEY:
        print("Error: ENCRYPTION_KEY not set. Set it in .env before running this migration.")
        return

    db_manager = PostgresManager(system_setting.DATABASE_URL)
    try:
        async with db_manager.get_session() as session:
            result = await session.execute(
                text("SELECT id, api_key FROM llm_model_configs WHERE api_key IS NOT NULL AND api_key != ''")
            )
            rows = result.fetchall()
            print(f"Found {len(rows)} row(s) with a non-empty api_key.")

            migrated = 0
            already_encrypted = 0
            for row in rows:
                config_id, raw_value = row[0], row[1]
                try:
                    crypto.decrypt(raw_value)
                    already_encrypted += 1
                    continue
                except DecryptionError:
                    pass

                new_value = crypto.encrypt(raw_value)
                await session.execute(
                    text("UPDATE llm_model_configs SET api_key = :new_value WHERE id = :id"),
                    {"new_value": new_value, "id": config_id},
                )
                migrated += 1

            await session.commit()
            print(f"Migrated {migrated} row(s). {already_encrypted} row(s) were already encrypted.")
    except Exception as e:
        print(f"An error occurred: {e}")
        raise
    finally:
        await db_manager.close()


if __name__ == "__main__":
    asyncio.run(encrypt_llm_api_keys())
