import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { Section } from '@/components/shared/Section'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { canAccess, isAdminLike, isLeader } from '@/lib/rbac'
import { TODAY, cn, daysUntil, formatDate, formatKES } from '@/lib/utils'
import type { Employee, LeaveRequest } from '@/data/types'
import { leaveToday, todayRoster } from '../attendance/data'
import { Donut, Funnel, HorizontalBars, StackedBars, TrendArea, perfHistogram, SimpleBars } from './charts'
import { orgEvents } from './events'
import { Kpi } from './Kpi'
import { firstName } from './utils'
import { AvatarStack, ClockInList, EmployeeStatusCard, OnLeaveToday, QUICK_LINKS, QuickAccess, TodoCard, UpcomingEvents } from './widgets'

const fade = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: 0.05 + i * 0.04 } })

export function OrgDashboard() {
  const ws = useWorkspace()
  const { employees, departments, leaveRequests, payrollRuns, complianceDocs, offboardings, trends, employee, department, user, role } = ws
  const active = useMemo(() => employees.filter((e) => e.status !== 'Exited'), [employees])

  const [leaves, setLeaves] = useState<LeaveRequest[]>(leaveRequests)
  // You can't approve your own leave, so it's excluded from what needs your attention.
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending' && l.employeeId !== user.id)

  const decide = (l: LeaveRequest, approve: boolean) => {
    setLeaves((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: approve ? 'Approved' : 'Rejected', stage: 'Complete' } : x)))
    const name = employee(l.employeeId)?.name ?? 'Employee'
    if (approve) toast.success(`Leave approved for ${name}`, { description: `${l.days} day${l.days > 1 ? 's' : ''} ${l.type.toLowerCase()} leave · ${formatDate(l.start, 'short')}` })
    else toast(`Leave declined for ${name}`, { description: 'They have been notified by email and in-app.' })
  }

  const onboarding = active.filter((e) => e.status === 'Onboarding')
  const payrollPending = payrollRuns.filter((p) => p.status === 'Pending Approval')
  const expiringDocs = complianceDocs.filter((d) => d.status === 'Expiring' || d.status === 'Expired')
  const probationDue = active
    .filter((e) => e.probationEnd && daysUntil(e.probationEnd) <= 30 && daysUntil(e.probationEnd) >= -7)
    .sort((a, b) => daysUntil(a.probationEnd!) - daysUntil(b.probationEnd!))

  // New workspaces have no history yet: fall back to today's headcount.
  const hc = trends.headcount.length ? trends.headcount : [{ month: 'Now', headcount: employees.filter((e) => e.status !== 'Exited').length, hires: 0, exits: 0 }]
  const last = hc[hc.length - 1]!
  const prev = hc[hc.length - 2] ?? last
  const hcDelta = prev.headcount ? Math.round(((last.headcount - prev.headcount) / prev.headcount) * 1000) / 10 : 0

  const deptData = departments
    .map((d) => ({ label: d.name, value: active.filter((e) => e.departmentId === d.id).length }))
    .sort((a, b) => b.value - a.value)
  const gender = [
    { label: 'Female', value: active.filter((e) => e.gender === 'Female').length },
    { label: 'Male', value: active.filter((e) => e.gender === 'Male').length },
  ]
  const femalePct = Math.round((gender[0]!.value / Math.max(1, active.length)) * 100)
  const perf = perfHistogram(active.map((e) => e.performance))
  const avgPerf = active.reduce((s, e) => s + e.performance, 0) / Math.max(1, active.length)

  const leaveMap = useMemo(() => leaveToday(employees, leaveRequests), [employees, leaveRequests])
  const onLeavePeople = [...leaveMap.entries()].map(([id, v]) => ({ employee: employee(id), ...v })).filter((x): x is typeof x & { employee: Employee } => !!x.employee && x.employee.status !== 'Exited')
  const month = TODAY.slice(0, 7)
  const newThisMonth = active.filter((e) => e.startDate.startsWith(month))
  const resignedThisMonth = offboardings.filter((o) => o.reason === 'Resignation' && o.submitted.startsWith(month))

  const att = trends.attendance[2] ?? trends.attendance[0] ?? { day: 'Wed', onTime: active.length, late: 0, absent: 0 }
  const roster = useMemo(() => todayRoster(active, att, new Set(leaveMap.keys())), [active, att, leaveMap])
  const count = (s: string) => roster.filter((r) => r.status === s).length
  const attendanceData = [
    { label: 'On time', value: count('On time') },
    { label: 'Late', value: count('Late') },
    { label: 'On leave', value: count('On leave') },
    { label: 'Absent', value: count('Absent') },
  ]
  const present = attendanceData[0]!.value + attendanceData[1]!.value
  const absentees = roster.filter((r) => r.status === 'Absent').map((r) => r.employee.name)

  const approvals = payrollPending.length + expiringDocs.length + probationDue.length
  const events = useMemo(() => orgEvents(active, ws.holidays, ws.workspace.country), [active, ws.holidays, ws.workspace.country])
  const topPerformer = [...active].sort((a, b) => b.performance - a.performance || a.name.localeCompare(b.name))[0]

  const quick = [
    QUICK_LINKS.apply!,
    ...(isLeader(role) ? [QUICK_LINKS.approvals!] : []),
    QUICK_LINKS.calendar!,
    ...(isAdminLike(role) ? [QUICK_LINKS.invite!] : []),
    ...(canAccess(role, 'payroll') ? [QUICK_LINKS.payroll!] : []),
    QUICK_LINKS.ticket!,
  ]

  const todos = [
    payrollPending[0] ? `Approve ${payrollPending[0].period} payroll` : 'Review payroll variance report',
    'Confirm Q3 review calibration panel',
    probationDue[0] ? `Schedule ${firstName(probationDue[0].name)}'s probation review` : 'Update the leave policy FAQ',
    'Share September attendance summary with managers',
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <motion.div {...fade(0)}>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <PersonAvatar name={user.name} className="size-14 shrink-0 text-base" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">{formatDate(TODAY, 'long')}</div>
                <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight sm:text-2xl">Welcome back, {firstName(user.name)}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  You have <span className="font-semibold text-foreground tabular">{approvals}</span> pending approval{approvals === 1 ? '' : 's'} &{' '}
                  <span className="font-semibold text-foreground tabular">{pendingLeaves.length}</span> leave request{pendingLeaves.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:shrink-0 md:justify-end">
              {isLeader(role) && (
                <Button asChild>
                  <Link to="/app/leave?tab=approvals">
                    Review approvals
                  </Link>
                </Button>
              )}
              {isAdminLike(role) && (
                <Button asChild variant="outline">
                  <Link to="/app/people?invite=1">
                    Invite employee
                  </Link>
                </Button>
              )}
              {canAccess(role, 'payroll') && (
                <Button asChild variant="outline">
                  <Link to="/app/payroll">
                    Run payroll
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi index={0} label="Total employees" value={active.length} href="/app/people" hint={`${hcDelta >= 0 ? '+' : ''}${hcDelta}% vs last month`} />
        <Kpi index={1} label="On leave today" value={onLeavePeople.length} href="/app/leave?tab=calendar" hint={`${pendingLeaves.length} requests pending`} />
        <Kpi index={2} label="New this month" value={newThisMonth.length} href="/app/onboarding" hint={`${onboarding.length} onboarding`} />
        <Kpi index={3} label="Resigned this month" value={resignedThisMonth.length} href="/app/offboarding" hint={`${offboardings.length} in offboarding`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <motion.div {...fade(1)} className="min-w-0">
          <Section title="Attendance today" description={`${present} of ${active.length} present`} className="h-full">
            <Donut data={attendanceData} centerValue={String(active.length)} centerLabel="employees" height={200} />
            {absentees.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                <span className="text-xs text-muted-foreground">Absent</span>
                <AvatarStack names={absentees} max={4} />
              </div>
            )}
          </Section>
        </motion.div>
        <motion.div {...fade(2)} className="min-w-0">
          <EmployeeStatusCard active={active} />
        </motion.div>
        <motion.div {...fade(3)} className="min-w-0 md:col-span-2 lg:col-span-1">
          <ClockInList roster={roster} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <motion.div {...fade(4)} className="min-w-0">
          <QuickAccess links={quick} />
        </motion.div>
        <motion.div {...fade(5)} className="min-w-0">
          <UpcomingEvents events={events} description="Interviews, meetings, holidays and birthdays" />
        </motion.div>
        <motion.div {...fade(6)} className="min-w-0 md:col-span-2 lg:col-span-1">
          <OnLeaveToday people={onLeavePeople} />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div {...fade(7)} className="min-w-0 lg:col-span-2">
          <Section title="Headcount trend" description={`${last.headcount} people today · ${hc.reduce((s, h) => s + h.hires, 0)} hires in 12 months`} className="h-full">
            <TrendArea data={hc} xKey="month" yKey="headcount" name="Headcount" />
          </Section>
        </motion.div>
        <motion.div {...fade(8)} className="min-w-0">
          <Section title="Employees by department" description={`${departments.length} departments`} className="h-full">
            <HorizontalBars data={deptData} name="Employees" />
          </Section>
        </motion.div>
        <motion.div {...fade(9)} className="min-w-0 lg:col-span-2">
          <Section title="Leave trend" description="Days taken per month by type" className="h-full">
            <StackedBars
              data={trends.leave}
              xKey="month"
              series={[
                { key: 'annual', label: 'Annual' },
                { key: 'sick', label: 'Sick' },
                { key: 'other', label: 'Other' },
              ]}
              valueFormatter={(v) => `${v} days`}
            />
          </Section>
        </motion.div>
        <motion.div {...fade(10)} className="min-w-0">
          <Section title="Hiring funnel" description="Open roles · last 90 days" className="h-full">
            <Funnel data={trends.hiringFunnel} />
          </Section>
        </motion.div>
        <motion.div {...fade(11)} className="min-w-0 lg:col-span-2">
          <Section title="Performance distribution" description={`Average rating ${avgPerf.toFixed(2)} / 5`} className="h-full">
            {topPerformer && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border bg-subtle p-3">
                <PersonAvatar name={topPerformer.name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Top performer</div>
                  <div className="truncate text-sm font-semibold">{topPerformer.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {topPerformer.title} · {department(topPerformer.departmentId)?.name}
                  </div>
                </div>
                <Badge variant="soft" className="shrink-0 tabular">
                  {topPerformer.performance.toFixed(1)} / 5
                </Badge>
              </div>
            )}
            <SimpleBars data={perf} xKey="bucket" yKey="employees" name="Employees" height={220} />
          </Section>
        </motion.div>
        <motion.div {...fade(12)} className="min-w-0">
          <Section title="Gender diversity" description="Active employees" className="h-full">
            <Donut data={gender} centerValue={`${femalePct}%`} centerLabel="women" />
          </Section>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div {...fade(13)} className="min-w-0 lg:col-span-2">
          <Section
            title="Needs your attention"
            description={`${pendingLeaves.length + approvals} items across approvals and compliance`}
            className="h-full"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/leave?tab=approvals">
                  All approvals
                </Link>
              </Button>
            }
          >
            <ul className="divide-y">
              <AnimatePresence initial={false}>
                {pendingLeaves.slice(0, 4).map((l) => {
                  const e = employee(l.employeeId)
                  return (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 24, height: 0, paddingTop: 0, paddingBottom: 0 }}
                      className="flex flex-col gap-3 overflow-hidden py-3 first:pt-0 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <PersonAvatar name={e?.name ?? '—'} className="size-9" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {e?.name} · {l.type} leave
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {l.days} day{l.days > 1 ? 's' : ''} · {formatDate(l.start, 'short')} – {formatDate(l.end, 'short')} · {l.stage} stage
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">
                        <Button size="sm" variant="outline" onClick={() => decide(l, false)}>
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => decide(l, true)}>
                          Approve
                        </Button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
              {payrollPending.map((p) => (
                <AttentionRow key={p.id} tone="bg-success" title={`${p.period} payroll awaiting CEO approval`} sub={`${formatKES(p.gross, { compact: true })} gross · ${p.employees} employees · prepared by ${p.preparedBy}`} href="/app/payroll" cta="Review" />
              ))}
              {expiringDocs.slice(0, 2).map((d) => (
                <AttentionRow
                  key={d.id}
                  tone="bg-danger"
                  title={`${employee(d.employeeId)?.name}'s ${d.type.toLowerCase()} ${d.status === 'Expired' ? 'has expired' : 'is expiring'}`}
                  sub={d.expires ? `${d.status === 'Expired' ? 'Expired' : 'Expires'} ${formatDate(d.expires)} · ${d.number}` : d.number}
                  href="/app/compliance"
                  cta="Renew"
                />
              ))}
              {probationDue.slice(0, 2).map((e) => (
                <AttentionRow
                  key={e.id}
                  tone="bg-info"
                  title={`${e.name}'s probation review is due`}
                  sub={`Probation ends ${formatDate(e.probationEnd!)} · ${e.title}`}
                  href="/app/onboarding?tab=probation"
                  cta="Schedule"
                />
              ))}
              {pendingLeaves.length + approvals === 0 && (
                <EmptyState title="You're all caught up" description="New approvals and alerts will appear here." />
              )}
            </ul>
          </Section>
        </motion.div>
        <motion.div {...fade(14)} className="min-w-0">
          <TodoCard initial={todos} />
        </motion.div>
      </div>
    </div>
  )
}

function AttentionRow({
  tone,
  title,
  sub,
  href,
  cta,
}: {
  tone: string
  title: string
  sub: string
  href: string
  cta: string
}) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0">
      <span className="flex w-9 shrink-0 justify-center" aria-hidden>
        <span className={cn('size-2 rounded-full', tone)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      <Button asChild size="sm" variant="soft" className="shrink-0">
        <Link to={href}>{cta}</Link>
      </Button>
    </li>
  )
}
