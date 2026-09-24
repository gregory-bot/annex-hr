"""Row → API mappers and the single-query workspace bootstrap.

Every mapper returns the camelCase shape defined in shared/src/types.ts, so the
frontend is unaffected by the backend implementation. Optional fields that are
NULL are omitted, matching the TypeScript `?:` fields.
"""

from __future__ import annotations

import datetime as dt
import re
from collections import defaultdict
from typing import Any

import psycopg

from .db import Row, iso, query, query_one
from .roles import can_see_pay, is_admin, is_exec
from .security import AuthContext

#: Ticket teams whose tickets are private to the reporter, the assignee and HR/exec roles.
PRIVATE_TICKET_TEAMS = ["HR"]


def _compact(d: dict[str, Any], optional: tuple[str, ...]) -> dict[str, Any]:
    for k in optional:
        if d.get(k) is None:
            d.pop(k, None)
    return d


def _group(rows: list[Row], key: str) -> dict[str, list[Row]]:
    out: dict[str, list[Row]] = defaultdict(list)
    for r in rows:
        out[r[key]].append(r)
    return out


def _year(v: Any) -> int:
    if isinstance(v, dt.datetime):
        return v.year
    try:
        return int(str(v)[:4])
    except (TypeError, ValueError):
        return dt.date.today().year


# ── Mappers ─────────────────────────────────────────────────────────
def to_workspace(w: Row, offices: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": w["id"],
        "slug": w["slug"],
        "name": w["name"],
        "industry": w["industry"],
        "country": w["country"],
        "size": w["size"],
        "domain": w["domain"],
        "logoText": w["logo_text"],
        "plan": w["plan"],
        "founded": w.get("founded") or _year(w.get("created_at")),
        "offices": [{"city": o["city"], "country": o["country"], "address": o["address"], "headcount": o["headcount"]} for o in offices or []],
        "logoUrl": logo_url(w["id"], w.get("logo_version")),
        "brandPrimary": w.get("brand_primary") or DEFAULT_BRAND_PRIMARY,
        "brandSecondary": w.get("brand_secondary") or DEFAULT_BRAND_SECONDARY,
        "customDomain": w.get("custom_domain"),
        "customDomainVerified": bool(w.get("custom_domain_verified_at")),
    }


DEFAULT_BRAND_PRIMARY = "#C1121F"
DEFAULT_BRAND_SECONDARY = "#E63946"


def logo_url(workspace_id: str, version: Any) -> str | None:
    """Cache-busted logo URL (the version is the upload time as epoch seconds), or None without a logo."""
    return f"/api/workspaces/{workspace_id}/logo?v={int(version)}" if version is not None else None


def to_department(d: Row) -> dict[str, Any]:
    return {"id": d["id"], "name": d["name"], "headId": d.get("head_id") or "", "color": d["color"], "budgetKES": d["budget_kes"]}


def to_employee(e: Row) -> dict[str, Any]:
    return _compact(
        {
            "id": e["id"],
            "workspaceId": e["workspace_id"],
            "employeeNo": e["employee_no"],
            "name": e["name"],
            "email": e["email"],
            "phone": e.get("phone") or "",
            "photo": e.get("photo"),
            "title": e["title"],
            "departmentId": e.get("department_id") or "",
            "managerId": e.get("manager_id"),
            "role": e["role"],
            "employmentType": e["employment_type"],
            "status": e["status"],
            "gender": e.get("gender"),
            "location": e.get("location") or "",
            "startDate": e["start_date"],
            "birthday": e.get("birthday") or "",
            "salaryKES": e["salary_kes"],
            "probationEnd": e.get("probation_end"),
            "performance": e["performance"],
            "potential": e["potential"],
            "onboardingProgress": e["onboarding_progress"],
            "kraPin": e.get("kra_pin") or "",
            "nationalId": e.get("national_id") or "",
        },
        ("photo", "managerId", "probationEnd"),
    )


