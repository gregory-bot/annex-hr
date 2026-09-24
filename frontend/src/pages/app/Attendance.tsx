import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { addDays } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlarmClock, CalendarOff, Flame, Timer, Trophy, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isLeader } from '@/lib/rbac'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { ClockCard, GeoCard } from './attendance/ClockCard'
import { AttendanceHeatmap, MonthCalendar } from './attendance/Views'
import { StatisticsCard, TodayActivity, useHourStats } from './attendance/Timesheet'
import { useClock, type Clock } from './attendance/workday'
import { SHIFT, entryFor, leaveToday, minutesToHM, monthToDate, personalStatus, thisMonday, todayRoster, weekDates, type DayStatus } from './attendance/data'
import { Kpi } from './dashboard/Kpi'

type RecordStatus = 'On time' | 'Late' | 'Overtime' | 'Absent' | 'On leave' | 'Holiday' | 'Today'
const statusVariant: Record<RecordStatus, 'success' | 'warning' | 'info' | 'danger' | 'muted' | 'soft'> = {
  'On time': 'success',
  Late: 'warning',
  Overtime: 'info',
  Absent: 'danger',
  'On leave': 'info',
  Holiday: 'muted',
  Today: 'soft',
}
const offLabel: Partial<Record<DayStatus, RecordStatus>> = { absent: 'Absent', leave: 'On leave', holiday: 'Holiday' }

interface DayRecord {
  date: string
  inMin: number | null
  outMin: number | null
  hours: number
  breakMin: number
  overtime: number
  status: RecordStatus
}

function dayRecord(seed: string, date: string, holidays: Set<string>, clock: Clock): DayRecord {
  if (date === TODAY) {
    const h = clock.elapsed / 3_600_000
    return { date, inMin: clock.firstIn === null ? null : clock.firstIn / 60_000, outMin: null, hours: +h.toFixed(2), breakMin: clock.breakMs / 60_000, overtime: Math.max(0, h - SHIFT.hoursPerDay), status: 'Today' }
  }
  const st = personalStatus(seed, date, holidays)
  const off = offLabel[st]
  if (off) return { date, inMin: null, outMin: null, hours: 0, breakMin: 0, overtime: 0, status: off }
  const e = entryFor(seed, date)
  return { date, inMin: e.inMin, outMin: e.outMin, hours: e.hours, breakMin: e.breakMin, overtime: e.overtime, status: e.status }
}
const cursorFill = { fill: 'var(--muted)', opacity: 0.6 }

export default function Attendance() {
  const { user, role, employees, holidays, trends, leaveRequests, workspace } = useWorkspace()
  const leader = isLeader(role)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'team'
  const clock = useClock(user.id)
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
            <OrgView employees={employees} trends={trends.attendance} onLeave={leaveToday(employees, leaveRequests)} holidaySet={holidaySet} seed={workspace.id} />
          </TabsContent>
          <TabsContent value="me">
            <MyAttendance seed={user.id} clock={clock} holidaySet={holidaySet} orgSeed={workspace.id} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mt-6">
          <MyAttendance seed={user.id} clock={clock} holidaySet={holidaySet} orgSeed={workspace.id} />
        </div>
      )}
    </div>
  )
}

