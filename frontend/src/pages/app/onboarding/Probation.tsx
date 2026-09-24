import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isAdminLike } from '@/lib/rbac'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { DatePicker } from '@/components/shared/DatePicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, daysUntil, formatDate, TODAY } from '@/lib/utils'
import { isSelfRole, scopeEmployees } from './util'

/** A probation record as returned by GET /probation. */
export interface ProbationRecord {
  employeeId: string
  name: string
  title: string
  departmentId: string
  managerId?: string | null
  status: string
  startDate: string
  probationEnd: string
  confirmed: boolean
  confirmedOn?: string | null
  reviewDate?: string | null
  extendedDays: number
  history: { kind: 'confirmed' | 'extended' | 'review_scheduled'; date: string; days?: number | null; reason?: string | null; by?: string | null; at: string }[]
}

function addDays(d: string, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}

const between = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

export function Probation() {
  const { employees, user, role, employee, department } = useWorkspace()
  const self = isSelfRole(role)

  // Mock mode derives records from the demo seed; real mode reads the API.
  const seedRecords = useMemo<ProbationRecord[]>(
    () =>
      scopeEmployees(employees, user, role)
        .filter((e) => e.probationEnd && e.status !== 'Exited')
        .map((e) => ({
          employeeId: e.id,
          name: e.name,
          title: e.title,
          departmentId: e.departmentId,
          managerId: e.managerId,
          status: e.status,
          startDate: e.startDate,
          probationEnd: e.probationEnd!,
          confirmed: false,
          extendedDays: 0,
          history: [],
        })),
    [employees, user, role],
  )
  const [records, setRecords] = useState<ProbationRecord[] | null>(USE_MOCK_API ? seedRecords : null)
  const [error, setError] = useState<string | null>(null)
  const [extendFor, setExtendFor] = useState<ProbationRecord | null>(null)
  const [reviewFor, setReviewFor] = useState<ProbationRecord | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (USE_MOCK_API) return
    try {
      setRecords(await api.get<ProbationRecord[]>('/probation'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const replace = (r: ProbationRecord) => setRecords((list) => (list ?? []).map((x) => (x.employeeId === r.employeeId ? r : x)))
  // HR admins and the employee's own manager act; everyone else only views.
  const canAct = (r: ProbationRecord) => !self && r.employeeId !== user.id && (isAdminLike(role) || r.managerId === user.id)

  const run = async (r: ProbationRecord, action: 'confirm' | 'extend' | 'schedule-review', body: object, mock: () => ProbationRecord, ok: string) => {
    setBusy(`${r.employeeId}-${action}`)
    try {
      const next = USE_MOCK_API ? mock() : await api.post<ProbationRecord>(`/probation/${encodeURIComponent(r.employeeId)}/${action}`, body)
      replace(next)
      toast.success(ok)
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  const list = useMemo(() => [...(records ?? [])].sort((a, b) => Number(a.confirmed) - Number(b.confirmed) || daysUntil(a.probationEnd) - daysUntil(b.probationEnd)), [records])

  if (error) return <EmptyState title="Couldn’t load probation" description={error} />
  if (!records) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    )
  }
  if (list.length === 0) {
    return <EmptyState title={self ? 'You’re not on probation' : 'No one on probation'} description={self ? 'Your employment is confirmed.' : 'New joiners on probation will appear here.'} />
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r, i) => {
          const remaining = daysUntil(r.probationEnd)
          const total = Math.max(1, between(r.startDate, r.probationEnd))
          const elapsed = Math.max(0, Math.min(total, total - remaining))
          const mgr = employee(r.managerId ?? undefined)
          const urgent = remaining <= 14
          const milestones = [
            { label: '30-day check-in', at: 30 },
            { label: '60-day check-in', at: 60 },
            { label: 'Final appraisal', at: total },
          ]
          return (
            <motion.div
              key={r.employeeId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
              className={cn('flex flex-col rounded-xl border bg-card p-4', urgent && !r.confirmed && 'border-warning/40')}
            >
              <div className="flex items-start justify-between gap-3">
                <PersonCell name={r.name} sub={`${r.title} · ${department(r.departmentId)?.name ?? ''}`} />
                {r.confirmed ? (
                  <Badge variant="success" dot>
                    Confirmed
                  </Badge>
                ) : urgent ? (
                  <Badge variant="warning" dot>
                    {remaining < 0 ? 'Overdue' : 'Due soon'}
                  </Badge>
                ) : (
                  <Badge variant="info" dot>
                    Probation
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <ProgressRing
                  value={r.confirmed ? 100 : (elapsed / total) * 100}
                  size={76}
                  stroke={7}
                  tone={r.confirmed ? 'success' : urgent ? 'warning' : 'primary'}
                  label={
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-base font-bold">{elapsed}</span>
                      <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">/ {total} d</span>
                    </span>
                  }
                />
                <div className="min-w-0 text-sm">
                  <div className="text-2xl font-bold tracking-tight tabular">{r.confirmed ? '—' : Math.max(0, remaining)}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.confirmed ? `Confirmed ${r.confirmedOn ? formatDate(r.confirmedOn) : ''}` : remaining < 0 ? `Ended ${-remaining} days ago` : 'days remaining'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Ends {formatDate(r.probationEnd)}
                    {r.extendedDays > 0 && ` · extended ${r.extendedDays} d`}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {milestones.map((m) => {
                  const done = elapsed >= m.at || r.confirmed
                  const next = !done && milestones.find((x) => elapsed < x.at) === m
                  return (
                    <span
                      key={m.label}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        done && 'border-transparent bg-success-soft text-success',
                        next && 'border-primary/30 bg-accent text-accent-foreground',
                        !done && !next && 'text-muted-foreground',
                      )}
                    >
                      {done && <Check className="size-3" />}
                      {m.label}
                    </span>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="truncate">Manager: {mgr?.name ?? '—'}</span>
                {r.reviewDate && !r.confirmed && <span className="shrink-0 font-medium text-foreground">Review {formatDate(r.reviewDate, 'short')}</span>}
              </div>

              {canAct(r) && !r.confirmed && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="outline" className="px-2" onClick={() => setReviewFor(r)}>
                    <span className="truncate">{r.reviewDate ? 'Reschedule' : 'Review'}</span>
                  </Button>
                  <Button
                    size="sm"
                    className="px-2"
                    disabled={busy === `${r.employeeId}-confirm`}
                    onClick={() =>
                      void run(r, 'confirm', {}, () => ({ ...r, confirmed: true, confirmedOn: TODAY, status: 'Active' }), `${r.name} confirmed — employee and manager notified`)
                    }
                  >
                    <span className="truncate">Confirm</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="px-2" onClick={() => setExtendFor(r)}>
                    <span className="truncate">Extend</span>
                  </Button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      <ExtendDialog
        key={`x-${extendFor?.employeeId ?? ''}`}
        record={extendFor}
        onClose={() => setExtendFor(null)}
        busy={!!busy}
        onSubmit={async (r, days, reason) => {
          const next = addDays(r.probationEnd, days)
          const ok = await run(r, 'extend', { days, reason }, () => ({ ...r, probationEnd: next, extendedDays: r.extendedDays + days }), `Probation for ${r.name} extended by ${days} days`)
          if (ok) setExtendFor(null)
        }}
      />
      <ReviewDialog
        key={`r-${reviewFor?.employeeId ?? ''}`}
        record={reviewFor}
        onClose={() => setReviewFor(null)}
        busy={!!busy}
        onSubmit={async (r, date) => {
          const ok = await run(r, 'schedule-review', { date }, () => ({ ...r, reviewDate: date }), `Review for ${r.name.split(' ')[0]} scheduled for ${formatDate(date)} — manager and HR notified`)
          if (ok) setReviewFor(null)
        }}
      />
    </>
  )
}

function ExtendDialog({
  record,
  onClose,
  onSubmit,
  busy,
}: {
  record: ProbationRecord | null
  onClose: () => void
  onSubmit: (r: ProbationRecord, days: number, reason: string) => void
  busy: boolean
}) {
  const [reason, setReason] = useState('')
  const [extension, setExtension] = useState('30')
  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend probation</DialogTitle>
          <DialogDescription>
            {record?.name}’s probation currently ends {record && formatDate(record.probationEnd)}. The employee and manager will be notified in writing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Extension</Label>
            <SimpleSelect
              value={extension}
              onValueChange={setExtension}
              options={[
                { value: '30', label: '30 days' },
                { value: '60', label: '60 days' },
                { value: '90', label: '90 days' },
              ]}
            />
            {record && <p className="text-xs text-muted-foreground">New end date: {formatDate(addDays(record.probationEnd, Number(extension)))}. Probation can’t exceed 12 months in total.</p>}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="ext-reason">Reason</Label>
            <Textarea id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Needs more time to reach agreed sales targets; improvement plan attached." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!record || reason.trim().length < 5 || busy} onClick={() => record && onSubmit(record, Number(extension), reason.trim())}>
            Extend probation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewDialog({ record, onClose, onSubmit, busy }: { record: ProbationRecord | null; onClose: () => void; onSubmit: (r: ProbationRecord, date: string) => void; busy: boolean }) {
  const [date, setDate] = useState<Date | undefined>(() => {
    if (!record) return undefined
    const end = new Date(record.reviewDate ?? record.probationEnd)
    const today = new Date()
    return end < today ? today : end
  })
  const iso = date ? format(date, 'yyyy-MM-dd') : undefined
  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule probation review</DialogTitle>
          <DialogDescription>{record?.name}’s manager and HR get a notification to prepare the appraisal.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Review date</Label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!record || !iso || busy} onClick={() => record && iso && onSubmit(record, iso)}>
            Schedule review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
