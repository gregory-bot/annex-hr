"""Authentication (login, demo sign-in, email-verified sign-up, password reset) and invitations."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import re
import secrets
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, BeforeValidator, EmailStr, Field

from ..audit import audit
from ..config import settings
from ..db import insert_many, iso, query, query_one, tx
from ..email import templates
from ..email.service import send_email
from ..errors import HttpError, bad_request, conflict, forbidden, not_found, parse, unauthorized
from ..repository import get_workspace, to_employee
from ..security import (
    DUMMY_HASH,
    AuthContext,
    clear_session_cookie,
    hash_password,
    rate_limit,
    require_auth,
    set_session_cookie,
    sign_session,
    verify_password,
)

router = APIRouter()

ROLES = ("super_admin", "company_admin", "hr_officer", "manager", "employee", "consultant", "finance", "ceo")
RoleName = Literal["super_admin", "company_admin", "hr_officer", "manager", "employee", "consultant", "finance", "ceo"]
PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"]

DEFAULT_TICKET_TEAMS = [
    {"key": "ENG", "name": "Engineering", "color": "#C1121F"},
    {"key": "IT", "name": "IT Support", "color": "#2563EB"},
    {"key": "HR", "name": "People & HR", "color": "#DB2777"},
    {"key": "FIN", "name": "Finance", "color": "#059669"},
    {"key": "OPS", "name": "Facilities & Ops", "color": "#D97706"},
]

CODE_TTL_MINUTES = 15
CODE_MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 45
RESET_TTL_MINUTES = 30

# One shared bucket for every auth endpoint: 30 attempts per 15 minutes per IP.
auth_limiter = Depends(rate_limit("auth", 30, 15 * 60))

DEMO_DATA = Path(__file__).resolve().parents[2] / "db" / "demo-data.json"


@lru_cache
def _template() -> dict[str, Any]:
    """Onboarding checklist, public holidays and metric names from the demo seed (the Annex workspace)."""
    data = json.loads(DEMO_DATA.read_text(encoding="utf-8"))
    return data["workspaces"]["ws-annex"]


def _strip(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def _lower(v: Any) -> Any:
    return v.strip().lower() if isinstance(v, str) else v


Trimmed = Annotated[str, BeforeValidator(_strip)]
Email = Annotated[EmailStr, BeforeValidator(_lower)]


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


# ── Session helpers ─────────────────────────────────────────────────
def session_payload(ctx: AuthContext) -> dict[str, Any]:
    """The session shape returned to the frontend."""
    employee = query_one("SELECT * FROM employees WHERE id = $1", [ctx.employeeId])
    workspace = get_workspace(ctx.workspaceId)
    if not employee or not workspace:
        raise unauthorized("Account no longer exists")
    return {"user": to_employee(employee), "role": ctx.role, "workspace": workspace, "demo": bool(ctx.demo), "demoEnabled": settings.ENABLE_DEMO_LOGIN}


def start_session(ctx: AuthContext, status_code: int = 200) -> JSONResponse:
    payload = session_payload(ctx)
    try:
        query("UPDATE users SET last_login_at = now() WHERE id = $1", [ctx.userId])
    except Exception:  # noqa: BLE001 — bookkeeping only
        pass
    res = JSONResponse(jsonable_encoder(payload), status_code=status_code)
    set_session_cookie(res, sign_session(ctx))
    return res


def persona_for(workspace_id: str, role: str, db=None) -> dict[str, Any]:
    """Picks the demo persona for a role (mirrors personaFor in the frontend)."""
    target = "company_admin" if role == "super_admin" else role
    row = query_one(
        """SELECT u.id AS user_id, e.id AS employee_id
             FROM employees e JOIN users u ON u.employee_id = e.id
            WHERE e.workspace_id = $1
            ORDER BY (e.role = 'employee' AND e.status = 'Onboarding' AND $2 = 'employee') DESC,
                     (e.role = $2) DESC,
                     (e.role = 'employee') DESC,
                     e.employee_no
            LIMIT 1""",
        [workspace_id, target],
        db,
    )
    if not row:
        raise not_found("Demo persona")
    return row


def workspace_by_slug(slug: str, db=None) -> dict[str, Any] | None:
    return query_one("SELECT id, name FROM workspaces WHERE slug = $1", [slug.lower().strip()], db)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _code_hash(code: str) -> str:
    return _sha256(code + settings.JWT_SECRET)


def _new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


# ── Register a company workspace (email-verified) ───────────────────
class RegisterBody(BaseModel):
    companyName: Trimmed = Field(min_length=2, max_length=80)
    industry: Trimmed = Field(min_length=2)
    country: Trimmed = Field(min_length=2)
    size: Trimmed = Field(min_length=1)
    adminName: Trimmed | None = Field(default=None, min_length=2, max_length=80)
    email: Email
    password: str = Field(min_length=8, max_length=128)
    slug: Annotated[str, BeforeValidator(_lower)] | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,40}$")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    return s[:40] or "workspace"


def _taken(slug: str) -> HttpError:
    return conflict(f"{slug}.annexhr.com is already taken — choose another workspace name")


def _create_workspace(db, p: dict[str, Any]) -> AuthContext:
    """Creates the workspace, its admin and sensible defaults from a verified registration payload."""
    slug = p["slug"]
    template = _template()
    ws = query_one(
        """INSERT INTO workspaces (slug, name, industry, country, size, domain, logo_text, plan, founded)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Starter', $8) RETURNING id""",
        [slug, p["companyName"], p["industry"], p["country"], p["size"], f"{slug}.annexhr.com", p["companyName"][0].upper(), _now().year],
        db,
    )
    W = ws["id"]  # type: ignore[index]
    people = query_one("INSERT INTO departments (workspace_id, name, color) VALUES ($1, 'People & Culture', '#C1121F') RETURNING id", [W], db)
    emp = query_one(
        """INSERT INTO employees (workspace_id, employee_no, name, email, title, department_id, role, employment_type, status, start_date, onboarding_progress)
           VALUES ($1, $2, $3, $4, 'HR Administrator', $5, 'company_admin', 'Full-time', 'Active', current_date, 100) RETURNING id""",
        [W, f"{slug[:3].upper()}-1001", p["adminName"], p["email"], people["id"]],  # type: ignore[index]
        db,
    )
    query("UPDATE departments SET head_id = $1 WHERE id = $2", [emp["id"], people["id"]], db)  # type: ignore[index]
    user = query_one(
        "INSERT INTO users (workspace_id, employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4, 'company_admin') RETURNING id",
        [W, emp["id"], p["email"], p["passwordHash"]],  # type: ignore[index]
        db,
    )

    # Sensible defaults: the standard Kenyan onboarding checklist and the country's public holidays.
    insert_many(db, "onboarding_tasks", [{"workspace_id": W, **t, "position": i} for i, t in enumerate(template["onboardingTasks"])])
    insert_many(db, "holidays", [{"workspace_id": W, **h} for h in template["holidays"] if h["country"] == p["country"]])
    insert_many(db, "ticket_teams", [{"workspace_id": W, "key": t["key"], "name": t["name"], "color": t["color"], "position": i} for i, t in enumerate(DEFAULT_TICKET_TEAMS)])
    insert_many(db, "metric_series", [{"workspace_id": W, "metric": m, "data": "[]"} for m in template["trends"]])
    query(
        "INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1, 'system', $2, 'Next: add departments and invite your team.', '/app/people?invite=1')",
        [W, f"Welcome to Annex HR — {p['companyName']} is ready"],
        db,
    )
    return AuthContext(userId=user["id"], employeeId=emp["id"], workspaceId=W, role="company_admin")  # type: ignore[index]


