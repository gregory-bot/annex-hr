import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { addDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlarmClock, CalendarOff, Flame, Timer, Trophy, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isLeader } from '@/lib/rbac'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { PersonCell } from '@/components/shared/PersonCell'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { ClockCard, GeoCard, useClock } from './attendance/ClockCard'
import { AttendanceHeatmap, MonthCalendar } from './attendance/Views'
import { entryFor, hash01, minutesToHM, thisMonday, weekDates, type EntryStatus } from './attendance/data'

const statusVariant: Record<EntryStatus, 'success' | 'warning' | 'info'> = { 'On time': 'success', Late: 'warning', Overtime: 'info' }
const cursorFill = { fill: 'var(--muted)', opacity: 0.6 }

export default function Attendance() {
  const { user, role, employees, holidays, trends, leaveRequests, workspace } = useWorkspace()
  const leader = isLeader(role)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'team'
  const clock = useClock()
  const holidaySet = useMemo(() => new Set(holidays.filter((h) => h.country === workspace.country).map((h) => h.date)), [holidays, workspace.country])

  return (
    <div>
      <PageHeader
        eyebrow="People Ops"
        title="Time & attendance"
        description={leader ? 'Clock in, track your hours and monitor attendance across the organisation.' : 'Clock in, track your hours and review your attendance record.'}
        actions={<ExportMenu filename="attendance-september-2026" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ClockCard clock={clock} />
        </div>
        <GeoCard office="Westlands Office" />
      </div>

      {leader ? (
        <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })} className="mt-6">
          <TabsList>
            <TabsTrigger value="team">Organisation</TabsTrigger>
            <TabsTrigger value="me">My attendance</TabsTrigger>
          </TabsList>
          <TabsContent value="team">
            <OrgView employees={employees} trends={trends.attendance} onLeave={leaveRequests.filter((r) => r.status === 'Approved' && r.start <= TODAY && r.end >= TODAY).length} holidaySet={holidaySet} seed={workspace.id} />
          </TabsContent>
          <TabsContent value="me">
            <MyAttendance seed={user.id} elapsedHours={clock.elapsed / 3_600_000} holidaySet={holidaySet} orgSeed={workspace.id} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mt-6">
          <MyAttendance seed={user.id} elapsedHours={clock.elapsed / 3_600_000} holidaySet={holidaySet} orgSeed={workspace.id} />
        </div>
      )}
    </div>
  )
}

