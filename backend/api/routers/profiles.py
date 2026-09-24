"""Full employee profiles: one payload for the profile page, plus self-service and HR edits."""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from ..audit import audit
from ..db import Row, iso, query, query_one, tx
from ..employee_records import FILE_META, ONBOARDING_TASKS_SQL, bank_level, can_view_files, map_tasks, shown, statutory_level, to_file
from ..errors import bad_request, forbidden, not_found, parse
from ..repository import to_compliance_doc, to_employee, to_leave
from ..roles import can_see_pay, is_admin
from ..security import AuthContext, require_auth

router = APIRouter()

#: Roles that may open other people's profiles (employees and consultants only see their own).
DIRECTORY_ROLES = ("super_admin", "company_admin", "hr_officer", "ceo", "manager", "finance")

PROFILE_SQL = f"""SELECT e.*,
  (SELECT row_to_json(p) FROM employee_profiles p WHERE p.employee_id = e.id) AS profile,
  (SELECT json_build_object('id', d.id, 'name', d.name, 'color', d.color) FROM departments d WHERE d.id = e.department_id) AS department,
  (SELECT json_build_object('id', m.id, 'name', m.name, 'title', m.title, 'email', m.email) FROM employees m WHERE m.id = e.manager_id) AS manager,
  COALESCE((SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'title', r.title) ORDER BY r.name)
              FROM employees r WHERE r.manager_id = e.id AND r.workspace_id = e.workspace_id AND r.status <> 'Exited'), '[]'::json) AS reports,
  COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM (SELECT {FILE_META} FROM employee_files f WHERE f.employee_id = e.id AND f.workspace_id = e.workspace_id) x), '[]'::json) AS files,
  COALESCE((SELECT json_agg(c ORDER BY c.expires NULLS LAST) FROM compliance_documents c WHERE c.employee_id = e.id AND c.workspace_id = e.workspace_id), '[]'::json) AS compliance,
  COALESCE((SELECT json_agg(l ORDER BY l.start_date DESC) FROM leave_requests l WHERE l.employee_id = e.id AND l.workspace_id = e.workspace_id), '[]'::json) AS leave,
  {ONBOARDING_TASKS_SQL} AS tasks
FROM employees e WHERE e.workspace_id = $1 AND e.id = $2"""


def _profile_fields(p: Row | None, stat: str, bank: str) -> dict[str, Any]:
    p = p or {}
    out: dict[str, Any] = {
        "preferredName": p.get("preferred_name"),
        "personalEmail": p.get("personal_email"),
        "address": p.get("address"),
        "city": p.get("city"),
        "maritalStatus": p.get("marital_status"),
        "nationality": p.get("nationality"),
        "emergencyName": p.get("emergency_name"),
        "emergencyRelationship": p.get("emergency_relationship"),
        "emergencyPhone": p.get("emergency_phone"),
        "shifNumber": shown(p.get("shif_number"), stat),  # type: ignore[arg-type]
        "nssfNumber": shown(p.get("nssf_number"), stat),  # type: ignore[arg-type]
        "passportNumber": shown(p.get("passport_number"), stat),  # type: ignore[arg-type]
        "ndaSignedAt": iso(p.get("nda_signed_at")) or None,
        "ndaSignature": p.get("nda_signature"),
        "updatedAt": iso(p.get("updated_at")) or None,
    }
    if bank != "none":
        out.update(
            bankName=p.get("bank_name"),
            bankBranch=p.get("bank_branch"),
            bankAccountName=p.get("bank_account_name"),
            bankAccountNumber=shown(p.get("bank_account_number"), bank),  # type: ignore[arg-type]
        )
    return out


