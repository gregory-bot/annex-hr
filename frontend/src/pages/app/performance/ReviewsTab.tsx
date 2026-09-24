import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { USE_MOCK_API } from '@/lib/api'
import { isAdminLike } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { Section } from '@/components/shared/Section'
import { Stepper } from '@/components/shared/Stepper'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { COMPETENCIES, CYCLE_STAGES, PEER_QUOTES, RATING_LABELS, hash, type ReviewRow, type StepStatus } from './data'
import type { ReviewDetail, ReviewDoc } from './api'
import type { ReviewInput, ReviewKind, Reviews } from './useReviews'

const statusVariant: Record<StepStatus, 'success' | 'warning' | 'muted'> = { Submitted: 'success', 'In Progress': 'warning', 'Not started': 'muted' }

function StepBadge({ s }: { s: StepStatus }) {
  return (
    <Badge variant={statusVariant[s]} dot>
      {s}
    </Badge>
  )
}

/** Mock mode has no stored reviews: synthesise a plausible submitted one. */
function mockDoc(employee: Employee, submitted: boolean): ReviewDoc | null {
  if (!submitted) return null
  const seed = hash(employee.id)
  return {
    status: 'Submitted',
    ratings: Object.fromEntries(COMPETENCIES.map((c, i) => [c.key, Math.max(1, Math.min(5, Math.round(employee.performance + (((seed >> i) % 3) - 1) * 0.4)))])),
    overall: employee.performance,
    strengths: 'Consistently delivered the quarter’s priorities and supported teammates through the Q3 launch.',
    improvements: 'Delegate earlier and share context more widely in planning.',
    submittedAt: null,
    updatedAt: '',
  }
}

