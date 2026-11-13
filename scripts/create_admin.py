"""Create an admin account, or make an existing account an admin.

No account is created automatically any more, and public signup is off by default, so this is
how the first admin (and any later one) is made. The password is typed at a hidden prompt: it is
never passed on the command line, printed, or logged.

    # new admin (asks for a password twice)
    python scripts/create_admin.py --email you@example.com --name "Your Name"

    # make an existing account an admin, keeping its password
    python scripts/create_admin.py --email you@example.com --promote

In Docker:  docker compose exec app uv run python scripts/create_admin.py --email you@example.com --name "Your Name"
"""
import argparse
import asyncio
import getpass
import sys
import uuid
from datetime import datetime, timezone

import bcrypt

MIN_PASSWORD_LENGTH = 12


def read_password() -> str:
    password = getpass.getpass(f"Password (at least {MIN_PASSWORD_LENGTH} characters): ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters. Nothing was changed.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("The two passwords did not match. Nothing was changed.")
    return password


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create or promote an admin account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default=None, help="Display name for a new account")
    parser.add_argument("--promote", action="store_true", help="Make an existing account an admin (password unchanged)")
    args = parser.parse_args()
    email = args.email.strip().lower()

    from src.core.database.postgres import PostgresManager
    from src.core.settings import system_setting
    from src.services.nosql.postgres_services import PostgresServices

    manager = PostgresManager(system_setting.DATABASE_URL)
    async with manager.get_session() as session:
        services = PostgresServices(session)
        user = await services.get_user_by_email(email)

        if args.promote:
            if user is None:
                sys.exit(f"No account with email {email}. Run without --promote to create it.")
            user.role = "admin"
            user.active = True
            await session.commit()
            print(f"{email} is now an admin.")
            return

        if user is not None:
            sys.exit(f"An account with email {email} already exists. Use --promote to make it an admin.")

        password = read_password()
        now = datetime.now(timezone.utc)
        await services.create_user(
            {
                "id": uuid.uuid4(),
                "name": args.name or email.split("@")[0],
                "email": email,
                "password_hash": bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
                "role": "admin",
                "verified": True,
                "active": True,
                "visited": 1,
                "created_at": now,
                "updated_at": now,
                "social_media": {},
            }
        )
        print(f"Admin account created for {email}.")


if __name__ == "__main__":
    asyncio.run(main())
