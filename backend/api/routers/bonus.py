"""Bonus engine: workspace rules, quarterly bonus cycles (HR → Finance → CEO) and hand-off to the next payroll run."""

from __future__ import annotations

import json
import math
from typing import Any

import psycopg
from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..approval_chain import build_chain, sign_next, signer_name
from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, conflict, parse
from ..payroll_calc import js_round
from ..repository import owned
from ..roles import ADMIN, PAYROLL
from ..security import AuthContext, require_role

router = APIRouter()

payroll_role = require_role(*PAYROLL)
editor_role = require_role(*ADMIN, "finance")
CHAIN = ["HR", "Finance", "CEO"]
DEFAULT_BANDS = [{"min": 3.5, "max": 4.0, "pct": 25}, {"min": 4.0, "max": 4.5, "pct": 50}, {"min": 4.5, "max": 5.01, "pct": 100}]
DEFAULT_THRESHOLD = 3.5


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


class Band(Strict):
    min: float = Field(ge=0, le=5)
    max: float = Field(ge=0, le=5.01)
    pct: float = Field(ge=0, le=200)

    @model_validator(mode="after")
    def _order(self) -> "Band":
        if self.max <= self.min:
            raise ValueError("max must be greater than min")
        return self


class RulesIn(Strict):
    threshold: float = Field(ge=0, le=5)
    bands: list[Band] = Field(min_length=1, max_length=10)
    budgetCap: float = Field(ge=0)


def band_pct(rating: float, threshold: float, bands: list[dict[str, Any]]) -> float:
    """% of one month's salary for a rating; ratings above the threshold but below the first band use the first band."""
    if rating < threshold:
        return 0
    for b in bands:
        if b["min"] <= rating < b["max"]:
            return b["pct"]
    return bands[0]["pct"] if bands else 0


def bonus_amount(salary: float, pct: float) -> int:
    """Rounded to the nearest KES 100."""
    return js_round(salary * pct / 100 / 100) * 100