def _send_code(email: str, code: str, company: str) -> None:
    send_email(templates.verification_code(email, code, company, CODE_TTL_MINUTES))


@router.post("/auth/register/start", dependencies=[auth_limiter])
def register_start(body: dict = Body(default={})):
    b: RegisterBody = parse(RegisterBody, body)
    domain = b.email.split("@")[1]
    if domain in PERSONAL_DOMAINS:
        raise bad_request("Please use your work email address")

    slug = b.slug or slugify(b.companyName)
    if workspace_by_slug(slug):
        raise _taken(slug)

    admin_name = b.adminName or " ".join(p[:1].upper() + p[1:] for p in re.split(r"[._-]", b.email.split("@")[0]) if p)
    # The pending registration keeps only the password hash, never the password itself.
    payload = {
        "companyName": b.companyName,
        "industry": b.industry,
        "country": b.country,
        "size": b.size,
        "adminName": admin_name,
        "email": b.email,
        "slug": slug,
        "passwordHash": hash_password(b.password, 12),
    }
    code = _new_code()
    row = query_one(
        f"INSERT INTO email_verifications (email, code_hash, payload, expires_at, last_sent_at) VALUES ($1, $2, $3, now() + interval '{CODE_TTL_MINUTES} minutes', now()) RETURNING id",
        [b.email, _code_hash(code), payload],
    )
    vid = row["id"]  # type: ignore[index]
    try:
        _send_code(b.email, code, b.companyName)
    except Exception:
        query("DELETE FROM email_verifications WHERE id = $1", [vid])
        raise
    return JSONResponse({"verificationId": vid, "email": b.email, "expiresInMinutes": CODE_TTL_MINUTES}, status_code=201)


