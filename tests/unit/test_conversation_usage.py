"""Tests for counting new widget/API conversations per agent.

Pure helpers are tested directly. The SQL is checked by compiling it for the
PostgreSQL dialect (no live database needed). An optional end-to-end test runs
against a real Postgres when FAGOON_TEST_PG_URL is set.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql

from src.services.agents import conversation_usage as cu


# --------------------------------------------------------------------------- #
# brackets and cap
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "count,label",
    [
        (0, "up to 200"),
        (200, "up to 200"),
        (201, "201 to 400"),
        (400, "201 to 400"),
        (401, "401 to 900"),
        (900, "401 to 900"),
        (901, "over 900"),
        (5000, "over 900"),
    ],
)
def test_bracket_boundaries(count, label):
    assert cu.bracket_for(count) == label


def test_null_cap_is_unlimited():
    assert cu.is_cap_reached(None, 0) is False
    assert cu.is_cap_reached(None, 10_000) is False


def test_cap_reached_at_and_above_cap():
    assert cu.is_cap_reached(200, 199) is False
    assert cu.is_cap_reached(200, 200) is True
    assert cu.is_cap_reached(200, 201) is True


def test_zero_cap_blocks_everything():
    assert cu.is_cap_reached(0, 0) is True


# --------------------------------------------------------------------------- #
# Asia/Kathmandu calendar handling
# --------------------------------------------------------------------------- #
def test_cap_start_is_kathmandu_midnight():
    start = cu.start_of_day_kathmandu(date(2026, 10, 15))
    # 00:00 +05:45 == 18:15 UTC the previous day
    assert start.astimezone(timezone.utc) == datetime(2026, 10, 14, 18, 15, tzinfo=timezone.utc)


def test_month_key_uses_kathmandu_time():
    # 31 Oct 18:30 UTC is already 1 Nov 00:15 in Kathmandu
    assert cu.month_key(datetime(2026, 10, 31, 18, 30, tzinfo=timezone.utc)) == "2026-11"
    # 31 Oct 18:00 UTC is still 31 Oct 23:45 in Kathmandu
    assert cu.month_key(datetime(2026, 10, 31, 18, 0, tzinfo=timezone.utc)) == "2026-10"


def test_month_key_treats_naive_as_utc():
    assert cu.month_key(datetime(2026, 10, 31, 18, 30)) == "2026-11"


def test_bucket_by_month_counts_and_sorts():
    ts = [
        datetime(2026, 11, 2, tzinfo=timezone.utc),
        datetime(2026, 10, 5, tzinfo=timezone.utc),
        datetime(2026, 10, 6, tzinfo=timezone.utc),
    ]
    assert cu.bucket_by_month(ts) == {"2026-10": 2, "2026-11": 1}
    assert list(cu.bucket_by_month(ts)) == ["2026-10", "2026-11"]


# --------------------------------------------------------------------------- #
# SQL shape (compiled for Postgres)
# --------------------------------------------------------------------------- #
class _CapturingSession:
    def __init__(self, scalar=0, scalars=None, one=None):
        self.statements = []
        self._scalar, self._scalars, self._one = scalar, scalars or [], one

    async def execute(self, stmt):
        self.statements.append(stmt)
        session = self

        class _Result:
            def scalar(self):
                return session._scalar

            def scalar_one_or_none(self):
                return session._one

            def scalars(self):
                return SimpleNamespace(all=lambda: session._scalars)

        return _Result()


def _sql(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


async def test_count_query_filters_source_reply_and_start():
    agent_id = uuid.uuid4()
    db = _CapturingSession(scalar=7)
    assert await cu.count_new_conversations(db, agent_id, date(2026, 10, 15)) == 7
    sql = _sql(db.statements[0])
    assert "agent_chat_histories.source = 'agent_api'" in sql
    assert "EXISTS" in sql and "agent_chats.role = 'assistant'" in sql
    assert "agent_chats.history_id = agent_chat_histories.id" in sql
    assert "agent_chat_histories.created_at >= '2026-10-15 00:00:00+05:45'" in sql
    # follow-ups live in agent_chats; we count history rows, never messages
    assert "count(*)" in sql.lower() and "FROM agent_chat_histories" in sql
    # soft-deleted conversations still count
    assert "is_deleted" not in sql


async def test_count_without_start_has_no_date_filter():
    db = _CapturingSession(scalar=3)
    assert await cu.count_new_conversations(db, uuid.uuid4(), None) == 3
    assert "created_at >=" not in _sql(db.statements[0])


async def test_monthly_counts_buckets_rows():
    db = _CapturingSession(
        scalars=[datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 10, 31, 18, 30, tzinfo=timezone.utc)]
    )
    assert await cu.monthly_counts(db, uuid.uuid4()) == {"2026-10": 1, "2026-11": 1}


async def test_conversation_belongs_rejects_bad_uuid_without_query():
    db = _CapturingSession()
    assert await cu.conversation_belongs_to_agent(db, "not-a-uuid", uuid.uuid4()) is False
    assert db.statements == []


async def test_conversation_belongs_query_scopes_to_agent():
    agent_id = uuid.uuid4()
    db = _CapturingSession(one=uuid.uuid4())
    assert await cu.conversation_belongs_to_agent(db, str(uuid.uuid4()), agent_id) is True
    sql = _sql(db.statements[0])
    assert f"agent_chat_histories.agent_id = '{agent_id}'" in sql
    assert "agent_chat_histories.source = 'agent_api' OR agent_chat_histories.source IS NULL" in sql
    assert "is_deleted IS NOT true" in sql


async def test_conversation_belongs_false_when_not_found():
    db = _CapturingSession(one=None)
    assert await cu.conversation_belongs_to_agent(db, str(uuid.uuid4()), uuid.uuid4()) is False


async def test_usage_summary_shape(monkeypatch):
    async def fake_monthly(db, agent_id):
        return {"2026-10": 150, "2026-11": 250}

    async def fake_count(db, agent_id, since):
        assert since == date(2026, 10, 15)
        return 400

    monkeypatch.setattr(cu, "monthly_counts", fake_monthly)
    monkeypatch.setattr(cu, "count_new_conversations", fake_count)
    agent = SimpleNamespace(id=uuid.uuid4(), name="Nepalland", chat_cap=400, chat_cap_starts_at=date(2026, 10, 15))
    s = await cu.usage_summary(None, agent)
    assert s["since_cap_start"] == 400
    assert s["since_cap_start_bracket"] == "201 to 400"
    assert s["cap_reached"] is True
    assert s["chat_cap_starts_at"] == "2026-10-15"
    assert s["monthly"] == [
        {"month": "2026-10", "count": 150, "bracket": "up to 200"},
        {"month": "2026-11", "count": 250, "bracket": "201 to 400"},
    ]
    assert s["timezone"] == "Asia/Kathmandu"


# --------------------------------------------------------------------------- #
# optional: real Postgres
# --------------------------------------------------------------------------- #
async def test_counts_against_live_postgres():
    url = os.environ.get("FAGOON_TEST_PG_URL")
    if not url:
        pytest.skip("set FAGOON_TEST_PG_URL to a migrated, disposable Postgres to run")

    from src.core.database.postgres import PostgresManager
    from src.models.sql.models import Agent, AgentChat, AgentChatHistory, User

    manager = PostgresManager(url)
    now = datetime.now(timezone.utc)
    user_id, agent_id = uuid.uuid4(), uuid.uuid4()
    try:
        async with manager.get_session() as s:
            s.add(User(id=user_id, name="t", email=f"{user_id}@test.local", password_hash="x"))
            s.add(Agent(id=agent_id, user_id=user_id, name="t", chat_cap=2, chat_cap_starts_at=cu.today_kathmandu()))
            await s.flush()

            def conv(source, replied, created, followups=0):
                h = AgentChatHistory(id=uuid.uuid4(), agent_id=agent_id, user_id=user_id, source=source, created_at=created)
                s.add(h)
                msgs = [("user", "hi")] + ([("assistant", "hello")] if replied else [])
                msgs += [("user", "more"), ("assistant", "sure")] * followups
                for role, content in msgs:
                    s.add(AgentChat(id=uuid.uuid4(), history_id=h.id, role=role, content=content))
                return h

            conv("agent_api", True, now, followups=5)        # counted once despite follow-ups
            conv("agent_api", True, now)                      # counted
            conv("agent_api", False, now)                     # failed first message: not counted
            conv(None, True, now)                             # dashboard / pre-migration: not counted
            conv("agent_api", True, now - timedelta(days=40))  # before cap start: only in monthly
            await s.commit()

            assert await cu.count_new_conversations(s, agent_id, cu.today_kathmandu()) == 2
            assert await cu.count_new_conversations(s, agent_id, None) == 3
            assert sum((await cu.monthly_counts(s, agent_id)).values()) == 3
    finally:
        async with manager.get_session() as s:
            await s.delete(await s.get(User, user_id))
            await s.commit()
        await manager.close()