def _pool(workspace_id: str, quarter: str | None, db: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    """Payroll-eligible employees with the rating that drives their bonus: the released review for the quarter, else the profile rating."""
    return query(
        """SELECT e.id, e.name, e.department_id, e.salary_kes,
                  COALESCE((SELECT p.final_rating FROM review_participants p JOIN review_cycles c ON c.id = p.cycle_id
                             WHERE p.employee_id = e.id AND c.workspace_id = e.workspace_id AND c.stage = 4 AND p.final_rating IS NOT NULL
                               AND ($2::text IS NULL OR c.quarter = $2)
                             ORDER BY c.period_end DESC LIMIT 1), e.performance) AS rating
             FROM employees e
            WHERE e.workspace_id = $1 AND e.status <> 'Exited' AND e.employment_type <> 'Consultant'""",
        [workspace_id, quarter],
        db,
    )


def get_rules(workspace_id: str, db: psycopg.Connection | None = None) -> dict[str, Any]:
    r = query_one("SELECT * FROM bonus_rules WHERE workspace_id = $1", [workspace_id], db)
    if r:
        return {"threshold": r["threshold"], "bands": r["bands"], "budgetCap": r["budget_cap"], "updatedAt": iso(r["updated_at"]), "configured": True}
    total = sum(bonus_amount(e["salary_kes"], band_pct(e["rating"], DEFAULT_THRESHOLD, DEFAULT_BANDS)) for e in _pool(workspace_id, None, db))
    return {"threshold": DEFAULT_THRESHOLD, "bands": DEFAULT_BANDS, "budgetCap": math.ceil(total * 1.08 / 100_000) * 100_000, "updatedAt": None, "configured": False}


@router.get("/bonus/rules")
def read_rules(me: AuthContext = Depends(payroll_role)):
    return get_rules(me.workspaceId)


@router.put("/bonus/rules")
def put_rules(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(editor_role)):
    b = parse(RulesIn, body)
    bands = sorted([x.model_dump() for x in b.bands], key=lambda x: x["min"])
    query(
        """INSERT INTO bonus_rules (workspace_id, threshold, bands, budget_cap, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5, now())
           ON CONFLICT (workspace_id) DO UPDATE SET threshold = EXCLUDED.threshold, bands = EXCLUDED.bands, budget_cap = EXCLUDED.budget_cap,
                 updated_by = EXCLUDED.updated_by, updated_at = now()""",
        [me.workspaceId, b.threshold, json.dumps(bands), b.budgetCap, me.employeeId],
    )
    audit(request, me, "bonus.rules_updated", "bonus_rules", me.workspaceId, {"threshold": b.threshold, "budgetCap": b.budgetCap})
    return get_rules(me.workspaceId)


# ── Cycles ──────────────────────────────────────────────────────────
def to_cycle(c: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": c["id"], "quarter": c["quarter"], "status": c["status"], "threshold": c["threshold"], "bands": c["bands"],
        "budgetCap": c["budget_cap"], "headcount": c["headcount"], "eligible": c["eligible"], "total": c["total"],
        "approvals": c["approvals"] or [], "queuedForPayroll": c["queued_for_payroll"], "payrollRunId": c["payroll_run_id"],
        "payrollPeriod": c.get("payroll_period"), "createdAt": iso(c["created_at"]),
        "lines": [
            {"employeeId": l["employee_id"], "rating": l["rating"], "bandPct": l["band_pct"], "monthlySalary": l["monthly_salary"], "bonus": l["bonus"]}
            for l in lines
        ],
    }


def load_cycle(cycle_id: str, db: psycopg.Connection | None = None) -> dict[str, Any]:
    c = query_one("SELECT c.*, r.period AS payroll_period FROM bonus_cycles c LEFT JOIN payroll_runs r ON r.id = c.payroll_run_id WHERE c.id = $1", [cycle_id], db)
    lines = query("SELECT * FROM bonus_lines WHERE cycle_id = $1 ORDER BY bonus DESC, rating DESC", [cycle_id], db)
    return to_cycle(c, lines)  # type: ignore[arg-type]


@router.get("/bonus/cycles")
def list_cycles(me: AuthContext = Depends(payroll_role)):
    rows = query(
        """SELECT c.*, r.period AS payroll_period,
                  COALESCE((SELECT json_agg(l ORDER BY l.bonus DESC, l.rating DESC) FROM bonus_lines l WHERE l.cycle_id = c.id), '[]') AS lines
             FROM bonus_cycles c LEFT JOIN payroll_runs r ON r.id = c.payroll_run_id
            WHERE c.workspace_id = $1 ORDER BY c.quarter DESC""",
        [me.workspaceId],
    )
    return [to_cycle(c, [{**l, "rating": float(l["rating"]), "band_pct": float(l["band_pct"]), "monthly_salary": float(l["monthly_salary"]), "bonus": float(l["bonus"])} for l in c["lines"]]) for c in rows]


class CycleIn(Strict):
    quarter: str = Field(pattern=r"^\d{4}-Q[1-4]$")
    submit: bool = False


def _submit_checks(total: float, cap: float) -> None:
    if cap and total > cap:
        raise bad_request(f"Bonus pool is over the budget cap by KES {js_round(total - cap):,}")


@router.post("/bonus/cycles")
def create_cycle(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(editor_role)):
    """Computes the quarter's bonus pool from the current rules and ratings. A draft for the same quarter is recomputed."""
    b = parse(CycleIn, body)
    with tx() as db:
        existing = query_one("SELECT * FROM bonus_cycles WHERE workspace_id = $1 AND quarter = $2", [me.workspaceId, b.quarter], db)
        if existing and existing["status"] != "Draft":
            raise conflict(f"The {b.quarter} bonus cycle is already {existing['status'].lower()}")
        rules = get_rules(me.workspaceId, db)
        pool = _pool(me.workspaceId, b.quarter, db)
        lines = []
        for e in pool:
            pct = band_pct(e["rating"], rules["threshold"], rules["bands"])
            amount = bonus_amount(e["salary_kes"], pct)
            if amount > 0:
                lines.append({"employee_id": e["id"], "rating": e["rating"], "band_pct": pct, "monthly_salary": e["salary_kes"], "bonus": amount})
        total = sum(l["bonus"] for l in lines)
        if b.submit:
            _submit_checks(total, rules["budgetCap"])
        status = "Pending Approval" if b.submit else "Draft"
        chain = json.dumps(build_chain(me.workspaceId, CHAIN, db))
        params = [me.workspaceId, b.quarter, status, rules["threshold"], json.dumps(rules["bands"]), rules["budgetCap"], len(pool), len(lines), total, chain, me.employeeId]
        if existing:
            query("DELETE FROM bonus_lines WHERE cycle_id = $1", [existing["id"]], db)
            c = query_one(
                """UPDATE bonus_cycles SET status = $3, threshold = $4, bands = $5, budget_cap = $6, headcount = $7, eligible = $8, total = $9,
                          approvals = $10, created_by = $11 WHERE workspace_id = $1 AND quarter = $2 RETURNING id""",
                params,
                db,
            )
        else:
            c = query_one(
                """INSERT INTO bonus_cycles (workspace_id, quarter, status, threshold, bands, budget_cap, headcount, eligible, total, approvals, created_by)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id""",
                params,
                db,
            )
        cid = c["id"]  # type: ignore[index]
        for l in lines:
            query(
                "INSERT INTO bonus_lines (cycle_id, employee_id, rating, band_pct, monthly_salary, bonus) VALUES ($1,$2,$3,$4,$5,$6)",
                [cid, l["employee_id"], l["rating"], l["band_pct"], l["monthly_salary"], l["bonus"]],
                db,
            )
        result = load_cycle(cid, db)
    audit(request, me, "bonus.cycle_computed", "bonus_cycle", cid, {"quarter": b.quarter, "total": total, "submitted": b.submit})
    return JSONResponse(result, status_code=201)


@router.post("/bonus/cycles/{id}/submit")
def submit_cycle(id: str, request: Request, me: AuthContext = Depends(editor_role)):
    c = owned("bonus_cycles", id, me.workspaceId, "Bonus cycle")
    if c["status"] != "Draft":
        raise bad_request(f"Bonus cycle is already {c['status'].lower()}")
    _submit_checks(c["total"], c["budget_cap"])
    query("UPDATE bonus_cycles SET status = 'Pending Approval' WHERE id = $1", [id])
    audit(request, me, "bonus.cycle_submitted", "bonus_cycle", id)
    return load_cycle(id)


@router.post("/bonus/cycles/{id}/approve")
def approve_cycle(id: str, request: Request, me: AuthContext = Depends(payroll_role)):
    """Signs the next step (HR → Finance → CEO) for the caller's role."""
    with tx() as db:
        c = owned("bonus_cycles", id, me.workspaceId, "Bonus cycle", db)
        if c["status"] != "Pending Approval":
            raise bad_request("Submit the bonus cycle before approving it" if c["status"] == "Draft" else f"Bonus cycle is already {c['status'].lower()}")
        chain, done = sign_next(c["approvals"] or [], me.role, signer_name(me.employeeId, db))
        query("UPDATE bonus_cycles SET approvals = $2, status = $3 WHERE id = $1", [id, json.dumps(chain), "Approved" if done else "Pending Approval"], db)
        result = load_cycle(id, db)
    audit(request, me, "bonus.cycle_approved", "bonus_cycle", id)
    return result


@router.post("/bonus/cycles/{id}/add-to-payroll")
def queue_cycle(id: str, request: Request, me: AuthContext = Depends(editor_role)):
    """Queues an approved cycle so the next generated payroll run carries each employee's bonus."""
    c = owned("bonus_cycles", id, me.workspaceId, "Bonus cycle")
    if c["status"] != "Approved":
        raise bad_request("Only fully approved bonus cycles can be added to payroll")
    if c["payroll_run_id"]:
        raise bad_request("This bonus cycle is already on a payroll run")
    query("UPDATE bonus_cycles SET queued_for_payroll = true WHERE id = $1", [id])
    audit(request, me, "bonus.cycle_queued", "bonus_cycle", id)
    return load_cycle(id)
