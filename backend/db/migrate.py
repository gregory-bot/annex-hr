"""Migration runner.

    python -m db.migrate            apply pending migrations
    python -m db.migrate --reset    drop every table in DB_SCHEMA first (refused in production)

SQL files in db/migrations run in filename order, each in a transaction with
search_path pinned to DB_SCHEMA, and are recorded in schema_migrations.
"""

from __future__ import annotations

import sys
from pathlib import Path

from api.config import settings
from api.db import SCHEMA, connection, pool, query, with_connection_retry

MIGRATIONS = Path(__file__).resolve().parent / "migrations"


def reset() -> None:
    if settings.is_prod:
        raise SystemExit("Refusing to reset the database in production.")
    rows = query("SELECT tablename FROM pg_tables WHERE schemaname = $1", [settings.DB_SCHEMA])
    if rows:
        query("DROP TABLE " + ", ".join(f'{SCHEMA}."{r["tablename"]}"' for r in rows) + " CASCADE")
    print(f"↺ Dropped {len(rows)} tables from schema {SCHEMA}")


def migrate() -> None:
    if not query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [settings.DB_SCHEMA]):
        raise SystemExit(f"Schema {SCHEMA} does not exist. Create it first: CREATE SCHEMA {SCHEMA};")
    query(f"CREATE TABLE IF NOT EXISTS {SCHEMA}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    applied = {r["name"] for r in query(f"SELECT name FROM {SCHEMA}.schema_migrations")}
    count = 0
    for file in sorted(MIGRATIONS.glob("*.sql")):
        if file.name in applied:
            continue
        sql = file.read_text(encoding="utf-8")
        with connection() as conn:
            with conn.transaction():
                conn.execute(f"SET LOCAL search_path TO {SCHEMA}")
                conn.execute(sql)  # type: ignore[arg-type] — multi-statement script, no parameters
                conn.execute(f"INSERT INTO {SCHEMA}.schema_migrations (name) VALUES (%s)", [file.name])
        print(f"✓ Applied {file.name}")
        count += 1
    print(f"Migrations complete ({count} applied) in schema {SCHEMA}." if count else f"Schema {SCHEMA} is up to date.")


def main() -> None:
    pool.open()
    try:
        if "--reset" in sys.argv:
            with_connection_retry(reset)
        migrate()
    finally:
        pool.close()


if __name__ == "__main__":
    main()
