import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tip } from '@/components/ui/tooltip'
import { PersonAvatar } from '@/components/ui/avatar'
import { FileUploader } from '@/components/shared/FileUploader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Stepper } from '@/components/shared/Stepper'
import { Timeline } from '@/components/shared/Timeline'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { ACCESS_LABELS, CASE_STAGES, MASK, type AccessEntry, type CaseDetailData, type CaseNote } from './helpers'
import { FILE_ACCEPT_DOCS, downloadFrom } from './upload'
import type { CasesApi } from './useCases'

function stamp(at: string) {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return `${formatDate(at.slice(0, 10), 'medium')} · ${d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`
}

const fileType = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE')

export function CaseDetail({
  record,
  open,
  onOpenChange,
  onRequestReveal,
  cases,
}: {
  record: CaseDetailData | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onRequestReveal: () => void
  cases: CasesApi
}) {
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<CaseNote['visibility']>('hr_only')
  const [tab, setTab] = useState('timeline')
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<AccessEntry[] | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const id = record?.id
  const { accessLog } = cases
  useEffect(() => {
    setLog(null)
    setRejecting(null)
    setComment('')
  }, [id])
  useEffect(() => {
    if (tab !== 'access' || !id) return
    let cancelled = false
    accessLog(id)
      .then((l) => !cancelled && setLog(l))
      .catch((err) => toast.error('Could not load the access log', { description: errorMessage(err) }))
    return () => {
      cancelled = true
    }
    // Reload whenever the case changes (reveals, uploads and views add entries).
  }, [tab, id, record, accessLog])

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
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
      <SheetContent className="sm:max-w-3xl">
        {!record ? (
          <div className="grid grid-cols-1 gap-4 p-6">
            <SheetTitle className="sr-only">Loading case</SheetTitle>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          renderBody()
        )}
      </SheetContent>
    </Sheet>
  )

  function renderBody() {
    const r = record!
    const stageIdx = CASE_STAGES.indexOf(r.status)
    const caseTeamNotes = r.notes.filter((n) => n.visibility === 'case_team')
    const hrNotes = r.notes.filter((n) => n.visibility === 'hr_only')
    const visibility: CaseNote['visibility'] = r.canSeeHrNotes ? noteKind : 'case_team'

    const noteCard = (n: CaseNote) => (
      <div key={n.id} className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{n.author}</span>
          <span>{formatDate(n.createdAt.slice(0, 10), 'short')}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{n.body}</p>
      </div>
    )

    return (
      <>
        <div className="border-b p-5 pr-12 sm:p-6 sm:pr-14">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{r.ref}</span>
            <span>·</span>
            <span>{r.type}</span>
            {r.confidential && <Badge variant="soft">Confidential</Badge>}
          </div>
          <SheetTitle className="mt-2 flex flex-wrap items-center gap-2">
            {r.masked ? <span className="select-none tracking-widest text-muted-foreground">{MASK}</span> : r.subjectName}
            {r.masked && (
              <Button size="sm" variant="soft" onClick={onRequestReveal}>
                Reveal
              </Button>
            )}
          </SheetTitle>
          {!r.masked && r.subjectTitle && <div className="text-xs text-muted-foreground">{r.subjectTitle}</div>}
          <SheetDescription className="mt-1">{r.summary}</SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <StatusBadge status={r.severity} />
            <span className="text-xs text-muted-foreground">
              Opened {formatDate(r.opened)} · Reported by {r.reporterName} · Assigned to {r.assigneeName}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:p-6">
          <div className="rounded-xl border bg-subtle p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Investigation steps</div>
                <div className="text-xs text-muted-foreground">
                  Stage {Math.min(stageIdx + 1, CASE_STAGES.length)} of {CASE_STAGES.length}: {r.status}
                </div>
              </div>
              {r.status === 'Closed' ? (
                <Badge variant="success">Resolved</Badge>
              ) : r.status === 'Awaiting Approval' ? (
                <Button size="sm" variant="outline" onClick={() => setTab('approvals')}>
                  Awaiting sign-off
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy === 'advance'}
                  onClick={() => void run('advance', () => cases.advance(r.id), `${r.ref} moved to ${CASE_STAGES[stageIdx + 1]}`)}
                >
                  {busy === 'advance' ? 'Saving…' : 'Advance to next stage'}
                </Button>
              )}
            </div>
            <Stepper steps={CASE_STAGES} current={r.status === 'Closed' ? CASE_STAGES.length : stageIdx} className="[&_span]:text-[11px]" />
            <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] text-muted-foreground sm:hidden">
              {CASE_STAGES.map((s) => (
                <span key={s} className={cn('truncate', s === r.status && 'font-semibold text-foreground')}>
                  {s === 'Awaiting Approval' ? 'Approval' : s}
                </span>
              ))}
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="evidence">Evidence ({r.evidence.length})</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="approvals">Approvals</TabsTrigger>
              <TabsTrigger value="access">Access log</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="grid grid-cols-1 gap-5">
              <Timeline
                items={r.timeline.map((t, i) => ({
                  title: t.title,
                  meta: `${formatDate(t.date)} · ${t.by}`,
                  body: t.note,
                  state: i === r.timeline.length - 1 && r.status !== 'Closed' ? 'current' : 'done',
                }))}
              />
              <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
                <div className="text-sm font-semibold">Add update</div>
                <Input value={updateTitle} onChange={(e) => setUpdateTitle(e.target.value)} placeholder="e.g. Witness interview completed" />
                <Textarea value={updateNote} onChange={(e) => setUpdateNote(e.target.value)} placeholder="Summary of what happened (visible to the case team)" className="min-h-[70px]" />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={updateTitle.trim().length < 2 || busy === 'event'}
                    onClick={async () => {
                      if (await run('event', () => cases.addEvent(r.id, updateTitle.trim(), updateNote.trim()), 'Update added to the case timeline')) {
                        setUpdateTitle('')
                        setUpdateNote('')
                      }
                    }}
                  >
                    {busy === 'event' ? 'Posting…' : 'Post update'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="evidence" className="grid grid-cols-1 gap-4">
              <ul className="divide-y rounded-xl border">
                {r.evidence.map((ev, i) => (
                  <li key={(ev.id ?? ev.name) + i} className="flex items-center gap-3 p-3">
                    <span className="w-9 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{fileType(ev.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{ev.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ev.size} · uploaded {formatDate(ev.uploaded)}
                        {ev.uploadedBy ? ` by ${ev.uploadedBy}` : ''}
                      </div>
                    </div>
                    {ev.downloadable && ev.id && !USE_MOCK_API ? (
                      <Button size="sm" variant="outline" onClick={() => downloadFrom(`/lifecycle/case-files/${encodeURIComponent(ev.id!)}/download`)}>
                        Download
                      </Button>
                    ) : (
                      <Badge variant="muted">Archived</Badge>
                    )}
                  </li>
                ))}
                {r.evidence.length === 0 && <li className="p-4 text-sm text-muted-foreground">No evidence uploaded yet.</li>}
              </ul>
              <FileUploader
                accept={FILE_ACCEPT_DOCS}
                label="Upload evidence"
                hint="PDF, images or Word up to 10 MB · visible to the case team only"
                upload={(file, onProgress) => cases.uploadEvidence(r.id, file, onProgress)}
                onUploaded={(files) => {
                  void cases.evidenceAdded(r.id, files)
                  toast.success(`${files.length} file${files.length > 1 ? 's' : ''} added to evidence`)
                }}
              />
            </TabsContent>

            <TabsContent value="notes" className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid grid-cols-1 content-start gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case team notes</div>
                  {caseTeamNotes.map(noteCard)}
                  {caseTeamNotes.length === 0 && <p className="text-sm text-muted-foreground">No case team notes.</p>}
                </div>
                <div className="grid grid-cols-1 content-start gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    HR notes
                    <Badge variant="soft">HR only</Badge>
                  </div>
                  {!r.canSeeHrNotes ? (
                    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-muted/40 p-6 text-center">
                      <div className="text-sm font-medium">Restricted to HR</div>
                      <p className="text-xs text-muted-foreground">HR notes are only visible to the HR team.</p>
                    </div>
                  ) : (
                    <>
                      {hrNotes.map(noteCard)}
                      {hrNotes.length === 0 && <p className="text-sm text-muted-foreground">No HR notes.</p>}
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Add note</Label>
                  {r.canSeeHrNotes ? (
                    <SimpleSelect
                      value={noteKind}
                      onValueChange={(v) => setNoteKind(v as CaseNote['visibility'])}
                      options={[
                        { value: 'hr_only', label: 'HR note (HR only)' },
                        { value: 'case_team', label: 'Case team note' },
                      ]}
                      className="h-8 w-auto min-w-44 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Visible to the case team</span>
                  )}
                </div>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Observations, context or next steps…" className="min-h-[70px]" />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!noteText.trim() || busy === 'note'}
                    onClick={async () => {
                      if (await run('note', () => cases.addNote(r.id, noteText.trim(), visibility), visibility === 'hr_only' ? 'HR note saved (HR only)' : 'Case team note saved')) setNoteText('')
                    }}
                  >
                    {busy === 'note' ? 'Saving…' : 'Save note'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="approvals" className="grid grid-cols-1 gap-3">
              {r.approvals.map((a, i) => (
                <div key={a.step} className={cn('grid grid-cols-1 gap-3 rounded-xl border p-4', a.status === 'Pending' && 'border-primary/40 bg-accent/40')}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          a.status === 'Approved' ? 'bg-success-soft text-success' : a.status === 'Rejected' ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {a.status === 'Approved' ? <Check className="size-4" /> : a.status === 'Rejected' ? <X className="size-4" /> : i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{a.stage}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.approver}
                          {a.decidedAt ? ` · ${formatDate(a.decidedAt.slice(0, 10))}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.status === 'Pending' &&
                        (a.canAct ? (
                          <>
                            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setRejecting(rejecting === a.step ? null : a.step)}>
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              disabled={!!busy}
                              onClick={() => void run(`approve-${a.step}`, () => cases.decide(r.id, a.step, true), a.step === 'ceo' ? `${r.ref} signed off and closed` : `${a.stage} approved`)}
                            >
                              {busy === `approve-${a.step}` ? 'Saving…' : 'Approve'}
                            </Button>
                          </>
                        ) : (
                          <Tip label={`Only ${a.step === 'ceo' ? 'the CEO' : a.step === 'hr' ? 'the HR Head' : 'the investigator (HR)'} can act on this stage`}>
                            <span>
                              <Button size="sm" variant="outline" disabled>
                                Awaiting {a.step === 'ceo' ? 'CEO' : 'HR'}
                              </Button>
                            </span>
                          </Tip>
                        ))}
                    </div>
                  </div>
                  {a.comment && <p className="text-xs text-muted-foreground">“{a.comment}”</p>}
                  {rejecting === a.step && (
                    <div className="grid grid-cols-1 gap-2">
                      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What needs more work? (shared with the case team)" className="min-h-[60px]" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!!busy}
                          onClick={async () => {
                            if (await run(`reject-${a.step}`, () => cases.decide(r.id, a.step, false, comment.trim() || undefined))) {
                              toast.error(`${a.stage} rejected — case returned to investigation`)
                              setRejecting(null)
                              setComment('')
                            }
                          }}
                        >
                          Reject &amp; return
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Sanctions take effect only after CEO sign-off. Rejections return the case to investigation.</p>
            </TabsContent>

            <TabsContent value="access">
              {log === null ? (
                <div className="grid grid-cols-1 gap-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {log.map((a, i) => (
                    <li key={a.at + i} className="flex items-start gap-3 p-3">
                      <PersonAvatar name={a.by ?? 'Former user'} className="size-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-medium">{a.by ?? 'Former user'}</span>
                          <span className="text-xs text-muted-foreground tabular">{stamp(a.at)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{ACCESS_LABELS[a.action] ?? a.action}</div>
                        {a.reason && <div className="mt-1 break-words text-xs text-foreground">{a.action === 'revealed_identity' ? 'Reason: ' : ''}{a.reason}</div>}
                      </div>
                    </li>
                  ))}
                  {log.length === 0 && <li className="p-4 text-sm text-muted-foreground">No access recorded yet.</li>}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">The access log is append-only and retained for 7 years.</p>
            </TabsContent>
          </Tabs>
        </div>
      </>
    )
  }
}
