"""Policies, onboarding, compliance documents, documents, confidential cases and offboarding."""


import datetime as dt
import json
import math
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, RootModel, StringConstraints

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, forbidden, parse
from ..repository import owned, to_case, to_compliance_doc, to_document, to_offboarding, to_policy
from ..roles import ADMIN, EXEC, LEADERS, is_admin, is_exec
from ..security import AuthContext, client_ip, require_auth, require_role

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


def Trim(min_length: int | None = None, max_length: int | None = None) -> Any:
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


# ── Policies & acknowledgements ─────────────────────────────────────
@router.get("/policies")
def list_policies(auth: AuthContext = Depends(require_auth)):
    rows = query("SELECT * FROM policies WHERE workspace_id = $1 ORDER BY title", [auth.workspaceId])
    versions = query("SELECT v.* FROM policy_versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1 ORDER BY position", [auth.workspaceId])
    acks = query("SELECT policy_id, version, acknowledged_at FROM policy_acknowledgements WHERE employee_id = $1", [auth.employeeId])
    out = []
    for p in rows:
        ack = next((a for a in acks if a["policy_id"] == p["id"] and a["version"] == p["version"]), None)
        out.append(
            {
                **to_policy(p, [v for v in versions if v["policy_id"] == p["id"]]),
                "myAcknowledgement": {**ack, "acknowledged_at": iso(ack["acknowledged_at"])} if ack else None,
            }
        )
    return out


class AckBody(Strict):
    signature: Trim(2, 120)


