import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee, Timesheet } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SimpleSelect } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatCard } from '@/components/shared/StatCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatDate, formatKES } from '@/lib/utils'
import { WHT_RATE } from './calc'
import { canSign, nextStep, useRemote, type ChainStep, type ConsultantPayout, type ConsultantRow, type ConsultantsResponse } from './api'

const PERIODS = [
  { value: '2026-09', label: 'September 2026' },
  { value: '2026-08', label: 'August 2026' },
  { value: '2026-10', label: 'October 2026' },
]

const STATUS_LABEL: Record<ConsultantRow['status'], string> = {
  'Awaiting approval': 'Pending',
  Ready: 'Ready',
  Draft: 'In Progress',
  Approved: 'Approved',
  Paid: 'Paid',
}

function mockData(period: string, employees: Employee[], timesheets: Timesheet[]): ConsultantsResponse {
  const consultants: ConsultantRow[] = employees
    .filter((e) => e.employmentType === 'Consultant' && e.status !== 'Exited')
    .map((e) => {
      const mine = timesheets.filter((t) => t.employeeId === e.id && t.week.slice(0, 7) === period)
      const hoursOf = (t: Timesheet) => t.entries.reduce((a, en) => a + en.hours.reduce((x, y) => x + y, 0), 0)
      const approved = mine.filter((t) => t.status === 'Approved')
      const hours = approved.reduce((h, t) => h + hoursOf(t), 0)
      const gross = Math.round(approved.reduce((g, t) => g + hoursOf(t) * t.rate, 0))
      const wht = Math.round(gross * WHT_RATE)
      return {
        employeeId: e.id,
        name: e.name,
        title: e.title,
        phone: e.phone,
        hours,
        pendingHours: mine.filter((t) => t.status === 'Pending').reduce((h, t) => h + hoursOf(t), 0),
        weeks: approved.length,
        rate: hours ? Math.round(gross / hours) : mine[0]?.rate ?? 0,
        gross,
        wht,
        net: gross - wht,
        status: hours > 0 ? 'Ready' : 'Awaiting approval',
        payoutId: null,
        paymentRef: null,
      }
    })
  return { period, whtRate: WHT_RATE, consultants, payouts: [] }
}

