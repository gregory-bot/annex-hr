import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PersonAvatar } from '@/components/ui/avatar'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { FileUploader } from '@/components/shared/FileUploader'
import { ProgressRing } from '@/components/shared/ProgressRing'
import type { Employee, Role } from '@/data/types'
import { errorMessage } from '@/lib/api'
import { formatBytes } from '@/lib/files'
import { cn, formatDate, formatKES } from '@/lib/utils'
import { FILE_ACCEPT_DOCS } from '../cases/upload'
import { WorkflowSteps } from './StartOffboardingDialog'
import { ExitInterviewAnswers } from './ExitInterview'
import { Settlement } from './Settlement'
import { CONDITIONS, GROUPS, canTick, outstandingValue, type Condition, type ExitDetail, type ExitFile } from './helpers'
import type { OffboardingApi } from './useOffboardings'

const HR_ROLES: Role[] = ['super_admin', 'company_admin', 'hr_officer']
const fileType = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE')

export function OffboardingDetail({
  record,
  successors,
  role,
  open,
  onOpenChange,
  api,
  countdown,
}: {
  record: ExitDetail | null
  successors: Employee[]
  role: Role
  open: boolean
  onOpenChange: (o: boolean) => void
  api: OffboardingApi
  countdown: React.ReactNode
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [serialEdit, setSerialEdit] = useState<{ id: string; value: string } | null>(null)
  const id = record?.id
  const savedNotes = record?.handoverNotes ?? ''
  useEffect(() => setNotes(savedNotes), [id, savedNotes])

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string, description?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok, { description })
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {!record ? (
          <div className="grid grid-cols-1 gap-4 p-6">
            <SheetTitle className="sr-only">Loading exit</SheetTitle>
            <Skeleton className="h-11 w-60" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          renderBody(record)
        )}
      </SheetContent>
    </Sheet>
  )

  function fileList(files: ExitFile[], empty: string) {
    return (
      <ul className="divide-y rounded-xl border">
        {files.map((d) => (
          <li key={d.id} className="flex items-center gap-3 p-3">
            <span className="w-9 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{fileType(d.filename)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.filename}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(d.sizeBytes)} · {formatDate(d.createdAt.slice(0, 10))}
                {d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => api.downloadFile(d.id)}>
              Download
            </Button>
          </li>
        ))}
        {files.length === 0 && <li className="p-4 text-sm text-muted-foreground">{empty}</li>}
      </ul>
    )
  }

  function renderBody(r: ExitDetail) {
    const outstanding = outstandingValue(r.assets)
    const isHr = HR_ROLES.includes(role)
    const canSeeSettlement = isHr || role === 'finance' || role === 'ceo'
    const canEdit = isHr || role === 'manager'
    const letters = r.files.filter((f) => f.kind === 'resignation_letter')
    const kt = r.files.filter((f) => f.kind === 'knowledge_transfer')
    const pct = r.progress

    return (
      <>
        <div className="border-b p-5 pr-12 sm:p-6 sm:pr-14">
          <div className="flex items-center gap-3">
            <PersonAvatar name={r.employeeName} className="size-11" />
            <div className="min-w-0">
              <SheetTitle className="truncate">{r.employeeName}</SheetTitle>
              <SheetDescription className="truncate">
                {r.employeeTitle} · {r.reason} · last day {formatDate(r.lastDay)}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-xl border bg-subtle p-4">
            <ProgressRing value={pct} size={64} tone={pct === 100 ? 'success' : 'primary'} label={<AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{r.stageLabel}</span>
                <span className="text-xs text-muted-foreground">{countdown}</span>
              </div>
              <Progress value={pct} tone={pct === 100 ? 'success' : 'primary'} className="mt-2" />
              <WorkflowSteps current={r.stage === 6 ? 7 : r.stage} className="mt-3 hidden sm:grid" />
            </div>
          </div>
          {(r.canAcknowledge || r.canApprove) && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-accent/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{r.canAcknowledge ? 'Waiting for the line manager to acknowledge.' : `Acknowledged by ${r.managerAck?.by ?? 'the manager'} — waiting for HR approval.`}</span>
              {r.canAcknowledge ? (
                <Button size="sm" disabled={busy === 'ack'} onClick={() => void run('ack', () => api.acknowledge(r.id), 'Resignation acknowledged')}>
                  Acknowledge
                </Button>
              ) : (
                <Button size="sm" disabled={busy === 'hr'} onClick={() => void run('hr', () => api.approve(r.id), 'Exit approved by HR', 'Notice period started.')}>
                  Approve exit
                </Button>
              )}
            </div>
          )}
          {(r.managerAck || r.hrApproval) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {r.managerAck && <span>Acknowledged by {r.managerAck.by ?? 'manager'} · {formatDate(r.managerAck.at.slice(0, 10), 'short')}</span>}
              {r.hrApproval && <span>HR approved by {r.hrApproval.by ?? 'HR'} · {formatDate(r.hrApproval.at.slice(0, 10), 'short')}</span>}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <Tabs defaultValue="checklist">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="handover">Handover</TabsTrigger>
              <TabsTrigger value="assets">Asset recovery</TabsTrigger>
              <TabsTrigger value="interview">Exit interview</TabsTrigger>
              <TabsTrigger value="settlement">Final settlement</TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="grid grid-cols-1 gap-4">
              {GROUPS.map((g) => {
                const items = r.checklist.filter((c) => c.group === g)
                const done = items.filter((c) => c.done).length
                const allowed = canTick(role, g)
                return (
                  <div key={g} className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <span className="text-sm font-semibold">{g}</span>
                      <Badge variant={done === items.length ? 'success' : 'muted'}>
                        {done}/{items.length}
                      </Badge>
                    </div>
                    <ul className="divide-y">
                      {items.map((c) => (
                        <li key={c.id}>
                          <label className={cn('flex items-center gap-3 px-4 py-3', allowed ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default')}>
                            <Checkbox
                              checked={c.done}
                              disabled={!allowed || busy === c.id}
                              onCheckedChange={(v) => void run(c.id, () => api.toggleItem(r.id, c.id, v === true), v === true ? `${c.label} — done` : undefined)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className={cn('block text-sm', c.done && 'text-muted-foreground line-through')}>{c.label}</span>
                              {c.done && c.doneBy && <span className="block text-[11px] text-muted-foreground">{c.doneBy}{c.doneAt ? ` · ${formatDate(c.doneAt.slice(0, 10), 'short')}` : ''}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              <div className="grid grid-cols-1 gap-2">
                <div className="text-sm font-semibold">{r.reason === 'Resignation' ? 'Resignation letter' : 'Supporting letter'}</div>
                {fileList(letters, 'No letter on file.')}
                {canEdit && letters.length === 0 && (
                  <FileUploader
                    compact
                    multiple={false}
                    accept={FILE_ACCEPT_DOCS}
                    label="Upload signed letter"
                    hint="PDF or scanned image up to 10 MB"
                    upload={(file, onProgress) => api.uploadFile(r.id, 'resignation_letter', file, onProgress)}
                    onUploaded={(files) => {
                      void api.filesAdded(r.id, files)
                      toast.success('Letter attached')
                    }}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="handover" className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label>Successor</Label>
                <div className={cn(!canEdit && 'pointer-events-none opacity-60')}>
                <SimpleSelect
                  value={r.successorId ?? ''}
                  onValueChange={(v) => void run('successor', () => api.saveHandover(r.id, { successorId: v }), `Successor set: ${successors.find((s) => s.id === v)?.name ?? ''}`)}
                  options={successors.map((s) => ({ value: s.id, label: `${s.name} · ${s.title}` }))}
                  placeholder={r.successorName ?? 'Who takes over this role?'}
                />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="handover-notes">Handover notes</Label>
                <Textarea
                  id="handover-notes"
                  value={notes}
                  readOnly={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Open work, key contacts, recurring deadlines, where things live…"
                  className="min-h-[120px]"
                />
                {canEdit && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={notes === r.handoverNotes || busy === 'notes'} onClick={() => void run('notes', () => api.saveHandover(r.id, { handoverNotes: notes }), 'Handover notes saved')}>
                      {busy === 'notes' ? 'Saving…' : 'Save notes'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>Knowledge transfer</Label>
                {fileList(kt, 'No handover documents yet.')}
                {canEdit && (
                  <FileUploader
                    compact
                    accept={FILE_ACCEPT_DOCS}
                    label="Upload SOPs, runbooks or handover plans"
                    hint="PDF, images or Word up to 10 MB · shared with the successor and line manager"
                    upload={(file, onProgress) => api.uploadFile(r.id, 'knowledge_transfer', file, onProgress)}
                    onUploaded={(files) => {
                      void api.filesAdded(r.id, files)
                      toast.success(`${files.length} handover document${files.length > 1 ? 's' : ''} added`)
                    }}
                  />
                )}
              </div>
              {canEdit && (
                <div className="flex justify-end">
                  <Button
                    disabled={r.handover || busy === 'signoff'}
                    onClick={() =>
                      void run('signoff', () => api.saveHandover(r.id, { signOff: true, ...(notes !== r.handoverNotes ? { handoverNotes: notes } : {}) }), 'Handover signed off', 'Manager checklist item completed.')
                    }
                  >
                    {r.handover ? 'Handover signed off' : 'Save & sign off handover'}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="assets" className="grid grid-cols-1 gap-3">
              {outstanding > 0 ? (
                <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
                  <span className="font-semibold">{formatKES(outstanding)} outstanding.</span>{' '}
                  <span className="text-muted-foreground">Unreturned or damaged property is recovered from final dues.</span>
                </div>
              ) : (
                <div className="rounded-xl border bg-success-soft p-3 text-sm font-medium text-success">All company property recovered.</div>
              )}
              <ul className="grid grid-cols-1 gap-2">
                {r.assets.map((a) => (
                  <li key={a.id} className={cn('grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center', a.returned && 'bg-subtle')}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-label={a.returned ? 'Returned' : 'Outstanding'} className={cn('size-2 shrink-0 rounded-full', a.returned ? 'bg-success' : 'bg-warning')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{a.name}</div>
                        {serialEdit?.id === a.id ? (
                          <form
                            className="mt-1 flex gap-2"
                            onSubmit={async (e) => {
                              e.preventDefault()
                              if (serialEdit.value.trim() && (await run(a.id, () => api.patchAsset(r.id, a.id, { serial: serialEdit.value.trim() }), 'Serial updated'))) setSerialEdit(null)
                            }}
                          >
                            <Input value={serialEdit.value} onChange={(e) => setSerialEdit({ id: a.id, value: e.target.value })} className="h-8 font-mono text-xs" autoFocus aria-label="Serial or tag" />
                            <Button size="sm" type="submit" disabled={busy === a.id}>
                              Save
                            </Button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setSerialEdit({ id: a.id, value: a.serial ?? '' })}
                            className="block max-w-full truncate text-left font-mono text-[11px] text-muted-foreground enabled:hover:text-foreground"
                            title={canEdit ? 'Edit serial / tag' : undefined}
                          >
                            {a.serial ?? 'No serial'}
                            {a.valueKES > 0 && ` · ${formatKES(a.valueKES)}`}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={cn(!canEdit && 'pointer-events-none opacity-60')}>
                    <SimpleSelect
                      value={a.condition}
                      onValueChange={(v) => void run(a.id, () => api.patchAsset(r.id, a.id, { condition: v as Condition }))}
                      options={CONDITIONS}
                      className="h-9 sm:w-32"
                    />
                    </div>
                    <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:justify-start">
                      {a.valueKES > 0 ? 'Returned' : 'Revoked'}
                      <Switch
                        checked={a.returned}
                        disabled={!canEdit || busy === a.id}
                        onCheckedChange={(v) => void run(a.id, () => api.patchAsset(r.id, a.id, { returned: v }), v ? `${a.name} ${a.valueKES > 0 ? 'returned' : 'access revoked'}` : undefined)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="interview">
              <ExitInterviewAnswers answers={r.interview} name={r.employeeName} done={r.exitInterview} canSee={isHr} />
            </TabsContent>

            <TabsContent value="settlement">
              {canSeeSettlement && r.settlement ? (
                <Settlement record={r} role={role} api={api} />
              ) : (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed bg-muted/40 p-8 text-center">
                  <div className="text-sm font-medium">Restricted to HR, Finance and the CEO</div>
                  <p className="text-xs text-muted-foreground">Final dues contain salary information.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </>
    )
  }
}
