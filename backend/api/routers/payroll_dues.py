"""Final dues for leavers, signed off Finance → HR → CEO.

Amounts come from the offboarding settlement when that table exists (owned by the offboarding module);
otherwise from offboardings.final_dues_kes.
"""

from __future__ import annotations

from typing import Any

import psycopg
from fastapi import APIRouter, Depends, Request

from ..approval_chain import build_chain, can_sign, signer_name
from ..audit import audit
from ..db import query_one, SCHEMA, iso, query, tx
from ..errors import bad_request, forbidden, not_found
from ..roles import PAYROLL
from ..security import AuthContext, require_role

router = APIRouter()

payroll_role = require_role(*PAYROLL)
CHAIN = ["Finance", "HR", "CEO"]

_TOTAL_KEYS = ("total_kes", "net_total_kes", "total", "net_kes", "final_dues_kes", "gross_total_kes", "amount_kes")
_SKIP_KEYS = {"position", "version", "days", "notice_days", "leave_days"}


def _settlements_table_exists(db: psycopg.Connection | None = None) -> bool:
    # to_regclass resolves within the Annex HR search_path and is much cheaper than information_schema.
    row = query("SELECT to_regclass($1) IS NOT NULL AS ok", [f'{SCHEMA}."offboarding_settlements"'], db)
    return bool(row and row[0]["ok"])


def _label(col: str) -> str:
    base = col.removesuffix("_kes").replace("_", " ").strip()
    return base[:1].upper() + base[1:]


def _known_settlement(s: dict[str, Any]) -> tuple[list[dict[str, Any]], float]:
    """The offboarding module's settlement shape: earnings, statutory deductions and recoveries, net payable."""
    salary = float(s["monthly_salary_kes"])
    unpaid_days, leave_days = float(s["unpaid_days"]), float(s["leave_days"])
    lines = [
        {"label": f"Unpaid salary · {unpaid_days:g} days", "amount": round(salary * unpaid_days / 30)},
        {"label": f"Leave encashment · {leave_days:g} days", "amount": round(salary / 22 * leave_days)},
        {"label": "Notice pay in lieu" if float(s["notice_pay_kes"]) else "Notice pay · served in full", "amount": float(s["notice_pay_kes"])},
        {"label": "PAYE", "amount": -float(s["paye_kes"])},
        {"label": "SHIF · NSSF · Housing Levy", "amount": -(float(s["shif_kes"]) + float(s["nssf_kes"]) + float(s["housing_levy_kes"]))},
    ]
    for col, label in (("asset_deduction_kes", "Unreturned asset recovery"), ("loan_kes", "Loan / advance recovery"), ("other_deduction_kes", "Other deductions")):
        if float(s[col]):
            lines.append({"label": label, "amount": -float(s[col])})
    return lines, float(s["net_kes"])


#: Sign-offs already recorded on the offboarding settlement count toward the same Finance → HR → CEO steps.
_SETTLEMENT_STEP_COLS = {0: "finance", 1: "hr", 2: "ceo"}


def _from_settlement(s: dict[str, Any]) -> tuple[list[dict[str, Any]], float | None]:
    """Reads a settlement row without depending on its exact columns: an explicit line list if present, else numeric *_kes columns."""
    for key in ("lines", "items", "breakdown", "components"):
        v = s.get(key)
        if isinstance(v, list) and v and isinstance(v[0], dict):
            lines = []
            for it in v:
                amount = it.get("amount") if it.get("amount") is not None else it.get("amountKES", it.get("value", 0))
                label = it.get("label") or it.get("name") or it.get("item") or "Item"
                try:
                    lines.append({"label": str(label), "amount": float(amount or 0)})
                except (TypeError, ValueError):
                    continue
            total = next((float(s[k]) for k in _TOTAL_KEYS if isinstance(s.get(k), (int, float))), None)
            return lines, total
    lines = []
    for col, v in s.items():
        if not isinstance(v, (int, float)) or isinstance(v, bool) or col in _TOTAL_KEYS or col in _SKIP_KEYS or not col.endswith("_kes"):
            continue
        amount = -abs(float(v)) if ("deduction" in col or "recover" in col or "advance" in col) else float(v)
        lines.append({"label": _label(col), "amount": amount})
    total = next((float(s[k]) for k in _TOTAL_KEYS if isinstance(s.get(k), (int, float)) and not isinstance(s.get(k), bool)), None)
    return lines, total