class VerifyBody(BaseModel):
    verificationId: str = Field(min_length=1)
    code: Annotated[str, BeforeValidator(_strip)] = Field(pattern=r"^\d{6}$")


@router.post("/auth/register/verify", dependencies=[auth_limiter])
def register_verify(request: Request, body: dict = Body(default={})):
    b: VerifyBody = parse(VerifyBody, body)
    error: HttpError | None = None
    ctx: AuthContext | None = None
    slug = ""

    # Failed attempts must be committed, so errors are raised only after the transaction ends.
    with tx() as db:
        v = query_one("SELECT * FROM email_verifications WHERE id = $1 FOR UPDATE", [b.verificationId], db)
        if not v or v["consumed_at"]:
            error = bad_request("This sign-up link is no longer valid — please start again")
        elif v["attempts"] >= CODE_MAX_ATTEMPTS:
            error = HttpError(429, "Too many incorrect attempts — request a new code")
        elif v["expires_at"] < _now():
            error = bad_request("Code expired — request a new one")
        elif not hmac.compare_digest(v["code_hash"], _code_hash(b.code)):
            attempts = v["attempts"] + 1
            query("UPDATE email_verifications SET attempts = $1 WHERE id = $2", [attempts, v["id"]], db)
            left = CODE_MAX_ATTEMPTS - attempts
            error = (
                bad_request(f"Incorrect code — {left} attempt{'s' if left != 1 else ''} left")
                if left > 0
                else HttpError(429, "Too many incorrect attempts — request a new code")
            )
        else:
            p = v["payload"]
            slug = p["slug"]
            # The name may have been claimed while the code was in the inbox.
            if workspace_by_slug(slug, db):
                raise _taken(slug)
            ctx = _create_workspace(db, p)
            query("UPDATE email_verifications SET consumed_at = now() WHERE id = $1", [v["id"]], db)

    if error or not ctx:
        raise error or bad_request("Verification failed")
    request.state.auth = ctx
    audit(request, ctx, "workspace.created", "workspace", ctx.workspaceId, {"slug": slug})
    return start_session(ctx, 201)


class ResendBody(BaseModel):
    verificationId: str = Field(min_length=1)


