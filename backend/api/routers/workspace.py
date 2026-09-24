"""Workspace lookup, the switcher list and the signed-in bootstrap."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..config import settings
from ..demo import demo_workspace_ids, is_demo_workspace
from ..db import query, query_one
from ..errors import not_found
from ..repository import load_workspace_data, logo_url
from ..security import AuthContext, require_auth

router = APIRouter()

_LIST_SQL = """SELECT id, slug, name, domain, logo_text,
       CASE WHEN logo_data IS NOT NULL THEN extract(epoch FROM logo_updated_at)::bigint END AS logo_version
  FROM workspaces"""


@router.get("/workspaces/lookup/{slug}")
def lookup(slug: str):
    """Public: does a workspace exist at <slug>.annexhr.com? Used by the login form."""
    ws = query_one(
        """SELECT id, slug, name, domain, logo_text, industry, country,
                  CASE WHEN logo_data IS NOT NULL THEN extract(epoch FROM logo_updated_at)::bigint END AS logo_version
             FROM workspaces WHERE slug = $1""",
        [slug.lower()],
    )
    if not ws:
        raise not_found("Workspace")
    return {"slug": ws["slug"], "name": ws["name"], "domain": ws["domain"], "logoText": ws["logo_text"], "industry": ws["industry"], "country": ws["country"], "logoUrl": logo_url(ws["id"], ws["logo_version"])}


@router.get("/workspaces")
def list_workspaces(auth: AuthContext = Depends(require_auth)):
    """Workspaces the current user may switch to. In demo mode that's every workspace."""
    # Demo sessions may hop between the seeded demo workspaces; everyone else only sees their own.
    demo = settings.ENABLE_DEMO_LOGIN and auth.demo and is_demo_workspace(auth.workspaceId)
    rows = (
        query(_LIST_SQL + " WHERE id = ANY($1) ORDER BY created_at", [sorted(demo_workspace_ids())])
        if demo
        else query(_LIST_SQL + " WHERE id = $1", [auth.workspaceId])
    )
    return [{"id": w["id"], "slug": w["slug"], "name": w["name"], "domain": w["domain"], "logoText": w["logo_text"], "logoUrl": logo_url(w["id"], w["logo_version"])} for w in rows]


@router.get("/workspaces/current/bootstrap")
def bootstrap(auth: AuthContext = Depends(require_auth)):
    """Everything the app needs for the signed-in workspace, redacted for the viewer's role."""
    return load_workspace_data(auth)
