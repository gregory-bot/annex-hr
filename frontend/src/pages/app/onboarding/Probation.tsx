import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, CalendarPlus, Check, Clock, Hourglass, Mail, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { isSelfRole, scopeEmployees } from './util'

const LENGTH = 90

function addDays(d: string, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}

export function Probation() {
  const { employees, user, role, employee, department } = useWorkspace()
  const [ends, setEnds] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [scheduled, setScheduled] = useState<Set<string>>(new Set())
  const [extendFor, setExtendFor] = useState<Employee | null>(null)
  const [reason, setReason] = useState('')
  const [extension, setExtension] = useState('30')
  const self = isSelfRole(role)

  const list = useMemo(
    () =>
      scopeEmployees(employees, user, role)
        .filter((e) => e.probationEnd)
        .map((e) => ({ e, end: ends[e.id] ?? e.probationEnd! }))
        .sort((a, b) => daysUntil(a.end) - daysUntil(b.end)),
    [employees, user, role, ends],
  )

  if (list.length === 0) {
    return <EmptyState icon={Hourglass} title={self ? 'You’re not on probation' : 'No one on probation'} description={self ? 'Your employment is confirmed.' : 'New joiners on probation will appear here.'} />
  }

  const submitExtend = () => {
    if (!extendFor) return
    const current = ends[extendFor.id] ?? extendFor.probationEnd!
    const next = addDays(current, Number(extension))
    setEnds((p) => ({ ...p, [extendFor.id]: next }))
    toast.success(`Probation for ${extendFor.name} extended to ${formatDate(next)}`)
    setExtendFor(null)
    setReason('')
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map(({ e, end }, i) => {
          const remaining = daysUntil(end)
          const total = LENGTH + (ends[e.id] ? daysUntil(ends[e.id]!) - daysUntil(e.probationEnd!) : 0)
          const elapsed = Math.max(0, Math.min(total, total - remaining))
          const mgr = employee(e.managerId)
          const isConfirmed = confirmed.has(e.id)
          const milestones = [
            { label: '30-day reminder', at: 30 },
            { label: '60-day reminder', at: 60 },
            { label: '90-day appraisal', at: LENGTH },
          ]
          const urgent = remaining <= 14
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
              whileHover={{ y: -2 }}
              className={cn('flex flex-col rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', urgent && !isConfirmed && 'border-warning/40')}
            >
              <div className="flex items-start justify-between gap-3">
                <PersonCell name={e.name} sub={`${e.title} · ${department(e.departmentId)?.name ?? ''}`} />
                {isConfirmed ? (
                  <Badge variant="success" dot>
                    Confirmed
                  </Badge>
                ) : urgent ? (
                  <Badge variant="warning" dot>
                    Due soon
                  </Badge>
                ) : (
                  <Badge variant="info" dot>
                    Probation
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4">
                <ProgressRing
                  value={(elapsed / total) * 100}
                  size={76}
                  stroke={7}
                  tone={isConfirmed ? 'success' : urgent ? 'warning' : 'primary'}
                  label={
                    <span className="flex flex-col items-center leading-none">
                      <span className="text-base font-bold">{elapsed}</span>
                      <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">/ {total} d</span>
                    </span>
                  }
                />
                <div className="min-w-0 text-sm">
                  <div className="text-2xl font-bold tracking-tight tabular">{isConfirmed ? '—' : Math.max(0, remaining)}</div>
                  <div className="text-xs text-muted-foreground">{isConfirmed ? 'Employment confirmed' : remaining < 0 ? `Ended ${-remaining} days ago` : 'days remaining'}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> Ends {formatDate(end)}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {milestones.map((m) => {
                  const done = elapsed >= m.at || isConfirmed
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
                      {done ? <Check className="size-3" /> : <Clock className="size-3" />}
                      {m.label}
                    </span>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="truncate">Manager: {mgr?.name ?? '—'}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Tip label={elapsed >= 30 ? 'Manager notified by email' : 'Manager notified at day 30'}>
                    <span className={cn('inline-flex items-center gap-1', elapsed >= 30 && 'text-success')}>
                      <Mail className="size-3.5" /> Mgr
                    </span>
                  </Tip>
                  <Tip label={elapsed >= 60 ? 'HR notified in-app' : 'HR notified at day 60'}>
                    <span className={cn('inline-flex items-center gap-1', elapsed >= 60 && 'text-success')}>
                      <Bell className="size-3.5" /> HR
                    </span>
                  </Tip>
                </span>
              </div>

              {!self && !isConfirmed && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant={scheduled.has(e.id) ? 'secondary' : 'outline'}
                    className="px-2"
                    onClick={() => {
                      setScheduled((p) => new Set(p).add(e.id))
                      toast.success(`Appraisal scheduled for ${e.name.split(' ')[0]} — invite sent to ${mgr?.name ?? 'manager'}`)
                    }}
                  >
                    <CalendarPlus /> <span className="truncate">{scheduled.has(e.id) ? 'Scheduled' : 'Appraisal'}</span>
                  </Button>
                  <Button
                    size="sm"
                    className="px-2"
                    onClick={() => {
                      setConfirmed((p) => new Set(p).add(e.id))
                      toast.success(`${e.name} confirmed — confirmation letter generated`)
                    }}
                  >
                    <UserCheck /> <span className="truncate">Confirm</span>
                  </Button>
                  <Button size="sm" variant="ghost" className="px-2" onClick={() => setExtendFor(e)}>
                    <Hourglass /> <span className="truncate">Extend</span>
                  </Button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      <Dialog open={!!extendFor} onOpenChange={(o) => !o && setExtendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend probation</DialogTitle>
            <DialogDescription>
              {extendFor?.name}’s probation currently ends {extendFor && formatDate(ends[extendFor.id] ?? extendFor.probationEnd!)}. The employee and manager will be notified in writing.
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
                  { value: '90', label: '90 days (maximum under Employment Act)' },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="ext-reason">Reason</Label>
              <Textarea id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Needs more time to reach agreed sales targets; improvement plan attached." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendFor(null)}>
              Cancel
            </Button>
            <Button disabled={reason.trim().length < 5} onClick={submitExtend}>
              Extend probation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
