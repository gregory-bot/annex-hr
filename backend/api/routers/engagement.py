"""Pulse surveys, KPIs, notifications and the audit log."""

import datetime as dt
import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, conflict, forbidden, parse
from ..repository import NOTIFICATION_SELECT, owned, to_notification, to_survey
from ..roles import ADMIN, EXEC, LEADERS, is_admin, is_exec
from ..security import AuthContext, require_auth, require_role
from ..survey_results import compute, headline

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


# ── Pulse surveys ───────────────────────────────────────────────────
def _survey_out(s: dict[str, Any], responded: bool = False, full: bool = True) -> dict[str, Any]:
    out = {
        **to_survey(s),
        "departments": list(s.get("audience_departments") or []),
        "respondedByMe": responded,
        "createdAt": iso(s.get("created_at")) or None,
        "publishedAt": iso(s.get("published_at")) or None,
    }
    if full:
        out["questions"] = [_question_out(q) for q in s.get("questions") or []]
    return out


def _question_out(q: dict[str, Any]) -> dict[str, Any]:
    out = {"id": q["id"], "type": q["type"], "text": q.get("text") or q.get("prompt") or ""}
    if q.get("options"):
        out["options"] = q["options"]
    return out


def _in_audience(s: dict[str, Any], department_id: str | None) -> bool:
    depts = s.get("audience_departments") or []
    return not depts or department_id in depts


@router.get("/surveys")
def list_surveys(auth: AuthContext = Depends(require_auth)):
    admin = is_admin(auth.role)
    rows = query(
        """SELECT s.*, EXISTS (SELECT 1 FROM survey_participants p WHERE p.survey_id = s.id AND p.employee_id = $2) AS responded,
                  (SELECT department_id FROM employees WHERE id = $2) AS my_department
             FROM surveys s WHERE s.workspace_id = $1 ORDER BY s.position, s.created_at DESC""",
        [auth.workspaceId, auth.employeeId],
    )
    out = []
    for s in rows:
        # Drafts are for the survey builders; everyone else sees surveys addressed to them.
        if not admin and (s["status"] == "Draft" or (s["status"] == "Live" and not _in_audience(s, s["my_department"]))):
            continue
        out.append(_survey_out(s, s["responded"]))
    return out


class Question(Strict):
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    type: Literal["emoji", "nps", "choice", "text"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
    options: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]] | None = None

    @model_validator(mode="before")
    @classmethod
    def _prompt_alias(cls, v: Any) -> Any:
        # Older clients send the question as `prompt`.
        if isinstance(v, dict) and "text" not in v and "prompt" in v:
            v = {**v, "text": v["prompt"]}
            v.pop("prompt", None)
        return v

    @model_validator(mode="after")
    def _choice_needs_options(self) -> "Question":
        if self.type == "choice" and len(self.options or []) < 2:
            raise ValueError("Multiple-choice questions need at least 2 options")
        if self.type != "choice":
            self.options = None
        return self


class SurveyBody(Strict):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
    anonymous: bool = True
    closes: Annotated[str, Field(pattern=ISO_DATE)]
    publish: bool = False
    departments: list[str] = []
    questions: Annotated[list[Question], Field(min_length=1, max_length=30)]


class SurveyPatch(Strict):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)] | None = None
    anonymous: bool | None = None
    closes: Annotated[str, Field(pattern=ISO_DATE)] | None = None
    departments: list[str] | None = None
    questions: Annotated[list[Question], Field(min_length=1, max_length=30)] | None = None


def _check_departments(ws: str, ids: list[str], db=None) -> list[str]:
    ids = sorted(set(ids))
    if ids:
        found = query("SELECT id FROM departments WHERE workspace_id = $1 AND id = ANY($2::text[])", [ws, ids], db)
        if len(found) != len(ids):
            raise bad_request("Validation failed", [{"path": "departments", "message": "Unknown department"}])
    return ids


def _audience_count(ws: str, depts: list[str], db=None) -> int:
    return query_one(
        "SELECT count(*)::int AS n FROM employees WHERE workspace_id = $1 AND status <> 'Exited' AND (cardinality($2::text[]) = 0 OR department_id = ANY($2::text[]))",
        [ws, depts],
        db,
    )["n"]


