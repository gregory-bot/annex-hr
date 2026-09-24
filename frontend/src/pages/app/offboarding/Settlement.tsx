import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { Role } from '@/data/types'
import { errorMessage } from '@/lib/api'
import { cn, formatDate, formatKES } from '@/lib/utils'
import type { ExitDetail, SettlementInputs, SettlementLine } from './helpers'
import type { OffboardingApi } from './useOffboardings'

const FIELDS: { key: keyof SettlementInputs; label: string; hint: string; max: number; step: number }[] = [
  { key: 'unpaidDays', label: 'Unpaid salary days', hint: 'Days worked this month (of 30)', max: 31, step: 0.5 },
  { key: 'leaveDays', label: 'Leave days to encash', hint: 'Accrued, untaken annual leave', max: 120, step: 0.5 },
  { key: 'noticePayKES', label: 'Notice pay (KES)', hint: 'Pay in lieu of notice', max: 100_000_000, step: 1 },
  { key: 'loanKES', label: 'Loan / advance (KES)', hint: 'Outstanding staff loan balance', max: 100_000_000, step: 1 },
  { key: 'otherDeductionsKES', label: 'Other deductions (KES)', hint: 'As agreed in writing', max: 100_000_000, step: 1 },
]

export function Settlement({ record, role, api }: { record: ExitDetail; role: Role; api: OffboardingApi }) {
  const s = record.settlement!
  const [form, setForm] = useState<Record<keyof SettlementInputs, string>>(() => toForm(s.inputs))
  const [busy, setBusy] = useState<string | null>(null)
  const canEdit = !s.locked && ['super_admin', 'company_admin', 'hr_officer', 'finance'].includes(role)
  const canCertify = ['super_admin', 'company_admin', 'hr_officer', 'ceo'].includes(role)

  useEffect(() => setForm(toForm(s.inputs)), [s.inputs])

  const earnings = s.lines.filter((l) => l.kind === 'earning')
  const deductionLines = s.lines.filter((l) => l.kind === 'deduction')
  const dirty = FIELDS.some((f) => Number(form[f.key]) !== s.inputs[f.key])

  const run = async (key: string, fn: () => Promise<unknown>, ok: string, description?: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(ok, { description })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const save = () => {
    const inputs = Object.fromEntries(FIELDS.map((f) => [f.key, Math.min(f.max, Math.max(0, Number(form[f.key]) || 0))])) as unknown as SettlementInputs
    void run('save', () => api.saveSettlement(record.id, inputs), 'Final dues saved', 'Finance can now approve them.')
  }

  const row = (l: SettlementLine) => (
    <tr key={l.key} className="border-b last:border-0">
      <td className="py-2.5 pr-3">
        <div className="text-sm">{l.label}</div>
        <div className="text-xs text-muted-foreground">{l.detail}</div>
      </td>
      <td className={cn('py-2.5 text-right text-sm tabular', l.kind === 'deduction' && l.amount > 0 && 'text-muted-foreground')}>
        {l.kind === 'deduction' && l.amount > 0 ? '− ' : ''}
        {formatKES(l.amount)}
      </td>
    </tr>
  )

  return (
    <div className="grid grid-cols-1 gap-5">
      {canEdit && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Inputs</div>
            <span className="text-xs text-muted-foreground">
              {s.saved ? `Saved${s.updatedAt ? ` ${formatDate(s.updatedAt.slice(0, 10))}` : ''}` : 'Suggested from salary, leave and assets — not saved yet'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-1 gap-1.5">
                <Label htmlFor={`st-${f.key}`}>{f.label}</Label>
                <Input
                  id={`st-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={f.max}
                  step={f.step}
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                />
                <span className="text-[11px] text-muted-foreground">{f.hint}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={busy === 'save' || (s.saved && !dirty)}>
              {busy === 'save' ? 'Saving…' : s.saved ? 'Recalculate & save' : 'Save final dues'}
            </Button>
          </div>
        </div>
      )}

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
              <td className="py-2.5 text-right text-sm font-medium tabular">{formatKES(s.gross)}</td>
            </tr>
            <tr className="bg-muted/50">
              <td colSpan={2} className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Less
              </td>
            </tr>
            {deductionLines.map(row)}
            <tr className="border-t bg-subtle">
              <td className="py-2.5 text-sm font-medium">Total deductions</td>
              <td className="py-2.5 text-right text-sm font-medium tabular">− {formatKES(s.deductions)}</td>
            </tr>
            <tr className="border-t bg-accent">
              <td className="py-3.5 text-sm font-semibold text-accent-foreground">{s.net < 0 ? 'Owed by employee' : 'Net final dues'}</td>
              <td className="py-3.5 text-right text-lg font-bold tabular text-accent-foreground">{formatKES(Math.abs(s.net))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {s.locked && <p className="-mt-3 text-xs text-muted-foreground">Figures are locked — Finance approved them. Later asset changes no longer affect these dues.</p>}

      <div className="grid grid-cols-1 gap-2">
        <div className="text-sm font-semibold">Approval flow</div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {s.approvals.map((a, i) => (
            <li key={a.stage} className={cn('flex flex-col gap-2 rounded-xl border p-3', a.status === 'Pending' && 'border-primary/40 bg-accent/40')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('flex size-6 items-center justify-center rounded-full text-[11px] font-semibold', a.status === 'Approved' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
                    {a.status === 'Approved' ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  {a.stage}
                </span>
                <StatusBadge status={a.status} />
              </div>
              {a.at && (
                <div className="text-xs text-muted-foreground">
                  {a.by ? `${a.by} · ` : ''}
                  {formatDate(a.at.slice(0, 10))}
                </div>
              )}
              {a.status === 'Pending' &&
                (a.canAct ? (
                  <Button
                    size="sm"
                    disabled={!!busy || (canEdit && dirty)}
                    onClick={() =>
                      void run(
                        `approve-${a.stage}`,
                        () => api.approveSettlement(record.id, a.stage),
                        `${a.stage} approved final dues`,
                        i === s.approvals.length - 1 ? `${formatKES(Math.max(0, s.net))} released to payroll.` : undefined,
                      )
                    }
                  >
                    {busy === `approve-${a.stage}` ? 'Approving…' : 'Approve'}
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground">Awaiting {a.stage}</div>
                ))}
            </li>
          ))}
        </ol>
        {canEdit && dirty && <p className="text-xs text-muted-foreground">Save your changes before approving.</p>}
      </div>

      {canCertify && (
        <div className="flex flex-col gap-3 rounded-xl border bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Certificate of service</div>
            <div className="text-xs text-muted-foreground">Required under Section 51 of the Employment Act, 2007. Downloads a printable page.</div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              api.certificate(record.id)
              toast.success('Certificate of service downloaded', { description: `${record.employeeName} · until ${formatDate(record.lastDay)}` })
            }}
          >
            Generate certificate of service
          </Button>
        </div>
      )}
    </div>
  )
}

function toForm(i: SettlementInputs): Record<keyof SettlementInputs, string> {
  return {
    unpaidDays: String(i.unpaidDays),
    leaveDays: String(i.leaveDays),
    noticePayKES: String(i.noticePayKES),
    loanKES: String(i.loanKES),
    otherDeductionsKES: String(i.otherDeductionsKES),
  }
}
