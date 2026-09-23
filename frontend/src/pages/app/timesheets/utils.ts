import { addDays, format, parseISO } from 'date-fns'
import type { Timesheet } from '@/data/types'

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const CURRENT_WEEK = '2026-09-21'
export const WEEKLY_CAPACITY = 40

export type Entry = Timesheet['entries'][number]

export const rowTotal = (e: Entry) => e.hours.reduce((a, h) => a + (Number(h) || 0), 0)
export const sheetTotal = (t: Pick<Timesheet, 'entries'>) => t.entries.reduce((a, e) => a + rowTotal(e), 0)
export const sheetBillable = (t: Pick<Timesheet, 'entries'>) => t.entries.filter((e) => e.billable).reduce((a, e) => a + rowTotal(e), 0)
export const dayTotal = (t: Pick<Timesheet, 'entries'>, d: number) => t.entries.reduce((a, e) => a + (Number(e.hours[d]) || 0), 0)

export const shiftWeek = (week: string, n: number) => format(addDays(parseISO(week), n * 7), 'yyyy-MM-dd')
export const dayDate = (week: string, d: number) => addDays(parseISO(week), d)

export function weekLabel(week: string) {
  const start = parseISO(week)
  const end = addDays(start, 6)
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

export const fmtH = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1))
