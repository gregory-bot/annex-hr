import { addDays, format, parseISO } from 'date-fns'
import type { Employee, HRCase, Role } from '@/data/types'
import { TODAY } from '@/lib/utils'

export const CASE_STAGES: HRCase['status'][] = ['Logged', 'Investigating', 'Hearing', 'Awaiting Approval', 'Closed']
export const CASE_TYPES: HRCase['type'][] = ['Disciplinary', 'Grievance', 'Harassment', 'Misconduct', 'Performance']
export const SEVERITIES: HRCase['severity'][] = ['Low', 'Medium', 'High', 'Critical']

export type ApprovalState = 'Approved' | 'Rejected' | 'Pending' | 'Waiting'

export interface CaseApproval {
  key: 'investigator' | 'hr' | 'ceo'
  stage: string
  approver: string
  status: ApprovalState
  at?: string
  roles: Role[]
}

export interface CaseNote {
  id: string
  kind: 'manager' | 'hr'
  by: string
  date: string
  text: string
}

export interface AccessEntry {
  id: string
  who: string
  role: string
  action: string
  at: string
  reason?: string
}

export interface CaseRecord extends HRCase {
  notes: CaseNote[]
  approvals: CaseApproval[]
  accessLog: AccessEntry[]
}

export function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function hash(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic HH:mm for demo timestamps. */
export function clock(seed: string) {
  const h = hash(seed)
  return `${String(8 + (h % 10)).padStart(2, '0')}:${String((h >> 3) % 60).padStart(2, '0')}`
}

export const MASK = '•••• ••••'

export function buildApprovals(c: HRCase, hr?: Employee, ceo?: Employee): CaseApproval[] {
  const idx = CASE_STAGES.indexOf(c.status)
  const closed = c.status === 'Closed'
  const awaiting = c.status === 'Awaiting Approval'
  const inv: ApprovalState = closed || awaiting ? 'Approved' : idx >= 2 ? 'Pending' : 'Waiting'
  const hrS: ApprovalState = closed || awaiting ? (closed ? 'Approved' : 'Pending') : 'Waiting'
  const ceoS: ApprovalState = closed ? 'Approved' : 'Waiting'
  const base = c.opened
  return [
    { key: 'investigator', stage: 'Investigator recommendation', approver: hr?.name ?? 'Case investigator', status: inv, at: inv === 'Approved' ? shiftDate(base, 10) : undefined, roles: ['hr_officer', 'company_admin', 'super_admin'] },
    { key: 'hr', stage: 'HR Head review', approver: hr?.name ?? 'Head of HR', status: hrS, at: hrS === 'Approved' ? shiftDate(base, 12) : undefined, roles: ['company_admin', 'super_admin'] },
    { key: 'ceo', stage: 'CEO sign-off', approver: ceo?.name ?? 'Chief Executive', status: ceoS, at: ceoS === 'Approved' ? shiftDate(base, 14) : undefined, roles: ['ceo', 'super_admin'] },
  ]
}

export function buildNotes(c: HRCase, hr?: Employee, manager?: Employee): CaseNote[] {
  return [
    {
      id: `${c.id}-n1`,
      kind: 'manager',
      by: manager?.name ?? 'Line manager',
      date: shiftDate(c.opened, 1),
      text: 'Discussed expectations informally before escalation. Employee acknowledged the concern and asked for more support from the team lead.',
    },
    {
      id: `${c.id}-n2`,
      kind: 'hr',
      by: hr?.name ?? 'HR',
      date: shiftDate(c.opened, 2),
      text: 'Reviewed prior record — no previous warnings on file. Recommend a fair-hearing process under Section 41 of the Employment Act before any sanction.',
    },
  ]
}

export function buildAccessLog(c: HRCase, hr?: Employee, ceo?: Employee): AccessEntry[] {
  const entries: AccessEntry[] = []
  const days = Math.max(0, Math.min(20, -Math.ceil((parseISO(c.opened).getTime() - parseISO(TODAY).getTime()) / 86_400_000)))
  const people = [
    { who: hr?.name ?? 'HR Admin', role: 'Company Admin (HR)' },
    { who: ceo?.name ?? 'CEO', role: 'CEO' },
  ]
  const actions = ['Viewed case file', 'Opened evidence', 'Viewed timeline', 'Downloaded intake statement', 'Viewed notes']
  const n = 4 + (hash(c.id) % 3)
  for (let i = 0; i < n; i++) {
    const p = people[(hash(c.id + i) % 5 === 0 ? 1 : 0)]!
    const dayOffset = Math.round((days * (n - i)) / n)
    entries.push({
      id: `${c.id}-a${i}`,
      who: p.who,
      role: p.role,
      action: actions[hash(c.id + 'a' + i) % actions.length]!,
      at: `${shiftDate(TODAY, -dayOffset)} ${clock(c.id + i)}`,
    })
  }
  return entries.sort((a, b) => (a.at < b.at ? 1 : -1))
}

export function resolutionDays(c: HRCase) {
  const closed = c.timeline.find((t) => t.title === 'Case closed')
  if (!closed) return null
  return Math.round((parseISO(closed.date).getTime() - parseISO(c.opened).getTime()) / 86_400_000)
}