def _questions_json(qs: list[Question]) -> str:
    ids = [q.id for q in qs]
    if len(set(ids)) != len(ids):
        raise bad_request("Validation failed", [{"path": "questions", "message": "Question ids must be unique"}])
    return json.dumps([q.model_dump(exclude_none=True) for q in qs])


def _announce(db, auth: AuthContext, s: dict[str, Any]) -> None:
    """Tells the audience a survey is open: one broadcast for everyone, or one per person for a department audience."""
    href = f"/app/surveys?tab=take&survey={s['id']}"
    body = "Takes about 2 minutes." + (" Your answers are anonymous." if s["anonymous"] else "")
    title = f"New pulse survey: {s['title']}"
    depts = list(s.get("audience_departments") or [])
    if not depts:
        query("INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1,'system',$2,$3,$4)", [auth.workspaceId, title, body, href], db)
        return
    query(
        """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
           SELECT $1, e.id, 'system', $2, $3, $4 FROM employees e
            WHERE e.workspace_id = $1 AND e.status <> 'Exited' AND e.department_id = ANY($5::text[])""",
        [auth.workspaceId, title, body, href, depts],
        db,
    )


@router.post("/surveys")
def create_survey(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(SurveyBody, body)
    with tx() as db:
        depts = _check_departments(auth.workspaceId, b.departments, db)
        n = _audience_count(auth.workspaceId, depts, db)
        row = query_one(
            """INSERT INTO surveys (workspace_id, title, status, audience, closes, anonymous, questions, position, audience_departments, created_by, published_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,-1,$8,$9, CASE WHEN $3 = 'Live' THEN now() END) RETURNING *""",
            [auth.workspaceId, b.title, "Live" if b.publish else "Draft", n, b.closes, b.anonymous, _questions_json(b.questions), depts, auth.employeeId],
            db,
        )
        if b.publish:
            _announce(db, auth, row)
        audit(request, auth, "survey.published" if b.publish else "survey.created", "survey", row["id"], None, db)
    return JSONResponse(_survey_out(row), status_code=201)


@router.patch("/surveys/{id}")
def patch_survey(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(SurveyPatch, body)
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Draft":
        raise conflict("Only draft surveys can be edited")
    with tx() as db:
        depts = _check_departments(auth.workspaceId, b.departments, db) if b.departments is not None else list(s["audience_departments"] or [])
        row = query_one(
            """UPDATE surveys SET title = COALESCE($2, title), anonymous = COALESCE($3, anonymous), closes = COALESCE($4::date, closes),
                      questions = COALESCE($5::jsonb, questions), audience_departments = $6, audience = $7
                WHERE id = $1 RETURNING *""",
            [id, b.title, b.anonymous, b.closes, _questions_json(b.questions) if b.questions is not None else None, depts, _audience_count(auth.workspaceId, depts, db)],
            db,
        )
        audit(request, auth, "survey.updated", "survey", id, None, db)
    return _survey_out(row)


@router.post("/surveys/{id}/publish")
def publish_survey(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Draft":
        raise conflict("This survey has already been published")
    if not s["questions"]:
        raise bad_request("Add at least one question before publishing")
    if str(s["closes"]) < dt.date.today().isoformat():
        raise bad_request("The closing date is in the past — pick a new one first")
    with tx() as db:
        row = query_one(
            "UPDATE surveys SET status = 'Live', published_at = now(), audience = $2 WHERE id = $1 RETURNING *",
            [id, _audience_count(auth.workspaceId, list(s["audience_departments"] or []), db)],
            db,
        )
        _announce(db, auth, row)
        audit(request, auth, "survey.published", "survey", id, None, db)
    return _survey_out(row)


@router.post("/surveys/{id}/close")
def close_survey(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Live":
        raise conflict("Only live surveys can be closed")
    row = query_one("UPDATE surveys SET status = 'Closed', closed_at = now() WHERE id = $1 RETURNING *", [id])
    audit(request, auth, "survey.closed", "survey", id)
    return _survey_out(row)


@router.delete("/surveys/{id}")
def delete_survey(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Draft":
        raise conflict("Only drafts can be deleted — close a live survey instead")
    query("DELETE FROM surveys WHERE id = $1", [id])
    audit(request, auth, "survey.deleted", "survey", id)
    return Response(status_code=204)


class ResponseBody(Strict):
    answers: dict[str, str | int | float]


def _validate_answers(questions: list[dict[str, Any]], answers: dict[str, Any]) -> dict[str, Any]:
    by_id = {q["id"]: q for q in questions}
    clean: dict[str, Any] = {}
    for qid, v in answers.items():
        q = by_id.get(qid)
        if not q:
            continue  # ignore answers to questions that no longer exist
        t = q["type"]
        ok = (
            (t == "emoji" and isinstance(v, (int, float)) and float(v).is_integer() and 1 <= v <= 5)
            or (t == "nps" and isinstance(v, (int, float)) and float(v).is_integer() and 0 <= v <= 10)
            or (t == "choice" and isinstance(v, str) and v in (q.get("options") or []))
            or (t == "text" and isinstance(v, str) and len(v) <= 2000)
        )
        if not ok:
            raise bad_request("Validation failed", [{"path": f"answers.{qid}", "message": "Invalid answer for this question"}])
        if t == "text":
            if v.strip():
                clean[qid] = v.strip()
        else:
            clean[qid] = int(v) if t in ("emoji", "nps") else v
    if not clean:
        raise bad_request("Answer at least one question")
    return clean


@router.post("/surveys/{id}/responses")
def respond_to_survey(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ResponseBody, body)
    s = owned("surveys", id, auth.workspaceId, "Survey")
    if s["status"] != "Live":
        raise bad_request("This survey is not accepting responses")
    answers = _validate_answers(s["questions"] or [], b.answers)
    with tx() as db:
        emp = query_one("SELECT department_id FROM employees WHERE id = $1", [auth.employeeId], db)
        dept = emp["department_id"] if emp else None
        if not _in_audience(s, dept):
            raise forbidden("This survey isn't addressed to your team")
        # One response per person. Participation is recorded separately from the answers.
        joined = query("INSERT INTO survey_participants (survey_id, employee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING survey_id", [id, auth.employeeId], db)
        if not joined:
            raise conflict("You've already responded to this survey")
        # Anonymous surveys never store who answered — only the department, for aggregate comparisons —
        # and the time is coarsened to the day so it can't be matched against activity logs.
        query(
            "INSERT INTO survey_responses (survey_id, employee_id, department_id, answers, submitted_at) VALUES ($1,$2,$3,$4, CASE WHEN $5 THEN date_trunc('day', now()) ELSE now() END)",
            [id, None if s["anonymous"] else auth.employeeId, dept, json.dumps(answers), s["anonymous"]],
            db,
        )
        rows = query("SELECT answers FROM survey_responses WHERE survey_id = $1", [id], db)
        engagement, enps = headline(s["questions"] or [], [r["answers"] for r in rows])
        query("UPDATE surveys SET responses = $2, engagement = $3, enps = $4 WHERE id = $1", [id, len(rows), engagement, enps], db)
    return JSONResponse({"ok": True}, status_code=201)


@router.get("/surveys/{id}/results")
def survey_results(id: str, auth: AuthContext = Depends(require_role(*LEADERS, "finance"))):
    s = owned("surveys", id, auth.workspaceId, "Survey")
    rows = query("SELECT answers, department_id FROM survey_responses WHERE survey_id = $1", [id])
    depts = {d["id"]: d["name"] for d in query("SELECT id, name FROM departments WHERE workspace_id = $1", [auth.workspaceId])}
    result = compute(s, rows, depts)
    prev = query_one(
        "SELECT title, engagement, enps FROM surveys WHERE workspace_id = $1 AND id <> $2 AND status = 'Closed' AND responses > 0 AND closes < $3::date ORDER BY closes DESC LIMIT 1",
        [auth.workspaceId, id, s["closes"]],
    )
    trend = query(
        "SELECT title, closes, engagement, enps FROM surveys WHERE workspace_id = $1 AND status <> 'Draft' AND responses > 0 ORDER BY closes",
        [auth.workspaceId],
    )
    return {
        **result,
        "survey": _survey_out(s),
        "previous": {"title": prev["title"], "engagement": prev["engagement"], "enps": prev["enps"]} if prev else None,
        "trend": [{"title": t["title"], "closes": t["closes"], "engagement": t["engagement"], "enps": t["enps"]} for t in trend],
    }


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
