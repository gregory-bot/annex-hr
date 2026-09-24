"""Role groups — the server is the source of truth for data access (mirrors frontend/src/lib/rbac.ts)."""

from typing import Literal

Role = Literal["super_admin", "company_admin", "hr_officer", "manager", "employee", "consultant", "finance", "ceo"]
ROLES: tuple[str, ...] = ("super_admin", "company_admin", "hr_officer", "manager", "employee", "consultant", "finance", "ceo")

ADMIN = ("super_admin", "company_admin", "hr_officer")
EXEC = (*ADMIN, "ceo")
LEADERS = (*EXEC, "manager")
PAYROLL = (*EXEC, "finance")


def is_admin(role: str) -> bool:
    return role in ADMIN


def is_exec(role: str) -> bool:
    return role in EXEC


def is_leader(role: str) -> bool:
    return role in LEADERS


def can_see_pay(role: str) -> bool:
    return role in PAYROLL