@router.post("/auth/register/resend", dependencies=[auth_limiter])
def register_resend(body: dict = Body(default={})):
    b: ResendBody = parse(ResendBody, body)
    v = query_one(
        "SELECT id, email, payload, consumed_at, EXTRACT(EPOCH FROM (now() - last_sent_at))::float AS since FROM email_verifications WHERE id = $1",
        [b.verificationId],
    )
    if not v or v["consumed_at"]:
        raise bad_request("This sign-up link is no longer valid — please start again")
    if v["since"] < RESEND_COOLDOWN_SECONDS:
        wait = int(RESEND_COOLDOWN_SECONDS - v["since"]) + 1
        raise HttpError(429, f"Please wait {wait} s before requesting another code")

    code = _new_code()
    # A fresh code restarts the expiry and the attempt counter.
    query(
        f"UPDATE email_verifications SET code_hash = $1, attempts = 0, last_sent_at = now(), expires_at = now() + interval '{CODE_TTL_MINUTES} minutes' WHERE id = $2",
        [_code_hash(code), v["id"]],
    )
    _send_code(v["email"], code, v["payload"]["companyName"])
    return {"verificationId": v["id"], "email": v["email"], "expiresInMinutes": CODE_TTL_MINUTES}


# ── Login ───────────────────────────────────────────────────────────
class LoginBody(BaseModel):
    workspace: Trimmed = Field(min_length=1)
    email: Email
    password: str = Field(min_length=1)


@router.post("/auth/login", dependencies=[auth_limiter])
def login(request: Request, body: dict = Body(default={})):
    b: LoginBody = parse(LoginBody, body)
    ws = workspace_by_slug(b.workspace)
    if not ws:
        raise HttpError(404, f"No workspace found at {b.workspace}.annexhr.com")

    # Accounts are scoped to their workspace: employees can only sign in to their own organisation.
    user = query_one("SELECT id, employee_id, role, password_hash FROM users WHERE workspace_id = $1 AND email = $2", [ws["id"], b.email])
    ok = verify_password(b.password, user["password_hash"]) if user else verify_password(b.password, DUMMY_HASH)
    if not user or not ok:
        raise unauthorized("Incorrect email or password")

    ctx = AuthContext(userId=user["id"], employeeId=user["employee_id"], workspaceId=ws["id"], role=user["role"])
    request.state.auth = ctx
    audit(request, ctx, "auth.login", "user", user["id"])
    return start_session(ctx)


# ── Demo sign-in & "View as" (only when ENABLE_DEMO_LOGIN=true) ─────
def require_demo() -> None:
    if not settings.ENABLE_DEMO_LOGIN:
        raise forbidden("Demo sign-in is disabled")


class DemoBody(BaseModel):
    workspace: Trimmed = Field(min_length=1)
    role: RoleName


@router.post("/auth/demo", dependencies=[auth_limiter])
def demo(body: dict = Body(default={})):
    require_demo()
    b: DemoBody = parse(DemoBody, body)
    ws = query_one("SELECT id FROM workspaces WHERE slug = $1 OR id = $1", [b.workspace])
    if not ws:
        raise not_found("Workspace")
    persona = persona_for(ws["id"], b.role)
    return start_session(AuthContext(userId=persona["user_id"], employeeId=persona["employee_id"], workspaceId=ws["id"], role=b.role, demo=True))


class SwitchRoleBody(BaseModel):
    role: RoleName


@router.post("/auth/switch-role")
def switch_role(body: dict = Body(default={}), auth: AuthContext = Depends(require_auth)):
    require_demo()
    b: SwitchRoleBody = parse(SwitchRoleBody, body)
    persona = persona_for(auth.workspaceId, b.role)
    return start_session(AuthContext(userId=persona["user_id"], employeeId=persona["employee_id"], workspaceId=auth.workspaceId, role=b.role, demo=True))


class SwitchWorkspaceBody(BaseModel):
    workspaceId: str = Field(min_length=1)


@router.post("/auth/switch-workspace")
def switch_workspace(body: dict = Body(default={}), auth: AuthContext = Depends(require_auth)):
    require_demo()
    b: SwitchWorkspaceBody = parse(SwitchWorkspaceBody, body)
    persona = persona_for(b.workspaceId, auth.role)
    return start_session(AuthContext(userId=persona["user_id"], employeeId=persona["employee_id"], workspaceId=b.workspaceId, role=auth.role, demo=True))


