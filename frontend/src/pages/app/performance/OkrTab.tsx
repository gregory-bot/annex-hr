import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isAdminLike, isLeader } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tip } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn, formatDate } from '@/lib/utils'
import { objectiveProgress, type KeyResult, type Objective } from './data'
import type { useObjectives } from './useObjectives'

const confidenceVariant = { High: 'success', Medium: 'warning', Low: 'danger' } as const
type Okrs = ReturnType<typeof useObjectives>

type KrDraft = { title: string; current: string; target: string }

export function OkrTab({ okrs }: { okrs: Okrs }) {
  const { employee, department, employees, role, user } = useWorkspace()
  const { objectives } = okrs
  const leader = isLeader(role)
  const [openId, setOpen] = useState<string | null | undefined>(undefined)
  const open = openId === undefined ? objectives[0]?.id ?? null : openId
  const [creating, setCreating] = useState(false)
  const [checkIn, setCheckIn] = useState<{ o: Objective; kr: KeyResult } | null>(null)
  const [adding, setAdding] = useState<Objective | null>(null)

  const canEdit = (o: Objective) => leader || o.ownerId === user.id
  const canDelete = (o: Objective) => isAdminLike(role) || o.ownerId === user.id

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {leader ? 'Q3 2026 objectives' : 'My Q3 2026 objectives'} · {objectives.length} objectives · {objectives.reduce((s, o) => s + o.keyResults.length, 0)} key results
        </span>
        <Button size="sm" onClick={() => setCreating(true)}>
          New objective
        </Button>
      </div>
      {okrs.loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading objectives…</p>}
      {!okrs.loading && !objectives.length && (
        <EmptyState title="No objectives yet" description={leader ? 'Create the quarter’s objectives and key results.' : 'Set an objective for the quarter and track your key results.'} />
      )}
      {objectives.map((o, i) => {
        const owner = employee(o.ownerId)
        const pct = objectiveProgress(o)
        const isOpen = open === o.id
        const editable = canEdit(o)
        return (
          <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="overflow-hidden">
              <button className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40 sm:p-5" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}>
                <ProgressRing value={pct} size={52} stroke={5} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug">{o.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {owner && (
                      <span className="inline-flex items-center gap-1.5">
                        <PersonAvatar name={owner.name} className="size-5 text-[9px]" />
                        {owner.name} · {department(owner.departmentId)?.name}
                      </span>
                    )}
                    <span>{o.keyResults.length} key results</span>
                  </div>
                </div>
                <Badge variant={confidenceVariant[o.confidence]} dot className="hidden sm:inline-flex">
                  {o.confidence} confidence
                </Badge>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="grid grid-cols-1 gap-4 border-t bg-subtle p-4 sm:p-5">
                      {editable ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Confidence</span>
                          <SimpleSelect value={o.confidence} onValueChange={(v) => okrs.update(o.id, { confidence: v as Objective['confidence'] })} options={['High', 'Medium', 'Low']} className="h-8 w-32" />
                        </div>
                      ) : (
                        <Badge variant={confidenceVariant[o.confidence]} dot className="self-start sm:hidden">
                          {o.confidence} confidence
                        </Badge>
                      )}
                      {o.keyResults.map((kr, k) => {
                        const last = kr.updates?.[0]
                        return (
                          <div key={kr.id ?? kr.title}>
                            <div className="flex items-start justify-between gap-3 text-sm">
                              <span className="min-w-0">
                                <span className="mr-1.5 text-xs font-semibold text-muted-foreground">KR{k + 1}</span>
                                {kr.title}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                <span className="font-semibold tabular">{kr.progress}%</span>
                                {editable && kr.id && (
                                  <Tip label="Remove key result">
                                    <Button size="icon-sm" variant="ghost" aria-label="Remove key result" onClick={() => okrs.removeKeyResult(o.id, kr.id!)}>
                                      <X className="size-3.5" />
                                    </Button>
                                  </Tip>
                                )}
                              </span>
                            </div>
                            <Progress value={kr.progress} tone={kr.progress >= 70 ? 'primary' : 'warning'} className="mt-2" />
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                {kr.current || '—'} of {kr.target || '—'}
                                {last && ` · updated ${formatDate(last.at.slice(0, 10))}${last.author ? ` by ${last.author}` : ''}${last.note ? ` — “${last.note}”` : ''}`}
                              </span>
                              {editable && kr.id && (
                                <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setCheckIn({ o, kr })}>
                                  Check in
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {!o.keyResults.length && <p className="text-sm text-muted-foreground">No key results yet.</p>}
                      {editable && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                          <Button size="sm" variant="outline" onClick={() => setAdding(o)}>
                            Add key result
                          </Button>
                          {canDelete(o) && (
                            <Tip label="Delete objective">
                              <Button size="icon-sm" variant="ghost" aria-label="Delete objective" onClick={() => okrs.remove(o.id).then(() => toast.success('Objective deleted'))}>
                                <Trash2 className="size-4" />
                              </Button>
                            </Tip>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        )
      })}

      <NewObjectiveDialog
        open={creating}
        onClose={() => setCreating(false)}
        leader={leader}
        people={employees.filter((e) => e.status !== 'Exited').map((e) => ({ value: e.id, label: e.name }))}
        meId={user.id}
        onCreate={async (input) => {
          const ok = await okrs.create(input)
          if (ok) {
            toast.success('Objective created')
            setCreating(false)
          }
        }}
      />
      <CheckInDialog
        target={checkIn}
        onClose={() => setCheckIn(null)}
        onSave={async (c) => {
          if (!checkIn) return
          const ok = await okrs.checkIn(checkIn.o.id, checkIn.kr.id!, c)
          if (ok) {
            toast.success('Check-in saved')
            setCheckIn(null)
          }
        }}
      />
      <AddKrDialog
        objective={adding}
        onClose={() => setAdding(null)}
        onSave={async (kr) => {
          if (!adding) return
          const ok = await okrs.addKeyResult(adding.id, { ...kr, progress: 0 })
          if (ok) setAdding(null)
        }}
      />
    </div>
  )
}

function KrFields({ value, onChange }: { value: KrDraft; onChange: (v: KrDraft) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
      <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="Key result" aria-label="Key result" />
      <Input value={value.current} onChange={(e) => onChange({ ...value, current: e.target.value })} placeholder="Current" aria-label="Current value" />
      <Input value={value.target} onChange={(e) => onChange({ ...value, target: e.target.value })} placeholder="Target" aria-label="Target value" />
    </div>
  )
}

function NewObjectiveDialog({
  open,
  onClose,
  onCreate,
  leader,
  people,
  meId,
}: {
  open: boolean
  onClose: () => void
  onCreate: (o: { title: string; ownerId: string; confidence: Objective['confidence']; keyResults: { title: string; current: string; target: string; progress: number }[] }) => Promise<void>
  leader: boolean
  people: { value: string; label: string }[]
  meId: string
}) {
  const [title, setTitle] = useState('')
  const [ownerId, setOwnerId] = useState(meId)
  const [confidence, setConfidence] = useState<Objective['confidence']>('Medium')
  const [krs, setKrs] = useState<KrDraft[]>([{ title: '', current: '', target: '' }])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (title.trim().length < 3) return toast.error('Give the objective a title')
    setSaving(true)
    await onCreate({ title: title.trim(), ownerId, confidence, keyResults: krs.filter((k) => k.title.trim()).map((k) => ({ ...k, title: k.title.trim(), progress: 0 })) })
    setSaving(false)
    setTitle('')
    setKrs([{ title: '', current: '', target: '' }])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New objective</DialogTitle>
          <DialogDescription>Q3 2026 · add up to five measurable key results.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="okr-title">Objective</Label>
            <Input id="okr-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Delight every retainer client" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {leader && (
              <div className="grid gap-2">
                <Label>Owner</Label>
                <SimpleSelect value={ownerId} onValueChange={setOwnerId} options={people} />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Confidence</Label>
              <SimpleSelect value={confidence} onValueChange={(v) => setConfidence(v as Objective['confidence'])} options={['High', 'Medium', 'Low']} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Key results</Label>
            {krs.map((k, i) => (
              <KrFields key={i} value={k} onChange={(v) => setKrs((ks) => ks.map((x, j) => (j === i ? v : x)))} />
            ))}
            {krs.length < 5 && (
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setKrs((ks) => [...ks, { title: '', current: '', target: '' }])}>
                Add another
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Create objective'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CheckInDialog({ target, onClose, onSave }: { target: { o: Objective; kr: KeyResult } | null; onClose: () => void; onSave: (c: { progress: number; current: string; note?: string }) => Promise<void> }) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{target && <CheckInForm key={target.kr.id} kr={target.kr} onClose={onClose} onSave={onSave} />}</DialogContent>
    </Dialog>
  )
}

function CheckInForm({ kr, onClose, onSave }: { kr: KeyResult; onClose: () => void; onSave: (c: { progress: number; current: string; note?: string }) => Promise<void> }) {
  const [progress, setProgress] = useState(kr.progress)
  const [current, setCurrent] = useState(kr.current)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <>
      <DialogHeader>
        <DialogTitle>Check in</DialogTitle>
        <DialogDescription>{kr.title}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Label>Progress</Label>
            <span className="text-sm font-semibold tabular">{progress}%</span>
          </div>
          <Slider value={[progress]} min={0} max={100} step={5} onValueChange={(v) => setProgress(v[0] ?? 0)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="kr-current">Current value</Label>
            <Input id="kr-current" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kr-note">Note</Label>
            <Input id="kr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed this week?" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave({ progress, current: current.trim(), note: note.trim() || undefined })
            setSaving(false)
          }}
        >
          {saving ? 'Saving…' : 'Save check-in'}
        </Button>
      </DialogFooter>
    </>
  )
}

function AddKrDialog({ objective, onClose, onSave }: { objective: Objective | null; onClose: () => void; onSave: (kr: KrDraft) => Promise<void> }) {
  const [kr, setKr] = useState<KrDraft>({ title: '', current: '', target: '' })
  return (
    <Dialog open={!!objective} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add key result</DialogTitle>
          <DialogDescription>{objective?.title}</DialogDescription>
        </DialogHeader>
        <KrFields value={kr} onChange={setKr} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!kr.title.trim()) return toast.error('Describe the key result')
              await onSave({ ...kr, title: kr.title.trim() })
              setKr({ title: '', current: '', target: '' })
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
