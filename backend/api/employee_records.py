"""Shared helpers for employee files, extended profiles and per-employee onboarding views.

Access rules (the API is the source of truth):
- Files: the employee, ADMIN roles and the CEO; managers for their direct reports.
- Bank details and statutory numbers: full for the employee, ADMIN roles and finance;
  masked (last 3 characters) for everyone else, and managers see no bank data at all.
"""

from __future__ import annotations

import re
from typing import Any, Literal

import psycopg

from .db import Row, iso, query_one
from .roles import is_admin
from .security import AuthContext

FILE_CATEGORIES = ("National ID", "KRA PIN", "SHIF", "NSSF", "Passport", "NDA", "Contract", "Certificate", "Other")

#: Onboarding document tasks → the file category and the profile/employee column holding their number.
DOC_TASKS: dict[str, tuple[str, str]] = {
    "id": ("National ID", "national_id"),
    "kra": ("KRA PIN", "kra_pin"),
    "shif": ("SHIF", "shif_number"),
    "nssf": ("NSSF", "nssf_number"),
    "passport": ("Passport", "passport_number"),
}

#: File metadata columns (never the bytes) for a `employee_files f` alias.
FILE_META = """f.id, f.employee_id, f.category, f.task_id, f.filename, f.content_type, f.size_bytes, f.sha256, f.uploaded_by, f.created_at,
  (SELECT u.name FROM employees u WHERE u.id = f.uploaded_by) AS uploaded_by_name"""

_MASK = re.compile(r".(?=.{3})")

Level = Literal["full", "masked", "none"]


def to_file(f: Row) -> dict[str, Any]:
    return {
        "id": f["id"],
        "employeeId": f["employee_id"],
        "category": f["category"],
        "taskId": f.get("task_id"),
        "filename": f["filename"],
        "contentType": f["content_type"],
        "sizeBytes": f["size_bytes"],
        "sha256": f["sha256"],
        "uploadedBy": f.get("uploaded_by"),
        "uploadedByName": f.get("uploaded_by_name"),
        "createdAt": iso(f.get("created_at")),
    }


