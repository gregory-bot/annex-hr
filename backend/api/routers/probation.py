"""Probation tracking: confirm, extend and schedule reviews (HR admins and the employee's manager)."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..email.service import send_email
from ..email.templates_engagement import probation_update
from ..errors import bad_request, conflict, forbidden, not_found, parse
from ..roles import is_admin, is_exec
from ..security import AuthContext, require_auth

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


EMP_COLS = "e.id, e.name, e.title, e.email, e.department_id, e.manager_id, e.status, e.start_date, e.probation_end, e.workspace_id"


def _out(e: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    mine = [x for x in events if x["employee_id"] == e["id"]]
    review = next((x for x in mine if x["kind"] == "review_scheduled"), None)
    confirmed = next((x for x in mine if x["kind"] == "confirmed"), None)
    return {
        "employeeId": e["id"],
        "name": e["name"],
        "title": e["title"],
        "departmentId": e["department_id"],
        "managerId": e["manager_id"],
        "status": e["status"],
        "startDate": e["start_date"],
        "probationEnd": e["probation_end"],
        "confirmed": confirmed is not None,
        "confirmedOn": confirmed["date"] if confirmed else None,
        "reviewDate": review["date"] if review else None,
        "extendedDays": sum(x["days"] or 0 for x in mine if x["kind"] == "extended"),
        "history": [
            {"kind": x["kind"], "date": x["date"], "days": x["days"], "reason": x["reason"], "by": x["by_name"], "at": iso(x["created_at"])} for x in mine
        ],
    }


def _events(ws: str, ids: list[str], db=None) -> list[dict[str, Any]]:
    if not ids:
        return []
    return query(
        """SELECT p.*, b.name AS by_name FROM probation_events p LEFT JOIN employees b ON b.id = p.by_id
            WHERE p.workspace_id = $1 AND p.employee_id = ANY($2::text[]) ORDER BY p.created_at DESC""",
        [ws, ids],
        db,
    )


@router.get("/probation")
def list_probation(auth: AuthContext = Depends(require_auth)):
    """Everyone with a probation end date: all for HR/executives, direct reports for managers, yourself otherwise."""
    scope = "all" if is_exec(auth.role) else "team" if auth.role == "manager" else "self"
    rows = query(
        f"""SELECT {EMP_COLS} FROM employees e
             WHERE e.workspace_id = $1 AND e.probation_end IS NOT NULL AND e.status <> 'Exited'
               AND ($2 = 'all' OR e.id = $3 OR ($2 = 'team' AND e.manager_id = $3))
             ORDER BY e.probation_end""",
        [auth.workspaceId, scope, auth.employeeId],
    )
    events = _events(auth.workspaceId, [r["id"] for r in rows])
    return [_out(r, events) for r in rows]


def _target(auth: AuthContext, employee_id: str, db) -> dict[str, Any]:
    e = query_one(f"SELECT {EMP_COLS} FROM employees e WHERE e.id = $1 AND e.workspace_id = $2", [employee_id, auth.workspaceId], db)
    if not e:
        raise not_found("Employee")
    # HR admins and the employee's own manager only — never the employee themselves.
    if e["id"] == auth.employeeId or not (is_admin(auth.role) or e["manager_id"] == auth.employeeId):
        raise forbidden("Only HR or the employee's manager can manage probation")
    if not e["probation_end"]:
        raise bad_request("This employee has no probation period on record")
    return e


def _open(db, e: dict[str, Any]) -> None:
    if query_one("SELECT 1 FROM probation_events WHERE employee_id = $1 AND kind = 'confirmed'", [e["id"]], db):
        raise conflict(f"{e['name']} has already been confirmed")


def _notify_people(db, auth: AuthContext, e: dict[str, Any], title: str, body: str, include_employee: bool) -> None:
    href = "/app/onboarding?tab=probation"
    recipients = {e["manager_id"]} - {None, auth.employeeId}
    if include_employee:
        recipients.add(e["id"])
    for r in recipients:
        query("INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1,$2,'probation',$3,$4,$5)", [auth.workspaceId, r, title, body, href], db)
    # HR sees every probation change.
    query("INSERT INTO notifications (workspace_id, type, title, body, href, audience) VALUES ($1,'probation',$2,$3,$4,'admins')", [auth.workspaceId, title, body, href], db)


def _result(auth: AuthContext, employee_id: str, db) -> dict[str, Any]:
    e = query_one(f"SELECT {EMP_COLS} FROM employees e WHERE e.id = $1", [employee_id], db)
    return _out(e, _events(auth.workspaceId, [employee_id], db))


def _company(db, ws: str) -> str:
    return query_one("SELECT name FROM workspaces WHERE id = $1", [ws], db)["name"]


@router.post("/probation/{employeeId}/confirm")
def confirm_probation(employeeId: str, request: Request, auth: AuthContext = Depends(require_auth)):
    with tx() as db:
        e = _target(auth, employeeId, db)
        _open(db, e)
        query("UPDATE employees SET status = 'Active', updated_at = now() WHERE id = $1 AND status IN ('Probation', 'Onboarding')", [employeeId], db)
        query("INSERT INTO probation_events (workspace_id, employee_id, kind, date, by_id) VALUES ($1,$2,'confirmed',current_date,$3)", [auth.workspaceId, employeeId, auth.employeeId], db)
        _notify_people(db, auth, e, f"{e['name']} confirmed in role", "Probation completed — employment confirmed.", include_employee=True)
        audit(request, auth, "probation.confirmed", "employee", employeeId, {"probationEnd": e["probation_end"]}, db)
        out = _result(auth, employeeId, db)
        company = _company(db, auth.workspaceId)
    if e["email"]:
        send_email(probation_update(e["email"], e["name"], company, "Your employment is confirmed", "congratulations — you've completed your probation and your employment is now confirmed."), required=False)
    return out


class ExtendBody(Strict):
    days: Annotated[int, Field(ge=1, le=90)]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=500)]


@router.post("/probation/{employeeId}/extend")
def extend_probation(employeeId: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ExtendBody, body)
    with tx() as db:
        e = _target(auth, employeeId, db)
        _open(db, e)
        # The Employment Act caps probation (including extensions) at 12 months.
        new_end = dt.date.fromisoformat(str(e["probation_end"])) + dt.timedelta(days=b.days)
        start = dt.date.fromisoformat(str(e["start_date"])) if e.get("start_date") else None
        if start and (new_end - start).days > 366:
            raise bad_request("Probation can't exceed 12 months in total under the Employment Act")
        query("UPDATE employees SET probation_end = $2, updated_at = now() WHERE id = $1", [employeeId, new_end.isoformat()], db)
        query(
            "INSERT INTO probation_events (workspace_id, employee_id, kind, date, days, reason, by_id) VALUES ($1,$2,'extended',$3,$4,$5,$6)",
            [auth.workspaceId, employeeId, new_end.isoformat(), b.days, b.reason, auth.employeeId],
            db,
        )
        _notify_people(db, auth, e, f"Probation extended for {e['name']}", f"Extended by {b.days} days to {new_end.isoformat()}.", include_employee=True)
        audit(request, auth, "probation.extended", "employee", employeeId, {"days": b.days, "from": e["probation_end"], "to": new_end.isoformat()}, db)
        out = _result(auth, employeeId, db)
        company = _company(db, auth.workspaceId)
    if e["email"]:
        send_email(
            probation_update(e["email"], e["name"], company, "Your probation has been extended", f"your probation has been extended by {b.days} days to {new_end.isoformat()}. Reason: {b.reason}"),
            required=False,
        )
    return out


class ReviewBody(Strict):
    date: Annotated[str, Field(pattern=ISO_DATE)]


@router.post("/probation/{employeeId}/schedule-review")
def schedule_review(employeeId: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ReviewBody, body)
    if b.date < dt.date.today().isoformat():
        raise bad_request("Pick a review date from today onwards")
    with tx() as db:
        e = _target(auth, employeeId, db)
        query(
            "INSERT INTO probation_events (workspace_id, employee_id, kind, date, by_id) VALUES ($1,$2,'review_scheduled',$3,$4)",
            [auth.workspaceId, employeeId, b.date, auth.employeeId],
            db,
        )
        _notify_people(db, auth, e, f"Probation review for {e['name']} on {b.date}", "Prepare the appraisal and share feedback before the meeting.", include_employee=False)
        audit(request, auth, "probation.review_scheduled", "employee", employeeId, {"date": b.date}, db)
        out = _result(auth, employeeId, db)
    return out
