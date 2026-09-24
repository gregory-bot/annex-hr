"""Demo data for engagement & compliance: survey questions and responses, policy acknowledgements.

    python -m db.seed_engagement_compliance     (re)seed the demo workspaces (never the customer's)

Deterministic per workspace; safe to re-run (survey answers are regenerated, acknowledgements upserted).
"""

from __future__ import annotations

import datetime as dt
import json
import random
from typing import Any

import psycopg

from api.db import insert_many, pool, query, tx
from api.survey_results import headline

#: Demo logins keep something to do: they haven't answered the live surveys or signed every policy.
PERSONAS = {
    "faith.njeri@annex-technologies.com",
    "nafula.njoroge@annex-technologies.com",
    "tumaini.nwosu@annex-technologies.com",
    "grace.achieng@annex-technologies.com",
    "david.mutua@annex-technologies.com",
    "kamau.mohamed@annex-technologies.com",
}

CHOICES = ["Fewer meetings", "Clearer priorities", "Better tools", "More recognition"]

PULSE = [
    {"id": "p1", "type": "emoji", "text": "How are you feeling about work this week?"},
    {"id": "p2", "type": "emoji", "text": "I have the tools and resources to do my job well."},
    {"id": "p3", "type": "emoji", "text": "My manager gives me useful, regular feedback."},
    {"id": "p4", "type": "emoji", "text": "I see a clear path to grow my career here."},
    {"id": "p5", "type": "nps", "text": "How likely are you to recommend us as a place to work?"},
    {"id": "p6", "type": "choice", "text": "What would most improve your day-to-day?", "options": CHOICES},
    {"id": "p7", "type": "text", "text": "Anything else you would like leadership to hear? (optional)"},
]

HYBRID = [
    {"id": "h1", "type": "emoji", "text": "How well does the hybrid schedule work for you?"},
    {"id": "h2", "type": "emoji", "text": "I can focus when I'm in the office."},
    {"id": "h3", "type": "choice", "text": "How many office days a week suit you best?", "options": ["1 day", "2 days", "3 days", "4+ days"]},
    {"id": "h4", "type": "nps", "text": "How likely are you to recommend our hybrid setup to a friend?"},
    {"id": "h5", "type": "text", "text": "What one change would make hybrid work better? (optional)"},
]

MANAGER = [
    {"id": "m1", "type": "emoji", "text": "My manager sets clear goals for the quarter."},
    {"id": "m2", "type": "emoji", "text": "My manager recognises good work."},
    {"id": "m3", "type": "emoji", "text": "I can raise concerns with my manager without worry."},
    {"id": "m4", "type": "text", "text": "What should your manager keep doing or change?"},
]

POSITIVE = [
    "The new hybrid policy has made a huge difference to my commute and my energy levels. Thank you!",
    "My manager checks in every week and actually follows up. It shows.",
    "The Mashujaa Day team outing was the best one yet. More of that please.",
    "Salary advance through payroll helped me a lot this term with school fees.",
    "Onboarding buddies are great — I felt part of the team in my first week.",
    "Leave approvals are much faster since we moved to Annex HR.",
    "Really proud of how we handled the Q3 launch together.",
]
NEUTRAL = [
    "Office Wi-Fi on the 4th floor is still unreliable during all-hands.",
    "Onboarding was smooth but I still do not know who owns what across teams.",
    "The canteen menu could use more variety, especially vegetarian options.",
    "Would be good to have the all-hands recording shared the same day.",
]
CONSTRUCTIVE = [
    "Sprint planning feels rushed. We commit before we understand the scope, then scramble in the last week.",
    "Would love clearer criteria for promotion — right now it feels like it depends on who you know.",
    "Too many tools for the same thing. We use three different places to track tasks.",
    "Workload spikes at month end are not sustainable. We need better planning with Finance.",
    "Feedback only comes at appraisal time. More regular check-ins would help.",
]
HYBRID_COMMENTS = [
    "Anchor days for each team would make office days more useful.",
    "Matatu costs make three office days hard — a transport allowance would help.",
    "Quiet rooms for calls on office days, please.",
    "Two days in the office is the sweet spot for me.",
    "Hot-desking means I spend the first 20 minutes finding a seat.",
]


def _clamp(v: float, lo: int, hi: int) -> int:
    return max(lo, min(hi, round(v)))


