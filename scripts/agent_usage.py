"""
Conversation usage and chat caps for widget / API agents, straight from the database.

Run on the server from the project root (same .env as the app):

    python -m scripts.agent_usage list
    python -m scripts.agent_usage show <agent-id-or-slug>
    python -m scripts.agent_usage set-cap <agent-id-or-slug> 200 --starts 2026-10-15
    python -m scripts.agent_usage set-cap <agent-id-or-slug> none      # unlimited

Counts only conversations started through the widget / public agent API that got
at least one reply (follow-up messages never count again). Months and the cap
start date are Asia/Kathmandu. Logic lives in src/services/agents/conversation_usage.py.
"""
import argparse
import asyncio
import sys
from datetime import date
from uuid import UUID

from sqlalchemy import select

from src.core.database.postgres import PostgresManager
from src.core.settings import system_setting
from src.models.sql.agent_api import AgentAPI
from src.models.sql.models import Agent
from src.services.agents.conversation_usage import today_kathmandu, usage_summary


async def _find_agent(session, ref: str):
    try:
        return await session.get(Agent, UUID(ref))
    except ValueError:
        result = await session.execute(
            select(Agent).join(AgentAPI, AgentAPI.agent_id == Agent.id).where(AgentAPI.slug == ref)
        )
        return result.scalar_one_or_none()


def _print_summary(s: dict) -> None:
    cap = "unlimited" if s["chat_cap"] is None else s["chat_cap"]
    print(f"{s['agent_name']}  ({s['agent_id']})")
    print(f"  cap: {cap}   cap starts: {s['chat_cap_starts_at'] or '-'}   cap reached: {s['cap_reached']}")
    print(f"  since cap start: {s['since_cap_start']}  [{s['since_cap_start_bracket']}]")
    print(f"  this month ({s['current_month']}): {s['current_month_count']}")
    for m in s["monthly"]:
        print(f"    {m['month']}: {m['count']:>5}  [{m['bracket']}]")


async def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="all agents with a published API")
    show = sub.add_parser("show", help="one agent")
    show.add_argument("agent")
    cap = sub.add_parser("set-cap", help="set or clear an agent's cap")
    cap.add_argument("agent")
    cap.add_argument("cap", help="a whole number, or 'none' for unlimited")
    cap.add_argument("--starts", type=date.fromisoformat, help="YYYY-MM-DD (Kathmandu); defaults to today if unset")
    args = parser.parse_args(argv)

    if not system_setting.DATABASE_URL:
        print("Error: DATABASE_URL not found in settings.")
        return 1

    db_manager = PostgresManager(system_setting.DATABASE_URL)
    try:
        async with db_manager.get_session() as session:
            if args.cmd == "list":
                result = await session.execute(
                    select(Agent, AgentAPI.slug).join(AgentAPI, AgentAPI.agent_id == Agent.id).order_by(Agent.name)
                )
                rows = result.all()
                if not rows:
                    print("No agents have a published API.")
                for agent, slug in rows:
                    s = await usage_summary(session, agent)
                    print(f"slug: {slug}")
                    _print_summary(s)
                    print()
                return 0

            agent = await _find_agent(session, args.agent)
            if not agent:
                print(f"Agent not found: {args.agent}")
                return 1

            if args.cmd == "set-cap":
                if args.cap.lower() in ("none", "null", "unlimited"):
                    agent.chat_cap = None
                else:
                    try:
                        agent.chat_cap = int(args.cap)
                    except ValueError:
                        print("cap must be a whole number or 'none'")
                        return 1
                    if agent.chat_cap < 0:
                        print("cap must be 0 or more")
                        return 1
                if args.starts:
                    agent.chat_cap_starts_at = args.starts
                if agent.chat_cap is not None and agent.chat_cap_starts_at is None:
                    agent.chat_cap_starts_at = today_kathmandu()
                await session.commit()
                print("Updated.")

            _print_summary(await usage_summary(session, agent))
            return 0
    finally:
        await db_manager.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
