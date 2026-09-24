"""Background scheduler started from the FastAPI lifespan: a pass every 15 minutes."""

from __future__ import annotations

import asyncio
import logging

from .engine import enabled_in_env, run_pass

log = logging.getLogger("annex.automations")

INTERVAL_SECONDS = 15 * 60
FIRST_RUN_DELAY_SECONDS = 60

_task: asyncio.Task | None = None


async def _loop() -> None:
    await asyncio.sleep(FIRST_RUN_DELAY_SECONDS)
    while True:
        try:
            # psycopg is synchronous — run the pass in a worker thread (one DB connection).
            results = await asyncio.to_thread(run_pass)
            if results:
                sent = sum(len(r["reminders"]) for r in results)
                log.info("[automations] pass complete: %d rule run(s), %d reminder(s)", len(results), sent)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — keep the scheduler alive
            log.exception("[automations] scheduler pass failed")
        await asyncio.sleep(INTERVAL_SECONDS)


def start_scheduler() -> None:
    global _task
    if not enabled_in_env():
        log.info("[automations] scheduler disabled (AUTOMATIONS_ENABLED=false)")
        return
    if _task is None or _task.done():
        _task = asyncio.get_running_loop().create_task(_loop(), name="automations")
        log.info("[automations] scheduler started (every %d min)", INTERVAL_SECONDS // 60)


async def stop_scheduler() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        _task = None
