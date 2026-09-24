import { addDays, format, parseISO } from 'date-fns'
import type { Employee, Holiday } from '@/data/types'
import { TODAY, daysUntil } from '@/lib/utils'
import { hash01 } from '../attendance/data'
import { daysToBirthday } from './utils'

export type EventKind = 'Interview' | 'Meeting' | 'Holiday' | 'Birthday'

export interface DashEvent {
  id: string
  date: string
  /** HH:MM, or undefined for all-day events. */
  time?: string
  kind: EventKind
  title: string
  sub?: string
  attendees: string[]
}

const day = (offset: number) => format(addDays(parseISO(TODAY), offset), 'yyyy-MM-dd')

/** Stable pick of `n` people for a given key. */
export function pickPeople(people: Employee[], key: string, n: number) {
  return [...people].sort((a, b) => hash01(a.id + key) - hash01(b.id + key)).slice(0, n)
}

function sharedEvents(holidays: Holiday[], country: string, birthdayPool: Employee[], windowDays: number): DashEvent[] {
  const hols = holidays
    .filter((h) => (h.country === country || h.country === 'Kenya') && daysUntil(h.date) >= 0 && daysUntil(h.date) <= windowDays)
    .map((h): DashEvent => ({ id: `hol-${h.date}-${h.name}`, date: h.date, kind: 'Holiday', title: h.name, sub: `Public holiday · ${h.country}`, attendees: [] }))
  const bdays = birthdayPool
    .filter((e) => e.status !== 'Exited')
    .map((e) => ({ e, ...daysToBirthday(e.birthday) }))
    .filter((b) => b.days <= Math.min(7, windowDays))
    .map((b): DashEvent => ({ id: `bd-${b.e.id}`, date: b.date, kind: 'Birthday', title: `${b.e.name.split(' ')[0]}'s birthday`, sub: b.e.title, attendees: [b.e.name] }))
  return [...hols, ...bdays]
}

/** Interviews, meetings, holidays and birthdays for the organisation. */
export function orgEvents(active: Employee[], holidays: Holiday[], country: string): DashEvent[] {
  const roles = pickPeople(active, 'role', 2)
  const names = (key: string, n: number) => pickPeople(active, key, n).map((e) => e.name)
  const events: DashEvent[] = [
    { id: 'int-1', date: day(0), time: '10:00', kind: 'Interview', title: `Interview · ${roles[0]?.title ?? 'Software Engineer'}`, sub: 'Panel · second round', attendees: names('int1', 3) },
    { id: 'mt-1', date: day(0), time: '14:30', kind: 'Meeting', title: 'Leave & attendance review', sub: 'People Ops weekly', attendees: names('mt1', 4) },
    { id: 'mt-2', date: day(1), time: '09:30', kind: 'Meeting', title: 'September payroll sign-off', sub: 'Finance · CEO approval', attendees: names('mt2', 3) },
    { id: 'int-2', date: day(1), time: '15:00', kind: 'Interview', title: `Interview · ${roles[1]?.title ?? 'Product Designer'}`, sub: 'Final round', attendees: names('int2', 2) },
    { id: 'mt-3', date: day(2), time: '16:00', kind: 'Meeting', title: 'Monthly all-hands', sub: 'Main boardroom & online', attendees: names('mt3', 6) },
    ...sharedEvents(holidays, country, active, 30),
  ]
  return sortEvents(events)
}

/** A personal agenda: 1:1, team meeting, team birthdays and holidays. */
export function personalEvents(user: Employee, team: Employee[], manager: Employee | undefined, holidays: Holiday[], country: string): DashEvent[] {
  const events: DashEvent[] = [
    ...(manager ? [{ id: '1on1', date: day(1), time: '11:00', kind: 'Meeting' as const, title: `1:1 with ${manager.name.split(' ')[0]}`, sub: 'Q3 check-in', attendees: [manager.name, user.name] }] : []),
    { id: 'team', date: day(2), time: '10:00', kind: 'Meeting', title: 'Team planning', sub: 'Sprint and priorities', attendees: pickPeople(team, 'team', 4).map((e) => e.name) },
    ...sharedEvents(holidays, country, team, 30),
  ]
  return sortEvents(events)
}

function sortEvents(events: DashEvent[]) {
  return events.sort((a, b) => (a.date + (a.time ?? '00:00')).localeCompare(b.date + (b.time ?? '00:00')))
}

export function dayLabel(date: string) {
  const d = daysUntil(date)
  const base = format(parseISO(date), 'EEE d MMM')
  return d === 0 ? `Today · ${base}` : d === 1 ? `Tomorrow · ${base}` : base
}
