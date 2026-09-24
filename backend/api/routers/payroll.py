"""Payroll runs: generation with statutory deductions, persisted payslip lines, the approval chain and the Odoo sync."""

from __future__ import annotations

import re
from typing import Any

import psycopg
from fastapi import APIRouter, Body, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import insert_many, query, query_one, tx
from ..errors import bad_request, conflict, forbidden, parse
from ..payroll_calc import payslip, statutory
from ..repository import owned, to_payroll_run
from ..roles import PAYROLL
from ..security import AuthContext, require_role

router = APIRouter()

#: The TS router guarded every /payroll-runs route with requireRole(...PAYROLL).
payroll_role = require_role(*PAYROLL)

PERIOD = re.compile(r"^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$")


def run_with_approvals(run_id: str, db: psycopg.Connection | None = None) -> dict[str, Any]:
    run = query_one("SELECT * FROM payroll_runs WHERE id = $1", [run_id], db)
    approvals = query("SELECT * FROM payroll_approvals WHERE payroll_run_id = $1 ORDER BY step", [run_id], db)
    return to_payroll_run(run, approvals)  # type: ignore[arg-type]


@router.get("/payroll-runs")
def list_runs(me: AuthContext = Depends(payroll_role)):
    runs = query(
        """SELECT r.*, COALESCE((SELECT json_agg(a ORDER BY a.step) FROM payroll_approvals a WHERE a.payroll_run_id = r.id), '[]') AS approvals
       FROM payroll_runs r WHERE r.workspace_id = $1 ORDER BY r.position, r.created_at DESC""",
        [me.workspaceId],
    )
    return [to_payroll_run(r, r["approvals"]) for r in runs]