export function ReviewsTab({ org, reviews }: { org: boolean; reviews: Reviews }) {
  const { user, department, role, employees } = useWorkspace()
  const { cycle, rows } = reviews
  const [selected, setSelected] = useState<ReviewRow | null>(null)
  const [peerFor, setPeerFor] = useState<Employee | null>(null)
  const [confirm, setConfirm] = useState(false)
  const admin = isAdminLike(role) && role !== 'ceo'
  const visible = org ? rows.filter((r) => r.employee.id !== user.id || role !== 'manager') : []
  const mine = rows.find((r) => r.employee.id === user.id)
  const stage = cycle?.stage ?? 0
  const released = !!cycle?.released

  const columns: Column<ReviewRow>[] = [
    {
      key: 'emp',
      header: 'Employee',
      cell: (r) => <PersonCell name={r.employee.name} sub={`${r.employee.title} · ${department(r.employee.departmentId)?.name ?? ''}`} />,
      sortValue: (r) => r.employee.name,
      className: 'min-w-56',
    },
    { key: 'self', header: 'Self', cell: (r) => <StepBadge s={r.self} />, sortValue: (r) => r.self },
    { key: 'mgr', header: 'Manager', cell: (r) => <StepBadge s={r.manager} />, sortValue: (r) => r.manager },
    { key: 'peer', header: 'Peer', cell: (r) => <StepBadge s={r.peer} />, sortValue: (r) => r.peer },
    {
      key: 'final',
      header: 'Final rating',
      cell: (r) => (r.final ? <span className="font-semibold tabular">{r.final.toFixed(1)}</span> : <span className="text-muted-foreground">—</span>),
      sortValue: (r) => r.final ?? 0,
    },
  ]

  if (reviews.loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading reviews…</p>
  if (!cycle) return <Card className="p-6 text-sm text-muted-foreground">No review cycle has been opened yet.</Card>

  const colleagues = employees.filter((e) => e.id !== user.id && e.status !== 'Exited' && e.employmentType !== 'Consultant' && e.role !== 'ceo')

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title={`${cycle.name} cycle`}
        description={`${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)} · ${released ? 'results released' : `reviews close ${formatDate(cycle.closesOn)} (${daysUntil(cycle.closesOn)} days)`}`}
        action={
          admin && !released ? (
            <Button size="sm" variant={stage === 3 ? 'default' : 'outline'} onClick={() => setConfirm(true)}>
              {stage === 3 ? 'Release results' : `Move to ${CYCLE_STAGES[stage + 1]}`}
            </Button>
          ) : (
            <Badge variant="soft">{CYCLE_STAGES[stage]}</Badge>
          )
        }
      >
        <Stepper steps={CYCLE_STAGES} current={released ? CYCLE_STAGES.length : stage} />
        <div className="mt-3 text-xs text-muted-foreground sm:hidden">Current stage: {CYCLE_STAGES[stage]}</div>
      </Section>

      {!org && mine && (
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">My review</h3>
              <p className="text-sm text-muted-foreground">{released ? 'Your final rating has been released.' : 'Self review · shared with your manager before your 1:1'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Self</span> <StepBadge s={mine.self} />
              <span className="ml-2 text-xs text-muted-foreground">Manager</span> <StepBadge s={mine.manager} />
              {released && mine.final !== undefined && (
                <Badge variant="soft" className="ml-2 tabular">
                  Final {mine.final.toFixed(1)} · {RATING_LABELS[Math.round(mine.final) - 1]}
                </Badge>
              )}
            </div>
          </div>
          <ReviewLoader reviews={reviews} employee={mine.employee} kind="self" fallbackSubmitted={mine.self === 'Submitted'} readOnly={released} />
        </Card>
      )}

      {!org && !mine && <Card className="p-6 text-sm text-muted-foreground">You are not part of this review cycle.</Card>}

      {!released && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <div className="font-medium">Peer feedback</div>
            <div className="text-muted-foreground">Share anonymised feedback with a colleague’s manager.</div>
          </div>
          <SimpleSelect
            value=""
            onValueChange={(id) => setPeerFor(colleagues.find((e) => e.id === id) ?? null)}
            options={colleagues.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="Give feedback to…"
            className="h-9 sm:w-64"
          />
        </Card>
      )}

      {org && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {role === 'manager' ? 'Your direct reports' : 'All employees'} · {visible.filter((r) => r.manager === 'Submitted').length}/{visible.length} manager reviews submitted
            </div>
            <span className="text-xs text-muted-foreground">Click a row to open the review</span>
          </div>
          <DataTable rows={visible} columns={columns} rowKey={(r) => r.employee.id} onRowClick={setSelected} pageSize={12} />
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          {selected && (
            <div className="p-5">
              <div className="pr-8">
                <Badge variant="soft" className="mb-2">
                  Manager review · {cycle.name.replace(' review', '')}
                </Badge>
                <SheetTitle>{selected.employee.name}</SheetTitle>
                <SheetDescription>
                  {selected.employee.title} · {department(selected.employee.departmentId)?.name}
                </SheetDescription>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    Self <StepBadge s={selected.self} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    Peer <StepBadge s={selected.peer} />
                  </span>
                </div>
              </div>
              <div className="mt-6">
                <ReviewLoader
                  reviews={reviews}
                  employee={selected.employee}
                  kind="manager"
                  fallbackSubmitted={selected.manager === 'Submitted'}
                  readOnly={released}
                  showContext
                  calibrate={admin && stage >= 3 && !released ? { current: selected.final } : undefined}
                  onDone={() => setSelected(null)}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!peerFor} onOpenChange={(o) => !o && setPeerFor(null)}>
        <SheetContent className="sm:max-w-xl">
          {peerFor && (
            <div className="p-5">
              <div className="pr-8">
                <Badge variant="soft" className="mb-2">
                  Peer feedback · anonymised
                </Badge>
                <SheetTitle>{peerFor.name}</SheetTitle>
                <SheetDescription>
                  {peerFor.title} · {department(peerFor.departmentId)?.name}
                </SheetDescription>
              </div>
              <div className="mt-6">
                <ReviewLoader reviews={reviews} employee={peerFor} kind="peer" fallbackSubmitted={false} readOnly={false} onDone={() => setPeerFor(null)} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stage === 3 ? 'Release results?' : `Move to ${CYCLE_STAGES[stage + 1]}?`}</DialogTitle>
            <DialogDescription>
              {stage === 3
                ? 'Final ratings are published to every employee and update their profile rating. Reviews lock once released.'
                : 'Everyone in the cycle will see the new stage.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirm(false)
                await reviews.advance()
              }}
            >
              {stage === 3 ? 'Release results' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Loads the stored review (real mode) and renders the form for one reviewer kind. */
function ReviewLoader({
  reviews,
  employee,
  kind,
  fallbackSubmitted,
  readOnly,
  showContext,
  calibrate,
  onDone,
}: {
  reviews: Reviews
  employee: Employee
  kind: ReviewKind
  fallbackSubmitted: boolean
  readOnly: boolean
  showContext?: boolean
  calibrate?: { current?: number }
  onDone?: () => void
}) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [loaded, setLoaded] = useState(USE_MOCK_API)
  const { detail: loadDetail } = reviews

  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    loadDetail(employee.id).then((d) => {
      if (cancelled) return
      setDetail(d)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [employee.id, loadDetail])

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading review…</p>

  const doc = USE_MOCK_API ? mockDoc(employee, fallbackSubmitted) : kind === 'self' ? detail?.self : kind === 'manager' ? detail?.manager : detail?.myPeer
  const canWrite = USE_MOCK_API ? !readOnly : !!detail?.canWrite[kind] && !readOnly
  const peerQuotes = USE_MOCK_API
    ? [PEER_QUOTES[hash(employee.id) % PEER_QUOTES.length]!, PEER_QUOTES[(hash(employee.id) + 2) % PEER_QUOTES.length]!]
    : (detail?.peers ?? []).flatMap((p) => [p.strengths, p.improvements].filter(Boolean))

  return (
    <div className="grid grid-cols-1 gap-6">
      {showContext && !USE_MOCK_API && detail?.self && (
        <div className="rounded-lg border bg-subtle p-3 text-sm">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Self review</span>
            <span className="tabular">{detail.self.overall ? `Overall ${detail.self.overall.toFixed(1)}` : detail.self.status}</span>
          </div>
          {detail.self.strengths && <p>{detail.self.strengths}</p>}
          {detail.self.improvements && <p className="mt-1 text-muted-foreground">{detail.self.improvements}</p>}
        </div>
      )}
      {kind === 'self' && readOnly && detail?.manager && (
        <div className="rounded-lg border bg-subtle p-3 text-sm">
          <div className="mb-1 text-xs text-muted-foreground">Manager review</div>
          {detail.manager.strengths && <p>{detail.manager.strengths}</p>}
          {detail.manager.improvements && <p className="mt-1 text-muted-foreground">{detail.manager.improvements}</p>}
        </div>
      )}
      {canWrite || doc ? (
        <ReviewForm
          key={`${employee.id}-${kind}-${doc?.updatedAt ?? ''}`}
          employee={employee}
          mode={kind}
          initial={doc ?? null}
          readOnly={!canWrite}
          peerQuotes={kind === 'manager' ? peerQuotes : []}
          onSave={async (input) => {
            const res = await reviews.save(employee.id, kind, input)
            if (!res) return false
            if (res !== true) setDetail(res)
            toast.success(
              input.submit ? (kind === 'self' ? 'Self review submitted' : kind === 'peer' ? 'Feedback submitted' : `Review for ${employee.name.split(' ')[0]} submitted`) : 'Draft saved',
              input.submit && kind === 'self' ? { description: 'Your manager has been notified.' } : undefined,
            )
            if (input.submit) onDone?.()
            return true
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{kind === 'manager' ? 'Only this person’s manager or HR can write the manager review.' : 'Nothing to show yet.'}</p>
      )}
      {calibrate && <Calibrate employeeId={employee.id} current={calibrate.current} reviews={reviews} />}
    </div>
  )
}

function Calibrate({ employeeId, current, reviews }: { employeeId: string; current?: number; reviews: Reviews }) {
  const [value, setValue] = useState(current ? current.toFixed(1) : '')
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <Label htmlFor="calibrate">Calibrated final rating</Label>
      <div className="flex gap-2">
        <Input id="calibrate" type="number" min={1} max={5} step={0.1} value={value} onChange={(e) => setValue(e.target.value)} className="w-28 tabular" />
        <Button
          variant="outline"
          onClick={() => {
            const n = Number(value)
            if (!(n >= 1 && n <= 5)) return toast.error('Enter a rating between 1 and 5')
            void reviews.calibrate(employeeId, Math.round(n * 10) / 10)
          }}
        >
          Save rating
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Overrides the manager’s overall rating. Published to the employee’s profile when results are released.</p>
    </div>
  )
}

function ReviewForm({
  employee,
  mode,
  initial,
  readOnly,
  peerQuotes,
  onSave,
}: {
  employee: Employee
  mode: ReviewKind
  initial: ReviewDoc | null
  readOnly: boolean
  peerQuotes: string[]
  onSave: (input: ReviewInput) => Promise<boolean>
}) {
  const [ratings, setRatings] = useState<Record<string, number>>(initial?.ratings ?? {})
  const [strengths, setStrengths] = useState(initial?.strengths ?? '')
  const [improve, setImprove] = useState(initial?.improvements ?? '')
  const [saving, setSaving] = useState(false)
  const rated = COMPETENCIES.filter((c) => ratings[c.key]).length
  const avg = rated ? COMPETENCIES.reduce((s, c) => s + (ratings[c.key] ?? 0), 0) / rated : 0
  const submitted = initial?.status === 'Submitted'

  const save = async (submit: boolean) => {
    if (submit && rated < COMPETENCIES.length) {
      toast.error('Rate every competency', { description: `${COMPETENCIES.length - rated} left to rate.` })
      return
    }
    setSaving(true)
    await onSave({ ratings, strengths: strengths.trim(), improvements: improve.trim(), submit })
    setSaving(false)
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-baseline justify-between">
          <Label>Competencies</Label>
          <span className="text-xs text-muted-foreground tabular">{rated ? `Overall ${avg.toFixed(1)} · ${RATING_LABELS[Math.round(avg) - 1]}` : '1 = unsatisfactory · 5 = exceptional'}</span>
        </div>
        {COMPETENCIES.map((c) => (
          <div key={c.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.hint}</div>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={c.label}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = ratings[c.key] === n
                return (
                  <motion.button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={RATING_LABELS[n - 1]}
                    disabled={readOnly}
                    whileTap={readOnly ? undefined : { scale: 0.9 }}
                    onClick={() => setRatings((r) => ({ ...r, [c.key]: n }))}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors disabled:cursor-default',
                      on ? 'border-primary bg-primary text-white shadow-sm shadow-primary/30' : 'bg-card text-muted-foreground enabled:hover:border-primary/50 enabled:hover:text-foreground',
                    )}
                  >
                    {n}
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`str-${mode}`}>{mode === 'self' ? 'What went well' : 'Strengths'}</Label>
          <Textarea id={`str-${mode}`} value={strengths} readOnly={readOnly} onChange={(e) => setStrengths(e.target.value)} placeholder={mode === 'self' ? 'Wins you are proud of this quarter…' : `Where ${employee.name.split(' ')[0]} made the biggest impact…`} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`imp-${mode}`}>Areas to improve</Label>
          <Textarea id={`imp-${mode}`} value={improve} readOnly={readOnly} onChange={(e) => setImprove(e.target.value)} placeholder="One or two focus areas for next quarter…" />
        </div>
      </div>
      {mode === 'manager' && (
        <div className="grid grid-cols-1 gap-2">
          <Label>Peer feedback</Label>
          {peerQuotes.map((q, i) => (
            <blockquote key={i} className="rounded-lg border border-l-2 border-l-primary bg-subtle p-3 text-sm text-muted-foreground">
              {q}
            </blockquote>
          ))}
          {!peerQuotes.length && <p className="text-sm text-muted-foreground">No peer feedback submitted yet.</p>}
          <span className="text-[11px] text-muted-foreground">Peer feedback is anonymised</span>
        </div>
      )}
      {!readOnly && (
        <div className="flex justify-end gap-2">
          {!submitted && (
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              Save draft
            </Button>
          )}
          <Button onClick={() => save(true)} disabled={saving}>
            {saving ? 'Saving…' : submitted ? 'Update review' : mode === 'self' ? 'Submit self review' : mode === 'peer' ? 'Submit feedback' : 'Submit review'}
          </Button>
        </div>
      )}
    </div>
  )
}
