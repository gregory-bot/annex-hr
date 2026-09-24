"""Automation rules: what each one looks for, who it reminds, and its defaults.

Each rule's `plan()` only reads other modules' tables and returns the reminders that are
due now. The engine drops reminders already in automation_log, so a reminder fires once
per milestone (subject_key) even though rules run every day.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

import psycopg
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..db import query
from ..roles import ADMIN

# ── Plan objects ────────────────────────────────────────────────────


@dataclass
class Notice:
    """One in-app notification. recipient_id None = broadcast to `audience`."""

    recipient_id: Optional[str]
    audience: str
    type: str
    title: str
    body: str
    href: str
    #: Notices with the same recipient and group are merged into one digest.
    group: str = ""
    item: str = ""


@dataclass
class Mail:
    to: str
    name: str
    subject: str
    heading: str
    intro: str
    cta: str
    href: str
    group: str = ""
    items: list[str] = field(default_factory=list)


@dataclass
class Reminder:
    subject_key: str
    summary: str
    recipients: list[str]
    notices: list[Notice] = field(default_factory=list)
    mails: list[Mail] = field(default_factory=list)


@dataclass
class Person:
    id: str
    name: str
    email: str


# ── Config models ───────────────────────────────────────────────────


class Schedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frequency: Literal["daily", "weekly"] = "daily"
    #: 0 = Monday … 6 = Sunday (weekly rules only).
    weekday: int = Field(default=0, ge=0, le=6)
    #: Local time in Africa/Nairobi.
    time: str = Field(default="08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


def _days(v: list[int]) -> list[int]:
    out = sorted(set(v), reverse=True)
    if not out:
        raise ValueError("Add at least one day")
    return out


class BaseConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schedule: Schedule = Field(default_factory=Schedule)
    #: Send emails as well as in-app notifications.
    email: bool = True


class ProbationConfig(BaseConfig):
    #: Days before probation ends (0 = on the appraisal day).
    days: list[int] = Field(default_factory=lambda: [60, 30, 0], min_length=1, max_length=6)

    @field_validator("days")
    @classmethod
    def _v(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 180 for d in v):
            raise ValueError("Days must be between 0 and 180")
        return _days(v)


class DocumentExpiryConfig(BaseConfig):
    days: list[int] = Field(default_factory=lambda: [90, 60, 30, 7], min_length=1, max_length=6)
    includeExpired: bool = True

    @field_validator("days")
    @classmethod
    def _v(cls, v: list[int]) -> list[int]:
        if any(d < 1 or d > 365 for d in v):
            raise ValueError("Days must be between 1 and 365")
        return _days(v)


class OnboardingConfig(BaseConfig):
    #: Days after the start date.
    days: list[int] = Field(default_factory=lambda: [1, 3, 7], min_length=1, max_length=6)
    #: From this many days after the start date, HR is reminded too.
    hrAfterDays: int = Field(default=7, ge=1, le=90)

    @field_validator("days")
    @classmethod
    def _v(cls, v: list[int]) -> list[int]:
        if any(d < 1 or d > 90 for d in v):
            raise ValueError("Days must be between 1 and 90")
        return sorted(set(v))


class TimesheetConfig(BaseConfig):
    schedule: Schedule = Field(default_factory=lambda: Schedule(frequency="weekly", weekday=0, time="09:00"))
    olderThanDays: int = Field(default=3, ge=1, le=30)


class LeaveConfig(BaseConfig):
    schedule: Schedule = Field(default_factory=lambda: Schedule(time="09:00"))
    olderThanDays: int = Field(default=2, ge=1, le=30)


class PolicyConfig(BaseConfig):
    schedule: Schedule = Field(default_factory=lambda: Schedule(time="09:00"))
    graceDays: int = Field(default=7, ge=1, le=60)


# ── Shared lookups ──────────────────────────────────────────────────


def hr_people(db: psycopg.Connection, workspace_id: str) -> list[Person]:
    rows = query(
        "SELECT id, name, email FROM employees WHERE workspace_id = $1 AND role = ANY($2) AND status <> 'Exited' ORDER BY name",
        [workspace_id, list(ADMIN)],
        db,
    )
    return [Person(r["id"], r["name"], r["email"]) for r in rows]


def people_with_roles(db: psycopg.Connection, workspace_id: str, roles: list[str]) -> list[Person]:
    rows = query(
        "SELECT id, name, email FROM employees WHERE workspace_id = $1 AND role = ANY($2) AND status <> 'Exited' ORDER BY name",
        [workspace_id, roles],
        db,
    )
    return [Person(r["id"], r["name"], r["email"]) for r in rows]


def _d(value: Any) -> dt.date:
    return value if isinstance(value, dt.date) else dt.date.fromisoformat(str(value)[:10])


def _fmt(value: Any) -> str:
    return _d(value).strftime("%-d %b %Y")


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _hr_copy(r: Reminder, hr: list[Person], exclude: set[str], notice: Notice, mail: Callable[[Person], Mail]) -> None:
    """HR sees one admins-only broadcast in the app and gets an email each."""
    r.notices.append(notice)
    targets = [p for p in hr if p.id not in exclude]
    r.mails.extend(mail(p) for p in targets)
    r.recipients.append("HR team")


# ── Rules ───────────────────────────────────────────────────────────


def plan_probation(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    days: list[int] = cfg["days"]
    rows = query(
        """SELECT e.id, e.name, e.email, e.probation_end, m.id AS manager_id, m.name AS manager_name, m.email AS manager_email
       FROM employees e LEFT JOIN employees m ON m.id = e.manager_id AND m.status <> 'Exited'
      WHERE e.workspace_id = $1 AND e.status <> 'Exited' AND e.probation_end IS NOT NULL
        AND e.probation_end BETWEEN $2::date - 7 AND $2::date + $3::int ORDER BY e.probation_end""",
        [ws["id"], today, max(days)],
        db,
    )
    hr = hr_people(db, ws["id"])
    out: list[Reminder] = []
    for row in rows:
        left = (_d(row["probation_end"]) - today).days
        reached = [d for d in days if left <= d]
        if not reached:
            continue
        milestone = min(reached)
        # Past the appraisal date only the on-the-day reminder may still fire (within a week).
        if left < 0 and milestone != 0:
            continue
        name, end = row["name"], _fmt(row["probation_end"])
        if left > 0:
            title = f"{name}'s probation ends in {_plural(left, 'day')}"
            body = f"Plan the 90-day appraisal before {end} and decide whether to confirm or extend probation."
        elif left == 0:
            title = f"{name}'s probation appraisal is due today"
            body = f"Probation ends today ({end}). Complete the appraisal and confirm or extend probation."
        else:
            title = f"{name}'s probation appraisal is overdue"
            body = f"Probation ended on {end}. Complete the appraisal and confirm or extend probation."
        href = f"/app/people/{row['id']}"
        key = f"{row['id']}:{row['probation_end']}:{milestone}"
        r = Reminder(key, title, [])
        item = f"{name} — probation ends {end}"

        def mail(p: Person, title: str = title, body: str = body, item: str = item, href: str = href) -> Mail:
            return Mail(p.email, p.name, title, "Probation appraisal", body, "Open profile", href, group="Probation appraisals", items=[item])

        if row["manager_id"]:
            r.notices.append(Notice(row["manager_id"], "all", "probation", title, body, href, "Probation appraisals", item))
            r.mails.append(mail(Person(row["manager_id"], row["manager_name"], row["manager_email"])))
            r.recipients.append(row["manager_name"])
        _hr_copy(r, hr, {row["id"], row["manager_id"] or ""}, Notice(None, "admins", "probation", title, body, href, "Probation appraisals", item), mail)
        out.append(r)
    return out


def plan_document_expiry(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    days: list[int] = cfg["days"]
    rows = query(
        """SELECT d.id, d.type, d.number, d.expires, e.id AS employee_id, e.name, e.email
       FROM compliance_documents d JOIN employees e ON e.id = d.employee_id
      WHERE d.workspace_id = $1 AND e.status <> 'Exited' AND d.expires IS NOT NULL AND d.expires <= $2::date + $3::int
      ORDER BY d.expires""",
        [ws["id"], today, max(days)],
        db,
    )
    hr = hr_people(db, ws["id"])
    out: list[Reminder] = []
    for row in rows:
        left = (_d(row["expires"]) - today).days
        if left < 0:
            if not cfg["includeExpired"]:
                continue
            milestone = "expired"
        else:
            milestone = str(min(d for d in days if left <= d))
        doc, when = row["type"], _fmt(row["expires"])
        state = f"expired on {when}" if left < 0 else "expires today" if left == 0 else f"expires in {_plural(left, 'day')} ({when})"
        key = f"{row['id']}:{row['expires']}:{milestone}"
        r = Reminder(key, f"{row['name']}'s {doc} {state}", [])
        mine_title = f"Your {doc} {state}"
        mine_body = "Please renew it and share the updated copy with HR."
        r.notices.append(Notice(row["employee_id"], "all", "document", mine_title, mine_body, "/app/compliance", "Documents to renew", f"{doc} — {state}"))
        r.mails.append(Mail(row["email"], row["name"], mine_title, "Document renewal", f"your {doc} {state}. {mine_body}", "View my documents", "/app/compliance", group="Documents to renew", items=[f"{doc} — {state}"]))
        r.recipients.append(row["name"])
        hr_title = f"{row['name']}'s {doc} {state}"
        item = f"{row['name']} — {doc} {state}"
        _hr_copy(
            r,
            hr,
            {row["employee_id"]},
            Notice(None, "admins", "document", hr_title, "Follow up on the renewal.", "/app/compliance", "Documents expiring", item),
            lambda p, t=hr_title, i=item: Mail(p.email, p.name, t, "Document expiry", f"{t}. Follow up with them on the renewal.", "Open compliance", "/app/compliance", group="Documents expiring", items=[i]),
        )
        out.append(r)
    return out


def plan_onboarding(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    days: list[int] = cfg["days"]
    rows = query(
        """SELECT e.id, e.name, e.email, e.start_date,
            (SELECT count(*) FROM onboarding_tasks t
              WHERE t.workspace_id = e.workspace_id AND t.required
                AND NOT EXISTS (SELECT 1 FROM onboarding_task_completions c WHERE c.employee_id = e.id AND c.task_id = t.id))::int AS open_tasks
       FROM employees e
      WHERE e.workspace_id = $1 AND e.status = 'Onboarding' AND e.start_date <= $2::date - $3::int
      ORDER BY e.start_date""",
        [ws["id"], today, min(days)],
        db,
    )
    hr = hr_people(db, ws["id"])
    out: list[Reminder] = []
    for row in rows:
        if row["open_tasks"] <= 0:
            continue
        since = (today - _d(row["start_date"])).days
        milestone = max(d for d in days if since >= d)
        open_tasks = _plural(row["open_tasks"], "required onboarding task")
        key = f"{row['id']}:day{milestone}"
        r = Reminder(key, f"{row['name']} has {open_tasks} left (day {since})", [])
        title = f"You have {open_tasks} left"
        body = "Finish your onboarding checklist so HR can complete your setup."
        r.notices.append(Notice(row["id"], "all", "system", title, body, "/app/onboarding", "Onboarding"))
        r.mails.append(Mail(row["email"], row["name"], title, "Finish your onboarding", f"you still have {open_tasks} to complete. {body}", "Continue onboarding", "/app/onboarding"))
        r.recipients.append(row["name"])
        if milestone >= cfg["hrAfterDays"]:
            hr_title = f"{row['name']} still has {open_tasks} open"
            item = f"{row['name']} — {open_tasks} open, started {_fmt(row['start_date'])}"
            _hr_copy(
                r,
                hr,
                {row["id"]},
                Notice(None, "admins", "system", hr_title, f"Started {_fmt(row['start_date'])} ({_plural(since, 'day')} ago).", "/app/onboarding?tab=overview", "Onboarding overdue", item),
                lambda p, t=hr_title, i=item: Mail(p.email, p.name, t, "Onboarding overdue", "these new starters haven't finished their required onboarding tasks.", "Open onboarding", "/app/onboarding?tab=overview", group="Onboarding overdue", items=[i]),
            )
        out.append(r)
    return out


def plan_timesheets(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    rows = query(
        """SELECT t.id, t.week_start, e.id AS employee_id, e.name, m.id AS manager_id, m.name AS manager_name, m.email AS manager_email, s.since
       FROM timesheets t JOIN employees e ON e.id = t.employee_id
       LEFT JOIN employees m ON m.id = e.manager_id AND m.status <> 'Exited'
       CROSS JOIN LATERAL (SELECT COALESCE(t.submitted_at,
            (SELECT max(a.created_at) FROM audit_logs a WHERE a.workspace_id = t.workspace_id AND a.entity = 'timesheet' AND a.entity_id = t.id AND a.action = 'timesheet.submitted'),
            (t.week_start + 7)::timestamptz) AS since) s
      WHERE t.workspace_id = $1 AND t.status = 'Pending' AND s.since < ($2::date - $3::int)::timestamptz
      ORDER BY t.week_start""",
        [ws["id"], today, cfg["olderThanDays"]],
        db,
    )
    fallback: list[Person] | None = None
    iso = today.isocalendar()
    out: list[Reminder] = []
    for row in rows:
        waiting = (today - row["since"].date()).days
        week = _fmt(row["week_start"])
        item = f"{row['name']} — week of {week}, waiting {_plural(waiting, 'day')}"
        title = f"{row['name']}'s timesheet is awaiting your approval"
        body = f"Week of {week} · submitted {_plural(waiting, 'day')} ago."
        if row["manager_id"]:
            approvers = [Person(row["manager_id"], row["manager_name"], row["manager_email"])]
        else:
            if fallback is None:
                fallback = people_with_roles(db, ws["id"], [*ADMIN, "finance"])
            approvers = [p for p in fallback if p.id != row["employee_id"]]
        r = Reminder(f"{row['id']}:{iso.year}-W{iso.week:02d}", f"{row['name']}'s timesheet (week of {week}) pending {_plural(waiting, 'day')}", [])
        for p in approvers:
            r.notices.append(Notice(p.id, "all", "approval", title, body, "/app/timesheets", "Timesheets awaiting approval", item))
            r.mails.append(Mail(p.email, p.name, title, "Timesheet approval", f"{row['name']}'s timesheet is waiting for your approval.", "Review timesheets", "/app/timesheets", group="Timesheets awaiting approval", items=[item]))
            r.recipients.append(p.name)
        if approvers:
            out.append(r)
    return out


def plan_leave(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    rows = query(
        """SELECT l.id, l.type, l.days, l.start_date, l.end_date, l.stage, e.id AS employee_id, e.name,
            m.id AS manager_id, m.name AS manager_name, m.email AS manager_email, s.since
       FROM leave_requests l JOIN employees e ON e.id = l.employee_id
       LEFT JOIN employees m ON m.id = e.manager_id AND m.status <> 'Exited'
       CROSS JOIN LATERAL (SELECT GREATEST(l.submitted_at::timestamptz, COALESCE(
            (SELECT max(a.created_at) FROM audit_logs a WHERE a.workspace_id = l.workspace_id AND a.entity = 'leave_request' AND a.entity_id = l.id AND a.action = 'leave.approve'),
            l.submitted_at::timestamptz)) AS since) s
      WHERE l.workspace_id = $1 AND l.status = 'Pending' AND l.stage IN ('Manager', 'HR', 'CEO')
        AND s.since < ($2::date - $3::int)::timestamptz
      ORDER BY s.since""",
        [ws["id"], today, cfg["olderThanDays"]],
        db,
    )
    hr: list[Person] | None = None
    ceos: list[Person] | None = None
    out: list[Reminder] = []
    for row in rows:
        waiting = (today - row["since"].date()).days
        days = row["days"]
        n = int(days) if float(days).is_integer() else days
        what = f"{row['name']}'s {n}-day {str(row['type']).lower()} leave ({_fmt(row['start_date'])} → {_fmt(row['end_date'])})"
        title = f"{row['name']}'s leave request is waiting for you"
        body = f"{what} has waited {_plural(waiting, 'day')} at the {row['stage']} stage."
        item = f"{what} — {_plural(waiting, 'day')} at {row['stage']}"
        r = Reminder(f"{row['id']}:{row['stage']}", f"{what} pending {_plural(waiting, 'day')} at {row['stage']}", [])

        def direct(p: Person, r: Reminder = r, title: str = title, body: str = body, item: str = item) -> None:
            r.notices.append(Notice(p.id, "all", "approval", title, body, "/app/leave", "Leave awaiting approval", item))
            r.mails.append(Mail(p.email, p.name, title, "Leave approval", f"{body}", "Review leave", "/app/leave", group="Leave awaiting approval", items=[item]))
            r.recipients.append(p.name)

        def hr_broadcast(r: Reminder = r, title: str = title, body: str = body, item: str = item, emp: str = row["employee_id"]) -> None:
            nonlocal hr
            if hr is None:
                hr = hr_people(db, ws["id"])
            _hr_copy(
                r,
                hr,
                {emp},
                Notice(None, "admins", "approval", title, body, "/app/leave", "Leave awaiting approval", item),
                lambda p: Mail(p.email, p.name, title, "Leave approval", body, "Review leave", "/app/leave", group="Leave awaiting approval", items=[item]),
            )

        if row["stage"] == "Manager" and row["manager_id"]:
            direct(Person(row["manager_id"], row["manager_name"], row["manager_email"]))
        elif row["stage"] == "CEO":
            if ceos is None:
                ceos = people_with_roles(db, ws["id"], ["ceo"]) or people_with_roles(db, ws["id"], ["super_admin"])
            targets = [p for p in ceos if p.id != row["employee_id"]]
            for p in targets:
                direct(p)
            if not targets:
                hr_broadcast()
        else:
            hr_broadcast()
        out.append(r)
    return out


def plan_policies(db: psycopg.Connection, ws: dict, cfg: dict, today: dt.date) -> list[Reminder]:
    rows = query(
        """SELECT p.id AS policy_id, p.title, p.version, p.updated_on, e.id AS employee_id, e.name, e.email
       FROM policies p JOIN employees e ON e.workspace_id = p.workspace_id AND e.status <> 'Exited'
      WHERE p.workspace_id = $1 AND p.mandatory AND GREATEST(p.updated_on, e.start_date) <= $2::date - $3::int
        AND NOT EXISTS (SELECT 1 FROM policy_acknowledgements a WHERE a.policy_id = p.id AND a.employee_id = e.id AND a.version = p.version)
      ORDER BY e.name, p.title""",
        [ws["id"], today, cfg["graceDays"]],
        db,
    )
    out: list[Reminder] = []
    for row in rows:
        policy = f"{row['title']} {row['version']}"
        title = f"Please acknowledge {policy}"
        body = f"Published {_fmt(row['updated_on'])}. Read it and sign to acknowledge."
        r = Reminder(f"{row['policy_id']}:{row['version']}:{row['employee_id']}", f"{row['name']} hasn't acknowledged {policy}", [row["name"]])
        r.notices.append(Notice(row["employee_id"], "all", "policy", title, body, "/app/onboarding?tab=policies", "Policies to acknowledge", policy))
        r.mails.append(Mail(row["email"], row["name"], title, "Policy acknowledgement", "please read and acknowledge these mandatory company policies.", "Review policies", "/app/onboarding?tab=policies", group="Policies to acknowledge", items=[policy]))
        out.append(r)
    return out


# ── Registry ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Rule:
    key: str
    name: str
    description: str
    audience: str
    model: type[BaseConfig]
    plan: Callable[[psycopg.Connection, dict, dict, dt.date], list[Reminder]]


RULES: dict[str, Rule] = {
    r.key: r
    for r in (
        Rule(
            "probation",
            "Probation appraisals",
            "Reminds the line manager and HR ahead of each probation end date, and on the day the 90-day appraisal is due.",
            "Line manager and HR",
            ProbationConfig,
            plan_probation,
        ),
        Rule(
            "document_expiry",
            "Expiring documents",
            "Warns employees and HR when a passport, work visa, licence or other compliance document is about to expire or has expired.",
            "Employee and HR",
            DocumentExpiryConfig,
            plan_document_expiry,
        ),
        Rule(
            "onboarding_nudges",
            "Onboarding nudges",
            "Nudges new starters who still have required onboarding tasks open a few days after their start date, and alerts HR when they fall behind.",
            "New starter, then HR",
            OnboardingConfig,
            plan_onboarding,
        ),
        Rule(
            "timesheet_approvals",
            "Timesheet approvals",
            "Weekly digest of submitted timesheets still waiting for approval, sent to the consultant's line manager (or HR and finance when there is none).",
            "Line manager, or HR and finance",
            TimesheetConfig,
            plan_timesheets,
        ),
        Rule(
            "leave_approvals",
            "Leave approvals",
            "Chases leave requests that have waited too long at their current stage, sent to whoever must approve next — line manager, HR or the CEO.",
            "Current approver",
            LeaveConfig,
            plan_leave,
        ),
        Rule(
            "policy_acknowledgements",
            "Policy acknowledgements",
            "Reminds employees who haven't acknowledged a mandatory policy some days after a new version is published.",
            "Employee",
            PolicyConfig,
            plan_policies,
        ),
    )
}


def defaults(rule: str) -> dict:
    return RULES[rule].model().model_dump()


def effective_config(rule: str, stored: dict | None) -> dict:
    """Stored overrides on top of the defaults; invalid stored values fall back to defaults."""
    model = RULES[rule].model
    base = model().model_dump()
    merged = {**base, **(stored or {})}
    if isinstance((stored or {}).get("schedule"), dict):
        merged["schedule"] = {**base["schedule"], **stored["schedule"]}  # type: ignore[index]
    try:
        return model.model_validate(merged).model_dump()
    except Exception:  # noqa: BLE001
        return base
