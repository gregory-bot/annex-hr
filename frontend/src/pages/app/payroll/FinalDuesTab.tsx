import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, formatDate, formatKES } from '@/lib/utils'
import { canSign, nextStep, useRemote, type ChainStep, type FinalDues } from './api'

const CHAIN = ['Finance', 'HR', 'CEO'] as const

export function FinalDuesTab() {
  const { offboardings, employee, role, user } = useWorkspace()
  const remote = useRemote<FinalDues[]>('/payroll/final-dues')
  const [busy, setBusy] = useState<string | null>(null)

  // Mock mode: final dues straight from the offboarding record.
  const mockItems = useMemo<FinalDues[]>(
    () =>
      offboardings.map((o) => {
        const e = employee(o.employeeId)
        return {
          offboardingId: o.id,
          employeeId: o.employeeId,
          name: e?.name ?? 'Former employee',
          title: e?.title ?? '',
          employeeNo: e?.employeeNo ?? '',
          reason: o.reason,
          lastDay: o.lastDay,
          noticeDays: o.noticeDays,
          source: 'offboarding',
          lines: [{ label: 'Final dues per offboarding record', amount: o.finalDuesKES }],
          total: o.finalDuesKES,
          assetsOutstanding: o.assets.filter((a) => !a.returned).map((a) => a.name),
          approvals: CHAIN.map((c, i) => ({ step: i, role: c, name: c, status: 'Pending', at: null })),
          status: 'Pending',
        }
      }),
    [offboardings, employee],
  )
  const [mock, setMock] = useState<FinalDues[] | null>(null)
  const items = USE_MOCK_API ? mock ?? mockItems : remote.data ?? []

  if (!USE_MOCK_API && remote.loading && !remote.data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading final dues…</p>
  if (!USE_MOCK_API && remote.error) return <EmptyState title="Final dues unavailable" description={remote.error} />
  if (!items.length) return <EmptyState title="No final dues" description="Final dues appear here when an offboarding is started." />

  const approve = async (it: FinalDues) => {
    const step = nextStep(it.approvals)!
    setBusy(it.offboardingId)
    try {
      let saved: FinalDues
      if (USE_MOCK_API) {
        const approvals: ChainStep[] = it.approvals.map((a) => (a.step === step.step ? { ...a, status: 'Approved', name: user.name, at: '2026-09-23' } : a))
        saved = { ...it, approvals, status: approvals.every((a) => a.status === 'Approved') ? 'Approved' : 'Pending' }
        setMock((m) => (m ?? mockItems).map((x) => (x.offboardingId === it.offboardingId ? saved : x)))
      } else {
        saved = await api.post<FinalDues>(`/payroll/final-dues/${it.offboardingId}/approve`)
        remote.setData((d) => (d ?? []).map((x) => (x.offboardingId === it.offboardingId ? saved : x)))
      }
      const next = nextStep(saved.approvals)
      toast.success(saved.status === 'Approved' ? `Final dues approved for ${it.name}` : `${step.role} approved`, {
        description: saved.status === 'Approved' ? 'Queued for the next bank run.' : `Routed to ${next?.role} for sign-off.`,
      })
    } catch (err) {
      toast.error('Approval not recorded', { description: errorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map((it, idx) => {
        const step = nextStep(it.approvals)
        const complete = it.status === 'Approved'
        return (
          <motion.div key={it.offboardingId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <PersonCell name={it.name} sub={`${it.reason} · last day ${formatDate(it.lastDay)}`} />
                <StatusBadge status={complete ? 'Approved' : 'Pending'} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-1.5 text-sm">
                {it.lines.map((l) => (
                  <Row key={l.label} label={l.label} value={l.amount} />
                ))}
                {it.assetsOutstanding.length > 0 && <p className="text-[11px] text-muted-foreground">Assets not yet returned: {it.assetsOutstanding.join(', ')}</p>}
                <Separator className="my-1.5" />
                <div className="flex items-center justify-between font-semibold">
                  <span>{it.source === 'settlement' ? 'Net final dues' : 'Total final dues'}</span>
                  <span className={cn('tabular', it.total < 0 ? 'text-danger' : 'text-primary')}>
                    {it.total < 0 ? '−' : ''}
                    {formatKES(Math.abs(it.total))}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {it.source === 'settlement' ? 'From the offboarding settlement, after PAYE and statutory deductions.' : 'Gross, before PAYE and statutory deductions on the final payslip. Settlement not yet prepared.'}
                </p>
              </div>
              <div className="mt-auto pt-4">
                <div className="flex items-center gap-1.5">
                  {it.approvals.map((a) => (
                    <span
                      key={a.step}
                      title={a.status === 'Approved' ? `${a.name}${a.at ? ` · ${formatDate(a.at)}` : ''}` : a.name}
                      className={cn(
                        'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors',
                        a.status === 'Approved' && 'border-primary bg-primary text-white',
                        a.status !== 'Approved' && a.step === step?.step && 'border-primary bg-accent text-primary',
                        a.status !== 'Approved' && a.step !== step?.step && 'text-muted-foreground',
                      )}
                    >
                      {a.status === 'Approved' && <Check className="size-3" strokeWidth={3} />}
                      {a.role}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  {complete ? (
                    <Badge variant="success" className="h-8 px-3">
                      Ready for bank run
                    </Badge>
                  ) : canSign(step, role) ? (
                    <Button size="sm" onClick={() => approve(it)} disabled={busy === it.offboardingId}>
                      {busy === it.offboardingId ? 'Saving…' : `Approve as ${step!.role}`}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Waiting for {step?.role} · {step?.name}</span>
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