def to_leave(l: Row) -> dict[str, Any]:
    return _compact(
        {
            "id": l["id"],
            "employeeId": l["employee_id"],
            "type": l["type"],
            "start": l["start_date"],
            "end": l["end_date"],
            "days": l["days"],
            "reason": l["reason"],
            "status": l["status"],
            "stage": l["stage"],
            "submitted": l["submitted_at"],
            "handoverTo": l.get("handover_to"),
            "handoverNotes": l["handover_notes"],
        },
        ("handoverTo",),
    )


def to_payroll_run(p: Row, approvals: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": p["id"],
        "period": p["period"],
        "status": p["status"],
        "employees": p["employees"],
        "gross": p["gross"],
        "net": p["net"],
        "paye": p["paye"],
        "shif": p["shif"],
        "nssf": p["nssf"],
        "housingLevy": p["housing_levy"],
        "bonuses": p["bonuses"],
        "preparedBy": p["prepared_by"],
        "approvals": [_compact({"role": a["role"], "name": a["name"], "status": a["status"], "at": a.get("decided_at")}, ("at",)) for a in approvals or []],
    }


def to_policy(p: Row, history: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": p["id"],
        "title": p["title"],
        "category": p["category"],
        "version": p["version"],
        "updated": p["updated_on"],
        "owner": p["owner"],
        "mandatory": p["mandatory"],
        "acknowledged": p["acknowledged"],
        "summary": p["summary"],
        "history": [{"version": h["version"], "date": h["date"], "note": h["note"]} for h in history or []],
    }


def to_compliance_doc(c: Row) -> dict[str, Any]:
    return _compact(
        {"id": c["id"], "employeeId": c["employee_id"], "type": c["type"], "number": c["number"], "issued": c["issued"], "expires": c.get("expires"), "status": c["status"]},
        ("expires",),
    )


def to_case(c: Row, events: list[Row] | None = None, evidence: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": c["id"],
        "ref": c["ref"],
        "type": c["type"],
        "subjectId": c["subject_id"],
        "reportedBy": c["reported_by"],
        "opened": c["opened"],
        "status": c["status"],
        "severity": c["severity"],
        "assignedTo": c.get("assigned_to") or "",
        "confidential": c["confidential"],
        "summary": c["summary"],
        "timeline": [{"date": t["date"], "title": t["title"], "by": t["by_name"], "note": t["note"]} for t in events or []],
        "evidence": [{"name": e["name"], "size": e["size"], "uploaded": e["uploaded"]} for e in evidence or []],
    }


def to_offboarding(o: Row, assets: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": o["id"],
        "employeeId": o["employee_id"],
        "reason": o["reason"],
        "submitted": o["submitted"],
        "lastDay": o["last_day"],
        "noticeDays": o["notice_days"],
        "progress": o["progress"],
        "handover": o["handover"],
        "exitInterview": o["exit_interview"],
        "finalDuesKES": o["final_dues_kes"],
        "assets": [{"name": a["name"], "returned": a["returned"]} for a in assets or []],
    }


def to_timesheet(t: Row, entries: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": t["id"],
        "employeeId": t["employee_id"],
        "week": t["week_start"],
        "status": t["status"],
        "rate": t["rate_kes"],
        "entries": [{"project": e["project"], "billable": e["billable"], "hours": [float(h) for h in e["hours"]]} for e in entries or []],
    }


def to_survey(s: Row) -> dict[str, Any]:
    return {
        "id": s["id"],
        "title": s["title"],
        "status": s["status"],
        "responses": s["responses"],
        "audience": s["audience"],
        "engagement": s["engagement"],
        "enps": s["enps"],
        "closes": s["closes"],
        "anonymous": s["anonymous"],
    }


def relative_time(value: Any) -> str:
    if not value:
        return "Just now"
    when = value if isinstance(value, dt.datetime) else dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    mins = round((dt.datetime.now(dt.timezone.utc) - when).total_seconds() / 60)
    if mins < 1:
        return "Just now"
    if mins < 60:
        return f"{mins}m ago"
    hours = round(mins / 60)
    if hours < 24:
        return f"{hours}h ago"
    days = round(hours / 24)
    return "Yesterday" if days == 1 else f"{days} days ago"


