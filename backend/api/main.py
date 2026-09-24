"""Annex HR API — FastAPI application.

Run from backend/:  uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import importlib
import logging
import pkgutil
import time
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import errors, routers
from .config import settings
from .db import SCHEMA, pool, query

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("annex.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open()
    try:
        query("SELECT 1")
        log.info("✓ Connected to %s/%s (schema %s)", settings.DB_HOST, settings.DB_NAME, SCHEMA)
    except Exception as exc:  # noqa: BLE001 — the API still starts; /api/health reports the problem
        log.error("✖ Database unreachable: %s", exc)
    yield
    pool.close()


app = FastAPI(
    title="Annex HR API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
errors.install(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    if settings.is_prod:
        response.headers.setdefault("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
    if not settings.is_prod and request.url.path.startswith("/api"):
        log.info("%s %s → %s (%dms)", request.method, request.url.path, response.status_code, (time.perf_counter() - started) * 1000)
    return response


api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    started = time.perf_counter()
    query("SELECT 1")
    return {"status": "ok", "db": "ok", "latencyMs": round((time.perf_counter() - started) * 1000)}


# Every module in api/routers/ that exposes `router` is mounted under /api.
for info in sorted(pkgutil.iter_modules(routers.__path__), key=lambda m: m.name):
    module = importlib.import_module(f"{routers.__name__}.{info.name}")
    if hasattr(module, "router"):
        api.include_router(module.router)

app.include_router(api)