def _dues(workspace_id: str, db: psycopg.Connection | None = None, only: str | None = None) -> list[dict[str, Any]]:
    params: list[Any] = [workspace_id] + ([only] if only else [])
    offs = query(
        f"""SELECT o.*, e.name, e.title, e.employee_no, e.department_id,
                   COALESCE((SELECT json_agg(a.name ORDER BY a.position) FROM offboarding_assets a WHERE a.offboarding_id = o.id AND NOT a.returned), '[]') AS outstanding
              FROM offboardings o JOIN employees e ON e.id = o.employee_id
             WHERE o.workspace_id = $1 {"AND o.id = $2" if only else ""}
             ORDER BY o.last_day""",
        params,
        db,
    )
    if not offs:
        return []
    ids = [o["id"] for o in offs]
    settlements: dict[str, dict[str, Any]] = {}
    if _settlements_table_exists(db):
        sql = "SELECT * FROM offboarding_settlements WHERE offboarding_id = ANY($1)"
        try:
            # A savepoint keeps the caller's transaction usable if the other module's table isn't shaped as expected.
            if db is not None:
                with db.transaction():
                    rows = query(sql, [ids], db)
            else:
                rows = query(sql, [ids])
            settlements = {s["offboarding_id"]: s for s in rows if s.get("offboarding_id")}
        except psycopg.Error:
            settlements = {}
    signed: dict[str, list[dict[str, Any]]] = {}
    for a in query("SELECT * FROM final_dues_approvals WHERE offboarding_id = ANY($1) ORDER BY step", [ids], db):
        signed.setdefault(a["offboarding_id"], []).append(a)
    template = build_chain(workspace_id, CHAIN, db)
    signer_ids = [st.get(f"{c}_by") for st in settlements.values() for c in _SETTLEMENT_STEP_COLS.values() if st.get(f"{c}_by")]
    names = {r["id"]: r["name"] for r in query("SELECT id, name FROM employees WHERE id = ANY($1)", [signer_ids], db)} if signer_ids else {}

    out = []
    for o in offs:
        lines: list[dict[str, Any]] = []
        total: float | None = None
        source = "offboarding"
        st = settlements.get(o["id"])
        if st:
            try:
                lines, total = _known_settlement(st)
            except (KeyError, TypeError, ValueError):
                lines, total = _from_settlement(st)
            source = "settlement"
        if total is None:
            total = sum(l["amount"] for l in lines) if lines else float(o["final_dues_kes"])
        if not lines:
            lines = [{"label": "Final dues per offboarding record", "amount": total}]
        by_step = {a["step"]: {"name": a["name"], "at": iso(a["decided_at"])[:10]} for a in signed.get(o["id"], [])}
        if st:
            for step, col in _SETTLEMENT_STEP_COLS.items():
                if step not in by_step and st.get(f"{col}_at"):
                    by_step[step] = {"name": names.get(st.get(f"{col}_by") or "", ""), "at": iso(st[f"{col}_at"])[:10]}
        approvals = [
            {**t, "status": "Approved", "name": by_step[t["step"]]["name"] or t["name"], "at": by_step[t["step"]]["at"]} if t["step"] in by_step else t
            for t in template
        ]
        done = all(a["status"] == "Approved" for a in approvals)
        out.append({
            "offboardingId": o["id"], "employeeId": o["employee_id"], "name": o["name"], "title": o["title"], "employeeNo": o["employee_no"],
            "reason": o["reason"], "lastDay": o["last_day"], "noticeDays": o["notice_days"], "source": source,
            "lines": lines, "total": round(total, 2), "assetsOutstanding": o["outstanding"],
            "approvals": approvals, "status": "Approved" if done else "Pending",
        })
    return out


@router.get("/payroll/final-dues")
def list_final_dues(me: AuthContext = Depends(payroll_role)):
    with tx() as db:
        return _dues(me.workspaceId, db)


@router.post("/payroll/final-dues/{offboardingId}/approve")
def approve_final_dues(offboardingId: str, request: Request, me: AuthContext = Depends(payroll_role)):
    """Signs the next step (Finance → HR → CEO) for the caller's role.

    When the exit has a settlement (Offboarding → Final settlement), that settlement's approval
    chain is the single source of truth, so Payroll and Offboarding always agree.
    """
    has_settlement = _settlements_table_exists() and query_one(
        "SELECT 1 FROM offboarding_settlements s JOIN offboardings o ON o.id = s.offboarding_id WHERE s.offboarding_id = $1 AND o.workspace_id = $2",
        [offboardingId, me.workspaceId],
    )
    if has_settlement:
        from .lifecycle import SETTLE_STAGES, approve_settlement  # local import: sibling router

        s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [offboardingId])
        pending = next((st for st, col, _ in SETTLE_STAGES if not (s and s[f"{col}_at"])), None)
        mine = next((st for st, _, roles in SETTLE_STAGES if me.role in roles), None)
        # Sign the next pending stage; otherwise the settlement chain reports why the caller can't.
        stage = pending if pending and me.role in dict((st, r) for st, _, r in SETTLE_STAGES)[pending] else (mine or "Finance")
        approve_settlement(offboardingId, request, {"stage": stage}, me)
        return get_final_dues(offboardingId, me)
    with tx() as db:
        items = _dues(me.workspaceId, db, offboardingId)
        if not items:
            raise not_found("Offboarding")
        it = items[0]
        pending = [a for a in it["approvals"] if a["status"] == "Pending"]
        if not pending:
            raise bad_request("Final dues are already fully approved")
        step = pending[0]
        if not can_sign(step["role"], me.role):
            raise forbidden(f"Waiting for {step['role']} approval")
        query(
            """INSERT INTO final_dues_approvals (workspace_id, offboarding_id, step, role, name, decided_by, amount_kes)
               VALUES ($1,$2,$3,$4,$5,$6,$7)""",
            [me.workspaceId, offboardingId, step["step"], step["role"], signer_name(me.employeeId, db) or step["name"], me.employeeId, it["total"]],
            db,
        )
        if len(pending) == 1:
            query(
                """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience)
                   VALUES ($1, NULL, 'payroll', $2, $3, '/app/payroll?tab=dues', 'admins')""",
                [me.workspaceId, f"Final dues approved for {it['name']}", "Finance, HR and the CEO have signed off. Queued for the next bank run."],
                db,
            )
        result = _dues(me.workspaceId, db, offboardingId)[0]
    audit(request, me, "final_dues.approved", "offboarding", offboardingId, {"step": step["role"]})
    return result


@router.get("/payroll/final-dues/{offboardingId}")
def get_final_dues(offboardingId: str, me: AuthContext = Depends(payroll_role)):
    items = _dues(me.workspaceId, None, offboardingId)
    if not items:
        raise not_found("Offboarding")
    return items[0]
