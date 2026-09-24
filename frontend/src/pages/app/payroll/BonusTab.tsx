import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
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

export function BonusTab() {
  const { employees, department, departments } = useWorkspace()
  const [threshold, setThreshold] = useState(3.5)
  const [bands, setBands] = useState<BonusBand[]>(DEFAULT_BONUS_BANDS)
  const pool = useMemo(() => employees.filter(payrollEligible), [employees])
  const defaultTotal = useMemo(() => pool.reduce((s, e) => s + bonusFor(e), 0), [pool])
  const [budget, setBudget] = useState(() => Math.ceil((defaultTotal * 1.08) / 100_000) * 100_000)
  const [stage, setStage] = useState(0)

  const eligible = useMemo(
    () =>
      pool
        .map((e) => ({ e, bonus: bonusFor(e, threshold, bands) }))
        .filter((x) => x.e.performance >= threshold && x.bonus > 0)
        .sort((a, b) => b.e.performance - a.e.performance),
    [pool, threshold, bands],
  )
  const total = eligible.reduce((s, x) => s + x.bonus, 0)
  const usage = budget ? (total / budget) * 100 : 0

  const byDept = useMemo(
    () =>
      departments
        .map((d) => ({ name: d.name, bonus: eligible.filter((x) => x.e.departmentId === d.id).reduce((s, x) => s + x.bonus, 0) }))
        .filter((d) => d.bonus > 0)
        .sort((a, b) => b.bonus - a.bonus),
    [departments, eligible],
  )

  const submit = () => {
    if (total > budget) {
      toast.error('Over budget', { description: `Reduce the pool by ${formatKES(total - budget)} or raise the cap.` })
      return
    }
    setStage(1)
    toast.success('Q3 bonus pool submitted for approval', { description: `${eligible.length} employees · ${formatKES(total)} · routed to Finance.` })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title="Quarterly reviews trigger bonuses"
        description="When Q3 ratings are released, eligible employees receive a bonus as a % of one month's salary — paid in the next payroll."
        action={<Badge variant="soft">Q3 2026</Badge>}
      >
        <Stepper steps={['HR', 'Finance', 'CEO', 'Payroll']} current={stage} />
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Section title="Bonus rules" description="Changes preview instantly">
          <div className="grid grid-cols-1 gap-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <Label>Performance threshold</Label>
                <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-semibold text-accent-foreground tabular">≥ {threshold.toFixed(1)}</span>
              </div>
              <Slider value={[threshold]} min={3} max={4.5} step={0.1} onValueChange={(v) => setThreshold(v[0] ?? 3.5)} disabled={stage > 0} />
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
                        disabled={stage > 0}
                        onChange={(ev) => {
                          const pct = Math.max(0, Math.min(200, Number(ev.target.value) || 0))
                          setBands((bs) => bs.map((x, j) => (j === i ? { ...x, pct } : x)))
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
              <Input id="budget" type="number" value={budget} disabled={stage > 0} onChange={(e) => setBudget(Number(e.target.value) || 0)} className="tabular" />
            </div>
          </div>
        </Section>

        <Section
          title="Bonus calculator"
          description={`${eligible.length} of ${pool.length} employees eligible`}
          action={
            <Button size="sm" onClick={submit} disabled={stage > 0}>
              {stage > 0 ? 'Submitted' : 'Submit for approval'}
            </Button>
          }
        >
          <div className="rounded-xl border bg-subtle p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Total bonus pool</div>
                <div className="text-2xl font-bold tabular">{formatKES(total)}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                of {formatKES(budget, { compact: true })} cap
                <div className={cn('font-semibold tabular', usage > 100 ? 'text-danger' : 'text-foreground')}>{Math.round(usage)}%</div>
              </div>
            </div>
            <Progress value={usage} tone={usage > 100 ? 'warning' : usage > 90 ? 'warning' : 'primary'} className="mt-3" />
            {usage > 100 && <p className="mt-2 text-xs text-danger">Over budget by {formatKES(total - budget)}</p>}
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
                  {x.e.performance.toFixed(1)}
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
