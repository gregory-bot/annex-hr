"""Sessions (JWT in an httpOnly cookie), role guards and a small in-memory rate limiter."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, Request, Response

from .config import settings
from .errors import HttpError, forbidden, unauthorized

ISSUER = "annex-hr"


@dataclass
class AuthContext:
    userId: str
    employeeId: str
    workspaceId: str
    role: str
    #: True when the role was switched through the demo "View as" control.
    demo: bool = False


def sign_session(ctx: AuthContext) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {k: v for k, v in asdict(ctx).items() if not (k == "demo" and not v)}
    payload.update(iat=now, exp=now + settings.jwt_ttl_seconds, iss=ISSUER)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.COOKIE_SECURE or settings.is_prod,
        samesite="lax",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.COOKIE_NAME, path="/")


def _read_token(request: Request) -> str | None:
    cookie = request.cookies.get(settings.COOKIE_NAME)
    if cookie:
        return cookie
    header = request.headers.get("authorization", "")
    return header[7:] if header.startswith("Bearer ") else None


def optional_auth(request: Request) -> AuthContext | None:
    token = _read_token(request)
    if not token:
        return None
    try:
        p = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], issuer=ISSUER)
    except jwt.PyJWTError:
        return None
    ctx = AuthContext(userId=p["userId"], employeeId=p["employeeId"], workspaceId=p["workspaceId"], role=p["role"], demo=bool(p.get("demo")))
    return None if ctx.demo and not _is_demo_workspace(ctx.workspaceId) else ctx


def require_auth(request: Request) -> AuthContext:
    """FastAPI dependency: a valid session is required; the context is also stored on request.state."""
    token = _read_token(request)
    if not token:
        raise unauthorized()
    try:
        p = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], issuer=ISSUER)
    except jwt.PyJWTError as exc:
        raise unauthorized("Session expired — please sign in again") from exc
    ctx = AuthContext(userId=p["userId"], employeeId=p["employeeId"], workspaceId=p["workspaceId"], role=p["role"], demo=bool(p.get("demo")))
    if ctx.demo and not _is_demo_workspace(ctx.workspaceId):
        # A "View as" session inside a real company (possible before switching was restricted) — sign in again.
        raise unauthorized("Please sign in again")
    request.state.auth = ctx
    return ctx


def _is_demo_workspace(workspace_id: str) -> bool:
    from .demo import is_demo_workspace  # local import: demo.py imports this module

    return is_demo_workspace(workspace_id)


def require_role(*roles: str):
    """FastAPI dependency factory: allows the request only for the listed roles."""

    def dep(auth: AuthContext = Depends(require_auth)) -> AuthContext:
        if auth.role not in roles:
            raise forbidden()
        return auth

    return dep


# ── Passwords ───────────────────────────────────────────────────────
def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


#: Compared against when the user doesn't exist, so response time doesn't reveal which emails have accounts.
DUMMY_HASH = hash_password("annex-timing-equaliser", rounds=10)


# ── Rate limiting (per client IP, in-memory; use a shared store when running several instances) ──
_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def rate_limit(bucket: str, limit: int = 30, window_seconds: int = 15 * 60):
    # Generous outside production so local testing never locks you out of your own workspace.
    if not settings.is_prod:
        limit *= 20

    def dep(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = (bucket, ip)
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            raise HttpError(429, "Too many attempts — try again in a few minutes")
        q.append(now)

    return dep


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None