def _answers(rng: random.Random, questions: list[dict[str, Any]], mood: float, used: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for q in questions:
        t = q["type"]
        if t == "emoji":
            out[q["id"]] = _clamp(mood + rng.gauss(0, 0.65), 1, 5)
        elif t == "nps":
            out[q["id"]] = _clamp(mood * 2.05 + rng.gauss(0, 1.1), 0, 10)
        elif t == "choice":
            if rng.random() < 0.95:
                out[q["id"]] = rng.choice(q["options"])
        elif t == "text" and rng.random() < 0.42:
            # Match the tone to this person's own scores (the same thresholds the results use).
            vals = [v for k, v in out.items() if k in {x["id"] for x in questions if x["type"] == "emoji"}]
            m = sum(vals) / len(vals) if vals else mood
            pool_ = HYBRID_COMMENTS if q["id"].startswith("h") else POSITIVE if m >= 3.8 else CONSTRUCTIVE if m <= 2.8 else NEUTRAL
            fresh = [c for c in pool_ if c not in used]
            if not fresh:
                continue  # every comment appears once
            c = rng.choice(fresh)
            used.add(c)
            out[q["id"]] = c
    return out


def seed_engagement_compliance(db: psycopg.Connection, d: dict[str, Any]) -> None:
    W = d["workspace"]["id"]
    employees = [e for e in d["employees"] if e["status"] != "Exited"]
    candidates = [e for e in employees if e["email"].lower() not in PERSONAS]

    # ── Surveys: questions, one response per participant, cached scores ──
    for s in d["surveys"]:
        sid = f"{W}-{s['id']}"
        questions = HYBRID if "Hybrid" in s["title"] else MANAGER if "Manager" in s["title"] else PULSE
        query("UPDATE surveys SET questions = $2 WHERE id = $1", [sid, json.dumps(questions)], db)
        query("DELETE FROM survey_responses WHERE survey_id = $1", [sid], db)
        query("DELETE FROM survey_participants WHERE survey_id = $1", [sid], db)
        if s["status"] == "Draft" or not s["responses"]:
            continue
        rng = random.Random(f"{sid}-responses")
        people = rng.sample(candidates, min(s["responses"], len(candidates)))
        target = 1 + 4 * (s["engagement"] or 70) / 100
        closes = dt.date.fromisoformat(s["closes"])
        used: set[str] = set()
        rows = []
        for i, e in enumerate(people):
            mood = max(1.2, min(4.9, rng.gauss(target, 0.7)))
            day = min(dt.date.today(), closes) - dt.timedelta(days=rng.randint(0, 12))
            rows.append((e, _answers(rng, questions, mood, used), day))
        insert_many(db, "survey_participants", [{"survey_id": sid, "employee_id": e["id"], "responded_on": day.isoformat()} for e, _, day in rows])
        # Shuffled so row order carries no hint of who answered.
        answers = [{"survey_id": sid, "employee_id": None if s["anonymous"] else e["id"], "department_id": e["departmentId"], "answers": json.dumps(ans),
                    "submitted_at": dt.datetime.combine(day, dt.time(0, 0), dt.timezone.utc)} for e, ans, day in rows]
        rng.shuffle(answers)
        insert_many(db, "survey_responses", answers)
        engagement, enps = headline(questions, [a for _, a, _ in rows])
        query(
            "UPDATE surveys SET responses = $2, engagement = $3, enps = $4, published_at = COALESCE(published_at, $5::date) WHERE id = $1",
            [sid, len(rows), engagement, enps, (closes - dt.timedelta(days=21)).isoformat()],
            db,
        )

    # ── Employee-specific documents ("Contract — Name") belong to that employee ──
    query(
        """UPDATE documents d SET employee_id = e.id FROM employees e
            WHERE d.workspace_id = $1 AND e.workspace_id = $1 AND d.employee_id IS NULL AND d.name LIKE '% — ' || e.name""",
        [W],
        db,
    )

    # ── Policy acknowledgements matching each policy's acknowledged % ──
    existing = {
        (r["policy_id"], r["employee_id"], r["version"])
        for r in query("SELECT a.policy_id, a.employee_id, a.version FROM policy_acknowledgements a JOIN policies p ON p.id = a.policy_id WHERE p.workspace_id = $1", [W], db)
    }
    acks = []
    for p in d["policies"]:
        rng = random.Random(f"{p['id']}-acks")
        n = min(len(candidates), round(p["acknowledged"] / 100 * len(employees)))
        for e in rng.sample(candidates, n):
            when = dt.datetime.combine(dt.date.fromisoformat(p["updated"]), dt.time(8, 0), dt.timezone.utc) + dt.timedelta(
                days=rng.randint(0, 30), hours=rng.randint(0, 10), minutes=rng.randint(0, 59)
            )
            when = min(when, dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=rng.randint(1, 48)))
            ip = f"41.{rng.randint(80, 220)}.{rng.randint(1, 254)}.{rng.randint(1, 254)}"
            if (p["id"], e["id"], p["version"]) not in existing:
                acks.append({"policy_id": p["id"], "employee_id": e["id"], "version": p["version"], "signature": e["name"], "ip_address": ip, "acknowledged_at": when})
    insert_many(db, "policy_acknowledgements", acks)


def main() -> None:
    data = json.loads((__import__("pathlib").Path(__file__).resolve().parent / "demo-data.json").read_text(encoding="utf-8"))
    pool.open()
    try:
        for d in data["workspaces"].values():
            with tx() as db:
                if not query("SELECT 1 FROM workspaces WHERE id = $1", [d["workspace"]["id"]], db):
                    continue
                seed_engagement_compliance(db, d)
            print(f"✓ Engagement & compliance demo data for {d['workspace']['name']}")
    finally:
        pool.close()


if __name__ == "__main__":
    main()