def to_notification(n: Row) -> dict[str, Any]:
    return {
        "id": n["id"],
        "type": n["type"],
        "title": n["title"],
        "body": n["body"],
        "href": n["href"],
        "read": n["read"],
        "time": n.get("time_label") or relative_time(n.get("created_at")),
    }


def to_document(d: Row, versions: list[Row] | None = None) -> dict[str, Any]:
    return {
        "id": d["id"],
        "name": d["name"],
        "folder": d["folder"],
        "size": d["size"],
        "type": d["type"],
        "updated": d["updated_on"],
        "owner": d["owner"],
        "version": d["version"],
        "versions": [{"version": v["version"], "date": v["date"], "by": v["by_name"]} for v in versions or []],
    }


def to_ticket_team(t: Row) -> dict[str, Any]:
    return {"id": t["id"], "key": t["key"], "name": t["name"], "color": t["color"]}


def to_ticket(t: Row) -> dict[str, Any]:
    """Maps a ticket row; `comments` is the json_agg built by TICKET_SELECT."""
    return _compact(
        {
            "id": t["id"],
            "identifier": t["identifier"],
            "teamId": t["team_id"],
            "title": t["title"],
            "description": t["description"],
            "status": t["status"],
            "priority": t["priority"],
            "reporterId": t["reporter_id"],
            "assigneeId": t.get("assignee_id"),
            "labels": t.get("labels") or [],
            "createdAt": iso(t.get("created_at")),
            "updatedAt": iso(t.get("updated_at")),
            "dueDate": t.get("due_date"),
            "comments": [{"id": c["id"], "authorId": c["author_id"], "body": c["body"], "createdAt": iso(c.get("created_at"))} for c in t.get("comments") or []],
        },
        ("assigneeId", "dueDate"),
    )


#: Tickets with comments aggregated, scoped to workspace $1 and visible to employee $2;
#: `$3` is true for HR/exec roles (who may see private-team tickets).
TICKET_SELECT = f"""SELECT t.*,
    COALESCE((SELECT json_agg(c ORDER BY c.created_at) FROM ticket_comments c WHERE c.ticket_id = t.id), '[]'::json) AS comments
  FROM tickets t JOIN ticket_teams tm ON tm.id = t.team_id
  WHERE t.workspace_id = $1
    AND (tm.key <> ALL ('{{{",".join(PRIVATE_TICKET_TEAMS)}}}'::text[]) OR t.reporter_id = $2 OR t.assignee_id = $2 OR $3::boolean)"""

#: Notifications visible to employee $2 in workspace $1; `$3` is true for HR admins/executives.
#: Direct notifications use their own read flag; workspace-wide ones are read per person.
NOTIFICATION_SELECT = """SELECT n.id, n.type, n.title, n.body, n.href, n.time_label, n.created_at,
    CASE WHEN n.recipient_id IS NULL
         THEN n.read OR EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.employee_id = $2)
         ELSE n.read END AS read
  FROM notifications n
  WHERE n.workspace_id = $1
    AND (n.recipient_id = $2 OR (n.recipient_id IS NULL AND (n.audience = 'all' OR $3::boolean)))
  ORDER BY n.created_at DESC"""

# Explicit columns: never ship logo_data (bytea) through the bootstrap.
WORKSPACE_SQL = """SELECT w.id, w.slug, w.name, w.industry, w.country, w.size, w.domain, w.logo_text, w.plan, w.founded, w.created_at,
       w.brand_primary, w.brand_secondary, w.custom_domain, w.custom_domain_verified_at,
       CASE WHEN w.logo_data IS NOT NULL THEN extract(epoch FROM w.logo_updated_at)::bigint END AS logo_version,
       COALESCE((SELECT json_agg(o ORDER BY o.headcount DESC) FROM offices o WHERE o.workspace_id = w.id), '[]') AS offices
  FROM workspaces w WHERE w.id = $1"""


# ── Loaders ─────────────────────────────────────────────────────────
def get_workspace(workspace_id: str, db: psycopg.Connection | None = None) -> dict[str, Any] | None:
    w = query_one(WORKSPACE_SQL, [workspace_id], db)
    return to_workspace(w, w["offices"]) if w else None


