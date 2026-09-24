"""Weekly timesheets: upsert while Draft/Rejected, submit, leader decisions and manager reminders."""

from __future__ import annotations

import logging
import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..demo import is_demo_workspace
from ..email.service import send_email
from ..email.templates_time_leave import timesheet_reminder
from ..errors import bad_request, forbidden, parse
from ..repository import owned, to_timesheet
from ..roles import is_leader
from ..security import AuthContext, require_auth

router = APIRouter()
log = logging.getLogger("annex.timesheets")

#: Pending timesheets older than this (since submission) trigger a manager reminder.
REMIND_AFTER_DAYS = 3

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def to_sheet_out(t: dict[str, Any], entries: list[dict[str, Any]] | None) -> dict[str, Any]:
    """The shared timesheet shape plus review details."""
    return {
        **to_timesheet(t, entries),
        "comment": t.get("comment"),
        "submittedAt": iso(t["submitted_at"]) if t.get("submitted_at") else None,
        "decidedAt": iso(t["approved_at"]) if t.get("approved_at") else None,
        "decidedBy": t.get("approved_by"),
        "lastRemindedAt": iso(t["last_reminded_at"]) if t.get("last_reminded_at") else None,
    }


def sheet(sheet_id: str, db=None) -> dict[str, Any]:
    t = query_one("SELECT * FROM timesheets WHERE id = $1", [sheet_id], db)
    entries = query("SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY position", [sheet_id], db)
    return to_sheet_out(t, entries)  # type: ignore[arg-type]


def can_approve(role: str) -> bool:
    return is_leader(role) or role == "finance"


@router.get("/timesheets")
def list_timesheets(request: Request, me: AuthContext = Depends(require_auth)):
    all_ = can_approve(me.role) and request.query_params.get("mine") != "true"
    rows = query(
        """SELECT t.*, COALESCE((SELECT json_agg(e ORDER BY e.position) FROM timesheet_entries e WHERE e.timesheet_id = t.id), '[]') AS entries
       FROM timesheets t WHERE t.workspace_id = $1 AND ($2::text IS NULL OR t.employee_id = $2) ORDER BY t.week_start DESC""",
        [me.workspaceId, None if all_ else me.employeeId],
    )
    return [to_sheet_out(r, r["entries"]) for r in rows]


