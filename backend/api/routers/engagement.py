"""Pulse surveys, KPIs, notifications and the audit log."""

import datetime as dt
import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, parse
from ..repository import NOTIFICATION_SELECT, owned, to_notification, to_survey
from ..roles import ADMIN, EXEC, is_exec
from ..security import AuthContext, require_auth, require_role

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


# ── Pulse surveys ───────────────────────────────────────────────────
@router.get("/surveys")
def list_surveys(auth: AuthContext = Depends(require_auth)):
    return [to_survey(s) for s in query("SELECT * FROM surveys WHERE workspace_id = $1 ORDER BY position", [auth.workspaceId])]


class Question(Strict):
    id: str
    type: Literal["emoji", "nps", "choice", "text"]
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3)]
    options: list[str] | None = None


class SurveyBody(Strict):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3)]
    anonymous: bool = True
    closes: Annotated[str, Field(pattern=ISO_DATE)]
    publish: bool = False
    questions: Annotated[list[Question], Field(min_length=1, max_length=30)]


@router.post("/surveys")
def create_survey(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(SurveyBody, body)
    n = query_one("SELECT count(*)::int AS n FROM employees WHERE workspace_id = $1 AND status <> 'Exited'", [auth.workspaceId])["n"]
    row = query_one(
        "INSERT INTO surveys (workspace_id, title, status, audience, closes, anonymous, questions, position) VALUES ($1,$2,$3,$4,$5,$6,$7,-1) RETURNING *",
        [auth.workspaceId, b.title, "Live" if b.publish else "Draft", n, b.closes, b.anonymous, json.dumps([q.model_dump(exclude_none=True) for q in b.questions])],
    )
    audit(request, auth, "survey.created", "survey", row["id"])
    return JSONResponse(to_survey(row), status_code=201)


class ResponseBody(Strict):
    answers: dict[str, str | int | float]


@router.post("/surveys/{id}/responses")
def respond_to_survey(id: str, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ResponseBody, body)
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Live":
        raise bad_request("This survey is not accepting responses")
    emp = query_one("SELECT department_id FROM employees WHERE id = $1", [auth.employeeId])
    # Anonymous surveys never store who answered — only the department, for aggregate comparisons.
    query(
        "INSERT INTO survey_responses (survey_id, employee_id, department_id, answers) VALUES ($1,$2,$3,$4)",
        [s["id"], None if s["anonymous"] else auth.employeeId, emp["department_id"] if emp else None, json.dumps(b.answers)],
    )
    query("UPDATE surveys SET responses = responses + 1 WHERE id = $1", [s["id"]])
    return JSONResponse({"ok": True}, status_code=201)


# ── KPIs ────────────────────────────────────────────────────────────
@router.get("/kpis")
def list_kpis(auth: AuthContext = Depends(require_auth)):
    rows = query("SELECT * FROM kpis WHERE workspace_id = $1 ORDER BY position", [auth.workspaceId])
    return [{k: r[k] for k in ("id", "perspective", "name", "target", "actual", "unit", "weight", "owner")} for r in rows]


class KpiPatch(Strict):
    actual: float | None = None
    target: float | None = None


def _plain(row: dict[str, Any]) -> dict[str, Any]:
    return {k: iso(v) if isinstance(v, dt.datetime) else v for k, v in row.items()}


@router.patch("/kpis/{id}")
def patch_kpi(id: str, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*EXEC, "manager"))):
    b = parse(KpiPatch, body)
    owned("kpis", id, auth.workspaceId, "KPI")
    k = query_one("UPDATE kpis SET actual = COALESCE($2, actual), target = COALESCE($3, target) WHERE id = $1 RETURNING *", [id, b.actual, b.target])
    return _plain(k)


# ── Notifications ───────────────────────────────────────────────────
@router.get("/notifications")
def list_notifications(auth: AuthContext = Depends(require_auth)):
    rows = query(f"{NOTIFICATION_SELECT} LIMIT 100", [auth.workspaceId, auth.employeeId, is_exec(auth.role)])
    return [to_notification(n) for n in rows]


def _visible_ids(auth: AuthContext, only: str | None = None) -> list[dict]:
    extra = "AND v.id = $4" if only else ""
    params = [auth.workspaceId, auth.employeeId, is_exec(auth.role)] + ([only] if only else [])
    return query(f"SELECT v.id FROM ({NOTIFICATION_SELECT}) v WHERE NOT v.read {extra}", params)


@router.post("/notifications/read-all")
def read_all_notifications(auth: AuthContext = Depends(require_auth)):
    with tx() as db:
        # Direct notifications carry their own flag; workspace-wide ones are marked read for this person only.
        query("UPDATE notifications SET read = true WHERE workspace_id = $1 AND recipient_id = $2 AND NOT read", [auth.workspaceId, auth.employeeId], db)
        query(
            f"""INSERT INTO notification_reads (notification_id, employee_id)
                SELECT v.id, $2 FROM ({NOTIFICATION_SELECT}) v JOIN notifications n ON n.id = v.id
                 WHERE n.recipient_id IS NULL AND NOT v.read
                ON CONFLICT DO NOTHING""",
            [auth.workspaceId, auth.employeeId, is_exec(auth.role)],
            db,
        )
    return Response(status_code=204)


@router.post("/notifications/{id}/read")
def read_notification(id: str, auth: AuthContext = Depends(require_auth)):
    n = query_one("SELECT recipient_id FROM notifications WHERE id = $1 AND workspace_id = $2", [id, auth.workspaceId])
    if not n:
        return Response(status_code=204)
    if n["recipient_id"] == auth.employeeId:
        query("UPDATE notifications SET read = true WHERE id = $1", [id])
    elif n["recipient_id"] is None and _visible_ids(auth, id):
        query("INSERT INTO notification_reads (notification_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, auth.employeeId])
    return Response(status_code=204)


# ── Audit logs ──────────────────────────────────────────────────────
@router.get("/audit-logs")
def list_audit_logs(auth: AuthContext = Depends(require_role(*ADMIN))):
    rows = query(
        """SELECT a.id, a.action, a.entity, a.entity_id, a.ip_address, a.details, a.created_at, e.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN employees e ON e.id = u.employee_id
      WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT 200""",
        [auth.workspaceId],
    )
    return [
        {"id": r["id"], "action": r["action"], "entity": r["entity"], "entityId": r["entity_id"], "ip": r["ip_address"], "details": r["details"], "at": iso(r["created_at"]), "user": r["user_name"] or "System"}
        for r in rows
    ]
