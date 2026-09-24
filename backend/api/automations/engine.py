"""Runs automation rules: schedule checks, idempotent delivery and the advisory lock."""

from __future__ import annotations

import datetime as dt
import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from zoneinfo import ZoneInfo

import psycopg

from ..config import settings
from ..db import connection, query
from ..demo import is_demo_workspace
from ..email.service import _providers, send_email
from ..email.templates_automations import reminder as reminder_email
from .rules import RULES, Mail, Notice, Reminder, effective_config

log = logging.getLogger("annex.automations")

TZ = ZoneInfo("Africa/Nairobi")
LOCK_KEY = "annex-hr:automations"


def enabled_in_env() -> bool:
    return os.environ.get("AUTOMATIONS_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")


def now_local() -> dt.datetime:
    return dt.datetime.now(TZ)


# ── Schedule ────────────────────────────────────────────────────────


def _slot(day: dt.date, hhmm: str) -> dt.datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return dt.datetime.combine(day, dt.time(h, m), TZ)


def last_slot(schedule: dict, now: dt.datetime) -> dt.datetime:
    """The most recent scheduled time at or before `now`."""
    day = now.astimezone(TZ).date()
    for back in range(0, 15):
        d = day - dt.timedelta(days=back)
        if schedule["frequency"] == "weekly" and d.weekday() != schedule["weekday"]:
            continue
        slot = _slot(d, schedule["time"])
        if slot <= now:
            return slot
    return _slot(day - dt.timedelta(days=14), schedule["time"])


def next_slot(schedule: dict, after: dt.datetime) -> dt.datetime:
    day = after.astimezone(TZ).date()
    for ahead in range(0, 15):
        d = day + dt.timedelta(days=ahead)
        if schedule["frequency"] == "weekly" and d.weekday() != schedule["weekday"]:
            continue
        slot = _slot(d, schedule["time"])
        if slot > after:
            return slot
    return _slot(day + dt.timedelta(days=7), schedule["time"])


def is_due(schedule: dict, last_run: dt.datetime | None, now: dt.datetime) -> bool:
    return last_run is None or last_run < last_slot(schedule, now)


def next_run(schedule: dict, last_run: dt.datetime | None, now: dt.datetime) -> dt.datetime:
    """When the scheduler will next run the rule (a due rule runs on the next 15-minute tick)."""
    if is_due(schedule, last_run, now):
        return now
    return next_slot(schedule, now)


# ── Settings ────────────────────────────────────────────────────────


def load_settings(db: psycopg.Connection, workspace_id: str) -> dict[str, dict[str, Any]]:
    rows = query("SELECT * FROM automation_settings WHERE workspace_id = $1", [workspace_id], db)
    stored = {r["rule"]: r for r in rows}
    out: dict[str, dict[str, Any]] = {}
    for key in RULES:
        row = stored.get(key)
        out[key] = {
            "enabled": row["enabled"] if row else True,
            "config": effective_config(key, row["config"] if row else None),
            "last_run_at": row["last_run_at"] if row else None,
            "last_run_summary": row["last_run_summary"] if row else None,
            "updated_at": row["updated_at"] if row else None,
            "updated_by": row["updated_by"] if row else None,
        }
    return out


# ── Email guard ─────────────────────────────────────────────────────


def email_block_reason(workspace_id: str, cfg: dict) -> str | None:
    """Why this rule won't email right now (None = emails are sent)."""
    if not cfg.get("email", True):
        return "Email is turned off for this rule"
    if settings.EMAIL_PROVIDER.strip().lower() == "console":
        return "EMAIL_PROVIDER is console — emails are logged, not sent"
    if is_demo_workspace(workspace_id):
        return "Demo workspace — reminders are in-app only"
    if not _providers():
        return "No email provider is configured"
    return None


# ── Delivery ────────────────────────────────────────────────────────


def _merge_notices(reminders: list[Reminder]) -> list[Notice]:
    groups: dict[tuple, list[Notice]] = {}
    order: list[tuple] = []
    for r in reminders:
        for n in r.notices:
            k = (n.recipient_id, n.audience, n.group or id(n))
            if k not in groups:
                groups[k] = []
                order.append(k)
            groups[k].append(n)
    out: list[Notice] = []
    for k in order:
        items = groups[k]
        if len(items) == 1:
            out.append(items[0])
            continue
        first = items[0]
        shown = [n.item or n.title for n in items[:3]]
        more = f" and {len(items) - 3} more" if len(items) > 3 else ""
        out.append(Notice(first.recipient_id, first.audience, first.type, f"{first.group}: {len(items)}", "; ".join(shown) + more, first.href, first.group))
    return out


def _merge_mails(reminders: list[Reminder]) -> list[Mail]:
    groups: dict[tuple, list[Mail]] = {}
    order: list[tuple] = []
    for r in reminders:
        for m in r.mails:
            k = (m.to.lower(), m.group or id(m))
            if k not in groups:
                groups[k] = []
                order.append(k)
            groups[k].append(m)
    out: list[Mail] = []
    for k in order:
        mails = groups[k]
        if len(mails) == 1:
            out.append(mails[0])
            continue
        first = mails[0]
        items = [i for m in mails for i in m.items]
        out.append(Mail(first.to, first.name, f"{first.group}: {len(items)} need your attention", first.group, f"{len(items)} items need your attention.", first.cta, first.href, first.group, items))
    return out


