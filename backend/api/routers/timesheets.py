"""Weekly timesheets: upsert while Draft/Rejected, submit, and leader decisions."""

from __future__ import annotations

import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import query, query_one, tx
from ..errors import bad_request, forbidden, parse
from ..repository import owned, to_timesheet
from ..roles import is_leader
from ..security import AuthContext, require_auth

router = APIRouter()

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def sheet(sheet_id: str) -> dict[str, Any]:
    t = query_one("SELECT * FROM timesheets WHERE id = $1", [sheet_id])
    entries = query("SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY position", [sheet_id])
    return to_timesheet(t, entries)  # type: ignore[arg-type]


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
    return [to_timesheet(r, r["entries"]) for r in rows]


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
    return sheet(tid)


@router.post("/timesheets/{id}/submit")
def submit(id: str, request: Request, me: AuthContext = Depends(require_auth)):
    t = owned("timesheets", id, me.workspaceId, "Timesheet")
    if t["employee_id"] != me.employeeId:
        raise forbidden()
    if t["status"] not in ("Draft", "Rejected"):
        raise bad_request("Already submitted")
    query("UPDATE timesheets SET status = 'Pending' WHERE id = $1", [t["id"]])
    audit(request, me, "timesheet.submitted", "timesheet", t["id"])
    return sheet(t["id"])


class DecisionIn(BaseModel):
    model_config = ConfigDict(strict=True)

    decision: Literal["approve", "reject"]
    comment: Optional[str] = Field(default=None, max_length=500)


@router.post("/timesheets/{id}/decision")
def decide(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    if not can_approve(me.role):
        raise forbidden()
    b = parse(DecisionIn, body)
    t = owned("timesheets", id, me.workspaceId, "Timesheet")
    if t["status"] != "Pending":
        raise bad_request("Only pending timesheets can be decided")
    query(
        "UPDATE timesheets SET status = $2, approved_by = $3, approved_at = now(), comment = $4 WHERE id = $1",
        [t["id"], "Approved" if b.decision == "approve" else "Rejected", me.employeeId, b.comment],
    )
    audit(request, me, f"timesheet.{b.decision}", "timesheet", t["id"])
    return sheet(t["id"])
