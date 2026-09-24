"""Attendance: clock in/out with breaks, personal history, team roster and today's org summary.

Work dates, late arrivals and overtime use the workspace shift (attendance_settings, with defaults)
in the workspace time zone.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from ..audit import audit
from ..db import iso, query, query_one, tx
from ..errors import bad_request, forbidden, parse
from ..roles import ADMIN, EXEC, is_leader
from ..security import AuthContext, require_auth, require_role

router = APIRouter()

DEFAULTS: dict[str, Any] = {"shift_start": "08:30", "shift_end": "17:30", "grace_min": 10, "hours_per_day": 8.0, "timezone": "Africa/Nairobi"}
ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


# ── Settings & time helpers ─────────────────────────────────────────
def load_settings(workspace_id: str, db=None) -> dict[str, Any]:
    r = query_one(
        """SELECT to_char(shift_start, 'HH24:MI') AS shift_start, to_char(shift_end, 'HH24:MI') AS shift_end, grace_min, hours_per_day, timezone
         FROM attendance_settings WHERE workspace_id = $1""",
        [workspace_id],
        db,
    )
    return {**DEFAULTS, **(r or {})}


def to_settings(s: dict[str, Any]) -> dict[str, Any]:
    return {"shiftStart": s["shift_start"], "shiftEnd": s["shift_end"], "graceMin": s["grace_min"], "hoursPerDay": float(s["hours_per_day"]), "timezone": s["timezone"]}


def _tz(s: dict[str, Any]) -> ZoneInfo:
    try:
        return ZoneInfo(s["timezone"])
    except Exception:  # noqa: BLE001 — an unknown zone falls back to EAT
        return ZoneInfo("Africa/Nairobi")


def _hm(v: str) -> int:
    h, m = v.split(":")[:2]
    return int(h) * 60 + int(m)


def local_today(s: dict[str, Any]) -> dt.date:
    return dt.datetime.now(_tz(s)).date()


def _minute_of_day(ts: dt.datetime, tz: ZoneInfo) -> int:
    t = ts.astimezone(tz)
    return t.hour * 60 + t.minute


def _date_param(v: Optional[str], default: dt.date) -> dt.date:
    if not v:
        return default
    try:
        return dt.date.fromisoformat(v)
    except ValueError:
        raise bad_request("Dates must be ISO dates (YYYY-MM-DD)")


RECORDS_SQL = """SELECT r.id, r.employee_id, r.work_date, r.clock_in, r.clock_out, r.method, r.latitude, r.longitude,
    COALESCE((SELECT sum(extract(epoch FROM (COALESCE(b.ended_at, now()) - b.started_at))) FROM attendance_breaks b WHERE b.record_id = r.id), 0) AS break_s,
    EXISTS (SELECT 1 FROM attendance_breaks b WHERE b.record_id = r.id AND b.ended_at IS NULL) AS on_break,
    now() AS now_ts
  FROM attendance_records r"""


def _day_from_records(recs: list[dict[str, Any]], s: dict[str, Any]) -> dict[str, Any]:
    """Aggregates one person's records for one work date."""
    tz = _tz(s)
    recs = sorted(recs, key=lambda r: r["clock_in"])
    worked = 0.0
    brk = 0.0
    for r in recs:
        end = r["clock_out"] or r["now_ts"]
        worked += max(0.0, (end - r["clock_in"]).total_seconds() - float(r["break_s"]))
        brk += float(r["break_s"])
    first, last = recs[0], recs[-1]
    in_min = _minute_of_day(first["clock_in"], tz)
    late = max(0, in_min - _hm(s["shift_start"])) if in_min > _hm(s["shift_start"]) + int(s["grace_min"]) else 0
    worked_min = round(worked / 60)
    overtime = max(0, worked_min - round(float(s["hours_per_day"]) * 60))
    open_ = last["clock_out"] is None
    return {
        "firstIn": iso(first["clock_in"]),
        "lastOut": None if open_ else iso(last["clock_out"]),
        "inMin": in_min,
        "outMin": None if open_ else _minute_of_day(last["clock_out"], tz),
        "workedMinutes": worked_min,
        "breakMinutes": round(brk / 60),
        "lateMinutes": late,
        "overtimeMinutes": overtime,
        "open": open_,
        "onBreak": bool(last["on_break"]) if open_ else False,
        "method": first["method"],
        "status": "late" if late else "present",
    }


