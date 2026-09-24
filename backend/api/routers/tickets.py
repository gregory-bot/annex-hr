"""Linear-style tickets: teams, per-team identifiers, comments and assignee notifications."""

import datetime as dt
import re
from typing import Annotated, Any, Literal
from urllib.parse import quote

import psycopg
from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, RootModel, StringConstraints
from pydantic_core import PydanticCustomError

from ..audit import audit
from ..db import build_update, iso, query, query_one, tx
from ..errors import bad_request, forbidden, not_found, parse
from ..repository import TICKET_SELECT, to_ticket
from ..roles import is_exec, is_leader
from ..security import AuthContext, require_auth

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"
Status = Literal["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"]
Priority = Literal["Urgent", "High", "Medium", "Low", "None"]

Label = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=32)]
Labels = Annotated[list[Label], Field(max_length=10), AfterValidator(lambda l: list(dict.fromkeys(l)))]


def trimmed(min_len: int, max_len: int, too_short: str):
    """A trimmed string whose minimum-length failure carries a friendly message."""

    def check(v: str) -> str:
        v = v.strip()
        if len(v) < min_len:
            raise PydanticCustomError("too_small", too_short)
        if len(v) > max_len:
            raise PydanticCustomError("too_big", f"String must contain at most {max_len} character(s)")
        return v

    return Annotated[str, AfterValidator(check)]


def scope(me: AuthContext) -> list[Any]:
    """Params for TICKET_SELECT: workspace, viewer, and whether the viewer may see private (HR) tickets."""
    return [me.workspaceId, me.employeeId, is_exec(me.role)]


def load_ticket(db: psycopg.Connection, me: AuthContext, ticket_id: str, lock: bool = False) -> dict[str, Any]:
    if lock:
        query("SELECT 1 FROM tickets WHERE id = $1 AND workspace_id = $2 FOR UPDATE", [ticket_id, me.workspaceId], db)
    row = query_one(f"{TICKET_SELECT} AND t.id = $4", [*scope(me), ticket_id], db)
    if not row:
        raise not_found("Ticket")
    return row


def lock_team(db: psycopg.Connection, workspace_id: str, team_id: str) -> tuple[dict[str, Any], int]:
    team = query_one("SELECT id, key, name FROM ticket_teams WHERE id = $1 AND workspace_id = $2 FOR UPDATE", [team_id, workspace_id], db)
    if not team:
        raise bad_request("Unknown team")
    # Holding the team row lock serialises number allocation for this team.
    seq = query_one("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM tickets WHERE team_id = $1", [team_id], db)
    return team, int(seq["next"])


def assert_employee(db: psycopg.Connection, workspace_id: str, employee_id: str) -> None:
    if not query("SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2 AND status <> 'Exited'", [employee_id, workspace_id], db):
        raise bad_request("Assignee must be an active member of this workspace")


def ticket_href(ticket_id: str) -> str:
    return f"/app/tickets?id={quote(ticket_id, safe="-_.!~*'()")}"


def notify_assignee(db: psycopg.Connection, me: AuthContext, assignee_id: str, ticket: dict[str, str]) -> None:
    if assignee_id == me.employeeId:
        return
    query(
        """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
     SELECT $1, $2, 'system', $3, e.name || ' assigned this ticket to you.', $4 FROM employees e WHERE e.id = $5""",
        [me.workspaceId, assignee_id, f"{ticket['identifier']} · {ticket['title']}", ticket_href(ticket["id"]), me.employeeId],
        db,
    )


# ── List & read ─────────────────────────────────────────────────────
class ListFilters(BaseModel):
    team: Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)] | None = None
    status: str | None = None
    assignee: Literal["me"] | None = None
    reporter: Literal["me"] | None = None
    q: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class StatusList(RootModel[list[Status]]):
    pass


