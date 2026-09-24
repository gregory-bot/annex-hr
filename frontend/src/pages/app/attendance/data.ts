import { addDays, format, isWeekend, parseISO, startOfWeek } from 'date-fns'
import type { Employee, LeaveRequest, LeaveType } from '@/data/types'
import { TODAY } from '@/lib/utils'

/** Deterministic 0–1 value from a string, so demo data is stable across renders. */
export function hash01(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

export const iso = (d: Date) => format(d, 'yyyy-MM-dd')
export const today = parseISO(TODAY)
export const thisMonday = startOfWeek(today, { weekStartsOn: 1 })

export const SHIFT = { start: '08:30', end: '17:30', graceMin: 10, hoursPerDay: 8, hoursPerWeek: 40, hoursPerMonth: 160 }

export const minutesToHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`

export type EntryStatus = 'On time' | 'Late' | 'Overtime'

export interface DayEntry {
  date: string
  day: string
  inMin: number
  outMin: number
  breakMin: number
  hours: number
  overtime: number
  status: EntryStatus
}

/** A plausible clock-in / clock-out for a person on a given date. */
export function entryFor(seed: string, date: string): DayEntry {
  const r1 = hash01(seed + date + 'in')
  const r2 = hash01(seed + date + 'out')
  const inMin = 8 * 60 + 12 + Math.round(r1 * 42) // 08:12–08:54
  const outMin = 17 * 60 + 20 + Math.round(r2 * 120) // 17:20–19:20
  const breakMin = 45 + Math.round(hash01(seed + date + 'brk') * 6) * 5 // 45–75 min lunch & tea
  const hours = +((outMin - inMin - breakMin) / 60).toFixed(1)
  const late = inMin > 8 * 60 + 30 + SHIFT.graceMin
  const status: EntryStatus = late ? 'Late' : hours > 9 ? 'Overtime' : 'On time'
  return { date, day: format(parseISO(date), 'EEE'), inMin, outMin, breakMin, hours, overtime: +Math.max(0, hours - SHIFT.hoursPerDay).toFixed(1), status }
}

export type DayStatus = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'weekend' | 'upcoming' | 'none'

export const statusMeta: Record<Exclude<DayStatus, 'weekend' | 'upcoming' | 'none'>, { label: string; cell: string; dot: string }> = {
  present: { label: 'Present', cell: 'bg-success-soft text-success', dot: 'bg-success' },
  late: { label: 'Late', cell: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  absent: { label: 'Absent', cell: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  leave: { label: 'On leave', cell: 'bg-info-soft text-info', dot: 'bg-info' },
  holiday: { label: 'Holiday', cell: 'bg-accent text-accent-foreground', dot: 'bg-primary' },
}

export function personalStatus(seed: string, date: string, holidays: Set<string>): DayStatus {
  const d = parseISO(date)
  if (isWeekend(d)) return 'weekend'
  if (holidays.has(date)) return 'holiday'
  if (date > TODAY) return 'upcoming'
  if (date === TODAY) return 'present'
  // A fixed week of annual leave in mid-July for realism
  if (date >= '2026-07-13' && date <= '2026-07-17') return 'leave'
  const r = hash01(seed + date)
  if (r < 0.03) return 'absent'
  if (r < 0.06) return 'leave'
  return entryFor(seed, date).status === 'Late' ? 'late' : 'present'
}

export interface HeatCell {
  date: string
  pct: number | null
}

/** Last `weeks` weeks × Mon–Fri of org-wide presence %. */
export function orgHeatmap(weeks: number, holidays: Set<string>, wsSeed: string): HeatCell[][] {
  const first = addDays(thisMonday, -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 5 }, (_, d) => {
      const date = iso(addDays(first, w * 7 + d))
      if (date > TODAY) return { date, pct: null }
      if (holidays.has(date)) return { date, pct: 8 + Math.round(hash01(wsSeed + date) * 6) }
      const base = d === 4 ? 82 : d === 0 ? 86 : 90 // Fridays & Mondays dip
      return { date, pct: Math.min(100, base + Math.round(hash01(wsSeed + date) * 10) - 2) }
    }),
  )
}

export function weekDates(monday: Date) {
  return Array.from({ length: 5 }, (_, i) => iso(addDays(monday, i)))
}

/** Weekdays from the 1st of TODAY's month up to and including TODAY. */
export function monthToDate() {
  const first = parseISO(TODAY.slice(0, 8) + '01')
  const out: string[] = []
  for (let d = first; iso(d) <= TODAY; d = addDays(d, 1)) if (!isWeekend(d)) out.push(iso(d))
  return out
}

export type RosterStatus = 'On time' | 'Late' | 'Absent' | 'On leave'

export interface RosterEntry {
  employee: Employee
  status: RosterStatus
  /** Clock-in minute of day, when present. */
  inMin?: number
  lateMin?: number
}

/**
 * Today's attendance for the organisation. Deterministic: people on approved
 * leave first, then `late` and `absent` counts are assigned by a stable hash.
 */
export function todayRoster(active: Employee[], counts: { late: number; absent: number }, onLeaveIds: Set<string>): RosterEntry[] {
  const shiftStart = 8 * 60 + 30
  const working = active.filter((e) => !onLeaveIds.has(e.id)).sort((a, b) => hash01(a.id + TODAY) - hash01(b.id + TODAY))
  const leave: RosterEntry[] = active.filter((e) => onLeaveIds.has(e.id)).map((employee) => ({ employee, status: 'On leave' }))
  return [
    ...working.map((employee, i): RosterEntry => {
      if (i < counts.late) {
        const lateMin = 12 + Math.round(hash01(employee.id + 'late') * 38) + i
        return { employee, status: 'Late', lateMin, inMin: shiftStart + lateMin }
      }
      if (i < counts.late + counts.absent) return { employee, status: 'Absent' }
      return { employee, status: 'On time', inMin: 8 * 60 + 2 + Math.round(hash01(employee.id + TODAY + 'in') * 36) }
    }),
    ...leave,
  ]
}

/** Who is on leave today: approved requests covering TODAY, plus anyone flagged "On Leave". */
export function leaveToday(employees: Employee[], requests: LeaveRequest[]) {
  const out = new Map<string, { type: LeaveType | null; end: string | null }>()
  requests.filter((r) => r.status === 'Approved' && r.start <= TODAY && r.end >= TODAY).forEach((r) => out.set(r.employeeId, { type: r.type, end: r.end }))
  employees.filter((e) => e.status === 'On Leave' && !out.has(e.id)).forEach((e) => out.set(e.id, { type: null, end: null }))
  return out
}
