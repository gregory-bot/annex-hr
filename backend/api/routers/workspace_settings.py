"""Company profile settings: details, brand colours, offices, logo and custom domain."""

from __future__ import annotations

import hashlib
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Body, Depends, File, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from ..audit import audit
from ..config import settings
from ..db import query, query_one, tx
from ..errors import HttpError, bad_request, conflict, not_found, parse
from ..repository import get_workspace
from ..roles import ADMIN
from ..security import AuthContext, require_role

router = APIRouter()

MAX_LOGO_BYTES = 2 * 1024 * 1024
HEX = r"^#[0-9A-Fa-f]{6}$"
_LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
#: Scriptable SVG content — rejected outright rather than sanitised.
_SVG_UNSAFE = re.compile(rb"<script|<foreignobject|javascript:|\bon[a-z]+\s*=|<!entity", re.I)


def _target() -> str:
    return settings.CUSTOM_DOMAIN_TARGET.strip().rstrip(".").lower()


def _platform_domain() -> str:
    """Registrable part of the CNAME target (e.g. annexhr.com) — customers can't claim hosts under it."""
    return ".".join(_target().split(".")[-2:])


def normalise_hostname(value: str) -> str:
    host = value.strip().lower()
    host = re.sub(r"^[a-z]+://", "", host).split("/", 1)[0].rstrip(".")
    labels = host.split(".")
    if len(host) > 253 or len(labels) < 2 or not all(_LABEL.match(label) for label in labels) or not re.fullmatch(r"[a-z]{2,63}", labels[-1]):
        raise ValueError("Enter a valid domain, e.g. hr.company.com")
    platform = _platform_domain()
    if host == platform or host.endswith("." + platform):
        raise ValueError(f"Use a domain your company owns, not one under {platform}")
    return host


class WorkspacePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    industry: Optional[str] = Field(default=None, min_length=2, max_length=80)
    country: Optional[str] = Field(default=None, min_length=2, max_length=60)
    size: Optional[str] = Field(default=None, min_length=1, max_length=20)
    brandPrimary: Optional[str] = Field(default=None, pattern=HEX)
    brandSecondary: Optional[str] = Field(default=None, pattern=HEX)
    customDomain: Optional[str] = Field(default=None, max_length=253)

    @field_validator("name", "industry", "country", "size", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class Office(BaseModel):
    city: str = Field(min_length=1, max_length=80)
    country: str = Field(min_length=1, max_length=60)
    address: str = Field(min_length=1, max_length=200)
    headcount: int = Field(default=0, ge=0, le=1_000_000)

    @field_validator("city", "country", "address", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v


class OfficeList(BaseModel):
    offices: list[Office] = Field(max_length=50)


def _payload(workspace_id: str, db=None) -> dict[str, Any]:
    ws = get_workspace(workspace_id, db)
    if not ws:
        raise not_found("Workspace")
    return {**ws, "customDomainTarget": _target()}


@router.get("/workspaces/current/settings")
def current_settings(auth: AuthContext = Depends(require_role(*ADMIN))):
    return _payload(auth.workspaceId)


@router.patch("/workspaces/current")
def update_workspace(request: Request, body: dict = Body(default={}), auth: AuthContext = Depends(require_role(*ADMIN))):
    data = parse(WorkspacePatch, body)
    fields = data.model_dump(exclude_unset=True)
    cols = {"name": "name", "industry": "industry", "country": "country", "size": "size", "brandPrimary": "brand_primary", "brandSecondary": "brand_secondary"}
    sets: list[str] = []
    params: list[Any] = [auth.workspaceId]
    for key, col in cols.items():
        if fields.get(key) is not None:
            params.append(fields[key].upper() if key.startswith("brand") else fields[key])
            sets.append(f"{col} = ${len(params)}")
    with tx() as db:
        if "customDomain" in fields:
            try:
                domain = normalise_hostname(fields["customDomain"]) if (fields["customDomain"] or "").strip() else None
            except ValueError as exc:
                raise bad_request(str(exc), [{"path": "customDomain", "message": str(exc)}]) from exc
            current = query_one("SELECT custom_domain FROM workspaces WHERE id = $1", [auth.workspaceId], db)
            if current and current["custom_domain"] != domain:
                if domain and query_one("SELECT 1 FROM workspaces WHERE custom_domain = $1 AND id <> $2", [domain, auth.workspaceId], db):
                    raise conflict("That domain is already connected to another workspace")
                params.append(domain)
                # A new domain has to prove its DNS again.
                sets += [f"custom_domain = ${len(params)}", "custom_domain_verified_at = NULL"]
        if sets:
            query(f"UPDATE workspaces SET {', '.join(sets)}, updated_at = now() WHERE id = $1", params, db)
            audit(request, auth, "workspace.updated", "workspace", auth.workspaceId, {"fields": sorted(fields)}, db)
        return _payload(auth.workspaceId, db)


@router.put("/workspaces/current/offices")
def replace_offices(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_role(*ADMIN))):
    data = parse(OfficeList, {"offices": body} if isinstance(body, list) else (body or {}))
    with tx() as db:
        query("DELETE FROM offices WHERE workspace_id = $1", [auth.workspaceId], db)
        for o in data.offices:
            query(
                "INSERT INTO offices (workspace_id, city, country, address, headcount) VALUES ($1, $2, $3, $4, $5)",
                [auth.workspaceId, o.city, o.country, o.address, o.headcount],
                db,
            )
        query("UPDATE workspaces SET updated_at = now() WHERE id = $1", [auth.workspaceId], db)
        audit(request, auth, "workspace.offices_updated", "workspace", auth.workspaceId, {"count": len(data.offices)}, db)
        return _payload(auth.workspaceId, db)


def _sniff(data: bytes) -> str | None:
    """Content type from the bytes themselves — never the client-supplied one."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    head = data[:1024].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    if (head.startswith(b"<?xml") or head.startswith(b"<svg") or head.startswith(b"<!--")) and b"<svg" in data[:4096].lower():
        return "image/svg+xml"
    return None


@router.post("/workspaces/current/logo")
def upload_logo(request: Request, file: UploadFile = File(...), auth: AuthContext = Depends(require_role(*ADMIN))):
    data = file.file.read(MAX_LOGO_BYTES + 1)
    if not data:
        raise bad_request("The file is empty")
    if len(data) > MAX_LOGO_BYTES:
        raise HttpError(413, "Logo is larger than 2 MB")
    content_type = _sniff(data)
    if not content_type:
        raise bad_request("Upload a PNG, JPG, WEBP or SVG image")
    if content_type == "image/svg+xml":
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise bad_request("The SVG isn't valid UTF-8 text") from exc
        if _SVG_UNSAFE.search(data):
            raise bad_request("SVG logos can't contain scripts or event handlers")
    with tx() as db:
        query(
            "UPDATE workspaces SET logo_data = $2, logo_content_type = $3, logo_updated_at = now(), updated_at = now() WHERE id = $1",
            [auth.workspaceId, data, content_type],
            db,
        )
        audit(request, auth, "workspace.logo_uploaded", "workspace", auth.workspaceId, {"contentType": content_type, "size": len(data)}, db)
        return _payload(auth.workspaceId, db)


@router.delete("/workspaces/current/logo")
def delete_logo(request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    with tx() as db:
        query("UPDATE workspaces SET logo_data = NULL, logo_content_type = NULL, logo_updated_at = NULL, updated_at = now() WHERE id = $1", [auth.workspaceId], db)
        audit(request, auth, "workspace.logo_removed", "workspace", auth.workspaceId, None, db)
        return _payload(auth.workspaceId, db)


@router.get("/workspaces/{workspace_id}/logo")
def get_logo(workspace_id: str, request: Request):
    """Public (the login page shows it before anyone signs in); logos are brand assets, not private data."""
    row = query_one("SELECT logo_data, logo_content_type FROM workspaces WHERE id = $1 AND logo_data IS NOT NULL", [workspace_id])
    if not row:
        raise not_found("Logo")
    data = bytes(row["logo_data"])
    etag = '"' + hashlib.sha256(data).hexdigest()[:32] + '"'
    headers = {
        "Cache-Control": "public, max-age=86400",
        "ETag": etag,
        "X-Content-Type-Options": "nosniff",
        # Opened directly, an SVG still can't run anything.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    }
    if etag in request.headers.get("if-none-match", ""):
        return Response(status_code=304, headers=headers)
    return Response(content=data, media_type=row["logo_content_type"], headers=headers)


def _lookup_cname(host: str) -> list[str]:
    try:
        res = httpx.get("https://dns.google/resolve", params={"name": host, "type": "CNAME"}, timeout=6.0, headers={"Accept": "application/dns-json"})
        res.raise_for_status()
        body = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HttpError(502, "Couldn't reach the DNS resolver — try again in a minute") from exc
    # Type 5 = CNAME. Status 3 (NXDOMAIN) simply has no answers.
    return [str(a.get("data", "")).rstrip(".").lower() for a in body.get("Answer") or [] if a.get("type") == 5]


@router.post("/workspaces/current/domain/verify")
def verify_domain(request: Request, auth: AuthContext = Depends(require_role(*ADMIN))):
    row = query_one("SELECT custom_domain FROM workspaces WHERE id = $1", [auth.workspaceId])
    domain = row["custom_domain"] if row else None
    if not domain:
        raise bad_request("Save a custom domain first")
    target = _target()
    # The DNS call runs without holding a database connection.
    found = _lookup_cname(domain)
    verified = target in found
    with tx() as db:
        query(
            "UPDATE workspaces SET custom_domain_verified_at = CASE WHEN $2 THEN COALESCE(custom_domain_verified_at, now()) END WHERE id = $1 AND custom_domain = $3",
            [auth.workspaceId, verified, domain],
            db,
        )
        audit(request, auth, "workspace.domain_checked", "workspace", auth.workspaceId, {"domain": domain, "verified": verified, "found": found}, db)
    return {"verified": verified, "domain": domain, "target": target, "found": found, "customDomainTarget": target}
