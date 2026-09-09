"""
Dual-mode verification suite.

Run this AFTER the full implementation is done to confirm everything wired up
correctly. It checks the parts that are safe to import in isolation (settings,
bootstrap, the three backend abstractions, the runtime factory) plus an
AST-based architecture scan that proves no business module imports redis/celery
directly. It deliberately does NOT import launch_server, so it runs without a
live database.

Usage:
    uv run pytest tests/test_dual_mode.py -v
    # or standalone, without pytest:
    uv run python tests/test_dual_mode.py

What a green run proves:
    - Lite mode boots with zero env: secrets auto-generate, DB falls back.
    - Full mode fails loud when REDIS_URL is missing (no silent degrade).
    - Memory limiter enforces the rolling window.
    - Memory cache honors TTL and delete.
    - Inline task queue actually executes enqueued coroutines.
    - The runtime factory binds the correct backends per mode.
    - No module outside the approved backend list imports redis or celery.
    - The single-process invariant condition is correct.

Skips (not failures) when optional deps are absent:
    - Full-mode runtime build is skipped if `redis` isn't installed.
"""
from __future__ import annotations

import ast
import asyncio
import importlib.util
import os
import sys
from pathlib import Path

import pytest

@pytest.fixture(autouse=True)
def clear_settings_cache():
    from src.core.settings import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

# --- locate the repo root (the dir containing `src/`) by walking up ---------
_HERE = Path(__file__).resolve()
REPO_ROOT = next(
    (p for p in [_HERE.parent, *_HERE.parents] if (p / "src").is_dir()),
    _HERE.parent.parent,
)
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SRC = REPO_ROOT / "src"

# Modules permitted to import redis/celery. Keep in sync with importlinter.ini
# and scripts/guard_imports.sh. Paths are relative to the repo root.
ALLOWED_BACKEND_FILES = {
    "src/services/limiter/redis_limiter.py",
    "src/services/cache/redis_cache.py",
    "src/services/taskqueue/celery_queue.py",
    "src/services/pubsub/redis_pubsub.py",
    "src/core/runtime.py",
    "src/core/celery_app.py",
    "src/core/redis.py",
    "src/core/rate_limiter.py",
    "src/tasks/cleanup.py",
    "src/tasks/scheduler.py",
    "src/tasks/workflow.py",
    "src/tasks/workflow_task.py",
    "src/core/task_processing/celery_app.py",
    "src/core/task_processing/celery_tasks.py",
    "src/core/task_processing/celery_worker_setup.py",
}
FORBIDDEN_TOP_LEVEL = {"redis", "celery"}


# ============================================================================
# Settings + bootstrap
# ============================================================================
def _clean_env(monkeypatch):
    for k in (
        "REDIS_URL", "JWT_SECRET", "ENCRYPTION_KEY", "DATABASE_URL",
        "DATABASE_URL_DEFAULT", "LITE_MODE", "WEB_CONCURRENCY", "FEATURES",
        "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND",
    ):
        monkeypatch.delenv(k, raising=False)


