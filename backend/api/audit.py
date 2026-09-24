"""Audit log writer. Never raises — auditing must not break the request."""

from __future__ import annotations

import json
import logging
from typing import Any

import psycopg
from fastapi import Request

from .db import query
from .security import AuthContext, client_ip

log = logging.getLogger("annex.audit")


def audit(
    request: Request | None,
    auth: AuthContext | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    details: dict[str, Any] | None = None,
    db: psycopg.Connection | None = None,
) -> None:
    try:
        query(
            "INSERT INTO audit_logs (workspace_id, user_id, action, entity, entity_id, ip_address, details) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [
                auth.workspaceId if auth else None,
                auth.userId if auth else None,
                action,
                entity,
                entity_id,
                client_ip(request) if request else None,
                json.dumps(details or {}),
            ],
            db,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("audit log failed: %s", exc)
