"""Performance: KPI scorecard, OKRs, review cycles (self / manager / peer), the 9-box and succession plans."""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal

import psycopg
from fastapi import APIRouter, Body, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from ..audit import audit
from ..db import build_update, iso, query, query_one, tx
from ..errors import bad_request, forbidden, not_found, parse
from ..repository import owned
from ..roles import ADMIN, EXEC, is_admin, is_exec, is_leader
from ..security import AuthContext, require_auth, require_role

router = APIRouter()

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"
QUARTER = r"^\d{4}-Q[1-4]$"


class Strict(BaseModel):
    model_config = ConfigDict(strict=True)


def _num(v: Any) -> float:
    return float(v) if v is not None else 0.0


# ════════════════════════════════════════════════════════════════════
# KPIs & balanced scorecard
# ════════════════════════════════════════════════════════════════════
PERSPECTIVES = ("Financial", "Customer", "Internal Process", "Learning & Growth")
Perspective = Literal["Financial", "Customer", "Internal Process", "Learning & Growth"]


def to_kpi(k: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": k["id"], "perspective": k["perspective"], "name": k["name"], "target": k["target"], "actual": k["actual"],
        "unit": k["unit"], "weight": k["weight"], "owner": k["owner"], "lowerIsBetter": k["lower_is_better"],
    }


def attainment(k: dict[str, Any]) -> float:
    t, a = _num(k["target"]), _num(k["actual"])
    if k["lower_is_better"]:
        return (t / a) if a else 1.0
    return (a / t) if t else 0.0


def weighted(items: list[dict[str, Any]]) -> float:
    w = sum(k["weight"] for k in items)
    return round(sum(min(1.0, attainment(k)) * k["weight"] for k in items) / w * 100, 1) if w else 0.0


def scorecard(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "overall": weighted(rows),
        "onTrack": sum(1 for k in rows if attainment(k) >= 0.95),
        "total": len(rows),
        "perspectives": [
            {"perspective": p, "score": weighted([k for k in rows if k["perspective"] == p]), "weight": sum(k["weight"] for k in rows if k["perspective"] == p), "count": sum(1 for k in rows if k["perspective"] == p)}
            for p in PERSPECTIVES
        ],
        "kpis": [{"id": k["id"], "attainment": round(attainment(k) * 100, 1), "onTrack": attainment(k) >= 0.95} for k in rows],
    }


def _kpi_payload(workspace_id: str) -> dict[str, Any]:
    rows = query("SELECT * FROM kpis WHERE workspace_id = $1 ORDER BY position, name", [workspace_id])
    return {"kpis": [to_kpi(k) for k in rows], "scorecard": scorecard(rows)}


@router.get("/performance/kpis")
def list_kpis(me: AuthContext = Depends(require_auth)):
    return _kpi_payload(me.workspaceId)


class KpiIn(Strict):
    perspective: Perspective
    name: Text
    target: float
    actual: float = 0
    unit: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] = ""
    weight: int = Field(ge=1, le=100)
    owner: Text
    lowerIsBetter: bool = False


class KpiPatch(Strict):
    perspective: Perspective | None = None
    name: Text | None = None
    target: float | None = None
    actual: float | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    weight: int | None = Field(default=None, ge=1, le=100)
    owner: Text | None = None
    lowerIsBetter: bool | None = None


@router.post("/performance/kpis")
def create_kpi(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*EXEC))):
    b = parse(KpiIn, body)
    k = query_one(
        """INSERT INTO kpis (workspace_id, perspective, name, target, actual, unit, weight, owner, lower_is_better, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, (SELECT COALESCE(max(position), 0) + 1 FROM kpis WHERE workspace_id = $1)) RETURNING *""",
        [me.workspaceId, b.perspective, b.name, b.target, b.actual, b.unit, b.weight, b.owner, b.lowerIsBetter],
    )
    audit(request, me, "kpi.created", "kpi", k["id"])  # type: ignore[index]
    return JSONResponse({"kpi": to_kpi(k), **_kpi_payload(me.workspaceId)}, status_code=201)  # type: ignore[arg-type]


