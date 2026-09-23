import type { Role } from '@annex/shared/types'

// Mirrors frontend/src/lib/rbac.ts — the server is the source of truth for data access.
export const ADMIN: Role[] = ['super_admin', 'company_admin', 'hr_officer']
export const EXEC: Role[] = [...ADMIN, 'ceo']
export const LEADERS: Role[] = [...EXEC, 'manager']
export const PAYROLL: Role[] = [...EXEC, 'finance']

export const isAdmin = (r: Role) => ADMIN.includes(r)
export const isExec = (r: Role) => EXEC.includes(r)
export const isLeader = (r: Role) => LEADERS.includes(r)
export const canSeePay = (r: Role) => PAYROLL.includes(r)
