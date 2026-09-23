import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Check,
  CircleCheck,
  Eye,
  FileText,
  Gavel,
  Lock,
  MessageSquarePlus,
  Paperclip,
  Scale,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tip } from '@/components/ui/tooltip'
import { PersonAvatar } from '@/components/ui/avatar'
import { FileUploader } from '@/components/shared/FileUploader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Stepper } from '@/components/shared/Stepper'
import { Timeline } from '@/components/shared/Timeline'
import type { Role } from '@/data/types'
import { TODAY, cn, formatDate } from '@/lib/utils'
import { CASE_STAGES, MASK, clock, type CaseNote, type CaseRecord } from './helpers'

let noteSeq = 0

function stamp(at: string) {
  const [d, t] = at.split(' ')
  return `${formatDate(d!, 'medium')}${t ? ` · ${t}` : ''}`
}

const timelineIcon = (title: string) =>
  /closed/i.test(title) ? CircleCheck : /hearing/i.test(title) ? Gavel : /statement|evidence/i.test(title) ? Paperclip : /assign/i.test(title) ? UserCheck : FileText

export function CaseDetail({
  record,
  open,
  onOpenChange,
  revealed,
  onRequestReveal,
  subjectName,
  reporterName,
  assigneeName,
  role,
  userName,
  onUpdate,
}: {
  record?: CaseRecord
  open: boolean
  onOpenChange: (o: boolean) => void
  revealed: boolean
  onRequestReveal: () => void
  subjectName: string
  reporterName: string
  assigneeName: string
  role: Role
  userName: string
  onUpdate: (r: CaseRecord) => void
}) {
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateNote, setUpdateNote] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<CaseNote['kind']>('hr')

  if (!record) return null
  const r = record
  const stageIdx = CASE_STAGES.indexOf(r.status)
  const masked = r.confidential && !revealed
  const isManager = role === 'manager'
  const approvalsDone = r.approvals.every((a) => a.status === 'Approved')

  const advance = () => {
    if (stageIdx >= CASE_STAGES.length - 1) return
    const next = CASE_STAGES[stageIdx + 1]!
    const approvals = r.approvals.map((a) => (next === 'Awaiting Approval' && a.key === 'investigator' && a.status === 'Waiting' ? { ...a, status: 'Pending' as const } : a))
    onUpdate({
      ...r,
      status: next,
      approvals,
      timeline: [...r.timeline, { date: TODAY, title: `Moved to ${next}`, by: userName, note: `Stage advanced from ${r.status}.` }],
    })
    toast.success(`${r.ref} moved to ${next}`)
  }

  const addUpdate = () => {
    if (!updateTitle.trim()) return
    onUpdate({ ...r, timeline: [...r.timeline, { date: TODAY, title: updateTitle.trim(), by: userName, note: updateNote.trim() }] })
    setUpdateTitle('')
    setUpdateNote('')
    toast.success('Update added to the case timeline')
  }

  const addNote = () => {
    if (!noteText.trim()) return
    const kind: CaseNote['kind'] = isManager ? 'manager' : noteKind
    onUpdate({ ...r, notes: [...r.notes, { id: `${r.id}-n${r.notes.length + 1}-${++noteSeq}`, kind, by: userName, date: TODAY, text: noteText.trim() }] })
    setNoteText('')
    toast.success(kind === 'hr' ? 'HR note saved (HR only)' : 'Manager note saved')
  }

  const decide = (key: string, approve: boolean) => {
    const idx = r.approvals.findIndex((a) => a.key === key)
    const approvals = r.approvals.map((a, i) => {
      if (i === idx) return { ...a, status: approve ? ('Approved' as const) : ('Rejected' as const), at: TODAY }
      if (approve && i === idx + 1 && a.status === 'Waiting') return { ...a, status: 'Pending' as const }
      return a
    })
    const stage = r.approvals[idx]!
    const allApproved = approvals.every((a) => a.status === 'Approved')
    const timeline = [
      ...r.timeline,
      { date: TODAY, title: `${stage.stage} ${approve ? 'approved' : 'rejected'}`, by: userName, note: approve ? 'Recommendation endorsed.' : 'Returned to investigation for further evidence.' },
      ...(allApproved ? [{ date: TODAY, title: 'Case closed', by: userName, note: 'All sign-offs complete. Outcome communicated in writing.' }] : []),
    ]
    const status = allApproved ? ('Closed' as const) : !approve ? ('Investigating' as const) : r.status === 'Hearing' || r.status === 'Investigating' ? ('Awaiting Approval' as const) : r.status
    const reset = !approve ? approvals.map((a) => (a.key === key ? a : a.status === 'Approved' ? a : { ...a, status: 'Waiting' as const })) : approvals
    onUpdate({ ...r, approvals: reset, timeline, status })
    if (allApproved) toast.success(`${r.ref} signed off and closed`)
    else if (approve) toast.success(`${stage.stage} approved`)
    else toast.error(`${stage.stage} rejected — case returned to investigation`)
  }

  const managerNotes = r.notes.filter((n) => n.kind === 'manager')
  const hrNotes = r.notes.filter((n) => n.kind === 'hr')

  const noteCard = (n: CaseNote) => (
    <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{n.by}</span>
        <span>{formatDate(n.date, 'short')}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{n.text}</p>
    </motion.div>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl">
        <div className="border-b p-5 pr-12 sm:p-6 sm:pr-14">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{r.ref}</span>
            <span>·</span>
            <span>{r.type}</span>
            {r.confidential && (
              <Badge variant="soft">
                <Lock /> Confidential
              </Badge>
            )}
          </div>
          <SheetTitle className="mt-2 flex flex-wrap items-center gap-2">
            {masked ? <span className="select-none tracking-widest text-muted-foreground">{MASK}</span> : subjectName}
            {masked && (
              <Button size="sm" variant="soft" onClick={onRequestReveal}>
                <Eye /> Reveal
              </Button>
            )}
          </SheetTitle>
          <SheetDescription className="mt-1">{r.summary}</SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <StatusBadge status={r.severity} />
            <span className="text-xs text-muted-foreground">
              Opened {formatDate(r.opened)} · Reported by {reporterName} · Assigned to {assigneeName}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:p-6">
          <div className="rounded-xl border bg-subtle p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Investigation steps</div>
                <div className="text-xs text-muted-foreground">
                  Stage {stageIdx + 1} of {CASE_STAGES.length}: {r.status}
                </div>
              </div>
              {r.status === 'Closed' ? (
                <Badge variant="success">
                  <Check /> Resolved
                </Badge>
              ) : r.status === 'Awaiting Approval' ? (
                <Button size="sm" variant="outline" disabled={!approvalsDone}>
                  Awaiting sign-off
                </Button>
              ) : (
                <Button size="sm" onClick={advance}>
                  Advance to next stage <ArrowRight />
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

          <Tabs defaultValue="timeline">
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
                  icon: timelineIcon(t.title),
                  state: i === r.timeline.length - 1 && r.status !== 'Closed' ? 'current' : 'done',
                }))}
              />
              <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquarePlus className="size-4 text-primary" /> Add update
                </div>
                <Input value={updateTitle} onChange={(e) => setUpdateTitle(e.target.value)} placeholder="e.g. Witness interview completed" />
                <Textarea value={updateNote} onChange={(e) => setUpdateNote(e.target.value)} placeholder="Summary of what happened (visible to the case team)" className="min-h-[70px]" />
                <div className="flex justify-end">
                  <Button size="sm" onClick={addUpdate} disabled={!updateTitle.trim()}>
                    Post update
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="evidence" className="grid grid-cols-1 gap-4">
              <ul className="divide-y rounded-xl border">
                {r.evidence.map((ev, i) => (
                  <motion.li
                    key={ev.name + i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                      <Paperclip className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{ev.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ev.size} · uploaded {formatDate(ev.uploaded)}
                      </div>
                    </div>
                    <Badge variant="muted">
                      <ShieldCheck /> Hashed
                    </Badge>
                  </motion.li>
                ))}
                {r.evidence.length === 0 && <li className="p-4 text-sm text-muted-foreground">No evidence uploaded yet.</li>}
              </ul>
              <FileUploader
                label="Upload evidence"
                hint="Files are encrypted at rest and tagged to this case"
                onComplete={(files) => {
                  onUpdate({ ...r, evidence: [...r.evidence, ...files.map((f) => ({ ...f, uploaded: TODAY }))] })
                  toast.success(`${files.length} file${files.length > 1 ? 's' : ''} added to evidence`)
                }}
              />
            </TabsContent>

            <TabsContent value="notes" className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="grid grid-cols-1 content-start gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manager notes</div>
                  {managerNotes.map(noteCard)}
                  {managerNotes.length === 0 && <p className="text-sm text-muted-foreground">No manager notes.</p>}
                </div>
                <div className="grid grid-cols-1 content-start gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    HR notes
                    <Badge variant="soft">
                      <Lock /> HR only
                    </Badge>
                  </div>
                  {isManager ? (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-6 text-center">
                      <Lock className="size-5 text-muted-foreground" />
                      <div className="text-sm font-medium">Restricted to HR</div>
                      <p className="text-xs text-muted-foreground">HR notes are not visible to line managers.</p>
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
                  {!isManager && (
                    <SimpleSelect
                      value={noteKind}
                      onValueChange={(v) => setNoteKind(v as CaseNote['kind'])}
                      options={[
                        { value: 'hr', label: 'HR note (HR only)' },
                        { value: 'manager', label: 'Manager note' },
                      ]}
                      className="h-8 w-auto min-w-44 text-xs"
                    />
                  )}
                </div>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Observations, context or next steps…" className="min-h-[70px]" />
                <div className="flex justify-end">
                  <Button size="sm" onClick={addNote} disabled={!noteText.trim()}>
                    Save note
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="approvals" className="grid grid-cols-1 gap-3">
              {r.approvals.map((a, i) => {
                const canAct = a.status === 'Pending' && a.roles.includes(role)
                return (
                  <motion.div
                    key={a.key}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center', a.status === 'Pending' && 'border-primary/40 bg-accent/40')}
                  >
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
                          {a.at ? ` · ${formatDate(a.at)}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.status === 'Pending' &&
                        (canAct ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => decide(a.key, false)}>
                              <X /> Reject
                            </Button>
                            <Button size="sm" onClick={() => decide(a.key, true)}>
                              <Check /> Approve
                            </Button>
                          </>
                        ) : (
                          <Tip label={`Only ${a.key === 'ceo' ? 'the CEO' : a.key === 'hr' ? 'the HR Head' : 'the investigator'} can act on this stage`}>
                            <span>
                              <Button size="sm" variant="outline" disabled>
                                <Lock /> Awaiting {a.key === 'ceo' ? 'CEO' : 'HR'}
                              </Button>
                            </span>
                          </Tip>
                        ))}
                    </div>
                  </motion.div>
                )
              })}
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Scale className="size-3.5" /> Sanctions take effect only after CEO sign-off. Rejections return the case to investigation.
              </p>
            </TabsContent>

            <TabsContent value="access">
              <ul className="divide-y rounded-xl border">
                {r.accessLog.map((a, i) => (
                  <motion.li key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="flex items-start gap-3 p-3">
                    <PersonAvatar name={a.who} className="size-8 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{a.who}</span>
                        <span className="text-xs text-muted-foreground tabular">{stamp(a.at)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.action} · {a.role}
                      </div>
                      {a.reason && <div className="mt-1 text-xs text-foreground">Reason: {a.reason}</div>}
                    </div>
                  </motion.li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Access log is immutable and retained for 7 years. Last exported {formatDate(TODAY)} {clock(r.id)}.</p>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
