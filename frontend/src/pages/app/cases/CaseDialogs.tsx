import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FileUploader } from '@/components/shared/FileUploader'
import type { Employee, HRCase } from '@/data/types'
import { errorMessage } from '@/lib/api'
import { CASE_TYPES, SEVERITIES } from './helpers'
import { FILE_ACCEPT_DOCS } from './upload'
import type { NewCase } from './useCases'

const REVEAL_REASONS = ['Active investigation', 'Preparing hearing', 'Approval review', 'Legal / compliance request']

/** Asks for a justification before unmasking a confidential subject. */
export function RevealDialog({
  open,
  onOpenChange,
  caseRef,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  caseRef?: string
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState(REVEAL_REASONS[0]!)
  const [detail, setDetail] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal subject identity</DialogTitle>
          <DialogDescription>
            {caseRef} is confidential. Your name, the time and your reason will be written to the case access log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-2">
            <Label>Reason for access</Label>
            <SimpleSelect value={reason} onValueChange={setReason} options={REVEAL_REASONS} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="reveal-detail">Details (optional)</Label>
            <Textarea id="reveal-detail" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. Scheduling the disciplinary hearing panel" className="min-h-[70px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(detail.trim() ? `${reason} — ${detail.trim()}` : reason)
              setDetail('')
            }}
          >
            Reveal &amp; log access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Case logging form. */
export function LogCaseDialog({
  open,
  onOpenChange,
  employees,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: Employee[]
  onCreate: (c: NewCase, files: File[]) => Promise<void>
}) {
  const [type, setType] = useState<HRCase['type']>('Grievance')
  const [subjectId, setSubjectId] = useState('')
  const [reporterId, setReporterId] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [severity, setSeverity] = useState<HRCase['severity']>('Medium')
  const [description, setDescription] = useState('')
  const [confidential, setConfidential] = useState(true)
  const [evidence, setEvidence] = useState<File[]>([])
  const [uploaderKey, setUploaderKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const options = employees.map((e) => ({ value: e.id, label: `${e.name} · ${e.title}` }))
  const valid = subjectId && (anonymous || reporterId) && description.trim().length >= 10

  const reset = () => {
    setType('Grievance')
    setSubjectId('')
    setReporterId('')
    setAnonymous(false)
    setSeverity('Medium')
    setDescription('')
    setConfidential(true)
    setEvidence([])
    setUploaderKey((k) => k + 1)
  }

  const submit = async () => {
    if (!valid) {
      toast.error('Add the subject, reporter and a description of at least 10 characters.')
      return
    }
    setBusy(true)
    try {
      await onCreate({ type, subjectId, reportedBy: anonymous ? 'Anonymous' : reporterId, severity, confidential, summary: description.trim() }, evidence)
      reset()
    } catch (err) {
      toast.error('Could not log the case', { description: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log a case</DialogTitle>
          <DialogDescription>Cases are routed to the HR case team. Confidential cases are masked for everyone outside it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-1 gap-2">
            <Label>Case type</Label>
            <SimpleSelect value={type} onValueChange={(v) => setType(v as HRCase['type'])} options={CASE_TYPES} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label>Severity</Label>
            <SimpleSelect value={severity} onValueChange={(v) => setSeverity(v as HRCase['severity'])} options={SEVERITIES} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label>Subject employee</Label>
            <SimpleSelect value={subjectId} onValueChange={setSubjectId} options={options} placeholder="Who is this case about?" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Reported by</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={anonymous} onCheckedChange={setAnonymous} />
                Report anonymously
              </label>
            </div>
            {anonymous ? (
              <div className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                Reporter identity will not be stored.
              </div>
            ) : (
              <SimpleSelect value={reporterId} onValueChange={setReporterId} options={options} placeholder="Select reporter" />
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label htmlFor="case-desc">Description</Label>
            <Textarea
              id="case-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, when, where, and who witnessed it?"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:col-span-2">
            <Label>Evidence</Label>
            <FileUploader
              key={uploaderKey}
              compact
              accept={FILE_ACCEPT_DOCS}
              label="Attach statements or screenshots"
              hint="PDF, images or Word · up to 10 MB each · uploaded when the case is logged"
              upload={(file, onProgress) => {
                onProgress(100)
                return Promise.resolve(file)
              }}
              onUploaded={(files) => setEvidence((prev) => [...prev, ...files])}
            />
          </div>
          <label className="flex items-start justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <span>
              <span className="block text-sm font-medium">Confidential case</span>
              <span className="block text-xs text-muted-foreground">Mask the subject's name and log every view.</span>
            </span>
            <Switch checked={confidential} onCheckedChange={setConfidential} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? 'Logging…' : 'Log case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
