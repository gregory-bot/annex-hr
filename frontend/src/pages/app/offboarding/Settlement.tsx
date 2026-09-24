import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { Employee, Role } from '@/data/types'
import { TODAY, cn, formatDate, formatKES } from '@/lib/utils'
import { settlement, type Approval, type ExitRecord } from './helpers'

export function Settlement({
  record,
  emp,
  role,
  onApprove,
}: {
  record: ExitRecord
  emp?: Employee
  role: Role
  onApprove: (approvals: Approval[]) => void
}) {
  const { lines, gross, deductions, net } = settlement(record, emp)
  const earnings = lines.filter((l) => l.kind === 'earning')
  const deductionLines = lines.filter((l) => l.kind === 'deduction')
  const approvals = record.settlementApprovals

  const approve = (idx: number) => {
    const next = approvals.map((a, i): Approval => {
      if (i === idx) return { ...a, status: 'Approved', at: TODAY }
      if (i === idx + 1 && a.status === 'Waiting') return { ...a, status: 'Pending' }
      return a
    })
    onApprove(next)
    toast.success(`${approvals[idx]!.stage} approved final dues`, { description: idx === approvals.length - 1 ? `${formatKES(net)} released to payroll.` : undefined })
  }

  const row = (l: (typeof lines)[number], i: number) => (
    <motion.tr key={l.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="border-b last:border-0">
      <td className="py-2.5 pr-3">
        <div className="text-sm">{l.label}</div>
        <div className="text-xs text-muted-foreground">{l.detail}</div>
      </td>
      <td className={cn('py-2.5 text-right text-sm tabular', l.kind === 'deduction' && l.amount > 0 && 'text-muted-foreground')}>
        {l.kind === 'deduction' && l.amount > 0 ? '− ' : ''}
        {formatKES(l.amount)}
      </td>
    </motion.tr>
  )

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full">
          <tbody className="[&_td]:px-4">
            <tr className="bg-muted/50">
              <td colSpan={2} className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Earnings
              </td>
            </tr>
            {earnings.map(row)}
            <tr className="border-y bg-subtle">
              <td className="py-2.5 text-sm font-medium">Gross final pay</td>
              <td className="py-2.5 text-right text-sm font-medium tabular">{formatKES(gross)}</td>
            </tr>
            <tr className="bg-muted/50">
              <td colSpan={2} className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Less
              </td>
            </tr>
            {deductionLines.map((l, i) => row(l, i + earnings.length))}
            <tr className="border-t bg-subtle">
              <td className="py-2.5 text-sm font-medium">Total deductions</td>
              <td className="py-2.5 text-right text-sm font-medium tabular">− {formatKES(deductions)}</td>
            </tr>
            <tr className="border-t bg-accent">
              <td className="py-3.5 text-sm font-semibold text-accent-foreground">Net final dues</td>
              <td className="py-3.5 text-right text-lg font-bold tabular text-accent-foreground">{formatKES(net)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="text-sm font-semibold">Approval flow</div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {approvals.map((a, i) => {
            const canAct = a.status === 'Pending' && a.roles.includes(role)
            return (
              <motion.li
                layout
                key={a.stage}
                className={cn('flex flex-col gap-2 rounded-xl border p-3', a.status === 'Pending' && 'border-primary/40 bg-accent/40')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold',
                        a.status === 'Approved' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {a.status === 'Approved' ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {a.stage}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                {a.at && <div className="text-xs text-muted-foreground">Signed {formatDate(a.at)}</div>}
                {a.status === 'Pending' &&
                  (canAct ? (
                    <Button size="sm" onClick={() => approve(i)}>
                      Approve
                    </Button>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Awaiting {a.stage}
                    </div>
                  ))}
              </motion.li>
            )
          })}
        </ol>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Certificate of service</div>
          <div className="text-xs text-muted-foreground">Required under Section 51 of the Employment Act, 2007.</div>
        </div>
        <Button
          variant="outline"
          onClick={() => toast.success('Certificate of service generated', { description: `${emp?.name ?? 'Employee'} · ${formatDate(emp?.startDate ?? record.submitted)} – ${formatDate(record.lastDay)}` })}
        >
          Generate certificate of service
        </Button>
      </div>
    </div>
  )
}
