"""Policies, onboarding, compliance documents, documents, confidential cases and offboarding."""


import datetime as dt
import hashlib
import json
import math
import re
from typing import Annotated, Any, Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..employee_records import DOC_TASKS, onboarding_view, recompute_onboarding
from ..email.service import send_email
from ..email.templates_engagement import document_expiry, document_request
from ..errors import HttpError, bad_request, forbidden, not_found, parse
from ..repository import owned, to_case, to_compliance_doc, to_document, to_offboarding, to_policy
from ..roles import ADMIN, EXEC, LEADERS, is_admin, is_exec
from ..security import AuthContext, client_ip, require_auth, require_role
from .files import INLINE, _clean_name, _looks_like

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


@router.get("/policies/{id}/acknowledgements")
def policy_acknowledgements(id: str, auth: AuthContext = Depends(require_role(*ADMIN))):
    """Who signed which version (with timestamp and IP), and who still has to sign the current one."""
    p = owned("policies", id, auth.workspaceId, "Policy")
    signed = query(
        """SELECT a.employee_id, a.version, a.signature, a.ip_address, a.acknowledged_at, e.name, e.employee_no, e.department_id
             FROM policy_acknowledgements a JOIN employees e ON e.id = a.employee_id
            WHERE a.policy_id = $1 ORDER BY a.acknowledged_at DESC""",
        [id],
    )
    pending = query(
        """SELECT e.id, e.name, e.employee_no, e.department_id FROM employees e
            WHERE e.workspace_id = $1 AND e.status <> 'Exited'
              AND NOT EXISTS (SELECT 1 FROM policy_acknowledgements a WHERE a.policy_id = $2 AND a.employee_id = e.id AND a.version = $3)
            ORDER BY e.name""",
        [auth.workspaceId, id, p["version"]],
    )
    current = [s for s in signed if s["version"] == p["version"]]
    return {
        "policyId": id,
        "version": p["version"],
        "headcount": len(current) + len(pending),
        "signedCurrent": len(current),
        "acknowledgements": [
            {
                "employeeId": s["employee_id"],
                "name": s["name"],
                "employeeNo": s["employee_no"],
                "departmentId": s["department_id"],
                "version": s["version"],
                "signature": s["signature"],
                "ip": s["ip_address"],
                "acknowledgedAt": iso(s["acknowledged_at"]),
                "current": s["version"] == p["version"],
            }
            for s in signed
        ],
        "pending": [{"employeeId": e["id"], "name": e["name"], "employeeNo": e["employee_no"], "departmentId": e["department_id"]} for e in pending],
    }