@router.post("/policies/{id}/acknowledge")
def acknowledge_policy(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(AckBody, body)
    p = owned("policies", id, auth.workspaceId, "Policy")
    ack = query_one(
        """INSERT INTO policy_acknowledgements (policy_id, employee_id, version, signature, ip_address) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (policy_id, employee_id, version) DO UPDATE SET signature = EXCLUDED.signature RETURNING *""",
        [p["id"], auth.employeeId, p["version"], b.signature, client_ip(request)],
    )
    # Keep the rolled-up acknowledgement percentage current. It never goes down on an
    # acknowledgement (imported/seeded percentages may predate individual acknowledgement rows).
    query(
        """UPDATE policies SET acknowledged = GREATEST(acknowledged, LEAST(100, ROUND(100.0 * (SELECT count(DISTINCT employee_id) FROM policy_acknowledgements WHERE policy_id = $1 AND version = $2)
       / GREATEST(1, (SELECT count(*) FROM employees WHERE workspace_id = $3 AND status <> 'Exited'))))) WHERE id = $1 AND acknowledged < 100""",
        [p["id"], p["version"], auth.workspaceId],
    )
    audit(request, auth, "policy.acknowledged", "policy", p["id"], {"version": p["version"]})
    return JSONResponse({"policyId": p["id"], "version": p["version"], "acknowledgedAt": iso(ack["acknowledged_at"])}, status_code=201)


class VersionBody(Strict):
    version: Annotated[str, Field(pattern=r"^v\d+\.\d+$")]
    note: Trim(3)
    summary: str | None = None


@router.post("/policies/{id}/versions")
def publish_version(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(VersionBody, body)
    p = owned("policies", id, auth.workspaceId, "Policy")
    with tx() as db:
        query("UPDATE policy_versions SET position = position + 1 WHERE policy_id = $1", [p["id"]], db)
        query("INSERT INTO policy_versions (policy_id, version, date, note, position) VALUES ($1,$2,current_date,$3,0)", [p["id"], b.version, b.note], db)
        query("UPDATE policies SET version = $2, updated_on = current_date, acknowledged = 0, summary = COALESCE($3, summary) WHERE id = $1", [p["id"], b.version, b.summary], db)
        query(
            "INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1,'policy',$2,'Please read and acknowledge the new version.','/app/onboarding?tab=policies')",
            [auth.workspaceId, f"{p['title']} {b.version} published"],
            db,
        )
    audit(request, auth, "policy.version_published", "policy", p["id"], {"version": b.version})
    return JSONResponse({"ok": True}, status_code=201)


# ── Onboarding checklist ────────────────────────────────────────────
@router.get("/onboarding/me")
def my_onboarding(auth: AuthContext = Depends(require_auth)):
    tasks = query("SELECT * FROM onboarding_tasks WHERE workspace_id = $1 ORDER BY position", [auth.workspaceId])
    done = {d["task_id"]: d["completed_at"] for d in query("SELECT task_id, completed_at FROM onboarding_task_completions WHERE employee_id = $1", [auth.employeeId])}
    return [
        {"id": t["id"], "title": t["title"], "description": t["description"], "category": t["category"], "required": t["required"], "completedAt": iso(done[t["id"]]) if t["id"] in done else None}
        for t in tasks
    ]


class Payload(RootModel[dict[str, Any]]):
    pass


@router.post("/onboarding/tasks/{taskId}/complete")
def complete_task(taskId: str, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    payload = parse(Payload, body if body is not None else {}).root
    # Never store bank or ID numbers in plain payloads beyond what the task needs.
    query(
        """INSERT INTO onboarding_task_completions (workspace_id, task_id, employee_id, payload) VALUES ($1,$2,$3,$4)
     ON CONFLICT (employee_id, task_id) DO UPDATE SET completed_at = now(), payload = EXCLUDED.payload""",
        [auth.workspaceId, taskId, auth.employeeId, json.dumps(payload)],
    )
    pct = query_one(
        "SELECT ROUND(100.0 * (SELECT count(*) FROM onboarding_task_completions WHERE employee_id = $2) / GREATEST(1, (SELECT count(*) FROM onboarding_tasks WHERE workspace_id = $1)))::int AS pct",
        [auth.workspaceId, auth.employeeId],
    )["pct"]
    query("UPDATE employees SET onboarding_progress = LEAST(100, $2), updated_at = now() WHERE id = $1", [auth.employeeId, pct])
    return {"taskId": taskId, "onboardingProgress": min(100, pct)}


# ── Compliance documents ────────────────────────────────────────────
@router.get("/compliance-documents")
def list_compliance(auth: AuthContext = Depends(require_auth)):
    see_all = is_exec(auth.role) or auth.role == "manager"
    rows = query(
        "SELECT * FROM compliance_documents WHERE workspace_id = $1 AND ($2::text IS NULL OR employee_id = $2) ORDER BY expires NULLS LAST",
        [auth.workspaceId, None if see_all else auth.employeeId],
    )
    return [to_compliance_doc(r) for r in rows]


class ComplianceBody(Strict):
    employeeId: str
    type: Literal["Passport", "Work Visa", "Driving Licence", "Contract", "Academic Certificate", "Certificate of Good Conduct", "Professional License"]
    number: Trim(2)
    issued: Annotated[str, Field(pattern=ISO_DATE)]
    expires: Annotated[str, Field(pattern=ISO_DATE)] | None = None


def _days_until(date: str) -> float:
    try:
        when = dt.datetime.fromisoformat(date).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return math.nan
    return (when - dt.datetime.now(dt.timezone.utc)).total_seconds() / 86_400


@router.post("/compliance-documents")
def create_compliance(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ComplianceBody, body)
    if b.employeeId != auth.employeeId and not is_admin(auth.role):
        raise forbidden()
    owned("employees", b.employeeId, auth.workspaceId, "Employee")
    days = _days_until(b.expires) if b.expires else math.inf
    status = "Expired" if days < 0 else "Expiring" if days < 60 else "Valid"
    row = query_one(
        "INSERT INTO compliance_documents (workspace_id, employee_id, type, number, issued, expires, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [auth.workspaceId, b.employeeId, b.type, b.number, b.issued, b.expires, status],
    )
    audit(request, auth, "compliance.document_added", "compliance_document", row["id"])
    return JSONResponse(to_compliance_doc(row), status_code=201)


# ── Documents ───────────────────────────────────────────────────────
@router.get("/documents")
def list_documents(request: Request, auth: AuthContext = Depends(require_auth)):
    rows = query(
        "SELECT * FROM documents WHERE workspace_id = $1 AND ($2::text IS NULL OR folder = $2) ORDER BY updated_on DESC",
        [auth.workspaceId, request.query_params.get("folder")],
    )
    versions = query("SELECT v.* FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE d.workspace_id = $1 ORDER BY position", [auth.workspaceId])
    return [to_document(d, [v for v in versions if v["document_id"] == d["id"]]) for d in rows]


class DocumentBody(Strict):
    name: Trim(2)
    folder: Trim(2)
    size: str = "—"
    type: Literal["pdf", "docx", "xlsx", "png"] = "pdf"
    employeeId: str | None = None


@router.post("/documents")
def create_document(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(DocumentBody, body)
    owner = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId])
    # TODO: upload the file body to object storage and store its key in storage_key.
    row = query_one(
        "INSERT INTO documents (workspace_id, name, folder, size, type, updated_on, owner, version, employee_id) VALUES ($1,$2,$3,$4,$5,current_date,$6,'v1.0',$7) RETURNING *",
        [auth.workspaceId, b.name, b.folder, b.size, b.type, owner["name"], b.employeeId],
    )
    query("INSERT INTO document_versions (document_id, version, date, by_name) VALUES ($1,'v1.0',current_date,$2)", [row["id"], owner["name"]])
    audit(request, auth, "document.uploaded", "document", row["id"])
    return JSONResponse(to_document(row, [{"version": "v1.0", "date": row["updated_on"], "by_name": owner["name"]}]), status_code=201)


# ── Disciplinary & grievance cases (confidential; EXEC roles only) ──
exec_only = require_role(*EXEC)


def full_case(case_id: str) -> dict[str, Any]:
    c = query_one("SELECT * FROM hr_cases WHERE id = $1", [case_id])
    events = query("SELECT * FROM case_events WHERE case_id = $1 ORDER BY position, date", [case_id])
    evidence = query("SELECT * FROM case_evidence WHERE case_id = $1 ORDER BY uploaded", [case_id])
    return to_case(c, events, evidence)


@router.get("/cases")
def list_cases(auth: AuthContext = Depends(exec_only)):
    rows = query(
        """SELECT c.*,
            COALESCE((SELECT json_agg(e ORDER BY e.position, e.date) FROM case_events e WHERE e.case_id = c.id), '[]') AS events,
            COALESCE((SELECT json_agg(v ORDER BY v.uploaded) FROM case_evidence v WHERE v.case_id = c.id), '[]') AS evidence
       FROM hr_cases c WHERE c.workspace_id = $1 ORDER BY c.opened DESC""",
        [auth.workspaceId],
    )
    return [to_case(c, c["events"], c["evidence"]) for c in rows]


class CaseBody(Strict):
    type: Literal["Disciplinary", "Grievance", "Harassment", "Misconduct", "Performance"]
    subjectId: str
    reportedBy: str = "Anonymous"
    severity: Literal["Low", "Medium", "High", "Critical"]
    summary: Trim(10, 2000)
    confidential: bool = True


@router.post("/cases")
def create_case(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    b = parse(CaseBody, body)
    owned("employees", b.subjectId, auth.workspaceId, "Subject")
    me = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId])
    with tx() as db:
        n = query_one("SELECT count(*)::int AS n FROM hr_cases WHERE workspace_id = $1", [auth.workspaceId], db)["n"]
        ref = f"HR-{dt.date.today().year}-{41 + n:04d}"
        c = query_one(
            "INSERT INTO hr_cases (workspace_id, ref, type, subject_id, reported_by, severity, assigned_to, confidential, summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
            [auth.workspaceId, ref, b.type, b.subjectId, b.reportedBy, b.severity, auth.employeeId, b.confidential, b.summary],
            db,
        )
        query("INSERT INTO case_events (case_id, date, title, by_name, note) VALUES ($1,current_date,'Case logged',$2,'Case created via confidential intake.')", [c["id"], me["name"]], db)
        case_id = c["id"]
    audit(request, auth, "case.logged", "hr_case", case_id)
    return JSONResponse(full_case(case_id), status_code=201)


@router.get("/cases/{id}")
def get_case(id: str, auth: AuthContext = Depends(exec_only)):
    owned("hr_cases", id, auth.workspaceId, "Case")
    query("INSERT INTO case_access_log (case_id, user_id, action) VALUES ($1,$2,'viewed')", [id, auth.userId])
    return full_case(id)


STAGES = ["Logged", "Investigating", "Hearing", "Awaiting Approval", "Closed"]


@router.post("/cases/{id}/advance")
def advance_case(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    c = owned("hr_cases", id, auth.workspaceId, "Case")
    i = STAGES.index(c["status"]) if c["status"] in STAGES else -1
    if i >= len(STAGES) - 1:
        raise bad_request("Case is already closed")
    # Closing requires CEO sign-off.
    nxt = STAGES[i + 1]
    if nxt == "Closed" and auth.role not in ("ceo", "super_admin"):
        raise forbidden("Closing a case requires CEO sign-off")
    actor = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId])
    note = body.get("note") if isinstance(body, dict) else None
    query("UPDATE hr_cases SET status = $2 WHERE id = $1", [c["id"], nxt])
    query(
        "INSERT INTO case_events (case_id, date, title, by_name, note, position) VALUES ($1,current_date,$2,$3,$4,(SELECT COALESCE(max(position),0)+1 FROM case_events WHERE case_id = $1))",
        [c["id"], f"Moved to {nxt}", actor["name"], note if note is not None else ""],
    )
    audit(request, auth, "case.advanced", "hr_case", c["id"], {"to": nxt})
    return full_case(c["id"])