@router.get("/tickets")
def list_tickets(request: Request, auth: AuthContext = Depends(require_auth)):
    f = parse(ListFilters, dict(request.query_params))
    statuses = parse(StatusList, f.status.split(",")).root if f.status else None
    params: list[Any] = scope(auth)
    where: list[str] = []
    if f.team:
        params.append(f.team)
        where.append(f"(t.team_id = ${len(params)} OR tm.key = upper(${len(params)}))")
    if statuses:
        params.append(statuses)
        where.append(f"t.status = ANY (${len(params)}::text[])")
    if f.assignee:
        where.append("t.assignee_id = $2")
    if f.reporter:
        where.append("t.reporter_id = $2")
    if f.q:
        params.append("%" + re.sub(r"[\\%_]", lambda m: "\\" + m.group(0), f.q) + "%")
        n = len(params)
        where.append(f"(t.title ILIKE ${n} OR t.identifier ILIKE ${n} OR t.description ILIKE ${n})")
    rows = query(f"{TICKET_SELECT}{''.join(f' AND {w}' for w in where)} ORDER BY t.updated_at DESC LIMIT 500", params)
    return [to_ticket(r) for r in rows]


@router.get("/tickets/{id}")
def get_ticket(id: str, auth: AuthContext = Depends(require_auth)):
    row = query_one(f"{TICKET_SELECT} AND (t.id = $4 OR t.identifier = upper($4))", [*scope(auth), id])
    if not row:
        raise not_found("Ticket")
    return to_ticket(row)


# ── Create ──────────────────────────────────────────────────────────
class CreateBody(BaseModel):
    model_config = ConfigDict(strict=True)
    teamId: Annotated[str, Field(min_length=1)]
    title: trimmed(3, 200, "Give the ticket a short title")
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10_000)] = ""
    status: Status = "Todo"
    priority: Priority = "None"
    assigneeId: Annotated[str, Field(min_length=1)] | None = None
    labels: Labels = []
    dueDate: Annotated[str, Field(pattern=ISO_DATE)] | None = None