# ── Session ─────────────────────────────────────────────────────────
@router.get("/auth/config")
def config():
    """Public client configuration."""
    return {"demoEnabled": settings.ENABLE_DEMO_LOGIN}


@router.get("/auth/me")
def me(auth: AuthContext = Depends(require_auth)):
    return session_payload(auth)


@router.post("/auth/logout")
def logout():
    res = Response(status_code=204)
    clear_session_cookie(res)
    return res


# ── Password reset ──────────────────────────────────────────────────
class ForgotBody(BaseModel):
    workspace: str = Field(min_length=1)
    email: Email


@router.post("/auth/forgot-password", dependencies=[auth_limiter])
def forgot_password(body: dict = Body(default={})):
    b: ForgotBody = parse(ForgotBody, body)
    # Always succeed so the endpoint can't be used to discover accounts.
    user = query_one(
        """SELECT u.id, u.email, e.name FROM users u JOIN workspaces w ON w.id = u.workspace_id JOIN employees e ON e.id = u.employee_id
            WHERE w.slug = $1 AND u.email = $2""",
        [b.workspace.lower().strip(), b.email],
    )
    if user:
        token = secrets.token_urlsafe(32)
        query(
            f"INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '{RESET_TTL_MINUTES} minutes')",
            [user["id"], _sha256(token)],
        )
        send_email(templates.password_reset(user["email"], user["name"], token, RESET_TTL_MINUTES), required=False)
    return {"ok": True}


class ResetBody(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=128)


@router.post("/auth/reset-password", dependencies=[auth_limiter])
def reset_password(request: Request, body: dict = Body(default={})):
    b: ResetBody = parse(ResetBody, body)
    password_hash = hash_password(b.password, 12)
    with tx() as db:
        r = query_one(
            """SELECT r.id, u.id AS user_id, u.employee_id, u.workspace_id, u.role
                 FROM password_resets r JOIN users u ON u.id = r.user_id
                WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
                FOR UPDATE OF r""",
            [_sha256(b.token)],
            db,
        )
        if not r:
            raise bad_request("This reset link is invalid or has expired")
        query("UPDATE users SET password_hash = $1 WHERE id = $2", [password_hash, r["user_id"]], db)
        # Using one link invalidates every other outstanding link for the account.
        query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [r["user_id"]], db)
    ctx = AuthContext(userId=r["user_id"], employeeId=r["employee_id"], workspaceId=r["workspace_id"], role=r["role"])
    audit(request, ctx, "auth.password_reset", "user", r["user_id"])
    return {"ok": True}


# ── Invitations ─────────────────────────────────────────────────────
class InviteItem(BaseModel):
    email: Email
    role: RoleName = "employee"
    departmentId: str | None = None


class InviteBody(BaseModel):
    invites: list[InviteItem] = Field(min_length=1, max_length=100)


@router.post("/invitations")
def create_invitations(request: Request, body: dict = Body(default={}), auth: AuthContext = Depends(require_auth)):
    if auth.role not in ("super_admin", "company_admin", "hr_officer"):
        raise forbidden()
    b: InviteBody = parse(InviteBody, body)
    rows = [
        {
            "workspace_id": auth.workspaceId,
            "email": i.email,
            "role": i.role,
            "department_id": i.departmentId,
            "token": secrets.token_urlsafe(24),
            "invited_by": auth.employeeId,
        }
        for i in b.invites
    ]
    with tx() as db:
        insert_many(db, "invitations", rows)
    audit(request, auth, "invitations.sent", "invitation", None, {"count": len(rows)})

    ctx = query_one(
        "SELECT w.name AS company, e.name AS inviter FROM workspaces w LEFT JOIN employees e ON e.id = $2 WHERE w.id = $1",
        [auth.workspaceId, auth.employeeId],
    ) or {"company": "your company", "inviter": None}
    emailed = 0
    for r in rows:
        if send_email(templates.invitation(r["email"], ctx["inviter"], ctx["company"], r["token"]), required=False) != "failed":
            emailed += 1
    return JSONResponse(
        {
            "sent": len(rows),
            "emailed": emailed,
            "invitations": [{"email": r["email"], "role": r["role"], "token": r["token"], "link": f"/invite/{r['token']}"} for r in rows],
        },
        status_code=201,
    )


