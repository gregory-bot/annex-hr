"""Loads the deterministic demo workspaces (Annex Technologies, Demo Manufacturing Ltd, CHQI).

    python -m db.seed           seed missing demo workspaces (existing ones are skipped)
    python -m db.seed --force   delete (cascading) and recreate the demo workspaces

Data comes from db/demo-data.json, generated from shared/src/seed.ts
(`npm run export:demo-data` at the repository root).
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

import psycopg

from api.config import settings
from api.db import insert_many, pool, query, tx
from api.security import hash_password

from db.seed_automations import seed_automations
from db.seed_cases_offboarding import seed_cases_offboarding
from db.seed_engagement_compliance import seed_engagement_compliance
from db.seed_payroll_performance import seed_payroll_performance
from db.seed_time_leave import seed_time_leave

DATA_FILE = Path(__file__).resolve().parent / "demo-data.json"


def load_demo_data() -> dict[str, Any]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def seed(force: bool = False) -> None:
    data = load_demo_data()
    # One hash shared by every demo user (demo only).
    password_hash = hash_password(settings.SEED_DEFAULT_PASSWORD, rounds=10)
    for d in data["workspaces"].values():
        ws = d["workspace"]
        with tx() as db:
            existing = query("SELECT id FROM workspaces WHERE slug = $1", [ws["slug"]], db)
            if existing and not force:
                print(f"• {ws['name']} already seeded — skipping (use --force to recreate)")
                continue
            if existing:
                query("DELETE FROM workspaces WHERE id = $1", [ws["id"]], db)
            seed_workspace(db, d, password_hash)
            print(f"✓ Seeded {ws['name']} ({ws['domain']}) — {len(d['employees'])} employees")


def seed_workspace(db: psycopg.Connection, d: dict[str, Any], password_hash: str) -> None:
    ws = d["workspace"]
    W = ws["id"]

    insert_many(db, "workspaces", [{
        "id": W, "slug": ws["slug"], "name": ws["name"], "industry": ws["industry"], "country": ws["country"], "size": ws["size"],
        "domain": ws["domain"], "logo_text": ws["logoText"], "plan": ws["plan"], "founded": ws["founded"],
        "email_verified_at": dt.datetime.now(dt.timezone.utc),
    }])
    insert_many(db, "offices", [{"workspace_id": W, **o} for o in ws["offices"]])

    # Departments first without heads (heads reference employees, inserted next).
    insert_many(db, "departments", [{"id": x["id"], "workspace_id": W, "name": x["name"], "color": x["color"], "budget_kes": x["budgetKES"]} for x in d["departments"]])

    insert_many(db, "employees", [{
        "id": e["id"], "workspace_id": W, "employee_no": e["employeeNo"], "name": e["name"], "email": e["email"], "phone": e["phone"],
        "photo": e.get("photo"), "title": e["title"], "department_id": e["departmentId"], "manager_id": e.get("managerId"),
        "role": e["role"], "employment_type": e["employmentType"], "status": e["status"], "gender": e["gender"], "location": e["location"],
        "start_date": e["startDate"], "birthday": e["birthday"], "salary_kes": e["salaryKES"], "probation_end": e.get("probationEnd"),
        "performance": e["performance"], "potential": e["potential"], "onboarding_progress": e["onboardingProgress"],
        "kra_pin": e["kraPin"], "national_id": e["nationalId"],
    } for e in d["employees"]])
    for dept in d["departments"]:
        if dept.get("headId"):
            query("UPDATE departments SET head_id = $1 WHERE id = $2", [dept["headId"], dept["id"]], db)

    insert_many(db, "users", [{
        "id": f"usr-{e['id']}", "workspace_id": W, "employee_id": e["id"], "email": e["email"].lower(), "password_hash": password_hash, "role": e["role"],
    } for e in d["employees"]])

    insert_many(db, "holidays", [{"workspace_id": W, **h} for h in d["holidays"]])
    insert_many(db, "onboarding_tasks", [{"workspace_id": W, **t, "position": i} for i, t in enumerate(d["onboardingTasks"])])

    insert_many(db, "leave_requests", [{
        "id": l["id"], "workspace_id": W, "employee_id": l["employeeId"], "type": l["type"], "start_date": l["start"], "end_date": l["end"],
        "days": l["days"], "reason": l["reason"], "status": l["status"], "stage": l["stage"], "submitted_at": l["submitted"],
        "handover_to": l.get("handoverTo"), "handover_notes": l.get("handoverNotes", False),
    } for l in d["leaveRequests"]])

    insert_many(db, "payroll_runs", [{
        "id": p["id"], "workspace_id": W, "period": p["period"], "status": p["status"], "employees": p["employees"], "gross": p["gross"],
        "net": p["net"], "paye": p["paye"], "shif": p["shif"], "nssf": p["nssf"], "housing_levy": p["housingLevy"], "bonuses": p["bonuses"],
        "prepared_by": p["preparedBy"], "position": i,
    } for i, p in enumerate(d["payrollRuns"])])
    insert_many(db, "payroll_approvals", [
        {"payroll_run_id": p["id"], "step": step, "role": a["role"], "name": a["name"], "status": a["status"], "decided_at": a.get("at")}
        for p in d["payrollRuns"] for step, a in enumerate(p["approvals"])
    ])

    insert_many(db, "policies", [{
        "id": p["id"], "workspace_id": W, "title": p["title"], "category": p["category"], "version": p["version"], "updated_on": p["updated"],
        "owner": p["owner"], "mandatory": p["mandatory"], "acknowledged": p["acknowledged"], "summary": p["summary"],
    } for p in d["policies"]])
    insert_many(db, "policy_versions", [{"policy_id": p["id"], **h, "position": i} for p in d["policies"] for i, h in enumerate(p["history"])])

    insert_many(db, "compliance_documents", [{
        "id": c["id"], "workspace_id": W, "employee_id": c["employeeId"], "type": c["type"], "number": c["number"], "issued": c["issued"],
        "expires": c.get("expires"), "status": c["status"],
    } for c in d["complianceDocs"]])

    insert_many(db, "hr_cases", [{
        "id": c["id"], "workspace_id": W, "ref": c["ref"], "type": c["type"], "subject_id": c["subjectId"], "reported_by": c["reportedBy"],
        "opened": c["opened"], "status": c["status"], "severity": c["severity"], "assigned_to": c["assignedTo"], "confidential": c["confidential"],
        "summary": c["summary"],
    } for c in d["cases"]])
    insert_many(db, "case_events", [
        {"case_id": c["id"], "date": t["date"], "title": t["title"], "by_name": t["by"], "note": t["note"], "position": i}
        for c in d["cases"] for i, t in enumerate(c["timeline"])
    ])
    insert_many(db, "case_evidence", [{"case_id": c["id"], **e} for c in d["cases"] for e in c["evidence"]])

    insert_many(db, "offboardings", [{
        "id": o["id"], "workspace_id": W, "employee_id": o["employeeId"], "reason": o["reason"], "submitted": o["submitted"],
        "last_day": o["lastDay"], "notice_days": o["noticeDays"], "progress": min(100, o["progress"]), "handover": o["handover"],
        "exit_interview": o["exitInterview"], "final_dues_kes": o["finalDuesKES"],
    } for o in d["offboardings"]])
    insert_many(db, "offboarding_assets", [{"offboarding_id": o["id"], **a, "position": i} for o in d["offboardings"] for i, a in enumerate(o["assets"])])

    insert_many(db, "timesheets", [{
        "id": t["id"], "workspace_id": W, "employee_id": t["employeeId"], "week_start": t["week"], "status": t["status"], "rate_kes": t["rate"],
    } for t in d["timesheets"]])
    insert_many(db, "timesheet_entries", [
        {"timesheet_id": t["id"], "project": e["project"], "billable": e["billable"], "hours": e["hours"], "position": i}
        for t in d["timesheets"] for i, e in enumerate(t["entries"])
    ])

    insert_many(db, "surveys", [{
        "id": f"{W}-{s['id']}", "workspace_id": W, "title": s["title"], "status": s["status"], "responses": s["responses"],
        "audience": s["audience"], "engagement": s["engagement"], "enps": s["enps"], "closes": s["closes"], "anonymous": s["anonymous"], "position": i,
    } for i, s in enumerate(d["surveys"])])
    insert_many(db, "kpis", [{
        "id": f"{W}-{k['id']}", "workspace_id": W, "perspective": k["perspective"], "name": k["name"], "target": k["target"], "actual": k["actual"],
        "unit": k["unit"], "weight": k["weight"], "owner": k["owner"], "position": i,
    } for i, k in enumerate(d["kpis"])])

    insert_many(db, "documents", [{
        "id": f"{W}-{doc['id']}", "workspace_id": W, "name": doc["name"], "folder": doc["folder"], "size": doc["size"], "type": doc["type"],
        "updated_on": doc["updated"], "owner": doc["owner"], "version": doc["version"],
    } for doc in d["documents"]])
    insert_many(db, "document_versions", [
        {"document_id": f"{W}-{doc['id']}", "version": v["version"], "date": v["date"], "by_name": v["by"], "position": i}
        for doc in d["documents"] for i, v in enumerate(doc["versions"])
    ])

    # Notifications are ordered newest first in the seed; stagger created_at to preserve that order.
    now = dt.datetime.now(dt.timezone.utc)
    insert_many(db, "notifications", [{
        "id": f"{W}-{n['id']}", "workspace_id": W, "type": n["type"], "title": n["title"], "body": n["body"], "href": n["href"],
        "time_label": n["time"], "read": n["read"], "created_at": now - dt.timedelta(minutes=i),
    } for i, n in enumerate(d["notifications"])])

    insert_many(db, "ticket_teams", [{"id": t["id"], "workspace_id": W, "key": t["key"], "name": t["name"], "color": t["color"], "position": i} for i, t in enumerate(d["ticketTeams"])])
    insert_many(db, "tickets", [{
        "id": t["id"], "workspace_id": W, "team_id": t["teamId"], "number": int(t["identifier"].split("-")[-1]), "identifier": t["identifier"],
        "title": t["title"], "description": t["description"], "status": t["status"], "priority": t["priority"], "reporter_id": t["reporterId"],
        "assignee_id": t.get("assigneeId"), "labels": t["labels"], "due_date": t.get("dueDate"),
        "completed_at": t["updatedAt"] if t["status"] == "Done" else None, "created_at": t["createdAt"], "updated_at": t["updatedAt"],
    } for t in d["tickets"]])
    insert_many(db, "ticket_comments", [
        {"id": c["id"], "workspace_id": W, "ticket_id": t["id"], "author_id": c["authorId"], "body": c["body"], "created_at": c["createdAt"]}
        for t in d["tickets"] for c in t["comments"]
    ])

    insert_many(db, "metric_series", [{"workspace_id": W, "metric": metric, "data": json.dumps(series)} for metric, series in d["trends"].items()])

    # Module demo data (attendance history, reviews, surveys, cases, reminders, …).
    seed_time_leave(db, d)
    seed_engagement_compliance(db, d)
    seed_cases_offboarding(db, d)
    seed_payroll_performance(db, d)
    seed_automations(db, d)


def main() -> None:
    pool.open()
    try:
        seed(force="--force" in sys.argv)
        print("Demo users sign in with the password from SEED_DEFAULT_PASSWORD.")
    finally:
        pool.close()


if __name__ == "__main__":
    main()