def execute(db: psycopg.Connection, ws: dict, rule: str, *, cfg: dict, dry_run: bool, today: dt.date | None = None, trigger: str = "schedule") -> dict[str, Any]:
    """Plans a rule for one workspace and (unless dry_run) delivers the reminders not yet sent."""
    today = today or now_local().date()
    planned = RULES[rule].plan(db, ws, cfg, today)
    keys = [r.subject_key for r in planned]
    done = {r["subject_key"] for r in query("SELECT subject_key FROM automation_log WHERE workspace_id = $1 AND rule = $2 AND subject_key = ANY($3)", [ws["id"], rule, keys], db)} if keys else set()
    fresh = [r for r in planned if r.subject_key not in done]
    block = email_block_reason(ws["id"], cfg)

    notices = _merge_notices(fresh)
    mails = _merge_mails(fresh)
    result: dict[str, Any] = {
        "rule": rule,
        "workspace": ws["slug"],
        "dryRun": dry_run,
        "matched": len(planned),
        "alreadySent": len(planned) - len(fresh),
        "reminders": [{"subjectKey": r.subject_key, "summary": r.summary, "recipients": r.recipients} for r in fresh],
        "notifications": len(notices),
        "emails": [{"to": m.to, "name": m.name, "subject": m.subject} for m in mails],
        "emailsSent": 0,
        "emailSkipped": block,
    }
    if dry_run:
        return result

    summary = {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "trigger": trigger, "reminders": len(fresh), "notifications": len(notices), "emails": 0 if block else len(mails), "emailSkipped": block}
    with db.transaction():
        if fresh:
            inserted = {
                r["subject_key"]
                for r in query(
                    """INSERT INTO automation_log (workspace_id, rule, subject_key, summary, recipients, emails_sent)
                   SELECT $1, $2, x.k, x.s, string_to_array(x.r, '|'), x.e FROM unnest($3::text[], $4::text[], $5::text[], $6::smallint[]) AS x(k, s, r, e)
                   ON CONFLICT (workspace_id, rule, subject_key) DO NOTHING RETURNING subject_key""",
                    [ws["id"], rule, [r.subject_key for r in fresh], [r.summary for r in fresh], ["|".join(r.recipients) for r in fresh], [0 if block else len(r.mails) for r in fresh]],
                    db,
                )
            }
            if len(inserted) != len(fresh):
                # Another run delivered some of these meanwhile — deliver only ours.
                fresh = [r for r in fresh if r.subject_key in inserted]
                notices, mails = _merge_notices(fresh), _merge_mails(fresh)
            for n in notices:
                query(
                    "INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href, audience) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                    [ws["id"], n.recipient_id, n.type, n.title[:200], n.body[:1000], n.href, n.audience],
                    db,
                )
        query(
            """INSERT INTO automation_settings (workspace_id, rule, last_run_at, last_run_summary) VALUES ($1, $2, now(), $3)
         ON CONFLICT (workspace_id, rule) DO UPDATE SET last_run_at = now(), last_run_summary = EXCLUDED.last_run_summary""",
            [ws["id"], rule, summary],
            db,
        )

    sent = 0
    for m in mails:
        if block:
            log.info("[automations] %s/%s: email to %s NOT sent (%s) — %s", ws["slug"], rule, m.to, block, m.subject)
            continue
        email = reminder_email(m.to, m.name, m.subject, m.heading, m.intro, m.items, m.cta, m.href, ws["name"])
        if send_email(email, required=False) not in ("failed", "console"):
            sent += 1
    result["emailsSent"] = sent
    result["notifications"] = len(notices)
    result["reminders"] = [{"subjectKey": r.subject_key, "summary": r.summary, "recipients": r.recipients} for r in fresh]
    log.info(
        "[automations] %s/%s (%s): %d reminder(s), %d notification(s), %d email(s) sent%s",
        ws["slug"], rule, trigger, len(fresh), len(notices), sent, f" — emails skipped: {block}" if block and mails else "",
    )
    for r in fresh:
        log.info("[automations]   %s → %s", r.summary, ", ".join(r.recipients) or "nobody")
    return result


# ── Advisory lock ───────────────────────────────────────────────────


@contextmanager
def advisory_lock(db: psycopg.Connection) -> Iterator[bool]:
    """Session-level lock so only one API instance runs automations at a time."""
    got = bool(query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK_KEY], db)[0]["ok"])
    try:
        yield got
    finally:
        if got:
            query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY], db)


# ── Scheduled pass ──────────────────────────────────────────────────


def run_pass(*, workspace: str | None = None, rule: str | None = None, dry_run: bool = False, force: bool = False, trigger: str = "schedule") -> list[dict[str, Any]]:
    """One scheduler pass over every workspace (or one) on a single connection.

    `force` ignores the schedule (runs every enabled rule now). Disabled rules never run here.
    """
    results: list[dict[str, Any]] = []
    with connection() as db:
        with advisory_lock(db) as got:
            if not got:
                log.info("[automations] another instance is running automations — skipping this pass")
                return results
            wss = query(
                "SELECT id, slug, name FROM workspaces WHERE ($1::text IS NULL OR id = $1 OR slug = $1) ORDER BY created_at",
                [workspace],
                db,
            )
            now = now_local()
            for ws in wss:
                for key, s in load_settings(db, ws["id"]).items():
                    if rule and key != rule:
                        continue
                    if not s["enabled"]:
                        continue
                    if not force and not is_due(s["config"]["schedule"], s["last_run_at"], now):
                        continue
                    try:
                        results.append(execute(db, ws, key, cfg=s["config"], dry_run=dry_run, trigger=trigger))
                    except Exception:  # noqa: BLE001 — one failing rule must not stop the others
                        log.exception("[automations] %s/%s failed", ws["slug"], key)
    return results