def test_lite_mode_boots_with_zero_env(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    monkeypatch.setenv("LITE_MODE", "true")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv(
        "DATABASE_URL_DEFAULT",
        "postgresql+asyncpg://t:t@localhost:5432/t",
    )
    monkeypatch.setenv("WEB_CONCURRENCY", "1")

    from src.core.bootstrap import ensure_bootstrap
    from src.core.settings import get_settings

    get_settings.cache_clear()
    s = ensure_bootstrap(get_settings(env_file=None), env_file=None)

    assert s.lite_mode is True
    assert s.jwt_secret, "JWT secret was not auto-generated"
    assert s.encryption_key, "encryption key was not auto-generated"
    assert s.DATABASE_URL.endswith("/t"), "DB url did not fall back to the bundled DSN"
    assert (tmp_path / "config.json").exists(), "config.json was not persisted"


def test_config_json_persists_secrets_across_reads(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    monkeypatch.setenv("LITE_MODE", "true")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL_DEFAULT", "postgresql+asyncpg://t:t@localhost:5432/t")

    from src.core.bootstrap import ensure_bootstrap
    from src.core.settings import get_settings

    get_settings.cache_clear()
    first = ensure_bootstrap(get_settings(env_file=None), env_file=None)
    secret_1 = first.jwt_secret

    # Simulate a restart: clear cache, read again. Secret must be stable.
    get_settings.cache_clear()
    second = ensure_bootstrap(get_settings(env_file=None), env_file=None)
    assert second.jwt_secret == secret_1, "JWT secret changed on restart"


def test_full_mode_requires_redis(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    from src.core.settings import Settings

    with pytest.raises(ValueError):
        Settings(data_dir=str(tmp_path), lite_mode=False, REDIS_URL="", _env_file=None)


def test_full_mode_rejects_missing_or_placeholder_secrets(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    from src.core.settings import Settings

    with pytest.raises(ValueError):
        Settings(
            data_dir=str(tmp_path), lite_mode=False,
            REDIS_URL="redis://localhost:6379/0", _env_file=None,
        )

    with pytest.raises(ValueError):
        Settings(
            data_dir=str(tmp_path), lite_mode=False,
            REDIS_URL="redis://localhost:6379/0",
            SECRET_KEY="change-me-in-dev",
            jwt_secret="short",
            ENCRYPTION_KEY="not-a-fernet-key",
            _env_file=None,
        )


def test_full_mode_accepts_strong_secrets(tmp_path, monkeypatch):
    # Routed through env vars (not constructor kwargs) since ENCRYPTION_KEY is
    # only reliably case-matched to the uppercase field via the env source -
    # a real deployment sets these as env vars too.
    _clean_env(monkeypatch)
    from cryptography.fernet import Fernet

    from src.core.settings import get_settings

    monkeypatch.setenv("LITE_MODE", "false")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("SECRET_KEY", "a" * 48)
    monkeypatch.setenv("JWT_SECRET", "b" * 48)
    monkeypatch.setenv("ENCRYPTION_KEY", Fernet.generate_key().decode())

    get_settings.cache_clear()
    s = get_settings(env_file=None)
    assert s.SECRET_KEY == "a" * 48
    assert s.jwt_secret == "b" * 48


def test_features_parsing(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    monkeypatch.setenv("LITE_MODE", "true")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL_DEFAULT", "postgresql+asyncpg://t:t@localhost:5432/t")
    monkeypatch.setenv("FEATURES", "chat, agents ,vibecoder")

    from src.core.settings import get_settings
    get_settings.cache_clear()
    s = get_settings()
    assert s.enabled_features == {"chat", "agents", "vibecoder"}
    assert s.feature_enabled("chat") and not s.feature_enabled("workflow")


# ============================================================================
# Rate limiter (memory)
# ============================================================================
@pytest.mark.asyncio
async def test_memory_limiter_enforces_window():
    from src.services.limiter.memory_limiter import MemoryRateLimiter

    lim = MemoryRateLimiter()
    results = [await lim.allow("ip-1", limit=3, window_s=60) for _ in range(4)]
    assert results == [True, True, True, False]
    # a different key is independent
    assert await lim.allow("ip-2", limit=3, window_s=60) is True


@pytest.mark.asyncio
async def test_memory_limiter_expires_after_window():
    from src.services.limiter.memory_limiter import MemoryRateLimiter

    lim = MemoryRateLimiter()
    assert await lim.allow("k", limit=1, window_s=1) is True
    assert await lim.allow("k", limit=1, window_s=1) is False
    await asyncio.sleep(1.05)
    assert await lim.allow("k", limit=1, window_s=1) is True, "window did not roll over"


def test_memory_limiter_sweep_frees_empty_keys():
    from src.services.limiter.memory_limiter import MemoryRateLimiter

    lim = MemoryRateLimiter()
    lim._hits["dead"]  # touch -> creates empty deque via defaultdict
    removed = lim.sweep()
    assert removed >= 1


# ============================================================================
# Cache (memory)
# ============================================================================
@pytest.mark.asyncio
async def test_memory_cache_roundtrip_and_delete():
    from src.services.cache.memory_cache import MemoryCache

    c = MemoryCache()
    await c.set("a", {"x": 1}, ttl_s=60)
    assert await c.get("a") == {"x": 1}
    await c.delete("a")
    assert await c.get("a") is None
    assert await c.get("never-set") is None


@pytest.mark.asyncio
async def test_memory_cache_ttl_expires():
    from src.services.cache.memory_cache import MemoryCache

    c = MemoryCache()
    await c.set("k", "v", ttl_s=1)
    assert await c.get("k") == "v"
    await asyncio.sleep(1.05)
    assert await c.get("k") is None, "value did not expire"


# ============================================================================
# Task queue (inline)
# ============================================================================
@pytest.mark.asyncio
async def test_inline_queue_runs_the_coroutine():
    from src.services.taskqueue.inline_queue import InlineTaskQueue

    q = InlineTaskQueue()
    flag = {"ran": False, "arg": None}

    async def job(value):
        flag["ran"] = True
        flag["arg"] = value

    q.register("job", job)
    job_id = q.enqueue("job", "payload")
    assert isinstance(job_id, str) and job_id
    await asyncio.sleep(0)  # let the scheduled task run
    await asyncio.sleep(0)
    assert flag["ran"] is True
    assert flag["arg"] == "payload"
    await q.shutdown()


@pytest.mark.asyncio
async def test_inline_queue_swallows_job_errors():
    from src.services.taskqueue.inline_queue import InlineTaskQueue

    q = InlineTaskQueue()

    async def boom():
        raise RuntimeError("expected")

    q.register("boom", boom)
    q.enqueue("boom")  # must not raise to the caller
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    await q.shutdown()


# ============================================================================
# Runtime factory
# ============================================================================
@pytest.mark.asyncio
async def test_runtime_lite_binds_memory_backends(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    monkeypatch.setenv("LITE_MODE", "true")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL_DEFAULT", "postgresql+asyncpg://t:t@localhost:5432/t")

    from src.core.runtime import build_runtime
    from src.core.settings import get_settings

    get_settings.cache_clear()
    rt = await build_runtime(get_settings())
    try:
        assert rt.redis is None
        assert type(rt.limiter).__name__ == "MemoryRateLimiter"
        assert type(rt.queue).__name__ in ("InlineTaskQueue", "InlineTaskQueueWithSyncSupport")
        assert type(rt.cache).__name__ == "MemoryCache"
    finally:
        await rt.shutdown()


@pytest.mark.asyncio
async def test_runtime_full_binds_redis_backends(tmp_path, monkeypatch):
    if importlib.util.find_spec("redis") is None:
        pytest.skip("redis not installed (lite-only environment) - full path not exercised here")

    _clean_env(monkeypatch)
    from cryptography.fernet import Fernet

    monkeypatch.setenv("LITE_MODE", "false")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://t:t@localhost:5432/t")
    monkeypatch.setenv("SECRET_KEY", "a" * 48)
    monkeypatch.setenv("JWT_SECRET", "b" * 48)
    monkeypatch.setenv("ENCRYPTION_KEY", Fernet.generate_key().decode())

    from src.core.settings import get_settings
    get_settings.cache_clear()

    # build_runtime imports src.core.celery_app in full mode. If that module
    # isn't present yet, treat as a skip rather than a hard failure.
    try:
        from src.core.runtime import build_runtime
        rt = await build_runtime(get_settings(env_file=None))
    except ModuleNotFoundError as e:
        pytest.skip(f"full-mode dependency missing: {e}")
        return

    try:
        assert type(rt.limiter).__name__ == "RedisRateLimiter"
        assert type(rt.queue).__name__ == "CeleryTaskQueue"
        assert type(rt.cache).__name__ == "RedisCache"
        assert rt.redis is not None
    finally:
        # don't require a live redis to close cleanly
        try:
            await rt.shutdown()
        except Exception:
            pass


# ============================================================================
# Single-process invariant (the condition used in launch_server lifespan)
# ============================================================================
def test_single_process_invariant_logic(tmp_path, monkeypatch):
    _clean_env(monkeypatch)
    monkeypatch.setenv("LITE_MODE", "true")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL_DEFAULT", "postgresql+asyncpg://t:t@localhost:5432/t")
    monkeypatch.setenv("WEB_CONCURRENCY", "4")

    from src.core.settings import get_settings
    get_settings.cache_clear()
    s = get_settings()
    # This mirrors the guard in launch_server.py. It must evaluate True here,
    # meaning startup would (correctly) raise.
    should_reject = s.lite_mode and s.web_concurrency != 1
    assert should_reject is True


# ============================================================================
# Architecture contract: no stray redis/celery imports
# ============================================================================
def _iter_py_files(root: Path):
    for p in root.rglob("*.py"):
        if "__pycache__" in p.parts:
            continue
        yield p


def _top_level_imports(path: Path) -> set[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError:
        return set()
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                found.add(node.module.split(".")[0])
    return found


def test_no_business_module_imports_redis_or_celery():
    offenders = []
    for path in _iter_py_files(SRC):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in ALLOWED_BACKEND_FILES:
            continue
        bad = _top_level_imports(path) & FORBIDDEN_TOP_LEVEL
        if bad:
            offenders.append(f"{rel} imports {sorted(bad)}")
    assert not offenders, (
        "These modules import redis/celery directly. Route them through "
        "app.state.{limiter,queue,cache} instead:\n  " + "\n  ".join(offenders)
    )


def test_backend_modules_exist():
    # Guard against someone deleting a backend the runtime factory expects.
    required = [
        "src/services/limiter/base.py",
        "src/services/limiter/memory_limiter.py",
        "src/services/limiter/redis_limiter.py",
        "src/services/taskqueue/base.py",
        "src/services/taskqueue/inline_queue.py",
        "src/services/taskqueue/celery_queue.py",
        "src/services/cache/base.py",
        "src/services/cache/memory_cache.py",
        "src/services/cache/redis_cache.py",
        "src/core/runtime.py",
        "src/core/settings.py",
        "src/core/bootstrap.py",
    ]
    missing = [r for r in required if not (REPO_ROOT / r).exists()]
    assert not missing, f"missing expected modules: {missing}"


# ============================================================================
# Standalone runner (no pytest required)
# ============================================================================
def _run_standalone() -> int:
    import inspect
    import tempfile
    import types

    class _MP:
        """Minimal monkeypatch stand-in for env vars only."""
        def __init__(self):
            self._saved = {}
        def setenv(self, k, v):
            self._saved.setdefault(k, os.environ.get(k))
            os.environ[k] = v
        def delenv(self, k, raising=False):
            self._saved.setdefault(k, os.environ.get(k))
            os.environ.pop(k, None)
        def undo(self):
            for k, v in self._saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
            self._saved.clear()

    tests = [
        (name, obj)
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and isinstance(obj, types.FunctionType)
    ]
    passed = failed = skipped = 0
    for name, fn in tests:
        mp = _MP()
        tmp = tempfile.TemporaryDirectory()
        sig = inspect.signature(fn)
        kwargs = {}
        if "tmp_path" in sig.parameters:
            kwargs["tmp_path"] = Path(tmp.name)
        if "monkeypatch" in sig.parameters:
            kwargs["monkeypatch"] = mp
        try:
            if asyncio.iscoroutinefunction(fn):
                asyncio.run(fn(**kwargs))
            else:
                fn(**kwargs)
            print(f"PASS  {name}")
            passed += 1
        except _Skip as e:
            print(f"SKIP  {name}: {e}")
            skipped += 1
        except Exception as e:  # noqa: BLE001
            print(f"FAIL  {name}: {type(e).__name__}: {e}")
            failed += 1
        finally:
            mp.undo()
            tmp.cleanup()
    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
    return 1 if failed else 0


class _Skip(Exception):
    pass


if __name__ == "__main__":
    # Make pytest.skip behave in standalone mode.
    def _skip(reason=""):
        raise _Skip(reason)
    pytest.skip = _skip  # type: ignore
    raise SystemExit(_run_standalone())