# ── Payslip lines ───────────────────────────────────────────────────
def compute_lines(workspace_id: str, bonuses: dict[str, float], db: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    """Per-employee payslips for every payroll-eligible employee (consultants are paid from timesheets)."""
    emps = query(
        """SELECT id, name, employee_no, title, department_id, kra_pin, salary_kes FROM employees
            WHERE workspace_id = $1 AND status <> 'Exited' AND employment_type <> 'Consultant' ORDER BY name""",
        [workspace_id],
        db,
    )
    out = []
    for i, e in enumerate(emps):
        p = payslip(e["salary_kes"], bonuses.get(e["id"], 0))
        out.append({"employee": e, "slip": p, "position": i})
    return out


def line_row(run_id: str, workspace_id: str, x: dict[str, Any]) -> dict[str, Any]:
    e, p = x["employee"], x["slip"]
    return {
        "workspace_id": workspace_id, "payroll_run_id": run_id, "employee_id": e["id"], "employee_name": e["name"],
        "employee_no": e["employee_no"], "title": e["title"], "department_id": e["department_id"], "kra_pin": e["kra_pin"],
        "basic": p["basic"], "house": p["house"], "transport": p["transport"], "airtime": p["airtime"], "bonus": p["bonus"],
        "gross": p["gross"], "nssf_tier1": p["nssfTier1"], "nssf_tier2": p["nssfTier2"], "nssf": p["nssf"], "shif": p["shif"],
        "housing_levy": p["housingLevy"], "taxable": p["taxable"], "paye": p["paye"], "net": p["net"], "position": x["position"],
    }


def to_line(r: dict[str, Any]) -> dict[str, Any]:
    allowances = r["house"] + r["transport"] + r["airtime"]
    return {
        "employeeId": r["employee_id"], "name": r["employee_name"], "employeeNo": r["employee_no"], "title": r["title"],
        "departmentId": r["department_id"] or "", "kraPin": r["kra_pin"] or "",
        "basic": r["basic"], "house": r["house"], "transport": r["transport"], "airtime": r["airtime"], "allowances": allowances,
        "bonus": r["bonus"], "gross": r["gross"], "nssfTier1": r["nssf_tier1"], "nssfTier2": r["nssf_tier2"], "nssf": r["nssf"],
        "shif": r["shif"], "housingLevy": r["housing_levy"], "taxable": r["taxable"], "paye": r["paye"],
        "totalDeductions": r["paye"] + r["nssf"] + r["shif"] + r["housing_levy"], "net": r["net"],
    }


def insert_lines(db: psycopg.Connection, run_id: str, workspace_id: str, lines: list[dict[str, Any]]) -> None:
    insert_many(db, "payroll_lines", [line_row(run_id, workspace_id, x) for x in lines])


def totals_of(lines: list[dict[str, Any]]) -> dict[str, float]:
    t = {"gross": 0.0, "net": 0.0, "paye": 0.0, "shif": 0.0, "nssf": 0.0, "housingLevy": 0.0, "bonus": 0.0}
    for x in lines:
        for k in t:
            t[k] += x["slip"][k]
    return t


@router.get("/payroll-runs/{id}/lines")
def run_lines(id: str, me: AuthContext = Depends(payroll_role)):
    """Payslip lines frozen when the run was generated. Runs imported before lines were stored are estimated from current salaries."""
    run = owned("payroll_runs", id, me.workspaceId, "Payroll run")
    rows = query("SELECT * FROM payroll_lines WHERE payroll_run_id = $1 ORDER BY position, employee_name", [run["id"]])
    if rows:
        return {"runId": run["id"], "period": run["period"], "estimated": False, "lines": [to_line(r) for r in rows]}
    est = [line_row(run["id"], me.workspaceId, x) for x in compute_lines(me.workspaceId, {})]
    return {"runId": run["id"], "period": run["period"], "estimated": True, "lines": [to_line(r) for r in est]}


# ── Generation ──────────────────────────────────────────────────────
class RunIn(BaseModel):
    model_config = ConfigDict(strict=True)

    period: str = Field(min_length=3, pattern=PERIOD.pattern)
    # Accepted for compatibility; bonuses now come from approved bonus cycles queued for payroll.
    bonuses: float = Field(default=0, ge=0)

    @field_validator("period", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


@router.post("/payroll-runs")
def generate_run(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(payroll_role)):
    """Generates a payroll run pending approval, freezing every employee's payslip line, including queued bonuses."""
    b = parse(RunIn, body)
    with tx() as db:
        existing = query_one("SELECT * FROM payroll_runs WHERE workspace_id = $1 AND period = $2", [me.workspaceId, b.period], db)
        if existing:
            signed = query_one("SELECT count(*)::int AS n FROM payroll_approvals WHERE payroll_run_id = $1 AND status = 'Approved'", [existing["id"]], db)["n"]  # type: ignore[index]
            if existing["status"] not in ("Draft", "Pending Approval") or signed:
                raise conflict(f"{b.period} payroll has already been signed off and can't be regenerated")
            # Nobody has signed yet: recalculate from today's salaries (queued bonus cycles are released by the FK).
            query("DELETE FROM payroll_runs WHERE id = $1", [existing["id"]], db)

        cycles = query(
            "SELECT id FROM bonus_cycles WHERE workspace_id = $1 AND status = 'Approved' AND queued_for_payroll AND payroll_run_id IS NULL",
            [me.workspaceId],
            db,
        )
        bonuses: dict[str, float] = {}
        if cycles:
            for bl in query("SELECT employee_id, bonus FROM bonus_lines WHERE cycle_id = ANY($1)", [[c["id"] for c in cycles]], db):
                bonuses[bl["employee_id"]] = bonuses.get(bl["employee_id"], 0) + bl["bonus"]

        lines = compute_lines(me.workspaceId, bonuses, db)
        t = totals_of(lines)
        preparer = query_one("SELECT name FROM employees WHERE id = $1", [me.employeeId], db)
        run = query_one(
            """INSERT INTO payroll_runs (workspace_id, period, status, employees, gross, net, paye, shif, nssf, housing_levy, bonuses, prepared_by, position)
         VALUES ($1,$2,'Pending Approval',$3,$4,$5,$6,$7,$8,$9,$10,$11,-1) RETURNING id""",
            [me.workspaceId, b.period, len(lines), t["gross"], t["net"], t["paye"], t["shif"], t["nssf"], t["housingLevy"], t["bonus"], preparer["name"] if preparer else "—"],
            db,
        )
        run_id = run["id"]  # type: ignore[index]
        insert_lines(db, run_id, me.workspaceId, lines)
        if cycles:
            query("UPDATE bonus_cycles SET payroll_run_id = $1 WHERE id = ANY($2)", [run_id, [c["id"] for c in cycles]], db)
        chain = query(
            """SELECT role, name FROM (
         SELECT 0 AS step, 'Finance' AS role, (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'finance' ORDER BY employee_no LIMIT 1) AS name
         UNION ALL SELECT 1, 'HR', (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'company_admin' ORDER BY employee_no LIMIT 1)
         UNION ALL SELECT 2, 'CEO', (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'ceo' ORDER BY employee_no LIMIT 1)
       ) c ORDER BY step""",
            [me.workspaceId],
            db,
        )
        for step, a in enumerate(chain):
            query(
                "INSERT INTO payroll_approvals (payroll_run_id, step, role, name, status) VALUES ($1,$2,$3,$4,$5)",
                [run_id, step, a["role"], a["name"] or "—", "Pending"],
                db,
            )
        result = run_with_approvals(run_id, db)
    audit(request, me, "payroll.generated", "payroll_run", run_id, {"period": b.period, "bonusCycles": [c["id"] for c in cycles]})
    return JSONResponse(jsonable_encoder(result), status_code=201)


STEP_ROLE: dict[str, list[str]] = {"Finance": ["finance"], "HR": ["company_admin", "hr_officer"], "CEO": ["ceo"]}


@router.post("/payroll-runs/{id}/approve")
def approve_run(id: str, request: Request, me: AuthContext = Depends(payroll_role)):
    """Signs the next pending approval step if the caller holds that role. Fully approved runs become Approved."""
    with tx() as db:
        run = owned("payroll_runs", id, me.workspaceId, "Payroll run", db)
        if run["status"] != "Pending Approval":
            raise bad_request(f"Payroll is {str(run['status']).lower()}")
        step = query_one("SELECT * FROM payroll_approvals WHERE payroll_run_id = $1 AND status = 'Pending' ORDER BY step LIMIT 1", [run["id"]], db)
        if not step:
            raise bad_request("Nothing left to approve")
        allowed = [*STEP_ROLE.get(step["role"], []), "super_admin"]
        if me.role not in allowed:
            raise forbidden(f"Waiting for {step['role']} approval")
        query("UPDATE payroll_approvals SET status = 'Approved', decided_at = current_date WHERE id = $1", [step["id"]], db)
        left = query_one("SELECT count(*)::int AS left FROM payroll_approvals WHERE payroll_run_id = $1 AND status = 'Pending'", [run["id"]], db)["left"]  # type: ignore[index]
        if left == 0:
            query("UPDATE payroll_runs SET status = 'Approved' WHERE id = $1", [run["id"]], db)
            # Bonuses carried by this run are now paid out.
            query("UPDATE bonus_cycles SET status = 'Paid' WHERE payroll_run_id = $1 AND status = 'Approved'", [run["id"]], db)
    audit(request, me, "payroll.approved", "payroll_run", id)
    return run_with_approvals(id)


@router.post("/payroll-runs/{id}/sync-odoo")
def sync_odoo(id: str, request: Request, me: AuthContext = Depends(payroll_role)):
    """Placeholder for the Odoo integration: marks an approved run as synced."""
    run = owned("payroll_runs", id, me.workspaceId, "Payroll run")
    if run["status"] not in ("Approved", "Paid"):
        raise bad_request("Payroll must be fully approved before syncing to Odoo")
    # TODO: post the journal entry to Odoo via XML-RPC / JSON-RPC.
    query("UPDATE payroll_runs SET status = 'Synced to Odoo', odoo_synced_at = now() WHERE id = $1", [run["id"]])
    audit(request, me, "payroll.synced_odoo", "payroll_run", id)
    return run_with_approvals(id)


@router.get("/payroll/preview/{employeeId}")
def preview(employeeId: str, me: AuthContext = Depends(payroll_role)):
    e = owned("employees", employeeId, me.workspaceId, "Employee")
    return {"employeeId": e["id"], "gross": e["salary_kes"], **statutory(e["salary_kes"])}
