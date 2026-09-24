import { useMemo } from 'react'
import { Section } from '@/components/shared/Section'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TODAY, cn, formatDate } from '@/lib/utils'
import { SHIFT, entryFor, monthToDate, personalStatus, thisMonday, weekDates } from './data'
import { hm, hms, hrs, type Clock } from './workday'

const H = 3_600_000

/** Atend-style timesheet: punch time, hours ring, punch button, break & overtime. */
export function TimesheetCard({ clock, className }: { clock: Clock; className?: string }) {
  const { state, elapsed, breakMs, firstIn, toggle, toggleBreak, statusLabel } = clock
  const overtime = Math.max(0, elapsed - SHIFT.hoursPerDay * H)
  return (
    <Section
      title="Timesheet"
      description={formatDate(TODAY, 'long')}
      className={cn('h-full', className)}
      action={
        <Badge variant={state.clockedIn ? (state.onBreak ? 'warning' : 'success') : 'muted'} dot>
          {statusLabel}
        </Badge>
      }
    >
      <div className="rounded-lg border bg-subtle px-3 py-2.5">
        <div className="text-xs text-muted-foreground">Punched in at</div>
        <div className="text-sm font-semibold tabular">{firstIn === null ? '—' : `${formatDate(TODAY, 'short')} · ${hm(firstIn)}`}</div>
      </div>
      <div className="flex justify-center py-5">
        <ProgressRing
          value={(elapsed / (SHIFT.hoursPerDay * H)) * 100}
          size={148}
          stroke={10}
          label={
            <span className="flex flex-col items-center">
              <span className="text-2xl font-bold tabular">{hrs(elapsed)}</span>
              <span className="text-xs font-medium text-muted-foreground">hrs today</span>
              <span className="mt-1 font-mono text-[11px] font-normal text-muted-foreground tabular">{hms(elapsed)}</span>
            </span>
          }
        />
      </div>
      <div className={cn('grid gap-2', state.clockedIn ? 'grid-cols-2' : 'grid-cols-1')}>
        {state.clockedIn && (
          <Button variant="outline" onClick={toggleBreak}>
            {state.onBreak ? 'Resume' : 'Break'}
          </Button>
        )}
        <Button variant={state.clockedIn ? 'secondary' : 'default'} onClick={() => toggle()}>
          {state.clockedIn ? 'Punch out' : 'Punch in'}
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Figure label="Break" value={`${hrs(breakMs)} hrs`} />
        <Figure label="Overtime" value={`${hrs(overtime)} hrs`} />
      </div>
    </Section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular">{value}</div>
    </div>
  )
}

/** Hours worked this week / month from deterministic history plus today's live timer. */
export function useHourStats(seed: string, holidays: Set<string>, todayMs: number) {
  const past = useMemo(() => {
    const worked = (dates: string[]) =>
      dates
        .filter((d) => d < TODAY)
        .map((d) => {
          const s = personalStatus(seed, d, holidays)
          return s === 'present' || s === 'late' ? entryFor(seed, d) : null
        })
        .filter((e) => e !== null)
    const week = worked(weekDates(thisMonday))
    const month = worked(monthToDate())
    return {
      week: week.reduce((a, e) => a + e.hours, 0),
      month: month.reduce((a, e) => a + e.hours, 0),
      overtime: month.reduce((a, e) => a + e.overtime, 0),
    }
  }, [seed, holidays])
  const today = todayMs / H
  const month = past.month + today
  return {
    today,
    week: past.week + today,
    month,
    remaining: Math.max(0, SHIFT.hoursPerMonth - month),
    overtime: past.overtime + Math.max(0, today - SHIFT.hoursPerDay),
  }
}

export function StatisticsCard({ stats, className }: { stats: ReturnType<typeof useHourStats>; className?: string }) {
  const rows = [
    { label: 'Today', value: stats.today, target: SHIFT.hoursPerDay },
    { label: 'This week', value: stats.week, target: SHIFT.hoursPerWeek },
    { label: 'This month', value: stats.month, target: SHIFT.hoursPerMonth },
  ]
  return (
    <Section title="Statistics" description="Hours against target" className={cn('h-full', className)}>
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="tabular">
                <span className="font-semibold">{r.value.toFixed(1)}</span>
                <span className="text-muted-foreground"> / {r.target} hrs</span>
              </span>
            </div>
            <Progress value={(r.value / r.target) * 100} className="h-1.5" />
          </li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Figure label="Remaining this month" value={`${stats.remaining.toFixed(1)} hrs`} />
        <Figure label="Overtime this month" value={`${stats.overtime.toFixed(1)} hrs`} />
      </div>
    </Section>
  )
}

export function TodayActivity({ clock, className }: { clock: Clock; className?: string }) {
  const { state } = clock
  const items: TimelineItem[] = state.log.map((l, i) => ({
    title: l.label,
    meta: hm(l.at),
    state: i === state.log.length - 1 && state.clockedIn ? 'current' : 'done',
  }))
  if (state.clockedIn) items.push({ title: 'Shift ends', meta: SHIFT.end, state: 'upcoming' })
  return (
    <Section title="Today activity" description={`${state.log.length} event${state.log.length === 1 ? '' : 's'}`} className={cn('h-full', className)}>
      <Timeline items={items} />
    </Section>
  )
}
