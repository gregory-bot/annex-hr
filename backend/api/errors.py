"""HTTP errors with the API's JSON shape: {"error": str, "details"?: any}."""

from __future__ import annotations

import logging
from typing import Any

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("annex.api")


class HttpError(Exception):
    def __init__(self, status: int, message: str, details: Any = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details


def bad_request(msg: str, details: Any = None) -> HttpError:
    return HttpError(400, msg, details)


def unauthorized(msg: str = "Authentication required") -> HttpError:
    return HttpError(401, msg)


def forbidden(msg: str = "You do not have access to this resource") -> HttpError:
    return HttpError(403, msg)


def not_found(what: str = "Resource") -> HttpError:
    return HttpError(404, f"{what} not found")


def conflict(msg: str) -> HttpError:
    return HttpError(409, msg)


def _issues(exc: ValidationError | RequestValidationError) -> list[dict[str, str]]:
    out = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", ())]
        # FastAPI prefixes request errors with where the value came from; model errors have no prefix.
        if isinstance(exc, RequestValidationError) and loc and loc[0] in ("body", "query", "path"):
            loc = loc[1:]
        out.append({"path": ".".join(loc), "message": e.get("msg", "Invalid value")})
    return out


def parse(model: type[BaseModel], data: Any) -> Any:
    """Validates input with a pydantic model, raising a 400 with field issues on failure."""
    try:
        return model.model_validate(data if data is not None else {})
    except ValidationError as exc:
        raise bad_request("Validation failed", _issues(exc)) from exc


def _json(status: int, error: str, details: Any = None) -> JSONResponse:
    body: dict[str, Any] = {"error": error}
    if details is not None:
        body["details"] = details
    return JSONResponse(body, status_code=status)


def install(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def _http(_: Request, exc: HttpError):
        return _json(exc.status, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return _json(400, "Validation failed", _issues(exc))

    @app.exception_handler(StarletteHTTPException)
    async def _starlette(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return _json(404, f"No route for {request.method} {request.url.path}")
        return _json(exc.status_code, str(exc.detail))

    @app.exception_handler(psycopg.Error)
    async def _db(_: Request, exc: psycopg.Error):
        code = getattr(exc, "sqlstate", None)
        diag = getattr(exc, "diag", None)
        detail = getattr(diag, "message_detail", None) if diag else None
        if code == "23505":
            return _json(409, "A record with these details already exists", detail)
        if code in ("23503", "23514", "22P02", "22007", "22008"):
            return _json(400, "Invalid reference or value", detail or getattr(diag, "constraint_name", None))
        log.exception("Database error")
        return _json(500, "Internal server error")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return _json(500, "Internal server error")