@router.post("/tickets")
def create_ticket(request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(CreateBody, body)
    with tx() as db:
        team, number = lock_team(db, auth.workspaceId, b.teamId)
        if b.assigneeId:
            assert_employee(db, auth.workspaceId, b.assigneeId)
        identifier = f"{team['key']}-{number}"
        row = query_one(
            """INSERT INTO tickets (workspace_id, team_id, number, identifier, title, description, status, priority, reporter_id, assignee_id, labels, due_date, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12, CASE WHEN $7 = 'Done' THEN now() END) RETURNING id""",
            [auth.workspaceId, team["id"], number, identifier, b.title, b.description, b.status, b.priority, auth.employeeId, b.assigneeId, b.labels, b.dueDate],
            db,
        )
        ticket_id = row["id"]
        if b.assigneeId:
            notify_assignee(db, auth, b.assigneeId, {"id": ticket_id, "identifier": identifier, "title": b.title})
        audit(request, auth, "ticket.created", "ticket", ticket_id, {"identifier": identifier, "team": team["key"], "priority": b.priority}, db)
        ticket = to_ticket(load_ticket(db, auth, ticket_id))
    return JSONResponse(ticket, status_code=201)


# ── Update ──────────────────────────────────────────────────────────
# Every field is optional; only assigneeId and dueDate may be null (zod `.partial().strict()`).
class PatchBody(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    title: trimmed(3, 200, "String must contain at least 3 character(s)") = None  # type: ignore[assignment]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10_000)] = None  # type: ignore[assignment]
    status: Status = None  # type: ignore[assignment]
    priority: Priority = None  # type: ignore[assignment]
    assigneeId: Annotated[str, Field(min_length=1)] | None = None
    labels: Labels = None  # type: ignore[assignment]
    dueDate: Annotated[str, Field(pattern=ISO_DATE)] | None = None
    teamId: Annotated[str, Field(min_length=1)] = None  # type: ignore[assignment]


@router.patch("/tickets/{id}")
def patch_ticket(id: str, request: Request, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    b = parse(PatchBody, body)
    given = b.model_dump(exclude_unset=True)
    if not given:
        raise bad_request("Nothing to update")

    with tx() as db:
        cur = load_ticket(db, auth, id, lock=True)
        involved = cur["reporter_id"] == auth.employeeId or cur["assignee_id"] == auth.employeeId
        # Anyone may pick up an unassigned ticket for themselves (Linear's "assign to me").
        self_assign_only = len(given) == 1 and given.get("assigneeId") == auth.employeeId and not cur["assignee_id"]
        if not involved and not is_leader(auth.role) and not self_assign_only:
            raise forbidden("Only the reporter, the assignee, managers and HR can edit this ticket")

        if given.get("assigneeId"):
            assert_employee(db, auth.workspaceId, given["assigneeId"])

        patch: dict[str, Any] = dict(given)
        identifier = cur["identifier"]
        moved = bool(given.get("teamId")) and given["teamId"] != cur["team_id"]
        if moved:
            team, number = lock_team(db, auth.workspaceId, given["teamId"])
            identifier = f"{team['key']}-{number}"
            patch.update(number=number, identifier=identifier)
        else:
            patch.pop("teamId", None)
        status_changed = bool(given.get("status")) and given["status"] != cur["status"]
        if status_changed:
            patch["completedAt"] = dt.datetime.now(dt.timezone.utc) if given["status"] == "Done" else None

        upd = build_update(patch, ["title", "description", "status", "priority", "assignee_id", "labels", "due_date", "team_id", "number", "identifier", "completed_at"], 3)
        if upd:
            set_sql, set_params = upd
            query(f"UPDATE tickets SET {set_sql}, updated_at = now() WHERE id = $1 AND workspace_id = $2", [cur["id"], auth.workspaceId, *set_params], db)

        if status_changed:
            audit(request, auth, "ticket.status_changed", "ticket", cur["id"], {"identifier": identifier, "from": cur["status"], "to": given["status"]}, db)
        if moved:
            audit(request, auth, "ticket.moved", "ticket", cur["id"], {"from": cur["identifier"], "to": identifier}, db)
        if given.get("assigneeId") and given["assigneeId"] != cur["assignee_id"]:
            notify_assignee(db, auth, given["assigneeId"], {"id": cur["id"], "identifier": identifier, "title": given.get("title") or cur["title"]})
            audit(request, auth, "ticket.assigned", "ticket", cur["id"], {"identifier": identifier, "assigneeId": given["assigneeId"]}, db)
        ticket = to_ticket(load_ticket(db, auth, cur["id"]))
    return ticket


# ── Comments ────────────────────────────────────────────────────────
class CommentBody(BaseModel):
    model_config = ConfigDict(strict=True)
    body: trimmed(1, 5000, "Write a comment first")


@router.post("/tickets/{id}/comments")
def add_comment(id: str, body: Any = Body(default=None), auth: AuthContext = Depends(require_auth)):
    text = parse(CommentBody, body).body
    with tx() as db:
        cur = load_ticket(db, auth, id)
        comment = query_one(
            "INSERT INTO ticket_comments (workspace_id, ticket_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id, author_id, body, created_at",
            [auth.workspaceId, cur["id"], auth.employeeId, text],
            db,
        )
        query("UPDATE tickets SET updated_at = now() WHERE id = $1", [cur["id"]], db)
        # Let the other people on the ticket know (one statement, no fan-out).
        query(
            """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
       SELECT $1, r.id, 'system', $2, left($3, 180), $4
         FROM (SELECT DISTINCT unnest(ARRAY[$5::text, $6::text]) AS id) r
        WHERE r.id IS NOT NULL AND r.id <> $7""",
            [auth.workspaceId, f"New comment on {cur['identifier']}", text, ticket_href(cur["id"]), cur["reporter_id"], cur["assignee_id"], auth.employeeId],
            db,
        )
    return JSONResponse({"id": comment["id"], "authorId": comment["author_id"], "body": comment["body"], "createdAt": iso(comment["created_at"])}, status_code=201)
