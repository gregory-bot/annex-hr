"""Employees, departments and the org chart."""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from ..audit import audit
from ..db import build_update, query, query_one
from ..errors import forbidden, not_found, parse
from ..repository import owned, to_department, to_employee
from ..roles import ADMIN, LEADERS, can_see_pay
from ..security import AuthContext, require_auth, require_role

router = APIRouter()

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


def _trim(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def _redact(e: dict[str, Any], me: AuthContext) -> dict[str, Any]:
    return e if can_see_pay(me.role) or e["id"] == me.employeeId else {**e, "salaryKES": 0}


# ── Employees ───────────────────────────────────────────────────────
class EmployeeFilter(BaseModel):
    q: Optional[str] = None
    departmentId: Optional[str] = None
    status: Optional[str] = None


@router.get("/employees")
def list_employees(request: Request, me: AuthContext = Depends(require_auth)):
    f = parse(EmployeeFilter, dict(request.query_params))
    rows = query(
        """SELECT * FROM employees
      WHERE workspace_id = $1
        AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%' OR title ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR department_id = $3)
        AND ($4::text IS NULL OR status = $4)
      ORDER BY employee_no""",
        [me.workspaceId, f.q, f.departmentId, f.status],
    )
    return [_redact(to_employee(r), me) for r in rows]


@router.get("/employees/{id}")
def get_employee(id: str, me: AuthContext = Depends(require_auth)):
    return _redact(to_employee(owned("employees", id, me.workspaceId, "Employee")), me)


class EmployeeIn(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=2)
    email: EmailStr
    phone: Optional[str] = None
    title: str = Field(min_length=2)
    departmentId: Optional[str] = None
    managerId: Optional[str] = None
    role: Literal["company_admin", "hr_officer", "manager", "employee", "consultant", "finance", "ceo"] = "employee"
    employmentType: Literal["Full-time", "Contract", "Consultant", "Intern", "Part-time"]
    status: Literal["Active", "Probation", "On Leave", "Onboarding", "Notice Period", "Exited"] = "Onboarding"
    gender: Optional[Literal["Female", "Male"]] = None
    location: Optional[str] = None
    startDate: str = Field(pattern=ISO_DATE)
    salaryKES: float = Field(default=0, ge=0)
    kraPin: Optional[str] = None
    nationalId: Optional[str] = None

    @field_validator("name", "title", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)

    @field_validator("email", mode="before")
    @classmethod
    def _e(cls, v: Any) -> Any:
        return v.strip().lower() if isinstance(v, str) else v


@router.post("/employees")
def create_employee(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(EmployeeIn, body)
    n = query_one("SELECT count(*)::int AS n FROM employees WHERE workspace_id = $1", [me.workspaceId])["n"]  # type: ignore[index]
    ws = query_one("SELECT slug FROM workspaces WHERE id = $1", [me.workspaceId])
    row = query_one(
        """INSERT INTO employees (workspace_id, employee_no, name, email, phone, title, department_id, manager_id, role, employment_type, status, gender, location, start_date, salary_kes, kra_pin, national_id, probation_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, $14::date + 90) RETURNING *""",
        [
            me.workspaceId, f"{ws['slug'][:3].upper()}-{1001 + n}", b.name, b.email, b.phone, b.title, b.departmentId, b.managerId,  # type: ignore[index]
            b.role, b.employmentType, b.status, b.gender, b.location, b.startDate, b.salaryKES, b.kraPin, b.nationalId,
        ],
    )
    audit(request, me, "employee.created", "employee", row["id"])  # type: ignore[index]
    return JSONResponse(jsonable_encoder(to_employee(row)), status_code=201)  # type: ignore[arg-type]


EMPLOYEE_COLUMNS = ["name", "phone", "title", "department_id", "manager_id", "role", "employment_type", "status", "gender", "location", "salary_kes", "probation_end", "performance", "potential", "onboarding_progress", "kra_pin", "national_id", "birthday"]


@router.patch("/employees/{id}")
def update_employee(id: str, request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_auth)):
    owned("employees", id, me.workspaceId, "Employee")
    is_self = id == me.employeeId
    if not is_self and me.role not in ADMIN:
        raise forbidden()
    # Employees may only edit their own contact details.
    allowed = ["phone", "birthday"] if is_self and me.role not in ADMIN else EMPLOYEE_COLUMNS
    patch = dict(body) if isinstance(body, dict) else {}
    if "salaryKES" in patch:
        patch["salaryKes"] = patch.pop("salaryKES")
    upd = build_update(patch, allowed, 3)
    if not upd:
        raise not_found("Updatable fields")
    sets, params = upd
    row = query_one(f"UPDATE employees SET {sets}, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *", [id, me.workspaceId, *params])
    audit(request, me, "employee.updated", "employee", id, {"fields": list(patch.keys())})
    return to_employee(row)  # type: ignore[arg-type]


# ── Departments ─────────────────────────────────────────────────────
@router.get("/departments")
def list_departments(me: AuthContext = Depends(require_auth)):
    return [to_department(d) for d in query("SELECT * FROM departments WHERE workspace_id = $1 ORDER BY name", [me.workspaceId])]


class DepartmentIn(BaseModel):
    model_config = ConfigDict(strict=True)

    name: str = Field(min_length=2)
    headId: Optional[str] = None
    color: str = Field(default="#C1121F", pattern=r"^#[0-9a-fA-F]{6}$")
    budgetKES: float = Field(default=0, ge=0)

    @field_validator("name", mode="before")
    @classmethod
    def _t(cls, v: Any) -> Any:
        return _trim(v)


@router.post("/departments")
def create_department(request: Request, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    b = parse(DepartmentIn, body)
    if b.headId:
        owned("employees", b.headId, me.workspaceId, "Department head")
    row = query_one(
        "INSERT INTO departments (workspace_id, name, head_id, color, budget_kes) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [me.workspaceId, b.name, b.headId, b.color, b.budgetKES],
    )
    audit(request, me, "department.created", "department", row["id"])  # type: ignore[index]
    return JSONResponse(jsonable_encoder(to_department(row)), status_code=201)  # type: ignore[arg-type]


@router.patch("/departments/{id}")
def update_department(id: str, body: Any = Body(default={}), me: AuthContext = Depends(require_role(*ADMIN))):
    owned("departments", id, me.workspaceId, "Department")
    patch = dict(body) if isinstance(body, dict) else {}
    if "budgetKES" in patch:
        patch["budgetKes"] = patch.pop("budgetKES")
    upd = build_update(patch, ["name", "head_id", "color", "budget_kes"], 3)
    if not upd:
        raise not_found("Updatable fields")
    sets, params = upd
    row = query_one(f"UPDATE departments SET {sets} WHERE id = $1 AND workspace_id = $2 RETURNING *", [id, me.workspaceId, *params])
    return to_department(row)  # type: ignore[arg-type]


# ── Org overview for leaders ────────────────────────────────────────
@router.get("/org-chart")
def org_chart(me: AuthContext = Depends(require_role(*LEADERS, "finance"))):
    rows = query(
        "SELECT id, name, title, manager_id, department_id FROM employees WHERE workspace_id = $1 AND status <> $2 ORDER BY employee_no",
        [me.workspaceId, "Exited"],
    )
    return [{"id": r["id"], "name": r["name"], "title": r["title"], "managerId": r["manager_id"], "departmentId": r["department_id"]} for r in rows]
