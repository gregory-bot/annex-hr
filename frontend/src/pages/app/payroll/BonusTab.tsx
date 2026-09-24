import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { PersonAvatar } from '@/components/ui/avatar'
import { Section } from '@/components/shared/Section'
import { Stepper } from '@/components/shared/Stepper'
import { ChartTooltip, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { cn, formatKES } from '@/lib/utils'
import { DEFAULT_BONUS_BANDS, bonusFor, payrollEligible, type BonusBand } from './calc'
import { canSign, nextStep, useRemote, type BonusCycle, type BonusRules, type ChainStep } from './api'

const QUARTER = '2026-Q3'
const QUARTER_LABEL = 'Q3 2026'

export function BonusTab() {
  const { employees, department, departments, role, user, employee } = useWorkspace()
  const canEdit = role === 'finance' || role === 'company_admin' || role === 'hr_officer' || role === 'super_admin'
  const rulesRemote = useRemote<BonusRules>('/bonus/rules')
  const cyclesRemote = useRemote<BonusCycle[]>('/bonus/cycles')
  const [threshold, setThreshold] = useState(3.5)
  const [bands, setBands] = useState<BonusBand[]>(DEFAULT_BONUS_BANDS)
  const pool = useMemo(() => employees.filter(payrollEligible), [employees])
  const defaultTotal = useMemo(() => pool.reduce((s, e) => s + bonusFor(e), 0), [pool])
  const [budget, setBudget] = useState(() => Math.ceil((defaultTotal * 1.08) / 100_000) * 100_000)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mockCycle, setMockCycle] = useState<BonusCycle | null>(null)

  // Seed the editor from the saved rules once they arrive.
  const loadedRules = rulesRemote.data
  useEffect(() => {
    if (!loadedRules) return
    setThreshold(loadedRules.threshold)
    setBands(loadedRules.bands)
    setBudget(loadedRules.budgetCap)
    setDirty(false)
  }, [loadedRules])

  const cycle = USE_MOCK_API ? mockCycle : cyclesRemote.data?.find((c) => c.quarter === QUARTER) ?? null
  const locked = !!cycle && cycle.status !== 'Draft'

  const preview = useMemo(
    () =>
      pool
        .map((e) => ({ e, rating: e.performance, bonus: bonusFor(e, threshold, bands) }))
        .filter((x) => x.rating >= threshold && x.bonus > 0)
        .sort((a, b) => b.rating - a.rating),
    [pool, threshold, bands],
  )
  // Once submitted, the persisted lines are the source of truth.
  const eligible = useMemo(
    () =>
      locked && cycle
        ? cycle.lines.flatMap((l) => {
            const e = employee(l.employeeId)
            return e ? [{ e, rating: l.rating, bonus: l.bonus }] : []
          })
        : preview,
    [locked, cycle, preview, employee],
  )
  const total = eligible.reduce((s, x) => s + x.bonus, 0)
  const cap = locked && cycle ? cycle.budgetCap : budget
  const usage = cap ? (total / cap) * 100 : 0

  const byDept = useMemo(
    () =>
      departments
        .map((d) => ({ name: d.name, bonus: eligible.filter((x) => x.e.departmentId === d.id).reduce((s, x) => s + x.bonus, 0) }))
        .filter((d) => d.bonus > 0)
        .sort((a, b) => b.bonus - a.bonus),
    [departments, eligible],
  )

  const approvedSteps = cycle?.approvals.filter((a) => a.status === 'Approved').length ?? 0
  const stage = !cycle || cycle.status === 'Draft' ? 0 : cycle.status === 'Paid' ? 4 : cycle.queuedForPayroll ? 3 + (cycle.payrollRunId ? 1 : 0) : approvedSteps
  const step = cycle ? nextStep(cycle.approvals) : undefined

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setDirty(true)
  }

  const saveRules = async () => {
    if (USE_MOCK_API) return
    const saved = await api.put<BonusRules>('/bonus/rules', { threshold, bands, budgetCap: budget })
    rulesRemote.setData(saved)
    setDirty(false)
  }

  const act = async (fn: () => Promise<void>, fail = 'Not saved') => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(fail, { description: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const submit = () =>
    act(async () => {
      if (total > budget) {
        toast.error('Over budget', { description: `Reduce the pool by ${formatKES(total - budget)} or raise the cap.` })
        return
      }
      if (USE_MOCK_API) {
        setMockCycle({
          id: 'mock-cycle', quarter: QUARTER, status: 'Pending Approval', threshold, bands, budgetCap: budget, headcount: pool.length, eligible: preview.length, total,
          approvals: ['HR', 'Finance', 'CEO'].map((r, i) => ({ step: i, role: r, name: r, status: 'Pending', at: null })),
          queuedForPayroll: false, payrollRunId: null, payrollPeriod: null, createdAt: new Date().toISOString(),
          lines: preview.map((x) => ({ employeeId: x.e.id, rating: x.rating, bandPct: 0, monthlySalary: x.e.salaryKES, bonus: x.bonus })),
        })
      } else {
        if (dirty) await saveRules()
        const saved = await api.post<BonusCycle>('/bonus/cycles', { quarter: QUARTER, submit: true })
        cyclesRemote.setData((cs) => [saved, ...(cs ?? []).filter((c) => c.id !== saved.id)])
      }
      toast.success(`${QUARTER_LABEL} bonus pool submitted for approval`, { description: `${preview.length} employees · ${formatKES(total)} · routed to HR.` })
    }, 'Not submitted')

  const replaceCycle = (saved: BonusCycle) => (USE_MOCK_API ? setMockCycle(saved) : cyclesRemote.setData((cs) => (cs ?? []).map((c) => (c.id === saved.id ? saved : c))))

  const approve = () =>
    act(async () => {
      if (!cycle || !step) return
      let saved: BonusCycle
      if (USE_MOCK_API) {
        const approvals: ChainStep[] = cycle.approvals.map((a) => (a.step === step.step ? { ...a, status: 'Approved', name: user.name, at: '2026-09-23' } : a))
        saved = { ...cycle, approvals, status: approvals.every((a) => a.status === 'Approved') ? 'Approved' : 'Pending Approval' }
      } else saved = await api.post<BonusCycle>(`/bonus/cycles/${cycle.id}/approve`)
      replaceCycle(saved)
      toast.success(saved.status === 'Approved' ? 'Bonus pool approved' : `${step.role} sign-off recorded`, {
        description: saved.status === 'Approved' ? 'Add it to the next payroll run to pay it out.' : `Routed to ${nextStep(saved.approvals)?.role}.`,
      })
    }, 'Approval not recorded')

  const queue = () =>
    act(async () => {
      if (!cycle) return
      const saved = USE_MOCK_API ? { ...cycle, queuedForPayroll: true } : await api.post<BonusCycle>(`/bonus/cycles/${cycle.id}/add-to-payroll`)
      replaceCycle(saved)
      toast.success('Added to the next payroll run', { description: 'Each bonus is added to the employee’s payslip when the next payroll is generated.' })
    })

  const saveOnly = () =>
    act(async () => {
      await saveRules()
      toast.success('Bonus rules saved')
    })

  const statusLine = !cycle
    ? 'Not submitted'
    : cycle.status === 'Paid'
      ? `Paid in ${cycle.payrollPeriod ?? 'payroll'}`
      : cycle.payrollRunId
        ? `On the ${cycle.payrollPeriod} payroll run`
        : cycle.queuedForPayroll
          ? 'Queued for the next payroll run'
          : cycle.status === 'Approved'
            ? 'Approved — ready for payroll'
            : cycle.status === 'Pending Approval'
              ? `Waiting for ${step?.role} · ${step?.name}`
              : 'Draft'

  const action = (() => {
    if (!canEdit && !(cycle?.status === 'Pending Approval' && canSign(step, role))) return null
    if (!cycle || cycle.status === 'Draft')
      return (
        <Button size="sm" onClick={submit} disabled={busy || !canEdit}>
          Submit for approval
        </Button>
      )
    if (cycle.status === 'Pending Approval' && canSign(step, role))
      return (
        <Button size="sm" onClick={approve} disabled={busy}>
          Approve as {step!.role}
        </Button>
      )
    if (cycle.status === 'Approved' && !cycle.queuedForPayroll && canEdit)
      return (
        <Button size="sm" onClick={queue} disabled={busy}>
          Add to next payroll run
        </Button>
      )
    return null
  })()

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title="Quarterly reviews trigger bonuses"
        description="When Q3 ratings are released, eligible employees receive a bonus as a % of one month's salary — paid in the next payroll."
        action={<Badge variant="soft">{QUARTER_LABEL}</Badge>}
      >
        <Stepper steps={['HR', 'Finance', 'CEO', 'Payroll']} current={stage} />
        <p className="mt-3 text-xs text-muted-foreground">{statusLine}</p>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Section
          title="Bonus rules"
          description={locked ? 'Locked while this quarter’s pool is in approval' : 'Changes preview instantly'}
          action={
            canEdit && !USE_MOCK_API && !locked ? (
              <Button size="sm" variant="outline" onClick={saveOnly} disabled={busy || !dirty}>
                {dirty ? 'Save rules' : 'Saved'}
              </Button>
            ) : undefined
          }
        >
          <div className="grid grid-cols-1 gap-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <Label>Performance threshold</Label>
                <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-semibold text-accent-foreground tabular">≥ {threshold.toFixed(1)}</span>
              </div>
              <Slider value={[threshold]} min={3} max={4.5} step={0.1} onValueChange={edit((v: number[]) => setThreshold(v[0] ?? 3.5))} disabled={locked || !canEdit} />
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>3.0</span>
                <span>4.5</span>
              </div>
            </div>
            <div>
              <Label>Bonus by rating band</Label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {bands.map((b, i) => (
                  <div key={b.min} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <span className="flex-1 text-sm">
                      Rating {b.min.toFixed(1)}–{Math.min(5, b.max).toFixed(1)}
                    </span>
                    <div className="relative w-24">
                      <Input
                        type="number"
                        min={0}
                        max={200}
                        value={b.pct}
                        disabled={locked || !canEdit}
                        onChange={(ev) => {
                          const pct = Math.max(0, Math.min(200, Number(ev.target.value) || 0))
                          setBands((bs) => bs.map((x, j) => (j === i ? { ...x, pct } : x)))
                          setDirty(true)
                        }}
                        className="h-8 pr-7 text-right tabular"
                        aria-label={`Bonus percent for rating ${b.min}`}
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">% of monthly salary. Ratings below 3.5 but above the threshold use the first band.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="budget">Budget cap (KES)</Label>
              <Input id="budget" type="number" value={budget} disabled={locked || !canEdit} onChange={(e) => edit(setBudget)(Number(e.target.value) || 0)} className="tabular" />
            </div>
          </div>
        </Section>

        <Section
          title="Bonus calculator"
          description={`${eligible.length} of ${locked && cycle ? cycle.headcount : pool.length} employees eligible${locked ? ' · as submitted' : ''}`}
          action={action ?? undefined}
        >
          <div className="rounded-xl border bg-subtle p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Total bonus pool</div>
                <div className="text-2xl font-bold tabular">{formatKES(total)}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                of {formatKES(cap, { compact: true })} cap
                <div className={cn('font-semibold tabular', usage > 100 ? 'text-danger' : 'text-foreground')}>{Math.round(usage)}%</div>
              </div>
            </div>
            <Progress value={usage} tone={usage > 100 ? 'warning' : usage > 90 ? 'warning' : 'primary'} className="mt-3" />
            {usage > 100 && <p className="mt-2 text-xs text-danger">Over budget by {formatKES(total - cap)}</p>}
          </div>
          <ul className="mt-3 max-h-[340px] divide-y overflow-y-auto scrollbar-thin">
            {eligible.map((x, i) => (
              <motion.li key={x.e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="flex items-center gap-3 py-2.5">
                <PersonAvatar name={x.e.name} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{x.e.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{department(x.e.departmentId)?.name}</div>
                </div>
                <Badge variant="outline" className="tabular">
                  {x.rating.toFixed(1)}
                </Badge>
                <div className="w-24 text-right text-sm font-semibold tabular">{formatKES(x.bonus, { compact: true })}</div>
              </motion.li>
            ))}
            {!eligible.length && <li className="py-8 text-center text-sm text-muted-foreground">No employees meet this threshold.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Bonus by department" description="Projected Q3 payout">
        {byDept.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byDept} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="name" {...axisProps} interval={0} tickFormatter={(v: string) => (v.length > 12 ? v.split(' ')[0]! : v)} />
              <YAxis {...axisProps} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => formatKES(v)} />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
              <Bar dataKey="bonus" name="Bonus" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No eligible employees
          </div>
        )}
      </Section>
    </div>
  )
}