function MyAttendance({ seed, elapsedHours, holidaySet, orgSeed }: { seed: string; elapsedHours: number; holidaySet: Set<string>; orgSeed: string }) {
  const [week, setWeek] = useState<'this' | 'last'>('this')
  const monday = week === 'this' ? thisMonday : addDays(thisMonday, -7)
  const rows = weekDates(monday).map((date) => {
    if (date < TODAY) return { ...entryFor(seed, date), state: 'done' as const }
    const e = entryFor(seed, date)
    return { ...e, hours: date === TODAY ? +elapsedHours.toFixed(2) : 0, state: date === TODAY ? ('today' as const) : ('scheduled' as const) }
  })
  const total = rows.reduce((a, r) => a + r.hours, 0)

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-2"
          title="Hours this week"
          description={`${total.toFixed(1)} h logged · target 40 h`}
          action={
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(['this', 'last'] as const).map((w) => (
                <button key={w} onClick={() => setWeek(w)} className={cn('rounded-md px-2.5 py-1 font-medium', week === w ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                  {w === 'this' ? 'This week' : 'Last week'}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="day" {...axisProps} />
              <YAxis {...axisProps} width={40} domain={[0, 12]} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} h`} />} cursor={cursorFill} />
              <Bar dataKey="hours" name="Hours" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section className="lg:col-span-3" title="Daily entries" description={`Week of ${formatDate(monday, 'medium')}`} contentClassName="px-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>
                    <div className="font-medium">{r.day}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.date, 'short')}</div>
                  </TableCell>
                  <TableCell className="tabular">{r.state === 'done' ? minutesToHM(r.inMin) : r.state === 'today' && r.hours > 0 ? 'Live' : '—'}</TableCell>
                  <TableCell className="tabular">{r.state === 'done' ? minutesToHM(r.outMin) : '—'}</TableCell>
                  <TableCell className="text-right font-semibold tabular">{r.state === 'scheduled' ? '—' : r.hours.toFixed(1)}</TableCell>
                  <TableCell>
                    {r.state === 'done' ? (
                      <Badge variant={statusVariant[r.status]} dot>
                        {r.status}
                      </Badge>
                    ) : r.state === 'today' ? (
                      <Badge variant="soft" dot>
                        Today
                      </Badge>
                    ) : (
                      <Badge variant="muted">Scheduled</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Attendance calendar" description="Your daily status this month">
          <MonthCalendar seed={seed} holidays={holidaySet} />
        </Section>
        <Section title="Organisation attendance" description="Share of employees present each weekday · last 16 weeks">
          <AttendanceHeatmap holidays={holidaySet} seed={orgSeed} />
        </Section>
      </div>
    </div>
  )
}

function OrgView({
  employees,
  trends,
  onLeave,
  holidaySet,
  seed,
}: {
  employees: ReturnType<typeof useWorkspace>['employees']
  trends: { day: string; onTime: number; late: number; absent: number }[]
  onLeave: number
  holidaySet: Set<string>
  seed: string
}) {
  const active = useMemo(() => employees.filter((e) => e.status !== 'Exited'), [employees])
  const wed = trends[2] ?? trends[0] ?? { day: 'Wed', onTime: active.length, late: 0, absent: 0 }
  const [nudged, setNudged] = useState<string[]>([])

  const late = useMemo(
    () =>
      [...active]
        .sort((a, b) => hash01(a.id + TODAY) - hash01(b.id + TODAY))
        .slice(0, wed.late)
        .map((e, i) => {
          const mins = 12 + Math.round(hash01(e.id + 'late') * 38) + i
          return { e, mins, at: minutesToHM(8 * 60 + 30 + mins) }
        })
        .sort((a, b) => b.mins - a.mins),
    [active, wed.late],
  )

  const overtime = useMemo(
    () =>
      active
        .map((e) => {
          const hrs = weekDates(thisMonday)
            .filter((d) => d < TODAY)
            .concat(weekDates(addDays(thisMonday, -7)))
            .reduce((a, d) => a + Math.max(0, entryFor(e.id, d).hours - 8), 0)
          return { e, hrs: +hrs.toFixed(1) }
        })
        .sort((a, b) => b.hrs - a.hrs)
        .slice(0, 6),
    [active],
  )
  const overtimeTotal = Math.round(active.reduce((a, e) => a + weekDates(thisMonday).filter((d) => d < TODAY).reduce((s, d) => s + Math.max(0, entryFor(e.id, d).hours - 8), 0), 0))
  const maxOt = overtime[0]?.hrs || 1

  const series = [
    { key: 'onTime', label: 'On time', color: SERIES[0] },
    { key: 'late', label: 'Late', color: SERIES[1] },
    { key: 'absent', label: 'Absent', color: SERIES[2] },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Present today" value={wed.onTime + wed.late} icon={UserCheck} tone="primary" hint={<span>of {active.length} active</span>} />
        <StatCard index={1} label="Late arrivals" value={wed.late} icon={AlarmClock} tone="warning" hint={<span>after 08:40 grace</span>} />
        <StatCard index={2} label="On leave" value={onLeave} icon={CalendarOff} hint={<span>approved today</span>} />
        <StatCard index={3} label="Overtime this week" value={overtimeTotal} format={(n) => `${Math.round(n)} h`} icon={Flame} delta={8} deltaLabel="vs last week" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Late arrivals today" description={`Shift starts 08:30 · ${late.length} people`} contentClassName="px-2">
          <ul className="divide-y">
            {late.map(({ e, mins, at }, i) => (
              <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <PersonCell name={e.name} sub={e.title} size="sm" />
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular">{at}</div>
                    <div className="text-[11px] text-warning">+{mins} min</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={nudged.includes(e.id)}
                    onClick={() => {
                      setNudged((n) => [...n, e.id])
                      toast.success(`Late arrival noted for ${e.name.split(' ')[0]}`, { description: 'Their manager will see it in the weekly attendance digest.' })
                    }}
                    className="hidden sm:inline-flex"
                  >
                    {nudged.includes(e.id) ? 'Noted' : 'Note'}
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        </Section>

        <Section title="Overtime leaderboard" description="Hours beyond 8 h/day · last 2 weeks">
          <ol className="space-y-3">
            {overtime.map(({ e, hrs }, i) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {i === 0 ? <Trophy className="size-3" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs font-semibold tabular">{hrs} h</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full" style={{ background: SERIES[0] }} initial={{ width: 0 }} animate={{ width: `${(hrs / maxOt) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.05 }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Attendance trend" description="This week by weekday" action={<Timer className="size-4 text-muted-foreground" />}>
          <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} className="mb-3" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trends} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="day" {...axisProps} />
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} people`} />} cursor={cursorFill} />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={2} maxBarSize={32} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Attendance heatmap" description="Share of employees present each weekday · last 16 weeks">
        <AttendanceHeatmap holidays={holidaySet} seed={seed} />
      </Section>
    </div>
  )
}