@router.post("/policies/{id}/remind")
def remind_policy(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    """Sends an in-app reminder to everyone who hasn't signed the current version."""
    p = owned("policies", id, auth.workspaceId, "Policy")
    with tx() as db:
        rows = query(
            """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
               SELECT $1, e.id, 'policy', $4, 'HR asked you to read and acknowledge this policy.', '/app/onboarding?tab=policies'
                 FROM employees e
                WHERE e.workspace_id = $1 AND e.status <> 'Exited'
                  AND NOT EXISTS (SELECT 1 FROM policy_acknowledgements a WHERE a.policy_id = $2 AND a.employee_id = e.id AND a.version = $3)
               RETURNING recipient_id""",
            [auth.workspaceId, id, p["version"], f"Reminder: acknowledge {p['title']} {p['version']}"],
            db,
        )
        audit(request, auth, "policy.reminder_sent", "policy", id, {"version": p["version"], "recipients": len(rows)}, db)
    return {"reminded": len(rows)}


# ── Onboarding checklist ────────────────────────────────────────────
@router.get("/onboarding/me")
def my_onboarding(auth: AuthContext = Depends(require_auth)):
    """Per-task completion, attached file and saved form values — the checklist restores from this."""
    view = onboarding_view(auth, auth.employeeId)
    if not view:
        raise not_found("Employee")
    return view


@router.get("/onboarding/employees/{id}")
def employee_onboarding(id: str, auth: AuthContext = Depends(require_role(*ADMIN))):
    view = onboarding_view(auth, id)
    if not view:
        raise not_found("Employee")
    return view


KRA_PIN = re.compile(r"^[A-Z]\d{9}[A-Z]$")
NATIONAL_ID = re.compile(r"^\d{6,10}$")
STATUTORY_NO = re.compile(r"^[A-Z0-9-]{4,20}$")


class CompleteBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    fileId: Trim(1, 64) | None = None
    number: Trim(None, 32) | None = None
    signature: Trim(None, 120) | None = None
    name: Trim(None, 120) | None = None
    relationship: Trim(None, 40) | None = None
    phone: Trim(None, 24) | None = None
    bankName: Trim(None, 80) | None = None
    branch: Trim(None, 80) | None = None
    accountName: Trim(None, 120) | None = None
    accountNumber: Trim(None, 32) | None = None


def _invalid(path: str, message: str) -> Exception:
    return bad_request("Validation failed", [{"path": path, "message": message}])


@router.post("/onboarding/tasks/{taskId}/complete")
def complete_task(taskId: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(CompleteBody, body if body is not None else {})
    emp_id, ws = auth.employeeId, auth.workspaceId
    profile: dict[str, Any] = {}  # employee_profiles columns to upsert
    employee: dict[str, Any] = {}  # employees columns to update
    # Sensitive values go to their columns; the payload keeps only non-sensitive extras (e.g. policy lists).
    payload = {k: v for k, v in (b.model_extra or {}).items() if k in ("policies",)}

    if taskId in DOC_TASKS:
        category, col = DOC_TASKS[taskId]
        if b.number:
            number = b.number.upper().replace(" ", "")
            pattern, hint = {
                "kra_pin": (KRA_PIN, "KRA PIN must look like A123456789B"),
                "national_id": (NATIONAL_ID, "National ID must be 6–10 digits"),
            }.get(col, (STATUTORY_NO, "Use 4–20 letters, digits or dashes"))
            if not pattern.match(number):
                raise _invalid("number", hint)
            (employee if col in ("kra_pin", "national_id") else profile)[col] = number
    elif taskId == "nda":
        if not b.signature or len(b.signature) < 2:
            raise _invalid("signature", "Type your full name to sign")
        profile.update(nda_signature=b.signature, nda_signed_at=dt.datetime.now(dt.timezone.utc))
    elif taskId == "emergency":
        if not b.name or len(b.name) < 2:
            raise _invalid("name", "Enter the contact's full name")
        if not b.relationship:
            raise _invalid("relationship", "Choose a relationship")
        if not b.phone or len(re.sub(r"\D", "", b.phone)) < 9:
            raise _invalid("phone", "Enter a valid phone number")
        profile.update(emergency_name=b.name, emergency_relationship=b.relationship, emergency_phone=b.phone)
    elif taskId == "bank":
        digits = re.sub(r"[\s-]", "", b.accountNumber or "")
        if not b.bankName:
            raise _invalid("bankName", "Choose your bank")
        if not b.branch:
            raise _invalid("branch", "Enter the branch")
        if not re.fullmatch(r"\d{6,20}", digits):
            raise _invalid("accountNumber", "Account number must be 6–20 digits")
        profile.update(bank_name=b.bankName, bank_branch=b.branch, bank_account_name=b.accountName, bank_account_number=digits)

    with tx() as db:
        if not query_one("SELECT 1 FROM onboarding_tasks WHERE workspace_id = $1 AND id = $2", [ws, taskId], db):
            raise not_found("Onboarding task")
        prev = query_one("SELECT file_id FROM onboarding_task_completions WHERE employee_id = $1 AND task_id = $2", [emp_id, taskId], db)
        file_id = b.fileId or (prev or {}).get("file_id")
        if b.fileId:
            # The file must be the caller's own upload target.
            f = query_one("SELECT id FROM employee_files WHERE id = $1 AND workspace_id = $2 AND employee_id = $3", [b.fileId, ws, emp_id], db)
            if not f:
                raise not_found("File")
            query(
                "UPDATE employee_files SET task_id = $2, category = COALESCE($3, category) WHERE id = $1",
                [b.fileId, taskId, DOC_TASKS[taskId][0] if taskId in DOC_TASKS else None],
                db,
            )
        if taskId in DOC_TASKS and not file_id:
            raise _invalid("fileId", "Upload the document first")

        query(
            """INSERT INTO onboarding_task_completions (workspace_id, task_id, employee_id, payload, file_id) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (employee_id, task_id) DO UPDATE SET completed_at = now(), payload = EXCLUDED.payload, file_id = EXCLUDED.file_id""",
            [ws, taskId, emp_id, json.dumps(payload), file_id],
            db,
        )
        # Replacing a document removes the superseded upload.
        if prev and prev.get("file_id") and prev["file_id"] != file_id:
            query("DELETE FROM employee_files WHERE id = $1 AND employee_id = $2", [prev["file_id"], emp_id], db)

        if employee:
            sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(employee))
            query(f"UPDATE employees SET {sets}, updated_at = now() WHERE id = $1", [emp_id, *employee.values()], db)
        if profile:
            cols = list(profile)
            query(
                f"""INSERT INTO employee_profiles (employee_id, workspace_id, {", ".join(cols)}) VALUES ($1, $2, {", ".join(f"${i + 3}" for i in range(len(cols)))})
             ON CONFLICT (employee_id) DO UPDATE SET {", ".join(f"{c} = EXCLUDED.{c}" for c in cols)}, updated_at = now()""",
                [emp_id, ws, *profile.values()],
                db,
            )
        r = recompute_onboarding(db, ws, emp_id)
        audit(request, auth, "onboarding.task_completed", "onboarding_task", taskId, {"fileId": file_id, "fields": sorted([*profile, *employee])}, db)
        view = onboarding_view(auth, emp_id, db)
    task = next((t for t in view["tasks"] if t["id"] == taskId), None) if view else None
    return {"taskId": taskId, "onboardingProgress": r["onboarding_progress"], "status": r["status"], "requiredLeft": r["required_left"], "task": task}


# ── Compliance documents ────────────────────────────────────────────
# Documents belong to the employee: only they upload the file. HR records the item (number/expiry),
# requests an upload and sends reminders.
COMPLIANCE_TYPES = ("Passport", "Work Visa", "Driving Licence", "Contract", "Academic Certificate", "Certificate of Good Conduct", "Professional License")
ComplianceType = Literal["Passport", "Work Visa", "Driving Licence", "Contract", "Academic Certificate", "Certificate of Good Conduct", "Professional License"]

COMPLIANCE_SELECT = """SELECT c.*, f.filename AS file_name, f.content_type AS file_type, f.size_bytes AS file_size,
       (SELECT name FROM employees WHERE id = c.requested_by) AS requested_by_name
  FROM compliance_documents c LEFT JOIN employee_files f ON f.id = c.file_id"""


def _status_for(expires: str | None) -> str:
    days = _days_until(expires) if expires else math.inf
    return "Expired" if days < 0 else "Expiring" if days < 60 else "Valid"


def _compliance_out(r: dict[str, Any]) -> dict[str, Any]:
    out = to_compliance_doc(r)
    # Expiry-based status moves with the calendar; 'Missing' stays until the employee uploads.
    if r["status"] != "Missing":
        out["status"] = _status_for(r.get("expires"))
    out.update(
        {
            "fileId": r.get("file_id"),
            "fileName": r.get("file_name"),
            "fileType": r.get("file_type"),
            "fileSize": r.get("file_size"),
            "requestedAt": iso(r.get("requested_at")) or None,
            "requestedBy": r.get("requested_by_name"),
            "remindedAt": iso(r.get("reminded_at")) or None,
        }
    )
    return out


def _compliance_row(doc_id: str, db=None) -> dict[str, Any]:
    return query_one(f"{COMPLIANCE_SELECT} WHERE c.id = $1", [doc_id], db)


@router.get("/compliance-documents")
def list_compliance(auth: AuthContext = Depends(require_auth)):
    # HR and executives see everyone; managers their direct reports and themselves; others only themselves.
    scope = "all" if is_exec(auth.role) else "team" if auth.role == "manager" else "self"
    rows = query(
        f"""{COMPLIANCE_SELECT} JOIN employees e ON e.id = c.employee_id
         WHERE c.workspace_id = $1 AND ($2 = 'all' OR c.employee_id = $3 OR ($2 = 'team' AND e.manager_id = $3))
         ORDER BY c.expires NULLS LAST""",
        [auth.workspaceId, scope, auth.employeeId],
    )
    return [_compliance_out(r) for r in rows]


class ComplianceBody(Strict):
    employeeId: str
    type: ComplianceType
    number: Trim(None, 40) | None = None
    issued: Annotated[str, Field(pattern=ISO_DATE)] | None = None
    expires: Annotated[str, Field(pattern=ISO_DATE)] | None = None
    fileId: Trim(1, 64) | None = None


def _days_until(date: str) -> float:
    try:
        when = dt.datetime.fromisoformat(date).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return math.nan
    return (when - dt.datetime.now(dt.timezone.utc)).total_seconds() / 86_400


def _notify(db, ws: str, recipient: str | None, type_: str, title: str, body: str, href: str, audience: str = "all") -> None:
    query(
        "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [ws, recipient, type_, title, body, href, audience],
        db,
    )


@router.post("/compliance-documents")
def create_compliance(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(ComplianceBody, body)
    own = b.employeeId == auth.employeeId
    if not own and not is_admin(auth.role):
        raise forbidden()
    if b.fileId and not own:
        raise forbidden("Only the employee can upload documents to their file")
    if own and not b.fileId and not is_admin(auth.role):
        raise _invalid("fileId", "Upload the document first")
    if not b.fileId and not (b.number and len(b.number) >= 2):
        raise _invalid("number", "Enter the document number")
    if b.issued and b.expires and b.expires < b.issued:
        raise _invalid("expires", "Expiry must be after the issue date")
    emp = owned("employees", b.employeeId, auth.workspaceId, "Employee")
    status = _status_for(b.expires)
    with tx() as db:
        if b.fileId and not query_one("SELECT 1 FROM employee_files WHERE id = $1 AND workspace_id = $2 AND employee_id = $3", [b.fileId, auth.workspaceId, b.employeeId], db):
            raise not_found("File")
        # An upload fulfils an open request (or an HR-recorded item without a file) of the same type.
        open_item = (
            query_one(
                "SELECT id FROM compliance_documents WHERE workspace_id = $1 AND employee_id = $2 AND type = $3 AND file_id IS NULL ORDER BY created_at DESC LIMIT 1",
                [auth.workspaceId, b.employeeId, b.type],
                db,
            )
            if b.fileId
            else None
        )
        if open_item:
            row = query_one(
                """UPDATE compliance_documents SET file_id = $2, number = COALESCE(NULLIF($3, ''), number), issued = COALESCE($4::date, issued),
                          expires = COALESCE($5::date, expires), status = $6, requested_at = NULL, updated_at = now()
                    WHERE id = $1 RETURNING id""",
                [open_item["id"], b.fileId, (b.number or "").upper(), b.issued, b.expires, status],
                db,
            )
        else:
            row = query_one(
                "INSERT INTO compliance_documents (workspace_id, employee_id, type, number, issued, expires, status, file_id) VALUES ($1,$2,$3,$4,COALESCE($5::date, current_date),$6,$7,$8) RETURNING id",
                [auth.workspaceId, b.employeeId, b.type, (b.number or "").upper(), b.issued, b.expires, status, b.fileId],
                db,
            )
        if own and b.fileId:
            _notify(db, auth.workspaceId, None, "document", f"{emp['name']} uploaded a {b.type}", "Review it in the compliance register.", "/app/compliance?tab=documents", "admins")
        audit(request, auth, "compliance.document_added", "compliance_document", row["id"], {"employeeId": b.employeeId, "type": b.type, "fileId": b.fileId}, db)
        out = _compliance_out(_compliance_row(row["id"], db))
    return JSONResponse(out, status_code=201)


class DocRequestBody(Strict):
    note: Trim(None, 300) | None = None
    email: bool = True


class NewDocRequestBody(DocRequestBody):
    employeeId: str
    type: ComplianceType


def _request_upload(request: Request, auth: AuthContext, doc_id: str, note: str | None, email: bool) -> dict[str, Any]:
    with tx() as db:
        c = query_one(
            "SELECT c.*, e.name, e.email FROM compliance_documents c JOIN employees e ON e.id = c.employee_id WHERE c.id = $1 AND c.workspace_id = $2",
            [doc_id, auth.workspaceId],
            db,
        )
        if not c:
            raise not_found("Compliance document")
        query("UPDATE compliance_documents SET requested_at = now(), requested_by = $2, updated_at = now() WHERE id = $1", [doc_id, auth.employeeId], db)
        _notify(db, auth.workspaceId, c["employee_id"], "document", f"Please upload your {c['type']}", note or "HR needs a copy for your employee file.", "/app/compliance?tab=documents")
        audit(request, auth, "compliance.document_requested", "compliance_document", doc_id, {"employeeId": c["employee_id"], "type": c["type"]}, db)
        me = query_one("SELECT e.name, w.name AS company FROM employees e JOIN workspaces w ON w.id = e.workspace_id WHERE e.id = $1", [auth.employeeId], db)
        out = _compliance_out(_compliance_row(doc_id, db))
    if email and c["email"]:
        send_email(document_request(c["email"], c["name"], c["type"], me["company"], me["name"], note), required=False)
    return out


@router.post("/compliance-documents/requests")
def request_new_document(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    """Asks an employee for a document type they haven't got on file (creates a 'Missing' item)."""
    b = parse(NewDocRequestBody, body)
    owned("employees", b.employeeId, auth.workspaceId, "Employee")
    existing = query_one(
        "SELECT id FROM compliance_documents WHERE workspace_id = $1 AND employee_id = $2 AND type = $3 ORDER BY (file_id IS NULL) DESC, created_at DESC LIMIT 1",
        [auth.workspaceId, b.employeeId, b.type],
    )
    doc_id = existing["id"] if existing else query_one(
        "INSERT INTO compliance_documents (workspace_id, employee_id, type, number, issued, status) VALUES ($1,$2,$3,'',current_date,'Missing') RETURNING id",
        [auth.workspaceId, b.employeeId, b.type],
    )["id"]
    return JSONResponse(_request_upload(request, auth, doc_id, b.note, b.email), status_code=201)


@router.post("/compliance-documents/{id}/request")
def request_document(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(DocRequestBody, body if body is not None else {})
    return _request_upload(request, auth, id, b.note, b.email)


class RemindBody(Strict):
    renewal: bool = False
    email: bool = True


@router.post("/compliance-documents/{id}/remind")
def remind_document(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    """Expiry reminder or renewal request to the employee (in-app + email)."""
    b = parse(RemindBody, body if body is not None else {})
    with tx() as db:
        c = query_one(
            "SELECT c.*, e.name, e.email, w.name AS company FROM compliance_documents c JOIN employees e ON e.id = c.employee_id JOIN workspaces w ON w.id = c.workspace_id WHERE c.id = $1 AND c.workspace_id = $2",
            [id, auth.workspaceId],
            db,
        )
        if not c:
            raise not_found("Compliance document")
        when = f"expires {c['expires']}" if c.get("expires") else "needs attention"
        title = f"Renew your {c['type']}" if b.renewal else f"Your {c['type']} {when}"
        text = "Please renew it and upload the new copy." if b.renewal else "Plan the renewal so your file stays compliant."
        _notify(db, auth.workspaceId, c["employee_id"], "document", title, text, "/app/compliance?tab=alerts")
        query(
            "UPDATE compliance_documents SET reminded_at = now(), requested_at = CASE WHEN $2 THEN now() ELSE requested_at END, requested_by = CASE WHEN $2 THEN $3 ELSE requested_by END WHERE id = $1",
            [id, b.renewal, auth.employeeId],
            db,
        )
        audit(request, auth, "compliance.renewal_requested" if b.renewal else "compliance.reminder_sent", "compliance_document", id, {"employeeId": c["employee_id"]}, db)
        out = _compliance_out(_compliance_row(id, db))
    if b.email and c["email"]:
        send_email(document_expiry(c["email"], c["name"], c["type"], c["company"], c.get("expires"), b.renewal), required=False)
    return out


class RemindManyBody(Strict):
    ids: Annotated[list[str], Field(min_length=1, max_length=200)]
    renewal: bool = False
    email: bool = True


@router.post("/compliance-documents/remind")
def remind_documents(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(RemindManyBody, body)
    sent = 0
    for doc_id in dict.fromkeys(b.ids):
        try:
            remind_document(doc_id, request, {"renewal": b.renewal, "email": b.email}, auth)
            sent += 1
        except HttpError:
            continue
    return {"reminded": sent}


# ── Documents (company library + employee-specific documents) ──────
DOC_FOLDERS = ("Policies", "Templates", "Contracts", "NDAs", "Offer Letters", "Certificates", "Payslips")
#: Folders every employee can read; other documents are visible to HR/CEO and the employee they belong to.
SHARED_FOLDERS = ("Policies", "Templates")
DOC_MAX_BYTES = 10 * 1024 * 1024
DOC_TYPES: dict[str, tuple[str, str]] = {
    # extension → (documents.type, stored content type)
    "pdf": ("pdf", "application/pdf"),
    "docx": ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "xlsx": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "png": ("png", "image/png"),
    "jpg": ("png", "image/jpeg"),
    "jpeg": ("png", "image/jpeg"),
}


def _sees_all_documents(auth: AuthContext) -> bool:
    return is_admin(auth.role) or auth.role == "ceo"


def _document_out(d: dict[str, Any], versions: list[dict[str, Any]]) -> dict[str, Any]:
    out = to_document(d, versions)
    out.update(
        {
            "employeeId": d.get("employee_id"),
            "fileId": d.get("file_id"),
            "contentType": d.get("content_type"),
            "versions": [
                {"version": v["version"], "date": v["date"], "by": v["by_name"], "note": v.get("note"), "hasFile": bool(v.get("file_id"))} for v in versions
            ],
        }
    )
    return out


DOC_SELECT = "SELECT d.*, cf.content_type FROM documents d LEFT JOIN company_files cf ON cf.id = d.file_id"


def _visible_doc(auth: AuthContext, doc_id: str, db=None) -> dict[str, Any]:
    d = query_one(f"{DOC_SELECT} WHERE d.id = $1 AND d.workspace_id = $2", [doc_id, auth.workspaceId], db)
    if not d or not (_sees_all_documents(auth) or d["employee_id"] == auth.employeeId or (d["employee_id"] is None and d["folder"] in SHARED_FOLDERS)):
        raise not_found("Document")
    return d


def _full_document(doc_id: str, db=None) -> dict[str, Any]:
    d = query_one(f"{DOC_SELECT} WHERE d.id = $1", [doc_id], db)
    versions = query("SELECT * FROM document_versions WHERE document_id = $1 ORDER BY position, created_at DESC", [doc_id], db)
    return _document_out(d, versions)


@router.get("/documents")
def list_documents(request: Request, auth: AuthContext = Depends(require_auth)):
    rows = query(
        f"""{DOC_SELECT} WHERE d.workspace_id = $1 AND ($2::text IS NULL OR d.folder = $2)
          AND ($3 OR d.employee_id = $4 OR (d.employee_id IS NULL AND d.folder = ANY($5::text[])))
        ORDER BY d.updated_on DESC, d.created_at DESC""",
        [auth.workspaceId, request.query_params.get("folder"), _sees_all_documents(auth), auth.employeeId, list(SHARED_FOLDERS)],
    )
    ids = [d["id"] for d in rows]
    versions = query("SELECT * FROM document_versions WHERE document_id = ANY($1::text[]) ORDER BY position, created_at DESC", [ids]) if ids else []
    by_doc: dict[str, list[dict[str, Any]]] = {}
    for v in versions:
        by_doc.setdefault(v["document_id"], []).append(v)
    return [_document_out(d, by_doc.get(d["id"], [])) for d in rows]


class DocumentBody(Strict):
    name: Trim(2)
    folder: Trim(2)
    size: str = "—"
    type: Literal["pdf", "docx", "xlsx", "png"] = "pdf"
    employeeId: str | None = None


@router.post("/documents")
def create_document(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    """Metadata-only document record (kept for older clients; uploads go through /documents/upload)."""
    b = parse(DocumentBody, body)
    owner = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId])
    row = query_one(
        "INSERT INTO documents (workspace_id, name, folder, size, type, updated_on, owner, version, employee_id) VALUES ($1,$2,$3,$4,$5,current_date,$6,'v1.0',$7) RETURNING *",
        [auth.workspaceId, b.name, b.folder, b.size, b.type, owner["name"], b.employeeId],
    )
    query("INSERT INTO document_versions (document_id, version, date, by_name) VALUES ($1,'v1.0',current_date,$2)", [row["id"], owner["name"]])
    audit(request, auth, "document.uploaded", "document", row["id"])
    return JSONResponse(to_document(row, [{"version": "v1.0", "date": row["updated_on"], "by_name": owner["name"]}]), status_code=201)


def _read_upload(file: UploadFile) -> tuple[str, str, str, bytes]:
    """Validates an upload → (clean filename, documents.type, content type, bytes)."""
    filename = _clean_name(file.filename or "")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in DOC_TYPES:
        raise bad_request("Unsupported file type — upload a PDF, DOCX, XLSX, PNG or JPG")
    data = file.file.read(DOC_MAX_BYTES + 1)
    if not data:
        raise bad_request("The file is empty")
    if len(data) > DOC_MAX_BYTES:
        raise HttpError(413, "File is larger than 10 MB")
    ok = data.startswith(b"PK\x03\x04") if ext == "xlsx" else _looks_like(ext, data[:16])
    if not ok:
        raise bad_request(f"The file content doesn't match its .{ext} extension")
    doc_type, content_type = DOC_TYPES[ext]
    return filename, doc_type, content_type, data


def _store_blob(db, auth: AuthContext, filename: str, content_type: str, data: bytes) -> str:
    return query_one(
        "INSERT INTO company_files (workspace_id, filename, content_type, size_bytes, sha256, data, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [auth.workspaceId, filename, content_type, len(data), hashlib.sha256(data).hexdigest(), data, auth.employeeId],
        db,
    )["id"]


def _size_label(n: int) -> str:
    return f"{n / 1_000_000:.1f} MB" if n >= 1_000_000 else f"{max(1, round(n / 1000))} KB"


def _next_version(current: str) -> str:
    m = re.match(r"^v(\d+)", current or "")
    return f"v{(int(m.group(1)) if m else 1) + 1}.0"


@router.post("/documents/upload")
def upload_document(
    request: Request,
    file: UploadFile = File(...),
    folder: str = Form(...),
    name: Optional[str] = Form(None),
    auth: AuthContext = Depends(require_role(*ADMIN)),
):
    if folder not in DOC_FOLDERS:
        raise _invalid("folder", f"Must be one of: {', '.join(DOC_FOLDERS)}")
    filename, doc_type, content_type, data = _read_upload(file)
    title = (name or "").strip()[:160] or re.sub(r"\.[^.]+$", "", filename)
    with tx() as db:
        owner = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId], db)["name"]
        blob = _store_blob(db, auth, filename, content_type, data)
        d = query_one(
            "INSERT INTO documents (workspace_id, name, folder, size, type, updated_on, owner, version, file_id) VALUES ($1,$2,$3,$4,$5,current_date,$6,'v1.0',$7) RETURNING id",
            [auth.workspaceId, title, folder, _size_label(len(data)), doc_type, owner, blob],
            db,
        )
        query("INSERT INTO document_versions (document_id, version, date, by_name, file_id, note) VALUES ($1,'v1.0',current_date,$2,$3,'Uploaded')", [d["id"], owner, blob], db)
        audit(request, auth, "document.uploaded", "document", d["id"], {"folder": folder, "size": len(data)}, db)
        out = _full_document(d["id"], db)
    return JSONResponse(out, status_code=201)


@router.post("/documents/{id}/versions")
def upload_document_version(
    id: str,
    request: Request,
    file: UploadFile = File(...),
    note: Optional[str] = Form(None),
    auth: AuthContext = Depends(require_role(*ADMIN)),
):
    d = owned("documents", id, auth.workspaceId, "Document")
    filename, doc_type, content_type, data = _read_upload(file)
    version = _next_version(d["version"])
    with tx() as db:
        owner = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId], db)["name"]
        blob = _store_blob(db, auth, filename, content_type, data)
        query("UPDATE document_versions SET position = position + 1 WHERE document_id = $1", [id], db)
        query(
            "INSERT INTO document_versions (document_id, version, date, by_name, file_id, note, position) VALUES ($1,$2,current_date,$3,$4,$5,0)",
            [id, version, owner, blob, (note or "").strip()[:200] or "New version uploaded"],
            db,
        )
        query("UPDATE documents SET version = $2, file_id = $3, size = $4, type = $5, updated_on = current_date WHERE id = $1", [id, version, blob, _size_label(len(data)), doc_type], db)
        audit(request, auth, "document.version_uploaded", "document", id, {"version": version}, db)
        out = _full_document(id, db)
    return JSONResponse(out, status_code=201)


class RestoreBody(Strict):
    version: Trim(2, 20)


@router.post("/documents/{id}/restore")
def restore_document_version(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    """Restoring copies an old version forward as a new version, so history is never rewritten."""
    b = parse(RestoreBody, body)
    d = owned("documents", id, auth.workspaceId, "Document")
    with tx() as db:
        old = query_one("SELECT * FROM document_versions WHERE document_id = $1 AND version = $2 ORDER BY position LIMIT 1", [id, b.version], db)
        if not old:
            raise not_found("Version")
        version = _next_version(d["version"])
        owner = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId], db)["name"]
        blob = old["file_id"]
        query("UPDATE document_versions SET position = position + 1 WHERE document_id = $1", [id], db)
        query(
            "INSERT INTO document_versions (document_id, version, date, by_name, file_id, note, position) VALUES ($1,$2,current_date,$3,$4,$5,0)",
            [id, version, owner, blob, f"Restored {b.version}"],
            db,
        )
        meta = query_one("SELECT content_type, size_bytes FROM company_files WHERE id = $1", [blob], db) if blob else None
        query(
            "UPDATE documents SET version = $2, file_id = $3, updated_on = current_date, size = COALESCE($4, size) WHERE id = $1",
            [id, version, blob, _size_label(meta["size_bytes"]) if meta else None],
            db,
        )
        audit(request, auth, "document.version_restored", "document", id, {"restored": b.version, "as": version}, db)
        out = _full_document(id, db)
    return out