def load_profile(viewer: AuthContext, employee_id: str, db=None) -> dict[str, Any]:
    if employee_id != viewer.employeeId and viewer.role not in DIRECTORY_ROLES:
        raise forbidden("You can only view your own profile")
    e = query_one(PROFILE_SQL, [viewer.workspaceId, employee_id], db)
    if not e:
        raise not_found("Employee")
    is_self = e["id"] == viewer.employeeId
    stat, bank = statutory_level(viewer, e["id"]), bank_level(viewer, e["id"])
    files_ok = can_view_files(viewer, e)
    see_pay = is_self or can_see_pay(viewer.role)

    emp = to_employee(e)
    # Same redaction as the workspace bootstrap, with the profile's statutory rule for finance.
    emp["salaryKES"] = emp["salaryKES"] if see_pay else 0
    emp["kraPin"] = shown(emp["kraPin"], stat) or ""  # type: ignore[arg-type]
    emp["nationalId"] = shown(emp["nationalId"], stat) or ""  # type: ignore[arg-type]

    tasks = map_tasks(e["tasks"], e, e["profile"], viewer, with_files=files_ok, with_values=False)
    return {
        "employee": emp,
        "department": e["department"],
        "manager": e["manager"],
        "directReports": e["reports"],
        "profile": _profile_fields(e["profile"], stat, bank),
        "files": [to_file(f) for f in e["files"]] if files_ok else [],
        "complianceDocs": [
            {**d, "number": shown(d["number"], stat) or ""} for d in (to_compliance_doc(c) for c in e["compliance"])  # type: ignore[arg-type]
        ],
        "leaveRequests": [to_leave(l) for l in e["leave"]],
        "onboarding": {
            "progress": e["onboarding_progress"],
            "requiredLeft": sum(1 for t in tasks if t["required"] and not t["completedAt"]),
            "tasks": tasks,
        },
        "access": {
            "isSelf": is_self,
            # Personal, emergency, bank and statutory details and documents belong to the employee;
            # HR edits employment details only.
            "canEdit": is_self,
            "canEditAll": is_admin(viewer.role),
            "canUpload": is_self,
            "canViewFiles": files_ok,
            "salary": see_pay,
            "statutory": stat,
            "bank": bank,
        },
    }


@router.get("/employees/{id}/profile")
def get_profile(id: str, auth: AuthContext = Depends(require_auth)):
    return load_profile(auth, auth.employeeId if id == "me" else id)


