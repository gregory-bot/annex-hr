"""Sequential sign-off chains stored as JSON ([{step, role, name, status, at}]) — used by payroll-owned approvals."""

from __future__ import annotations

import datetime as dt
from typing import Any

import psycopg

from .db import query
from .errors import bad_request, forbidden

#: Which employee roles may sign each chain step (super_admin may sign any step).
STEP_ROLES: dict[str, tuple[str, ...]] = {
    "Finance": ("finance",),
    "HR": ("company_admin", "hr_officer"),
    "CEO": ("ceo",),
}
#: The role whose first employee is shown as the named approver for a step.
_NAMED_ROLE = {"Finance": "finance", "HR": "company_admin", "CEO": "ceo"}


def build_chain(workspace_id: str, steps: list[str], db: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    rows = query(
        """SELECT DISTINCT ON (role) role, name FROM employees
            WHERE workspace_id = $1 AND role = ANY($2) AND status <> 'Exited' ORDER BY role, employee_no""",
        [workspace_id, [_NAMED_ROLE[s] for s in steps]],
        db,
    )
    names = {r["role"]: r["name"] for r in rows}
    return [{"step": i, "role": step, "name": names.get(_NAMED_ROLE[step], "—"), "status": "Pending", "at": None} for i, step in enumerate(steps)]


def can_sign(step_role: str, role: str) -> bool:
    return role == "super_admin" or role in STEP_ROLES.get(step_role, ())


def sign_next(chain: list[dict[str, Any]], role: str, signer_name: str | None) -> tuple[list[dict[str, Any]], bool]:
    """Approves the next pending step for the caller's role. Returns the new chain and whether it is complete."""
    pending = [a for a in chain if a.get("status") == "Pending"]
    if not pending:
        raise bad_request("Nothing left to approve")
    step = pending[0]
    if not can_sign(step["role"], role):
        raise forbidden(f"Waiting for {step['role']} approval")
    out = [
        {**a, "status": "Approved", "at": dt.date.today().isoformat(), "name": signer_name or a.get("name")} if a["step"] == step["step"] else a
        for a in chain
    ]
    return out, len(pending) == 1


def signer_name(employee_id: str | None, db: psycopg.Connection | None = None) -> str | None:
    if not employee_id:
        return None
    row = query("SELECT name FROM employees WHERE id = $1", [employee_id], db)
    return row[0]["name"] if row else None
