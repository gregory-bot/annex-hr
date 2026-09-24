"""Employee files: upload, list, download and delete (bytes stored in Postgres for now)."""

from __future__ import annotations

import hashlib
import os
import re
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from ..audit import audit
from ..db import query, query_one, tx
from ..employee_records import FILE_CATEGORIES, FILE_META, can_view_files, recompute_onboarding, to_file
from ..errors import HttpError, bad_request, forbidden, not_found
from ..security import AuthContext, require_auth

router = APIRouter()
FILE_CATEGORIES = (*FILE_CATEGORIES, "Handover")  # leave handover notes (linked from leave_requests.handover_file_id)

MAX_BYTES = 10 * 1024 * 1024

#: Allowed extensions → the Content-Type we store and serve (never the client-supplied one).
ALLOWED: dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "heic": "image/heic",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

#: Types safe to render inline in the browser.
INLINE = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


def _looks_like(ext: str, head: bytes) -> bool:
    """Light magic-byte check so a renamed executable can't pose as a PDF or image."""
    if ext == "pdf":
        return head.startswith(b"%PDF")
    if ext == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in ("jpg", "jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext == "heic":
        return head[4:8] == b"ftyp"
    if ext == "docx":
        return head.startswith(b"PK\x03\x04")
    if ext == "doc":
        return head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    return False


def _clean_name(name: str) -> str:
    base = os.path.basename((name or "").replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip() or "document"
    if len(base) > 180:
        stem, dot, ext = base.rpartition(".")
        base = (stem[: 170] + dot + ext) if dot else base[:180]
    return base


def _employee(db, workspace_id: str, employee_id: str):
    e = query_one("SELECT id, manager_id, name FROM employees WHERE id = $1 AND workspace_id = $2", [employee_id, workspace_id], db)
    if not e:
        raise not_found("Employee")
    return e


@router.post("/files")
def upload_file(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(...),
    employeeId: Optional[str] = Form(None),
    taskId: Optional[str] = Form(None),
    auth: AuthContext = Depends(require_auth),
):
    if category not in FILE_CATEGORIES:
        raise bad_request("Validation failed", [{"path": "category", "message": f"Must be one of: {', '.join(FILE_CATEGORIES)}"}])
    target = (employeeId or "").strip() or auth.employeeId
    # Documents belong to the employee: only they upload to their own file. HR can view and download.
    if target != auth.employeeId:
        raise forbidden("Only the employee can upload documents to their profile")

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

    with tx() as db:
        _employee(db, auth.workspaceId, target)
        task = (taskId or "").strip() or None
        if task and not query_one("SELECT 1 FROM onboarding_tasks WHERE workspace_id = $1 AND id = $2", [auth.workspaceId, task], db):
            raise not_found("Onboarding task")
        row = query_one(
            f"""WITH f AS (
                INSERT INTO employee_files (workspace_id, employee_id, category, task_id, filename, content_type, size_bytes, sha256, data, uploaded_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *)
              SELECT {FILE_META} FROM f""",
            [auth.workspaceId, target, category, task, filename, ALLOWED[ext], len(data), hashlib.sha256(data).hexdigest(), data, auth.employeeId],
            db,
        )
        audit(request, auth, "file.uploaded", "employee_file", row["id"], {"employeeId": target, "category": category, "taskId": task, "size": len(data)}, db)  # type: ignore[index]
    return JSONResponse(to_file(row), status_code=201)  # type: ignore[arg-type]


@router.get("/employees/{id}/files")
def list_files(id: str, auth: AuthContext = Depends(require_auth)):
    emp_id = auth.employeeId if id == "me" else id
    # One round trip: the access check data and the file list together.
    b = query_one(
        f"""SELECT (SELECT row_to_json(e) FROM (SELECT id, manager_id FROM employees WHERE id = $1 AND workspace_id = $2) e) AS emp,
             COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM (SELECT {FILE_META} FROM employee_files f WHERE f.employee_id = $1 AND f.workspace_id = $2) x), '[]'::json) AS files""",
        [emp_id, auth.workspaceId],
    )
    if not b or not b["emp"]:
        raise not_found("Employee")
    if not can_view_files(auth, b["emp"]):
        raise forbidden()
    return [to_file(f) for f in b["files"]]


@router.get("/files/{id}/download")
def download_file(id: str, request: Request, auth: AuthContext = Depends(require_auth)):
    f = query_one(
        """SELECT f.id, f.employee_id, f.filename, f.content_type, f.data, e.manager_id
         FROM employee_files f JOIN employees e ON e.id = f.employee_id
        WHERE f.id = $1 AND f.workspace_id = $2""",
        [id, auth.workspaceId],
    )
    if not f:
        raise not_found("File")
    if not can_view_files(auth, {"id": f["employee_id"], "manager_id": f["manager_id"]}):
        raise forbidden()
    audit(request, auth, "file.downloaded", "employee_file", f["id"], {"employeeId": f["employee_id"]})
    inline = request.query_params.get("inline") in ("1", "true") and f["content_type"] in INLINE
    ascii_name = re.sub(r'[^A-Za-z0-9._ -]', "_", f["filename"])
    disposition = f"{'inline' if inline else 'attachment'}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(f['filename'])}"
    return Response(
        content=bytes(f["data"]),
        media_type=f["content_type"],
        headers={"Content-Disposition": disposition, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/files/{id}")
def delete_file(id: str, request: Request, auth: AuthContext = Depends(require_auth)):
    with tx() as db:
        f = query_one("SELECT id, employee_id, uploaded_by, category, task_id FROM employee_files WHERE id = $1 AND workspace_id = $2", [id, auth.workspaceId], db)
        if not f:
            raise not_found("File")
        if f["employee_id"] != auth.employeeId:
            raise forbidden("Only the employee can remove their documents")
        # A document task whose file is removed is no longer complete.
        reopened = query("DELETE FROM onboarding_task_completions WHERE file_id = $1 RETURNING task_id", [id], db)
        query("DELETE FROM employee_files WHERE id = $1", [id], db)
        if reopened:
            recompute_onboarding(db, auth.workspaceId, f["employee_id"])
        audit(request, auth, "file.deleted", "employee_file", id, {"employeeId": f["employee_id"], "category": f["category"], "taskId": f["task_id"]}, db)
    return Response(status_code=204)
