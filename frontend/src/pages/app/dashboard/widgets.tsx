import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Section } from '@/components/shared/Section'
import { EmptyState } from '@/components/shared/EmptyState'
import { Legend, SERIES } from '@/components/charts/ChartKit'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { cn, formatDate } from '@/lib/utils'
import type { Employee, LeaveType } from '@/data/types'
import { minutesToHM, type RosterEntry } from '../attendance/data'
import { dayLabel, type DashEvent, type EventKind } from './events'

/** Overlapping avatars with a "+n" overflow chip. */
export function AvatarStack({ names, max = 3, className, size = 'md' }: { names: string[]; max?: number; className?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'size-6 text-[9px] [&>span]:text-[9px]' : 'size-7 text-[10px] [&>span]:text-[10px]'
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div className={cn('flex -space-x-2', className)}>
      {shown.map((n) => (
        <Tip key={n} label={n}>
          <span className="rounded-full ring-2 ring-card">
            <PersonAvatar name={n} className={dim} />
          </span>
        </Tip>
      ))}
      {extra > 0 && <span className={cn('flex items-center justify-center rounded-full bg-muted font-semibold', dim, ' text-muted-foreground ring-2 ring-card')}>+{extra}</span>}
    </div>
  )
}

/* ─────────────── Employee status ─────────────── */

const STATUS_GROUPS = ['Full-time', 'Contract', 'Probation', 'Consultant', 'Part-time', 'Intern'] as const
type StatusGroup = (typeof STATUS_GROUPS)[number]

function groupOf(e: Employee): StatusGroup {
  if (e.status === 'Probation') return 'Probation'
  return e.employmentType
}

