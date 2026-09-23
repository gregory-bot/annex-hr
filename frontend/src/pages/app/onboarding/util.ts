import type { Employee, Role } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'

/** Deterministic 0..1 value from a string seed. */
export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10_000) / 10_000
}

export function seededInt(seed: string, min: number, max: number) {
  return min + Math.floor(seeded(seed) * (max - min + 1))
}

export const SELF_ROLES: Role[] = ['employee', 'consultant']
export const isSelfRole = (r: Role) => SELF_ROLES.includes(r)

/** Employees the current user may oversee (org for admins, team for managers). */
export function scopeEmployees(all: Employee[], user: Employee, role: Role) {
  if (isAdminLike(role)) return all
  if (role === 'manager') {
    const team = all.filter((e) => e.id !== user.id && (e.managerId === user.id || e.departmentId === user.departmentId))
    return team.length ? team : all
  }
  return all.filter((e) => e.id === user.id)
}

export function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
