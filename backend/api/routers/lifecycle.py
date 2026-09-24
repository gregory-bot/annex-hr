"""Case management (notes, evidence files, sign-off chain, identity masking) and exit workflows
(checklist, asset recovery, handover, final settlement, certificate of service, exit interview).

Builds on the base endpoints in governance.py (POST /cases, /cases/{id}/advance|events|access,
GET /cases/{id}/access-log, POST /offboardings), which the UI keeps calling for those actions.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import re
from typing import Annotated, Any, Literal
from urllib.parse import quote

import psycopg
from fastapi import APIRouter, Body, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..audit import audit
from ..db import Row, iso, query, query_one, tx
from ..errors import HttpError, bad_request, conflict, forbidden, not_found, parse
from ..payroll_calc import statutory
from ..roles import ADMIN, EXEC, is_admin
from ..security import AuthContext, require_auth, require_role
from .files import ALLOWED, INLINE, MAX_BYTES, _clean_name, _looks_like

router = APIRouter()

exec_only = require_role(*EXEC)
Trim = lambda lo=None, hi=None: Annotated[str, StringConstraints(strip_whitespace=True, min_length=lo, max_length=hi)]  # noqa: E731


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


def _read_upload(file: UploadFile) -> tuple[str, str, bytes]:
    filename = _clean_name(file.filename or "")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED:
        raise bad_request("Unsupported file type — upload a PDF, PNG, JPG, WEBP, HEIC, DOC or DOCX")
    data = file.file.read(MAX_BYTES + 1)
    if not data:
        raise bad_request("The file is empty")
    if len(data) > MAX_BYTES:
        raise HttpError(413, "File is larger than 10 MB")
    if not _looks_like(ext, data[:16]):
        raise bad_request(f"The file content doesn't match its .{ext} extension")
    return filename, ALLOWED[ext], data


def _download(f: Row, inline: bool) -> Response:
    inline = inline and f["content_type"] in INLINE
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]", "_", f["filename"])
    disposition = f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(f['filename'])}"
    return Response(
        content=bytes(f["data"]),
        media_type=f["content_type"],
        headers={"Content-Disposition": disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


def _size_label(n: int) -> str:
    return f"{n / 1_000_000:.1f} MB" if n >= 1_000_000 else f"{max(1, round(n / 1000))} KB"


def _names(db: psycopg.Connection, ids: set[str | None]) -> dict[str, str]:
    ids_ = [i for i in ids if i]
    if not ids_:
        return {}
    return {r["id"]: r["name"] for r in query("SELECT id, name FROM employees WHERE id = ANY($1)", [ids_], db)}


# ════════════════════════════════════════════════════════════════════
# Disciplinary & grievance
# ════════════════════════════════════════════════════════════════════
APPROVAL_STEPS: list[tuple[str, str, tuple[str, ...]]] = [
    ("investigator", "Investigator recommendation", ("hr_officer", "company_admin", "super_admin")),
    ("hr", "HR Head review", ("company_admin", "super_admin")),
    ("ceo", "CEO sign-off", ("ceo", "super_admin")),
]
STEP_INDEX = {k: i for i, (k, _, _) in enumerate(APPROVAL_STEPS)}


def _case(db: psycopg.Connection, auth: AuthContext, case_id: str) -> Row:
    c = query_one("SELECT * FROM hr_cases WHERE id = $1 AND workspace_id = $2", [case_id, auth.workspaceId], db)
    if not c:
        raise not_found("Case")
    return c


def _revealed(db: psycopg.Connection, auth: AuthContext, case_ids: list[str]) -> set[str]:
    if not case_ids:
        return set()
    rows = query(
        "SELECT DISTINCT case_id FROM case_access_log WHERE user_id = $1 AND action = 'revealed_identity' AND case_id = ANY($2)",
        [auth.userId, case_ids],
        db,
    )
    return {r["case_id"] for r in rows}


def _case_payload(c: Row, events: list[Row], evidence_count: int, revealed: set[str], names: dict[str, str], titles: dict[str, str]) -> dict[str, Any]:
    masked = bool(c["confidential"]) and c["id"] not in revealed
    reporter = c["reported_by"]
    return {
        "id": c["id"],
        "ref": c["ref"],
        "type": c["type"],
        # Confidential subjects stay masked until this viewer records a reason (POST /cases/{id}/access).
        "subjectId": None if masked else c["subject_id"],
        "subjectName": None if masked else names.get(c["subject_id"]),
        "subjectTitle": None if masked else titles.get(c["subject_id"]),
        "masked": masked,
        "reportedBy": reporter,
        "reporterName": "Anonymous" if reporter == "Anonymous" else names.get(reporter, "Unknown"),
        "opened": c["opened"],
        "status": c["status"],
        "severity": c["severity"],
        "assignedTo": c.get("assigned_to") or "",
        "assigneeName": names.get(c.get("assigned_to") or "", "—"),
        "confidential": c["confidential"],
        "summary": c["summary"],
        "timeline": [{"date": t["date"], "title": t["title"], "by": t["by_name"], "note": t["note"]} for t in events],
        "evidenceCount": evidence_count,
    }


@router.get("/lifecycle/cases")
def list_cases(auth: AuthContext = Depends(exec_only)):
    with tx() as db:
        rows = query(
            """SELECT c.*,
                COALESCE((SELECT json_agg(e ORDER BY e.position, e.date) FROM case_events e WHERE e.case_id = c.id), '[]') AS events,
                (SELECT count(*) FROM case_evidence v WHERE v.case_id = c.id)::int + (SELECT count(*) FROM case_files f WHERE f.case_id = c.id)::int AS evidence_count
               FROM hr_cases c WHERE c.workspace_id = $1 ORDER BY c.opened DESC, c.ref DESC""",
            [auth.workspaceId],
            db,
        )
        revealed = _revealed(db, auth, [r["id"] for r in rows])
        people = query(
            "SELECT id, name, title FROM employees WHERE workspace_id = $1 AND id = ANY($2)",
            [auth.workspaceId, list({x for r in rows for x in (r["subject_id"], r["reported_by"], r["assigned_to"]) if x})],
            db,
        )
    names = {p["id"]: p["name"] for p in people}
    titles = {p["id"]: p["title"] for p in people}
    return [_case_payload(r, r["events"], r["evidence_count"], revealed, names, titles) for r in rows]


def _sync_approvals(db: psycopg.Connection, c: Row) -> list[Row]:
    """Creates the sign-off chain on first use and opens the next step once the case reaches a hearing."""
    status = c["status"]
    initial = {
        "Closed": ["Approved", "Approved", "Approved"],
        "Awaiting Approval": ["Approved", "Pending", "Waiting"],
        "Hearing": ["Pending", "Waiting", "Waiting"],
    }.get(status, ["Waiting", "Waiting", "Waiting"])
    for i, (step, _, _) in enumerate(APPROVAL_STEPS):
        query(
            "INSERT INTO case_approvals (case_id, step, position, status) VALUES ($1,$2,$3,$4) ON CONFLICT (case_id, step) DO NOTHING",
            [c["id"], step, i, initial[i]],
            db,
        )
    rows = query("SELECT * FROM case_approvals WHERE case_id = $1 ORDER BY position", [c["id"]], db)
    if status in ("Hearing", "Awaiting Approval") and not any(r["status"] == "Pending" for r in rows):
        nxt = next((r for r in rows if r["status"] != "Approved"), None)
        if nxt:
            query("UPDATE case_approvals SET status = 'Pending' WHERE case_id = $1 AND step = $2", [c["id"], nxt["step"]], db)
            nxt["status"] = "Pending"
    return rows


def _case_detail(db: psycopg.Connection, auth: AuthContext, c: Row) -> dict[str, Any]:
    events = query("SELECT * FROM case_events WHERE case_id = $1 ORDER BY position, date", [c["id"]], db)
    legacy = query("SELECT id, name, size, uploaded FROM case_evidence WHERE case_id = $1 ORDER BY uploaded", [c["id"]], db)
    files = query(
        "SELECT id, filename, content_type, size_bytes, sha256, uploaded_by, created_at FROM case_files WHERE case_id = $1 ORDER BY created_at",
        [c["id"]],
        db,
    )
    hr = is_admin(auth.role)
    # HR-only notes never leave the server for non-HR viewers (e.g. the CEO).
    notes = query(
        "SELECT * FROM case_notes WHERE case_id = $1 AND ($2::boolean OR visibility = 'case_team') ORDER BY created_at",
        [c["id"], hr],
        db,
    )
    approvals = _sync_approvals(db, c)
    revealed = _revealed(db, auth, [c["id"]])
    role_holders = query(
        "SELECT DISTINCT ON (role) id, role FROM employees WHERE workspace_id = $1 AND role IN ('company_admin','ceo') AND status <> 'Exited' ORDER BY role, employee_no",
        [auth.workspaceId],
        db,
    )
    holder = {r["role"]: r["id"] for r in role_holders}
    names = _names(
        db,
        {c["subject_id"], c["reported_by"], c.get("assigned_to"), *(f["uploaded_by"] for f in files), *(n["author_id"] for n in notes), *(a["decided_by"] for a in approvals), *holder.values()},
    )
    titles = {}
    if c["id"] in revealed or not c["confidential"]:
        t = query_one("SELECT title FROM employees WHERE id = $1", [c["subject_id"]], db)
        titles = {c["subject_id"]: t["title"]} if t else {}
    out = _case_payload(c, events, len(legacy) + len(files), revealed, names, titles)
    expected = {"investigator": c.get("assigned_to"), "hr": holder.get("company_admin"), "ceo": holder.get("ceo")}
    out["evidence"] = [
        *({"id": None, "name": e["name"], "size": e["size"], "uploaded": e["uploaded"], "downloadable": False, "uploadedBy": None} for e in legacy),
        *(
            {
                "id": f["id"],
                "name": f["filename"],
                "size": _size_label(f["size_bytes"]),
                "sizeBytes": f["size_bytes"],
                "contentType": f["content_type"],
                "sha256": f["sha256"],
                "uploaded": iso(f["created_at"])[:10],
                "downloadable": True,
                "uploadedBy": names.get(f["uploaded_by"] or ""),
            }
            for f in files
        ),
    ]
    out["notes"] = [
        {"id": n["id"], "body": n["body"], "visibility": n["visibility"], "author": names.get(n["author_id"] or "", "Former staff"), "authorId": n["author_id"], "createdAt": iso(n["created_at"])}
        for n in notes
    ]
    out["approvals"] = [
        {
            "step": a["step"],
            "stage": APPROVAL_STEPS[a["position"]][1],
            "status": a["status"],
            "approver": names.get(a["decided_by"] or expected.get(a["step"]) or "", "—"),
            "decidedAt": iso(a["decided_at"]),
            "comment": a["comment"],
            "canAct": a["status"] == "Pending" and auth.role in APPROVAL_STEPS[a["position"]][2],
        }
        for a in approvals
    ]
    out["canSeeHrNotes"] = hr
    return out


@router.get("/lifecycle/cases/{id}")
def get_case(id: str, request: Request, auth: AuthContext = Depends(exec_only)):
    with tx() as db:
        c = _case(db, auth, id)
        # Opening the file is an access event; ?silent=1 refreshes after an action without logging again.
        if request.query_params.get("silent") not in ("1", "true"):
            query("INSERT INTO case_access_log (case_id, user_id, action) VALUES ($1,$2,'viewed')", [id, auth.userId], db)
        return _case_detail(db, auth, c)


# ── Notes ───────────────────────────────────────────────────────────
class NoteBody(Strict):
    body: Trim(1, 4000)
    visibility: Literal["hr_only", "case_team"] = "hr_only"


@router.post("/lifecycle/cases/{id}/notes")
def add_note(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    b = parse(NoteBody, body)
    if b.visibility == "hr_only" and not is_admin(auth.role):
        raise forbidden("Only HR can write HR-only notes")
    with tx() as db:
        c = _case(db, auth, id)
        n = query_one("INSERT INTO case_notes (case_id, author_id, body, visibility) VALUES ($1,$2,$3,$4) RETURNING id", [c["id"], auth.employeeId, b.body, b.visibility], db)
        audit(request, auth, "case.note_added", "hr_case", c["id"], {"noteId": n["id"], "visibility": b.visibility}, db)
        return JSONResponse(_case_detail(db, auth, c), status_code=201)


@router.delete("/lifecycle/cases/{id}/notes/{noteId}")
def delete_note(id: str, noteId: str, request: Request, auth: AuthContext = Depends(exec_only)):
    with tx() as db:
        c = _case(db, auth, id)
        n = query_one("SELECT author_id FROM case_notes WHERE id = $1 AND case_id = $2", [noteId, c["id"]], db)
        if not n:
            raise not_found("Note")
        if n["author_id"] != auth.employeeId:
            raise forbidden("Only the author can remove a note")
        query("DELETE FROM case_notes WHERE id = $1", [noteId], db)
        audit(request, auth, "case.note_deleted", "hr_case", c["id"], {"noteId": noteId}, db)
        return _case_detail(db, auth, c)


# ── Evidence files ──────────────────────────────────────────────────
@router.post("/lifecycle/cases/{id}/files")
def upload_evidence(id: str, request: Request, file: UploadFile = File(...), auth: AuthContext = Depends(exec_only)):
    filename, ctype, data = _read_upload(file)
    with tx() as db:
        c = _case(db, auth, id)
        row = query_one(
            "INSERT INTO case_files (workspace_id, case_id, filename, content_type, size_bytes, sha256, data, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at",
            [auth.workspaceId, c["id"], filename, ctype, len(data), hashlib.sha256(data).hexdigest(), data, auth.employeeId],
            db,
        )
        query("INSERT INTO case_access_log (case_id, user_id, action, reason) VALUES ($1,$2,'uploaded_evidence',$3)", [c["id"], auth.userId, filename], db)
        audit(request, auth, "case.evidence_uploaded", "hr_case", c["id"], {"fileId": row["id"], "size": len(data)}, db)
    return JSONResponse({"id": row["id"], "name": filename, "size": _size_label(len(data)), "sizeBytes": len(data), "uploaded": iso(row["created_at"])[:10], "downloadable": True}, status_code=201)


@router.get("/lifecycle/case-files/{fileId}/download")
def download_evidence(fileId: str, request: Request, auth: AuthContext = Depends(exec_only)):
    with tx() as db:
        f = query_one("SELECT id, case_id, filename, content_type, data FROM case_files WHERE id = $1 AND workspace_id = $2", [fileId, auth.workspaceId], db)
        if not f:
            raise not_found("File")
        query("INSERT INTO case_access_log (case_id, user_id, action, reason) VALUES ($1,$2,'downloaded_evidence',$3)", [f["case_id"], auth.userId, f["filename"]], db)
        audit(request, auth, "case.evidence_downloaded", "hr_case", f["case_id"], {"fileId": f["id"]}, db)
    return _download(f, request.query_params.get("inline") in ("1", "true"))


# ── Sign-off chain ──────────────────────────────────────────────────
class DecisionBody(BaseModel):
    comment: Trim(None, 1000) | None = None


def _event(db: psycopg.Connection, case_id: str, title: str, by: str, note: str) -> None:
    query(
        "INSERT INTO case_events (case_id, date, title, by_name, note, position) VALUES ($1,current_date,$2,$3,$4,(SELECT COALESCE(max(position),0)+1 FROM case_events WHERE case_id = $1))",
        [case_id, title, by, note],
        db,
    )


@router.post("/lifecycle/cases/{id}/approvals/{step}/{decision}")
def decide_case(id: str, step: str, decision: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exec_only)):
    if step not in STEP_INDEX or decision not in ("approve", "reject"):
        raise not_found("Approval step")
    b = parse(DecisionBody, body or {})
    idx = STEP_INDEX[step]
    _, label, roles = APPROVAL_STEPS[idx]
    if auth.role not in roles:
        raise forbidden(f"Your role cannot act on {label}")
    with tx() as db:
        c = _case(db, auth, id)
        if c["status"] == "Closed":
            raise bad_request("Case is already closed")
        rows = _sync_approvals(db, c)
        row = rows[idx]
        if row["status"] != "Pending":
            raise bad_request(f"{label} is not awaiting a decision")
        me = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId], db)["name"]
        approve = decision == "approve"
        query(
            "UPDATE case_approvals SET status = $3, decided_by = $4, decided_at = now(), comment = $5 WHERE case_id = $1 AND step = $2",
            [c["id"], step, "Approved" if approve else "Rejected", auth.employeeId, b.comment],
            db,
        )
        if approve:
            _event(db, c["id"], f"{label} approved", me, b.comment or "Recommendation endorsed.")
            if idx + 1 < len(APPROVAL_STEPS):
                query("UPDATE case_approvals SET status = 'Pending' WHERE case_id = $1 AND position = $2 AND status IN ('Waiting','Rejected')", [c["id"], idx + 1], db)
                if c["status"] in ("Investigating", "Hearing"):
                    query("UPDATE hr_cases SET status = 'Awaiting Approval' WHERE id = $1", [c["id"]], db)
            else:
                # CEO sign-off closes the case.
                query("UPDATE hr_cases SET status = 'Closed' WHERE id = $1", [c["id"]], db)
                _event(db, c["id"], "Case closed", me, "All sign-offs complete. Outcome communicated in writing.")
        else:
            query("UPDATE case_approvals SET status = 'Waiting' WHERE case_id = $1 AND position > $2 AND status <> 'Approved'", [c["id"], idx], db)
            query("UPDATE hr_cases SET status = 'Investigating' WHERE id = $1", [c["id"]], db)
            _event(db, c["id"], f"{label} rejected", me, b.comment or "Returned to investigation for further evidence.")
        audit(request, auth, f"case.approval_{'approved' if approve else 'rejected'}", "hr_case", c["id"], {"step": step}, db)
        c = _case(db, auth, id)
        return _case_detail(db, auth, c)


# ════════════════════════════════════════════════════════════════════
# Exit & offboarding
# ════════════════════════════════════════════════════════════════════
WORKFLOW = ["Resignation submitted", "Manager acknowledged", "HR approved", "Notice period", "Clearance", "Final settlement", "Exit"]
CHECKLIST: list[tuple[str, str, str]] = [
    ("hr-accept", "HR", "Resignation acceptance letter issued"),
    ("hr-clearance", "HR", "Clearance form signed"),
    ("it-email", "IT", "Disable email account"),
    ("it-github", "IT", "Revoke GitHub access"),
    ("it-slack", "IT", "Revoke Slack access"),
    ("fin-dues", "Finance", "Final dues computed"),
    ("fin-loan", "Finance", "Loan / advance recovery confirmed"),
    ("mgr-handover", "Manager", "Handover sign-off"),
]
#: Name → (serial prefix, replacement value in KES). Accounts carry no value.
ASSET_META: dict[str, tuple[str, int]] = {"Laptop": ("LT", 145_000), "Access card": ("AC", 1_500), "SIM card": ("SIM", 1_000)}
SETTLE_STAGES: list[tuple[str, str, tuple[str, ...]]] = [
    ("Finance", "finance", ("finance", "company_admin", "super_admin")),
    ("HR", "hr", ("company_admin", "hr_officer", "super_admin")),
    ("CEO", "ceo", ("ceo", "super_admin")),
]
SEE_ALL_EXITS = (*EXEC, "finance")
exit_team = require_role(*EXEC, "manager", "finance")


def _off(db: psycopg.Connection, auth: AuthContext, off_id: str) -> Row:
    o = query_one(
        """SELECT o.*, e.name AS emp_name, e.title AS emp_title, e.manager_id AS emp_manager_id, e.department_id AS emp_department_id,
                  e.salary_kes AS emp_salary, e.start_date AS emp_start, e.employee_no AS emp_no, e.email AS emp_email
             FROM offboardings o JOIN employees e ON e.id = o.employee_id WHERE o.id = $1 AND o.workspace_id = $2""",
        [off_id, auth.workspaceId],
        db,
    )
    if not o or not _in_scope(db, auth, o):
        raise not_found("Offboarding")
    return o


def _my_department(db: psycopg.Connection, auth: AuthContext) -> str | None:
    r = query_one("SELECT department_id FROM employees WHERE id = $1", [auth.employeeId], db)
    return r["department_id"] if r else None


def _in_scope(db: psycopg.Connection, auth: AuthContext, o: Row, dept: str | None = None) -> bool:
    if auth.role in SEE_ALL_EXITS:
        return True
    if auth.role == "manager":
        if o["emp_manager_id"] == auth.employeeId:
            return True
        dept = dept if dept is not None else _my_department(db, auth)
        return bool(dept) and o["emp_department_id"] == dept
    return False


def _ensure_items(db: psycopg.Connection, o: Row, prefix: str) -> None:
    """Standard HR/IT/Finance/Manager checklist per exit; serials and values on tracked assets."""
    for i, (key, grp, label) in enumerate(CHECKLIST):
        query(
            "INSERT INTO offboarding_checklist (offboarding_id, item_key, grp, label, done, position) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (offboarding_id, item_key) DO NOTHING",
            [o["id"], key, grp, label, bool(o["handover"]) if key == "mgr-handover" else False, i],
            db,
        )
    for a in query("SELECT id, name, position FROM offboarding_assets WHERE offboarding_id = $1 AND serial IS NULL", [o["id"]], db):
        meta = ASSET_META.get(a["name"])
        seed = int(hashlib.sha1(f"{o['id']}{a['name']}".encode()).hexdigest()[:6], 16)
        serial = f"{prefix}-{meta[0]}-{1000 + seed % 9000}" if meta else (o.get("emp_email") or "Account")
        query("UPDATE offboarding_assets SET serial = $2, value_kes = $3 WHERE id = $1", [a["id"], serial, meta[1] if meta else 0], db)


def _asset_deduction(assets: list[Row]) -> float:
    total = 0.0
    for a in assets:
        v = float(a["value_kes"] or 0)
        if not a["returned"] or a["condition"] == "Lost":
            total += v
        elif a["condition"] == "Damaged":
            total += round(v * 0.4)
    return total


def _compute(o: Row, checklist: list[Row], assets: list[Row], interview: bool, settlement: Row | None) -> tuple[int, int]:
    """Progress (0–100) and workflow stage index, computed from the persisted items."""
    checks = sum(1 for c in checklist if c["done"])
    returned = sum(1 for a in assets if a["returned"])
    settled = bool(settlement and settlement.get("ceo_at"))
    total = len(checklist) + len(assets) + 2
    progress = round(100 * (checks + returned + int(interview) + int(settled)) / total) if total else 0
    cleared = checks == len(checklist) and returned == len(assets)
    if settled and cleared:
        stage = 6
    elif o.get("hr_approved_at"):
        days_left = (dt.date.fromisoformat(o["last_day"]) - dt.date.today()).days
        if cleared:
            stage = 5
        elif days_left <= 7 or (checks + returned) * 2 >= len(checklist) + len(assets):
            stage = 4
        else:
            stage = 3
    elif o.get("manager_ack_at"):
        stage = 1
    else:
        stage = 0
    return progress, stage


def _settlement_calc(o: Row, s: Row | None, assets: list[Row], annual_taken: float) -> dict[str, Any]:
    salary = float(o["emp_salary"] or 0)
    last = dt.date.fromisoformat(o["last_day"])
    start = dt.date.fromisoformat(o["emp_start"])
    if s:
        unpaid_days, leave_days = float(s["unpaid_days"]), float(s["leave_days"])
        notice_pay, loan, other = float(s["notice_pay_kes"]), float(s["loan_kes"]), float(s["other_deduction_kes"])
    else:
        unpaid_days = float(min(30, last.day))
        months = last.month - (start.month - 1 if start.year == last.year else 0)
        leave_days = max(0.0, round(21 * months / 12 - annual_taken, 1))
        notice_pay = salary if o["reason"] == "Termination" else 0.0
        loan = other = 0.0
    unpaid = round(salary * unpaid_days / 30)
    encash = round(salary / 22 * leave_days)
    gross = unpaid + encash + round(notice_pay)
    stat = statutory(gross) if gross > 0 else {"paye": 0, "nssf": 0, "shif": 0, "housingLevy": 0}
    asset_ded = round(_asset_deduction(assets))
    deductions = stat["paye"] + stat["nssf"] + stat["shif"] + stat["housingLevy"] + asset_ded + round(loan) + round(other)
    fmt = lambda n: f"{n:,.0f}"  # noqa: E731
    lines = [
        {"key": "unpaid", "label": "Unpaid salary (pro-rata)", "detail": f"{unpaid_days:g}/30 days of KES {fmt(salary)}", "amount": unpaid, "kind": "earning"},
        {"key": "leave", "label": "Leave encashment", "detail": f"{leave_days:g} annual days × daily rate", "amount": encash, "kind": "earning"},
        {"key": "notice", "label": "Notice pay", "detail": "In lieu of notice" if notice_pay else "Notice served in full", "amount": round(notice_pay), "kind": "earning"},
        {"key": "paye", "label": "PAYE", "detail": "KRA income tax, after personal relief", "amount": stat["paye"], "kind": "deduction"},
        {"key": "shif", "label": "SHIF", "detail": "2.75% of gross (min KES 300)", "amount": stat["shif"], "kind": "deduction"},
        {"key": "nssf", "label": "NSSF", "detail": "Tier I + II, 6% capped", "amount": stat["nssf"], "kind": "deduction"},
        {"key": "housing", "label": "Housing Levy", "detail": "1.5% of gross", "amount": stat["housingLevy"], "kind": "deduction"},
        {"key": "assets", "label": "Unreturned asset recovery", "detail": "Outstanding or damaged company property" if asset_ded else "All assets returned", "amount": asset_ded, "kind": "deduction"},
        {"key": "loan", "label": "Loan / advance recovery", "detail": "Staff loan or salary advance balance" if loan else "No outstanding loans", "amount": round(loan), "kind": "deduction"},
        {"key": "other", "label": "Other deductions", "detail": "As agreed with the employee" if other else "None", "amount": round(other), "kind": "deduction"},
    ]
    return {
        "inputs": {"unpaidDays": unpaid_days, "leaveDays": leave_days, "noticePayKES": round(notice_pay), "loanKES": round(loan), "otherDeductionsKES": round(other)},
        "monthlySalaryKES": salary,
        "lines": lines,
        "gross": gross,
        "statutory": stat,
        "assetDeduction": asset_ded,
        "deductions": deductions,
        "net": gross - deductions,
    }


def _settlement_view(db: psycopg.Connection, auth: AuthContext, o: Row, s: Row | None, assets: list[Row]) -> dict[str, Any]:
    locked = bool(s and s["finance_at"])
    if locked:
        # Frozen at Finance approval: show the stored figures.
        calc = _settlement_calc(o, s, [], 0)
        calc["assetDeduction"] = float(s["asset_deduction_kes"])
        for line in calc["lines"]:
            if line["key"] == "assets":
                line["amount"] = float(s["asset_deduction_kes"])
                line["detail"] = "Outstanding or damaged company property" if line["amount"] else "All assets returned"
        stat = {"paye": float(s["paye_kes"]), "nssf": float(s["nssf_kes"]), "shif": float(s["shif_kes"]), "housingLevy": float(s["housing_levy_kes"])}
        calc.update(gross=float(s["gross_kes"]), statutory=stat, net=float(s["net_kes"]), deductions=float(s["gross_kes"]) - float(s["net_kes"]))
    else:
        taken = query_one(
            "SELECT COALESCE(sum(days),0)::float AS d FROM leave_requests WHERE employee_id = $1 AND type = 'Annual' AND status = 'Approved' AND date_part('year', start_date) = date_part('year', $2::date)",
            [o["employee_id"], o["last_day"]],
            db,
        )["d"]
        calc = _settlement_calc(o, s, assets, taken)
    names = _names(db, {s and s["finance_by"], s and s["hr_by"], s and s["ceo_by"]} if s else set())
    approvals = []
    prev_done = True
    for stage, col, roles in SETTLE_STAGES:
        at = s[f"{col}_at"] if s else None
        status = "Approved" if at else ("Pending" if prev_done else "Waiting")
        approvals.append({"stage": stage, "status": status, "by": names.get(s[f"{col}_by"]) if s and at else None, "at": iso(at), "canAct": status == "Pending" and auth.role in roles})
        prev_done = bool(at)
    return {**calc, "saved": bool(s), "locked": locked, "approvals": approvals, "updatedAt": iso(s["updated_at"]) if s else None}


def _save_settlement(db: psycopg.Connection, auth: AuthContext, o: Row, calc: dict[str, Any]) -> None:
    i, st = calc["inputs"], calc["statutory"]
    query(
        """INSERT INTO offboarding_settlements (offboarding_id, monthly_salary_kes, unpaid_days, leave_days, notice_pay_kes, asset_deduction_kes, loan_kes, other_deduction_kes,
             gross_kes, paye_kes, nssf_kes, shif_kes, housing_levy_kes, net_kes, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
           ON CONFLICT (offboarding_id) DO UPDATE SET monthly_salary_kes = EXCLUDED.monthly_salary_kes, unpaid_days = EXCLUDED.unpaid_days, leave_days = EXCLUDED.leave_days,
             notice_pay_kes = EXCLUDED.notice_pay_kes, asset_deduction_kes = EXCLUDED.asset_deduction_kes, loan_kes = EXCLUDED.loan_kes, other_deduction_kes = EXCLUDED.other_deduction_kes,
             gross_kes = EXCLUDED.gross_kes, paye_kes = EXCLUDED.paye_kes, nssf_kes = EXCLUDED.nssf_kes, shif_kes = EXCLUDED.shif_kes, housing_levy_kes = EXCLUDED.housing_levy_kes,
             net_kes = EXCLUDED.net_kes, updated_by = EXCLUDED.updated_by, updated_at = now()""",
        [o["id"], calc["monthlySalaryKES"], i["unpaidDays"], i["leaveDays"], i["noticePayKES"], calc["assetDeduction"], i["loanKES"], i["otherDeductionsKES"],
         calc["gross"], st["paye"], st["nssf"], st["shif"], st["housingLevy"], calc["net"], auth.employeeId],
        db,
    )
    query("UPDATE offboardings SET final_dues_kes = $2 WHERE id = $1", [o["id"], max(0, calc["net"])], db)
    query(
        "UPDATE offboarding_checklist SET done = true, done_by = $2, done_at = now() WHERE offboarding_id = $1 AND item_key = 'fin-dues' AND NOT done",
        [o["id"], auth.employeeId],
        db,
    )


def _prefix(db: psycopg.Connection, auth: AuthContext) -> str:
    w = query_one("SELECT logo_text, slug FROM workspaces WHERE id = $1", [auth.workspaceId], db)
    return (w["logo_text"] or w["slug"][:3]).upper().replace(" ", "")[:5]


def _off_payload(db: psycopg.Connection, auth: AuthContext, o: Row, prefix: str, full: bool) -> dict[str, Any]:
    _ensure_items(db, o, prefix)
    checklist = query("SELECT * FROM offboarding_checklist WHERE offboarding_id = $1 ORDER BY position", [o["id"]], db)
    assets = query("SELECT * FROM offboarding_assets WHERE offboarding_id = $1 ORDER BY position", [o["id"]], db)
    files = query("SELECT id, kind, filename, content_type, size_bytes, uploaded_by, created_at FROM offboarding_files WHERE offboarding_id = $1 ORDER BY created_at", [o["id"]], db)
    s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db)
    interview = query_one("SELECT * FROM exit_interviews WHERE offboarding_id = $1", [o["id"]], db)
    interview_done = bool(interview) or bool(o["exit_interview"])
    progress, stage = _compute(o, checklist, assets, interview_done, s)
    handover = next((bool(c["done"]) for c in checklist if c["item_key"] == "mgr-handover"), bool(o["handover"]))
    if (progress, stage, handover, interview_done) != (o["progress"], o["stage"], o["handover"], o["exit_interview"]):
        query("UPDATE offboardings SET progress = $2, stage = $3, handover = $4, exit_interview = $5 WHERE id = $1", [o["id"], progress, stage, handover, interview_done], db)
    names = _names(db, {o.get("successor_id"), o.get("manager_ack_by"), o.get("hr_approved_by"), *(f["uploaded_by"] for f in files), *(c["done_by"] for c in checklist)})
    can_settle = auth.role in (*EXEC, "finance")
    out: dict[str, Any] = {
        "id": o["id"],
        "employeeId": o["employee_id"],
        "employeeName": o["emp_name"],
        "employeeTitle": o["emp_title"],
        "reason": o["reason"],
        "submitted": o["submitted"],
        "lastDay": o["last_day"],
        "noticeDays": o["notice_days"],
        "progress": progress,
        "stage": stage,
        "stageLabel": WORKFLOW[stage],
        "handover": handover,
        "handoverNotes": o["handover_notes"],
        "successorId": o.get("successor_id"),
        "successorName": names.get(o.get("successor_id") or ""),
        "exitInterview": interview_done,
        "finalDuesKES": float(o["final_dues_kes"]) if can_settle else None,
        "managerAck": {"by": names.get(o["manager_ack_by"] or ""), "at": iso(o["manager_ack_at"])} if o.get("manager_ack_at") else None,
        "hrApproval": {"by": names.get(o["hr_approved_by"] or ""), "at": iso(o["hr_approved_at"])} if o.get("hr_approved_at") else None,
        "checklist": [
            {"id": c["id"], "key": c["item_key"], "group": c["grp"], "label": c["label"], "done": c["done"], "doneBy": names.get(c["done_by"] or ""), "doneAt": iso(c["done_at"])}
            for c in checklist
        ],
        "assets": [
            {"id": a["id"], "name": a["name"], "serial": a["serial"], "condition": a["condition"], "returned": a["returned"], "valueKES": float(a["value_kes"]), "returnedAt": iso(a["returned_at"])}
            for a in assets
        ],
        "files": [
            {"id": f["id"], "kind": f["kind"], "filename": f["filename"], "contentType": f["content_type"], "sizeBytes": f["size_bytes"], "uploadedBy": names.get(f["uploaded_by"] or ""), "createdAt": iso(f["created_at"])}
            for f in files
        ],
        "settlementStatus": ("Approved" if s and s["ceo_at"] else "In approval" if s and s["finance_at"] else "Draft" if s else "Not started") if can_settle else None,
        "canAcknowledge": stage == 0 and not o.get("manager_ack_at") and (is_admin(auth.role) or o["emp_manager_id"] == auth.employeeId),
        "canApprove": bool(o.get("manager_ack_at")) and not o.get("hr_approved_at") and is_admin(auth.role),
    }
    if full:
        out["settlement"] = _settlement_view(db, auth, o, s, assets) if can_settle else None
        # Exit interview answers are confidential to HR admins.
        out["interview"] = _interview(interview) if interview and is_admin(auth.role) else None
    return out


def _interview(r: Row) -> dict[str, Any]:
    return {
        "reason": r["reason"],
        "nps": r["nps"],
        "wouldRecommend": r["would_recommend"],
        "improvements": r["improvements"],
        "managerRating": r["manager_rating"],
        "wouldReturn": r["would_return"],
        "submittedAt": iso(r["submitted_at"]),
    }


OFF_SELECT = """SELECT o.*, e.name AS emp_name, e.title AS emp_title, e.manager_id AS emp_manager_id, e.department_id AS emp_department_id,
                       e.salary_kes AS emp_salary, e.start_date AS emp_start, e.employee_no AS emp_no, e.email AS emp_email
                  FROM offboardings o JOIN employees e ON e.id = o.employee_id"""


@router.get("/lifecycle/offboardings")
def list_offboardings(auth: AuthContext = Depends(exit_team)):
    with tx() as db:
        rows = query(f"{OFF_SELECT} WHERE o.workspace_id = $1 ORDER BY o.submitted DESC", [auth.workspaceId], db)
        dept = _my_department(db, auth) if auth.role == "manager" else None
        prefix = _prefix(db, auth)
        return [_off_payload(db, auth, o, prefix, False) for o in rows if _in_scope(db, auth, o, dept or "")]


@router.get("/lifecycle/offboardings/{id}")
def get_offboarding(id: str, auth: AuthContext = Depends(exit_team)):
    with tx() as db:
        o = _off(db, auth, id)
        return _off_payload(db, auth, o, _prefix(db, auth), True)


def _detail(db: psycopg.Connection, auth: AuthContext, off_id: str) -> dict[str, Any]:
    return _off_payload(db, auth, _off(db, auth, off_id), _prefix(db, auth), True)


def _can_edit(auth: AuthContext) -> None:
    if not (is_admin(auth.role) or auth.role == "manager"):
        raise forbidden()


# ── Workflow ────────────────────────────────────────────────────────
@router.post("/lifecycle/offboardings/{id}/acknowledge")
def acknowledge_exit(id: str, request: Request, auth: AuthContext = Depends(exit_team)):
    with tx() as db:
        o = _off(db, auth, id)
        if not (is_admin(auth.role) or o["emp_manager_id"] == auth.employeeId):
            raise forbidden("Only the employee's manager or HR can acknowledge")
        if o["manager_ack_at"]:
            raise bad_request("Already acknowledged")
        query("UPDATE offboardings SET manager_ack_by = $2, manager_ack_at = now() WHERE id = $1", [o["id"], auth.employeeId], db)
        audit(request, auth, "offboarding.acknowledged", "offboarding", o["id"], None, db)
        return _detail(db, auth, id)


@router.post("/lifecycle/offboardings/{id}/approve")
def approve_exit(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    with tx() as db:
        o = _off(db, auth, id)
        if not o["manager_ack_at"]:
            raise bad_request("The manager must acknowledge the resignation first")
        if o["hr_approved_at"]:
            raise bad_request("Already approved")
        query("UPDATE offboardings SET hr_approved_by = $2, hr_approved_at = now() WHERE id = $1", [o["id"], auth.employeeId], db)
        audit(request, auth, "offboarding.hr_approved", "offboarding", o["id"], None, db)
        return _detail(db, auth, id)


class ChecklistPatch(Strict):
    done: bool


@router.patch("/lifecycle/offboardings/{id}/checklist/{itemId}")
def toggle_item(id: str, itemId: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exit_team)):
    b = parse(ChecklistPatch, body)
    with tx() as db:
        o = _off(db, auth, id)
        item = query_one("SELECT * FROM offboarding_checklist WHERE id = $1 AND offboarding_id = $2", [itemId, o["id"]], db)
        if not item:
            raise not_found("Checklist item")
        allowed = is_admin(auth.role) or (auth.role == "finance" and item["grp"] == "Finance") or (auth.role == "manager" and item["grp"] == "Manager")
        if not allowed:
            raise forbidden(f"{item['grp']} items are completed by {item['grp'] if item['grp'] != 'IT' else 'HR / IT'}")
        query(
            "UPDATE offboarding_checklist SET done = $2, done_by = CASE WHEN $2 THEN $3 END, done_at = CASE WHEN $2 THEN now() END WHERE id = $1",
            [itemId, b.done, auth.employeeId],
            db,
        )
        audit(request, auth, "offboarding.checklist", "offboarding", o["id"], {"item": item["item_key"], "done": b.done}, db)
        return _detail(db, auth, id)


class AssetBody(Strict):
    returned: bool | None = None
    condition: Literal["Good", "Fair", "Damaged", "Lost"] | None = None
    serial: Trim(1, 80) | None = None


@router.patch("/lifecycle/offboardings/{id}/assets/{assetId}")
def patch_asset(id: str, assetId: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exit_team)):
    b = parse(AssetBody, body)
    _can_edit(auth)
    with tx() as db:
        o = _off(db, auth, id)
        a = query_one("SELECT id FROM offboarding_assets WHERE id = $1 AND offboarding_id = $2", [assetId, o["id"]], db)
        if not a:
            raise not_found("Asset")
        query(
            """UPDATE offboarding_assets SET returned = COALESCE($2, returned), condition = COALESCE($3, condition), serial = COALESCE($4, serial),
                 returned_at = CASE WHEN $2::boolean IS TRUE AND NOT returned THEN now() WHEN $2::boolean IS FALSE THEN NULL ELSE returned_at END WHERE id = $1""",
            [assetId, b.returned, b.condition, b.serial],
            db,
        )
        audit(request, auth, "offboarding.asset", "offboarding", o["id"], {"assetId": assetId, **b.model_dump(exclude_none=True)}, db)
        return _detail(db, auth, id)


class HandoverBody(Strict):
    handoverNotes: Trim(None, 8000) | None = None
    successorId: str | None = None
    signOff: bool | None = None


@router.patch("/lifecycle/offboardings/{id}/handover")
def patch_handover(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(exit_team)):
    b = parse(HandoverBody, body)
    _can_edit(auth)
    with tx() as db:
        o = _off(db, auth, id)
        if b.successorId:
            if b.successorId == o["employee_id"] or not query_one("SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2 AND status <> 'Exited'", [b.successorId, auth.workspaceId], db):
                raise bad_request("Choose an active colleague as successor")
        query(
            "UPDATE offboardings SET handover_notes = COALESCE($2, handover_notes), successor_id = CASE WHEN $3::text IS NULL THEN successor_id ELSE NULLIF($3, '') END WHERE id = $1",
            [o["id"], b.handoverNotes, b.successorId],
            db,
        )
        if b.signOff is not None:
            _ensure_items(db, o, _prefix(db, auth))
            query(
                "UPDATE offboarding_checklist SET done = $2, done_by = CASE WHEN $2 THEN $3 END, done_at = CASE WHEN $2 THEN now() END WHERE offboarding_id = $1 AND item_key = 'mgr-handover'",
                [o["id"], b.signOff, auth.employeeId],
                db,
            )
        audit(request, auth, "offboarding.handover", "offboarding", o["id"], {"successorId": b.successorId, "signOff": b.signOff}, db)
        return _detail(db, auth, id)


# ── Files (resignation letter, knowledge transfer) ─────────────────
@router.post("/lifecycle/offboardings/{id}/files")
def upload_off_file(id: str, request: Request, file: UploadFile = File(...), kind: str = Form(...), auth: AuthContext = Depends(exit_team)):
    if kind not in ("resignation_letter", "knowledge_transfer"):
        raise bad_request("Validation failed", [{"path": "kind", "message": "Must be resignation_letter or knowledge_transfer"}])
    _can_edit(auth)
    filename, ctype, data = _read_upload(file)
    with tx() as db:
        o = _off(db, auth, id)
        row = query_one(
            "INSERT INTO offboarding_files (workspace_id, offboarding_id, kind, filename, content_type, size_bytes, sha256, data, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, created_at",
            [auth.workspaceId, o["id"], kind, filename, ctype, len(data), hashlib.sha256(data).hexdigest(), data, auth.employeeId],
            db,
        )
        audit(request, auth, "offboarding.file_uploaded", "offboarding", o["id"], {"fileId": row["id"], "kind": kind}, db)
    return JSONResponse({"id": row["id"], "kind": kind, "filename": filename, "contentType": ctype, "sizeBytes": len(data), "createdAt": iso(row["created_at"])}, status_code=201)


@router.get("/lifecycle/offboarding-files/{fileId}/download")
def download_off_file(fileId: str, request: Request, auth: AuthContext = Depends(exit_team)):
    with tx() as db:
        f = query_one("SELECT id, offboarding_id, filename, content_type, data FROM offboarding_files WHERE id = $1 AND workspace_id = $2", [fileId, auth.workspaceId], db)
        if not f:
            raise not_found("File")
        _off(db, auth, f["offboarding_id"])
        audit(request, auth, "offboarding.file_downloaded", "offboarding", f["offboarding_id"], {"fileId": f["id"]}, db)
    return _download(f, request.query_params.get("inline") in ("1", "true"))


@router.delete("/lifecycle/offboarding-files/{fileId}")
def delete_off_file(fileId: str, request: Request, auth: AuthContext = Depends(exit_team)):
    _can_edit(auth)
    with tx() as db:
        f = query_one("SELECT id, offboarding_id, uploaded_by FROM offboarding_files WHERE id = $1 AND workspace_id = $2", [fileId, auth.workspaceId], db)
        if not f:
            raise not_found("File")
        _off(db, auth, f["offboarding_id"])
        if f["uploaded_by"] != auth.employeeId and not is_admin(auth.role):
            raise forbidden()
        query("DELETE FROM offboarding_files WHERE id = $1", [fileId], db)
        audit(request, auth, "offboarding.file_deleted", "offboarding", f["offboarding_id"], {"fileId": fileId}, db)
    return Response(status_code=204)


# ── Final settlement ────────────────────────────────────────────────
settlement_team = require_role(*EXEC, "finance")


class SettlementBody(Strict):
    unpaidDays: Annotated[float, Field(ge=0, le=31)]
    leaveDays: Annotated[float, Field(ge=0, le=120)]
    noticePayKES: Annotated[float, Field(ge=0, le=100_000_000)] = 0
    loanKES: Annotated[float, Field(ge=0, le=100_000_000)] = 0
    otherDeductionsKES: Annotated[float, Field(ge=0, le=100_000_000)] = 0

    model_config = ConfigDict(strict=False)


def _settle_ctx(db: psycopg.Connection, auth: AuthContext, id: str) -> tuple[Row, Row | None, list[Row]]:
    o = _off(db, auth, id)
    _ensure_items(db, o, _prefix(db, auth))
    s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db)
    assets = query("SELECT * FROM offboarding_assets WHERE offboarding_id = $1 ORDER BY position", [o["id"]], db)
    return o, s, assets


@router.get("/lifecycle/offboardings/{id}/settlement")
def get_settlement(id: str, auth: AuthContext = Depends(settlement_team)):
    with tx() as db:
        o, s, assets = _settle_ctx(db, auth, id)
        return _settlement_view(db, auth, o, s, assets)


@router.put("/lifecycle/offboardings/{id}/settlement")
def save_settlement(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN, "finance"))):
    b = parse(SettlementBody, body)
    with tx() as db:
        o, s, assets = _settle_ctx(db, auth, id)
        if s and s["finance_at"]:
            raise conflict("Final dues are locked once Finance has approved them")
        inputs = {"unpaid_days": b.unpaidDays, "leave_days": b.leaveDays, "notice_pay_kes": b.noticePayKES, "loan_kes": b.loanKES, "other_deduction_kes": b.otherDeductionsKES}
        calc = _settlement_calc(o, inputs, assets, 0)
        _save_settlement(db, auth, o, calc)
        audit(request, auth, "offboarding.settlement_saved", "offboarding", o["id"], {"net": calc["net"]}, db)
        s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db)
        return _settlement_view(db, auth, o, s, assets)


class SettleApproveBody(Strict):
    stage: Literal["Finance", "HR", "CEO"]


@router.post("/lifecycle/offboardings/{id}/settlement/approve")
def approve_settlement(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(settlement_team)):
    b = parse(SettleApproveBody, body)
    idx = next(i for i, (st, _, _) in enumerate(SETTLE_STAGES) if st == b.stage)
    stage, col, roles = SETTLE_STAGES[idx]
    if auth.role not in roles:
        raise forbidden(f"Your role cannot approve the {stage} stage")
    with tx() as db:
        o, s, assets = _settle_ctx(db, auth, id)
        if idx == 0 and not (s and s["finance_at"]):
            # Finance approval freezes the current computation (saving a draft if none exists yet).
            view = _settlement_view(db, auth, o, s, assets)
            _save_settlement(db, auth, o, view)
            s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db)
        if not s:
            raise bad_request("Compute and save the final dues first")
        if s[f"{col}_at"]:
            raise bad_request(f"{stage} has already approved")
        if idx > 0 and not s[f"{SETTLE_STAGES[idx - 1][1]}_at"]:
            raise bad_request(f"Waiting for {SETTLE_STAGES[idx - 1][0]} approval")
        query(f"UPDATE offboarding_settlements SET {col}_by = $2, {col}_at = now() WHERE offboarding_id = $1", [o["id"], auth.employeeId], db)
        if idx == len(SETTLE_STAGES) - 1:
            query("UPDATE offboardings SET final_dues_kes = $2 WHERE id = $1", [o["id"], max(0, float(s["net_kes"]))], db)
            query("UPDATE employees SET status = 'Exited', updated_at = now() WHERE id = $1 AND $2::date <= current_date", [o["employee_id"], o["last_day"]], db)
            query(
                "INSERT INTO notifications (workspace_id, type, title, body, href, audience) VALUES ($1,'payroll',$2,$3,'/app/offboarding','admins')",
                [auth.workspaceId, f"Final dues approved for {o['emp_name']}", f"KES {float(s['net_kes']):,.0f} released to payroll."],
                db,
            )
        audit(request, auth, "offboarding.settlement_approved", "offboarding", o["id"], {"stage": stage}, db)
        s = query_one("SELECT * FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db)
        return _settlement_view(db, auth, o, s, assets)


@router.get("/lifecycle/offboardings/{id}/certificate")
def certificate_of_service(id: str, request: Request, auth: AuthContext = Depends(require_role(*EXEC))):
    with tx() as db:
        o = _off(db, auth, id)
        w = query_one("SELECT name, country FROM workspaces WHERE id = $1", [auth.workspaceId], db)
        signer = query_one(
            "SELECT name, title FROM employees WHERE workspace_id = $1 AND role = 'company_admin' AND status <> 'Exited' ORDER BY employee_no LIMIT 1", [auth.workspaceId], db
        ) or query_one("SELECT name, title FROM employees WHERE id = $1", [auth.employeeId], db)
        audit(request, auth, "offboarding.certificate_generated", "offboarding", o["id"], None, db)
    e = html.escape
    fmt = lambda d: dt.date.fromisoformat(d).strftime("%-d %B %Y")  # noqa: E731
    today = dt.date.today().strftime("%-d %B %Y")
    body = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Certificate of service — {e(o['emp_name'])}</title>
<style>
  body {{ font-family: Georgia, 'Times New Roman', serif; color: #111827; max-width: 720px; margin: 48px auto; padding: 0 24px; line-height: 1.6; }}
  h1 {{ font-size: 24px; letter-spacing: .04em; text-transform: uppercase; margin: 0 0 4px; }}
  .org {{ font-size: 14px; color: #4b5563; margin-bottom: 32px; }}
  table {{ border-collapse: collapse; margin: 24px 0; width: 100%; }}
  td {{ padding: 8px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }}
  td:first-child {{ width: 40%; color: #4b5563; }}
  .sign {{ margin-top: 56px; }}
  .line {{ border-top: 1px solid #111827; width: 260px; margin-bottom: 4px; }}
  small {{ color: #6b7280; }}
  @media print {{ body {{ margin: 0 auto; }} }}
</style></head>
<body>
  <h1>Certificate of service</h1>
  <div class="org">{e(w['name'])} · Issued {today}</div>
  <p>This is to certify that <strong>{e(o['emp_name'])}</strong> was employed by {e(w['name'])} as set out below.</p>
  <table>
    <tr><td>Employee number</td><td>{e(o['emp_no'])}</td></tr>
    <tr><td>Position held</td><td>{e(o['emp_title'])}</td></tr>
    <tr><td>Date employment began</td><td>{fmt(o['emp_start'])}</td></tr>
    <tr><td>Date employment ended</td><td>{fmt(o['last_day'])}</td></tr>
  </table>
  <p>We thank {e(o['emp_name'].split(' ')[0])} for their service and wish them well in their future endeavours.</p>
  <div class="sign"><div class="line"></div>{e(signer['name'])}<br><small>{e(signer['title'])}, for and on behalf of {e(w['name'])}</small></div>
  <p style="margin-top:40px"><small>Issued under Section 51 of the Employment Act, 2007 (Kenya).</small></p>
</body></html>"""
    safe = re.sub(r"[^A-Za-z0-9-]+", "-", o["emp_name"]).strip("-").lower()
    return Response(
        content=body.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="certificate-of-service-{safe}.html"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


# ── Exit interview (filled by the leaving employee) ─────────────────
def _my_offboarding(db: psycopg.Connection, auth: AuthContext) -> Row | None:
    return query_one(
        """SELECT o.* FROM offboardings o JOIN employees e ON e.id = o.employee_id
            WHERE o.employee_id = $1 AND o.workspace_id = $2 AND (e.status <> 'Exited' OR o.last_day >= current_date - 30)
            ORDER BY o.submitted DESC LIMIT 1""",
        [auth.employeeId, auth.workspaceId],
        db,
    )


@router.get("/offboardings/me")
@router.get("/lifecycle/me/offboarding")
def my_offboarding(auth: AuthContext = Depends(require_auth)):
    with tx() as db:
        o = _my_offboarding(db, auth)
        if not o:
            return {"offboarding": None, "interview": None}
        r = query_one("SELECT * FROM exit_interviews WHERE offboarding_id = $1", [o["id"]], db)
    return {
        "offboarding": {"id": o["id"], "reason": o["reason"], "submitted": o["submitted"], "lastDay": o["last_day"], "noticeDays": o["notice_days"], "stage": o["stage"], "stageLabel": WORKFLOW[o["stage"]]},
        # The employee may see their own answers.
        "interview": _interview(r) if r else None,
    }


class InterviewBody(Strict):
    reason: Trim(2, 120)
    nps: Annotated[int, Field(ge=0, le=10)]
    wouldRecommend: bool
    improvements: Trim(None, 4000) = ""
    managerRating: Annotated[int, Field(ge=1, le=5)]
    wouldReturn: bool


@router.post("/offboardings/me/exit-interview")
@router.post("/lifecycle/me/exit-interview")
def submit_exit_interview(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(InterviewBody, body)
    with tx() as db:
        o = _my_offboarding(db, auth)
        if not o:
            raise not_found("Active offboarding")
        if query_one("SELECT 1 FROM exit_interviews WHERE offboarding_id = $1", [o["id"]], db):
            raise conflict("You have already submitted your exit interview")
        r = query_one(
            """INSERT INTO exit_interviews (offboarding_id, employee_id, reason, nps, would_recommend, improvements, manager_rating, would_return)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *""",
            [o["id"], auth.employeeId, b.reason, b.nps, b.wouldRecommend, b.improvements, b.managerRating, b.wouldReturn],
            db,
        )
        query("UPDATE offboardings SET exit_interview = true WHERE id = $1", [o["id"]], db)
        name = query_one("SELECT name FROM employees WHERE id = $1", [auth.employeeId], db)["name"]
        query(
            "INSERT INTO notifications (workspace_id, type, title, body, href, audience) VALUES ($1,'system',$2,'Responses are available to HR in the exit record.','/app/offboarding','admins')",
            [auth.workspaceId, f"{name} completed their exit interview"],
            db,
        )
        audit(request, auth, "offboarding.exit_interview_submitted", "offboarding", o["id"], None, db)
    return JSONResponse({"interview": _interview(r)}, status_code=201)
