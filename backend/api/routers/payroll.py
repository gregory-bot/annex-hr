"""Payroll runs: generation with statutory deductions, the approval chain and the Odoo sync."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..audit import audit
from ..db import query, query_one, tx
from ..errors import bad_request, forbidden, parse
from ..payroll_calc import statutory
from ..repository import owned, to_payroll_run
from ..roles import PAYROLL
from ..security import AuthContext, require_role

router = APIRouter()

#: The TS router guarded every /payroll-runs route with requireRole(...PAYROLL).
payroll_role = require_role(*PAYROLL)


def run_with_approvals(run_id: str) -> dict[str, Any]:
    run = query_one("SELECT * FROM payroll_runs WHERE id = $1", [run_id])
    approvals = query("SELECT * FROM payroll_approvals WHERE payroll_run_id = $1 ORDER BY step", [run_id])
    return to_payroll_run(run, approvals)  # type: ignore[arg-type]


@router.get("/payroll-runs")
def list_runs(me: AuthContext = Depends(payroll_role)):
    runs = query(
        """SELECT r.*, COALESCE((SELECT json_agg(a ORDER BY a.step) FROM payroll_approvals a WHERE a.payroll_run_id = r.id), '[]') AS approvals
       FROM payroll_runs r WHERE r.workspace_id = $1 ORDER BY r.position, r.created_at DESC""",
        [me.workspaceId],
    )
    return [to_payroll_run(r, r["approvals"]) for r in runs]


class RunIn(BaseModel):
    model_config = ConfigDict(strict=True)

    period: str = Field(min_length=3)
    bonuses: float = Field(default=0, ge=0)

    @field_validator("period", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


@router.post("/payroll-runs")
def generate_run(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(payroll_role)):
    """Generates a draft payroll run from active employees' salaries."""
    b = parse(RunIn, body)
    emps = query(
        "SELECT salary_kes FROM employees WHERE workspace_id = $1 AND status <> 'Exited' AND employment_type <> 'Consultant'",
        [me.workspaceId],
    )
    t = {"gross": 0.0, "paye": 0, "nssf": 0, "shif": 0, "housingLevy": 0, "net": 0}
    for e in emps:
        s = statutory(e["salary_kes"])
        t["gross"] += e["salary_kes"]
        for k in ("paye", "nssf", "shif", "housingLevy", "net"):
            t[k] += s[k]
    preparer = query_one("SELECT name FROM employees WHERE id = $1", [me.employeeId])
    with tx() as db:
        run = query_one(
            """INSERT INTO payroll_runs (workspace_id, period, status, employees, gross, net, paye, shif, nssf, housing_levy, bonuses, prepared_by, position)
         VALUES ($1,$2,'Pending Approval',$3,$4,$5,$6,$7,$8,$9,$10,$11,-1) RETURNING id""",
            [me.workspaceId, b.period, len(emps), t["gross"], t["net"] + b.bonuses, t["paye"], t["shif"], t["nssf"], t["housingLevy"], b.bonuses, preparer["name"]],  # type: ignore[index]
            db,
        )
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
                [run["id"], step, a["role"], a["name"] or "—", "Pending"],  # type: ignore[index]
                db,
            )
        run_id = run["id"]  # type: ignore[index]
    audit(request, me, "payroll.generated", "payroll_run", run_id, {"period": b.period})
    return JSONResponse(jsonable_encoder(run_with_approvals(run_id)), status_code=201)


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
