import type { Employee, Role } from '@/data/types'
import { daysUntil } from '@/lib/utils'

export function addDays(date: string, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Masks all but the last `keep` characters. */
export function mask(value: string, keep = 3) {
  if (value.length <= keep) return value
  return '•'.repeat(Math.max(4, value.length - keep)) + value.slice(-keep)
}

export function tenure(startDate: string) {
  const days = Math.max(0, -daysUntil(startDate))
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  if (years === 0 && months === 0) return `${days} day${days === 1 ? '' : 's'}`
  if (years === 0) return `${months} mo`
  return `${years} yr${years > 1 ? 's' : ''}${months ? ` ${months} mo` : ''}`
}

export function reportsToChain(emp: Employee, lookup: (id?: string) => Employee | undefined) {
  const chain: Employee[] = []
  let cur = lookup(emp.managerId)
  const seen = new Set<string>([emp.id])
  while (cur && !seen.has(cur.id)) {
    chain.push(cur)
    seen.add(cur.id)
    cur = lookup(cur.managerId)
  }
  return chain
}

export interface PendingInvite {
  id: string
  email: string
  departmentId: string
  role: Role
  sent: string
}

export const inviteRoles: Role[] = ['employee', 'manager', 'hr_officer', 'consultant', 'finance', 'company_admin']

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
