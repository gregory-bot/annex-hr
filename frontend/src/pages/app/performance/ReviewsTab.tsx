import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { Section } from '@/components/shared/Section'
import { Stepper } from '@/components/shared/Stepper'
import { cn, daysUntil } from '@/lib/utils'
import { COMPETENCIES, CYCLE_STAGES, PEER_QUOTES, RATING_LABELS, hash, type ReviewRow, type StepStatus } from './data'

const statusVariant: Record<StepStatus, 'success' | 'warning' | 'muted'> = { Submitted: 'success', 'In Progress': 'warning', 'Not started': 'muted' }

function StepBadge({ s }: { s: StepStatus }) {
  return (
    <Badge variant={statusVariant[s]} dot>
      {s}
    </Badge>
  )
}

export function ReviewsTab({
  org,
  reviews,
  onSubmit,
}: {
  org: boolean
  reviews: ReviewRow[]
  onSubmit: (employeeId: string, mode: 'self' | 'manager', rating: number) => void
}) {
  const { user, department, role } = useWorkspace()
  const [selected, setSelected] = useState<ReviewRow | null>(null)
  const visible = org ? (role === 'manager' ? reviews.filter((r) => r.employee.managerId === user.id) : reviews) : []
  const mine = reviews.find((r) => r.employee.id === user.id)

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

  const stage = 1

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title="Q3 2026 review cycle"
        description={`1 Jul – 30 Sep · reviews close 10 Oct (${daysUntil('2026-10-10')} days)`}
        action={
          <Badge variant="soft">
            {CYCLE_STAGES[stage]}
          </Badge>
        }
      >
        <Stepper steps={CYCLE_STAGES} current={stage} />
        <div className="mt-3 text-xs text-muted-foreground sm:hidden">Current stage: {CYCLE_STAGES[stage]}</div>
      </Section>

      {!org && mine && (
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">My review</h3>
              <p className="text-sm text-muted-foreground">Self review · shared with your manager before your Q3 1:1</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground">Self</span> <StepBadge s={mine.self} />
              <span className="ml-2 text-xs text-muted-foreground">Manager</span> <StepBadge s={mine.manager} />
            </div>
          </div>
          <ReviewForm key={mine.employee.id} employee={mine.employee} mode="self" onDone={(r) => onSubmit(mine.employee.id, 'self', r)} submitted={mine.self === 'Submitted'} />
        </Card>
      )}

      {org && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {role === 'manager' ? 'Your direct reports' : 'All employees'} · {visible.filter((r) => r.manager === 'Submitted').length}/{visible.length} manager reviews submitted
            </div>
            <span className="text-xs text-muted-foreground">Click a row to write the manager review</span>
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
                  Manager review · Q3 2026
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
                <ReviewForm
                  key={selected.employee.id}
                  employee={selected.employee}
                  mode="manager"
                  submitted={selected.manager === 'Submitted'}
                  onDone={(r) => {
                    onSubmit(selected.employee.id, 'manager', r)
                    setSelected(null)
                  }}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ReviewForm({ employee, mode, onDone, submitted }: { employee: Employee; mode: 'self' | 'manager'; onDone: (rating: number) => void; submitted: boolean }) {
  const seed = hash(employee.id)
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    submitted ? Object.fromEntries(COMPETENCIES.map((c, i) => [c.key, Math.max(1, Math.min(5, Math.round(employee.performance + (((seed >> i) % 3) - 1) * 0.4)))])) : {},
  )
  const [strengths, setStrengths] = useState(submitted ? 'Consistently delivered the quarter’s priorities and supported teammates through the Q3 launch.' : '')
  const [improve, setImprove] = useState(submitted ? 'Delegate earlier and share context more widely in planning.' : '')
  const rated = COMPETENCIES.filter((c) => ratings[c.key]).length
  const avg = rated ? COMPETENCIES.reduce((s, c) => s + (ratings[c.key] ?? 0), 0) / rated : 0
  const quotes = [PEER_QUOTES[seed % PEER_QUOTES.length]!, PEER_QUOTES[(seed + 2) % PEER_QUOTES.length]!]

  const submit = () => {
    if (rated < COMPETENCIES.length) {
      toast.error('Rate every competency', { description: `${COMPETENCIES.length - rated} left to rate.` })
      return
    }
    toast.success(mode === 'self' ? 'Self review submitted' : `Review for ${employee.name.split(' ')[0]} submitted`, {
      description: mode === 'self' ? 'Your manager has been notified.' : `Overall ${avg.toFixed(1)} · goes to calibration on 3 Oct.`,
    })
    onDone(Math.round(avg * 10) / 10)
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
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setRatings((r) => ({ ...r, [c.key]: n }))}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                      on ? 'border-primary bg-primary text-white shadow-sm shadow-primary/30' : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
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
          <Textarea id={`str-${mode}`} value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder={mode === 'self' ? 'Wins you are proud of this quarter…' : 'Where they made the biggest impact…'} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={`imp-${mode}`}>Areas to improve</Label>
          <Textarea id={`imp-${mode}`} value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="One or two focus areas for next quarter…" />
        </div>
      </div>
      {mode === 'manager' && (
        <div className="grid grid-cols-1 gap-2">
          <Label>Peer feedback</Label>
          {quotes.map((q, i) => (
            <blockquote key={i} className="rounded-lg border border-l-2 border-l-primary bg-subtle p-3 text-sm text-muted-foreground">
              {q}
            </blockquote>
          ))}
          <span className="text-[11px] text-muted-foreground">
            Peer feedback is anonymised
          </span>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={submit}>
          {submitted ? 'Update review' : mode === 'self' ? 'Submit self review' : 'Submit review'}
        </Button>
      </div>
    </div>
  )
}