@router.get("/invitations")
def list_invitations(auth: AuthContext = Depends(require_auth)):
    rows = query("SELECT id, email, role, status, expires_at, created_at FROM invitations WHERE workspace_id = $1 ORDER BY created_at DESC", [auth.workspaceId])
    return [{**r, "expires_at": iso(r["expires_at"]), "created_at": iso(r["created_at"])} for r in rows]


def find_invitation(token: str) -> dict[str, Any]:
    inv = query_one(
        """SELECT i.*, w.name AS workspace_name, w.slug, w.domain, w.logo_text, w.industry, w.country, e.name AS inviter_name
             FROM invitations i JOIN workspaces w ON w.id = i.workspace_id LEFT JOIN employees e ON e.id = i.invited_by
            WHERE i.token = $1""",
        [token],
    )
    if not inv:
        raise not_found("Invitation")
    if inv["status"] != "Pending":
        raise bad_request(f"This invitation has already been {inv['status'].lower()}")
    if inv["expires_at"] < _now():
        raise bad_request("This invitation has expired — ask HR to resend it")
    return inv


@router.get("/invitations/{token}")
def get_invitation(token: str):
    inv = find_invitation(token)
    return {
        "email": inv["email"],
        "role": inv["role"],
        "workspace": {"name": inv["workspace_name"], "slug": inv["slug"], "domain": inv["domain"], "logoText": inv["logo_text"], "industry": inv["industry"], "country": inv["country"]},
        "invitedBy": inv["inviter_name"],
    }


class AcceptBody(BaseModel):
    name: Trimmed = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    phone: Trimmed | None = Field(default=None, max_length=30)
    birthday: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@router.post("/invitations/{token}/accept", dependencies=[auth_limiter])
def accept_invitation(token: str, body: dict = Body(default={})):
    b: AcceptBody = parse(AcceptBody, body)
    inv = find_invitation(token)
    password_hash = hash_password(b.password, 12)

    with tx() as db:
        count = query_one("SELECT count(*)::int AS count FROM employees WHERE workspace_id = $1", [inv["workspace_id"]], db)["count"]  # type: ignore[index]
        emp = query_one(
            """INSERT INTO employees (workspace_id, employee_no, name, email, phone, birthday, title, department_id, role, employment_type, status, start_date, probation_end, onboarding_progress)
               VALUES ($1, $2, $3, $4, $5, $6, 'New starter', $7, $8, $9, 'Onboarding', current_date, current_date + 90, 10) RETURNING id""",
            [
                inv["workspace_id"],
                f"{str(inv['slug'])[:3].upper()}-{1001 + count}",
                b.name,
                inv["email"],
                b.phone,
                b.birthday,
                inv["department_id"],
                inv["role"],
                "Consultant" if inv["role"] == "consultant" else "Full-time",
            ],
            db,
        )
        user = query_one(
            "INSERT INTO users (workspace_id, employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [inv["workspace_id"], emp["id"], inv["email"], password_hash, inv["role"]],  # type: ignore[index]
            db,
        )
        query("UPDATE invitations SET status = 'Accepted', accepted_at = now() WHERE id = $1", [inv["id"]], db)
        query(
            "INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1, 'system', $2, 'Onboarding checklist assigned automatically.', '/app/onboarding?tab=overview')",
            [inv["workspace_id"], f"{b.name} joined the workspace"],
            db,
        )
    ctx = AuthContext(userId=user["id"], employeeId=emp["id"], workspaceId=inv["workspace_id"], role=inv["role"])  # type: ignore[index]
    return start_session(ctx, 201)