class CaseEventBody(Strict):
    title: Trim(2)
    note: Trim(None, 2000) = ""


@router.post("/cases/{id}/events")
def add_case_event(id: str, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    b = parse(CaseEventBody, body)
    c = owned("hr_cases", id, auth.workspaceId, "Case")
    actor = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId])
    query(
        "INSERT INTO case_events (case_id, date, title, by_name, note, position) VALUES ($1,current_date,$2,$3,$4,(SELECT COALESCE(max(position),0)+1 FROM case_events WHERE case_id = $1))",
        [c["id"], b.title, actor["name"], b.note],
    )
    return JSONResponse(full_case(c["id"]), status_code=201)


class AccessBody(Strict):
    reason: Trim(3, 300)


@router.post("/cases/{id}/access")
def reveal_identity(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    b = parse(AccessBody, body)
    owned("hr_cases", id, auth.workspaceId, "Case")
    query("INSERT INTO case_access_log (case_id, user_id, action, reason) VALUES ($1,$2,'revealed_identity',$3)", [id, auth.userId, b.reason])
    audit(request, auth, "case.identity_revealed", "hr_case", id, {"reason": b.reason})
    return JSONResponse({"ok": True}, status_code=201)


@router.get("/cases/{id}/access-log")
def case_access_log(id: str, auth: AuthContext = Depends(exec_only)):
    owned("hr_cases", id, auth.workspaceId, "Case")
    rows = query(
        "SELECT l.action, l.reason, l.created_at, e.name FROM case_access_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN employees e ON e.id = u.employee_id WHERE l.case_id = $1 ORDER BY l.created_at DESC",
        [id],
    )
    return [{"action": r["action"], "reason": r["reason"], "at": iso(r["created_at"]), "by": r["name"]} for r in rows]


# ── Offboarding ─────────────────────────────────────────────────────
def full_offboarding(off_id: str) -> dict[str, Any]:
    o = query_one("SELECT * FROM offboardings WHERE id = $1", [off_id])
    assets = query("SELECT * FROM offboarding_assets WHERE offboarding_id = $1 ORDER BY position", [off_id])
    return to_offboarding(o, assets)


@router.get("/offboardings")
def list_offboardings(auth: AuthContext = Depends(require_role(*LEADERS, "finance"))):
    rows = query(
        """SELECT o.*, COALESCE((SELECT json_agg(a ORDER BY a.position) FROM offboarding_assets a WHERE a.offboarding_id = o.id), '[]') AS assets
       FROM offboardings o WHERE o.workspace_id = $1 ORDER BY o.submitted DESC""",
        [auth.workspaceId],
    )
    return [to_offboarding(o, o["assets"]) for o in rows]


class OffboardingBody(Strict):
    employeeId: str
    reason: Literal["Resignation", "Contract End", "Termination", "Retirement"]
    submitted: Annotated[str, Field(pattern=ISO_DATE)]
    lastDay: Annotated[str, Field(pattern=ISO_DATE)]


OFFBOARDING_ASSETS = ["Laptop", "Access card", "SIM card", "Email account", "GitHub access", "Slack access"]


@router.post("/offboardings")
def start_offboarding(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN, "manager"))):
    b = parse(OffboardingBody, body)
    if b.lastDay < b.submitted:
        raise bad_request("Last working day must be after the submission date")
    emp = owned("employees", b.employeeId, auth.workspaceId, "Employee")
    try:
        notice = (dt.date.fromisoformat(b.lastDay) - dt.date.fromisoformat(b.submitted)).days
    except ValueError as exc:
        raise bad_request("Invalid reference or value") from exc
    with tx() as db:
        o = query_one(
            "INSERT INTO offboardings (workspace_id, employee_id, reason, submitted, last_day, notice_days, final_dues_kes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [auth.workspaceId, b.employeeId, b.reason, b.submitted, b.lastDay, notice, emp["salary_kes"]],
            db,
        )
        for i, name in enumerate(OFFBOARDING_ASSETS):
            query("INSERT INTO offboarding_assets (offboarding_id, name, position) VALUES ($1,$2,$3)", [o["id"], name, i], db)
        query("UPDATE employees SET status = 'Notice Period', updated_at = now() WHERE id = $1", [b.employeeId], db)
        off_id = o["id"]
    audit(request, auth, "offboarding.started", "offboarding", off_id)
    return JSONResponse(full_offboarding(off_id), status_code=201)


class AssetPatch(Strict):
    name: str
    returned: bool


class OffboardingPatch(Strict):
    handover: bool | None = None
    exitInterview: bool | None = None
    progress: Annotated[int, Field(ge=0, le=100)] | None = None
    assets: list[AssetPatch] | None = None


@router.patch("/offboardings/{id}")
def patch_offboarding(id: str, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN, "manager", "finance"))):
    b = parse(OffboardingPatch, body)
    o = owned("offboardings", id, auth.workspaceId, "Offboarding")
    with tx() as db:
        query(
            "UPDATE offboardings SET handover = COALESCE($2, handover), exit_interview = COALESCE($3, exit_interview), progress = COALESCE($4, progress) WHERE id = $1",
            [o["id"], b.handover, b.exitInterview, b.progress],
            db,
        )
        for a in b.assets or []:
            query("UPDATE offboarding_assets SET returned = $3 WHERE offboarding_id = $1 AND name = $2", [o["id"], a.name, a.returned], db)
    return full_offboarding(o["id"])


