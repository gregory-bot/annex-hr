import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Cake,
  Check,
  FileWarning,
  Gauge,
  Handshake,
  Rocket,
  ScrollText,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import { StatCard } from '@/components/shared/StatCard'
import { Section } from '@/components/shared/Section'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn, daysUntil, formatDate, formatKES } from '@/lib/utils'
import type { LeaveRequest } from '@/data/types'
import { Donut, Funnel, HorizontalBars, StackedBars, TrendArea, perfHistogram, SimpleBars } from './charts'
import { upcomingBirthdays } from './utils'

const fade = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: 0.05 + i * 0.04 } })

export function OrgDashboard() {
  const ws = useWorkspace()
  const { employees, departments, leaveRequests, payrollRuns, complianceDocs, trends, employee, department } = ws
  const active = useMemo(() => employees.filter((e) => e.status !== 'Exited'), [employees])

  const [leaves, setLeaves] = useState<LeaveRequest[]>(leaveRequests)
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending')

  const decide = (l: LeaveRequest, approve: boolean) => {
    setLeaves((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: approve ? 'Approved' : 'Rejected', stage: 'Complete' } : x)))
    const name = employee(l.employeeId)?.name ?? 'Employee'
    if (approve) toast.success(`Leave approved for ${name}`, { description: `${l.days} day${l.days > 1 ? 's' : ''} ${l.type.toLowerCase()} leave · ${formatDate(l.start, 'short')}` })
    else toast(`Leave declined for ${name}`, { description: 'They have been notified by email and in-app.' })
  }

  const onboarding = active.filter((e) => e.status === 'Onboarding')
  const payrollPending = payrollRuns.filter((p) => p.status === 'Pending Approval')
  const reviewsDue = Math.max(0, active.filter((e) => e.status === 'Active' || e.status === 'Probation').length - 14)
  const consultants = active.filter((e) => e.employmentType === 'Consultant' || e.role === 'consultant')
  const visaAlerts = complianceDocs.filter((d) => (d.type === 'Work Visa' || d.type === 'Passport') && (d.status === 'Expiring' || d.status === 'Expired'))
  const expiringDocs = complianceDocs.filter((d) => d.status === 'Expiring' || d.status === 'Expired')
  const birthdays = upcomingBirthdays(employees, 30)
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

  const stats = [
    { label: 'Employees', value: active.length, icon: Users, delta: hcDelta, deltaLabel: 'vs last month', href: '/app/people', tone: 'primary' as const, span: 'col-span-2' },
    { label: 'Departments', value: departments.length, icon: Briefcase, hint: `${ws.workspace.offices.length} office${ws.workspace.offices.length > 1 ? 's' : ''}`, href: '/app/departments' },
    { label: 'Pending onboarding', value: onboarding.length, icon: Rocket, hint: 'new starters in progress', href: '/app/onboarding' },
    { label: 'Leave requests', value: pendingLeaves.length, icon: CalendarDays, hint: 'awaiting approval', href: '/app/leave', tone: pendingLeaves.length ? ('warning' as const) : undefined },
    { label: 'Payroll approvals', value: payrollPending.length, icon: Wallet, hint: payrollPending[0] ? `${payrollPending[0].period}` : 'All clear', href: '/app/payroll' },
    { label: 'Reviews due', value: reviewsDue, icon: Gauge, hint: 'Q3 cycle closes 10 Oct', href: '/app/performance' },
    { label: 'Consultants active', value: consultants.length, icon: Handshake, hint: 'on live timesheets', href: '/app/timesheets' },
    { label: 'Visa & permit alerts', value: visaAlerts.length, icon: FileWarning, hint: 'expiring or expired', href: '/app/compliance', tone: visaAlerts.length ? ('warning' as const) : ('success' as const), span: 'lg:col-span-2' },
    {
      label: 'Upcoming birthdays',
      value: birthdays.length,
      icon: Cake,
      hint: birthdays[0] ? `Next: ${birthdays[0].employee.name.split(' ')[0]} · ${birthdays[0].days === 0 ? 'today' : `in ${birthdays[0].days}d`}` : 'next 30 days',
      span: 'lg:col-span-2',
    },
  ]

  const activity: TimelineItem[] = [
    ...(payrollRuns[1] ? [{ title: `${payrollRuns[1].period} payroll synced to Odoo`, meta: '3 days ago', body: `${formatKES(payrollRuns[1].net, { compact: true })} net across ${payrollRuns[1].employees} employees`, icon: Wallet }] : []),
    ...leaveRequests
      .filter((l) => l.status === 'Approved')
      .slice(0, 2)
      .map((l) => ({ title: `${employee(l.employeeId)?.name} — ${l.type} leave approved`, meta: formatDate(l.submitted, 'short'), body: `${l.days} days from ${formatDate(l.start, 'short')}`, icon: BadgeCheck })),
    ...onboarding.slice(0, 1).map((e) => ({ title: `${e.name} joined as ${e.title}`, meta: formatDate(e.startDate, 'short'), body: department(e.departmentId)?.name, icon: UserPlus })),
    { title: 'Data Protection policy v3.1 published', meta: 'Yesterday', body: 'Acknowledgement requested from all employees', icon: ScrollText, state: 'done' as const },
    { title: 'Q3 performance reviews opened', meta: 'Yesterday', body: 'Self-assessments close on 10 October', icon: Gauge, state: 'current' as const },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ span, ...s }, i) => (
          <div key={s.label} className={cn(span)}>
            <StatCard {...s} index={i} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div {...fade(0)} className="min-w-0 lg:col-span-2">
          <Section title="Headcount trend" description={`${last.headcount} people today · ${hc.reduce((s, h) => s + h.hires, 0)} hires in 12 months`} className="h-full">
            <TrendArea data={hc} xKey="month" yKey="headcount" name="Headcount" />
          </Section>
        </motion.div>
        <motion.div {...fade(1)} className="min-w-0">
          <Section title="Gender diversity" description="Active employees" className="h-full">
            <Donut data={gender} centerValue={`${femalePct}%`} centerLabel="women" />
          </Section>
        </motion.div>
        <motion.div {...fade(2)} className="min-w-0 lg:col-span-2">
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
        <motion.div {...fade(3)} className="min-w-0">
          <Section title="Hiring funnel" description="Open roles · last 90 days" className="h-full">
            <Funnel data={trends.hiringFunnel} />
          </Section>
        </motion.div>
        <motion.div {...fade(4)} className="min-w-0 lg:col-span-2">
          <Section title="Department distribution" description="Headcount by department" className="h-full">
            <HorizontalBars data={deptData} name="Employees" />
          </Section>
        </motion.div>
        <motion.div {...fade(5)} className="min-w-0">
          <Section title="Performance distribution" description={`Average rating ${avgPerf.toFixed(2)} / 5`} className="h-full">
            <SimpleBars data={perf} xKey="bucket" yKey="employees" name="Employees" height={240} />
          </Section>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div {...fade(6)} className="min-w-0 lg:col-span-2">
          <Section
            title="Needs your attention"
            description={`${pendingLeaves.length + payrollPending.length + expiringDocs.length + probationDue.length} items across approvals and compliance`}
            className="h-full"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/leave">
                  All approvals <ArrowRight />
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
                          <X /> Decline
                        </Button>
                        <Button size="sm" onClick={() => decide(l, true)}>
                          <Check /> Approve
                        </Button>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
              {payrollPending.map((p) => (
                <AttentionRow key={p.id} icon={Wallet} tone="bg-success-soft text-success" title={`${p.period} payroll awaiting CEO approval`} sub={`${formatKES(p.gross, { compact: true })} gross · ${p.employees} employees · prepared by ${p.preparedBy}`} href="/app/payroll" cta="Review" />
              ))}
              {expiringDocs.slice(0, 2).map((d) => (
                <AttentionRow
                  key={d.id}
                  icon={FileWarning}
                  tone="bg-danger-soft text-danger"
                  title={`${employee(d.employeeId)?.name}'s ${d.type.toLowerCase()} ${d.status === 'Expired' ? 'has expired' : 'is expiring'}`}
                  sub={d.expires ? `${d.status === 'Expired' ? 'Expired' : 'Expires'} ${formatDate(d.expires)} · ${d.number}` : d.number}
                  href="/app/compliance"
                  cta="Renew"
                />
              ))}
              {probationDue.slice(0, 2).map((e) => (
                <AttentionRow
                  key={e.id}
                  icon={AlarmClock}
                  tone="bg-info-soft text-info"
                  title={`${e.name}'s probation review is due`}
                  sub={`Probation ends ${formatDate(e.probationEnd!)} · ${e.title}`}
                  href="/app/onboarding?tab=probation"
                  cta="Schedule"
                />
              ))}
              {pendingLeaves.length + payrollPending.length + expiringDocs.length + probationDue.length === 0 && (
                <EmptyState icon={BadgeCheck} title="You're all caught up" description="New approvals and alerts will appear here." />
              )}
            </ul>
          </Section>
        </motion.div>

        <motion.div {...fade(7)} className="min-w-0">
          <Section title="Upcoming birthdays" description="Next 30 days" className="h-full">
            {birthdays.length === 0 ? (
              <EmptyState icon={Cake} title="No birthdays soon" />
            ) : (
              <ul className="space-y-3">
                {birthdays.slice(0, 6).map((b) => (
                  <li key={b.employee.id} className="flex items-center gap-3">
                    <PersonAvatar name={b.employee.name} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{b.employee.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{department(b.employee.departmentId)?.name}</div>
                    </div>
                    <Badge variant={b.days <= 3 ? 'soft' : 'muted'}>{b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : formatDate(b.date, 'short')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </motion.div>

        <motion.div {...fade(8)} className="min-w-0 lg:col-span-2">
          <Section title="Onboarding in progress" description={`${onboarding.length} new starters`} className="h-full">
            {onboarding.length === 0 ? (
              <EmptyState icon={Rocket} title="No active onboarding" description="New hires appear here after their offer is accepted." />
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {onboarding.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <Link to="/app/onboarding" className="flex items-center gap-3 rounded-lg p-2 -m-2 transition hover:bg-muted/60">
                      <PersonAvatar name={e.name} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{e.name}</span>
                          <span className="text-xs font-semibold tabular">{e.onboardingProgress}%</span>
                        </div>
                        <div className="mb-1.5 truncate text-xs text-muted-foreground">
                          {e.title} · started {formatDate(e.startDate, 'short')}
                        </div>
                        <Progress value={e.onboardingProgress} className="h-1.5" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </motion.div>

        <motion.div {...fade(9)} className="min-w-0">
          <Section title="Recent activity" className="h-full">
            <Timeline items={activity} />
          </Section>
        </motion.div>
      </div>
    </div>
  )
}

function AttentionRow({
  icon: Icon,
  tone,
  title,
  sub,
  href,
  cta,
}: {
  icon: typeof Wallet
  tone: string
  title: string
  sub: string
  href: string
  cta: string
}) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}>
        <Icon className="size-4" />
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
