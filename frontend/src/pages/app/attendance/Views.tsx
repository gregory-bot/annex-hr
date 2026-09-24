import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { USE_MOCK_API } from '@/lib/api'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { iso, orgHeatmap, personalStatus, statusMeta, today, type DayStatus, type HeatCell } from './data'
import { useApiGet, type HeatCellDto, type MeResponse } from './api'

const LEGEND = Object.entries(statusMeta) as [keyof typeof statusMeta, (typeof statusMeta)[keyof typeof statusMeta]][]

/** Personal month calendar. Live mode loads each month's statuses from GET /attendance/me?from&to. */
export function MonthCalendar({ seed, holidays, todayIso = TODAY }: { seed: string; holidays: Set<string>; todayIso?: string }) {
  const [month, setMonth] = useState(() => startOfMonth(USE_MOCK_API ? today : new Date(`${todayIso}T00:00:00`)))
  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return { start, end }
  }, [month])
  const remote = useApiGet<MeResponse>(USE_MOCK_API ? null : `/attendance/me?from=${iso(range.start)}&to=${iso(range.end)}`)
  const days = useMemo(() => {
    const byDate = new Map((remote.data?.days ?? []).map((x) => [x.date, x.status] as const))
    return eachDayOfInterval(range).map((d) => {
      const date = iso(d)
      let status: DayStatus
      if (USE_MOCK_API) status = personalStatus(seed, date, holidays)
      else if (date > todayIso) status = d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'upcoming'
      else status = byDate.get(date) ?? (d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'none')
      return { d, date, inMonth: isSameMonth(d, month), status }
    })
  }, [range, month, seed, holidays, remote.data, todayIso])

  const counts = days.filter((x) => x.inMonth).reduce<Partial<Record<DayStatus, number>>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {})

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </Button>
          <div className="min-w-28 text-center text-sm font-semibold">{format(month, 'MMMM yyyy')}</div>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {counts.present ?? 0} present · {counts.late ?? 0} late · {counts.absent ?? 0} absent
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:gap-1.5">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1">
            {d.slice(0, 1)}
            <span className="hidden sm:inline">{d.slice(1)}</span>
          </div>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={iso(month)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {days.map(({ d, date, inMonth, status }) => {
            const meta = status === 'weekend' || status === 'upcoming' || status === 'none' ? null : statusMeta[status]
            return (
              <Tip key={date} label={`${formatDate(date)} · ${meta?.label ?? (status === 'weekend' ? 'Weekend' : status === 'none' ? 'No record' : 'Upcoming')}`}>
                <div
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs sm:aspect-auto sm:h-16 sm:items-start sm:justify-between sm:p-2',
                    meta ? meta.cell : 'bg-subtle text-muted-foreground',
                    !inMonth && 'opacity-30',
                    date === todayIso && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                  )}
                >
                  <span className="font-semibold tabular">{format(d, 'd')}</span>
                  {meta && (
                    <span className="flex items-center gap-1">
                      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
                      <span className="hidden text-[10px] font-medium lg:inline">{meta.label}</span>
                      <span className="sr-only">{meta.label}</span>
                    </span>
                  )}
                </div>
              </Tip>
            )
          })}
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {LEGEND.map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-3 rounded', m.cell)} aria-hidden />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  )
}

const RAMP = [18, 34, 52, 72, 92]

function heatColor(pct: number | null) {
  if (pct === null) return 'var(--muted)'
  const bucket = pct < 40 ? 0 : pct < 84 ? 1 : pct < 89 ? 2 : pct < 94 ? 3 : 4
  return `color-mix(in srgb, var(--primary) ${RAMP[bucket]}%, var(--card))`
}

/** Share of employees present each weekday. Live mode reads the aggregate from GET /attendance/heatmap. */
export function AttendanceHeatmap({ holidays, seed, weeksCount = 16, todayIso = TODAY }: { holidays: Set<string>; seed: string; weeksCount?: number; todayIso?: string }) {
  const remote = useApiGet<{ weeks: HeatCellDto[][] }>(USE_MOCK_API ? null : `/attendance/heatmap?weeks=${weeksCount}`)
  const mock = useMemo(() => (USE_MOCK_API ? orgHeatmap(weeksCount, holidays, seed) : []), [holidays, seed, weeksCount])
  const weeks: HeatCell[][] = USE_MOCK_API ? mock : remote.data?.weeks ?? []
  if (!USE_MOCK_API && !remote.data) {
    return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{remote.error ?? 'Loading attendance…'}</div>
  }
  const cells = weeks.flat().filter((c) => c.pct !== null)
  const avg = Math.round(cells.reduce((a, c) => a + (c.pct ?? 0), 0) / Math.max(1, cells.length))
  const monthMarks = weeks.map((w, i) => {
    const m = format(parseISO(w[0]!.date), 'MMM')
    const prev = i > 0 ? format(parseISO(weeks[i - 1]![0]!.date), 'MMM') : ''
    return m !== prev ? m : ''
  })
  return (
    <div>
      <div className="overflow-x-auto pb-1 scrollbar-thin">
        <div className="inline-flex min-w-full flex-col gap-1">
          <div className="ml-8 flex gap-1">
            {monthMarks.map((m, i) => (
              <div key={i} className="w-4 shrink-0 text-[10px] text-muted-foreground sm:w-5">
                {m}
              </div>
            ))}
          </div>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, di) => (
            <div key={day} className="flex items-center gap-1">
              <div className="w-7 shrink-0 text-[10px] text-muted-foreground">{day}</div>
              {weeks.map((w, wi) => {
                const c = w[di]!
                return (
                  <Tip key={c.date} label={c.pct === null ? `${formatDate(c.date)} · ${c.date > todayIso ? 'upcoming' : 'no data'}` : `${formatDate(c.date)} · ${c.pct}% present`}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: wi * 0.015 + di * 0.01 }}
                      className={cn('size-4 shrink-0 rounded-[4px] sm:size-5', c.date === todayIso && 'ring-2 ring-foreground/60')}
                      style={{ background: heatColor(c.pct), opacity: c.pct === null ? 0.5 : 1 }}
                    />
                  </Tip>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{weeksCount}-week average: <span className="font-semibold text-foreground tabular">{avg}%</span> present</span>
        <span className="inline-flex items-center gap-1">
          Less
          {RAMP.map((r) => (
            <span key={r} className="size-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--primary) ${r}%, var(--card))` }} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
