import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { isAdminLike } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PersonAvatar } from '@/components/ui/avatar'
import { SimpleSelect } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import { Section } from '@/components/shared/Section'
import { cn } from '@/lib/utils'
import { NINE_BOX, flightRisk, perfBucket, readinessOf } from './data'
import { useRemote, type Readiness, type SuccessionPlan } from './api'

const CELL_TONE = ['bg-muted/60', 'bg-accent/50', 'bg-accent', 'bg-primary/15']
const PERF_LABELS = ['Low', 'Medium', 'High']
const READINESS: Readiness[] = ['Ready now', '1–2 years', '3+ years']
const RISKS = ['Low', 'Medium', 'High'] as const
const POTENTIAL_LABELS = ['', 'Low potential', 'Medium potential', 'High potential']

function mockPlans(departments: { id: string; name: string; headId?: string }[], employees: Employee[], people: Employee[]): SuccessionPlan[] {
  const preferred = /Engineering|Finance|People|Credit|Delivery|Clinical|Admin/
  return departments
    .filter((d) => d.headId)
    .sort((a, b) => Number(preferred.test(b.name)) - Number(preferred.test(a.name)))
    .slice(0, 3)
    .flatMap((d) => {
      const head = employees.find((e) => e.id === d.headId)
      if (!head) return []
      const successors = people
        .filter((e) => e.id !== head.id && e.departmentId === d.id)
        .sort((a, b) => b.performance + b.potential * 0.5 - (a.performance + a.potential * 0.5))
        .slice(0, 3)
        .map((e) => ({ employeeId: e.id, readiness: readinessOf(e), flightRisk: flightRisk(e) }))
      return [{ id: `plan-${d.id}`, roleTitle: head.title, departmentId: d.id, incumbentId: head.id, successors, notes: '', updatedAt: '' }]
    })
}

