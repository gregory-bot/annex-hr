"""Leave requests (with approval routing), public holidays and attendance."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, forbidden, parse
from ..repository import owned, to_leave
from ..roles import ADMIN, is_leader
from ..security import AuthContext, require_auth, require_role

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


@router.get("/leave-requests")
def list_leave(request: Request, me: AuthContext = Depends(require_auth)):
    mine = request.query_params.get("mine") == "true" or not is_leader(me.role)
    rows = query(
        "SELECT * FROM leave_requests WHERE workspace_id = $1 AND ($2::text IS NULL OR employee_id = $2) ORDER BY created_at DESC",
        [me.workspaceId, me.employeeId if mine else None],
    )
    return [to_leave(r) for r in rows]


class LeaveIn(BaseModel):
    model_config = ConfigDict(strict=True)

    type: LeaveType
    start: str = Field(pattern=ISO_DATE)
    end: str = Field(pattern=ISO_DATE)
    reason: str = Field(default="", max_length=500)
    handoverTo: Optional[str] = None
    handoverNotes: bool = False

    @field_validator("reason", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)


@router.post("/leave-requests")
def create_leave(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(LeaveIn, body)
    if b.end < b.start:
        raise bad_request("End date must be on or after the start date")
    ws = query_one("SELECT country FROM workspaces WHERE id = $1", [me.workspaceId])
    hol = query(
        "SELECT date FROM holidays WHERE workspace_id = $1 AND country = $2 AND date BETWEEN $3 AND $4",
        [me.workspaceId, ws["country"], b.start, b.end],  # type: ignore[index]
    )
    try:
        days = working_days(b.start, b.end, {h["date"] for h in hol})
    except ValueError:
        days = 0  # an impossible calendar date (JavaScript's Invalid Date) counts no days
    if days == 0:
        raise bad_request("The selected dates contain no working days")
    if b.handoverTo:
        owned("employees", b.handoverTo, me.workspaceId, "Handover colleague")

    row = query_one(
        """INSERT INTO leave_requests (workspace_id, employee_id, type, start_date, end_date, days, reason, status, stage, handover_to, handover_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending','Manager',$8,$9) RETURNING *""",
        [me.workspaceId, me.employeeId, b.type, b.start, b.end, days, b.reason, b.handoverTo, b.handoverNotes],
    )
    # Notify the line manager — or HR when the employee has no manager (never the whole workspace).
    emp = query_one("SELECT name, manager_id FROM employees WHERE id = $1", [me.employeeId])
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
    )
    audit(request, me, "leave.requested", "leave_request", row["id"], {"days": days})  # type: ignore[index]
    return JSONResponse(jsonable_encoder(to_leave(row)), status_code=201)  # type: ignore[arg-type]


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

        updated = query_one(
            """UPDATE leave_requests SET status = $3, stage = $4, decided_by = CASE WHEN $3 <> 'Pending' THEN $5 ELSE decided_by END, decided_at = CASE WHEN $3 <> 'Pending' THEN now() ELSE decided_at END
        WHERE id = $1 AND workspace_id = $2 RETURNING *""",
            [id, me.workspaceId, status, nxt, me.employeeId],
            db,
        )
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
    return to_leave(updated)  # type: ignore[arg-type]


# ── Holidays ────────────────────────────────────────────────────────
@router.get("/holidays")
def list_holidays(me: AuthContext = Depends(require_auth)):
    return query("SELECT date, name, country FROM holidays WHERE workspace_id = $1 ORDER BY date", [me.workspaceId])


class HolidayIn(BaseModel):
    model_config = ConfigDict(strict=True)

    date: str = Field(pattern=ISO_DATE)
    name: str = Field(min_length=2)
    country: str = Field(min_length=2)

    @field_validator("name", "country", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)


@router.post("/holidays")
def create_holiday(body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(HolidayIn, body)
    row = query_one(
        "INSERT INTO holidays (workspace_id, date, name, country) VALUES ($1,$2,$3,$4) RETURNING date, name, country",
        [me.workspaceId, b.date, b.name, b.country],
    )
    return JSONResponse(row, status_code=201)


# ── Attendance ──────────────────────────────────────────────────────
@router.get("/attendance/me")
def my_attendance(me: AuthContext = Depends(require_auth)):
    rows = query("SELECT * FROM attendance_records WHERE employee_id = $1 ORDER BY clock_in DESC LIMIT 60", [me.employeeId])
    return [
        {"id": r["id"], "date": r["work_date"], "clockIn": iso(r["clock_in"]), "clockOut": iso(r["clock_out"]) if r["clock_out"] else None, "method": r["method"]}
        for r in rows
    ]


class GeoIn(BaseModel):
    model_config = ConfigDict(strict=True)

    method: Literal["Web", "Mobile", "Biometric"] = "Web"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/attendance/clock-in")
def clock_in(body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(GeoIn, body if body is not None else {})
    if query_one("SELECT id FROM attendance_records WHERE employee_id = $1 AND clock_out IS NULL", [me.employeeId]):
        raise bad_request("You are already clocked in")
    row = query_one(
        "INSERT INTO attendance_records (workspace_id, employee_id, work_date, clock_in, method, latitude, longitude) VALUES ($1,$2,current_date,now(),$3,$4,$5) RETURNING *",
        [me.workspaceId, me.employeeId, b.method, b.latitude, b.longitude],
    )
    return JSONResponse({"id": row["id"], "clockIn": iso(row["clock_in"]), "method": row["method"]}, status_code=201)  # type: ignore[index]


@router.post("/attendance/clock-out")
def clock_out(me: AuthContext = Depends(require_auth)):
    row = query_one("UPDATE attendance_records SET clock_out = now() WHERE employee_id = $1 AND clock_out IS NULL RETURNING *", [me.employeeId])
    if not row:
        raise bad_request("You are not clocked in")
    return {"id": row["id"], "clockIn": iso(row["clock_in"]), "clockOut": iso(row["clock_out"])}
