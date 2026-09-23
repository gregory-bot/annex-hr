import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, Cake, CalendarDays, CheckCircle2, Circle, Clock, FileText, Gauge, LogIn, LogOut, PartyPopper, Rocket, ScrollText, Timer } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import { Section } from '@/components/shared/Section'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TODAY, cn, daysUntil, formatDate, formatKES } from '@/lib/utils'
import { daysToBirthday, firstName } from './utils'

const fade = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: 0.04 + i * 0.04 } })

const balances = [
  { type: 'Annual', used: 7, total: 21 },
  { type: 'Sick', used: 2, total: 14 },
  { type: 'Compassionate', used: 0, total: 5 },
  { type: 'Study', used: 1, total: 5 },
]

export function PersonalDashboard() {
  const { user, role, employees, holidays, timesheets, department, workspace } = useWorkspace()
  const [clockedIn, setClockedIn] = useState(false)
  const [clockTime, setClockTime] = useState<string | null>(null)
  const [tasks, setTasks] = useState([
    { id: 'policy', title: 'Acknowledge Data Protection policy v3.1', due: 'Due 30 Sep', href: '/app/compliance?tab=policies', icon: ScrollText, done: false },
    { id: 'review', title: 'Complete Q3 self-review', due: 'Closes 10 Oct', href: '/app/performance', icon: Gauge, done: false },
    { id: 'survey', title: 'Answer the Q3 pulse survey', due: 'Closes 30 Sep', href: '/app/surveys', icon: PartyPopper, done: false },
  ])

  const upcomingHolidays = holidays
    .filter((h) => daysUntil(h.date) > 0 && (h.country === 'Kenya' || h.country === workspace.country))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const team = employees.filter((e) => e.status !== 'Exited' && e.id !== user.id && (e.departmentId === user.departmentId || e.managerId === user.managerId))
  const teamBirthdays = team
    .map((e) => ({ employee: e, ...daysToBirthday(e.birthday) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)

  const payslips = ['August 2026', 'July 2026', 'June 2026'].map((period, i) => ({ period, net: Math.round(user.salaryKES * 0.71) + (i === 2 ? 4200 : 0) }))

  const myTimesheet = timesheets.filter((t) => t.employeeId === user.id).sort((a, b) => b.week.localeCompare(a.week))[0]
  const weekHours = myTimesheet ? myTimesheet.entries.reduce((s, e) => s + e.hours.reduce((a, b) => a + b, 0), 0) : 0
  const billable = myTimesheet ? myTimesheet.entries.filter((e) => e.billable).reduce((s, e) => s + e.hours.reduce((a, b) => a + b, 0), 0) : 0
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const perDay = days.map((_, d) => (myTimesheet ? myTimesheet.entries.reduce((s, e) => s + (e.hours[d] ?? 0), 0) : 0))

  const toggleClock = () => {
    const now = '08:47'
    if (clockedIn) {
      setClockedIn(false)
      toast.success('Clocked out', { description: `Worked 8h 12m today · Great work, ${firstName(user.name)}.` })
    } else {
      setClockedIn(true)
      setClockTime(now)
      toast.success(`Clocked in at ${now}`, { description: 'Location verified · Nairobi HQ' })
    }
  }

  const completeTask = (id: string) => {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, done: true } : x)))
    toast.success('Task completed')
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <motion.div {...fade(0)} className="min-w-0 lg:col-span-2">
        <div className="relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#8f0d17] p-5 text-white sm:p-6">
          <div className="absolute -right-10 -top-10 size-44 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-24 size-40 rounded-full bg-white/5" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Badge className="border-white/20 bg-white/15 text-white">{role === 'consultant' ? 'Consultant' : user.title}</Badge>
              <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">Welcome to {workspace.name}</h2>
              <p className="mt-1 max-w-md text-sm text-white/80">
                {user.onboardingProgress < 100
                  ? `You're ${user.onboardingProgress}% through onboarding. Finish the remaining steps to unlock payroll and benefits.`
                  : `Everything you need is here — leave, payslips, documents and reviews. ${department(user.departmentId)?.name ?? ''} team`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="white" size="sm">
                  <Link to="/app/onboarding">
                    <Rocket /> {user.onboardingProgress < 100 ? 'Continue onboarding' : 'View onboarding'}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white">
                  <Link to="/app/leave">
                    <CalendarDays /> Request leave
                  </Link>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:flex-col sm:gap-2">
              <div className="relative flex size-24 items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="white"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - user.onboardingProgress / 100) }}
                    transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </svg>
                <span className="text-xl font-bold tabular">{user.onboardingProgress}%</span>
              </div>
              <span className="text-xs text-white/80">Onboarding</span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(1)} className="min-w-0">
        <Section title="Attendance" description={formatDate(TODAY, 'long')} className="h-full">
          <div className="flex items-center gap-4">
            <div className={cn('flex size-12 items-center justify-center rounded-full', clockedIn ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
              <Clock className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">{clockedIn ? `Clocked in · ${clockTime}` : 'Not clocked in'}</div>
              <div className="text-xs text-muted-foreground">Shift 08:30 – 17:00 · Nairobi HQ</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={toggleClock} variant={clockedIn ? 'outline' : 'default'}>
              {clockedIn ? <LogOut /> : <LogIn />} {clockedIn ? 'Clock out' : 'Clock in'}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/app/attendance">
                History <ArrowRight />
              </Link>
            </Button>
          </div>
        </Section>
      </motion.div>

      {role === 'consultant' && (
        <motion.div {...fade(2)} className="min-w-0 lg:col-span-3">
          <Section
            title="This week's timesheet"
            description={myTimesheet ? `Week of ${formatDate(myTimesheet.week, 'short')} · ${billable}h billable` : 'No timesheet yet'}
            action={
              <Button asChild size="sm" variant="soft">
                <Link to="/app/timesheets">
                  <Timer /> Open timesheet
                </Link>
              </Button>
            }
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <ProgressRing value={Math.min(100, Math.round((weekHours / 40) * 100))} size={84} stroke={8} label={`${weekHours}h`} />
                <div>
                  <div className="text-2xl font-bold tabular">{weekHours} / 40h</div>
                  <div className="text-xs text-muted-foreground">
                    {myTimesheet ? <StatusBadge status={myTimesheet.status} /> : null}
                    {myTimesheet && <span className="ml-2">{formatKES(billable * myTimesheet.rate)} billable value</span>}
                  </div>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-7 items-end gap-1.5 sm:gap-3" style={{ height: 96 }}>
                {perDay.map((h, i) => (
                  <div key={days[i]} className="flex h-full flex-col items-center justify-end gap-1" title={`${days[i]}: ${h}h`}>
                    <motion.div
                      className="w-full max-w-7 rounded-t bg-primary"
                      initial={{ height: 0 }}
                      animate={{ height: `${(h / 10) * 70}px` }}
                      transition={{ delay: 0.1 + i * 0.04 }}
                    />
                    <span className="text-[10px] text-muted-foreground">{days[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </motion.div>
      )}

      <motion.div {...fade(3)} className="min-w-0 lg:col-span-2">
        <Section
          title="Leave balances"
          description="2026 entitlement"
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/app/leave">
                Request <ArrowRight />
              </Link>
            </Button>
          }
          className="h-full"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {balances.map((b) => (
              <div key={b.type} className="rounded-lg border bg-subtle p-3">
                <div className="text-xs text-muted-foreground">{b.type}</div>
                <div className="mt-1 text-xl font-bold tabular">
                  {b.total - b.used}
                  <span className="text-xs font-medium text-muted-foreground"> / {b.total} days</span>
                </div>
                <Progress value={((b.total - b.used) / b.total) * 100} className="mt-2 h-1.5" />
              </div>
            ))}
          </div>
        </Section>
      </motion.div>

      <motion.div {...fade(4)} className="min-w-0">
        <Section title="My tasks" description={`${tasks.filter((t) => !t.done).length} pending`} className="h-full">
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <button onClick={() => !t.done && completeTask(t.id)} aria-label="Mark complete" className="shrink-0">
                  {t.done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted-foreground hover:text-primary" />}
                </button>
                <Link to={t.href} className="min-w-0 flex-1">
                  <div className={cn('truncate text-sm font-medium', t.done && 'text-muted-foreground line-through')}>{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.due}</div>
                </Link>
                <t.icon className="size-4 shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ul>
        </Section>
      </motion.div>

      <motion.div {...fade(5)} className="min-w-0">
        <Section title="Upcoming holidays" className="h-full">
          <ul className="space-y-3">
            {upcomingHolidays.map((h) => (
              <li key={h.date + h.name} className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent text-primary">
                  <span className="text-[10px] font-semibold uppercase leading-none">{formatDate(h.date, 'short').split(' ')[1]}</span>
                  <span className="text-base font-bold leading-tight">{formatDate(h.date, 'short').split(' ')[0]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {h.country} · in {daysUntil(h.date)} days
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </motion.div>

      <motion.div {...fade(6)} className="min-w-0">
        <Section title="Team birthdays" className="h-full">
          {teamBirthdays.length === 0 ? (
            <EmptyState icon={Cake} title="No team birthdays" />
          ) : (
            <ul className="space-y-3">
              {teamBirthdays.map((b) => (
                <li key={b.employee.id} className="flex items-center gap-3">
                  <PersonAvatar name={b.employee.name} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{b.employee.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{b.employee.title}</div>
                  </div>
                  <Badge variant={b.days <= 7 ? 'soft' : 'muted'}>{b.days === 0 ? 'Today' : formatDate(b.date, 'short')}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </motion.div>

      <motion.div {...fade(7)} className="min-w-0">
        <Section
          title="Recent payslips"
          className="h-full"
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/app/documents">All</Link>
            </Button>
          }
        >
          <ul className="space-y-2">
            {payslips.map((p) => (
              <li key={p.period}>
                <button
                  onClick={() => toast.success(`Payslip ${p.period} downloaded`, { description: 'Password: your KRA PIN' })}
                  className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition hover:bg-muted/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.period}</div>
                    <div className="text-xs text-muted-foreground">Net pay · PDF</div>
                  </div>
                  <span className="text-sm font-semibold tabular">{formatKES(p.net)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </motion.div>
    </div>
  )
}