@router.patch("/performance/kpis/{id}")
def update_kpi(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*EXEC, "manager"))):
    b = parse(KpiPatch, body)
    owned("kpis", id, me.workspaceId, "KPI")
    patch = b.model_dump(exclude_none=True)
    # Managers record progress; changing the scorecard's shape is for HR and executives.
    if me.role == "manager" and set(patch) - {"actual"}:
        raise forbidden("Managers can only update a KPI's actual value")
    upd = build_update(patch, ["perspective", "name", "target", "actual", "unit", "weight", "owner", "lower_is_better"], 2)
    if upd:
        query(f"UPDATE kpis SET {upd[0]} WHERE id = $1", [id, *upd[1]])
    audit(request, me, "kpi.updated", "kpi", id, patch)
    k = query_one("SELECT * FROM kpis WHERE id = $1", [id])
    return {"kpi": to_kpi(k), **_kpi_payload(me.workspaceId)}  # type: ignore[arg-type]


@router.delete("/performance/kpis/{id}")
def delete_kpi(id: str, request: Request, me: AuthContext = Depends(require_role(*EXEC))):
    owned("kpis", id, me.workspaceId, "KPI")
    query("DELETE FROM kpis WHERE id = $1", [id])
    audit(request, me, "kpi.deleted", "kpi", id)
    return _kpi_payload(me.workspaceId)


# ════════════════════════════════════════════════════════════════════
# OKRs
# ════════════════════════════════════════════════════════════════════
Confidence = Literal["High", "Medium", "Low"]


def _objectives(workspace_id: str, where: str, params: list[Any], db: psycopg.Connection | None = None) -> list[dict[str, Any]]:
    rows = query(
        f"""SELECT o.*,
                   COALESCE((SELECT json_agg(json_build_object(
                       'id', k.id, 'title', k.title, 'current', k.current, 'target', k.target, 'progress', k.progress, 'updatedAt', k.updated_at,
                       'updates', COALESCE((SELECT json_agg(json_build_object('progress', u.progress, 'current', u.current, 'note', u.note,
                                                                              'author', ea.name, 'at', u.created_at) ORDER BY u.created_at DESC)
                                              FROM (SELECT * FROM key_result_updates WHERE key_result_id = k.id ORDER BY created_at DESC LIMIT 5) u
                                              LEFT JOIN employees ea ON ea.id = u.author_id), '[]'::json)
                     ) ORDER BY k.position, k.title) FROM key_results k WHERE k.objective_id = o.id), '[]'::json) AS krs
              FROM objectives o WHERE o.workspace_id = $1 {where}
             ORDER BY o.position, o.created_at""",
        [workspace_id, *params],
        db,
    )
    out = []
    for o in rows:
        krs = o["krs"] or []
        out.append({
            "id": o["id"], "quarter": o["quarter"], "title": o["title"], "ownerId": o["owner_id"] or "", "confidence": o["confidence"],
            "progress": round(sum(k["progress"] for k in krs) / len(krs)) if krs else 0,
            "updatedAt": iso(o["updated_at"]),
            "keyResults": [{**k, "updatedAt": iso(k["updatedAt"]), "updates": [{**u, "at": iso(u["at"])} for u in k["updates"]]} for k in krs],
        })
    return out


def _visible_clause(me: AuthContext) -> tuple[str, list[Any]]:
    # Employees (and consultants) only ever see objectives they own.
    return ("", []) if is_leader(me.role) else ("AND o.owner_id = $2", [me.employeeId])


def _one_objective(id: str, me: AuthContext, db: psycopg.Connection | None = None) -> dict[str, Any]:
    where, params = _visible_clause(me)
    items = _objectives(me.workspaceId, f"{where} AND o.id = ${len(params) + 2}", [*params, id], db)
    if not items:
        raise not_found("Objective")
    return items[0]


def _can_edit_objective(o: dict[str, Any], me: AuthContext) -> bool:
    return is_leader(me.role) or o["owner_id"] == me.employeeId


@router.get("/performance/objectives")
def list_objectives(request: Request, me: AuthContext = Depends(require_auth)):
    where, params = _visible_clause(me)
    q = request.query_params.get("quarter")
    if q:
        where += f" AND o.quarter = ${len(params) + 2}"
        params.append(q)
    return _objectives(me.workspaceId, where, params)


class KrIn(Strict):
    title: Text
    current: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] = ""
    target: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] = ""
    progress: int = Field(default=0, ge=0, le=100)


