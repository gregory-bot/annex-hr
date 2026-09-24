"""Demo data for time, attendance & leave: ~6 weeks of clock-ins with breaks, timesheet submission
times, HR alerts on pending leave and a few regional holiday calendars.

    python -m db.seed_time_leave     seed the demo workspaces that are already in the database

`seed_time_leave(db, d)` is called by db/seed.py for each demo workspace (d = one workspace from demo-data.json).
Idempotent: attendance is only generated for a workspace that has none yet.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import random
from typing import Any
from zoneinfo import ZoneInfo

import psycopg

from api.db import insert_many, query

TZ = ZoneInfo("Africa/Nairobi")
WEEKS = 6

EXTRA_HOLIDAYS = [
    ("2026-01-01", "New Year's Day", "Nigeria"),
    ("2026-06-12", "Democracy Day", "Nigeria"),
    ("2026-10-01", "Independence Day", "Nigeria"),
    ("2026-12-25", "Christmas Day", "Nigeria"),
    ("2026-01-26", "NRM Liberation Day", "Uganda"),
    ("2026-06-03", "Martyrs' Day", "Uganda"),
    ("2026-10-09", "Independence Day", "Uganda"),
    ("2026-12-25", "Christmas Day", "Uganda"),
    ("2026-02-01", "Heroes' Day", "Rwanda"),
    ("2026-04-07", "Genocide against the Tutsi Memorial Day", "Rwanda"),
    ("2026-07-01", "Independence Day", "Rwanda"),
    ("2026-12-25", "Christmas Day", "Rwanda"),
]


def _rng(*parts: str) -> random.Random:
    return random.Random(int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:12], 16))


def _at(day: dt.date, minute: int) -> dt.datetime:
    return dt.datetime.combine(day, dt.time(minute // 60, minute % 60), TZ)


def _seed_attendance(db: psycopg.Connection, d: dict[str, Any]) -> int:
    W = d["workspace"]["id"]
    if query("SELECT 1 FROM attendance_records WHERE workspace_id = $1 LIMIT 1", [W], db):
        return 0
    now = dt.datetime.now(TZ)
    today = now.date()
    now_min = now.hour * 60 + now.minute
    first = today - dt.timedelta(days=WEEKS * 7)
    country = d["workspace"]["country"]
    holidays = {h["date"] for h in d["holidays"] if h["country"] == country}
    leave: dict[str, set[str]] = {}
    for lr in query("SELECT employee_id, start_date, end_date FROM leave_requests WHERE workspace_id = $1 AND status = 'Approved'", [W], db):
        day, end = dt.date.fromisoformat(lr["start_date"]), dt.date.fromisoformat(lr["end_date"])
        while day <= end:
            leave.setdefault(lr["employee_id"], set()).add(day.isoformat())
            day += dt.timedelta(days=1)

    records: list[dict[str, Any]] = []
    breaks: list[dict[str, Any]] = []
    for e in d["employees"]:
        if e["status"] == "Exited":
            continue
        trait = _rng(W, e["id"], "trait")
        punctual = trait.random()  # higher = earlier, fewer late days
        start = dt.date.fromisoformat(e["startDate"])
        day = first
        while day <= today:
            k = day.isoformat()
            r = _rng(W, e["id"], k)
            if day.weekday() >= 5 or k in holidays or k in leave.get(e["id"], set()) or day < start or (day == today and e["status"] == "On Leave"):
                day += dt.timedelta(days=1)
                continue
            if r.random() < 0.035:  # unplanned absence
                day += dt.timedelta(days=1)
                continue
            late = r.random() < 0.22 * (1 - punctual) + 0.03
            in_min = 8 * 60 + 30 + (r.randint(12, 55) if late else -r.randint(0, 28))
            out_min = 17 * 60 + 15 + r.randint(0, 110) - (20 if day.weekday() == 4 else 0)
            lunch = 12 * 60 + 45 + r.randint(0, 45)
            lunch_len = r.choice((30, 40, 45, 45, 60))
            if day == today:
                if in_min > now_min:
                    day += dt.timedelta(days=1)
                    continue
                rid = f"att-{W}-{e['id']}-{k}"
                records.append({"id": rid, "workspace_id": W, "employee_id": e["id"], "work_date": k, "clock_in": _at(day, in_min), "clock_out": None,
                                "method": r.choice(("Web", "Web", "Mobile", "Biometric"))})
                if now_min > lunch + lunch_len:
                    breaks.append({"workspace_id": W, "record_id": rid, "employee_id": e["id"], "started_at": _at(day, lunch), "ended_at": _at(day, lunch + lunch_len)})
            else:
                rid = f"att-{W}-{e['id']}-{k}"
                records.append({"id": rid, "workspace_id": W, "employee_id": e["id"], "work_date": k, "clock_in": _at(day, in_min), "clock_out": _at(day, out_min),
                                "method": r.choice(("Web", "Web", "Mobile", "Biometric"))})
                breaks.append({"workspace_id": W, "record_id": rid, "employee_id": e["id"], "started_at": _at(day, lunch), "ended_at": _at(day, lunch + lunch_len)})
            day += dt.timedelta(days=1)
    insert_many(db, "attendance_records", records)
    insert_many(db, "attendance_breaks", breaks)
    return len(records)


def _seed_timesheets(db: psycopg.Connection, W: str) -> None:
    """Submission (and decision) times so reminders and 'pending for N days' are meaningful."""
    query(
        """UPDATE timesheets SET submitted_at = LEAST(now() - interval '2 hours', (week_start + 4 + time '17:10') AT TIME ZONE 'Africa/Nairobi')
         WHERE workspace_id = $1 AND status <> 'Draft' AND submitted_at IS NULL""",
        [W],
        db,
    )
    query(
        """UPDATE timesheets SET approved_at = LEAST(now() - interval '1 hour', submitted_at + interval '1 day')
         WHERE workspace_id = $1 AND status IN ('Approved', 'Rejected') AND approved_at IS NULL""",
        [W],
        db,
    )


def _seed_leave_alerts(db: psycopg.Connection, W: str) -> None:
    from api.routers.leave import leave_alerts

    for lr in query(
        """SELECT l.id, l.start_date, l.end_date, l.days, e.id AS emp_id, e.manager_id, e.department_id FROM leave_requests l
         JOIN employees e ON e.id = l.employee_id WHERE l.workspace_id = $1 AND l.status = 'Pending' AND l.alerts = '{}'""",
        [W],
        db,
    ):
        emp = {"id": lr["emp_id"], "manager_id": lr["manager_id"], "department_id": lr["department_id"]}
        alerts = leave_alerts(db, W, emp, lr["start_date"], lr["end_date"], float(lr["days"]))
        if alerts:
            query("UPDATE leave_requests SET alerts = $2 WHERE id = $1", [lr["id"], alerts], db)


def seed_time_leave(db: psycopg.Connection, d: dict[str, Any]) -> None:
    W = d["workspace"]["id"]
    query("INSERT INTO attendance_settings (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING", [W], db)
    for date, name, country in EXTRA_HOLIDAYS:
        query("INSERT INTO holidays (workspace_id, date, name, country) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [W, date, name, country], db)
    n = _seed_attendance(db, d)
    _seed_timesheets(db, W)
    _seed_leave_alerts(db, W)
    print(f"  · time & leave: {n} attendance records")


def main() -> None:
    import json
    from pathlib import Path

    from api.db import pool, tx

    data = json.loads((Path(__file__).resolve().parent / "demo-data.json").read_text(encoding="utf-8"))
    pool.open()
    try:
        for d in data["workspaces"].values():
            with tx() as db:
                if not query("SELECT 1 FROM workspaces WHERE id = $1", [d["workspace"]["id"]], db):
                    continue
                print(d["workspace"]["name"])
                seed_time_leave(db, d)
    finally:
        pool.close()


if __name__ == "__main__":
    main()
