"""Workspace lookup, the switcher list and the signed-in bootstrap."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..config import settings
from ..db import query, query_one
from ..errors import not_found
from ..repository import load_workspace_data
from ..security import AuthContext, require_auth

router = APIRouter()


@router.get("/workspaces/lookup/{slug}")
def lookup(slug: str):
    """Public: does a workspace exist at <slug>.annexhr.com? Used by the login form."""
    ws = query_one("SELECT slug, name, domain, logo_text, industry, country FROM workspaces WHERE slug = $1", [slug.lower()])
    if not ws:
        raise not_found("Workspace")
    return {"slug": ws["slug"], "name": ws["name"], "domain": ws["domain"], "logoText": ws["logo_text"], "industry": ws["industry"], "country": ws["country"]}


@router.get("/workspaces")
def list_workspaces(auth: AuthContext = Depends(require_auth)):
    """Workspaces the current user may switch to. In demo mode that's every workspace."""
    rows = (
        query("SELECT id, slug, name, domain, logo_text FROM workspaces ORDER BY created_at")
        if settings.ENABLE_DEMO_LOGIN
        else query("SELECT id, slug, name, domain, logo_text FROM workspaces WHERE id = $1", [auth.workspaceId])
    )
    return [{"id": w["id"], "slug": w["slug"], "name": w["name"], "domain": w["domain"], "logoText": w["logo_text"]} for w in rows]


@router.get("/workspaces/current/bootstrap")
def bootstrap(auth: AuthContext = Depends(require_auth)):
    """Everything the app needs for the signed-in workspace, redacted for the viewer's role."""
    return load_workspace_data(auth)
