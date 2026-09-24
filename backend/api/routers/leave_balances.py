"""Leave policies (entitlements, accrual, carry-over) and per-employee leave balances."""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from ..audit import audit
from ..db import query, query_one, tx
from ..errors import bad_request, forbidden, not_found, parse
from ..roles import ADMIN
from ..security import AuthContext, require_auth, require_role

router = APIRouter()

LEAVE_TYPES = ("Annual", "Sick", "Maternity", "Paternity", "Compassionate", "Study")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

#: Kenyan defaults (Employment Act 2007) used until HR saves a policy.
DEFAULT_POLICIES: dict[str, dict[str, Any]] = {
    "Annual": {"annual_days": 21.0, "accrual": "monthly", "carry_over_max": 5.0, "expires_month_day": "03-31"},
    "Sick": {"annual_days": 30.0, "accrual": "upfront", "carry_over_max": 0.0, "expires_month_day": None},
    "Maternity": {"annual_days": 90.0, "accrual": "upfront", "carry_over_max": 0.0, "expires_month_day": None},
    "Paternity": {"annual_days": 14.0, "accrual": "upfront", "carry_over_max": 0.0, "expires_month_day": None},
    "Compassionate": {"annual_days": 5.0, "accrual": "upfront", "carry_over_max": 0.0, "expires_month_day": None},
    "Study": {"annual_days": 10.0, "accrual": "upfront", "carry_over_max": 0.0, "expires_month_day": None},
}


def load_policies(workspace_id: str, db=None) -> dict[str, dict[str, Any]]:
    rows = {r["type"]: r for r in query("SELECT * FROM leave_policies WHERE workspace_id = $1", [workspace_id], db)}
    return {t: {**DEFAULT_POLICIES[t], **({k: rows[t][k] for k in DEFAULT_POLICIES[t]} if t in rows else {}), "custom": t in rows} for t in LEAVE_TYPES}


def to_policy(t: str, p: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": t,
        "annualDays": float(p["annual_days"]),
        "accrual": p["accrual"],
        "monthlyRate": round(float(p["annual_days"]) / 12, 2) if p["accrual"] == "monthly" else None,
        "carryOverMax": float(p["carry_over_max"]),
        "expiresMonthDay": p["expires_month_day"],
        "custom": p.get("custom", False),
    }


def completed_months(a: dt.date, b: dt.date) -> int:
    """Whole months from a to b (0–12)."""
    if b <= a:
        return 0
    m = (b.year - a.year) * 12 + b.month - a.month - (1 if b.day < a.day else 0)
    return max(0, min(12, m))


def _accrued(p: dict[str, Any], start: dt.date, year: int, as_of: dt.date) -> float:
    annual = float(p["annual_days"])
    year_start, year_end = dt.date(year, 1, 1), dt.date(year + 1, 1, 1)
    if start >= year_end or as_of < year_start:
        return 0.0
    if p["accrual"] == "upfront":
        return annual
    return round(annual / 12 * completed_months(max(year_start, start), min(as_of, year_end)), 2)


def _num(v: Any) -> float | int:
    f = round(float(v), 2)
    return int(f) if f.is_integer() else f


