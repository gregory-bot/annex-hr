"""Leave requests (with approval routing, balance checks, handover files and HR alerts) and public holidays.

Attendance lives in routers/attendance.py; policies and balances in routers/leave_balances.py."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

import re
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import query, query_one, tx
from ..errors import bad_request, forbidden, not_found, parse
from ..repository import owned, to_leave
from ..roles import ADMIN, is_leader
from ..security import AuthContext, require_auth, require_role
from .leave_balances import remaining_for

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"
LeaveType = Literal["Annual", "Sick", "Maternity", "Paternity", "Compassionate", "Study"]


def _trim(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def _js_num(v: Any) -> Any:
    """Formats numbers the way a JavaScript template literal would (4.0 → 4)."""
    return int(v) if isinstance(v, float) and v.is_integer() else v


def working_days(start: str, end: str, holidays: set[str]) -> int:
    """Working days between two ISO dates (inclusive), excluding weekends and the given holidays."""
    n = 0
    d, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    while d <= last:
        if d.weekday() < 5 and d.isoformat() not in holidays:
            n += 1
        d += dt.timedelta(days=1)
    return n


LEAVE_SELECT = """SELECT l.*, f.filename AS handover_file_name FROM leave_requests l
  LEFT JOIN employee_files f ON f.id = l.handover_file_id"""

#: Leave types that may exceed the balance (flagged for HR instead of refused).
OVERDRAW_OK = ("Sick", "Compassionate")


def to_leave_out(r: dict[str, Any]) -> dict[str, Any]:
    """The shared leave shape plus handover file, HR alerts and the balance warning."""
    return {
        **to_leave(r),
        "handoverFileId": r.get("handover_file_id"),
        "handoverFileName": r.get("handover_file_name"),
        "alerts": list(r.get("alerts") or []),
        "balanceWarning": bool(r.get("balance_warning")),
    }


def _load(id: str, db=None) -> dict[str, Any]:
    return query_one(LEAVE_SELECT + " WHERE l.id = $1", [id], db)  # type: ignore[return-value]


def leave_alerts(db, workspace_id: str, employee: dict[str, Any], start: str, end: str, days: float) -> list[str]:
    """Reasons HR should look at a request: long leave, 2+ teammates already away, or no line manager."""
    alerts: list[str] = []
    if days > 10:
        alerts.append(f"Long leave: {_js_num(float(days))} working days")
    if employee.get("department_id"):
        away = query_one(
            """SELECT count(DISTINCT l.employee_id) AS n FROM leave_requests l JOIN employees e ON e.id = l.employee_id
             WHERE l.workspace_id = $1 AND e.department_id = $2 AND l.employee_id <> $3 AND l.status = 'Approved' AND l.start_date <= $5 AND l.end_date >= $4""",
            [workspace_id, employee["department_id"], employee["id"], start, end],
            db,
        )
        if away and away["n"] >= 2:
            alerts.append(f"Team overlap: {away['n']} teammates already on approved leave")
    if not employee.get("manager_id"):
        alerts.append("No line manager assigned")
    return alerts


@router.get("/leave-requests")
def list_leave(request: Request, me: AuthContext = Depends(require_auth)):
    mine = request.query_params.get("mine") == "true" or not is_leader(me.role)
    rows = query(
        LEAVE_SELECT + " WHERE l.workspace_id = $1 AND ($2::text IS NULL OR l.employee_id = $2) ORDER BY l.created_at DESC",
        [me.workspaceId, me.employeeId if mine else None],
    )
    return [to_leave_out(r) for r in rows]


class LeaveIn(BaseModel):
    model_config = ConfigDict(strict=True)

    type: LeaveType
    start: str = Field(pattern=ISO_DATE)
    end: str = Field(pattern=ISO_DATE)
    reason: str = Field(default="", max_length=500)
    handoverTo: Optional[str] = None
    handoverNotes: bool = False
    handoverFileId: Optional[str] = None

    @field_validator("reason", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)


@router.post("/leave-requests")
def create_leave(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(LeaveIn, body)
    if b.end < b.start:
        raise bad_request("End date must be on or after the start date")
    with tx() as db:
        ws = query_one("SELECT country FROM workspaces WHERE id = $1", [me.workspaceId], db)
        hol = query(
            "SELECT date FROM holidays WHERE workspace_id = $1 AND country = $2 AND date BETWEEN $3 AND $4",
            [me.workspaceId, ws["country"], b.start, b.end],  # type: ignore[index]
            db,
        )
        try:
            days = working_days(b.start, b.end, {h["date"] for h in hol})
        except ValueError:
            days = 0  # an impossible calendar date (JavaScript's Invalid Date) counts no days
        if days == 0:
            raise bad_request("The selected dates contain no working days")
        if b.handoverTo:
            owned("employees", b.handoverTo, me.workspaceId, "Handover colleague", db)
        if b.handoverFileId:
            f = query_one("SELECT employee_id, category FROM employee_files WHERE id = $1 AND workspace_id = $2", [b.handoverFileId, me.workspaceId], db)
            if not f or f["employee_id"] != me.employeeId:
                raise bad_request("Handover document not found — upload it again")

        # Balance check: refuse when it would go negative, except sick/compassionate leave (flagged instead).
        remaining = remaining_for(db, me.workspaceId, me.employeeId, b.type)
        warning = days > remaining
        if warning and b.type not in OVERDRAW_OK:
            left = _js_num(float(max(0.0, remaining)))
            raise bad_request(
                f"Not enough {b.type.lower()} leave: you have {left} day{'' if left == 1 else 's'} remaining and requested {days}",
                {"remaining": remaining, "requested": days, "type": b.type},
            )

        emp = query_one("SELECT id, name, manager_id, department_id FROM employees WHERE id = $1", [me.employeeId], db)
        alerts = leave_alerts(db, me.workspaceId, emp, b.start, b.end, days)  # type: ignore[arg-type]
        if warning:
            alerts.append(f"Over balance: {_js_num(float(max(0.0, remaining)))} {b.type.lower()} days remaining")
        row = query_one(
            """INSERT INTO leave_requests (workspace_id, employee_id, type, start_date, end_date, days, reason, status, stage, handover_to, handover_notes, handover_file_id, alerts, balance_warning)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending','Manager',$8,$9,$10,$11,$12) RETURNING id""",
            [me.workspaceId, me.employeeId, b.type, b.start, b.end, days, b.reason, b.handoverTo, b.handoverNotes or bool(b.handoverFileId), b.handoverFileId, alerts, warning],
            db,
        )
        # Notify the line manager — or HR when the employee has no manager (never the whole workspace).
        manager_id = emp["manager_id"]  # type: ignore[index]
        query(
            "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience) VALUES ($1, $2, 'approval', $3, $4, '/app/leave', $5)",
            [
                me.workspaceId,
                manager_id,
                f"{emp['name']} requested {days} day{'' if days == 1 else 's'} of {b.type.lower()} leave",  # type: ignore[index]
                "Awaiting your approval as line manager." if manager_id else "Awaiting HR approval.",
                "all" if manager_id else "admins",
            ],
            db,
        )
        if alerts:
            query(
                "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience) VALUES ($1, NULL, 'leave', $2, $3, '/app/leave?tab=approvals', 'admins')",
                [me.workspaceId, f"Leave alert: {emp['name']} · {b.type} leave {b.start} → {b.end}", "; ".join(alerts)],  # type: ignore[index]
                db,
            )
        audit(request, me, "leave.requested", "leave_request", row["id"], {"days": days, "alerts": alerts}, db)  # type: ignore[index]
        saved = _load(row["id"], db)  # type: ignore[index]
    return JSONResponse(jsonable_encoder(to_leave_out(saved)), status_code=201)