_DOC_VISIBLE = "$3::boolean OR employee_id = $2 OR (employee_id IS NULL AND folder IN ('Policies', 'Templates'))"

_BOOTSTRAP_SETS: dict[str, str] = {
    "departments": "SELECT * FROM departments WHERE workspace_id = $1 ORDER BY created_at, name",
    "employees": "SELECT * FROM employees WHERE workspace_id = $1 ORDER BY employee_no",
    "leave": "SELECT * FROM leave_requests WHERE workspace_id = $1 ORDER BY created_at, id",
    "payroll": "SELECT * FROM payroll_runs WHERE workspace_id = $1 ORDER BY position, created_at DESC",
    "payrollApprovals": "SELECT a.* FROM payroll_approvals a JOIN payroll_runs r ON r.id = a.payroll_run_id WHERE r.workspace_id = $1 ORDER BY a.step",
    "policies": "SELECT * FROM policies WHERE workspace_id = $1 ORDER BY title",
    "policyVersions": "SELECT v.* FROM policy_versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1 ORDER BY v.position",
    "complianceDocs": "SELECT * FROM compliance_documents WHERE workspace_id = $1 ORDER BY id",
    "cases": "SELECT * FROM hr_cases WHERE workspace_id = $1 ORDER BY opened DESC",
    "caseEvents": "SELECT e.* FROM case_events e JOIN hr_cases c ON c.id = e.case_id WHERE c.workspace_id = $1 ORDER BY e.position, e.date",
    "caseEvidence": "SELECT e.* FROM case_evidence e JOIN hr_cases c ON c.id = e.case_id WHERE c.workspace_id = $1 ORDER BY e.uploaded",
    "offboardings": "SELECT * FROM offboardings WHERE workspace_id = $1 ORDER BY submitted DESC",
    "offboardingAssets": "SELECT a.* FROM offboarding_assets a JOIN offboardings o ON o.id = a.offboarding_id WHERE o.workspace_id = $1 ORDER BY a.position",
    "timesheets": "SELECT * FROM timesheets WHERE workspace_id = $1 ORDER BY week_start DESC",
    "timesheetEntries": "SELECT e.* FROM timesheet_entries e JOIN timesheets t ON t.id = e.timesheet_id WHERE t.workspace_id = $1 ORDER BY e.position",
    "surveys": "SELECT * FROM surveys WHERE workspace_id = $1 ORDER BY position",
    "notifications": f"{NOTIFICATION_SELECT} LIMIT 50",
    "kpis": "SELECT * FROM kpis WHERE workspace_id = $1 ORDER BY position",
    # Same visibility as GET /documents: HR admins and the CEO ($3) see everything; others see
    # their own documents plus the shared company folders.
    "documents": f"SELECT * FROM documents WHERE workspace_id = $1 AND ({_DOC_VISIBLE}) ORDER BY folder, created_at",
    "documentVersions": f"SELECT v.* FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE d.workspace_id = $1 AND ({_DOC_VISIBLE.replace('employee_id', 'd.employee_id').replace('folder', 'd.folder')}) ORDER BY v.position",
    "holidays": "SELECT * FROM holidays WHERE workspace_id = $1 ORDER BY date",
    "tasks": "SELECT * FROM onboarding_tasks WHERE workspace_id = $1 ORDER BY position",
    "metrics": "SELECT metric, data FROM metric_series WHERE workspace_id = $1",
    "ticketTeams": "SELECT * FROM ticket_teams WHERE workspace_id = $1 ORDER BY position, created_at",
    "tickets": f"{TICKET_SELECT} ORDER BY t.updated_at DESC",
}

_MASK = re.compile(r".(?=.{3})")


