"""Demo data for automations: default rule settings plus a first run of every rule, so the
Settings → Automations activity feed and the in-app notifications have real entries.

    python -m db.seed_automations     seed the demo workspaces that are already in the database

`seed_automations(db, d)` is called by db/seed.py for each demo workspace (d = one workspace from demo-data.json).
Idempotent (automation_log is unique per reminder). Demo workspaces never send email.
"""

from __future__ import annotations

from typing import Any

import psycopg

from api.automations.engine import execute
from api.automations.rules import RULES, defaults
from api.db import query, query_one
from api.demo import is_demo_workspace


def seed_automations(db: psycopg.Connection, d: dict[str, Any]) -> None:
    W = d["workspace"]["id"]
    if not is_demo_workspace(W):
        return
    for key in RULES:
        query(
            "INSERT INTO automation_settings (workspace_id, rule, enabled, config) VALUES ($1,$2,true,$3) ON CONFLICT (workspace_id, rule) DO NOTHING",
            [W, key, defaults(key)],
            db,
        )
    ws = query_one("SELECT id, slug, name FROM workspaces WHERE id = $1", [W], db)
    total = 0
    for key in RULES:
        total += len(execute(db, ws, key, cfg=defaults(key), dry_run=False, trigger="seed")["reminders"])  # type: ignore[arg-type]
    print(f"  · automations: {total} reminders")


def main() -> None:
    import json
    from pathlib import Path

    from api.db import pool, tx

    data = json.loads((Path(__file__).resolve().parent / "demo-data.json").read_text(encoding="utf-8"))
    pool.open()
    try:
        for d in data["workspaces"].values():
            with tx() as db:
                if not query("SELECT 1 FROM workspaces WHERE id = $1", [d["workspace"]["id"]], db):
                    continue
                print(d["workspace"]["name"])
                seed_automations(db, d)
    finally:
        pool.close()


if __name__ == "__main__":
    main()
