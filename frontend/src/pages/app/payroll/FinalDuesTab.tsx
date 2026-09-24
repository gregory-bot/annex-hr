import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatDate, formatKES } from '@/lib/utils'

const ASSET_VALUES: Record<string, number> = { Laptop: 85_000, 'Access card': 1_500, 'SIM card': 500 }
const CHAIN = ['HR', 'Finance', 'CEO'] as const

export function FinalDuesTab() {
  const { offboardings, employee } = useWorkspace()

  const items = useMemo(
    () =>
      offboardings.map((o, i) => {
        const e = employee(o.employeeId)!
        const daily = e.salaryKES / 30
        const unpaidDays = Number(o.lastDay.slice(8, 10))
        const leaveDays = 3 + ((i * 5 + unpaidDays) % 10)
        const noticeDays = o.reason === 'Contract End' || o.reason === 'Retirement' ? 0 : i % 2 ? 15 : 0
        const lost = o.assets.filter((a) => !a.returned && ASSET_VALUES[a.name])
        const deductions = lost.reduce((s, a) => s + ASSET_VALUES[a.name]!, 0)
        const unpaid = Math.round(daily * unpaidDays)
        const leave = Math.round((e.salaryKES / 22) * leaveDays)
        const notice = Math.round(daily * noticeDays)
        return { o, e, unpaidDays, unpaid, leaveDays, leave, noticeDays, notice, lost, deductions, total: unpaid + leave + notice - deductions }
      }),
    [offboardings, employee],
  )

  const [stage, setStage] = useState<Record<string, number>>(() => Object.fromEntries(offboardings.map((o, i) => [o.id, i === 0 ? 1 : 0])))

  if (!items.length) return <EmptyState title="No final dues" description="Final dues appear here when an offboarding is started." />

  const approve = (id: string, name: string) => {
    const next = (stage[id] ?? 0) + 1
    setStage((s) => ({ ...s, [id]: next }))
    toast.success(next >= CHAIN.length ? `Final dues approved for ${name}` : `${CHAIN[next - 1]} approved`, {
      description: next >= CHAIN.length ? 'Queued for the next bank run and posted to Odoo.' : `Routed to ${CHAIN[next]} for sign-off.`,
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map((it, idx) => {
        const s = stage[it.o.id] ?? 0
        const complete = s >= CHAIN.length
        return (
          <motion.div key={it.o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} whileHover={{ y: -2 }}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <PersonCell name={it.e.name} sub={`${it.o.reason} · last day ${formatDate(it.o.lastDay)}`} />
                <StatusBadge status={complete ? 'Approved' : 'Pending'} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-1.5 text-sm">
                <Row label={`Unpaid salary · ${it.unpaidDays} days`} value={it.unpaid} />
                <Row label={`Leave encashment · ${it.leaveDays} days`} value={it.leave} />
                <Row label={it.noticeDays ? `Notice pay in lieu · ${it.noticeDays} days` : 'Notice pay · served in full'} value={it.notice} />
                <Row
                  label={it.lost.length ? `Assets not returned: ${it.lost.map((a) => a.name).join(', ')}` : 'All company assets returned'}
                  value={-it.deductions}
                />
                <Separator className="my-1.5" />
                <div className="flex items-center justify-between font-semibold">
                  <span>Total final dues</span>
                  <span className="tabular text-primary">{formatKES(it.total)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Gross, before PAYE and statutory deductions on the final payslip.</p>
              </div>
              <div className="mt-auto pt-4">
                <div className="flex items-center gap-1.5">
                  {CHAIN.map((c, i) => (
                    <div key={c} className="flex flex-1 items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors',
                          i < s && 'border-primary bg-primary text-white',
                          i === s && 'border-primary bg-accent text-primary',
                          i > s && 'text-muted-foreground',
                        )}
                      >
                        {i < s && <Check className="size-3" strokeWidth={3} />}
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  {complete ? (
                    <Badge variant="success" className="h-8 px-3">
                      Ready for bank run
                    </Badge>
                  ) : (
                    <Button size="sm" onClick={() => approve(it.o.id, it.e.name)}>
                      Approve as {CHAIN[s]}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 tabular', value < 0 && 'text-danger')}>
        {value < 0 ? '−' : ''}
        {formatKES(Math.abs(value))}
      </span>
    </div>
  )
}
