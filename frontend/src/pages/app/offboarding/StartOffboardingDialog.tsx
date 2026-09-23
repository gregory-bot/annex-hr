import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { DatePicker } from '@/components/shared/DatePicker'
import { FileUploader } from '@/components/shared/FileUploader'
import type { Employee, Offboarding } from '@/data/types'
import { TODAY, cn } from '@/lib/utils'
import { NOTICE_DAYS, REASONS, WORKFLOW, shiftDate } from './helpers'

/** Compact, wrap-friendly step list for the 7-stage resignation workflow. */
export function WorkflowSteps({ current, className }: { current: number; className?: string }) {
  return (
    <ol className={cn('grid gap-1.5 sm:grid-cols-7 sm:gap-1', className)}>
      {WORKFLOW.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex items-center gap-2 sm:flex-col sm:items-stretch sm:gap-1.5">
            <motion.div
              initial={false}
              animate={{ opacity: 1 }}
              className={cn('hidden h-1 rounded-full sm:block', done ? 'bg-primary' : active ? 'bg-primary/50' : 'bg-muted')}
            />
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold sm:hidden',
                done ? 'bg-primary text-white' : active ? 'bg-accent text-primary ring-1 ring-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn('text-xs leading-tight sm:text-[11px]', active ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

const toISO = (d: Date) => format(d, 'yyyy-MM-dd')

export function StartOffboardingDialog({
  open,
  onOpenChange,
  employees,
  onCreate,
  initialEmployeeId = '',
}: {
  initialEmployeeId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: Employee[]
  onCreate: (o: Pick<Offboarding, 'employeeId' | 'reason' | 'submitted' | 'lastDay' | 'noticeDays'>, letter?: string) => void
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId)
  const [reason, setReason] = useState<Offboarding['reason']>('Resignation')
  const [submitted, setSubmitted] = useState(TODAY)
  const [lastDay, setLastDay] = useState(shiftDate(TODAY, NOTICE_DAYS))
  const [lastDayTouched, setLastDayTouched] = useState(false)
  const [letter, setLetter] = useState<string | undefined>()

  const notice = Math.round((parseISO(lastDay).getTime() - parseISO(submitted).getTime()) / 86_400_000)

  const submit = () => {
    if (!employeeId) {
      toast.error('Select the departing employee')
      return
    }
    if (notice < 0) {
      toast.error('Last working day must be after the submission date')
      return
    }
    onCreate({ employeeId, reason, submitted, lastDay, noticeDays: notice }, letter)
    setEmployeeId('')
    setReason('Resignation')
    setSubmitted(TODAY)
    setLastDay(shiftDate(TODAY, NOTICE_DAYS))
    setLastDayTouched(false)
    setLetter(undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start offboarding</DialogTitle>
          <DialogDescription>Kick off the resignation workflow. The employee's manager, IT and Finance are notified automatically.</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-subtle p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resignation workflow</div>
          <WorkflowSteps current={0} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label>Employee</Label>
            <SimpleSelect value={employeeId} onValueChange={setEmployeeId} options={employees.map((e) => ({ value: e.id, label: `${e.name} · ${e.title}` }))} placeholder="Who is leaving?" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label>Reason</Label>
            <SimpleSelect value={reason} onValueChange={(v) => setReason(v as Offboarding['reason'])} options={REASONS} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label>Submitted date</Label>
            <DatePicker
              value={parseISO(submitted)}
              onChange={(d) => {
                if (!d) return
                const iso = toISO(d)
                setSubmitted(iso)
                if (!lastDayTouched) setLastDay(shiftDate(iso, NOTICE_DAYS))
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label>Last working day</Label>
            <DatePicker
              value={parseISO(lastDay)}
              onChange={(d) => {
                if (!d) return
                setLastDay(toISO(d))
                setLastDayTouched(true)
              }}
            />
            <p className="text-xs text-muted-foreground">
              {lastDayTouched ? `${notice}-day notice period` : `Auto-set to ${NOTICE_DAYS} days' contractual notice`}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label>{reason === 'Resignation' ? 'Resignation letter' : 'Supporting letter'}</Label>
            <FileUploader compact multiple={false} label="Upload signed letter" hint="PDF or scanned image" onComplete={(f) => setLetter(f[0]?.name)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!employeeId}>
            Start offboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