function MyAttendance({ seed, clock, holidaySet, orgSeed }: { seed: string; clock: Clock; holidaySet: Set<string>; orgSeed: string }) {
  const [range, setRange] = useState<'week' | 'last' | 'month'>('week')
  const stats = useHourStats(seed, holidaySet, clock.elapsed)
  const month = useMemo(() => monthToDate(), [])
  const chartDates = range === 'month' ? month : weekDates(range === 'week' ? thisMonday : addDays(thisMonday, -7))
  const chart = chartDates.map((date) => ({
    label: range === 'month' ? format(parseISO(date), 'd') : format(parseISO(date), 'EEE'),
    hours: date > TODAY ? 0 : +dayRecord(seed, date, holidaySet, clock).hours.toFixed(1),
  }))
  const records = [...month].reverse().map((d) => dayRecord(seed, d, holidaySet, clock))

  const columns: Column<DayRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.date,
      cell: (r) => (
        <div>
          <div className="font-medium">{formatDate(r.date, 'short')}</div>
          <div className="text-xs text-muted-foreground">{format(parseISO(r.date), 'EEEE')}</div>
        </div>
      ),
    },
    { key: 'in', header: 'Punch in', cell: (r) => <span className="tabular">{r.inMin === null ? '—' : minutesToHM(r.inMin)}</span> },
    { key: 'out', header: 'Punch out', cell: (r) => <span className="tabular">{r.outMin === null ? (r.status === 'Today' ? 'Live' : '—') : minutesToHM(r.outMin)}</span> },
    { key: 'hours', header: 'Production', sortValue: (r) => r.hours, className: 'text-right', headerClassName: 'text-right', cell: (r) => <span className="font-semibold tabular">{r.hours ? `${r.hours.toFixed(2)} hrs` : '—'}</span> },
    { key: 'break', header: 'Break', className: 'text-right', headerClassName: 'text-right', hideOnMobile: true, cell: (r) => <span className="tabular">{r.breakMin ? `${(r.breakMin / 60).toFixed(2)} hrs` : '—'}</span> },
    { key: 'ot', header: 'Overtime', sortValue: (r) => r.overtime, className: 'text-right', headerClassName: 'text-right', cell: (r) => <span className="tabular">{r.overtime ? `${r.overtime.toFixed(2)} hrs` : '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={statusVariant[r.status]} dot>
          {r.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatisticsCard stats={stats} />
        <TodayActivity clock={clock} />
        <Section
          title="Daily records"
          description={`${chart.reduce((a, c) => a + c.hours, 0).toFixed(1)} hrs logged`}
          action={
            <div className="flex rounded-lg bg-muted p-0.5 text-xs">
              {(['week', 'last', 'month'] as const).map((w) => (
                <button key={w} onClick={() => setRange(w)} className={cn('rounded-md px-2 py-1 font-medium', range === w ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                  {w === 'week' ? 'Week' : w === 'last' ? 'Last' : 'Month'}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={range === 'month' ? 'preserveStartEnd' : 0} />
              <YAxis {...axisProps} width={40} domain={[0, 12]} />
              <ReferenceLine y={SHIFT.hoursPerDay} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} hrs`} />} cursor={cursorFill} />
              <Bar dataKey="hours" name="Hours" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 text-xs text-muted-foreground">Dashed line: {SHIFT.hoursPerDay} hr target</div>
        </Section>
      </div>
      <Section title="Attendance list" description={`${format(parseISO(TODAY), 'MMMM yyyy')} · ${records.length} working days`} contentClassName="p-0 sm:p-0">
        <DataTable rows={records} columns={columns} rowKey={(r) => r.date} pageSize={8}
          mobileCard={(r) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {formatDate(r.date, 'short')} <span className="font-normal text-muted-foreground">· {format(parseISO(r.date), 'EEE')}</span>
                </div>
                <Badge variant={statusVariant[r.status]} dot>
                  {r.status}
                </Badge>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular">
                <span>In {r.inMin === null ? '—' : minutesToHM(r.inMin)}</span>
                <span>Out {r.outMin === null ? (r.status === 'Today' ? 'Live' : '—') : minutesToHM(r.outMin)}</span>
                <span className="text-right font-semibold text-foreground">{r.hours ? `${r.hours.toFixed(2)} hrs` : '—'}</span>
              </div>
            </div>
          )}
          className="rounded-none rounded-b-xl border-0 border-t" />
      </Section>
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
  onLeave: ReturnType<typeof leaveToday>
  holidaySet: Set<string>
  seed: string
}) {
  const active = useMemo(() => employees.filter((e) => e.status !== 'Exited'), [employees])
  const wed = trends[2] ?? trends[0] ?? { day: 'Wed', onTime: active.length, late: 0, absent: 0 }
  const [nudged, setNudged] = useState<string[]>([])

  const late = useMemo(
    () =>
      todayRoster(active, wed, new Set(onLeave.keys()))
        .filter((r) => r.status === 'Late')
        .map((r) => ({ e: r.employee, mins: r.lateMin ?? 0, at: minutesToHM(r.inMin ?? 0) }))
        .sort((a, b) => b.mins - a.mins),
    [active, wed, onLeave],
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
        <Kpi index={0} label="Present today" value={wed.onTime + wed.late - onLeave.size} icon={UserCheck} hint={`of ${active.length} active`} />
        <Kpi index={1} label="Late arrivals" value={wed.late} icon={AlarmClock} hint="after 08:40 grace" />
        <Kpi index={2} label="On leave" value={onLeave.size} icon={CalendarOff} hint="approved today" />
        <Kpi index={3} label="Overtime this week" value={overtimeTotal} format={(n) => `${Math.round(n)} h`} icon={Flame} hint="hours beyond 8 h/day" />
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
