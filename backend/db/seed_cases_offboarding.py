"""Demo data for case management and exit workflows (notes, sign-offs, evidence, checklist,
assets, settlements and a completed exit interview). Safe to re-run: existing rows are kept.

    python -m db.seed_cases_offboarding     seed the demo workspaces (never the customer workspace)
"""

from __future__ import annotations

import hashlib
from typing import Any

import psycopg

from api.db import query, query_one
from api.security import AuthContext

DEMO_WORKSPACES = ("ws-annex", "ws-demo", "ws-chqi")


def _pdf(title: str, lines: list[str]) -> bytes:
    """A tiny single-page PDF placeholder (valid xref, Helvetica text)."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")  # noqa: E731
    text = "BT /F1 16 Tf 72 740 Td (" + esc(title) + ") Tj /F1 11 Tf"
    for ln in lines:
        text += " 0 -22 Td (" + esc(ln) + ") Tj"
    text += " ET"
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(text) + text.encode("latin-1", "replace") + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def _file_row(data: bytes) -> tuple[int, str]:
    return len(data), hashlib.sha256(data).hexdigest()


def seed_cases_offboarding(db: psycopg.Connection, d: dict[str, Any]) -> None:
    from api.routers.lifecycle import OFF_SELECT, _off_payload, _save_settlement, _settlement_calc, _sync_approvals

    W = d["workspace"]["id"]
    if W not in DEMO_WORKSPACES:
        return
    emps = {e["id"]: e for e in d["employees"]}
    by_role = {}
    for e in d["employees"]:
        by_role.setdefault(e["role"], e)
    hr = by_role.get("company_admin") or next(iter(emps.values()))
    ceo = by_role.get("ceo") or hr
    finance = by_role.get("finance") or hr
    hr_user = query_one("SELECT id FROM users WHERE employee_id = $1", [hr["id"]], db)
    ceo_user = query_one("SELECT id FROM users WHERE employee_id = $1", [ceo["id"]], db)

    # ── Cases ───────────────────────────────────────────────────────
    for i, c in enumerate(d["cases"]):
        row = query_one("SELECT * FROM hr_cases WHERE id = $1 AND workspace_id = $2", [c["id"], W], db)
        if not row:
            continue
        _sync_approvals(db, row)
        if row["status"] in ("Awaiting Approval", "Closed"):
            query("UPDATE case_approvals SET decided_by = $2, decided_at = (SELECT opened FROM hr_cases WHERE id = $1) + 10 WHERE case_id = $1 AND step = 'investigator' AND status = 'Approved' AND decided_by IS NULL", [c["id"], row["assigned_to"] or hr["id"]], db)
        if row["status"] == "Closed":
            query("UPDATE case_approvals SET decided_by = $2, decided_at = (SELECT opened FROM hr_cases WHERE id = $1) + 12 WHERE case_id = $1 AND step = 'hr' AND decided_by IS NULL", [c["id"], hr["id"]], db)
            query("UPDATE case_approvals SET decided_by = $2, decided_at = (SELECT opened FROM hr_cases WHERE id = $1) + 14 WHERE case_id = $1 AND step = 'ceo' AND decided_by IS NULL", [c["id"], ceo["id"]], db)

        if not query_one("SELECT 1 FROM case_notes WHERE case_id = $1", [c["id"]], db):
            m = query_one("SELECT m.id, m.name FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.id = $1", [c["subjectId"]], db)
            manager = m or hr
            query(
                "INSERT INTO case_notes (case_id, author_id, body, visibility, created_at) VALUES ($1,$2,$3,'case_team',$4::date + 1), ($1,$5,$6,'hr_only',$4::date + 2)",
                [
                    c["id"],
                    row["assigned_to"] or hr["id"],
                    f"Spoke with {manager['name'].split(' ')[0]} (line manager): expectations were discussed informally before escalation and the employee asked for more support from the team lead.",
                    c["opened"],
                    hr["id"],
                    "Reviewed prior record — no previous warnings on file. Recommend a fair-hearing process under Section 41 of the Employment Act before any sanction.",
                ],
                db,
            )

        if not query_one("SELECT 1 FROM case_files WHERE case_id = $1", [c["id"]], db):
            data = _pdf(f"{c['ref']} - investigation plan", ["Confidential - case team only.", f"Case type: {c['type']}. Severity: {c['severity']}.", "Scope, witnesses to interview and evidence to secure before the hearing."])
            size, sha = _file_row(data)
            query(
                "INSERT INTO case_files (workspace_id, case_id, filename, content_type, size_bytes, sha256, data, uploaded_by, created_at) VALUES ($1,$2,$3,'application/pdf',$4,$5,$6,$7,$8::date)",
                [W, c["id"], f"investigation-plan-{c['ref'].lower()}.pdf", size, sha, data, row["assigned_to"] or hr["id"], c["opened"]],
                db,
            )

        if hr_user and not query_one("SELECT 1 FROM case_access_log WHERE case_id = $1", [c["id"]], db):
            query("INSERT INTO case_access_log (case_id, user_id, action, created_at) VALUES ($1,$2,'viewed',$3::date + interval '9 hours')", [c["id"], hr_user["id"], c["opened"]], db)
            if ceo_user and i % 2 == 0:
                query(
                    "INSERT INTO case_access_log (case_id, user_id, action, reason, created_at) VALUES ($1,$2,'revealed_identity','Approval review',$3::date + interval '3 days 11 hours')",
                    [c["id"], ceo_user["id"], c["opened"]],
                    db,
                )

    # ── Offboarding ────────────────────────────────────────────────
    admin = AuthContext(userId=(hr_user or {}).get("id", ""), employeeId=hr["id"], workspaceId=W, role="company_admin")
    fin = AuthContext(userId="", employeeId=finance["id"], workspaceId=W, role="finance")
    prefix = (d["workspace"].get("logoText") or d["workspace"]["slug"][:3]).upper().replace(" ", "")[:5]
    for i, off in enumerate(d["offboardings"]):
        o = query_one(f"{OFF_SELECT} WHERE o.id = $1 AND o.workspace_id = $2", [off["id"], W], db)
        if not o:
            continue
        emp = emps.get(off["employeeId"], {})
        manager_id = o["emp_manager_id"] or hr["id"]
        if not o["manager_ack_at"]:
            query(
                "UPDATE offboardings SET manager_ack_by = $2, manager_ack_at = submitted + 1, hr_approved_by = $3, hr_approved_at = submitted + 2 WHERE id = $1",
                [o["id"], manager_id, hr["id"]],
                db,
            )
        first_run = not query_one("SELECT 1 FROM offboarding_checklist WHERE offboarding_id = $1", [o["id"]], db)
        o = query_one(f"{OFF_SELECT} WHERE o.id = $1", [off["id"]], db)
        _off_payload(db, admin, o, prefix, False)  # creates the checklist and asset serials
        if first_run:
            # Tick checklist items roughly in line with the seeded progress.
            target = round(off["progress"] / 100 * 7)
            query(
                """UPDATE offboarding_checklist SET done = true, done_by = $3, done_at = now() - interval '2 days'
                    WHERE offboarding_id = $1 AND item_key <> 'mgr-handover' AND position < $2""",
                [o["id"], target, hr["id"]],
                db,
            )
            if off["handover"]:
                query("UPDATE offboarding_checklist SET done = true, done_by = $2, done_at = now() - interval '1 day' WHERE offboarding_id = $1 AND item_key = 'mgr-handover'", [o["id"], manager_id], db)
                successor = next((e for e in d["employees"] if e["departmentId"] == emp.get("departmentId") and e["id"] != emp.get("id") and e["status"] not in ("Exited", "Notice Period")), None)
                query(
                    "UPDATE offboardings SET successor_id = $2, handover_notes = $3 WHERE id = $1",
                    [o["id"], successor["id"] if successor else None, "Open tickets reassigned. Weekly client stand-up handed to successor. Credentials rotated in the team vault; runbooks linked in the handover plan."],
                    db,
                )
                data = _pdf("Handover plan", [f"{emp.get('name', 'Employee')} - {emp.get('title', '')}", "1. Open work and owners", "2. Key contacts and recurring deadlines", "3. Systems and where things live"])
                size, sha = _file_row(data)
                query(
                    "INSERT INTO offboarding_files (workspace_id, offboarding_id, kind, filename, content_type, size_bytes, sha256, data, uploaded_by) VALUES ($1,$2,'knowledge_transfer','handover-plan.pdf','application/pdf',$3,$4,$5,$6)",
                    [W, o["id"], size, sha, data, manager_id],
                    db,
                )
            if off["reason"] == "Resignation":
                data = _pdf("Letter of resignation", [f"From: {emp.get('name', 'Employee')}", f"Date: {off['submitted']}", f"Please accept this letter as notice of my resignation. My last working day will be {off['lastDay']}."])
                size, sha = _file_row(data)
                query(
                    "INSERT INTO offboarding_files (workspace_id, offboarding_id, kind, filename, content_type, size_bytes, sha256, data, uploaded_by, created_at) VALUES ($1,$2,'resignation_letter','resignation-letter.pdf','application/pdf',$3,$4,$5,$6,$7::date)",
                    [W, o["id"], size, sha, data, hr["id"], off["submitted"]],
                    db,
                )
            # Returned property: laptops for the most advanced exit, accounts where progress is high.
            if off["progress"] >= 50:
                query("UPDATE offboarding_assets SET returned = true, returned_at = now() - interval '1 day' WHERE offboarding_id = $1 AND name IN ('Access card', 'Email account', 'Slack access')", [o["id"]], db)
                query("UPDATE offboarding_assets SET condition = 'Fair' WHERE offboarding_id = $1 AND name = 'Laptop'", [o["id"]], db)

        if off["exitInterview"] and not query_one("SELECT 1 FROM exit_interviews WHERE offboarding_id = $1", [o["id"]], db):
            query(
                """INSERT INTO exit_interviews (offboarding_id, employee_id, reason, nps, would_recommend, improvements, manager_rating, would_return)
                   VALUES ($1,$2,'Career growth elsewhere',8,true,$3,4,true)""",
                [o["id"], o["employee_id"], "Clearer promotion criteria and a structured learning budget. Sprint planning often slips into evenings — protect focus time."],
                db,
            )

        if (off["handover"] or i == 0) and not query_one("SELECT 1 FROM offboarding_settlements WHERE offboarding_id = $1", [o["id"]], db):
            assets = query("SELECT * FROM offboarding_assets WHERE offboarding_id = $1 ORDER BY position", [o["id"]], db)
            calc = _settlement_calc(o, None, assets, 6 if off["handover"] else 0)
            _save_settlement(db, fin, o, calc)
            if off["handover"]:
                query("UPDATE offboarding_settlements SET finance_by = $2, finance_at = now() - interval '1 day' WHERE offboarding_id = $1", [o["id"], finance["id"]], db)

        o = query_one(f"{OFF_SELECT} WHERE o.id = $1", [off["id"]], db)
        _off_payload(db, admin, o, prefix, False)  # recompute progress and stage


if __name__ == "__main__":
    from api.db import pool, tx

    from db.seed import load_demo_data

    pool.open()
    try:
        for ws in load_demo_data()["workspaces"].values():
            if ws["workspace"]["id"] not in DEMO_WORKSPACES:
                continue
            if not query_one("SELECT 1 FROM workspaces WHERE id = $1", [ws["workspace"]["id"]]):
                continue
            with tx() as db:
                seed_cases_offboarding(db, ws)
            print(f"✓ Cases & offboarding demo data for {ws['workspace']['name']}")
    finally:
        pool.close()
