import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { PersonCell } from '@/components/shared/PersonCell'
import { StoredFileCard } from '@/components/shared/StoredFileCard'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartTooltip, SERIES } from '@/components/charts/ChartKit'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { cn, daysUntil, formatDate, formatKES } from '@/lib/utils'
import { addDays, mask, reportsToChain, tenure } from './helpers'
import { useEmployeeFiles } from './profileApi'

const ANNUAL_ENTITLEMENT = 21

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  )
}

export function ProfileDrawer({
  employee,
  onOpenChange,
  onDeactivate,
}: {
  employee: Employee | null
  onOpenChange: (open: boolean) => void
  onDeactivate: (e: Employee) => void
}) {
  return (
    <Sheet open={!!employee} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl">
        {employee && <ProfileBody key={employee.id} emp={employee} onDeactivate={onDeactivate} />}
      </SheetContent>
    </Sheet>
  )
}

function ProfileBody({ emp, onDeactivate }: { emp: Employee; onDeactivate: (e: Employee) => void }) {
  const ws = useWorkspace()
  const { role, complianceDocs, leaveRequests } = ws
  const admin = isAdminLike(role)
  const isSelf = ws.user.id === emp.id
  const canSeePrivate = admin || isSelf
  const showSalary = admin || role === 'finance'
  const [reveal, setReveal] = useState(false)
  // Uploaded files: the employee, HR, the CEO and the person's own manager.
  const canViewFiles = admin || isSelf || (role === 'manager' && emp.managerId === ws.user.id)
  const { files, loading: filesLoading } = useEmployeeFiles(emp.id, canViewFiles)
  const profileHref = `/app/people/${emp.id}`

  const dept = ws.department(emp.departmentId)
  const manager = ws.employee(emp.managerId)
  const chain = reportsToChain(emp, ws.employee)
  const reports = ws.employees.filter((e) => e.managerId === emp.id)
  const docs = complianceDocs.filter((d) => d.employeeId === emp.id)
  const leave = leaveRequests.filter((l) => l.employeeId === emp.id).sort((a, b) => b.start.localeCompare(a.start))
  const usedAnnual = leave.filter((l) => l.type === 'Annual' && l.status === 'Approved').reduce((s, l) => s + l.days, 0)
  const pendingAnnual = leave.filter((l) => l.type === 'Annual' && l.status === 'Pending').reduce((s, l) => s + l.days, 0)
  const sickUsed = leave.filter((l) => l.type === 'Sick' && l.status === 'Approved').reduce((s, l) => s + l.days, 0)

  const radar = useMemo(() => {
    const p = emp.performance
    const wobble = (k: number) => Math.max(1, Math.min(5, Math.round((p + (((emp.id.charCodeAt(emp.id.length - 1) + k * 7) % 9) - 4) * 0.15) * 10) / 10))
    return ['Delivery', 'Quality', 'Collaboration', 'Ownership', 'Growth', 'Values'].map((axis, i) => ({ axis, score: wobble(i) }))
  }, [emp])

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: (TimelineItem & { date: string })[] = []
    items.push({ date: emp.startDate, title: `Joined ${ws.workspace.name}`, meta: formatDate(emp.startDate), body: `${emp.title} · ${dept?.name ?? ''}`, state: 'done' })
    const onProbation = emp.status === 'Probation' || emp.status === 'Onboarding'
    const probEnd = emp.probationEnd ?? addDays(emp.startDate, 90)
    if (onProbation) {
      items.push({ date: probEnd, title: 'Probation review', meta: formatDate(probEnd), body: `${Math.max(0, daysUntil(probEnd))} days remaining`, state: 'current' })
    } else if (daysUntil(probEnd) < 0) {
      items.push({ date: probEnd, title: 'Probation confirmed', meta: formatDate(probEnd), body: 'Confirmed as permanent after 90-day review', state: 'done' })
    }
    const days = -daysUntil(emp.startDate)
    if (days > 540) {
      const d = addDays(emp.startDate, 420)
      items.push({ date: d, title: 'Salary review', meta: formatDate(d), body: 'Annual compensation review completed', state: 'done' })
    }
    if (days > 900 || emp.role === 'manager') {
      const d = addDays(emp.startDate, Math.min(days - 30, 760))
      items.push({ date: d, title: emp.role === 'manager' ? `Promoted to ${emp.title}` : 'Promotion', meta: formatDate(d), body: 'Approved by department head and HR', state: 'done' })
    }
    if (emp.performance >= 4.3) {
      const d = addDays('2026-09-23', -120)
      if (d > emp.startDate) items.push({ date: d, title: 'Recognised: Star performer H1', meta: formatDate(d), state: 'done' })
    }
    if (emp.status === 'Notice Period') {
      items.push({ date: '2026-09-23', title: 'Serving notice', meta: 'Now', body: 'Offboarding checklist in progress', state: 'current' })
    }
    const nextReview = '2026-12-15'
    items.push({ date: nextReview, title: 'Year-end performance review', meta: formatDate(nextReview), state: 'upcoming' })
    return items.sort((a, b) => b.date.localeCompare(a.date)).map(({ date: _d, ...rest }) => rest)
  }, [emp, dept, ws.workspace.name])

  const showId = canSeePrivate && reveal

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="relative border-b bg-gradient-to-b from-accent/60 to-card px-5 pb-5 pt-8 sm:px-6">
        <div className="flex items-start gap-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <PersonAvatar name={emp.name} src={emp.photo} className="size-16 text-lg ring-4 ring-card sm:size-20 sm:text-xl" />
          </motion.div>
          <div className="min-w-0 flex-1 pt-1">
            <SheetTitle className="truncate text-xl">{emp.name}</SheetTitle>
            <SheetDescription className="truncate">
              {emp.title} · {dept?.name}
            </SheetDescription>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={emp.status} />
              <Badge variant="outline">{emp.employmentType}</Badge>
              <span className="text-xs text-muted-foreground">{emp.employeeNo}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={`mailto:${emp.email}`}>
              Email
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`tel:${emp.phone.replace(/\s/g, '')}`}>
              Call
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={profileHref}>
              View full profile
            </Link>
          </Button>
          {admin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" aria-label="More actions">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link to={profileHref}>
                    View full profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`${profileHref}?tab=personal&edit=1`}>
                    Edit profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`/app/offboarding?employee=${emp.id}`}>
                    Start offboarding
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => onDeactivate(emp)}>
                  Deactivate account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="px-5 py-4 sm:px-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="grid grid-cols-1 gap-5">
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</h4>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Work email">
                <a className="text-primary hover:underline" href={`mailto:${emp.email}`}>
                  {emp.email}
                </a>
              </Field>
              <Field label="Phone">{emp.phone}</Field>
              <Field label="Location">
{emp.location}
              </Field>
              <Field label="Employee no.">{emp.employeeNo}</Field>
            </dl>
          </section>
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employment</h4>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: dept?.color }} />
                  {dept?.name}
                </span>
              </Field>
              <Field label="Employment type">{emp.employmentType}</Field>
              <Field label="Start date">{formatDate(emp.startDate)}</Field>
              <Field label="Tenure">{tenure(emp.startDate)}</Field>
              <Field label="Manager">{manager?.name ?? '—'}</Field>
              <Field label="Direct reports">{reports.length}</Field>
              {showSalary && <Field label="Monthly gross">{formatKES(emp.salaryKES)}</Field>}
              {emp.probationEnd && <Field label="Probation ends">{formatDate(emp.probationEnd)}</Field>}
            </dl>
          </section>
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reports-to chain</h4>
            {chain.length === 0 ? (
              <p className="text-sm text-muted-foreground">Top of the organisation.</p>
            ) : (
              <ol className="flex flex-wrap items-center gap-2">
                {[...chain].reverse().map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <div className="rounded-lg border bg-subtle px-2.5 py-1.5">
                      <PersonCell name={m.name} sub={m.title} size="sm" />
                    </div>
                    <span className="text-muted-foreground">›</span>
                  </li>
                ))}
                <li className="rounded-lg border border-primary/30 bg-accent/50 px-2.5 py-1.5">
                  <PersonCell name={emp.name} sub="This person" size="sm" />
                </li>
              </ol>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statutory identifiers</h4>
              {canSeePrivate && (
                <Button variant="ghost" size="sm" onClick={() => setReveal((r) => !r)}>
                  {reveal ? 'Hide' : 'Reveal'}
                </Button>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="KRA PIN">
                <span className="font-mono tabular">{showId ? emp.kraPin : mask(emp.kraPin)}</span>
              </Field>
              <Field label="National ID">
                <span className="font-mono tabular">{showId ? emp.nationalId : mask(emp.nationalId)}</span>
              </Field>
            </dl>
            {!canSeePrivate && <p className="mt-2 text-xs text-muted-foreground">Identifiers are visible to HR and the employee only.</p>}
          </section>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="grid grid-cols-1 gap-5">
          {canViewFiles && (
            <section>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploaded files</h4>
              {filesLoading ? (
                <div className="grid grid-cols-1 gap-2">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              ) : files && files.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2">
                  {files.map((f) => (
                    <li key={f.id}>
                      <StoredFileCard file={f} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No files uploaded yet — onboarding uploads (ID, KRA PIN, SHIF, NSSF) appear here.</p>
              )}
            </section>
          )}
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compliance documents</h4>
            {docs.length === 0 ? (
              <EmptyState title="No compliance documents" description="Contracts, permits and certificates will appear here." className="py-8" />
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {docs.map((d, i) => (
                  <motion.li
                    key={d.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.type}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {canSeePrivate ? d.number : mask(d.number)} · {d.expires ? `Expires ${formatDate(d.expires)}` : `Issued ${formatDate(d.issued)}`}
                      </div>
                    </div>
                    <StatusBadge status={d.status} />
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
          <Button variant="outline" size="sm" asChild className="justify-self-start">
            <Link to={`${profileHref}?tab=documents`}>Open all documents</Link>
          </Button>
        </TabsContent>

        {/* Leave */}
        <TabsContent value="leave" className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Annual left', value: Math.max(0, ANNUAL_ENTITLEMENT - usedAnnual), hint: `of ${ANNUAL_ENTITLEMENT} days` },
              { label: 'Pending', value: pendingAnnual, hint: 'days awaiting' },
              { label: 'Sick taken', value: sickUsed, hint: 'of 14 days' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-subtle p-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
                <div className="mt-1 text-xl font-bold tabular">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.hint}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Annual leave used</span>
              <span className="tabular">
                {usedAnnual}/{ANNUAL_ENTITLEMENT} days
              </span>
            </div>
            <Progress value={(usedAnnual / ANNUAL_ENTITLEMENT) * 100} />
          </div>
          {leave.length === 0 ? (
            <EmptyState title="No leave requests" description="Requests and approvals will show up here." />
          ) : (
            <ul className="divide-y rounded-lg border">
              {leave.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {l.type} · {l.days} day{l.days === 1 ? '' : 's'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(l.start, 'short')} – {formatDate(l.end)}
                    </div>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-subtle p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Performance score</div>
              <div className="mt-1 text-2xl font-bold tabular">
                {emp.performance.toFixed(1)}
                <span className="text-sm font-medium text-muted-foreground"> / 5</span>
              </div>
              <Progress value={(emp.performance / 5) * 100} className="mt-2 h-1.5" />
            </div>
            <div className="rounded-lg border bg-subtle p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Potential</div>
              <div className="mt-1 text-2xl font-bold">{['Low', 'Moderate', 'High'][emp.potential - 1]}</div>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3].map((n) => (
                  <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= emp.potential ? 'bg-primary' : 'bg-muted')} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-sm font-medium">Competency profile · H1 2026</div>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Radar name="Score" dataKey="score" stroke={SERIES[0]} fill={SERIES[0]} fillOpacity={0.18} strokeWidth={2} />
                <RTooltip content={<ChartTooltip valueFormatter={(v) => `${v.toFixed(1)} / 5`} />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground">Next review cycle opens 15 Dec 2026.</p>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline">
          <Timeline items={timeline} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
