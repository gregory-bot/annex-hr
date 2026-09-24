import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import type { Employee, Holiday, LeaveRequest, LeaveType } from '@/data/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/input'
import { SimpleSelect } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DateRangePicker } from '@/components/shared/DatePicker'
import { FileUploader } from '@/components/shared/FileUploader'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { uploadFile, type EmployeeFile, type FileCategory } from '@/lib/files'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { LEAVE_TYPES, routeFor, toISO, workingDays } from './utils'

/** Leave types that may go over the balance (HR is alerted instead). */
const OVERDRAW_OK: LeaveType[] = ['Sick', 'Compassionate']
/** The files API category for handover notes (see backend FILE_CATEGORIES). */
const HANDOVER = 'Handover' as FileCategory

export type NewLeave = LeaveRequest & { handoverFileId?: string }

export function ApplyLeaveDialog({
  open,
  onOpenChange,
  user,
  colleagues,
  holidays,
  remaining,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: Employee
  colleagues: Employee[]
  holidays: Holiday[]
  remaining: Record<LeaveType, number>
  /** Resolves with the saved request, or rejects with the server's message (e.g. not enough balance). */
  onSubmit: (r: NewLeave) => Promise<LeaveRequest | void> | void
}) {
  const [type, setType] = useState<LeaveType>('Annual')
  const [range, setRange] = useState<DateRange | undefined>()
  const [reason, setReason] = useState('')
  const [handoverTo, setHandoverTo] = useState<string>()
  const [notes, setNotes] = useState<string[]>([])
  const [handoverFile, setHandoverFile] = useState<EmployeeFile | null>(null)
  const [uploaderKey, setUploaderKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<LeaveRequest | null>(null)

  const calc = useMemo(() => {
    if (!range?.from) return null
    return workingDays(range.from, range.to ?? range.from, holidays)
  }, [range, holidays])
  const days = calc?.days ?? 0
  const route = routeFor(days, type)
  const over = days > remaining[type]
  const blocked = over && !USE_MOCK_API && !OVERDRAW_OK.includes(type)
  const valid = !!range?.from && days > 0 && reason.trim().length > 2 && !!handoverTo && !blocked && !submitting

  const reset = () => {
    setType('Annual')
    setRange(undefined)
    setReason('')
    setHandoverTo(undefined)
    setNotes([])
    setHandoverFile(null)
    setUploaderKey((k) => k + 1)
    setError(null)
    setSubmitting(false)
    setDone(null)
  }

  const submit = async () => {
    if (!valid || !range?.from) return
    const req: NewLeave = {
      id: `lv-new-${Date.now()}`,
      employeeId: user.id,
      type,
      start: toISO(range.from),
      end: toISO(range.to ?? range.from),
      days,
      reason: reason.trim(),
      status: 'Pending',
      stage: 'Manager',
      submitted: TODAY,
      handoverTo,
      handoverNotes: notes.length > 0 || !!handoverFile,
      handoverFileId: handoverFile?.id,
    }
    setSubmitting(true)
    setError(null)
    try {
      const saved = (await onSubmit(req)) ?? req
      setDone(saved)
      toast.success('Leave request submitted', { description: `${saved.days} working day${saved.days === 1 ? '' : 's'} of ${type} leave · sent to your manager` })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setTimeout(reset, 200)
      }}
    >
      <DialogContent className="max-w-xl">
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-6 text-center">
              <SuccessCheck />
              <DialogTitle className="mt-5">Request submitted</DialogTitle>
              <DialogDescription className="mx-auto mt-1.5 max-w-sm">
                {done.days} day{done.days === 1 ? '' : 's'} of {done.type} leave from {formatDate(done.start)} to {formatDate(done.end)}. Your manager has been notified and you’ll get an update in Notifications.
              </DialogDescription>
              <div className="mt-6 flex justify-center gap-2">
                <Button variant="outline" onClick={reset}>
                  Apply again
                </Button>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 gap-5">
              <DialogHeader>
                <DialogTitle>Apply for leave</DialogTitle>
                <DialogDescription>Working days are calculated automatically — weekends and public holidays are excluded.</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid grid-cols-1 gap-1.5">
                  <Label>Leave type</Label>
                  <SimpleSelect
                    value={type}
                    onValueChange={(v) => setType(v as LeaveType)}
                    options={LEAVE_TYPES.map((t) => ({ value: t, label: `${t} · ${remaining[t]} left` }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Label>Dates</Label>
                  <DateRangePicker value={range} onChange={setRange} />
                </div>
              </div>

              <div className={cn('flex items-center justify-between gap-3 rounded-xl border p-3.5', over ? 'border-warning/40 bg-warning-soft' : 'bg-subtle')}>
                <div>
                  <div className="text-xs text-muted-foreground">Working days</div>
                  <div className="text-xl font-bold tabular">{days}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {calc?.excluded.length ? (
                    <div>Excludes {calc.excluded.map((h) => h.name).join(', ')}</div>
                  ) : (
                    <div>{range?.from ? 'No public holidays in range' : 'Pick your dates'}</div>
                  )}
                  {over && (
                    <div className="mt-0.5 font-medium text-warning">
                      {blocked ? `Not enough ${type.toLowerCase()} leave — ${remaining[type]} days remaining` : `Exceeds your ${type.toLowerCase()} balance (${remaining[type]} days) — HR will be alerted`}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <Label>Reason</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family trip to Diani" className="min-h-[72px]" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid grid-cols-1 gap-1.5">
                  <Label>Hand over to</Label>
                  <SimpleSelect
                    value={handoverTo}
                    onValueChange={setHandoverTo}
                    placeholder="Select a colleague"
                    options={colleagues.map((c) => ({ value: c.id, label: `${c.name} — ${c.title}` }))}
                  />
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <Label>Handover notes</Label>
                  {USE_MOCK_API ? (
                    <FileUploader compact multiple={false} label="Upload handover notes" onComplete={(f) => setNotes((p) => [...p, ...f.map((x) => x.name)])} />
                  ) : (
                    <FileUploader<EmployeeFile>
                      key={uploaderKey}
                      compact
                      multiple={false}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      hint="PDF or Word up to 10MB"
                      label={handoverFile ? `Attached: ${handoverFile.filename}` : 'Upload handover notes'}
                      upload={(file, onProgress) => uploadFile(file, { category: HANDOVER }, onProgress)}
                      onUploaded={(files) => setHandoverFile(files[0] ?? null)}
                    />
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Approval route
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {route.map((step, i) => (
                    <motion.div key={step} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2">
                      <Badge variant={i === 0 ? 'soft' : 'outline'} className="px-2.5 py-1 text-xs">
                        {i + 1}. {step}
                      </Badge>
                      {i < route.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
                    </motion.div>
                  ))}
                  {route.length === 3 && <span className="text-xs text-muted-foreground">CEO sign-off: over 10 days or {type === 'Maternity' || type === 'Study' ? type : 'extended'} leave</span>}
                </div>
              </div>

              {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={!valid}>
                  {submitting ? 'Submitting…' : 'Submit request'}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