@router.get("/leave-requests/{id}/handover")
def download_handover(id: str, request: Request, me: AuthContext = Depends(require_auth)):
    """The handover document for approvers, the requester and the colleague covering."""
    f = query_one(
        """SELECT l.employee_id, l.handover_to, f.id, f.filename, f.content_type, f.data FROM leave_requests l
         JOIN employee_files f ON f.id = l.handover_file_id WHERE l.id = $1 AND l.workspace_id = $2""",
        [id, me.workspaceId],
    )
    if not f:
        raise not_found("Handover document")
    if me.employeeId not in (f["employee_id"], f["handover_to"]) and not is_leader(me.role):
        raise forbidden()
    audit(request, me, "file.downloaded", "employee_file", f["id"], {"employeeId": f["employee_id"], "leaveRequestId": id})
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]", "_", f["filename"])
    inline = request.query_params.get("inline") in ("1", "true") and f["content_type"] in ("application/pdf", "image/png", "image/jpeg", "image/webp")
    return Response(
        content=bytes(f["data"]),
        media_type=f["content_type"],
        headers={
            "Content-Disposition": f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(f['filename'])}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


class DecisionIn(BaseModel):
    model_config = ConfigDict(strict=True)

    decision: Literal["approve", "reject"]
    comment: Optional[str] = Field(default=None, max_length=500)


@router.post("/leave-requests/{id}/decision")
def decide_leave(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    """Approval routing: Manager → HR → CEO (CEO only for >10 days, Maternity or Study).
    Approving advances one stage; rejecting ends the request."""
    decision = parse(DecisionIn, body).decision
    with tx() as db:
        row = owned("leave_requests", id, me.workspaceId, "Leave request", db)
        if row["status"] != "Pending":
            raise bad_request(f"This request is already {str(row['status']).lower()}")
        if row["employee_id"] == me.employeeId:
            raise forbidden("You cannot approve your own leave")

        stage = row["stage"]
        can_act = (
            (stage == "Manager" and is_leader(me.role))
            or (stage == "HR" and me.role in ADMIN)
            or (stage == "CEO" and me.role in ("ceo", "super_admin"))
        )
        if not can_act:
            who = "HR team" if stage == "HR" else "CEO" if stage == "CEO" else "line manager"
            raise forbidden(f"Only the {who} can act at this stage")

        needs_ceo = float(row["days"]) > 10 or row["type"] in ("Maternity", "Study")
        status, nxt = "Pending", stage
        if decision == "reject":
            status, nxt = "Rejected", "Complete"
        elif stage == "Manager":
            nxt = "HR"
        elif stage == "HR" and needs_ceo:
            nxt = "CEO"
        else:
            status, nxt = "Approved", "Complete"

        query(
            """UPDATE leave_requests SET status = $3, stage = $4, decided_by = CASE WHEN $3 <> 'Pending' THEN $5 ELSE decided_by END, decided_at = CASE WHEN $3 <> 'Pending' THEN now() ELSE decided_at END
        WHERE id = $1 AND workspace_id = $2""",
            [id, me.workspaceId, status, nxt, me.employeeId],
            db,
        )
        updated = _load(id, db)
        if status != "Pending":
            query(
                "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1, $2, 'leave', $3, $4, '/app/leave?tab=mine')",
                [
                    me.workspaceId,
                    row["employee_id"],
                    f"Your {str(row['type']).lower()} leave was {status.lower()}",
                    f"{row['start_date']} → {row['end_date']} · {_js_num(row['days'])} days",
                ],
                db,
            )
    audit(request, me, f"leave.{decision}", "leave_request", id)
    return to_leave_out(updated)


# ── Holidays ────────────────────────────────────────────────────────
@router.get("/holidays")
def list_holidays(request: Request, me: AuthContext = Depends(require_auth)):
    country = (request.query_params.get("country") or "").strip() or None
    return query(
        "SELECT id, date, name, country FROM holidays WHERE workspace_id = $1 AND ($2::text IS NULL OR country = $2) ORDER BY date",
        [me.workspaceId, country],
    )


class HolidayIn(BaseModel):
    model_config = ConfigDict(strict=True)

    date: str = Field(pattern=ISO_DATE)
    name: str = Field(min_length=2, max_length=120)
    country: str = Field(min_length=2, max_length=60)

    @field_validator("name", "country", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)


@router.post("/holidays")
def create_holiday(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(HolidayIn, body)
    try:
        dt.date.fromisoformat(b.date)
    except ValueError:
        raise bad_request("Enter a real calendar date")
    if query_one("SELECT 1 FROM holidays WHERE workspace_id = $1 AND date = $2 AND country = $3", [me.workspaceId, b.date, b.country]):
        raise bad_request(f"{b.country} already has a holiday on {b.date}")
    row = query_one(
        "INSERT INTO holidays (workspace_id, date, name, country) VALUES ($1,$2,$3,$4) RETURNING id, date, name, country",
        [me.workspaceId, b.date, b.name, b.country],
    )
    audit(request, me, "holiday.created", "holiday", row["id"], {"date": b.date, "country": b.country})  # type: ignore[index]
    return JSONResponse(row, status_code=201)


@router.delete("/holidays/{id}")
def delete_holiday(id: str, request: Request, me: AuthContext = Depends(require_role(*ADMIN))):
    row = query_one("DELETE FROM holidays WHERE id = $1 AND workspace_id = $2 RETURNING date, country", [id, me.workspaceId])
    if not row:
        raise not_found("Holiday")
    audit(request, me, "holiday.deleted", "holiday", id, row)
    return Response(status_code=204)