def load_workspace_data(viewer: AuthContext) -> dict[str, Any]:
    """Full data set for one workspace in a single round trip, redacted for the viewer's role."""
    parts = [f"(SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t) AS \"{key}\"" for key, sql in _BOOTSTRAP_SETS.items()]
    parts.append(f'(SELECT row_to_json(ws) FROM ({WORKSPACE_SQL}) ws) AS "workspaceRow"')
    b = query_one("SELECT " + ",\n".join(parts), [viewer.workspaceId, viewer.employeeId, is_exec(viewer.role)])
    if not b or not b["workspaceRow"]:
        raise LookupError("Workspace not found")

    approvals_by = _group(b["payrollApprovals"], "payroll_run_id")
    versions_by = _group(b["policyVersions"], "policy_id")
    events_by = _group(b["caseEvents"], "case_id")
    evidence_by = _group(b["caseEvidence"], "case_id")
    assets_by = _group(b["offboardingAssets"], "offboarding_id")
    entries_by = _group(b["timesheetEntries"], "timesheet_id")
    doc_versions_by = _group(b["documentVersions"], "document_id")
    metrics = {m["metric"]: m["data"] for m in b["metrics"]}

    see_pay = can_see_pay(viewer.role)
    see_ids = is_admin(viewer.role)

    def redact(e: dict[str, Any]) -> dict[str, Any]:
        # Sensitive fields never leave the API for roles that shouldn't see them.
        if e["id"] == viewer.employeeId:
            return e
        return {
            **e,
            "salaryKES": e["salaryKES"] if see_pay else 0,
            "kraPin": e["kraPin"] if see_ids else _MASK.sub("•", e["kraPin"]),
            "nationalId": e["nationalId"] if see_ids else _MASK.sub("•", e["nationalId"]),
        }

    ws = b["workspaceRow"]
    return {
        "workspace": to_workspace(ws, ws.get("offices")),
        "departments": [to_department(d) for d in b["departments"]],
        "employees": [redact(to_employee(e)) for e in b["employees"]],
        "leaveRequests": [to_leave(l) for l in b["leave"]],
        "payrollRuns": [to_payroll_run(p, approvals_by.get(p["id"])) for p in b["payroll"]] if see_pay else [],
        "policies": [to_policy(p, versions_by.get(p["id"])) for p in b["policies"]],
        "complianceDocs": [to_compliance_doc(c) for c in b["complianceDocs"]],
        # Confidential cases are only ever sent to HR admins and the CEO.
        # Confidential subjects are never included here; the Cases module reveals them per viewer (logged).
        "cases": [
            {**case, "subjectId": ""} if case["confidential"] else case
            for case in (to_case(c, events_by.get(c["id"]), evidence_by.get(c["id"])) for c in b["cases"])
        ]
        if is_exec(viewer.role)
        else [],
        "offboardings": [to_offboarding(o, assets_by.get(o["id"])) for o in b["offboardings"]],
        "timesheets": [to_timesheet(t, entries_by.get(t["id"])) for t in b["timesheets"]],
        "surveys": [to_survey(s) for s in b["surveys"]],
        "notifications": [to_notification(n) for n in b["notifications"]],
        "kpis": [
            {"id": k["id"], "perspective": k["perspective"], "name": k["name"], "target": k["target"], "actual": k["actual"], "unit": k["unit"], "weight": k["weight"], "owner": k["owner"]}
            for k in b["kpis"]
        ],
        "documents": [to_document(d, doc_versions_by.get(d["id"])) for d in b["documents"]],
        "holidays": [{"date": h["date"], "name": h["name"], "country": h["country"]} for h in b["holidays"]],
        "onboardingTasks": [{"id": t["id"], "title": t["title"], "description": t["description"], "category": t["category"], "required": t["required"]} for t in b["tasks"]],
        "ticketTeams": [to_ticket_team(t) for t in b["ticketTeams"]],
        "tickets": [to_ticket(t) for t in b["tickets"]],
        "trends": {k: metrics.get(k, []) for k in ("headcount", "leave", "hiringFunnel", "attendance", "engagement", "payroll")},
    }


def owned(table: str, row_id: str, workspace_id: str, what: str = "Record", db: psycopg.Connection | None = None) -> Row:
    """Loads a row by id that must belong to the workspace, or raises 404 (never leaks other tenants' rows)."""
    from .db import ident
    from .errors import not_found

    row = query_one(f"SELECT * FROM {ident(table)} WHERE id = $1 AND workspace_id = $2", [row_id, workspace_id], db)
    if not row:
        raise not_found(what)
    return row
