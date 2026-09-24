"""PostgreSQL access: a small connection pool pinned to the Annex HR schema.

SQL is written with $1, $2 … placeholders (the same style as the original API),
translated to psycopg's named parameters, so queries read exactly like plain SQL.
"""

from __future__ import annotations

import datetime as dt
import re
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, TypeVar

import psycopg
from psycopg import sql as pgsql
from psycopg.adapt import Loader
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

T = TypeVar("T")
Row = dict[str, Any]

SCHEMA = f'"{settings.DB_SCHEMA.replace(chr(34), "")}"'


# ── Type loaders: NUMERIC → float, DATE → 'YYYY-MM-DD' (matches the API contract) ──
class _NumericLoader(Loader):
    def load(self, data: bytes) -> float:  # type: ignore[override]
        return float(bytes(data).decode())


class _DateLoader(Loader):
    def load(self, data: bytes) -> str:  # type: ignore[override]
        return bytes(data).decode()


def _configure(conn: psycopg.Connection) -> None:
    conn.adapters.register_loader("numeric", _NumericLoader)
    conn.adapters.register_loader("date", _DateLoader)


def _conninfo() -> dict[str, Any]:
    kw: dict[str, Any] = dict(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        dbname=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        application_name="annex-hr-api",
        connect_timeout=10,
        # Every connection resolves unqualified table names inside the Annex HR schema only.
        options=f"-c search_path={SCHEMA}",
    )
    if settings.DB_SSL:
        kw["sslmode"] = "verify-full" if settings.DB_SSL_CA_PATH else "require"
        if settings.DB_SSL_CA_PATH:
            kw["sslrootcert"] = settings.DB_SSL_CA_PATH
    else:
        kw["sslmode"] = "disable"
    return kw


pool = ConnectionPool(
    kwargs={**_conninfo(), "row_factory": dict_row, "autocommit": True},
    configure=_configure,
    min_size=0,
    max_size=settings.DB_POOL_MAX,
    # Release idle connections quickly — small managed plans share few connections across apps.
    max_idle=5,
    timeout=20,
    open=False,
)


def with_connection_retry(fn: Callable[[], T], attempts: int = 5) -> T:
    """Retries briefly when Postgres has no free connection slots (SQLSTATE 53300)."""
    for i in range(1, attempts + 1):
        try:
            return fn()
        except psycopg.OperationalError as exc:
            too_many = "53300" in str(getattr(exc, "sqlstate", "") or "") or "connection slots" in str(exc) or "too many clients" in str(exc)
            if not too_many or i >= attempts:
                raise
            time.sleep(0.15 * i * i)
    raise RuntimeError("unreachable")


_PARAM = re.compile(r"\$(\d+)")


def translate(sql: str, params: Sequence[Any] | None) -> tuple[str, dict[str, Any]]:
    """`$1` → `%(p1)s`; literal `%` escaped. Parameters may be referenced repeatedly."""
    params = list(params or [])
    text = sql.replace("%", "%%")
    text = _PARAM.sub(lambda m: f"%(p{m.group(1)})s", text)
    return text, {f"p{i + 1}": _adapt(v) for i, v in enumerate(params)}


def _adapt(v: Any) -> Any:
    if isinstance(v, (dict, list)) and not isinstance(v, psycopg.types.json.Jsonb):
        # Lists of scalars go to Postgres arrays; dicts to JSON. Pass json.dumps(...) for JSON arrays.
        if isinstance(v, dict):
            return psycopg.types.json.Jsonb(v)
    return v


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with with_connection_retry(lambda: pool.connection()) as conn:  # type: ignore[arg-type]
        yield conn


def query(sql: str, params: Sequence[Any] | None = None, db: psycopg.Connection | None = None) -> list[Row]:
    """Runs a statement and returns its rows as dicts (empty list for statements without results)."""
    text, bound = translate(sql, params)

    def run(conn: psycopg.Connection) -> list[Row]:
        cur = conn.execute(text, bound)  # type: ignore[arg-type]
        return list(cur.fetchall()) if cur.description else []

    if db is not None:
        return run(db)

    def attempt() -> list[Row]:
        with pool.connection() as conn:
            return run(conn)

    return with_connection_retry(attempt)


def query_one(sql: str, params: Sequence[Any] | None = None, db: psycopg.Connection | None = None) -> Row | None:
    rows = query(sql, params, db)
    return rows[0] if rows else None


@contextmanager
def tx() -> Iterator[psycopg.Connection]:
    """A transaction on one pooled connection; rolls back on any exception."""
    with connection() as conn:
        with conn.transaction():
            yield conn


_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def ident(name: str) -> str:
    """Guards identifiers interpolated into SQL (never user input, but be strict anyway)."""
    if not _IDENT.match(name):
        raise ValueError(f"Unsafe SQL identifier: {name}")
    return name


def insert_many(db: psycopg.Connection, table: str, rows: list[Row]) -> None:
    """Multi-row INSERT, chunked to stay well under Postgres' parameter limit."""
    if not rows:
        return
    cols = [ident(c) for c in rows[0].keys()]
    per_chunk = max(1, 20_000 // len(cols))
    for start in range(0, len(rows), per_chunk):
        chunk = rows[start : start + per_chunk]
        values: list[str] = []
        params: list[Any] = []
        for row in chunk:
            placeholders = []
            for c in cols:
                params.append(row.get(c))
                placeholders.append(f"${len(params)}")
            values.append(f"({', '.join(placeholders)})")
        query(f"INSERT INTO {ident(table)} ({', '.join(cols)}) VALUES {', '.join(values)}", params, db)


def to_snake(s: str) -> str:
    return re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), s)


def build_update(patch: dict[str, Any], allowed: list[str], start_index: int = 1) -> tuple[str, list[Any]] | None:
    """Parameterised `col = $n` list from a camelCase patch, whitelisted columns only."""
    sets: list[str] = []
    params: list[Any] = []
    for key, value in patch.items():
        col = to_snake(key)
        if col not in allowed:
            continue
        params.append(value)
        sets.append(f"{ident(col)} = ${start_index + len(params) - 1}")
    return (", ".join(sets), params) if sets else None


def iso(v: Any) -> str:
    """Timestamp → ISO 8601 UTC with milliseconds and a trailing Z (JavaScript toISOString format)."""
    if not v:
        return ""
    if isinstance(v, str):
        try:
            v = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return v
    if isinstance(v, dt.datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return v.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return str(v)


def num(v: Any) -> Any:
    return float(v) if isinstance(v, Decimal) else v


__all__ = ["SCHEMA", "Row", "pool", "query", "query_one", "tx", "connection", "insert_many", "ident", "build_update", "iso", "num", "pgsql", "with_connection_retry"]
