import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import { Baby, BookOpen, HeartHandshake, HeartPulse, TreePalm, Users, type LucideIcon } from 'lucide-react'
import type { Holiday, LeaveRequest, LeaveType } from '@/data/types'
import { SERIES } from '@/components/charts/ChartKit'

export const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study']

export const leaveMeta: Record<LeaveType, { entitlement: number; icon: LucideIcon; color: string; note: string }> = {
  Annual: { entitlement: 21, icon: TreePalm, color: SERIES[0], note: 'Accrues 1.75 days / month' },
  Sick: { entitlement: 30, icon: HeartPulse, color: SERIES[1], note: 'Full pay · doctor’s note after 2 days' },
  Maternity: { entitlement: 90, icon: Baby, color: SERIES[2], note: 'Employment Act §29' },
  Paternity: { entitlement: 14, icon: Users, color: SERIES[3], note: 'Within 30 days of birth' },
  Compassionate: { entitlement: 5, icon: HeartHandshake, color: SERIES[4], note: 'Bereavement & family' },
  Study: { entitlement: 10, icon: BookOpen, color: SERIES[5], note: 'Approved exams only' },
}

export const ANNUAL_ACCRUAL = 1.75

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd')

/** Working days in a range: excludes weekends and public holidays. */
export function workingDays(from: Date, to: Date, holidays: Holiday[]) {
  const holidaySet = new Set(holidays.map((h) => h.date))
  if (to < from) return { days: 0, excluded: [] as Holiday[] }
  const all = eachDayOfInterval({ start: from, end: to })
  const excluded: Holiday[] = []
  let days = 0
  for (const d of all) {
    if (isWeekend(d)) continue
    const iso = toISO(d)
    if (holidaySet.has(iso)) {
      excluded.push(holidays.find((h) => h.date === iso)!)
      continue
    }
    days++
  }
  return { days, excluded }
}

export function needsCEO(days: number, type: LeaveType) {
  return days > 10 || type === 'Maternity' || type === 'Study'
}

export type Stage = 'manager' | 'hr' | 'ceo' | 'approved' | 'rejected'

export function stageOf(r: LeaveRequest): Stage {
  if (r.status === 'Approved') return 'approved'
  if (r.status === 'Rejected') return 'rejected'
  if (r.stage === 'CEO') return 'ceo'
  if (r.stage === 'HR') return 'hr'
  return 'manager'
}

/** Advance one approval step. */
export function approveStep(r: LeaveRequest): LeaveRequest {
  if (r.stage === 'Manager') return { ...r, stage: 'HR' }
  if (r.stage === 'HR') return needsCEO(r.days, r.type) ? { ...r, stage: 'CEO' } : { ...r, stage: 'Complete', status: 'Approved' }
  return { ...r, stage: 'Complete', status: 'Approved' }
}

export function overlaps(a: LeaveRequest, b: LeaveRequest) {
  return a.start <= b.end && b.start <= a.end
}

export function routeFor(days: number, type: LeaveType) {
  return needsCEO(days, type) ? (['Manager', 'HR', 'CEO'] as const) : (['Manager', 'HR'] as const)
}

export const parse = (s: string) => parseISO(s)
