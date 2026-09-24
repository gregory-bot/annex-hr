"""Audit-ready employee files: a completeness checklist and a downloadable ZIP pack (HR admins)."""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
import zipfile
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from ..audit import audit
from ..db import iso, query, query_one
from ..errors import not_found
from ..roles import ADMIN
from ..security import AuthContext, require_role

router = APIRouter()


def _load(auth: AuthContext, employee_id: str, with_bytes: bool = False) -> dict[str, Any]:
    """Everything the checklist and pack need, in one round trip."""
    data_col = ", f.data" if with_bytes else ""
    b = query_one(
        f"""SELECT
          (SELECT row_to_json(e) FROM (SELECT e.id, e.name, e.employee_no, e.title, e.email, e.status, e.start_date, e.kra_pin, e.national_id,
                                             d.name AS department
                                        FROM employees e LEFT JOIN departments d ON d.id = e.department_id
                                       WHERE e.id = $1 AND e.workspace_id = $2) e) AS emp,
          (SELECT row_to_json(p) FROM (SELECT shif_number, nssf_number, passport_number, nda_signature, nda_signed_at FROM employee_profiles WHERE employee_id = $1) p) AS profile,
          COALESCE((SELECT json_agg(c ORDER BY c.type) FROM (SELECT id, type, number, issued, expires, status, file_id FROM compliance_documents WHERE employee_id = $1 AND workspace_id = $2) c), '[]') AS compliance,
          COALESCE((SELECT json_agg(f ORDER BY f.created_at) FROM (SELECT id, category, filename, content_type, size_bytes, sha256, created_at FROM employee_files WHERE employee_id = $1 AND workspace_id = $2) f), '[]') AS files,
          COALESCE((SELECT json_agg(x ORDER BY x.title) FROM (
             SELECT p.id, p.title, p.version, p.mandatory,
                    (SELECT row_to_json(a) FROM (SELECT version, signature, ip_address, acknowledged_at FROM policy_acknowledgements
                                                  WHERE policy_id = p.id AND employee_id = $1 ORDER BY acknowledged_at DESC LIMIT 1) a) AS ack
               FROM policies p WHERE p.workspace_id = $2) x), '[]') AS policies,
          (SELECT max(created_at) FROM audit_logs WHERE workspace_id = $2 AND action = 'employee.audit_pack_downloaded' AND entity_id = $1) AS last_pack""",
        [employee_id, auth.workspaceId],
    )
    if not b or not b["emp"]:
        raise not_found("Employee")
    if with_bytes:
        b["blobs"] = {r["id"]: bytes(r["data"]) for r in query(f"SELECT f.id{data_col} FROM employee_files f WHERE f.employee_id = $1 AND f.workspace_id = $2", [employee_id, auth.workspaceId])}
    return b


def _checklist(b: dict[str, Any]) -> list[dict[str, Any]]:
    e, p = b["emp"], b["profile"] or {}
    files = b["files"]
    comp = b["compliance"]
    has_file = lambda cat: any(f["category"] == cat for f in files)  # noqa: E731
    items: list[dict[str, Any]] = []

    def statutory(key: str, label: str, number: Any, category: str) -> None:
        if number and has_file(category):
            items.append({"key": key, "label": label, "status": "ok", "note": "Number and scan on file"})
        elif number or has_file(category):
            items.append({"key": key, "label": label, "status": "issue", "note": "Number on file, scan missing" if number else "Scan on file, number missing"})
        else:
            items.append({"key": key, "label": label, "status": "missing", "note": "Not provided"})

    def compliance(key: str, label: str, types: tuple[str, ...], category: str | None = None) -> None:
        docs = [c for c in comp if c["type"] in types]
        doc = next((c for c in docs if c["status"] == "Valid"), None) or (docs[0] if docs else None)
        if doc and doc["status"] != "Missing":
            expired = doc.get("expires") and doc["expires"] < dt.date.today().isoformat()
            expiring = doc.get("expires") and not expired and doc["expires"] <= (dt.date.today() + dt.timedelta(days=60)).isoformat()
            status = "issue" if expired or expiring else "ok"
            note = ("Expired " if expired else "Expires " if doc.get("expires") else "On file") + (doc["expires"] if doc.get("expires") else "")
            items.append({"key": key, "label": label, "status": status, "note": note.strip(), **({"type": types[0]} if status == "issue" else {})})
        elif category and has_file(category):
            items.append({"key": key, "label": label, "status": "ok", "note": "File on record"})
        else:
            items.append({"key": key, "label": label, "status": "missing", "note": "Requested — awaiting upload" if doc else "Not uploaded", "type": types[0]})

    compliance("contract", "Signed employment contract", ("Contract",), "Contract")
    statutory("nid", "National ID / Huduma card", e.get("national_id"), "National ID")
    statutory("kra", "KRA PIN certificate", e.get("kra_pin"), "KRA PIN")
    statutory("nssf", "NSSF registration", p.get("nssf_number"), "NSSF")
    statutory("shif", "SHIF registration", p.get("shif_number"), "SHIF")
    compliance("conduct", "Certificate of Good Conduct", ("Certificate of Good Conduct",))
    compliance("academic", "Academic certificates", ("Academic Certificate",), "Certificate")
    if p.get("nda_signature") or has_file("NDA"):
        items.append({"key": "nda", "label": "Signed NDA & IP assignment", "status": "ok", "note": f"Signed {str(p.get('nda_signed_at') or '')[:10]}".strip() if p.get("nda_signature") else "File on record"})
    else:
        items.append({"key": "nda", "label": "Signed NDA & IP assignment", "status": "missing", "note": "Not signed"})
    mandatory = [x for x in b["policies"] if x["mandatory"]]
    signed = [x for x in mandatory if x["ack"] and x["ack"]["version"] == x["version"]]
    items.append(
        {
            "key": "policies",
            "label": "Mandatory policy acknowledgements",
            "status": "ok" if len(signed) == len(mandatory) else "issue" if signed else "missing",
            "note": f"{len(signed)} of {len(mandatory)} current versions signed",
        }
    )
    return items


