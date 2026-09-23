import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Banknote, Check, CheckCircle2, Clock, Hourglass, Landmark, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { useWorkspace } from '@/context/auth'
import type { PayrollRun } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/shared/StatCard'
import { Section } from '@/components/shared/Section'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { cn, formatDate, formatKES, formatNumber } from '@/lib/utils'

const SYNC_STEPS = ['Authenticating with Odoo', 'Mapping salary rules to accounts', 'Posting journal entry SAL/2026/09', 'Reconciling totals']
const compact = (v: number) => formatKES(v, { compact: true })

export function OverviewTab({
  runs,
  setRuns,
  onReviewRun,
}: {
  runs: PayrollRun[]
  setRuns: React.Dispatch<React.SetStateAction<PayrollRun[]>>
  onReviewRun: () => void
}) {
  const { trends, role, offboardings, timesheets } = useWorkspace()
  const [syncing, setSyncing] = useState(false)
  const [syncStep, setSyncStep] = useState(0)
  const timer = useRef<number | null>(null)
  const current = runs[0]!
  const canApprove = role === 'ceo' || role === 'company_admin' || role === 'finance' || role === 'super_admin'

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current)
  }, [])

  const statutory = current.paye + current.shif + current.nssf + current.housingLevy
  const pendingTimesheets = timesheets.filter((t) => t.status === 'Pending').length
  const pendingApprovals = (current.status === 'Pending Approval' ? 1 : 0) + offboardings.length + pendingTimesheets

  const updateCurrent = (patch: Partial<PayrollRun>) => setRuns((rs) => [{ ...rs[0]!, ...patch }, ...rs.slice(1)])

  const approve = () => {
    if (!USE_MOCK_API) {
      // The server signs the next pending step for the caller's role (Finance → HR → CEO).
      api
        .post<PayrollRun>(`/payroll-runs/${current.id}/approve`)
        .then((saved) => {
          updateCurrent(saved)
          toast.success(saved.status === 'Approved' ? `${current.period} payroll approved` : 'Your sign-off is recorded', {
            description: saved.status === 'Approved' ? 'All sign-offs complete. Ready to sync to Odoo.' : 'Waiting for the next approver.',
          })
        })
        .catch((err) => toast.error('Approval not recorded', { description: errorMessage(err) }))
      return
    }
    updateCurrent({
      status: 'Approved',
      approvals: current.approvals.map((a) => (a.status === 'Pending' ? { ...a, status: 'Approved', at: '2026-09-23' } : a)),
    })
    toast.success(`${current.period} payroll approved`, { description: 'All three sign-offs complete. Ready to sync to Odoo.' })
  }

  const sync = () => {
    setSyncing(true)
    setSyncStep(0)
    let step = 0
    timer.current = window.setInterval(() => {
      step++
      setSyncStep(step)
      if (step >= SYNC_STEPS.length) {
        if (timer.current) window.clearInterval(timer.current)
        timer.current = null
        setSyncing(false)
        updateCurrent({ status: 'Synced to Odoo' })
        if (!USE_MOCK_API) api.post(`/payroll-runs/${current.id}/sync-odoo`).catch((err) => toast.error('Odoo sync failed', { description: errorMessage(err) }))
        toast.success('Synced to Odoo', { description: `Journal entry SAL/2026/09 posted · ${formatKES(current.gross)} gross.` })
      }
    }, 750)
  }

  const deductions = [
    { label: 'PAYE', hint: 'KRA income tax', value: current.paye },
    { label: 'SHIF', hint: '2.75% of gross', value: current.shif },
    { label: 'Housing Levy', hint: '1.5% of gross', value: current.housingLevy },
    { label: 'NSSF', hint: 'Tier I + II', value: current.nssf },
  ]
  const maxDeduction = Math.max(...deductions.map((d) => d.value))

  const columns: Column<PayrollRun>[] = [
    { key: 'period', header: 'Period', cell: (r) => <span className="font-medium">{r.period}</span>, sortValue: (r) => r.id },
    { key: 'employees', header: 'Employees', cell: (r) => <span className="tabular">{r.employees}</span>, sortValue: (r) => r.employees },
    { key: 'gross', header: 'Gross', cell: (r) => <span className="tabular">{formatKES(r.gross)}</span>, sortValue: (r) => r.gross },
    { key: 'net', header: 'Net pay', cell: (r) => <span className="tabular font-medium">{formatKES(r.net)}</span>, sortValue: (r) => r.net },
    { key: 'bonuses', header: 'Bonuses', cell: (r) => <span className="tabular text-muted-foreground">{r.bonuses ? formatKES(r.bonuses) : '—'}</span>, hideOnMobile: true },
    { key: 'prepared', header: 'Prepared by', cell: (r) => <span className="text-muted-foreground">{r.preparedBy}</span>, hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ]

  const approvedCount = current.approvals.filter((a) => a.status === 'Approved').length

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Gross payroll · Sept" value={current.gross} format={compact} icon={Wallet} delta={1.2} deltaLabel="vs Aug" />
        <StatCard index={1} label="Net pay" value={current.net} format={compact} icon={Banknote} hint={`${formatNumber(current.employees)} employees`} />
        <StatCard index={2} label="Statutory deductions" value={statutory} format={compact} icon={Landmark} hint="PAYE · SHIF · NSSF · AHL" />
        <StatCard index={3} label="Pending approvals" value={pendingApprovals} icon={Hourglass} tone={pendingApprovals ? 'warning' : 'success'} hint="Payroll, dues, timesheets" />
      </div>

      {/* Hero: pending payroll */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">Pending payroll</span>
                <StatusBadge status={current.status} />
              </div>
              <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{current.period}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prepared by {current.preparedBy} · {current.employees} employees · includes {formatKES(current.bonuses)} Q3 bonuses
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Gross</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular">{compact(current.gross)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Statutory</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular">{compact(statutory)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Net to bank</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular text-primary">{compact(current.net)}</dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {current.status === 'Pending Approval' && canApprove && (
                  <Button onClick={approve}>
                    <CheckCircle2 /> Approve payroll
                  </Button>
                )}
                {current.status === 'Pending Approval' && !canApprove && (
                  <Badge variant="muted" className="h-9 px-3 text-xs">
                    <Clock /> Awaiting CEO sign-off
                  </Badge>
                )}
                {current.status === 'Approved' && (
                  <Button onClick={sync} disabled={syncing}>
                    <RefreshCw className={cn(syncing && 'animate-spin')} /> {syncing ? 'Syncing…' : 'Sync to Odoo'}
                  </Button>
                )}
                {current.status === 'Synced to Odoo' && (
                  <Badge variant="info" className="h-9 px-3 text-xs">
                    <Check /> Synced to Odoo · SAL/2026/09
                  </Badge>
                )}
                <Button variant="outline" onClick={onReviewRun}>
                  Review line items
                </Button>
              </div>
            </div>

            <div className="min-w-0 rounded-xl border bg-subtle p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Approval chain</div>
                <span className="text-xs text-muted-foreground tabular">
                  {approvedCount}/{current.approvals.length} signed
                </span>
              </div>
              <ol className="mt-4 grid grid-cols-1 gap-0">
                {current.approvals.map((a, i) => {
                  const done = a.status === 'Approved'
                  const isCurrent = !done && current.approvals.slice(0, i).every((x) => x.status === 'Approved')
                  return (
                    <li key={a.role} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < current.approvals.length - 1 && (
                        <span className={cn('absolute left-[15px] top-8 bottom-0 w-0.5 rounded-full', done ? 'bg-primary' : 'bg-border')} />
                      )}
                      <motion.span
                        layout
                        className={cn(
                          'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                          done && 'border-primary bg-primary text-white',
                          isCurrent && 'border-primary bg-accent text-primary',
                          !done && !isCurrent && 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {done ? (
                            <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                              <Check className="size-4" strokeWidth={3} />
                            </motion.span>
                          ) : (
                            <motion.span key="p" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                              {i + 1}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-2">
                          <span className="text-sm font-medium">{a.role}</span>
                          <span className="text-xs text-muted-foreground">{done && a.at ? formatDate(a.at) : isCurrent ? 'Awaiting' : '—'}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{a.name}</div>
                      </div>
                    </li>
                  )
                })}
              </ol>

              <AnimatePresence>
                {(syncing || current.status === 'Synced to Odoo') && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-4 border-t pt-4">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium">Odoo sync</span>
                        <span className="tabular text-muted-foreground">{Math.round((Math.min(syncStep, SYNC_STEPS.length) / SYNC_STEPS.length) * 100)}%</span>
                      </div>
                      <Progress value={(Math.min(syncStep, SYNC_STEPS.length) / SYNC_STEPS.length) * 100} />
                      <ul className="mt-3 grid grid-cols-1 gap-1.5">
                        {SYNC_STEPS.map((s, i) => (
                          <li key={s} className={cn('flex items-center gap-2 text-xs', i < syncStep ? 'text-foreground' : 'text-muted-foreground')}>
                            {i < syncStep ? (
                              <Check className="size-3.5 text-success" />
                            ) : i === syncStep ? (
                              <RefreshCw className="size-3.5 animate-spin text-primary" />
                            ) : (
                              <span className="size-3.5 rounded-full border" />
                            )}
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Section title="Payroll cost trend" description="Gross vs net pay, last 12 months">
          <Legend className="mb-3" items={[{ label: 'Gross', color: SERIES[0] }, { label: 'Net', color: SERIES[1] }]} />
          <PayrollTrend data={trends.payroll} />
        </Section>
        <Section title="Deductions breakdown" description={`${current.period} statutory remittances`}>
          <div className="grid grid-cols-1 gap-4">
            {deductions.map((d, i) => (
              <div key={d.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {d.label} <span className="text-xs font-normal text-muted-foreground">· {d.hint}</span>
                  </span>
                  <span className="tabular font-semibold">{compact(d.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: SERIES[0] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.value / maxDeduction) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.08 }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-4" /> Due to KRA by 9 Oct
              </span>
              <span className="font-semibold tabular">{formatKES(statutory)}</span>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Recent payroll runs" contentClassName="p-0 sm:p-5 sm:pt-0">
        <DataTable rows={runs} columns={columns} rowKey={(r) => r.id} />
      </Section>
    </div>
  )
}

function PayrollTrend({ data }: { data: { month: string; gross: number; net: number }[] }) {
  const id = useId().replace(/:/g, '')
  const rows = useMemo(() => data, [data])
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`pg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.2} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`pn-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[1]} stopOpacity={0.16} />
            <stop offset="100%" stopColor={SERIES[1]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" {...axisProps} />
        <YAxis {...axisProps} width={52} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(0)}M`} />
        <Tooltip content={<ChartTooltip valueFormatter={(v) => formatKES(v)} />} cursor={{ stroke: 'var(--border)' }} />
        <Area type="monotone" dataKey="gross" name="Gross" stroke={SERIES[0]} strokeWidth={2} fill={`url(#pg-${id})`} dot={false} />
        <Area type="monotone" dataKey="net" name="Net" stroke={SERIES[1]} strokeWidth={2} fill={`url(#pn-${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
