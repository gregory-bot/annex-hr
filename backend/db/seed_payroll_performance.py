"""Demo data for payroll & performance: bonus rules, frozen payslip lines for the open payroll run,
a Q2 (released) and Q3 2026 (in progress) review cycle, OKRs and succession plans.

    python -m db.seed_payroll_performance      seed the demo workspaces now (idempotent; never touches real workspaces)
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

import psycopg

from api.db import insert_many, pool, query, query_one, tx
from api.payroll_calc import payslip

DEMO_WORKSPACES = ("ws-annex", "ws-demo", "ws-chqi")
COMPETENCIES = ("delivery", "craft", "collab", "ownership", "comms")
BANDS = [{"min": 3.5, "max": 4.0, "pct": 25}, {"min": 4.0, "max": 4.5, "pct": 50}, {"min": 4.5, "max": 5.01, "pct": 100}]

OKRS: dict[str, list[dict[str, Any]]] = {
    "ws-demo": [
        {"title": "Hit record output without compromising safety", "dept": r"Production", "confidence": "High", "krs": [
            ("Raise line OEE to 78%", 84, "74%", "78%"), ("Zero lost-time incidents this quarter", 100, "0", "0"), ("Cut changeover time to 25 minutes", 62, "31 min", "25 min")]},
        {"title": "Ship right-first-time to every customer", "dept": r"Quality", "confidence": "Medium", "krs": [
            ("Defect rate below 0.8%", 70, "1.1%", "< 0.8%"), ("Pass ISO 9001 surveillance audit", 90, "Pre-audit done", "Certified"), ("On-time delivery at 96%", 88, "94%", "96%")]},
        {"title": "Build a resilient supply chain", "dept": r"Supply", "confidence": "Medium", "krs": [
            ("Dual-source 80% of critical inputs", 55, "44%", "80%"), ("Inventory turns to 9×", 72, "7.8×", "9×"), ("Supplier lead time under 21 days", 64, "26 days", "21 days")]},
        {"title": "Make Demo Manufacturing a great place to build a career", "dept": r"People", "confidence": "High", "krs": [
            ("Engagement score ≥ 80", 86, "77", "80"), ("24 training hours per employee", 58, "14 h", "24 h"), ("Promote 20% of supervisors from within", 75, "15%", "20%")]},
    ],
    "ws-annex": [
        {"title": "Deliver flagship client programmes on time", "dept": r"Delivery", "confidence": "Medium", "krs": [
            ("Retail Bank Data Platform go-live by 31 Oct", 74, "Sprint 9 of 12", "Go-live"), ("Client CSAT ≥ 4.5 across accounts", 92, "4.4", "4.5"), ("Keep billable utilisation at 78%", 81, "74%", "78%")]},
        {"title": "Grow recurring revenue from managed services", "dept": r"Sales", "confidence": "High", "krs": [
            ("Sign 4 new retainer clients", 75, "3", "4"), ("MRR to KES 18M", 68, "KES 12.2M", "KES 18M"), ("Pipeline coverage 3× target", 90, "2.7×", "3×")]},
        {"title": "Raise the bar on engineering excellence", "dept": r"Software Engineering", "confidence": "High", "krs": [
            ("80% automated test coverage on core repos", 71, "57%", "80%"), ("Deploy to production 20× a month", 100, "24", "20"), ("Every engineer completes AWS certification", 40, "6 of 15", "15")]},
        {"title": "Make Annex the best place in Nairobi to grow a data career", "dept": r"People", "confidence": "Medium", "krs": [
            ("Engagement score ≥ 78", 82, "75", "78"), ("Every employee has a development plan", 64, "29 of 45", "45"), ("Regretted attrition under 8%", 90, "8.6%", "< 8%")]},
    ],
    "ws-chqi": [
        {"title": "Improve patient outcomes across partner clinics", "dept": r"Clinical", "confidence": "Medium", "krs": [
            ("Reduce readmission rate to 6%", 64, "7.4%", "6%"), ("Roll out digital triage in 12 clinics", 75, "9", "12"), ("Patient satisfaction ≥ 90%", 88, "87%", "90%")]},
        {"title": "Advance high-impact research output", "dept": r"Research", "confidence": "High", "krs": [
            ("Publish 3 peer-reviewed papers", 67, "2", "3"), ("Secure 2 new grant awards", 50, "1", "2")]},
        {"title": "Run a lean, compliant operation", "dept": r"Admin", "confidence": "High", "krs": [
            ("Pass KMPDC facility audit with no findings", 100, "Passed", "Pass"), ("Cut procurement cycle to 5 days", 60, "8 days", "5 days"), ("100% staff licences valid", 94, "94%", "100%")]},
    ],
}

PERSONAL_OKR = {"title": "Grow my craft and impact this quarter", "confidence": "Medium", "krs": [
    ("Complete one professional certification", 60, "Module 3 of 5", "Certified"),
    ("Lead one knowledge-sharing session for the team", 100, "Done", "1 session"),
    ("Close every sprint commitment on time", 75, "9 of 12", "12 of 12"),
]}

STRENGTHS = [
    "Consistently delivered the quarter's priorities and supported teammates through the Q3 launch.",
    "Owned a difficult client escalation end to end and turned it into a renewal.",
    "Raised the quality bar for the team — reviews are thorough and kind.",
    "Calm under pressure; the person others go to when production breaks.",
]
IMPROVE = [
    "Delegate earlier and share context more widely in planning.",
    "Push back sooner when scope creeps rather than absorbing it late.",
    "Present work to leadership more often — the impact is under-seen.",
    "Write things down: decisions made in calls get lost.",
]
PEER = [
    ("Always the first to jump on a production issue — and writes the best post-mortems on the team.", "Could delegate more instead of doing it all."),
    ("Brings calm to chaotic weeks.", "I would love to see them present more in leadership forums."),
    ("Very generous with time when onboarding new joiners.", "Sometimes pushes back late rather than early in planning."),
]


def _h(*parts: str) -> int:
    return int(hashlib.md5("|".join(parts).encode()).hexdigest()[:8], 16)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _ratings(e: dict[str, Any], salt: str) -> dict[str, int]:
    return {c: int(_clamp(round(e["performance"] + ((_h(e["id"], salt, c) % 3) - 1) * 0.5), 1, 5)) for c in COMPETENCIES}


def seed_payroll_performance(db: psycopg.Connection, d: dict[str, Any]) -> None:
    W = d["workspace"]["id"]
    emps = query(
        "SELECT * FROM employees WHERE workspace_id = $1 AND status <> 'Exited' ORDER BY employee_no",
        [W],
        db,
    )
    staff = [e for e in emps if e["employment_type"] != "Consultant"]
    depts = query("SELECT * FROM departments WHERE workspace_id = $1 ORDER BY name", [W], db)
    by_id = {e["id"]: e for e in emps}

    query("UPDATE kpis SET lower_is_better = true WHERE workspace_id = $1 AND name IN ('Operating cost ratio', 'First response time')", [W], db)

    # ── Bonus rules ──
    if not query_one("SELECT 1 FROM bonus_rules WHERE workspace_id = $1", [W], db):
        def pct(r: float) -> float:
            if r < 3.5:
                return 0
            return next((b["pct"] for b in BANDS if b["min"] <= r < b["max"]), BANDS[0]["pct"])
        total = sum(round(e["salary_kes"] * pct(e["performance"]) / 100 / 100) * 100 for e in staff)
        insert_many(db, "bonus_rules", [{"workspace_id": W, "threshold": 3.5, "bands": json.dumps(BANDS), "budget_cap": math.ceil(total * 1.1 / 100_000) * 100_000}])

    # ── Frozen payslip lines for the open run (totals recomputed so the run matches its lines) ──
    run = query_one("SELECT * FROM payroll_runs WHERE workspace_id = $1 AND status = 'Pending Approval' ORDER BY position LIMIT 1", [W], db)
    if run and not query_one("SELECT 1 FROM payroll_lines WHERE payroll_run_id = $1", [run["id"]], db):
        rows, t = [], {"gross": 0, "net": 0, "paye": 0, "shif": 0, "nssf": 0, "housingLevy": 0}
        for i, e in enumerate(sorted(staff, key=lambda x: x["name"])):
            p = payslip(e["salary_kes"])
            for k in t:
                t[k] += p[k]
            rows.append({
                "workspace_id": W, "payroll_run_id": run["id"], "employee_id": e["id"], "employee_name": e["name"], "employee_no": e["employee_no"],
                "title": e["title"], "department_id": e["department_id"], "kra_pin": e["kra_pin"], "basic": p["basic"], "house": p["house"],
                "transport": p["transport"], "airtime": p["airtime"], "bonus": 0, "gross": p["gross"], "nssf_tier1": p["nssfTier1"],
                "nssf_tier2": p["nssfTier2"], "nssf": p["nssf"], "shif": p["shif"], "housing_levy": p["housingLevy"], "taxable": p["taxable"],
                "paye": p["paye"], "net": p["net"], "position": i,
            })
        insert_many(db, "payroll_lines", rows)
        query(
            "UPDATE payroll_runs SET employees = $2, gross = $3, net = $4, paye = $5, shif = $6, nssf = $7, housing_levy = $8, bonuses = 0 WHERE id = $1",
            [run["id"], len(rows), t["gross"], t["net"], t["paye"], t["shif"], t["nssf"], t["housingLevy"]],
            db,
        )

    reviewees = [e for e in staff if e["role"] != "ceo"]

    # ── Review cycles: Q2 released (history), Q3 in manager-review stage with a mix of statuses ──
    if not query_one("SELECT 1 FROM review_cycles WHERE workspace_id = $1", [W], db):
        q2 = query_one(
            "INSERT INTO review_cycles (workspace_id, name, quarter, period_start, period_end, closes_on, stage, released_at) VALUES ($1,'Q2 2026 review','2026-Q2','2026-04-01','2026-06-30','2026-07-10',4,'2026-07-15') RETURNING id",
            [W], db,
        )["id"]  # type: ignore[index]
        insert_many(db, "review_participants", [
            {"cycle_id": q2, "employee_id": e["id"], "final_rating": round(_clamp(e["performance"] - 0.1 * (_h(e["id"], "q2") % 3), 1, 5), 1)} for e in reviewees
        ])
        q3 = query_one(
            "INSERT INTO review_cycles (workspace_id, name, quarter, period_start, period_end, closes_on, stage) VALUES ($1,'Q3 2026 review','2026-Q3','2026-07-01','2026-09-30','2026-10-10',1) RETURNING id",
            [W], db,
        )["id"]  # type: ignore[index]
        parts, reviews = [], []
        for e in reviewees:
            h = _h(e["id"], "q3")
            demo_login = e["email"].startswith("nafula.njoroge@")
            self_state = "none" if demo_login else ("Submitted" if h % 10 < 7 else "In Progress" if h % 10 < 9 else "none")
            final = None
            if self_state != "none":
                r = _ratings(e, "self")
                reviews.append({"cycle_id": q3, "employee_id": e["id"], "reviewer_id": e["id"], "kind": "self", "status": self_state, "ratings": json.dumps(r),
                                "overall": round(sum(r.values()) / 5, 1), "strengths": STRENGTHS[h % 4], "improvements": IMPROVE[h % 4],
                                "submitted_at": "2026-09-18T09:00:00Z" if self_state == "Submitted" else None})
            mgr = by_id.get(e["manager_id"] or "")
            if self_state == "Submitted" and mgr and h % 7 < 5:
                m_state = "Submitted" if h % 7 < 3 else "In Progress"
                r = _ratings(e, "mgr")
                overall = round(sum(r.values()) / 5, 1)
                reviews.append({"cycle_id": q3, "employee_id": e["id"], "reviewer_id": mgr["id"], "kind": "manager", "status": m_state, "ratings": json.dumps(r),
                                "overall": overall, "strengths": STRENGTHS[(h + 1) % 4], "improvements": IMPROVE[(h + 2) % 4],
                                "submitted_at": "2026-09-21T14:00:00Z" if m_state == "Submitted" else None})
                if m_state == "Submitted":
                    final = overall
            peers = [p for p in reviewees if p["department_id"] == e["department_id"] and p["id"] != e["id"]]
            if peers and h % 5 < 3:
                peer = peers[h % len(peers)]
                s, i = PEER[h % 3]
                r = _ratings(e, "peer")
                reviews.append({"cycle_id": q3, "employee_id": e["id"], "reviewer_id": peer["id"], "kind": "peer", "status": "Submitted", "ratings": json.dumps(r),
                                "overall": round(sum(r.values()) / 5, 1), "strengths": s, "improvements": i, "submitted_at": "2026-09-20T11:00:00Z"})
            parts.append({"cycle_id": q3, "employee_id": e["id"], "final_rating": final})
        insert_many(db, "review_participants", parts)
        # Uniform column sets for the multi-row insert.
        insert_many(db, "reviews", reviews)

    # ── OKRs ──
    if not query_one("SELECT 1 FROM objectives WHERE workspace_id = $1", [W], db):
        tpls = OKRS.get(W, OKRS["ws-annex"])
        pos = 0
        for t in tpls:
            dept = next((x for x in depts if re.search(t["dept"], x["name"])), None)
            owner = (dept and dept["head_id"]) or (emps[0]["id"] if emps else None)
            pos += 1
            oid = query_one(
                "INSERT INTO objectives (workspace_id, quarter, title, owner_id, confidence, position) VALUES ($1,'2026-Q3',$2,$3,$4,$5) RETURNING id",
                [W, t["title"], owner, t["confidence"], pos], db,
            )["id"]  # type: ignore[index]
            for i, (title, progress, cur, tgt) in enumerate(t["krs"]):
                kid = query_one(
                    "INSERT INTO key_results (objective_id, title, current, target, progress, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
                    [oid, title, cur, tgt, progress, i], db,
                )["id"]  # type: ignore[index]
                query(
                    "INSERT INTO key_result_updates (key_result_id, progress, current, note, author_id, created_at) VALUES ($1,$2,$3,$4,$5,'2026-09-19T08:30:00Z')",
                    [kid, progress, cur, "Weekly check-in", owner], db,
                )
        # One personal objective so employees have something of their own.
        person = next((e for e in emps if e["email"].startswith("nafula.njoroge@")), None) or next((e for e in emps if e["role"] == "employee"), None)
        if person:
            pos += 1
            oid = query_one(
                "INSERT INTO objectives (workspace_id, quarter, title, owner_id, confidence, position) VALUES ($1,'2026-Q3',$2,$3,$4,$5) RETURNING id",
                [W, PERSONAL_OKR["title"], person["id"], PERSONAL_OKR["confidence"], pos], db,
            )["id"]  # type: ignore[index]
            for i, (title, progress, cur, tgt) in enumerate(PERSONAL_OKR["krs"]):
                query("INSERT INTO key_results (objective_id, title, current, target, progress, position) VALUES ($1,$2,$3,$4,$5,$6)", [oid, title, cur, tgt, progress, i], db)

    # ── Succession plans for three critical roles ──
    if not query_one("SELECT 1 FROM succession_plans WHERE workspace_id = $1", [W], db):
        preferred = re.compile(r"Engineering|Finance|Delivery|Clinical|Production|Research|People")
        leaving = {r["employee_id"] for r in query("SELECT employee_id FROM offboardings WHERE workspace_id = $1", [W], db)}
        heads = [x for x in depts if x["head_id"] and x["head_id"] in by_id]
        heads.sort(key=lambda x: (not preferred.search(x["name"]), x["name"]))
        plans = []
        for pos, dept in enumerate(heads[:3]):
            head = by_id[dept["head_id"]]
            pool_ = [e for e in reviewees if e["department_id"] == dept["id"] and e["id"] != head["id"] and e["id"] not in leaving]
            pool_.sort(key=lambda e: -(e["performance"] + e["potential"] * 0.5))
            succ = []
            for e in pool_[:3]:
                score = e["performance"] + e["potential"] * 0.5
                readiness = "Ready now" if score >= 5.4 else "1–2 years" if score >= 4.6 else "3+ years"
                hr = _h(e["id"], "risk") % 10
                risk = "High" if e["performance"] >= 4.3 and hr < 4 else "Medium" if hr < 3 else "Low"
                succ.append({"employeeId": e["id"], "readiness": readiness, "flightRisk": risk})
            plans.append({
                "workspace_id": W, "role_title": head["title"], "department_id": dept["id"], "incumbent_id": head["id"],
                "successors": json.dumps(succ), "notes": "Reviewed at the Q3 talent calibration.", "position": pos,
            })
        insert_many(db, "succession_plans", plans)


def main() -> None:
    pool.open()
    try:
        from db.seed import load_demo_data

        data = load_demo_data()
        for wid in DEMO_WORKSPACES:
            d = data["workspaces"][wid]
            with tx() as db:
                if not query_one("SELECT 1 FROM workspaces WHERE id = $1", [wid], db):
                    continue
                seed_payroll_performance(db, d)
            print(f"✓ payroll & performance demo data for {wid}")
    finally:
        pool.close()


if __name__ == "__main__":
    main()
