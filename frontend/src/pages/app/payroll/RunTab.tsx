import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { PayrollRun } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { cn, formatKES } from '@/lib/utils'
import { bonusFor, computePayslip, payrollEligible } from './calc'
import { useRemote, type PayLine, type RunLines } from './api'

const GEN_STEPS = [
  'Collecting attendance & leave',
  'Calculating PAYE (KRA 2026 bands)',
  'SHIF 2.75%',
  'NSSF Tier I/II',
  'Housing Levy 1.5%',
  'Applying bonuses',
  'Ready for review',
]

const PERIODS = ['October 2026', 'November 2026', 'December 2026']

type Row = PayLine

export function RunTab({ runs, setRuns }: { runs: PayrollRun[]; setRuns: React.Dispatch<React.SetStateAction<PayrollRun[]>> }) {
  const { employees, department } = useWorkspace()
  const [runId, setRunId] = useState<string | undefined>(runs[0]?.id)
  const run = runs.find((r) => r.id === runId) ?? runs[0]
  const [mockPeriod, setMockPeriod] = useState(runs[0]?.period ?? 'October 2026')
  const [withBonuses, setWithBonuses] = useState(true)
  const [open, setOpen] = useState(false)
  const [genPeriod, setGenPeriod] = useState(PERIODS.find((p) => !runs.some((r) => r.period === p)) ?? PERIODS[0]!)
  const [step, setStep] = useState(-1)
  const [generated, setGenerated] = useState<PayrollRun | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current)
  }, [])

  const remote = useRemote<RunLines>(run && !USE_MOCK_API ? `/payroll-runs/${run.id}/lines` : null)

  const mockRows: Row[] = useMemo(
    () =>
      employees.filter(payrollEligible).map((e) => ({
        ...computePayslip(e, withBonuses ? bonusFor(e) : 0),
        name: e.name,
        title: e.title,
        employeeNo: e.employeeNo,
        kraPin: e.kraPin,
        departmentId: e.departmentId,
      })),
    [employees, withBonuses],
  )
  const rows: Row[] = USE_MOCK_API ? mockRows : remote.data?.lines ?? []
  const period = USE_MOCK_API ? mockPeriod : run?.period ?? '—'
  const status = USE_MOCK_API ? (runs.find((r) => r.period === mockPeriod)?.status ?? 'Draft') : run?.status ?? 'Draft'

  const filtered = rows.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()))
  const totals = rows.reduce(
    (t, r) => ({ gross: t.gross + r.gross, paye: t.paye + r.paye, statutory: t.statutory + r.shif + r.nssf + r.housingLevy, bonus: t.bonus + r.bonus, net: t.net + r.net }),
    { gross: 0, paye: 0, statutory: 0, bonus: 0, net: 0 },
  )

  const startGeneration = () => {
    setStep(0)
    setGenerated(null)
    setGenError(null)
    if (!USE_MOCK_API) {
      // The server freezes every payslip line (and any approved bonus cycle queued for payroll).
      api
        .post<PayrollRun>('/payroll-runs', { period: genPeriod })
        .then(setGenerated)
        .catch((err) => {
          setGenError(errorMessage(err))
          if (timer.current) window.clearInterval(timer.current)
          timer.current = null
          setStep(-1)
          toast.error('Payroll not generated', { description: errorMessage(err) })
        })
    }
    let s = 0
    timer.current = window.setInterval(() => {
      s++
      setStep(s)
      if (s >= GEN_STEPS.length - 1) {
        if (timer.current) window.clearInterval(timer.current)
        timer.current = null
      }
    }, 650)
  }

  const finishGeneration = () => {
    if (!USE_MOCK_API && generated) {
      setRuns((rs) => [generated, ...rs.filter((r) => r.id !== generated.id && r.period !== generated.period)])
      setRunId(generated.id)
      toast.success(`${generated.period} submitted for approval`, { description: `${generated.employees} payslips calculated · waiting for Finance sign-off.` })
    } else {
      setMockPeriod(genPeriod)
      setWithBonuses(genPeriod.startsWith('September') || genPeriod.startsWith('December'))
      toast.success(`${genPeriod} draft ready`, { description: `${rows.length} payslips calculated. Review and submit for approval.` })
    }
    setOpen(false)
    setStep(-1)
  }

  const k = (v: number) => <span className="tabular">{formatKES(v).replace('KES ', '')}</span>

  const columns: Column<Row>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => <PersonCell name={r.name} sub={department(r.departmentId)?.name} />,
      sortValue: (r) => r.name,
      className: 'min-w-52',
    },
    { key: 'basic', header: 'Basic', cell: (r) => k(r.basic), sortValue: (r) => r.basic, hideOnMobile: true },
    {
      key: 'allow',
      header: 'Allowances',
      cell: (r) => (
        <div className="leading-tight">
          {k(r.allowances)}
          <div className="text-[11px] text-muted-foreground">H {formatKES(r.house, { compact: true }).replace('KES ', '')} · T {formatKES(r.transport, { compact: true }).replace('KES ', '')} · A {formatKES(r.airtime, { compact: true }).replace('KES ', '')}</div>
        </div>
      ),
      hideOnMobile: true,
    },
    { key: 'gross', header: 'Gross', cell: (r) => <span className="font-medium">{k(r.gross)}</span>, sortValue: (r) => r.gross },
    { key: 'paye', header: 'PAYE', cell: (r) => k(r.paye), sortValue: (r) => r.paye },
    { key: 'shif', header: 'SHIF', cell: (r) => k(r.shif), hideOnMobile: true },
    { key: 'nssf', header: 'NSSF', cell: (r) => k(r.nssf), hideOnMobile: true },
    { key: 'ahl', header: 'Housing Levy', cell: (r) => k(r.housingLevy), hideOnMobile: true },
    { key: 'bonus', header: 'Bonus', cell: (r) => (r.bonus ? <span className="text-primary">{k(r.bonus)}</span> : <span className="text-muted-foreground">—</span>), sortValue: (r) => r.bonus },
    { key: 'net', header: 'Net pay', cell: (r) => <span className="font-semibold">{k(r.net)}</span>, sortValue: (r) => r.net },
  ]

  const done = step >= GEN_STEPS.length - 1 && (USE_MOCK_API || !!generated)

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{period}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {remote.loading ? 'Loading payslips…' : `${rows.length} employees`} · consultants are paid separately from timesheets · all amounts in KES
            </p>
            {remote.data?.estimated && (
              <p className="mt-1 text-xs text-muted-foreground">Imported run — lines are recalculated from current salaries. Runs generated in Annex HR keep their original figures.</p>
            )}
            {remote.error && <p className="mt-1 text-xs text-danger">{remote.error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!USE_MOCK_API && runs.length > 1 && (
              <SimpleSelect value={run?.id} onValueChange={setRunId} options={runs.map((r) => ({ value: r.id, label: r.period }))} className="h-9 w-44" />
            )}
            <ExportMenu
              filename={`payroll-${period.toLowerCase().replace(' ', '-')}`}
              rows={rows.map((r) => ({ Employee: r.name, 'KRA PIN': r.kraPin, Basic: r.basic, Allowances: r.allowances, Gross: r.gross, PAYE: r.paye, SHIF: r.shif, NSSF: r.nssf, 'Housing Levy': r.housingLevy, Bonus: r.bonus, Net: r.net }))}
            />
            <Button onClick={() => setOpen(true)}>
              Generate payroll
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { l: 'Gross', v: totals.gross },
            { l: 'PAYE', v: totals.paye },
            { l: 'SHIF · NSSF · AHL', v: totals.statutory },
            { l: 'Bonuses', v: totals.bonus },
            { l: 'Net pay', v: totals.net, strong: true },
          ].map((t) => (
            <div key={t.l} className={cn('rounded-lg border bg-subtle px-3 py-2.5', t.strong && 'col-span-2 sm:col-span-1')}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.l}</div>
              <div className={cn('mt-0.5 text-[15px] font-semibold tabular', t.strong && 'text-primary')}>{formatKES(t.v, { compact: true })}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search employees…" className="sm:max-w-xs" />
        <p className="text-xs text-muted-foreground">Click a row to preview the payslip.</p>
      </div>

      <DataTable rows={filtered} columns={columns} rowKey={(r) => r.employeeId} onRowClick={setSelected} pageSize={12} />

      <PayslipSheet row={selected} period={period} onClose={() => setSelected(null)} deptName={selected ? department(selected.departmentId)?.name : undefined} />

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && step >= 0 && !done) return
          setOpen(o)
          if (!o) setStep(-1)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate payroll</DialogTitle>
            <DialogDescription>Annex HR pulls attendance, approved leave and bonuses, then applies 2026 Kenyan statutory rules.</DialogDescription>
          </DialogHeader>
          {step < 0 ? (
            <div className="grid grid-cols-1 gap-2">
              <Label>Pay period</Label>
              <SimpleSelect value={genPeriod} onValueChange={setGenPeriod} options={PERIODS} />
              <p className="text-xs text-muted-foreground">Pay date 28th · cut-off 20th · approved bonus cycles queued for payroll are included</p>
              {runs.some((r) => r.period === genPeriod) && (
                <p className="text-xs text-warning">A {genPeriod} run already exists. It is recalculated if nobody has signed it yet.</p>
              )}
              {genError && <p className="text-xs text-danger">{genError}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <Progress value={(Math.min(step, GEN_STEPS.length - 1) / (GEN_STEPS.length - 1)) * 100} />
              <ul className="grid grid-cols-1 gap-2.5">
                {GEN_STEPS.map((s, i) => {
                  const state = i < step || (done && i === step) ? 'done' : i === step ? 'current' : 'upcoming'
                  return (
                    <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 text-sm">
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full border',
                          state === 'done' && 'border-primary bg-primary text-white',
                          state === 'current' && 'border-primary text-primary',
                          state === 'upcoming' && 'text-muted-foreground',
                        )}
                      >
                        {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'current' ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
                      </span>
                      <span className={cn(state === 'upcoming' && 'text-muted-foreground', state === 'current' && 'font-medium')}>{s}</span>
                    </motion.li>
                  )
                })}
              </ul>
              <AnimatePresence>
                {done && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border bg-subtle p-4 text-center">
                    <SuccessCheck size={52} />
                    <div className="mt-2 font-semibold">{genPeriod} draft ready</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {generated
                        ? `${generated.employees} payslips · gross ${formatKES(generated.gross, { compact: true })} · net ${formatKES(generated.net, { compact: true })}`
                        : `${rows.length} payslips · gross ${formatKES(totals.gross, { compact: true })} · net ${formatKES(totals.net, { compact: true })}`}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <DialogFooter>
            {step < 0 && (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={startGeneration}>
                  Run calculation
                </Button>
              </>
            )}
            {done && (
              <Button onClick={finishGeneration}>
                Review draft
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Line({ label, value, muted, strong, negative }: { label: string; value: number; muted?: boolean; strong?: boolean; negative?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', muted && 'text-muted-foreground', strong && 'font-semibold')}>
      <span>{label}</span>
      <span className="tabular">
        {negative && value > 0 ? '−' : ''}
        {formatKES(value)}
      </span>
    </div>
  )
}

function PayslipSheet({ row, period, onClose, deptName }: { row: Row | null; period: string; onClose: () => void; deptName?: string }) {
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {row && (
          <div className="flex min-h-full flex-col">
            <div className="border-b p-5 pr-12">
              <Badge variant="soft" className="mb-2">
                Payslip · {period}
              </Badge>
              <SheetTitle>{row.name}</SheetTitle>
              <SheetDescription>
                {row.title} · {deptName}
              </SheetDescription>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Employee no.</dt>
                  <dd className="mt-0.5 font-medium">{row.employeeNo}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">KRA PIN</dt>
                  <dd className="mt-0.5 font-medium">{row.kraPin}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pay date</dt>
                  <dd className="mt-0.5 font-medium">28 {period}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd className="mt-0.5 font-medium">Bank transfer · EFT</dd>
                </div>
              </dl>
            </div>
            <div className="flex-1 space-y-5 p-5">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earnings</div>
                <Line label="Basic salary" value={row.basic} />
                <Line label="House allowance" value={row.house} />
                <Line label="Transport allowance" value={row.transport} />
                <Line label="Airtime allowance" value={row.airtime} />
                {row.bonus > 0 && <Line label="Performance bonus" value={row.bonus} />}
                <Separator className="my-1.5" />
                <Line label="Gross pay" value={row.gross} strong />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deductions</div>
                <Line label="NSSF Tier I" value={row.nssfTier1} negative />
                <Line label="NSSF Tier II" value={row.nssfTier2} negative />
                <Line label="SHIF (2.75%)" value={row.shif} negative />
                <Line label="Housing Levy (1.5%)" value={row.housingLevy} negative />
                <Line label="Taxable pay" value={row.taxable} muted />
                <Line label="PAYE (after KES 2,400 relief)" value={row.paye} negative />
                <Separator className="my-1.5" />
                <Line label="Total deductions" value={row.totalDeductions} strong negative />
              </div>
              <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-xl bg-gradient-to-br from-primary to-[#8f0d17] p-4 text-white">
                <div className="text-xs text-white/80">Net pay</div>
                <div className="mt-0.5 text-2xl font-bold tabular">{formatKES(row.net)}</div>
                <div className="mt-1 text-xs text-white/75">Effective deduction rate {Math.round((row.totalDeductions / row.gross) * 100)}%</div>
              </motion.div>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t bg-card p-4">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Close
              </Button>
              <Button
                className="flex-1"
                onClick={() => toast.success('Payslip downloaded', { description: `payslip-${row.employeeNo}-${period.toLowerCase().replace(' ', '-')}.pdf` })}
              >
                Download payslip
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
