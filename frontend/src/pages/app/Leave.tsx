import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import type { LeaveRequest, LeaveType } from '@/data/types'
import { useWorkspace } from '@/context/auth'
import { isAdminLike, isLeader } from '@/lib/rbac'
import { cn, daysUntil, formatDate, TODAY } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { Kanban, type KanbanColumn } from '@/components/shared/Kanban'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tip } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { ApplyLeaveDialog } from './leave/ApplyLeaveDialog'
import { HolidayManager, PolicyEditor } from './leave/Admin'
import { handoverUrl, type BalancesResponse, type LeaveRow } from './leave/api'
import { TeamCalendar } from './leave/TeamCalendar'
import { ANNUAL_ACCRUAL, LEAVE_TYPES, approveStep, leaveMeta, needsCEO, overlaps, stageOf, type Stage } from './leave/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CURRENT_MONTH = 9 // September 2026

/** Days already used earlier in the year (before the requests on record). */
const PRIOR_USED: Record<LeaveType, number> = { Annual: 3, Sick: 1, Maternity: 0, Paternity: 0, Compassionate: 0, Study: 0 }

const EXTRA_HOLIDAYS = [
  { date: '2026-01-01', name: "New Year's Day", country: 'Nigeria' },
  { date: '2026-06-12', name: 'Democracy Day', country: 'Nigeria' },
  { date: '2026-12-25', name: 'Christmas Day', country: 'Nigeria' },
  { date: '2026-01-26', name: 'NRM Liberation Day', country: 'Uganda' },
  { date: '2026-06-03', name: "Martyrs' Day", country: 'Uganda' },
  { date: '2026-12-25', name: 'Christmas Day', country: 'Uganda' },
  { date: '2026-02-01', name: "Heroes' Day", country: 'Rwanda' },
  { date: '2026-04-07', name: 'Genocide against the Tutsi Memorial Day', country: 'Rwanda' },
  { date: '2026-07-01', name: 'Independence Day', country: 'Rwanda' },
  { date: '2026-12-25', name: 'Christmas Day', country: 'Rwanda' },
]
const COUNTRIES = ['Kenya', 'Nigeria', 'Uganda', 'Rwanda'] as const

const COLUMNS: { id: Stage; title: string; tone: KanbanColumn<LeaveRequest>['tone'] }[] = [
  { id: 'manager', title: 'Manager review', tone: 'warning' },
  { id: 'hr', title: 'HR review', tone: 'info' },
  { id: 'ceo', title: 'CEO review', tone: 'default' },
  { id: 'approved', title: 'Approved', tone: 'success' },
  { id: 'rejected', title: 'Rejected', tone: 'danger' },
]