def mask(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return _MASK.sub("•", str(value))


def statutory_level(viewer: AuthContext, employee_id: str) -> Level:
    return "full" if viewer.employeeId == employee_id or is_admin(viewer.role) or viewer.role == "finance" else "masked"


def bank_level(viewer: AuthContext, employee_id: str) -> Level:
    if viewer.employeeId == employee_id or is_admin(viewer.role) or viewer.role == "finance":
        return "full"
    return "none" if viewer.role == "manager" else "masked"


def shown(value: Any, level: Level) -> str | None:
    if value in (None, ""):
        return None
    if level == "full":
        return str(value)
    return mask(value) if level == "masked" else None


def can_view_files(viewer: AuthContext, employee: Row) -> bool:
    if viewer.employeeId == employee["id"] or is_admin(viewer.role) or viewer.role == "ceo":
        return True
    return viewer.role == "manager" and employee.get("manager_id") == viewer.employeeId


# ── Onboarding (one query per view) ─────────────────────────────────
ONBOARDING_TASKS_SQL = f"""COALESCE((SELECT json_agg(x ORDER BY x.position) FROM (
    SELECT t.id, t.title, t.description, t.category, t.required, t.position, c.completed_at, c.payload,
      (SELECT row_to_json(ff) FROM (SELECT {FILE_META} FROM employee_files f WHERE f.id = c.file_id) ff) AS file
    FROM onboarding_tasks t
    LEFT JOIN onboarding_task_completions c ON c.workspace_id = t.workspace_id AND c.task_id = t.id AND c.employee_id = $2
    WHERE t.workspace_id = $1) x), '[]'::json)"""

ONBOARDING_VIEW_SQL = f"""SELECT
  (SELECT row_to_json(e) FROM (SELECT id, name, status, onboarding_progress, kra_pin, national_id, manager_id FROM employees WHERE id = $2 AND workspace_id = $1) e) AS emp,
  (SELECT row_to_json(p) FROM employee_profiles p WHERE p.employee_id = $2) AS profile,
  {ONBOARDING_TASKS_SQL} AS tasks"""


def task_values(task_id: str, emp: Row, profile: Row | None, payload: Any, stat: Level, bank: Level) -> dict[str, Any] | None:
    """The saved form values for a task, so the checklist restores exactly after a reload."""
    p = profile or {}
    if task_id in DOC_TASKS:
        col = DOC_TASKS[task_id][1]
        raw = emp.get(col) if col in ("kra_pin", "national_id") else p.get(col)
        return {"number": shown(raw, stat)} if raw else None
    if task_id == "nda":
        return {"signature": p.get("nda_signature"), "signedAt": iso(p.get("nda_signed_at")) or None} if p.get("nda_signature") else None
    if task_id == "emergency":
        if not p.get("emergency_name"):
            return None
        return {"name": p.get("emergency_name"), "relationship": p.get("emergency_relationship"), "phone": p.get("emergency_phone")}
    if task_id == "bank":
        if not p.get("bank_account_number") or bank == "none":
            return None
        return {
            "bankName": p.get("bank_name"),
            "branch": p.get("bank_branch"),
            "accountName": p.get("bank_account_name"),
            "accountNumber": shown(p.get("bank_account_number"), bank),
        }
    return payload if isinstance(payload, dict) and payload else None


def map_tasks(rows: list[Row], emp: Row, profile: Row | None, viewer: AuthContext, with_files: bool = True, with_values: bool = True) -> list[dict[str, Any]]:
    stat, bank = statutory_level(viewer, emp["id"]), bank_level(viewer, emp["id"])
    out = []
    for t in rows:
        item: dict[str, Any] = {
            "id": t["id"],
            "title": t["title"],
            "description": t["description"],
            "category": t["category"],
            "required": t["required"],
            "completedAt": iso(t["completed_at"]) if t.get("completed_at") else None,
            "file": to_file(t["file"]) if with_files and t.get("file") else None,
        }
        if with_values:
            item["values"] = task_values(t["id"], emp, profile, t.get("payload"), stat, bank)
        out.append(item)
    return out


def onboarding_view(viewer: AuthContext, employee_id: str, db: psycopg.Connection | None = None) -> dict[str, Any] | None:
    b = query_one(ONBOARDING_VIEW_SQL, [viewer.workspaceId, employee_id], db)
    if not b or not b["emp"]:
        return None
    emp = b["emp"]
    tasks = map_tasks(b["tasks"], emp, b["profile"], viewer)
    return {
        "employeeId": emp["id"],
        "status": emp["status"],
        "onboardingProgress": emp["onboarding_progress"],
        "requiredLeft": sum(1 for t in tasks if t["required"] and not t["completedAt"]),
        "tasks": tasks,
    }


def recompute_onboarding(db: psycopg.Connection, workspace_id: str, employee_id: str) -> Row:
    """Progress = completed / all tasks; finishing every required task moves Onboarding → Probation."""
    return query_one(  # type: ignore[return-value]
        """WITH s AS (
         SELECT count(c.task_id)::int AS done, count(*)::int AS total,
                count(*) FILTER (WHERE t.required AND c.task_id IS NULL)::int AS required_left
           FROM onboarding_tasks t
           LEFT JOIN onboarding_task_completions c ON c.workspace_id = t.workspace_id AND c.task_id = t.id AND c.employee_id = $2
          WHERE t.workspace_id = $1)
       UPDATE employees e SET
         onboarding_progress = LEAST(100, ROUND(100.0 * s.done / GREATEST(1, s.total)))::int,
         status = CASE WHEN s.required_left = 0 AND e.status = 'Onboarding' THEN 'Probation' ELSE e.status END,
         updated_at = now()
       FROM s WHERE e.id = $2 AND e.workspace_id = $1
       RETURNING e.onboarding_progress, e.status, s.required_left""",
        [workspace_id, employee_id],
        db,
    )
