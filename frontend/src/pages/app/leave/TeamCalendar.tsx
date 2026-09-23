import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isWeekend, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import type { Employee, Holiday, LeaveRequest } from '@/data/types'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Legend } from '@/components/charts/ChartKit'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn, TODAY } from '@/lib/utils'
import { LEAVE_TYPES, leaveMeta, parse, toISO } from './utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function TeamCalendar({
  requests,
  holidays,
  employee,
}: {
  requests: LeaveRequest[]
  holidays: Holiday[]
  employee: (id?: string) => Employee | undefined
}) {
  const [month, setMonth] = useState(() => startOfMonth(parse(TODAY)))
  const visible = useMemo(() => requests.filter((r) => r.status === 'Approved' || r.status === 'Pending'), [requests])

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end }).map((d) => {
      const iso = toISO(d)
      return {
        date: d,
        iso,
        inMonth: isSameMonth(d, month),
        weekend: isWeekend(d),
        holidays: holidays.filter((h) => h.date === iso),
        off: isWeekend(d) ? [] : visible.filter((r) => r.start <= iso && r.end >= iso),
      }
    })
  }, [month, holidays, visible])

  const agenda = grid.filter((d) => d.inMonth && (d.off.length || d.holidays.length))
  const firstName = (id: string) => employee(id)?.name.split(' ')[0] ?? 'Someone'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <div className="min-w-32 text-center text-sm font-semibold">{format(month, 'MMMM yyyy')}</div>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(parse(TODAY)))}>
            Today
          </Button>
        </div>
        <Legend items={[...LEAVE_TYPES.map((t) => ({ label: t, color: leaveMeta[t].color })), { label: 'Public holiday', color: 'var(--accent)' }]} />
      </div>

      {/* Desktop grid */}
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <div className="grid grid-cols-7 border-b bg-subtle">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={toISO(month)} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="grid grid-cols-7">
            {grid.map((d) => (
              <div
                key={d.iso}
                className={cn(
                  'min-h-24 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0',
                  !d.inMonth && 'bg-subtle/60 opacity-50',
                  d.weekend && d.inMonth && 'bg-subtle',
                  d.holidays.length > 0 && 'bg-accent/50',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular', d.iso === TODAY ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground')}>
                    {format(d.date, 'd')}
                  </span>
                  {d.holidays.length > 0 && <PartyPopper className="size-3.5 text-primary" />}
                </div>
                {d.holidays.map((h) => (
                  <div key={h.name + h.country} className="mb-1 truncate text-[10px] font-medium text-accent-foreground">
                    {h.name} · {h.country}
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">
                  {d.off.slice(0, 3).map((r) => (
                    <Tip key={r.id} label={`${employee(r.employeeId)?.name} · ${r.type}${r.status === 'Pending' ? ' (pending)' : ''}`}>
                      <div
                        className={cn('flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-foreground', r.status === 'Pending' && 'border border-dashed')}
                        style={{ background: `color-mix(in srgb, ${leaveMeta[r.type].color} 16%, transparent)`, borderColor: leaveMeta[r.type].color }}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: leaveMeta[r.type].color }} />
                        <span className="truncate">{firstName(r.employeeId)}</span>
                      </div>
                    </Tip>
                  ))}
                  {d.off.length > 3 && <div className="px-1 text-[10px] text-muted-foreground">+{d.off.length - 3} more</div>}
                </div>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile agenda */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {agenda.length === 0 && <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nobody is off this month</div>}
        {agenda.map((d) => (
          <div key={d.iso} className={cn('flex gap-3 rounded-xl border bg-card p-3', d.holidays.length > 0 && 'bg-accent/40')}>
            <div className={cn('flex w-11 shrink-0 flex-col items-center justify-center rounded-lg py-1', d.iso === TODAY ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              <span className="text-[10px] font-semibold uppercase">{format(d.date, 'EEE')}</span>
              <span className="text-lg font-bold leading-none tabular">{format(d.date, 'd')}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {d.holidays.map((h) => (
                <div key={h.name + h.country} className="flex items-center gap-1.5 text-sm font-medium">
                  <PartyPopper className="size-3.5 text-primary" /> {h.name} <span className="text-xs text-muted-foreground">· {h.country}</span>
                </div>
              ))}
              {d.off.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <PersonAvatar name={employee(r.employeeId)?.name ?? '?'} className="size-6 text-[9px]" />
                  <span className="truncate">{employee(r.employeeId)?.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: leaveMeta[r.type].color }} />
                    {r.type}
                    {r.status === 'Pending' && ' · pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