def _leave_by_date(rows: list[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for r in rows:
        d, end = dt.date.fromisoformat(r["start_date"]), dt.date.fromisoformat(r["end_date"])
        while d <= end:
            out.setdefault(d.isoformat(), r["type"])
            d += dt.timedelta(days=1)
    return out


def _close_stale(db, employee_id: str, s: dict[str, Any], today: dt.date) -> None:
    """Records left open on an earlier day are closed at that day's shift end (never before clock-in)."""
    query(
        """UPDATE attendance_breaks SET ended_at = now() WHERE employee_id = $1 AND ended_at IS NULL
           AND record_id IN (SELECT id FROM attendance_records WHERE employee_id = $1 AND clock_out IS NULL AND work_date < $2)""",
        [employee_id, today.isoformat()],
        db,
    )
    query(
        """UPDATE attendance_records SET clock_out = GREATEST(clock_in, ((work_date + $3::time) AT TIME ZONE $4))
         WHERE employee_id = $1 AND clock_out IS NULL AND work_date < $2""",
        [employee_id, today.isoformat(), s["shift_end"], s["timezone"]],
        db,
    )


def today_summary(db, employee_id: str, s: dict[str, Any]) -> dict[str, Any]:
    today = local_today(s)
    recs = query(RECORDS_SQL + " WHERE r.employee_id = $1 AND r.work_date = $2 ORDER BY r.clock_in", [employee_id, today.isoformat()], db)
    breaks = query(
        "SELECT started_at, ended_at FROM attendance_breaks WHERE employee_id = $1 AND record_id = ANY($2) ORDER BY started_at",
        [employee_id, [r["id"] for r in recs]],
        db,
    ) if recs else []
    now = dt.datetime.now(dt.timezone.utc)
    base: dict[str, Any] = {"date": today.isoformat(), "serverTime": iso(now), "state": "out", "openRecordId": None, "workedSeconds": 0, "breakSeconds": 0,
                            "firstIn": None, "lastOut": None, "method": None, "location": None, "lateMinutes": 0, "overtimeMinutes": 0, "events": []}
    if not recs:
        return base
    day = _day_from_records(recs, s)
    worked = sum(max(0.0, ((r["clock_out"] or r["now_ts"]) - r["clock_in"]).total_seconds() - float(r["break_s"])) for r in recs)
    events: list[dict[str, Any]] = []
    for r in recs:
        events.append({"at": iso(r["clock_in"]), "kind": "in", "label": f"Punch in · {r['method']}"})
        if r["clock_out"]:
            events.append({"at": iso(r["clock_out"]), "kind": "out", "label": "Punch out"})
    for b in breaks:
        events.append({"at": iso(b["started_at"]), "kind": "break", "label": "Break started"})
        if b["ended_at"]:
            events.append({"at": iso(b["ended_at"]), "kind": "resume", "label": "Back from break"})
    events.sort(key=lambda e: e["at"])
    last = recs[-1]
    loc = next(({"latitude": float(r["latitude"]), "longitude": float(r["longitude"])} for r in recs if r["latitude"] is not None and r["longitude"] is not None), None)
    return {
        **base,
        "state": ("break" if day["onBreak"] else "working") if day["open"] else "out",
        "openRecordId": last["id"] if day["open"] else None,
        "workedSeconds": round(worked),
        "breakSeconds": round(sum(float(r["break_s"]) for r in recs)),
        "firstIn": day["firstIn"],
        "lastOut": day["lastOut"],
        "method": last["method"],
        "location": loc,
        "lateMinutes": day["lateMinutes"],
        "overtimeMinutes": day["overtimeMinutes"],
        "events": events,
    }


def personal_days(db, employee_id: str, workspace_id: str, frm: dt.date, to: dt.date, s: dict[str, Any]) -> list[dict[str, Any]]:
    """One entry per weekday (and any worked weekend day) in the range, newest first."""
    today = local_today(s)
    to = min(to, today)
    recs = query(RECORDS_SQL + " WHERE r.employee_id = $1 AND r.work_date BETWEEN $2 AND $3", [employee_id, frm.isoformat(), to.isoformat()], db)
    emp = query_one("SELECT start_date FROM employees WHERE id = $1", [employee_id], db)
    ws = query_one("SELECT country FROM workspaces WHERE id = $1", [workspace_id], db)
    hol = {h["date"]: h["name"] for h in query("SELECT date, name FROM holidays WHERE workspace_id = $1 AND country = $2 AND date BETWEEN $3 AND $4", [workspace_id, ws["country"], frm.isoformat(), to.isoformat()], db)}  # type: ignore[index]
    leave = _leave_by_date(query(
        "SELECT type, start_date, end_date FROM leave_requests WHERE employee_id = $1 AND status = 'Approved' AND start_date <= $3 AND end_date >= $2",
        [employee_id, frm.isoformat(), to.isoformat()],
        db,
    ))
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in recs:
        by_date.setdefault(r["work_date"], []).append(r)
    start = dt.date.fromisoformat(emp["start_date"]) if emp else frm  # type: ignore[index]
    out: list[dict[str, Any]] = []
    d = to
    while d >= frm:
        k = d.isoformat()
        if k in by_date:
            out.append({"date": k, **_day_from_records(by_date[k], s)})
        elif d.weekday() < 5 and d >= start and d < today:  # today without a punch isn't an absence yet
            status = "holiday" if k in hol else "leave" if k in leave else "absent"
            out.append({"date": k, "status": status, "label": hol.get(k) or leave.get(k), "firstIn": None, "lastOut": None, "inMin": None, "outMin": None,
                        "workedMinutes": 0, "breakMinutes": 0, "lateMinutes": 0, "overtimeMinutes": 0, "open": False, "onBreak": False, "method": None})
        d -= dt.timedelta(days=1)
    return out


# ── Personal ────────────────────────────────────────────────────────
@router.get("/attendance/settings")
def get_settings(me: AuthContext = Depends(require_auth)):
    return to_settings(load_settings(me.workspaceId))


class SettingsIn(BaseModel):
    model_config = ConfigDict(strict=True)

    shiftStart: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    shiftEnd: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    graceMin: int = Field(ge=0, le=120)
    hoursPerDay: float = Field(ge=1, le=24)
    timezone: str = Field(default="Africa/Nairobi", min_length=3, max_length=64)


@router.put("/attendance/settings")
def put_settings(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(SettingsIn, body)
    try:
        ZoneInfo(b.timezone)
    except Exception:  # noqa: BLE001
        raise bad_request("Unknown time zone")
    if _hm(b.shiftEnd) <= _hm(b.shiftStart):
        raise bad_request("Shift end must be after shift start")
    query(
        """INSERT INTO attendance_settings (workspace_id, shift_start, shift_end, grace_min, hours_per_day, timezone) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (workspace_id) DO UPDATE SET shift_start = $2, shift_end = $3, grace_min = $4, hours_per_day = $5, timezone = $6, updated_at = now()""",
        [me.workspaceId, b.shiftStart, b.shiftEnd, b.graceMin, b.hoursPerDay, b.timezone],
    )
    audit(request, me, "attendance.settings_updated", "workspace", me.workspaceId, b.model_dump())
    return to_settings(load_settings(me.workspaceId))


@router.get("/attendance/me")
def my_attendance(request: Request, me: AuthContext = Depends(require_auth)):
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        today = local_today(s)
        to = _date_param(request.query_params.get("to"), today)
        frm = _date_param(request.query_params.get("from"), today - dt.timedelta(days=42))
        if frm > to:
            raise bad_request("'from' must be on or before 'to'")
        if (to - frm).days > 400:
            raise bad_request("Choose a range of at most 400 days")
        return {"settings": to_settings(s), "today": today_summary(db, me.employeeId, s), "days": personal_days(db, me.employeeId, me.workspaceId, frm, to, s)}


class ClockIn(BaseModel):
    model_config = ConfigDict(strict=True)

    method: Literal["Web", "Mobile", "Biometric"] = "Web"
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


@router.post("/attendance/clock-in")
def clock_in(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(ClockIn, body if body is not None else {})
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        today = local_today(s)
        _close_stale(db, me.employeeId, s, today)
        if query_one("SELECT id FROM attendance_records WHERE employee_id = $1 AND clock_out IS NULL", [me.employeeId], db):
            raise bad_request("You are already clocked in")
        row = query_one(
            "INSERT INTO attendance_records (workspace_id, employee_id, work_date, clock_in, method, latitude, longitude) VALUES ($1,$2,$3,now(),$4,$5,$6) RETURNING id",
            [me.workspaceId, me.employeeId, today.isoformat(), b.method, b.latitude, b.longitude],
            db,
        )
        audit(request, me, "attendance.clock_in", "attendance_record", row["id"], {"method": b.method, "geo": b.latitude is not None}, db)  # type: ignore[index]
        return JSONResponse(today_summary(db, me.employeeId, s), status_code=201)


@router.post("/attendance/clock-out")
def clock_out(request: Request, me: AuthContext = Depends(require_auth)):
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        query("UPDATE attendance_breaks SET ended_at = now() WHERE employee_id = $1 AND ended_at IS NULL", [me.employeeId], db)
        row = query_one("UPDATE attendance_records SET clock_out = now() WHERE employee_id = $1 AND clock_out IS NULL RETURNING id", [me.employeeId], db)
        if not row:
            raise bad_request("You are not clocked in")
        audit(request, me, "attendance.clock_out", "attendance_record", row["id"], None, db)
        return today_summary(db, me.employeeId, s)


@router.post("/attendance/break/start")
def break_start(me: AuthContext = Depends(require_auth)):
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        rec = query_one("SELECT id FROM attendance_records WHERE employee_id = $1 AND clock_out IS NULL", [me.employeeId], db)
        if not rec:
            raise bad_request("Punch in before starting a break")
        if query_one("SELECT id FROM attendance_breaks WHERE employee_id = $1 AND ended_at IS NULL", [me.employeeId], db):
            raise bad_request("You are already on a break")
        query("INSERT INTO attendance_breaks (workspace_id, record_id, employee_id, started_at) VALUES ($1,$2,$3,now())", [me.workspaceId, rec["id"], me.employeeId], db)
        return today_summary(db, me.employeeId, s)


@router.post("/attendance/break/end")
def break_end(me: AuthContext = Depends(require_auth)):
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        if not query_one("UPDATE attendance_breaks SET ended_at = now() WHERE employee_id = $1 AND ended_at IS NULL RETURNING id", [me.employeeId], db):
            raise bad_request("You are not on a break")
        return today_summary(db, me.employeeId, s)


# ── Leaders: team roster and today's summary ────────────────────────
def _scope(db, me: AuthContext, on: dt.date) -> list[dict[str, Any]]:
    """People a leader may see: everyone for HR/CEO, direct reports for managers."""
    if not is_leader(me.role):
        raise forbidden()
    everyone = me.role in EXEC
    return query(
        """SELECT e.id, e.name, e.title, e.department_id, e.manager_id, e.start_date, e.status FROM employees e
         WHERE e.workspace_id = $1 AND e.status <> 'Exited' AND e.start_date <= $2 AND ($3::boolean OR e.manager_id = $4)
         ORDER BY e.name""",
        [me.workspaceId, on.isoformat(), everyone, me.employeeId],
        db,
    )


def _roster(db, me: AuthContext, on: dt.date, s: dict[str, Any]) -> list[dict[str, Any]]:
    people = _scope(db, me, on)
    ids = [p["id"] for p in people]
    if not ids:
        return []
    recs = query(RECORDS_SQL + " WHERE r.workspace_id = $1 AND r.work_date = $2 AND r.employee_id = ANY($3)", [me.workspaceId, on.isoformat(), ids], db)
    leave = {r["employee_id"]: r["type"] for r in query(
        "SELECT employee_id, type FROM leave_requests WHERE workspace_id = $1 AND status = 'Approved' AND start_date <= $2 AND end_date >= $2 AND employee_id = ANY($3)",
        [me.workspaceId, on.isoformat(), ids],
        db,
    )}
    holiday = query_one(
        "SELECT h.name FROM holidays h JOIN workspaces w ON w.id = h.workspace_id AND w.country = h.country WHERE h.workspace_id = $1 AND h.date = $2",
        [me.workspaceId, on.isoformat()],
        db,
    )
    by_emp: dict[str, list[dict[str, Any]]] = {}
    for r in recs:
        by_emp.setdefault(r["employee_id"], []).append(r)
    today = local_today(s)
    before_cutoff = on == today and _minute_of_day(dt.datetime.now(dt.timezone.utc), _tz(s)) < _hm(s["shift_start"]) + int(s["grace_min"])
    out = []
    for p in people:
        base = {"employeeId": p["id"], "name": p["name"], "title": p["title"], "departmentId": p["department_id"]}
        if p["id"] in by_emp:
            d = _day_from_records(by_emp[p["id"]], s)
            out.append({**base, **d, "status": "Late" if d["lateMinutes"] else "On time"})
        else:
            status = "Holiday" if holiday else "On leave" if p["id"] in leave or p["status"] == "On Leave" else "Not in yet" if before_cutoff else "Absent"
            out.append({**base, "status": status, "leaveType": leave.get(p["id"]), "firstIn": None, "lastOut": None, "inMin": None, "outMin": None,
                        "workedMinutes": 0, "breakMinutes": 0, "lateMinutes": 0, "overtimeMinutes": 0, "open": False, "onBreak": False, "method": None})
    return out


@router.get("/attendance/team")
def team_attendance(request: Request, me: AuthContext = Depends(require_auth)):
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        on = _date_param(request.query_params.get("date"), local_today(s))
        return {"date": on.isoformat(), "settings": to_settings(s), "roster": _roster(db, me, on, s)}


@router.get("/attendance/summary")
def attendance_summary(request: Request, me: AuthContext = Depends(require_auth)):
    """Today's org (or team) view: counts, late arrivals, overtime and this week's trend."""
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        on = _date_param(request.query_params.get("date"), local_today(s))
        roster = _roster(db, me, on, s)
        ids = [r["employeeId"] for r in roster]
        names = {r["employeeId"]: r for r in roster}
        monday = on - dt.timedelta(days=on.weekday())
        frm = min(monday, on - dt.timedelta(days=13))
        recs = query(RECORDS_SQL + " WHERE r.workspace_id = $1 AND r.work_date BETWEEN $2 AND $3 AND r.employee_id = ANY($4)", [me.workspaceId, frm.isoformat(), on.isoformat(), ids], db) if ids else []
        leave_rows = query(
            "SELECT employee_id, type, start_date, end_date FROM leave_requests WHERE workspace_id = $1 AND status = 'Approved' AND start_date <= $3 AND end_date >= $2 AND employee_id = ANY($4)",
            [me.workspaceId, monday.isoformat(), on.isoformat(), ids],
            db,
        ) if ids else []

    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in recs:
        grouped.setdefault((r["employee_id"], r["work_date"]), []).append(r)
    days = {k: _day_from_records(v, s) for k, v in grouped.items()}

    overtime: dict[str, int] = {}
    week_ot = 0
    for (emp, date), d in days.items():
        if date >= (on - dt.timedelta(days=13)).isoformat():
            overtime[emp] = overtime.get(emp, 0) + d["overtimeMinutes"]
        if date >= monday.isoformat():
            week_ot += d["overtimeMinutes"]
    leaders = sorted(({"employeeId": k, "name": names[k]["name"], "title": names[k]["title"], "hours": round(v / 60, 1)} for k, v in overtime.items() if v > 0), key=lambda x: -x["hours"])[:6]

    trend = []
    on_leave_by_day: dict[str, set[str]] = {}
    for lr in leave_rows:
        for k in _leave_by_date([lr]):
            on_leave_by_day.setdefault(k, set()).add(lr["employee_id"])
    for i in range(5):
        d = monday + dt.timedelta(days=i)
        k = d.isoformat()
        if d > on:
            trend.append({"day": d.strftime("%a"), "date": k, "onTime": None, "late": None, "absent": None})
            continue
        present = [days[(e, k)] for e in ids if (e, k) in days]
        late = sum(1 for x in present if x["lateMinutes"])
        away = len(on_leave_by_day.get(k, set()) - {e for e in ids if (e, k) in days})
        trend.append({"day": d.strftime("%a"), "date": k, "onTime": len(present) - late, "late": late, "absent": max(0, len(ids) - len(present) - away)})

    counts = {"active": len(roster), "present": 0, "late": 0, "absent": 0, "onLeave": 0, "notInYet": 0, "holiday": 0}
    for r in roster:
        st = r["status"]
        if st in ("On time", "Late"):
            counts["present"] += 1
            counts["late"] += st == "Late"
        elif st == "On leave":
            counts["onLeave"] += 1
        elif st == "Not in yet":
            counts["notInYet"] += 1
        elif st == "Holiday":
            counts["holiday"] += 1
        else:
            counts["absent"] += 1
    late_list = sorted(
        ({"employeeId": r["employeeId"], "name": r["name"], "title": r["title"], "firstIn": r["firstIn"], "inMin": r["inMin"], "minutesLate": r["lateMinutes"]} for r in roster if r["status"] == "Late"),
        key=lambda x: -x["minutesLate"],
    )
    return {
        "date": on.isoformat(),
        "scope": "organisation" if me.role in EXEC else "team",
        "settings": to_settings(s),
        **counts,
        "lateArrivals": late_list,
        "overtime": leaders,
        "overtimeWeekHours": round(week_ot / 60, 1),
        "trend": trend,
    }


@router.get("/attendance/heatmap")
def attendance_heatmap(request: Request, me: AuthContext = Depends(require_auth)):
    """Share of active employees who clocked in each weekday (aggregate only — no personal data)."""
    try:
        weeks = max(1, min(26, int(request.query_params.get("weeks") or 16)))
    except ValueError:
        weeks = 16
    with tx() as db:
        s = load_settings(me.workspaceId, db)
        today = local_today(s)
        first = today - dt.timedelta(days=today.weekday()) - dt.timedelta(weeks=weeks - 1)
        counts = {r["work_date"]: r["n"] for r in query(
            "SELECT work_date, count(DISTINCT employee_id) AS n FROM attendance_records WHERE workspace_id = $1 AND work_date BETWEEN $2 AND $3 GROUP BY 1",
            [me.workspaceId, first.isoformat(), today.isoformat()],
            db,
        )}
        since = query_one("SELECT min(work_date) AS d FROM attendance_records WHERE workspace_id = $1", [me.workspaceId], db)
        starts = [dt.date.fromisoformat(r["start_date"]) for r in query("SELECT start_date FROM employees WHERE workspace_id = $1 AND status <> 'Exited'", [me.workspaceId], db)]
    out = []
    for w in range(weeks):
        row = []
        for d in range(5):
            day = first + dt.timedelta(days=w * 7 + d)
            k = day.isoformat()
            if day > today or not since or not since["d"] or k < since["d"]:
                row.append({"date": k, "pct": None})  # upcoming, or before attendance was tracked
                continue
            active = sum(1 for x in starts if x <= day) or 1
            row.append({"date": k, "pct": min(100, round(counts.get(k, 0) / active * 100))})
        out.append(row)
    return {"weeks": out}
