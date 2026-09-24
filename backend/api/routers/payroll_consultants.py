"""Consultant pay from approved timesheets: payable hours, 5% withholding tax and payout batches (Finance → HR)."""

from __future__ import annotations

import json
import re
import secrets
from typing import Any

import psycopg
from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from ..approval_chain import build_chain, sign_next, signer_name
from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, parse
from ..payroll_calc import js_round, withholding
from ..repository import owned
from ..roles import ADMIN, PAYROLL
from ..security import AuthContext, require_role

router = APIRouter()

payroll_role = require_role(*PAYROLL)
payer_role = require_role(*ADMIN, "finance")

MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"
CHAIN = ["Finance", "HR"]


def _period(request: Request) -> str:
    p = request.query_params.get("period") or "2026-09"
    if not re.match(MONTH, p):
        raise bad_request("period must be YYYY-MM")
    return p


def to_payout(p: dict[str, Any], lines: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    out = {
        "id": p["id"], "period": p["period"], "status": p["status"], "consultants": p["consultants"], "hours": p["hours"],
        "gross": p["gross"], "wht": p["wht"], "net": p["net"], "approvals": p["approvals"] or [],
        "paymentRef": p["payment_ref"], "paidAt": iso(p["paid_at"]) or None, "createdAt": iso(p["created_at"]),
    }
    if lines is not None:
        out["lines"] = [{"employeeId": l["employee_id"], "hours": l["hours"], "rate": l["rate"], "gross": l["gross"], "wht": l["wht"], "net": l["net"]} for l in lines]
    return out


def consultant_rows(workspace_id: str, period: str, db: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    """Payable figures per consultant for the month: approved timesheets only; pending hours shown for context."""
    people = query(
        """SELECT id, name, title, phone, employee_no FROM employees
            WHERE workspace_id = $1 AND employment_type = 'Consultant' AND status <> 'Exited' ORDER BY name""",
        [workspace_id],
        db,
    )
    sheets = query(
        """SELECT t.id, t.employee_id, t.status, t.rate_kes,
                  (SELECT COALESCE(sum(h), 0) FROM timesheet_entries te, unnest(te.hours) h WHERE te.timesheet_id = t.id) AS hours
             FROM timesheets t
            WHERE t.workspace_id = $1 AND to_char(t.week_start, 'YYYY-MM') = $2""",
        [workspace_id, period],
        db,
    )
    paid = {
        l["employee_id"]: l
        for l in query(
            """SELECT l.*, p.status AS payout_status FROM consultant_payout_lines l JOIN consultant_payouts p ON p.id = l.payout_id
                WHERE p.workspace_id = $1 AND l.period = $2""",
            [workspace_id, period],
            db,
        )
    }
    rows = []
    for e in people:
        mine = [s for s in sheets if s["employee_id"] == e["id"]]
        approved = [s for s in mine if s["status"] == "Approved"]
        hours = sum(float(s["hours"]) for s in approved)
        gross = js_round(sum(float(s["hours"]) * s["rate_kes"] for s in approved))
        rate = js_round(gross / hours) if hours else (mine[0]["rate_kes"] if mine else 0)
        pending = sum(float(s["hours"]) for s in mine if s["status"] == "Pending")
        row: dict[str, Any] = {
            "employeeId": e["id"], "name": e["name"], "title": e["title"], "phone": e["phone"] or "",
            "hours": hours, "pendingHours": pending, "weeks": len(approved), "rate": rate,
            "gross": gross, "wht": withholding(gross), "net": gross - withholding(gross),
            "timesheetIds": [s["id"] for s in approved], "payoutId": None, "paymentRef": None,
            "status": "Ready" if hours > 0 else "Awaiting approval",
        }
        if e["id"] in paid:
            l = paid[e["id"]]
            # Figures are frozen once a consultant is in a payout batch.
            row.update(hours=l["hours"], rate=l["rate"], gross=l["gross"], wht=l["wht"], net=l["net"], payoutId=l["payout_id"], status=l["payout_status"])
        rows.append(row)
    return rows


@router.get("/payroll/consultants")
def list_consultants(request: Request, me: AuthContext = Depends(payroll_role)):
    period = _period(request)
    rows = consultant_rows(me.workspaceId, period)
    payouts = query("SELECT * FROM consultant_payouts WHERE workspace_id = $1 AND period = $2 ORDER BY created_at DESC", [me.workspaceId, period])
    refs = {p["id"]: p["payment_ref"] for p in payouts}
    for r in rows:
        r["paymentRef"] = refs.get(r["payoutId"]) if r["payoutId"] else None
    return {"period": period, "whtRate": 0.05, "consultants": rows, "payouts": [to_payout(p) for p in payouts]}


class PayoutIn(BaseModel):
    model_config = ConfigDict(strict=True)

    period: str = Field(pattern=MONTH)
    employeeIds: list[str] | None = None


@router.post("/payroll/consultants/payouts")
def create_payout(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(payer_role)):
    """Batches every ready consultant (or the chosen ones) into a draft payout awaiting Finance → HR sign-off."""
    b = parse(PayoutIn, body)
    with tx() as db:
        ready = [r for r in consultant_rows(me.workspaceId, b.period, db) if r["status"] == "Ready" and (b.employeeIds is None or r["employeeId"] in b.employeeIds)]
        if not ready:
            raise bad_request("No consultants with approved, unpaid hours for this period")
        totals = {k: sum(r[k] for r in ready) for k in ("hours", "gross", "wht", "net")}
        p = query_one(
            """INSERT INTO consultant_payouts (workspace_id, period, status, consultants, hours, gross, wht, net, approvals, created_by)
               VALUES ($1,$2,'Draft',$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
            [me.workspaceId, b.period, len(ready), totals["hours"], totals["gross"], totals["wht"], totals["net"], json.dumps(build_chain(me.workspaceId, CHAIN, db)), me.employeeId],
            db,
        )
        for r in ready:
            query(
                """INSERT INTO consultant_payout_lines (payout_id, employee_id, period, hours, rate, gross, wht, net, timesheet_ids)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
                [p["id"], r["employeeId"], b.period, r["hours"], r["rate"], r["gross"], r["wht"], r["net"], r["timesheetIds"]],  # type: ignore[index]
                db,
            )
        lines = query("SELECT * FROM consultant_payout_lines WHERE payout_id = $1", [p["id"]], db)  # type: ignore[index]
    audit(request, me, "consultant_payout.created", "consultant_payout", p["id"], {"period": b.period, "consultants": len(ready)})  # type: ignore[index]
    return JSONResponse(to_payout(p, lines), status_code=201)  # type: ignore[arg-type]


@router.post("/payroll/consultants/payouts/{id}/approve")
def approve_payout(id: str, request: Request, me: AuthContext = Depends(payer_role)):
    with tx() as db:
        p = owned("consultant_payouts", id, me.workspaceId, "Payout", db)
        if p["status"] != "Draft":
            raise bad_request(f"Payout is already {p['status'].lower()}")
        chain, done = sign_next(p["approvals"] or [], me.role, signer_name(me.employeeId, db))
        p = query_one(
            "UPDATE consultant_payouts SET approvals = $2, status = $3 WHERE id = $1 RETURNING *",
            [id, json.dumps(chain), "Approved" if done else "Draft"],
            db,
        )
    audit(request, me, "consultant_payout.approved", "consultant_payout", id)
    return to_payout(p)  # type: ignore[arg-type]


@router.post("/payroll/consultants/payouts/{id}/pay")
def pay_payout(id: str, request: Request, me: AuthContext = Depends(payer_role)):
    """Placeholder for M-Pesa B2C: no money moves — the batch is marked Paid with a placeholder reference."""
    p = owned("consultant_payouts", id, me.workspaceId, "Payout")
    if p["status"] != "Approved":
        raise bad_request("Payout must be approved by Finance and HR before paying")
    # TODO: call the Daraja B2C API per line and store each M-Pesa transaction id.
    ref = f"B2C-PLACEHOLDER-{secrets.token_hex(4).upper()}"
    p = query_one("UPDATE consultant_payouts SET status = 'Paid', payment_ref = $2, paid_at = now() WHERE id = $1 RETURNING *", [id, ref])
    audit(request, me, "consultant_payout.paid", "consultant_payout", id, {"ref": ref, "placeholder": True})
    return to_payout(p)  # type: ignore[arg-type]


@router.delete("/payroll/consultants/payouts/{id}")
def delete_payout(id: str, request: Request, me: AuthContext = Depends(payer_role)):
    """Cancels a draft batch nobody has signed yet, releasing its consultants."""
    p = owned("consultant_payouts", id, me.workspaceId, "Payout")
    if p["status"] != "Draft" or any(a.get("status") == "Approved" for a in p["approvals"] or []):
        raise bad_request("Only unsigned draft payouts can be cancelled")
    query("DELETE FROM consultant_payouts WHERE id = $1", [id])
    audit(request, me, "consultant_payout.cancelled", "consultant_payout", id)
    return Response(status_code=204)