export function SuccessionTab({ people, onSetPotential }: { people: Employee[]; onSetPotential: (employeeId: string, potential: number) => Promise<void> }) {
  const { employees, department, departments, role } = useWorkspace()
  const canPlan = isAdminLike(role)
  const canSetPotential = canPlan && role !== 'ceo'
  const remote = useRemote<SuccessionPlan[]>(canPlan ? '/performance/succession' : null)
  const [mock, setMock] = useState<SuccessionPlan[] | null>(null)
  const plans = USE_MOCK_API ? mock ?? mockPlans(departments, employees, people) : remote.data ?? []
  const [editing, setEditing] = useState<SuccessionPlan | 'new' | null>(null)
  const [potentialFor, setPotentialFor] = useState<Employee | null>(null)
  const byId = useMemo(() => new Map([...employees, ...people].map((e) => [e.id, e])), [employees, people])

  const grid = useMemo(() => {
    const map: Record<string, Employee[]> = {}
    for (const e of people) (map[`${e.potential}-${perfBucket(e.performance)}`] ??= []).push(e)
    return map
  }, [people])

  const setPlans = (fn: (ps: SuccessionPlan[]) => SuccessionPlan[]) => (USE_MOCK_API ? setMock((m) => fn(m ?? plans)) : remote.setData((d) => fn(d ?? [])))

  const savePlan = async (draft: Omit<SuccessionPlan, 'id' | 'updatedAt'> & { id?: string }) => {
    try {
      let saved: SuccessionPlan
      if (USE_MOCK_API) saved = { ...draft, id: draft.id ?? `plan-${Date.now()}`, updatedAt: new Date().toISOString() }
      else saved = draft.id ? await api.patch<SuccessionPlan>(`/performance/succession/${draft.id}`, draft) : await api.post<SuccessionPlan>('/performance/succession', draft)
      setPlans((ps) => (ps.some((p) => p.id === saved.id) ? ps.map((p) => (p.id === saved.id ? saved : p)) : [...ps, saved]))
      toast.success(draft.id ? 'Succession plan updated' : 'Critical role added')
      setEditing(null)
    } catch (err) {
      toast.error('Plan not saved', { description: errorMessage(err) })
    }
  }

  const deletePlan = async (p: SuccessionPlan) => {
    try {
      if (!USE_MOCK_API) await api.delete(`/performance/succession/${p.id}`)
      setPlans((ps) => ps.filter((x) => x.id !== p.id))
      toast.success('Succession plan removed')
    } catch (err) {
      toast.error('Plan not removed', { description: errorMessage(err) })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="Talent matrix" description={`9-box of performance × potential.${canSetPotential ? ' Select a person to set their potential.' : ''}`}>
        <div className="flex gap-2">
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Potential →</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[3, 2, 1].map((pot) =>
                [0, 1, 2].map((perf) => {
                  const key = `${pot}-${perf}`
                  const box = NINE_BOX[key]!
                  const list = grid[key] ?? []
                  const max = 6
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: ((3 - pot) * 3 + perf) * 0.03 }}
                      className={cn('flex min-h-28 flex-col rounded-lg p-2 sm:min-h-32 sm:p-3', CELL_TONE[box.strength])}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold sm:text-xs">{box.label}</div>
                          <div className="hidden truncate text-[11px] text-muted-foreground sm:block">{box.hint}</div>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular">{list.length}</span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-1 pt-2">
                        {list.slice(0, max).map((e) => (
                          <Tip key={e.id} label={`${e.name} · ${e.performance.toFixed(1)} · ${department(e.departmentId)?.name}`}>
                            <button
                              type="button"
                              disabled={!canSetPotential}
                              onClick={() => setPotentialFor(e)}
                              aria-label={canSetPotential ? `Set potential for ${e.name}` : e.name}
                              className="inline-flex rounded-full ring-2 ring-card disabled:cursor-default"
                            >
                              <PersonAvatar name={e.name} className="size-6 text-[9px] sm:size-7 sm:text-[10px]" />
                            </button>
                          </Tip>
                        ))}
                        {list.length > max && (
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-card text-[10px] font-semibold text-muted-foreground sm:size-7">+{list.length - max}</span>
                        )}
                      </div>
                    </motion.div>
                  )
                }),
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-muted-foreground">
              {PERF_LABELS.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="mt-0.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Performance →</div>
          </div>
        </div>
      </Section>

      {canPlan ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">Critical roles · {plans.length} succession plans</div>
            <Button size="sm" onClick={() => setEditing('new')}>
              Add critical role
            </Button>
          </div>
          {!USE_MOCK_API && remote.loading && !remote.data && <p className="text-sm text-muted-foreground">Loading succession plans…</p>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {plans.map((plan, i) => {
              const incumbent = plan.incumbentId ? byId.get(plan.incumbentId) : undefined
              const covered = plan.successors.some((s) => s.readiness === 'Ready now')
              return (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{plan.roleTitle}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Incumbent: {incumbent?.name ?? 'Vacant'}
                          {plan.departmentId ? ` · ${department(plan.departmentId)?.name ?? ''}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={covered ? 'success' : 'warning'} dot>
                          {covered ? 'Covered' : 'Gap'}
                        </Badge>
                        <Tip label="Edit plan">
                          <Button size="icon-sm" variant="ghost" aria-label="Edit plan" onClick={() => setEditing(plan)}>
                            <Pencil className="size-3.5" />
                          </Button>
                        </Tip>
                        <Tip label="Remove plan">
                          <Button size="icon-sm" variant="ghost" aria-label="Remove plan" onClick={() => deletePlan(plan)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </Tip>
                      </div>
                    </div>
                    <ul className="mt-4 grid grid-cols-1 gap-2">
                      {plan.successors.map((s, k) => {
                        const e = byId.get(s.employeeId)
                        if (!e) return null
                        return (
                          <li key={s.employeeId} className="flex items-center gap-3 rounded-lg border p-2.5">
                            <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{k + 1}</span>
                            <PersonAvatar name={e.name} className="size-8" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{e.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {e.title} · {e.performance.toFixed(1)}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge variant={s.readiness === 'Ready now' ? 'success' : s.readiness === '1–2 years' ? 'info' : 'muted'}>{s.readiness}</Badge>
                              <span className={cn('inline-flex items-center gap-1 text-[11px]', s.flightRisk === 'High' ? 'text-danger' : s.flightRisk === 'Medium' ? 'text-warning' : 'text-muted-foreground')}>
                                {s.flightRisk !== 'Low' && <span className="size-1.5 rounded-full bg-current" />}
                                {s.flightRisk} flight risk
                              </span>
                            </div>
                          </li>
                        )
                      })}
                      {!plan.successors.length && <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No internal successor identified — consider external pipeline.</li>}
                    </ul>
                    {plan.notes && <p className="mt-3 text-xs text-muted-foreground">{plan.notes}</p>}
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">Succession plans are managed by HR and the CEO.</Card>
      )}

      <PlanDialog
        key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
        plan={editing}
        onClose={() => setEditing(null)}
        onSave={savePlan}
        people={people}
        employees={employees.filter((e) => e.status !== 'Exited')}
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      />

      <Dialog open={!!potentialFor} onOpenChange={(o) => !o && setPotentialFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potential · {potentialFor?.name}</DialogTitle>
            <DialogDescription>Performance {potentialFor?.performance.toFixed(1)} comes from the last released review. Potential is set by HR at calibration.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((p) => (
              <Button
                key={p}
                variant={potentialFor?.potential === p ? 'default' : 'outline'}
                onClick={async () => {
                  if (!potentialFor) return
                  await onSetPotential(potentialFor.id, p)
                  setPotentialFor(null)
                }}
              >
                {POTENTIAL_LABELS[p]!.replace(' potential', '')}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type SuccessorDraft = SuccessionPlan['successors'][number]

function PlanDialog({
  plan,
  onClose,
  onSave,
  people,
  employees,
  departments,
}: {
  plan: SuccessionPlan | 'new' | null
  onClose: () => void
  onSave: (p: Omit<SuccessionPlan, 'id' | 'updatedAt'> & { id?: string }) => Promise<void>
  people: Employee[]
  employees: Employee[]
  departments: { value: string; label: string }[]
}) {
  const existing = plan && plan !== 'new' ? plan : null
  const [roleTitle, setRoleTitle] = useState(existing?.roleTitle ?? '')
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? '')
  const [incumbentId, setIncumbentId] = useState(existing?.incumbentId ?? '')
  const [successors, setSuccessors] = useState<SuccessorDraft[]>(existing?.successors ?? [])
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const options = (exclude: string[]) => people.filter((e) => !exclude.includes(e.id)).map((e) => ({ value: e.id, label: e.name }))

  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit succession plan' : 'Add critical role'}</DialogTitle>
          <DialogDescription>Name the role, its incumbent and up to three ranked successors.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="plan-role">Critical role</Label>
              <Input id="plan-role" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Head of Engineering" />
            </div>
            <div className="grid gap-2">
              <Label>Department</Label>
              <SimpleSelect value={departmentId} onValueChange={setDepartmentId} options={departments} placeholder="Select department" />
            </div>
            <div className="grid gap-2">
              <Label>Incumbent</Label>
              <SimpleSelect value={incumbentId} onValueChange={setIncumbentId} options={employees.map((e) => ({ value: e.id, label: e.name }))} placeholder="Select incumbent" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Successors</Label>
            {successors.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_8.5rem_7rem_auto]">
                <SimpleSelect value={s.employeeId} onValueChange={(v) => setSuccessors((ss) => ss.map((x, j) => (j === i ? { ...x, employeeId: v } : x)))} options={options([incumbentId, ...successors.filter((_, j) => j !== i).map((x) => x.employeeId)])} className="col-span-1" />
                <Tip label="Remove successor">
                  <Button size="icon-sm" variant="ghost" aria-label="Remove successor" className="sm:order-last" onClick={() => setSuccessors((ss) => ss.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </Button>
                </Tip>
                <SimpleSelect value={s.readiness} onValueChange={(v) => setSuccessors((ss) => ss.map((x, j) => (j === i ? { ...x, readiness: v as Readiness } : x)))} options={READINESS} />
                <SimpleSelect value={s.flightRisk} onValueChange={(v) => setSuccessors((ss) => ss.map((x, j) => (j === i ? { ...x, flightRisk: v as SuccessorDraft['flightRisk'] } : x)))} options={RISKS.map((r) => ({ value: r, label: `${r} risk` }))} />
              </div>
            ))}
            {successors.length < 3 && (
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-start"
                onClick={() => {
                  const first = options([incumbentId, ...successors.map((x) => x.employeeId)])[0]
                  if (!first) return toast.error('No more people to add')
                  setSuccessors((ss) => [...ss, { employeeId: first.value, readiness: '1–2 years', flightRisk: 'Low' }])
                }}
              >
                Add successor
              </Button>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-notes">Notes</Label>
            <Input id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Development actions, timelines…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!roleTitle.trim()) return toast.error('Name the critical role')
              setSaving(true)
              await onSave({ id: existing?.id, roleTitle: roleTitle.trim(), departmentId: departmentId || null, incumbentId: incumbentId || null, successors, notes: notes.trim() })
              setSaving(false)
            }}
          >
            {saving ? 'Saving…' : 'Save plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
