"""Demo workspaces: the seeded tenants that one-click demo sign-in and "View as" may use."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .config import settings
from .errors import forbidden
from .security import AuthContext

_DATA = Path(__file__).resolve().parent.parent / "db" / "demo-data.json"


@lru_cache
def demo_workspace_ids() -> frozenset[str]:
    try:
        return frozenset(json.loads(_DATA.read_text(encoding="utf-8"))["workspaces"].keys())
    except (OSError, KeyError, ValueError):
        return frozenset()


def is_demo_workspace(workspace_id: str) -> bool:
    return workspace_id in demo_workspace_ids()


def require_demo_session(auth: AuthContext, target_workspace: str | None = None) -> None:
    """Role/workspace switching is only for demo sessions inside the seeded demo workspaces.

    Real sign-ins — including real companies and invited employees — can never switch role
    or reach another tenant, whatever ENABLE_DEMO_LOGIN says.
    """
    if not settings.ENABLE_DEMO_LOGIN:
        raise forbidden("Demo sign-in is disabled")
    if not auth.demo or not is_demo_workspace(auth.workspaceId):
        raise forbidden("Switching roles is only available in demo workspaces")
    if target_workspace is not None and not is_demo_workspace(target_workspace):
        raise forbidden("You can only switch between demo workspaces")