export default function Leave() {
  const ws = useWorkspace()
  const { user, role, employees, holidays, employee, workspace } = ws
  const leader = isLeader(role)
  const [params, setParams] = useSearchParams()

  const [requests, setRequests] = useState<LeaveRow[]>(() => !USE_MOCK_API ? ws.leaveRequests : [
    { id: 'lv-me-1', employeeId: user.id, type: 'Annual', start: '2026-07-13', end: '2026-07-17', days: 5, reason: 'Family trip to Diani', status: 'Approved', stage: 'Complete', submitted: '2026-06-22', handoverNotes: true },
    { id: 'lv-me-2', employeeId: user.id, type: 'Sick', start: '2026-08-04', end: '2026-08-05', days: 2, reason: 'Flu — doctor’s note attached', status: 'Approved', stage: 'Complete', submitted: '2026-08-06' },
    { id: 'lv-me-3', employeeId: user.id, type: 'Annual', start: '2026-10-12', end: '2026-10-14', days: 3, reason: 'Graduation ceremony in Eldoret', status: 'Pending', stage: 'HR', submitted: '2026-09-18', handoverNotes: true },
    ...ws.leaveRequests.filter((r) => r.employeeId !== user.id),
  ])

  const [server, setServer] = useState<BalancesResponse | null>(null)
  const loadBalances = useCallback(() => {
    if (USE_MOCK_API) return
    api
      .get<BalancesResponse>('/leave/balances/me')
      .then(setServer)
      .catch((err) => toast.error('Could not load leave balances', { description: errorMessage(err) }))
  }, [])

  // Live mode: requests with handover files and HR alerts, and balances computed by the server.
  useEffect(() => {
    if (USE_MOCK_API) return
    let live = true
    api
      .get<LeaveRow[]>('/leave-requests')
      .then((rows) => live && setRequests(rows))
      .catch((err) => live && toast.error('Could not load leave requests', { description: errorMessage(err) }))
    loadBalances()
    return () => {
      live = false
    }
  }, [loadBalances])

  const [applyOpen, setApplyOpen] = useState(() => params.get('apply') === '1')
  const rawTab = params.get('tab') ?? (leader ? 'approvals' : 'mine')
  const tab = !leader && rawTab === 'approvals' ? 'mine' : rawTab
  const setTab = (t: string) =>
    setParams(
      (p) => {
        p.set('tab', t)
        p.delete('apply')
        return p
      },
      { replace: true },
    )

  const localHolidays = useMemo(() => holidays.filter((h) => h.country === workspace.country), [holidays, workspace.country])
  const mine = requests.filter((r) => r.employeeId === user.id)

  const mockBalances = useMemo(() => {
    const used = { ...PRIOR_USED }
    mine.filter((r) => r.status === 'Approved').forEach((r) => (used[r.type] += r.days))
    const pending = { Annual: 0, Sick: 0, Maternity: 0, Paternity: 0, Compassionate: 0, Study: 0 } as Record<LeaveType, number>
    mine.filter((r) => r.status === 'Pending').forEach((r) => (pending[r.type] += r.days))
    return LEAVE_TYPES.map((t) => ({
      type: t,
      used: used[t],
      pending: pending[t],
      entitlement: leaveMeta[t].entitlement,
      remaining: Math.max(0, leaveMeta[t].entitlement - used[t] - pending[t]),
      note: t === 'Annual' ? `${(ANNUAL_ACCRUAL * CURRENT_MONTH).toFixed(2)} accrued · 1.75/month` : leaveMeta[t].note,
    }))
  }, [mine])
  const balances = useMemo(
    () =>
      USE_MOCK_API || !server
        ? mockBalances.map((b) => (USE_MOCK_API ? b : { ...b, used: 0, pending: 0, remaining: 0, note: 'Loading…' }))
        : server.balances.map((b) => ({
            type: b.type,
            used: b.taken,
            pending: b.pending,
            entitlement: b.available,
            remaining: b.remaining,
            note:
              b.accrual === 'monthly'
                ? `${b.accrued} accrued${b.carriedOver ? ` + ${b.carriedOver} carried` : ''} · ${b.monthlyRate}/month`
                : `${b.annualDays} days a year${b.remaining < 0 ? ' · over balance' : ''}`,
          })),
    [mockBalances, server],
  )
  const remaining = Object.fromEntries(balances.map((b) => [b.type, b.remaining])) as Record<LeaveType, number>

  const colleagues = useMemo(
    () =>
      employees
        .filter((e) => e.id !== user.id && e.status !== 'Exited')
        .sort((a, b) => Number(b.departmentId === user.departmentId) - Number(a.departmentId === user.departmentId))
        .slice(0, 30),
    [employees, user],
  )

  // Scope for approvals & calendar
  const scoped = useMemo(() => {
    if (role === 'manager') {
      const team = requests.filter((r) => employee(r.employeeId)?.departmentId === user.departmentId)
      return team.length >= 3 ? team : requests
    }
    if (leader) return requests
    return requests.filter((r) => employee(r.employeeId)?.departmentId === user.departmentId)
  }, [requests, role, leader, employee, user.departmentId])

  /** Sends a decision to the API (real mode) and reconciles with the server's version of the request. */
  const persistDecision = (r: LeaveRow, decision: 'approve' | 'reject', optimistic: LeaveRow) => {
    if (USE_MOCK_API) return
    api
      .post<LeaveRow>(`/leave-requests/${r.id}/decision`, { decision })
      .then((saved) => setRequests((prev) => prev.map((x) => (x.id === r.id ? saved : x))))
      .catch((err) => {
        setRequests((prev) => prev.map((x) => (x.id === r.id && x.stage === optimistic.stage && x.status === optimistic.status ? r : x)))
        toast.error('Decision not saved', { description: errorMessage(err) })
      })
  }

  const approve = (r: LeaveRow) => {
    const next = approveStep(r)
    setRequests((prev) => prev.map((x) => (x.id === r.id ? next : x)))
    persistDecision(r, 'approve', next)
    const name = employee(r.employeeId)?.name ?? 'Request'
    if (next.status === 'Approved') toast.success(`${name}'s leave approved`, { description: `${r.days} days of ${r.type} leave · employee notified` })
    else toast.success(`Approved — sent to ${next.stage === 'HR' ? 'HR' : 'the CEO'}`, { description: `${name} · ${r.type} leave` })
  }
  const decline = (r: LeaveRow) => {
    const next: LeaveRow = { ...r, status: 'Rejected', stage: 'Complete' }
    setRequests((prev) => prev.map((x) => (x.id === r.id ? next : x)))
    persistDecision(r, 'reject', next)
    toast.error(`${employee(r.employeeId)?.name ?? 'Request'}'s leave declined`, { description: 'The employee has been notified with your comment.' })
  }

  const hasAlert = (r: LeaveRow): string | null => {
    if (!USE_MOCK_API) return r.alerts?.length ? r.alerts.join(' · ') : null
    if (r.days > 10) return 'Long leave'
    const dept = employee(r.employeeId)?.departmentId
    const clash = requests.some((o) => o.id !== r.id && o.status !== 'Rejected' && employee(o.employeeId)?.departmentId === dept && overlaps(o, r))
    return clash ? 'Team overlap' : null
  }

  const pendingCount = scoped.filter((r) => r.status === 'Pending').length
  const offToday = scoped.filter((r) => r.status === 'Approved' && r.start <= TODAY && r.end >= TODAY).length

  return (
    <div>
      <PageHeader
        eyebrow="People Ops"
        title="Leave"
        description={leader ? `${pendingCount} requests awaiting approval · ${offToday} people off today` : 'Your balances, requests and who’s away on your team.'}
        actions={
          <Button onClick={() => setApplyOpen(true)}>
            Apply leave
          </Button>
        }
      />

      {/* Balances */}
      <div className="-mx-4 mb-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-6">
        {balances.map((b, i) => {
          const meta = leaveMeta[b.type]
          const pct = b.entitlement ? Math.min(100, Math.max(0, ((b.entitlement - b.remaining) / b.entitlement) * 100)) : 0
          return (
            <motion.div
              key={b.type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="w-[70vw] max-w-[240px] shrink-0 snap-start rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:w-auto sm:max-w-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden /> {b.type}
                  </div>
                  <div className="mt-2 text-2xl font-bold tabular">
                    {b.remaining}
                    <span className="ml-1 text-xs font-medium text-muted-foreground">/ {b.entitlement} days</span>
                  </div>
                </div>
                <ProgressRing value={pct} size={46} stroke={5} label={<span className="text-[10px]">{Math.round(pct)}%</span>} />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{b.note}</div>
            </motion.div>
          )
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {leader && (
            <TabsTrigger value="approvals">
              Approvals
              {pendingCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{pendingCount}</span>}
            </TabsTrigger>
          )}
          <TabsTrigger value="mine">
            My requests
          </TabsTrigger>
          <TabsTrigger value="calendar">
            Team calendar
          </TabsTrigger>
          <TabsTrigger value="holidays">
            Holiday calendar
          </TabsTrigger>
          <TabsTrigger value="accruals">
            Accruals
          </TabsTrigger>
        </TabsList>

        {leader && (
          <TabsContent value="approvals">
            <Kanban<LeaveRow>
              columns={COLUMNS.map((c) => ({ ...c, items: scoped.filter((r) => stageOf(r) === c.id) }))}
              itemKey={(r) => r.id}
              renderCard={(r, col) => {
                const e = employee(r.employeeId)
                const alert = hasAlert(r)
                const actionable = col === 'manager' || col === 'hr' || col === 'ceo'
                const own = r.employeeId === user.id
                return (
                  <div className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <PersonCell name={e?.name ?? 'Unknown'} sub={e?.title} size="sm" />
                      <Badge variant="outline" className="shrink-0">
                        <span className="size-1.5 rounded-full" style={{ background: leaveMeta[r.type].color }} />
                        {r.type}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatDate(r.start, 'short')} – {formatDate(r.end, 'short')}
                      </span>
                      <span className="font-semibold text-foreground tabular">{r.days}d</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.handoverFileId ? (
                        <Tip label={`${r.handoverFileName ?? 'Handover notes'} · handover to ${employee(r.handoverTo)?.name ?? 'colleague'}`}>
                          <a href={handoverUrl(r.id)} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Badge variant="muted" className="underline-offset-2 hover:underline">
                              Download handover notes
                            </Badge>
                          </a>
                        </Tip>
                      ) : r.handoverNotes ? (
                        <Tip label={`Handover to ${employee(r.handoverTo)?.name ?? 'colleague'}`}>
                          <span>
                            <Badge variant="muted">
                              Handover notes
                            </Badge>
                          </span>
                        </Tip>
                      ) : (
                        <Badge variant="muted" className="opacity-70">
                          No handover notes
                        </Badge>
                      )}
                      {alert && actionable && (
                        <Tip label={`${alert} — HR has been alerted`}>
                          <span>
                            <Badge variant="warning">
                              Alerts to HR
                            </Badge>
                          </span>
                        </Tip>
                      )}
                    </div>
                    {actionable && own && <div className="mt-3 text-xs text-muted-foreground">Your own request — another approver will decide.</div>}
                    {actionable && !own && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={() => decline(r)}>
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => approve(r)}>
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                )
              }}
            />
            <p className="mt-3 text-xs text-muted-foreground">Route: Manager → HR → CEO. CEO sign-off applies to requests over 10 days and all Maternity or Study leave.</p>
          </TabsContent>
        )}

        <TabsContent value="mine">
          {mine.length === 0 ? (
            <EmptyState title="No leave requests yet" description="Apply for leave and track every approval step here." action={<Button onClick={() => setApplyOpen(true)}>Apply leave</Button>} />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[...mine]
                .sort((a, b) => b.submitted.localeCompare(a.submitted))
                .map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="p-5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="size-2 rounded-full" style={{ background: leaveMeta[r.type].color }} />
                            {r.type} leave · {r.days} day{r.days === 1 ? '' : 's'}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(r.start)} – {formatDate(r.end)} · {r.reason}
                          </div>
                          {(r.handoverFileId || r.balanceWarning) && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {r.handoverFileId && (
                                <a href={handoverUrl(r.id)} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
                                  {r.handoverFileName ?? 'Handover notes'}
                                </a>
                              )}
                              {r.balanceWarning && <Badge variant="warning">Over balance · HR alerted</Badge>}
                            </div>
                          )}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <Timeline items={timelineFor(r)} />
                    </Card>
                  </motion.div>
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Section title="Team calendar" description={leader ? 'Approved and pending leave across the organisation' : 'Who’s away in your department'}>
            <TeamCalendar requests={scoped} holidays={holidays} employee={employee} />
          </Section>
        </TabsContent>

        <TabsContent value="holidays">
          {USE_MOCK_API ? <HolidayCalendar holidays={holidays} /> : <HolidayManager canEdit={isAdminLike(role)} defaultCountry={workspace.country} />}
        </TabsContent>

        <TabsContent value="accruals">
          {USE_MOCK_API ? (
            <Accruals used={balances[0]!.used} />
          ) : (
            <LiveAccruals data={server} admin={isAdminLike(role)} onPolicySaved={loadBalances} />
          )}
        </TabsContent>
      </Tabs>

      <ApplyLeaveDialog
        open={applyOpen}
        onOpenChange={(o) => {
          setApplyOpen(o)
          if (!o && params.get('apply')) {
            setParams(
              (p) => {
                p.delete('apply')
                return p
              },
              { replace: true },
            )
          }
        }}
        user={user}
        colleagues={colleagues}
        holidays={localHolidays}
        remaining={remaining}
        onSubmit={async (r) => {
          if (USE_MOCK_API) {
            setRequests((prev) => [r, ...prev])
            return r
          }
          // Wait for the server: it recalculates working days and checks the balance.
          const saved = await api.post<LeaveRow>('/leave-requests', {
            type: r.type,
            start: r.start,
            end: r.end,
            reason: r.reason,
            handoverTo: r.handoverTo,
            handoverNotes: r.handoverNotes,
            handoverFileId: r.handoverFileId,
          })
          setRequests((prev) => [saved, ...prev])
          loadBalances()
          if (saved.balanceWarning) toast.warning('Over your balance', { description: 'Submitted — HR has been alerted to review it.' })
          return saved
        }}
      />
    </div>
  )
}

function timelineFor(r: LeaveRequest): TimelineItem[] {
  const route: ('Manager' | 'HR' | 'CEO')[] = needsCEO(r.days, r.type) ? ['Manager', 'HR', 'CEO'] : ['Manager', 'HR']
  const labels = { Manager: 'Manager review', HR: 'HR review', CEO: 'CEO review' }
  const currentIdx = r.status === 'Pending' ? route.indexOf(r.stage as 'Manager') : route.length
  const items: TimelineItem[] = [{ title: 'Submitted', meta: formatDate(r.submitted, 'short'), state: 'done' }]
  route.forEach((step, i) => {
    items.push({
      title: labels[step],
      state: r.status === 'Rejected' ? 'done' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
      meta: r.status === 'Pending' && i === currentIdx ? 'In progress' : undefined,
    })
  })
  items.push({
    title: r.status === 'Rejected' ? 'Declined' : r.status === 'Approved' ? 'Approved — enjoy your time off' : 'Final decision',
    state: r.status === 'Pending' ? 'upcoming' : 'done',
  })
  return items
}

function HolidayCalendar({ holidays }: { holidays: { date: string; name: string; country: string }[] }) {
  const all = useMemo(() => {
    const seen = new Set<string>()
    return [...holidays, ...EXTRA_HOLIDAYS].filter((h) => {
      const k = h.date + h.country
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [holidays])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {COUNTRIES.map((country, ci) => {
        const list = all.filter((h) => h.country === country).sort((a, b) => a.date.localeCompare(b.date))
        const next = list.find((h) => daysUntil(h.date) >= 0)
        return (
          <motion.div key={country} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05 }}>
            <Section
              title={country}
              description={`${list.length} public holidays in 2026`}
              action={next && <Badge variant="soft">Next in {daysUntil(next.date)} days</Badge>}
            >
              <ul className="divide-y">
                {list.map((h) => {
                  const d = daysUntil(h.date)
                  const isNext = h === next
                  return (
                    <li key={h.date + h.name} className={cn('flex items-center gap-3 py-2.5', d < 0 && 'opacity-50', isNext && '-mx-2 rounded-lg border-0 bg-accent/60 px-2')}>
                      <div className={cn('flex w-11 shrink-0 flex-col items-center rounded-lg py-1', isNext ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                        <span className="text-[10px] font-semibold uppercase">{formatDate(h.date, 'short').split(' ')[1]}</span>
                        <span className="text-base font-bold leading-none tabular">{formatDate(h.date, 'short').split(' ')[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{h.name}</div>
                        <div className="text-xs text-muted-foreground">{new Date(h.date).toLocaleDateString('en-GB', { weekday: 'long' })}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{d < 0 ? 'Passed' : d === 0 ? 'Today' : isNext ? 'Upcoming' : `in ${d}d`}</span>
                    </li>
                  )
                })}
              </ul>
            </Section>
          </motion.div>
        )
      })}
    </div>
  )
}

function Accruals({ used }: { used: number }) {
  const id = useId().replace(/:/g, '')
  const data = MONTHS.map((month, i) => {
    const m = i + 1
    const taken = m >= 7 ? used : m >= 3 ? PRIOR_USED.Annual : 0
    return { month, accrued: +(ANNUAL_ACCRUAL * m).toFixed(2), taken: m <= CURRENT_MONTH ? taken : null }
  })
  const series = [
    { key: 'accrued', label: 'Accrued', color: SERIES[0] },
    { key: 'taken', label: 'Taken', color: SERIES[1] },
  ]
  const policy = [
    { item: 'Annual entitlement', value: '21 working days' },
    { item: 'Accrual rate', value: '1.75 days per completed month' },
    { item: 'Carry-over cap', value: '5 days into the next leave year' },
    { item: 'Carry-over expiry', value: '31 March 2027 — unused days lapse' },
    { item: 'Probation', value: 'Accrues from day one; usable after 3 months' },
    { item: 'Encashment', value: 'Only on exit, via final dues' },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Section className="lg:col-span-3" title="Annual leave accrual — 2026" description={`${(ANNUAL_ACCRUAL * CURRENT_MONTH).toFixed(2)} days accrued to date · ${used} taken`} action={<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} days`} />} cursor={{ stroke: 'var(--border)' }} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${id}-${s.key})`} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Section>
      <Section className="lg:col-span-2" title="Accrual policy" description="Leave Policy v3.2 · Employment Act 2007">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Setting</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policy.map((p) => (
              <TableRow key={p.item}>
                <TableCell className="px-3 text-muted-foreground">{p.item}</TableCell>
                <TableCell className="px-3 font-medium">{p.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  )
}

/** Accrual chart and policy from the server; HR admins can edit the policy. */
function LiveAccruals({ data, admin, onPolicySaved }: { data: BalancesResponse | null; admin: boolean; onPolicySaved: () => void }) {
  const id = useId().replace(/:/g, '')
  if (!data) return <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">Loading accruals…</div>
  const annual = data.balances.find((b) => b.type === 'Annual')!
  const series = [
    { key: 'accrued', label: 'Accrued', color: SERIES[0] },
    { key: 'taken', label: 'Taken', color: SERIES[1] },
  ]
  const expiry = annual.expiresMonthDay ? formatDate(`${data.year + 1}-${annual.expiresMonthDay}`, 'long') : null
  const policy = [
    { item: 'Annual entitlement', value: `${annual.annualDays} working days` },
    { item: 'Accrual', value: annual.accrual === 'monthly' ? `${annual.monthlyRate} days per completed month` : 'Full entitlement at the start of the year' },
    { item: 'Carry-over cap', value: annual.carryOverMax ? `${annual.carryOverMax} days into the next leave year` : 'No carry-over' },
    { item: 'Carry-over expiry', value: annual.carryOverMax ? (expiry ? `${expiry} — unused days lapse` : 'Never expires') : '—' },
    { item: 'Carried into ' + data.year, value: annual.carryOverLapsed ? `${annual.carriedOver} used · the rest lapsed` : `${annual.carriedOver} days` },
    { item: 'Service start', value: formatDate(data.startDate, 'long') },
  ]
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Section
          className="lg:col-span-3"
          title={`Annual leave accrual — ${data.year}`}
          description={`${annual.accrued} days accrued to ${formatDate(data.asOf, 'short')} · ${annual.taken} taken · ${annual.remaining} remaining`}
          action={<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.annualSeries} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} days`} />} cursor={{ stroke: 'var(--border)' }} />
              {series.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${id}-${s.key})`} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-2 text-xs text-muted-foreground">Accrued after today is projected, assuming continued service.</div>
        </Section>
        <Section className="lg:col-span-2" title="Accrual policy" description="Employment Act 2007 defaults unless HR has changed them">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Setting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policy.map((p) => (
                <TableRow key={p.item}>
                  <TableCell className="px-3 text-muted-foreground">{p.item}</TableCell>
                  <TableCell className="px-3 font-medium">{p.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
      {admin && <PolicyEditor onSaved={onPolicySaved} />}
    </div>
  )
}