def _summary(b: dict[str, Any]) -> dict[str, Any]:
    items = _checklist(b)
    ok = sum(1 for i in items if i["status"] == "ok")
    e = b["emp"]
    return {
        "employeeId": e["id"],
        "name": e["name"],
        "items": items,
        "ready": ok,
        "total": len(items),
        "completeness": round(100 * ok / len(items)) if items else 0,
        "files": len(b["files"]),
        "complianceDocuments": len(b["compliance"]),
        "lastPackAt": iso(b["last_pack"]),
    }


@router.get("/employees/{id}/audit-status")
def audit_status(id: str, auth: AuthContext = Depends(require_role(*ADMIN))):
    return _summary(_load(auth, id))


def _csv(rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    csv.writer(buf).writerows(rows)
    return buf.getvalue()


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip() or "file"


@router.get("/employees/{id}/audit-pack")
def audit_pack(id: str, request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    b = _load(auth, id, with_bytes=True)
    e = b["emp"]
    s = _summary(b)
    now = dt.datetime.now(dt.timezone.utc)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        manifest = [["path", "category", "size_bytes", "sha256", "uploaded_at"]]
        used: set[str] = set()
        for f in b["files"]:
            path = f"files/{_safe(f['category'])} - {_safe(f['filename'])}"
            n = 2
            while path in used:
                stem, dot, ext = path.rpartition(".")
                path = f"{stem} ({n}).{ext}" if dot else f"{path} ({n})"
                n += 1
            used.add(path)
            blob = b["blobs"].get(f["id"])
            if blob is not None:
                z.writestr(path, blob)
                manifest.append([path, f["category"], f["size_bytes"], f["sha256"], f["created_at"]])
        z.writestr("files/manifest.csv", _csv(manifest))
        z.writestr(
            "compliance_documents.csv",
            _csv([["type", "number", "issued", "expires", "status", "file_attached"]] + [[c["type"], c["number"], c["issued"], c.get("expires") or "", c["status"], "yes" if c.get("file_id") else "no"] for c in b["compliance"]]),
        )
        z.writestr(
            "policy_acknowledgements.csv",
            _csv(
                [["policy", "current_version", "mandatory", "signed_version", "signature", "ip_address", "acknowledged_at"]]
                + [
                    [x["title"], x["version"], "yes" if x["mandatory"] else "no", (x["ack"] or {}).get("version", ""), (x["ack"] or {}).get("signature", ""), (x["ack"] or {}).get("ip_address", "") or "", (x["ack"] or {}).get("acknowledged_at", "")]
                    for x in b["policies"]
                ]
            ),
        )
        z.writestr("checklist.csv", _csv([["item", "status", "note"]] + [[i["label"], i["status"], i["note"]] for i in s["items"]]))
        lines = [
            f"Audit pack — {e['name']} ({e['employee_no']})",
            f"{e['title']} · {e.get('department') or ''} · status {e['status']} · started {e.get('start_date') or ''}",
            f"Generated {now.strftime('%Y-%m-%d %H:%M UTC')} by Annex HR",
            "",
            f"File completeness: {s['ready']} of {s['total']} items ready ({s['completeness']}%)",
            "",
            *[f"[{'x' if i['status'] == 'ok' else '!' if i['status'] == 'issue' else ' '}] {i['label']} — {i['note']}" for i in s["items"]],
            "",
            f"{len(b['files'])} employee file(s) in files/ (see files/manifest.csv for SHA-256 checksums).",
            "compliance_documents.csv — documents register; policy_acknowledgements.csv — signatures with timestamp and IP.",
        ]
        z.writestr("README.txt", "\n".join(lines) + "\n")
    audit(request, auth, "employee.audit_pack_downloaded", "employee", id, {"files": len(b["files"]), "completeness": s["completeness"]})
    name = f"audit-pack-{_safe(e['employee_no'])}-{now.strftime('%Y%m%d')}.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "private, no-store"},
    )