class ObjectiveIn(Strict):
    title: Text
    ownerId: str | None = None
    quarter: str = Field(default="2026-Q3", pattern=QUARTER)
    confidence: Confidence = "Medium"
    keyResults: list[KrIn] = Field(default_factory=list, max_length=8)


class ObjectivePatch(Strict):
    title: Text | None = None
    ownerId: str | None = None
    confidence: Confidence | None = None


def _check_owner(owner_id: str, me: AuthContext, db: psycopg.Connection | None = None) -> None:
    if not query_one("SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2", [owner_id, me.workspaceId], db):
        raise bad_request("Owner must be someone in this workspace")
    if not is_leader(me.role) and owner_id != me.employeeId:
        raise forbidden("You can only own your own objectives")


@router.post("/performance/objectives")
def create_objective(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(ObjectiveIn, body)
    owner = b.ownerId or me.employeeId
    with tx() as db:
        _check_owner(owner, me, db)
        o = query_one(
            """INSERT INTO objectives (workspace_id, quarter, title, owner_id, confidence, created_by, position)
               VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(position), 0) + 1 FROM objectives WHERE workspace_id = $1)) RETURNING id""",
            [me.workspaceId, b.quarter, b.title, owner, b.confidence, me.employeeId],
            db,
        )
        for i, kr in enumerate(b.keyResults):
            query(
                "INSERT INTO key_results (objective_id, title, current, target, progress, position) VALUES ($1,$2,$3,$4,$5,$6)",
                [o["id"], kr.title, kr.current, kr.target, kr.progress, i],  # type: ignore[index]
                db,
            )
        result = _one_objective(o["id"], me, db)  # type: ignore[index]
    audit(request, me, "objective.created", "objective", result["id"])
    return JSONResponse(result, status_code=201)


@router.patch("/performance/objectives/{id}")
def update_objective(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(ObjectivePatch, body)
    o = owned("objectives", id, me.workspaceId, "Objective")
    if not _can_edit_objective(o, me):
        raise forbidden("Only the owner or a leader can edit this objective")
    if b.ownerId:
        _check_owner(b.ownerId, me)
    upd = build_update(b.model_dump(exclude_none=True), ["title", "owner_id", "confidence"], 2)
    if upd:
        query(f"UPDATE objectives SET {upd[0]}, updated_at = now() WHERE id = $1", [id, *upd[1]])
    audit(request, me, "objective.updated", "objective", id)
    return _one_objective(id, me)


@router.delete("/performance/objectives/{id}")
def delete_objective(id: str, request: Request, me: AuthContext = Depends(require_auth)):
    o = owned("objectives", id, me.workspaceId, "Objective")
    if not (is_exec(me.role) or o["owner_id"] == me.employeeId):
        raise forbidden("Only the owner or HR can delete this objective")
    query("DELETE FROM objectives WHERE id = $1", [id])
    audit(request, me, "objective.deleted", "objective", id)
    return Response(status_code=204)


@router.post("/performance/objectives/{id}/key-results")
def add_key_result(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    b = parse(KrIn, body)
    o = owned("objectives", id, me.workspaceId, "Objective")
    if not _can_edit_objective(o, me):
        raise forbidden("Only the owner or a leader can edit this objective")
    query(
        """INSERT INTO key_results (objective_id, title, current, target, progress, position)
           VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(position), 0) + 1 FROM key_results WHERE objective_id = $1))""",
        [id, b.title, b.current, b.target, b.progress],
    )
    query("UPDATE objectives SET updated_at = now() WHERE id = $1", [id])
    audit(request, me, "key_result.created", "objective", id)
    return JSONResponse(_one_objective(id, me), status_code=201)


class KrPatch(Strict):
    title: Text | None = None
    current: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    target: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    note: LongText | None = None


def _kr_objective(kr_id: str, me: AuthContext, db: psycopg.Connection | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    kr = query_one(
        "SELECT k.*, o.owner_id, o.workspace_id FROM key_results k JOIN objectives o ON o.id = k.objective_id WHERE k.id = $1 AND o.workspace_id = $2",
        [kr_id, me.workspaceId],
        db,
    )
    if not kr:
        raise not_found("Key result")
    return kr, {"owner_id": kr["owner_id"]}


@router.patch("/performance/key-results/{id}")
def update_key_result(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    """Edits a key result; a progress or current-value change is recorded as a check-in."""
    b = parse(KrPatch, body)
    with tx() as db:
        kr, o = _kr_objective(id, me, db)
        if not _can_edit_objective(o, me):
            raise forbidden("Only the owner or a leader can update this key result")
        patch = b.model_dump(exclude_none=True, exclude={"note"})
        upd = build_update(patch, ["title", "current", "target", "progress"], 2)
        if upd:
            query(f"UPDATE key_results SET {upd[0]}, updated_at = now() WHERE id = $1", [id, *upd[1]], db)
        if b.progress is not None or b.current is not None or b.note:
            query(
                "INSERT INTO key_result_updates (key_result_id, progress, current, note, author_id) VALUES ($1,$2,$3,$4,$5)",
                [id, b.progress if b.progress is not None else kr["progress"], b.current if b.current is not None else kr["current"], b.note, me.employeeId],
                db,
            )
        query("UPDATE objectives SET updated_at = now() WHERE id = $1", [kr["objective_id"]], db)
        result = _one_objective(kr["objective_id"], me, db)
    audit(request, me, "key_result.updated", "key_result", id, {"progress": b.progress})
    return result


@router.delete("/performance/key-results/{id}")
def delete_key_result(id: str, request: Request, me: AuthContext = Depends(require_auth)):
    kr, o = _kr_objective(id, me)
    if not _can_edit_objective(o, me):
        raise forbidden("Only the owner or a leader can edit this objective")
    query("DELETE FROM key_results WHERE id = $1", [id])
    audit(request, me, "key_result.deleted", "key_result", id)
    return _one_objective(kr["objective_id"], me)


# ════════════════════════════════════════════════════════════════════
# Review cycles
# ════════════════════════════════════════════════════════════════════
STAGES = ["Self review", "Manager review", "Peer feedback", "Calibration", "Released"]
COMPETENCIES = ("delivery", "craft", "collab", "ownership", "comms")
Kind = Literal["self", "manager", "peer"]


def to_cycle(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": c["id"], "name": c["name"], "quarter": c["quarter"], "periodStart": c["period_start"], "periodEnd": c["period_end"],
        "closesOn": c["closes_on"], "stage": c["stage"], "stageLabel": STAGES[c["stage"]], "released": c["stage"] == 4,
        "releasedAt": iso(c["released_at"]) or None,
    }


@router.get("/performance/review-cycles")
def list_cycles(me: AuthContext = Depends(require_auth)):
    return [to_cycle(c) for c in query("SELECT * FROM review_cycles WHERE workspace_id = $1 ORDER BY period_end DESC", [me.workspaceId])]


class CycleIn(Strict):
    name: Text
    quarter: str = Field(pattern=QUARTER)
    periodStart: str = Field(pattern=ISO_DATE)
    periodEnd: str = Field(pattern=ISO_DATE)
    closesOn: str = Field(pattern=ISO_DATE)


def create_review_cycle(db: psycopg.Connection, workspace_id: str, name: str, quarter: str, start: str, end: str, closes: str, stage: int = 0) -> str:
    c = query_one(
        "INSERT INTO review_cycles (workspace_id, name, quarter, period_start, period_end, closes_on, stage) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [workspace_id, name, quarter, start, end, closes, stage],
        db,
    )
    # Everyone on payroll except the CEO is reviewed; consultants are managed by contract.
    query(
        """INSERT INTO review_participants (cycle_id, employee_id)
           SELECT $1, id FROM employees WHERE workspace_id = $2 AND status <> 'Exited' AND employment_type <> 'Consultant' AND role <> 'ceo'""",
        [c["id"], workspace_id],  # type: ignore[index]
        db,
    )
    return c["id"]  # type: ignore[index]


@router.post("/performance/review-cycles")
def create_cycle(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(CycleIn, body)
    if not (b.periodStart <= b.periodEnd and b.periodStart <= b.closesOn):
        raise bad_request("Dates are out of order")
    with tx() as db:
        cid = create_review_cycle(db, me.workspaceId, b.name, b.quarter, b.periodStart, b.periodEnd, b.closesOn)
        c = query_one("SELECT * FROM review_cycles WHERE id = $1", [cid], db)
    audit(request, me, "review_cycle.created", "review_cycle", cid)
    return JSONResponse(to_cycle(c), status_code=201)  # type: ignore[arg-type]


def _release(db: psycopg.Connection, cycle: dict[str, Any]) -> int:
    """Publishes final ratings to employee profiles."""
    n = query(
        """UPDATE employees e SET performance = p.final_rating, updated_at = now()
             FROM review_participants p WHERE p.cycle_id = $1 AND p.employee_id = e.id AND p.final_rating IS NOT NULL
           RETURNING e.id""",
        [cycle["id"]],
        db,
    )
    query("UPDATE review_cycles SET stage = 4, released_at = now() WHERE id = $1", [cycle["id"]], db)
    query(
        """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
           VALUES ($1, NULL, 'performance', $2, 'Final ratings are now visible in My review.', '/app/performance?tab=reviews')""",
        [cycle["workspace_id"], f"{cycle['name']} results released"],
        db,
    )
    return len(n)


@router.post("/performance/review-cycles/{id}/advance")
def advance_cycle(id: str, request: Request, me: AuthContext = Depends(require_role(*ADMIN))):
    """Moves the cycle to its next stage; reaching Released publishes final ratings to employees' profiles."""
    with tx() as db:
        c = owned("review_cycles", id, me.workspaceId, "Review cycle", db)
        if c["stage"] >= 4:
            raise bad_request("This cycle has already been released")
        released = 0
        if c["stage"] + 1 == 4:
            released = _release(db, c)
        else:
            query("UPDATE review_cycles SET stage = stage + 1 WHERE id = $1", [id], db)
        c = query_one("SELECT * FROM review_cycles WHERE id = $1", [id], db)
    audit(request, me, "review_cycle.advanced", "review_cycle", id, {"stage": STAGES[c["stage"]], "released": released})  # type: ignore[index]
    return {**to_cycle(c), "ratingsReleased": released}  # type: ignore[arg-type]


def _step(reviews: list[dict[str, Any]]) -> str:
    if any(r["status"] == "Submitted" for r in reviews):
        return "Submitted"
    return "In Progress" if reviews else "Not started"


def _scope(me: AuthContext) -> tuple[str, list[Any]]:
    if is_exec(me.role):
        return "", []
    if me.role == "manager":
        return "AND (e.manager_id = $3 OR e.id = $3)", [me.employeeId]
    return "AND e.id = $3", [me.employeeId]


@router.get("/performance/review-cycles/{id}/reviews")
def list_reviews(id: str, me: AuthContext = Depends(require_auth)):
    """One row per reviewee with self / manager / peer status. Employees see only themselves; managers their reports."""
    c = owned("review_cycles", id, me.workspaceId, "Review cycle")
    where, params = _scope(me)
    parts = query(
        f"""SELECT p.employee_id, p.final_rating, e.manager_id,
                   COALESCE((SELECT json_agg(json_build_object('kind', r.kind, 'status', r.status, 'overall', r.overall, 'reviewerId', r.reviewer_id))
                               FROM reviews r WHERE r.cycle_id = p.cycle_id AND r.employee_id = p.employee_id), '[]'::json) AS reviews
              FROM review_participants p JOIN employees e ON e.id = p.employee_id
             WHERE p.cycle_id = $1 AND e.workspace_id = $2 {where}
             ORDER BY e.name""",
        [id, me.workspaceId, *params],
    )
    released = c["stage"] == 4
    out = []
    for p in parts:
        rs = p["reviews"]
        mgr = [r for r in rs if r["kind"] == "manager"]
        peers = [r for r in rs if r["kind"] == "peer"]
        own = p["employee_id"] == me.employeeId
        # A person's own final rating stays hidden until the cycle is released.
        show_final = released or (not own and (is_exec(me.role) or me.role == "manager"))
        out.append({
            "employeeId": p["employee_id"],
            "self": _step([r for r in rs if r["kind"] == "self"]),
            "manager": _step(mgr),
            "peer": _step(peers),
            "peerCount": sum(1 for r in peers if r["status"] == "Submitted"),
            "myPeerStatus": _step([r for r in peers if r["reviewerId"] == me.employeeId]) if not own else None,
            "finalRating": p["final_rating"] if show_final else None,
        })
    return {"cycle": to_cycle(c), "rows": out}


def _doc(r: dict[str, Any] | None) -> dict[str, Any] | None:
    if not r:
        return None
    return {
        "status": r["status"], "ratings": r["ratings"] or {}, "overall": r["overall"], "strengths": r["strengths"],
        "improvements": r["improvements"], "submittedAt": iso(r["submitted_at"]) or None, "updatedAt": iso(r["updated_at"]),
    }


def _reviewee(cycle_id: str, employee_id: str, me: AuthContext, db: psycopg.Connection | None = None) -> dict[str, Any]:
    e = query_one(
        """SELECT e.id, e.name, e.manager_id, p.final_rating FROM review_participants p JOIN employees e ON e.id = p.employee_id
            WHERE p.cycle_id = $1 AND p.employee_id = $2 AND e.workspace_id = $3""",
        [cycle_id, employee_id, me.workspaceId],
        db,
    )
    if not e:
        raise not_found("Review")
    return e


@router.get("/performance/review-cycles/{id}/reviews/{employeeId}")
def get_review(id: str, employeeId: str, me: AuthContext = Depends(require_auth)):
    c = owned("review_cycles", id, me.workspaceId, "Review cycle")
    e = _reviewee(id, employeeId, me)
    own = e["id"] == me.employeeId
    is_mgr = e["manager_id"] == me.employeeId
    leader_view = is_exec(me.role) or is_mgr
    released = c["stage"] == 4
    rows = query("SELECT * FROM reviews WHERE cycle_id = $1 AND employee_id = $2", [id, employeeId])
    self_r = next((r for r in rows if r["kind"] == "self"), None)
    mgr_r = next((r for r in rows if r["kind"] == "manager"), None)
    mine = next((r for r in rows if r["kind"] == "peer" and r["reviewer_id"] == me.employeeId), None)
    if not (own or leader_view):
        # Peers only see the feedback they wrote themselves.
        return {"employeeId": employeeId, "cycle": to_cycle(c), "self": None, "manager": None, "peers": [], "myPeer": _doc(mine), "finalRating": None, "canWrite": {"self": False, "manager": False, "peer": not released}}
    peers = [
        {"strengths": r["strengths"], "improvements": r["improvements"], "overall": r["overall"]}
        for r in rows if r["kind"] == "peer" and r["status"] == "Submitted"
    ] if leader_view else []
    return {
        "employeeId": employeeId,
        "cycle": to_cycle(c),
        "self": _doc(self_r),
        "manager": _doc(mgr_r) if (leader_view or released) else None,
        "peers": peers,
        "myPeer": _doc(mine),
        "finalRating": e["final_rating"] if (released or (leader_view and not own)) else None,
        "canWrite": {"self": own and not released, "manager": (is_mgr or is_admin(me.role)) and not own and not released, "peer": not own and not released},
    }


class ReviewIn(Strict):
    ratings: dict[str, int]
    strengths: LongText = ""
    improvements: LongText = ""
    submit: bool = False


@router.put("/performance/review-cycles/{id}/reviews/{employeeId}/{kind}")
def save_review(id: str, employeeId: str, kind: Kind, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    """Saves a self, manager or peer review as a draft, or submits it. A submitted manager review sets the provisional final rating."""
    b = parse(ReviewIn, body)
    bad = [k for k, v in b.ratings.items() if k not in COMPETENCIES or not 1 <= v <= 5]
    if bad:
        raise bad_request("Ratings must be 1–5 for known competencies", [{"path": k, "message": "Invalid rating"} for k in bad])
    if b.submit and len(b.ratings) < len(COMPETENCIES):
        raise bad_request("Rate every competency before submitting")
    with tx() as db:
        c = owned("review_cycles", id, me.workspaceId, "Review cycle", db)
        if c["stage"] >= 4:
            raise bad_request("This cycle has been released — reviews are locked")
        e = _reviewee(id, employeeId, me, db)
        own = e["id"] == me.employeeId
        if kind == "self" and not own:
            raise forbidden("Only the employee can write their self review")
        if kind == "manager" and (own or not (e["manager_id"] == me.employeeId or is_admin(me.role))):
            raise forbidden("Only the employee's manager or HR can write the manager review")
        if kind == "peer" and own:
            raise forbidden("You can't write peer feedback for yourself")
        overall = round(sum(b.ratings.values()) / len(b.ratings), 1) if b.ratings else None
        status = "Submitted" if b.submit else "In Progress"
        # One manager review per person, whoever writes it; self and peer reviews are keyed by their author.
        existing = query_one(
            "SELECT id FROM reviews WHERE cycle_id = $1 AND employee_id = $2 AND kind = $3 AND ($3 = 'manager' OR reviewer_id = $4)",
            [id, employeeId, kind, me.employeeId],
            db,
        )
        if existing:
            query(
                """UPDATE reviews SET reviewer_id = $2, ratings = $3, overall = $4, strengths = $5, improvements = $6, status = $7,
                          submitted_at = CASE WHEN $7 = 'Submitted' THEN now() ELSE NULL END, updated_at = now() WHERE id = $1""",
                [existing["id"], me.employeeId, json.dumps(b.ratings), overall, b.strengths, b.improvements, status],
                db,
            )
        else:
            query(
                """INSERT INTO reviews (cycle_id, employee_id, reviewer_id, kind, status, ratings, overall, strengths, improvements, submitted_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $5 = 'Submitted' THEN now() ELSE NULL END)""",
                [id, employeeId, me.employeeId, kind, status, json.dumps(b.ratings), overall, b.strengths, b.improvements],
                db,
            )
        if kind == "manager" and b.submit and overall is not None:
            query("UPDATE review_participants SET final_rating = $3 WHERE cycle_id = $1 AND employee_id = $2 AND calibrated_by IS NULL", [id, employeeId, overall], db)
        if kind == "self" and b.submit and e["manager_id"]:
            query(
                """INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href)
                   VALUES ($1, $2, 'performance', $3, 'Their self review is ready for your manager review.', '/app/performance?tab=reviews')""",
                [me.workspaceId, e["manager_id"], f"{e['name']} submitted a self review"],
                db,
            )
    audit(request, me, f"review.{kind}_{'submitted' if b.submit else 'saved'}", "review", employeeId, {"cycle": id})
    return get_review(id, employeeId, me)


class CalibrateIn(Strict):
    employeeId: str
    rating: float = Field(ge=1, le=5)


@router.post("/performance/review-cycles/{id}/calibrate")
def calibrate(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(CalibrateIn, body)
    c = owned("review_cycles", id, me.workspaceId, "Review cycle")
    if c["stage"] >= 4:
        raise bad_request("This cycle has been released")
    r = query_one(
        "UPDATE review_participants SET final_rating = $3, calibrated_by = $4 WHERE cycle_id = $1 AND employee_id = $2 RETURNING final_rating",
        [id, b.employeeId, round(b.rating, 1), me.employeeId],
    )
    if not r:
        raise not_found("Review")
    audit(request, me, "review.calibrated", "review", b.employeeId, {"cycle": id, "rating": b.rating})
    return {"employeeId": b.employeeId, "finalRating": r["final_rating"]}


# ════════════════════════════════════════════════════════════════════
# 9-box talent data
# ════════════════════════════════════════════════════════════════════
@router.get("/performance/talent")
def talent(me: AuthContext = Depends(require_role(*EXEC, "manager"))):
    where = "" if is_exec(me.role) else "AND manager_id = $2"
    params = [me.workspaceId] + ([] if is_exec(me.role) else [me.employeeId])
    rows = query(
        f"""SELECT id, performance, potential FROM employees
             WHERE workspace_id = $1 AND status <> 'Exited' AND employment_type <> 'Consultant' AND role <> 'ceo' {where}""",
        params,
    )
    return [{"employeeId": r["id"], "performance": r["performance"], "potential": r["potential"]} for r in rows]


class PotentialIn(Strict):
    potential: int = Field(ge=1, le=3)


@router.patch("/performance/talent/{employeeId}")
def set_potential(employeeId: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(PotentialIn, body)
    owned("employees", employeeId, me.workspaceId, "Employee")
    r = query_one("UPDATE employees SET potential = $2, updated_at = now() WHERE id = $1 RETURNING id, performance, potential", [employeeId, b.potential])
    audit(request, me, "employee.potential_set", "employee", employeeId, {"potential": b.potential})
    return {"employeeId": r["id"], "performance": r["performance"], "potential": r["potential"]}  # type: ignore[index]


# ════════════════════════════════════════════════════════════════════
# Succession plans
# ════════════════════════════════════════════════════════════════════
Readiness = Literal["Ready now", "1–2 years", "3+ years"]
Risk = Literal["Low", "Medium", "High"]


class Successor(Strict):
    employeeId: str
    readiness: Readiness
    flightRisk: Risk = "Low"


class PlanIn(Strict):
    roleTitle: Text
    departmentId: str | None = None
    incumbentId: str | None = None
    successors: list[Successor] = Field(default_factory=list, max_length=6)
    notes: LongText = ""


class PlanPatch(Strict):
    roleTitle: Text | None = None
    departmentId: str | None = None
    incumbentId: str | None = None
    successors: list[Successor] | None = None
    notes: LongText | None = None


def to_plan(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": p["id"], "roleTitle": p["role_title"], "departmentId": p["department_id"], "incumbentId": p["incumbent_id"],
        "successors": p["successors"] or [], "notes": p["notes"], "updatedAt": iso(p["updated_at"]),
    }


def _check_people(me: AuthContext, ids: list[str], department_id: str | None) -> None:
    ids = [i for i in ids if i]
    if ids:
        found = query("SELECT id FROM employees WHERE workspace_id = $1 AND id = ANY($2)", [me.workspaceId, ids])
        if len(found) != len(set(ids)):
            raise bad_request("Everyone in a succession plan must be in this workspace")
    if department_id and not query_one("SELECT 1 FROM departments WHERE id = $1 AND workspace_id = $2", [department_id, me.workspaceId]):
        raise bad_request("Unknown department")


exec_role = require_role(*EXEC)


@router.get("/performance/succession")
def list_plans(me: AuthContext = Depends(exec_role)):
    return [to_plan(p) for p in query("SELECT * FROM succession_plans WHERE workspace_id = $1 ORDER BY position, role_title", [me.workspaceId])]


@router.post("/performance/succession")
def create_plan(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(exec_role)):
    b = parse(PlanIn, body)
    _check_people(me, [b.incumbentId or "", *[s.employeeId for s in b.successors]], b.departmentId)
    p = query_one(
        """INSERT INTO succession_plans (workspace_id, role_title, department_id, incumbent_id, successors, notes, updated_by, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(position), 0) + 1 FROM succession_plans WHERE workspace_id = $1)) RETURNING *""",
        [me.workspaceId, b.roleTitle, b.departmentId, b.incumbentId, json.dumps([s.model_dump() for s in b.successors]), b.notes, me.employeeId],
    )
    audit(request, me, "succession.created", "succession_plan", p["id"])  # type: ignore[index]
    return JSONResponse(to_plan(p), status_code=201)  # type: ignore[arg-type]


@router.patch("/performance/succession/{id}")
def update_plan(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(exec_role)):
    b = parse(PlanPatch, body)
    owned("succession_plans", id, me.workspaceId, "Succession plan")
    _check_people(me, [b.incumbentId or "", *[s.employeeId for s in b.successors or []]], b.departmentId)
    patch: dict[str, Any] = b.model_dump(exclude_none=True, exclude={"successors"})
    if b.successors is not None:
        patch["successors"] = json.dumps([s.model_dump() for s in b.successors])
    upd = build_update(patch, ["role_title", "department_id", "incumbent_id", "successors", "notes"], 3)
    sets = f"{upd[0]}, " if upd else ""
    p = query_one(f"UPDATE succession_plans SET {sets}updated_by = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, me.employeeId, *(upd[1] if upd else [])])
    audit(request, me, "succession.updated", "succession_plan", id)
    return to_plan(p)  # type: ignore[arg-type]


@router.delete("/performance/succession/{id}")
def delete_plan(id: str, request: Request, me: AuthContext = Depends(exec_role)):
    owned("succession_plans", id, me.workspaceId, "Succession plan")
    query("DELETE FROM succession_plans WHERE id = $1", [id])
    audit(request, me, "succession.deleted", "succession_plan", id)
    return Response(status_code=204)