export function EmployeeStatusCard({ active, className }: { active: Employee[]; className?: string }) {
  const total = Math.max(1, active.length)
  // Colour is assigned by group (fixed order), not by position, so it never shifts.
  const groups = STATUS_GROUPS.map((g, i) => ({ g, color: SERIES[i]!, count: active.filter((e) => groupOf(e) === g).length })).filter((x) => x.count > 0)
  return (
    <Section title="Employee status" description="By employment type" className={cn('h-full', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight tabular">{active.length}</span>
        <span className="text-sm text-muted-foreground">active employees</span>
      </div>
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Employees by employment type">
        {groups.map((x, i) => (
          <motion.div
            key={x.g}
            className="h-full"
            style={{ background: x.color, boxShadow: i ? 'inset 2px 0 0 var(--card)' : undefined }}
            initial={{ width: 0 }}
            animate={{ width: `${(x.count / total) * 100}%` }}
            transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
            title={`${x.g}: ${x.count}`}
          />
        ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-2">
        {groups.map((x) => (
          <li key={x.g} className="rounded-lg border px-3 py-2">
            <Legend items={[{ label: x.g, color: x.color }]} />
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular">{x.count}</span>
              <span className="text-xs text-muted-foreground tabular">{Math.round((x.count / total) * 100)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ─────────────── Clock-in / out ─────────────── */

export function ClockInList({ roster, className }: { roster: RosterEntry[]; className?: string }) {
  const onTime = roster.filter((r) => r.status === 'On time').sort((a, b) => (a.inMin ?? 0) - (b.inMin ?? 0))
  const late = roster.filter((r) => r.status === 'Late').sort((a, b) => (b.lateMin ?? 0) - (a.lateMin ?? 0))
  const Row = ({ r }: { r: RosterEntry }) => (
    <li className="flex items-center gap-3 py-2">
      <PersonAvatar name={r.employee.name} className="size-8" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.employee.name}</div>
        <div className="truncate text-xs text-muted-foreground">{r.employee.title}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Badge variant="muted" className="tabular">
          {minutesToHM(r.inMin ?? 0)}
        </Badge>
        {r.lateMin !== undefined && <span className="text-[11px] text-warning tabular">{r.lateMin} min late</span>}
      </div>
    </li>
  )
  return (
    <Section
      title="Clock-in today"
      description={`${onTime.length + late.length} clocked in · shift 08:30`}
      className={cn('h-full', className)}
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/attendance">View all</Link>
        </Button>
      }
    >
      <ul className="divide-y">
        {onTime.slice(0, 4).map((r) => (
          <Row key={r.employee.id} r={r} />
        ))}
      </ul>
      {late.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="warning" dot>
              Late
            </Badge>
            <span className="text-xs text-muted-foreground">{late.length} after 08:40 grace</span>
          </div>
          <ul className="divide-y">
            {late.slice(0, 3).map((r) => (
              <Row key={r.employee.id} r={r} />
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

/* ─────────────── Quick access ─────────────── */

export interface QuickLink {
  label: string
  href: string
  hint: string
}

export const QUICK_LINKS: Record<string, QuickLink> = {
  apply: { label: 'Apply leave', href: '/app/leave?apply=1', hint: 'Request time off' },
  approvals: { label: 'Leave approvals', href: '/app/leave?tab=approvals', hint: 'Pending requests' },
  calendar: { label: 'Leave calendar', href: '/app/leave?tab=calendar', hint: 'Who is away' },
  invite: { label: 'Invite employee', href: '/app/people?invite=1', hint: 'Send an invite' },
  payroll: { label: 'Run payroll', href: '/app/payroll', hint: 'Current period' },
  ticket: { label: 'New ticket', href: '/app/tickets?new=1', hint: 'HR & IT help' },
}

export function QuickAccess({ links, className }: { links: QuickLink[]; className?: string }) {
  return (
    <Section title="Quick access" className={cn('h-full', className)}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link to={l.href} className="flex h-full flex-col justify-center gap-0.5 rounded-lg border px-3 py-3 transition-colors hover:border-primary/30 hover:bg-accent/50">
              <span className="text-[13px] font-medium leading-tight">{l.label}</span>
              <span className="truncate text-xs text-muted-foreground">{l.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ─────────────── Upcoming events ─────────────── */

const kindDot: Record<EventKind, string> = { Interview: 'bg-primary', Meeting: 'bg-info', Holiday: 'bg-success', Birthday: 'bg-warning' }

export function UpcomingEvents({ events: all, max = 5, className, description }: { events: DashEvent[]; max?: number; className?: string; description?: string }) {
  const events = all.slice(0, max)
  const days = [...new Set(events.map((e) => e.date))]
  return (
    <Section title="Upcoming events" description={description} className={cn('h-full', className)}>
      {days.length === 0 ? (
        <EmptyState title="Nothing scheduled" />
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{dayLabel(d)}</div>
              <ul className="space-y-2">
                {events
                  .filter((e) => e.date === d)
                  .map((e) => {
                    return (
                      <li key={e.id} className="rounded-lg border p-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('size-2 shrink-0 rounded-full', kindDot[e.kind])} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="muted" className="shrink-0 px-1.5 py-0 tabular">
                            {e.time ?? 'All day'}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate">{e.sub ?? e.kind}</span>
                          {e.attendees.length > 0 && <AvatarStack names={e.attendees} className="shrink-0" />}
                        </div>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

/* ─────────────── On leave today ─────────────── */

export function OnLeaveToday({ people, className }: { people: { employee: Employee; type: LeaveType | null; end: string | null }[]; className?: string }) {
  return (
    <Section
      title="On leave today"
      description={`${people.length} employee${people.length === 1 ? '' : 's'}`}
      className={cn('h-full', className)}
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/leave?tab=calendar">Calendar</Link>
        </Button>
      }
    >
      {people.length === 0 ? (
        <EmptyState title="Everyone is in today" />
      ) : (
        <ul className="divide-y">
          {people.slice(0, 6).map(({ employee: e, type, end }) => (
            <li key={e.id} className="flex items-center gap-3 py-2 first:pt-0">
              <PersonAvatar name={e.name} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {e.employeeNo}
                  {end ? ` · back ${formatDate(end, 'short')}` : ''}
                </div>
              </div>
              <Badge variant="info" className="shrink-0">
                {type ? `${type}` : 'Leave'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/* ─────────────── To-do ─────────────── */

export function TodoCard({ initial, className }: { initial: string[]; className?: string }) {
  const [items, setItems] = useState(() => initial.map((title, i) => ({ id: `t${i}`, title, done: false })))
  const [draft, setDraft] = useState('')
  const open = items.filter((i) => !i.done).length
  const add = (ev: React.FormEvent) => {
    ev.preventDefault()
    const title = draft.trim()
    if (!title) return
    setItems((xs) => [{ id: `t${Date.now()}`, title, done: false }, ...xs])
    setDraft('')
    toast.success('Added to your to-do list')
  }
  return (
    <Section title="To-do" description={`${open} open · ${items.length - open} done`} className={cn('h-full', className)}>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task" aria-label="New task" className="h-9" />
        <Button type="submit" size="icon" variant="outline" aria-label="Add task" className="size-9 shrink-0">
          <Plus />
        </Button>
      </form>
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.li key={t.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 rounded-md px-1 py-1.5">
              <Checkbox id={t.id} checked={t.done} onCheckedChange={(v) => setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, done: v === true } : x)))} />
              <label htmlFor={t.id} className={cn('min-w-0 flex-1 cursor-pointer text-sm', t.done && 'text-muted-foreground line-through')}>
                {t.title}
              </label>
              <button
                type="button"
                aria-label="Remove task"
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Section>
  )
}