export function ConsultantsTab() {
  const { employees, timesheets, role, user } = useWorkspace()
  const [period, setPeriod] = useState('2026-09')
  const remote = useRemote<ConsultantsResponse>(`/payroll/consultants?period=${period}`)
  const [mock, setMock] = useState<Record<string, ConsultantsResponse>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const canManage = role === 'finance' || role === 'company_admin' || role === 'hr_officer' || role === 'super_admin'

  const data: ConsultantsResponse | null = USE_MOCK_API ? mock[period] ?? mockData(period, employees, timesheets) : remote.data
  const rows = useMemo(() => data?.consultants ?? [], [data])
  const payouts = data?.payouts ?? []
  const ready = rows.filter((r) => r.status === 'Ready')

  const setMockData = (fn: (d: ConsultantsResponse) => ConsultantsResponse) => setMock((m) => ({ ...m, [period]: fn(m[period] ?? mockData(period, employees, timesheets)) }))

  const run = async (key: string, real: () => Promise<unknown>, local: () => void, success: string, description?: string) => {
    setBusy(key)
    try {
      if (USE_MOCK_API) local()
      else {
        await real()
        await remote.reload()
      }
      toast.success(success, description ? { description } : undefined)
    } catch (err) {
      toast.error('Not saved', { description: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const createBatch = () =>
    run(
      'create',
      () => api.post('/payroll/consultants/payouts', { period }),
      () =>
        setMockData((d) => {
          const id = `payout-${Date.now()}`
          const lines = d.consultants.filter((c) => c.status === 'Ready')
          const payout: ConsultantPayout = {
            id,
            period,
            status: 'Draft',
            consultants: lines.length,
            hours: lines.reduce((s, c) => s + c.hours, 0),
            gross: lines.reduce((s, c) => s + c.gross, 0),
            wht: lines.reduce((s, c) => s + c.wht, 0),
            net: lines.reduce((s, c) => s + c.net, 0),
            approvals: [
              { step: 0, role: 'Finance', name: 'Finance', status: 'Pending', at: null },
              { step: 1, role: 'HR', name: 'HR', status: 'Pending', at: null },
            ],
            paymentRef: null,
            paidAt: null,
            createdAt: new Date().toISOString(),
          }
          return { ...d, payouts: [payout, ...d.payouts], consultants: d.consultants.map((c) => (c.status === 'Ready' ? { ...c, status: 'Draft', payoutId: id } : c)) }
        }),
      'Payout batch created',
      `${ready.length} consultants · routed to Finance for approval.`,
    )

  const patchMockPayout = (id: string, patch: Partial<ConsultantPayout>, status?: ConsultantRow['status']) =>
    setMockData((d) => ({
      ...d,
      payouts: d.payouts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      consultants: status ? d.consultants.map((c) => (c.payoutId === id ? { ...c, status, paymentRef: patch.paymentRef ?? c.paymentRef } : c)) : d.consultants,
    }))

  const approve = (p: ConsultantPayout) => {
    const step = nextStep(p.approvals)!
    const approvals: ChainStep[] = p.approvals.map((a) => (a.step === step.step ? { ...a, status: 'Approved', name: user.name, at: '2026-09-23' } : a))
    const done = approvals.every((a) => a.status === 'Approved')
    return run(
      `approve-${p.id}`,
      () => api.post(`/payroll/consultants/payouts/${p.id}/approve`),
      () => patchMockPayout(p.id, { approvals, status: done ? 'Approved' : 'Draft' }, done ? 'Approved' : undefined),
      done ? 'Payout approved' : `${step.role} sign-off recorded`,
      done ? 'Ready to pay.' : 'Waiting for HR approval.',
    )
  }

  const pay = (p: ConsultantPayout) => {
    const ref = `B2C-PLACEHOLDER-${Date.now().toString(16).slice(-8).toUpperCase()}`
    return run(
      `pay-${p.id}`,
      () => api.post(`/payroll/consultants/payouts/${p.id}/pay`),
      () => patchMockPayout(p.id, { status: 'Paid', paymentRef: ref, paidAt: new Date().toISOString() }, 'Paid'),
      'Payout marked as paid',
      'M-Pesa B2C is not connected yet — no money was sent. A placeholder reference was recorded.',
    )
  }

  const cancel = (p: ConsultantPayout) =>
    run(
      `cancel-${p.id}`,
      () => api.delete(`/payroll/consultants/payouts/${p.id}`),
      () =>
        setMockData((d) => ({
          ...d,
          payouts: d.payouts.filter((x) => x.id !== p.id),
          consultants: d.consultants.map((c) => (c.payoutId === p.id ? { ...c, status: 'Ready', payoutId: null } : c)),
        })),
      'Payout batch cancelled',
    )

  const totals = rows.reduce((t, r) => ({ gross: t.gross + r.gross, wht: t.wht + r.wht, hours: t.hours + r.hours }), { gross: 0, wht: 0, hours: 0 })

  const columns: Column<ConsultantRow>[] = [
    { key: 'name', header: 'Consultant', cell: (r) => <PersonCell name={r.name} sub={r.title} />, sortValue: (r) => r.name, className: 'min-w-48' },
    {
      key: 'hours',
      header: 'Approved hours',
      cell: (r) => (
        <div className="leading-tight tabular">
          {r.hours} h<div className="text-[11px] text-muted-foreground">{r.weeks} weeks{r.pendingHours ? ` · ${r.pendingHours} h pending` : ''}</div>
        </div>
      ),
      sortValue: (r) => r.hours,
    },
    { key: 'rate', header: 'Rate / hr', cell: (r) => <span className="tabular">{formatKES(r.rate)}</span>, sortValue: (r) => r.rate },
    { key: 'gross', header: 'Gross', cell: (r) => <span className="tabular">{formatKES(r.gross)}</span>, sortValue: (r) => r.gross },
    { key: 'wht', header: 'WHT 5%', cell: (r) => <span className="tabular text-muted-foreground">−{formatKES(r.wht)}</span> },
    { key: 'net', header: 'Net', cell: (r) => <span className="font-semibold tabular">{formatKES(r.net)}</span>, sortValue: (r) => r.net },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="leading-tight">
          <StatusBadge status={STATUS_LABEL[r.status]} />
          {r.status === 'Draft' && <div className="mt-0.5 text-[11px] text-muted-foreground">In payout batch</div>}
          {r.status === 'Awaiting approval' && <div className="mt-0.5 text-[11px] text-muted-foreground">No approved timesheets</div>}
        </div>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Active consultants" value={rows.length} />
        <StatCard index={1} label="Approved hours" value={totals.hours} hint={PERIODS.find((p) => p.value === period)?.label} />
        <StatCard index={2} label="Gross payable" value={totals.gross} format={(v) => formatKES(v, { compact: true })} />
        <StatCard index={3} label="Withholding tax" value={totals.wht} format={(v) => formatKES(v, { compact: true })} hint="Remit to KRA by 20th" />
      </div>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="font-medium">Paid from approved timesheets</div>
          <div className="text-muted-foreground">Consultants are not on PAYE. 5% withholding tax on professional fees is deducted and remitted to KRA. Payouts need Finance and HR sign-off.</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SimpleSelect value={period} onValueChange={setPeriod} options={PERIODS} className="h-9 w-40" />
          {canManage && (
            <Button onClick={createBatch} disabled={!ready.length || busy === 'create'}>
              {busy === 'create' ? 'Creating…' : `Create payout batch${ready.length ? ` (${ready.length})` : ''}`}
            </Button>
          )}
        </div>
      </Card>

      {payouts.map((p) => {
        const step = nextStep(p.approvals)
        return (
          <Card key={p.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Payout batch · {PERIODS.find((x) => x.value === p.period)?.label ?? p.period}</span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {p.consultants} consultants · {p.hours} h · net <span className="tabular">{formatKES(p.net)}</span> · WHT <span className="tabular">{formatKES(p.wht)}</span>
                </div>
                {p.paymentRef && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Reference {p.paymentRef}
                    {p.paidAt ? ` · ${formatDate(p.paidAt.slice(0, 10))}` : ''} · placeholder, no funds moved
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {p.status === 'Draft' && step && canSign(step, role) && (
                  <Button size="sm" onClick={() => approve(p)} disabled={busy === `approve-${p.id}`}>
                    Approve as {step.role}
                  </Button>
                )}
                {p.status === 'Draft' && canManage && p.approvals.every((a) => a.status === 'Pending') && (
                  <Button size="sm" variant="outline" onClick={() => cancel(p)} disabled={busy === `cancel-${p.id}`}>
                    Cancel batch
                  </Button>
                )}
                {p.status === 'Approved' && canManage && (
                  <Button size="sm" onClick={() => pay(p)} disabled={busy === `pay-${p.id}`}>
                    {busy === `pay-${p.id}` ? 'Recording…' : 'Pay via M-Pesa B2C (placeholder)'}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              {p.approvals.map((a) => (
                <span
                  key={a.step}
                  className={cn(
                    'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium',
                    a.status === 'Approved' ? 'border-primary bg-primary text-white' : a.step === step?.step ? 'border-primary bg-accent text-primary' : 'text-muted-foreground',
                  )}
                >
                  {a.status === 'Approved' && <Check className="size-3" strokeWidth={3} />}
                  {a.role}
                  {a.status === 'Approved' ? ` · ${a.name.split(' ')[0]}` : ''}
                </span>
              ))}
            </div>
          </Card>
        )
      })}

      {remote.error && !USE_MOCK_API ? (
        <Card className="p-4 text-sm text-danger">{remote.error}</Card>
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.employeeId} />
      )}
      {!USE_MOCK_API && remote.loading && !data && <p className="text-sm text-muted-foreground">Loading consultants…</p>}
      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1.5">
          Sandbox
        </Badge>
        M-Pesa B2C is a placeholder: paying records a reference and marks the batch paid, but no money is sent.
      </p>
    </div>
  )
}