class Entry(BaseModel):
    model_config = ConfigDict(strict=True)

    project: str = Field(min_length=1)
    billable: bool
    hours: list[float] = Field(min_length=7, max_length=7)

    @field_validator("project", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v

    @field_validator("hours")
    @classmethod
    def _h(cls, v: list[float]) -> list[float]:
        if any(h < 0 or h > 24 for h in v):
            raise ValueError("Hours must be between 0 and 24")
        return v


class WeekIn(BaseModel):
    model_config = ConfigDict(strict=True)

    entries: list[Entry] = Field(max_length=20)
    rate: Optional[float] = Field(default=None, ge=0)


@router.put("/timesheets/week/{week}")
def upsert_week(week: str, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    """Create or replace the caller's timesheet for a week (only while Draft/Rejected)."""
    if not ISO_DATE.match(week):
        raise bad_request("Week must be an ISO date (the Monday)")
    b = parse(WeekIn, body)
    with tx() as db:
        existing = query_one("SELECT * FROM timesheets WHERE employee_id = $1 AND week_start = $2", [me.employeeId, week], db)
        if existing and existing["status"] not in ("Draft", "Rejected"):
            raise bad_request(f"Timesheet is {existing['status'].lower()} and can no longer be edited")
        if existing:
            tid = existing["id"]
            query("UPDATE timesheets SET status = 'Draft' WHERE id = $1", [tid], db)
        else:
            tid = query_one(
                "INSERT INTO timesheets (workspace_id, employee_id, week_start, status, rate_kes) VALUES ($1,$2,$3,'Draft',$4) RETURNING id",
                [me.workspaceId, me.employeeId, week, b.rate if b.rate is not None else 0],
                db,
            )["id"]  # type: ignore[index]
        query("DELETE FROM timesheet_entries WHERE timesheet_id = $1", [tid], db)
        for i, e in enumerate(b.entries):
            query(
                "INSERT INTO timesheet_entries (timesheet_id, project, billable, hours, position) VALUES ($1,$2,$3,$4,$5)",
                [tid, e.project, e.billable, e.hours, i],
                db,
            )
        return sheet(tid, db)


@router.post("/timesheets/{id}/submit")
def submit(id: str, request: Request, me: AuthContext = Depends(require_auth)):
    with tx() as db:
        t = owned("timesheets", id, me.workspaceId, "Timesheet", db)
        if t["employee_id"] != me.employeeId:
            raise forbidden()
        if t["status"] not in ("Draft", "Rejected"):
            raise bad_request("Already submitted")
        hours = query_one("SELECT COALESCE(sum(h), 0) AS total FROM timesheet_entries, unnest(hours) AS h WHERE timesheet_id = $1", [id], db)
        if not hours or float(hours["total"]) <= 0:
            raise bad_request("Log some hours before submitting")
        query("UPDATE timesheets SET status = 'Pending', submitted_at = now(), comment = NULL WHERE id = $1", [t["id"]], db)
        emp = query_one("SELECT name, manager_id FROM employees WHERE id = $1", [me.employeeId], db)
        query(
            "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience) VALUES ($1, $2, 'approval', $3, $4, '/app/timesheets', $5)",
            [
                me.workspaceId,
                emp["manager_id"],  # type: ignore[index]
                f"{emp['name']} submitted a timesheet for the week of {t['week_start']}",  # type: ignore[index]
                "Review the hours and approve or return it.",
                "all" if emp["manager_id"] else "admins",  # type: ignore[index]
            ],
            db,
        )
        audit(request, me, "timesheet.submitted", "timesheet", t["id"], None, db)
        return sheet(t["id"], db)


class DecisionIn(BaseModel):
    model_config = ConfigDict(strict=True)

    decision: Literal["approve", "reject"]
    comment: Optional[str] = Field(default=None, max_length=500)

    @field_validator("comment", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return (v.strip() or None) if isinstance(v, str) else v


@router.post("/timesheets/{id}/decision")
def decide(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    if not can_approve(me.role):
        raise forbidden()
    b = parse(DecisionIn, body)
    with tx() as db:
        t = owned("timesheets", id, me.workspaceId, "Timesheet", db)
        if t["employee_id"] == me.employeeId:
            raise forbidden("You cannot approve your own timesheet")
        if t["status"] != "Pending":
            raise bad_request("Only pending timesheets can be decided")
        status = "Approved" if b.decision == "approve" else "Rejected"
        query(
            "UPDATE timesheets SET status = $2, approved_by = $3, approved_at = now(), comment = $4 WHERE id = $1",
            [t["id"], status, me.employeeId, b.comment],
            db,
        )
        query(
            "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1, $2, 'approval', $3, $4, '/app/timesheets')",
            [
                me.workspaceId,
                t["employee_id"],
                f"Your timesheet for the week of {t['week_start']} was {'approved' if status == 'Approved' else 'returned for changes'}",
                b.comment or ("Approved hours flow to invoicing." if status == "Approved" else "Update the hours and submit again."),
            ],
            db,
        )
        audit(request, me, f"timesheet.{b.decision}", "timesheet", t["id"], {"comment": b.comment} if b.comment else None, db)
        return sheet(t["id"], db)


class RemindIn(BaseModel):
    model_config = ConfigDict(strict=True)

    managerId: Optional[str] = None


@router.post("/timesheets/reminders")
def send_reminders(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    """Nudges each manager (in-app + email) with timesheets pending for more than 3 days."""
    if not can_approve(me.role):
        raise forbidden()
    b = parse(RemindIn, body if body is not None else {})
    with tx() as db:
        rows = query(
            f"""SELECT t.id, t.week_start, c.name AS consultant, m.id AS manager_id, m.name AS manager_name, m.email AS manager_email
             FROM timesheets t JOIN employees c ON c.id = t.employee_id JOIN employees m ON m.id = c.manager_id
            WHERE t.workspace_id = $1 AND t.status = 'Pending' AND m.status <> 'Exited'
              AND COALESCE(t.submitted_at, (t.week_start + 5)::timestamptz) < now() - interval '{REMIND_AFTER_DAYS} days'
              AND ($2::text IS NULL OR m.id = $2)
            ORDER BY t.week_start""",
            [me.workspaceId, b.managerId],
            db,
        )
        ws = query_one("SELECT name FROM workspaces WHERE id = $1", [me.workspaceId], db)
        by_manager: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            by_manager.setdefault(r["manager_id"], []).append(r)
        for mid, items in by_manager.items():
            n = len(items)
            query(
                "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1, $2, 'approval', $3, $4, '/app/timesheets')",
                [me.workspaceId, mid, f"{n} timesheet{'' if n == 1 else 's'} waiting for your approval",
                 "Pending for more than 3 days: " + ", ".join(sorted({i["consultant"] for i in items}))],
                db,
            )
        if rows:
            query("UPDATE timesheets SET last_reminded_at = now() WHERE id = ANY($1)", [[r["id"] for r in rows]], db)
        audit(request, me, "timesheet.reminders_sent", "workspace", me.workspaceId, {"managers": len(by_manager), "timesheets": len(rows)}, db)

    # Email after the transaction commits; a failed email never undoes the in-app reminder.
    emailed = 0
    demo = is_demo_workspace(me.workspaceId)
    for items in by_manager.values():
        m = items[0]
        if demo or not m["manager_email"]:
            continue  # seeded demo addresses are not real inboxes
        msg = timesheet_reminder(m["manager_email"], m["manager_name"], ws["name"] if ws else "Annex HR", [(i["consultant"], i["week_start"]) for i in items])  # type: ignore[index]
        if send_email(msg, required=False) not in ("failed",):
            emailed += 1
    return {
        "reminded": [{"managerId": mid, "name": items[0]["manager_name"], "count": len(items)} for mid, items in by_manager.items()],
        "timesheets": len(rows),
        "emailed": emailed,
    }