def compute_balances(db, workspace_id: str, employee_id: str, today: Optional[dt.date] = None) -> dict[str, Any]:
    today = today or dt.date.today()
    year = today.year
    emp = query_one("SELECT id, name, start_date FROM employees WHERE id = $1 AND workspace_id = $2", [employee_id, workspace_id], db)
    if not emp:
        raise not_found("Employee")
    start = dt.date.fromisoformat(emp["start_date"])
    policies = load_policies(workspace_id, db)
    reqs = query(
        "SELECT type, status, start_date, days FROM leave_requests WHERE employee_id = $1 AND status IN ('Approved', 'Pending') AND start_date >= $2 AND start_date < $3",
        [employee_id, f"{year - 1}-01-01", f"{year + 1}-01-01"],
        db,
    )

    def total(t: str, status: str, y: int, before: Optional[str] = None) -> float:
        return sum(float(r["days"]) for r in reqs if r["type"] == t and r["status"] == status and r["start_date"][:4] == str(y) and (before is None or r["start_date"] <= before))

    balances = []
    for t in LEAVE_TYPES:
        p = policies[t]
        accrued = _accrued(p, start, year, today)
        taken, pending = total(t, "Approved", year), total(t, "Pending", year)
        carried, expires, lapsed = 0.0, None, False
        cap = float(p["carry_over_max"])
        if cap > 0 and start < dt.date(year, 1, 1):
            prev = _accrued(p, start, year - 1, dt.date(year, 1, 1)) - total(t, "Approved", year - 1)
            carried = round(min(cap, max(0.0, prev)), 2)
            if p["expires_month_day"]:
                mm, dd = (int(x) for x in p["expires_month_day"].split("-"))
                try:
                    exp = dt.date(year, mm, dd)
                except ValueError:
                    exp = dt.date(year, mm, 28)
                expires = exp.isoformat()
                if today > exp:
                    # Days taken up to the expiry used the carried-over balance first; the rest lapsed.
                    used = min(carried, total(t, "Approved", year, expires))
                    lapsed = carried > used
                    carried = round(used, 2)
        available = accrued + carried
        balances.append({
            **to_policy(t, p),
            "entitlement": float(p["annual_days"]),
            "accrued": _num(accrued),
            "carriedOver": _num(carried),
            "carryOverExpires": expires,
            "carryOverLapsed": lapsed,
            "taken": _num(taken),
            "pending": _num(pending),
            "available": _num(available),
            "remaining": _num(available - taken - pending),
        })

    annual = policies["Annual"]
    series = []
    for i, label in enumerate(MONTHS):
        month_end = dt.date(year + (i == 11), 1 if i == 11 else i + 2, 1)
        taken_to = sum(float(r["days"]) for r in reqs if r["type"] == "Annual" and r["status"] == "Approved" and r["start_date"][:4] == str(year) and r["start_date"] < month_end.isoformat())
        series.append({
            "month": label,
            "accrued": _accrued(annual, start, year, month_end),
            "taken": _num(taken_to) if i + 1 <= today.month else None,
        })
    return {"employeeId": emp["id"], "name": emp["name"], "startDate": emp["start_date"], "year": year, "asOf": today.isoformat(), "balances": balances, "annualSeries": series}


def remaining_for(db, workspace_id: str, employee_id: str, leave_type: str) -> float:
    b = compute_balances(db, workspace_id, employee_id)
    return float(next(x["remaining"] for x in b["balances"] if x["type"] == leave_type))


@router.get("/leave/balances/me")
def my_balances(me: AuthContext = Depends(require_auth)):
    with tx() as db:
        return compute_balances(db, me.workspaceId, me.employeeId)


@router.get("/leave/balances/{employee_id}")
def employee_balances(employee_id: str, me: AuthContext = Depends(require_auth)):
    with tx() as db:
        if employee_id not in ("me", me.employeeId) and me.role not in ADMIN:
            e = query_one("SELECT manager_id FROM employees WHERE id = $1 AND workspace_id = $2", [employee_id, me.workspaceId], db)
            if not e:
                raise not_found("Employee")
            if e["manager_id"] != me.employeeId or me.role in ("employee", "consultant"):
                raise forbidden("You can only view balances for yourself or your direct reports")
        return compute_balances(db, me.workspaceId, me.employeeId if employee_id == "me" else employee_id)


@router.get("/leave/policies")
def get_policies(me: AuthContext = Depends(require_role(*ADMIN))):
    p = load_policies(me.workspaceId)
    return [to_policy(t, p[t]) for t in LEAVE_TYPES]


class PolicyIn(BaseModel):
    model_config = ConfigDict(strict=True)

    type: Literal["Annual", "Sick", "Maternity", "Paternity", "Compassionate", "Study"]
    annualDays: float = Field(ge=0, le=366)
    accrual: Literal["monthly", "upfront"]
    carryOverMax: float = Field(default=0, ge=0, le=366)
    expiresMonthDay: Optional[str] = Field(default=None, pattern=r"^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$")


class PoliciesIn(BaseModel):
    model_config = ConfigDict(strict=True)

    policies: list[PolicyIn] = Field(min_length=1, max_length=6)


@router.put("/leave/policies")
def put_policies(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(PoliciesIn, body)
    if len({p.type for p in b.policies}) != len(b.policies):
        raise bad_request("Each leave type can appear only once")
    with tx() as db:
        for p in b.policies:
            query(
                """INSERT INTO leave_policies (workspace_id, type, annual_days, accrual, carry_over_max, expires_month_day) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (workspace_id, type) DO UPDATE SET annual_days = $3, accrual = $4, carry_over_max = $5, expires_month_day = $6, updated_at = now()""",
                [me.workspaceId, p.type, p.annualDays, p.accrual, p.carryOverMax, p.expiresMonthDay if p.carryOverMax > 0 else None],
                db,
            )
        audit(request, me, "leave.policies_updated", "workspace", me.workspaceId, {"types": [p.type for p in b.policies]}, db)
        pol = load_policies(me.workspaceId, db)
    return [to_policy(t, pol[t]) for t in LEAVE_TYPES]