@router.get("/documents/{id}/download")
def download_document(id: str, request: Request, auth: AuthContext = Depends(require_auth)):
    d = _visible_doc(auth, id)
    version = request.query_params.get("version")
    file_id = d["file_id"]
    if version:
        v = query_one("SELECT file_id FROM document_versions WHERE document_id = $1 AND version = $2 ORDER BY position LIMIT 1", [id, version])
        if not v:
            raise not_found("Version")
        file_id = v["file_id"]
    f = query_one("SELECT filename, content_type, data FROM company_files WHERE id = $1 AND workspace_id = $2", [file_id, auth.workspaceId]) if file_id else None
    if not f:
        raise not_found("Stored file for this document")
    audit(request, auth, "document.downloaded", "document", id, {"version": version or d["version"]})
    inline = request.query_params.get("inline") in ("1", "true") and f["content_type"] in INLINE
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]", "_", f["filename"])
    disposition = f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(f['filename'])}"
    return Response(
        content=bytes(f["data"]),
        media_type=f["content_type"],
        headers={"Content-Disposition": disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/documents/{id}")
def delete_document(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    owned("documents", id, auth.workspaceId, "Document")
    with tx() as db:
        blobs = [r["file_id"] for r in query("SELECT DISTINCT file_id FROM document_versions WHERE document_id = $1 AND file_id IS NOT NULL", [id], db)]
        query("DELETE FROM documents WHERE id = $1", [id], db)
        if blobs:
            query("DELETE FROM company_files WHERE id = ANY($1::text[])", [blobs], db)
        audit(request, auth, "document.deleted", "document", id, None, db)
    return Response(status_code=204)


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