def _t(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        return v or None  # empty string clears the field
    return v


Opt = Optional[Annotated[str, StringConstraints(max_length=200)]]
PHONE = r"^\+?[\d\s()-]{9,20}$"


class PersonalPatch(BaseModel):
    """Personal, emergency-contact and bank fields."""

    model_config = ConfigDict(extra="forbid")

    phone: Optional[Annotated[str, Field(pattern=PHONE)]] = None
    birthday: Optional[Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]] = None
    preferredName: Opt = None
    personalEmail: Optional[EmailStr] = None
    address: Opt = None
    city: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    maritalStatus: Optional[Literal["Single", "Married", "Divorced", "Widowed", "Prefer not to say"]] = None
    nationality: Optional[Annotated[str, StringConstraints(max_length=60)]] = None
    emergencyName: Optional[Annotated[str, StringConstraints(min_length=2, max_length=120)]] = None
    emergencyRelationship: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    emergencyPhone: Optional[Annotated[str, Field(pattern=PHONE)]] = None
    bankName: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    bankBranch: Optional[Annotated[str, StringConstraints(max_length=80)]] = None
    bankAccountName: Optional[Annotated[str, StringConstraints(max_length=120)]] = None
    bankAccountNumber: Optional[Annotated[str, Field(pattern=r"^\d{6,20}$")]] = None

    @field_validator("*", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return _t(v)

    @field_validator("bankAccountNumber", mode="before")
    @classmethod
    def _digits(cls, v: Any) -> Any:
        return re.sub(r"[\s-]", "", v) if isinstance(v, str) else v


class SelfPatch(PersonalPatch):
    """Employees own their personal, emergency, bank and statutory details."""

    kraPin: Optional[Annotated[str, Field(pattern=r"^[A-Z]\d{9}[A-Z]$")]] = None
    nationalId: Optional[Annotated[str, Field(pattern=r"^\d{6,10}$")]] = None
    shifNumber: Optional[Annotated[str, Field(pattern=r"^[A-Z0-9-]{4,20}$")]] = None
    nssfNumber: Optional[Annotated[str, Field(pattern=r"^[A-Z0-9-]{4,20}$")]] = None
    passportNumber: Optional[Annotated[str, Field(pattern=r"^[A-Z0-9-]{4,20}$")]] = None
    gender: Optional[Literal["Female", "Male"]] = None

    @field_validator("kraPin", "shifNumber", "nssfNumber", "passportNumber", mode="before")
    @classmethod
    def _upper(cls, v: Any) -> Any:
        return v.upper().replace(" ", "") if isinstance(v, str) else v


class JobPatch(BaseModel):
    """What HR edits on someone else's profile: employment details only (department, manager,
    type, status and salary go through PATCH /employees/{id}). Personal data stays with the employee."""

    model_config = ConfigDict(extra="forbid")

    title: Optional[Annotated[str, StringConstraints(min_length=2, max_length=120)]] = None
    location: Optional[Annotated[str, StringConstraints(max_length=120)]] = None

    @field_validator("*", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return _t(v)


EMPLOYEE_FIELDS = {"phone": "phone", "birthday": "birthday", "kraPin": "kra_pin", "nationalId": "national_id", "title": "title", "location": "location", "gender": "gender"}
PROFILE_FIELDS = {
    "preferredName": "preferred_name", "personalEmail": "personal_email", "address": "address", "city": "city",
    "maritalStatus": "marital_status", "nationality": "nationality", "emergencyName": "emergency_name",
    "emergencyRelationship": "emergency_relationship", "emergencyPhone": "emergency_phone", "bankName": "bank_name",
    "bankBranch": "bank_branch", "bankAccountName": "bank_account_name", "bankAccountNumber": "bank_account_number",
    "shifNumber": "shif_number", "nssfNumber": "nssf_number", "passportNumber": "passport_number",
}
#: Required on employees (NOT NULL) — can't be cleared.
NOT_NULL = {"title"}


def _patch(id: str, request: Request, body: Any, auth: AuthContext) -> dict[str, Any]:
    is_self = id == auth.employeeId
    admin = is_admin(auth.role)
    if not is_self and not admin:
        raise forbidden("You can only edit your own profile")
    if is_self and admin:
        # HR editing their own record: their personal data plus their own job details.
        b = parse(type("OwnAdminPatch", (SelfPatch, JobPatch), {"model_config": ConfigDict(extra="forbid")}), body if isinstance(body, dict) else {})
    else:
        if not is_self and isinstance(body, dict):
            personal = sorted(set(body) - set(JobPatch.model_fields))
            if personal:
                raise forbidden(f"Personal, bank and statutory details are managed by the employee ({', '.join(personal)})")
        b = parse(SelfPatch if is_self else JobPatch, body if isinstance(body, dict) else {})
    fields = {k: getattr(b, k) for k in b.model_fields_set}
    if not fields:
        raise bad_request("Nothing to update")
    for k in NOT_NULL:
        if k in fields and fields[k] is None:
            raise bad_request("Validation failed", [{"path": k, "message": "This field is required"}])
    emp = {EMPLOYEE_FIELDS[k]: v for k, v in fields.items() if k in EMPLOYEE_FIELDS}
    prof = {PROFILE_FIELDS[k]: (str(v) if v is not None else None) for k, v in fields.items() if k in PROFILE_FIELDS}

    with tx() as db:
        if not query_one("SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2", [id, auth.workspaceId], db):
            raise not_found("Employee")
        if emp:
            sets = ", ".join(f"{c} = ${i + 3}" for i, c in enumerate(emp))
            query(f"UPDATE employees SET {sets}, updated_at = now() WHERE id = $1 AND workspace_id = $2", [id, auth.workspaceId, *emp.values()], db)
        if prof:
            cols = list(prof)
            query(
                f"""INSERT INTO employee_profiles (employee_id, workspace_id, {", ".join(cols)}) VALUES ($1, $2, {", ".join(f"${i + 3}" for i in range(len(cols)))})
             ON CONFLICT (employee_id) DO UPDATE SET {", ".join(f"{c} = EXCLUDED.{c}" for c in cols)}, updated_at = now()""",
                [id, auth.workspaceId, *prof.values()],
                db,
            )
        # Field names only — never the values (bank and ID numbers).
        audit(request, auth, "profile.updated", "employee", id, {"fields": sorted(fields)}, db)
        return load_profile(auth, id, db)


@router.patch("/employees/me/profile")
def patch_my_profile(request: Request, body: Any = Body(default={}), auth: AuthContext = Depends(require_auth)):
    return _patch(auth.employeeId, request, body, auth)


@router.patch("/employees/{id}/profile")
def patch_profile(id: str, request: Request, body: Any = Body(default={}), auth: AuthContext = Depends(require_auth)):
    return _patch(auth.employeeId if id == "me" else id, request, body, auth)
