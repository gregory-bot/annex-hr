"""Automations (scheduled reminders & alerts) — HR admin settings, activity and run-now."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict

from ..audit import audit
from ..automations.engine import advisory_lock, email_block_reason, enabled_in_env, execute, load_settings, next_run, now_local
from ..automations.rules import RULES, defaults
from ..db import connection, iso, query, query_one
from ..errors import HttpError, not_found, parse
from ..roles import ADMIN
from ..security import AuthContext, require_role

router = APIRouter()


def _iso(v: Any) -> str | None:
    return iso(v) or None


def _rule(key: str) -> None:
    if key not in RULES:
        raise not_found("Automation")


def _log_entry(r: dict) -> dict:
    return {"id": str(r["id"]), "rule": r["rule"], "subjectKey": r["subject_key"], "summary": r["summary"], "recipients": list(r["recipients"] or []), "emails": r["emails_sent"], "sentAt": _iso(r["sent_at"])}


def _view(db: Any, workspace_id: str) -> dict:
    stored = load_settings(db, workspace_id)
    now = now_local()
    logs = query(
        """SELECT * FROM (SELECT l.*, row_number() OVER (PARTITION BY rule ORDER BY sent_at DESC, id DESC) AS rn
         FROM automation_log l WHERE workspace_id = $1) x WHERE rn <= 20 ORDER BY sent_at DESC, id DESC""",
        [workspace_id],
        db,
    )
    counts = {r["rule"]: r["n"] for r in query("SELECT rule, count(*)::int AS n FROM automation_log WHERE workspace_id = $1 GROUP BY rule", [workspace_id], db)}
    scheduler = enabled_in_env()
    rules = []
    for key, rule in RULES.items():
        s = stored[key]
        rules.append(
            {
                "key": key,
                "name": rule.name,
                "description": rule.description,
                "audience": rule.audience,
                "enabled": s["enabled"],
                "config": s["config"],
                "defaults": defaults(key),
                "lastRunAt": _iso(s["last_run_at"]),
                "lastRunSummary": s["last_run_summary"],
                "nextRunAt": _iso(next_run(s["config"]["schedule"], s["last_run_at"], now)) if s["enabled"] else None,
                "updatedAt": _iso(s["updated_at"]),
                "emailSkipped": email_block_reason(workspace_id, s["config"]),
                "totalSent": counts.get(key, 0),
                "recent": [_log_entry(r) for r in logs if r["rule"] == key],
            }
        )
    return {"schedulerRunning": scheduler, "timezone": "Africa/Nairobi", "rules": rules, "activity": [_log_entry(r) for r in logs[:20]]}


@router.get("/automations")
def list_automations(auth: AuthContext = Depends(require_role(*ADMIN))):
    with connection() as db:
        return _view(db, auth.workspaceId)


class UpdateIn(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    enabled: Optional[bool] = None
    config: Optional[dict[str, Any]] = None


@router.put("/automations/{rule}")
def update_automation(rule: str, request: Request, body: Any = Body(default={}), auth: AuthContext = Depends(require_role(*ADMIN))):
    _rule(rule)
    b = parse(UpdateIn, body)
    with connection() as db:
        current = load_settings(db, auth.workspaceId)[rule]
        config = current["config"]
        if b.config is not None:
            merged = {**config, **b.config}
            if isinstance(b.config.get("schedule"), dict):
                merged["schedule"] = {**config["schedule"], **b.config["schedule"]}
            config = parse(RULES[rule].model, merged).model_dump()
        enabled = current["enabled"] if b.enabled is None else b.enabled
        query(
            """INSERT INTO automation_settings (workspace_id, rule, enabled, config, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (workspace_id, rule) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = now()""",
            [auth.workspaceId, rule, enabled, config, auth.employeeId],
            db,
        )
        audit(request, auth, "automation.updated", "automation", rule, {"enabled": enabled, "config": config}, db)
        view = _view(db, auth.workspaceId)
    return next(r for r in view["rules"] if r["key"] == rule)


class RunIn(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    dryRun: bool = False


@router.post("/automations/{rule}/run")
def run_automation(rule: str, request: Request, body: Any = Body(default={}), auth: AuthContext = Depends(require_role(*ADMIN))):
    _rule(rule)
    b = parse(RunIn, body or {})
    with connection() as db:
        ws = query_one("SELECT id, slug, name FROM workspaces WHERE id = $1", [auth.workspaceId], db)
        cfg = load_settings(db, auth.workspaceId)[rule]["config"]
        if b.dryRun:
            return execute(db, ws, rule, cfg=cfg, dry_run=True, trigger="manual")  # type: ignore[arg-type]
        with advisory_lock(db) as got:
            if not got:
                raise HttpError(409, "Automations are running right now. Try again in a minute.")
            result = execute(db, ws, rule, cfg=cfg, dry_run=False, trigger="manual")  # type: ignore[arg-type]
        audit(request, auth, "automation.run", "automation", rule, {"reminders": len(result["reminders"]), "emails": result["emailsSent"]}, db)
    return result
