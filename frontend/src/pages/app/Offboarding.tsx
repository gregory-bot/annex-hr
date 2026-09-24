import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { useWorkspace } from '@/context/auth'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { OffboardingDetail } from './offboarding/OffboardingDetail'
import { StartOffboardingDialog } from './offboarding/StartOffboardingDialog'
import { WORKFLOW, allAssetsReturned, type ExitItem } from './offboarding/helpers'
import { useOffboardings } from './offboarding/useOffboardings'
import { errorMessage } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

function countdownText(lastDay: string) {
  const d = daysUntil(lastDay)
  return d > 0 ? `${d} day${d === 1 ? '' : 's'} remaining` : d === 0 ? 'Last day today' : 'Exited'
}

function Countdown({ r }: { r: ExitItem }) {
  const d = daysUntil(r.lastDay)
  if (d < 0)
    return (
      <div className="flex size-16 flex-col items-center justify-center rounded-full bg-muted text-center">
        <span className="text-[10px] font-medium text-muted-foreground">Exited</span>
      </div>
    )
  if (d === 0)
    return (
      <div className="flex size-16 flex-col items-center justify-center rounded-full bg-accent text-center text-primary">
        <span className="text-[10px] font-semibold leading-tight">Last day today</span>
      </div>
    )
  const pct = r.noticeDays > 0 ? (d / r.noticeDays) * 100 : 0
  return (
    <ProgressRing
      value={pct}
      size={64}
      tone={d <= 7 ? 'warning' : 'primary'}
      label={
        <span className="flex flex-col items-center leading-none">
          <span className="text-base font-bold">{d}</span>
          <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">days left</span>
        </span>
      }
    />
  )
}

function Chip({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', done ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
      <span className={cn('size-1.5 rounded-full', done ? 'bg-success' : 'bg-muted-foreground/50')} />
      {label}
    </span>
  )
}

export default function Offboarding() {
  const { offboardings, employees, employee, workspace, role, user } = useWorkspace()
  const prefix = workspace.logoText || workspace.slug.slice(0, 3).toUpperCase()
  const exits = useOffboardings({ seed: offboardings, employee, me: user, role, prefix })
  const list = exits.items
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [params] = useSearchParams()
  const preselect = params.get('employee') ?? ''
  const [startOpen, setStartOpen] = useState(() => !!preselect)

  const selectedEmp = employee(exits.detail?.employeeId)

  const active = list.filter((r) => daysUntil(r.lastDay) >= 0 && r.stage < 6)
  const remaining = active.map((r) => daysUntil(r.lastDay))
  const avgRemaining = remaining.length ? Math.round(remaining.reduce((a, b) => a + b, 0) / remaining.length) : 0
  const outstandingAssets = list.reduce((s, r) => s + r.assets.filter((a) => !a.returned).length, 0)
  const interviewPct = list.length ? Math.round((list.filter((r) => r.exitInterview).length / list.length) * 100) : 0

  const stageCounts = useMemo(() => WORKFLOW.map((_, i) => list.filter((r) => r.stage === i).length), [list])

  const openExit = (id: string) => {
    setSelectedId(id)
    exits.open(id).catch((err) => {
      toast.error('Could not open the exit record', { description: errorMessage(err) })
      setSelectedId(null)
    })
  }

  const taken = new Set(list.filter((r) => r.stage < 6).map((r) => r.employeeId))
  const eligible = employees.filter((e) => !taken.has(e.id) && e.status !== 'Exited' && e.role !== 'ceo')
  const canStart = ['super_admin', 'company_admin', 'hr_officer', 'manager'].includes(role)

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Governance"
        title="Exit & offboarding"
        description={
          role === 'finance'
            ? 'Final dues, asset recovery and clearance for every departing employee.'
            : 'Resignations, notice periods, clearance and final settlement — one workflow, no loose ends.'
        }
        actions={canStart ? <Button onClick={() => setStartOpen(true)}>Start offboarding</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Active exits" value={active.length} tone="primary" index={0} hint={`${list.length} in pipeline`} />
        <StatCard label="Avg notice remaining" value={avgRemaining} format={(n) => `${Math.round(n)} days`} index={1} />
        <StatCard label="Assets outstanding" value={outstandingAssets} tone="warning" index={2} hint="Laptops, cards & access" />
        <StatCard label="Exit interviews" value={interviewPct} format={(n) => `${Math.round(n)}%`} tone="success" index={3} hint="Completed" />
      </div>

      <Section title="Resignation workflow" description="Where each departing employee sits today.">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {WORKFLOW.map((s, i) => (
            <motion.li
              key={s}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn('rounded-lg border p-3', stageCounts[i]! > 0 ? 'border-primary/30 bg-accent/40' : 'bg-subtle')}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="tabular">{i + 1}</span>
                <span className="truncate">{s}</span>
              </div>
              <div className="mt-1 text-xl font-semibold tabular">{stageCounts[i]}</div>
            </motion.li>
          ))}
        </ol>
      </Section>

      {exits.error ? (
        <EmptyState title="Offboarding is unavailable" description={exits.error} />
      ) : exits.loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No active exits" description="When someone resigns, start their offboarding here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r, i) => {
            const pct = r.progress
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => openExit(r.id)}
                  onKeyDown={(e) => e.key === 'Enter' && openExit(r.id)}
                  className="grid grid-cols-1 cursor-pointer gap-4 p-4 transition-colors hover:border-primary/30 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid grid-cols-1 min-w-0 gap-2">
                      <PersonCell name={r.employeeName} sub={r.employeeTitle} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={r.reason === 'Termination' ? 'danger' : 'soft'}>{r.reason}</Badge>
                      </div>
                    </div>
                    <Countdown r={r} />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {r.stageLabel} · last day {formatDate(r.lastDay, 'short')}
                      </span>
                      <span className="font-semibold tabular">{pct}%</span>
                    </div>
                    <Progress value={pct} tone={pct === 100 ? 'success' : 'primary'} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip done={r.handover} label="Handover" />
                    <Chip done={allAssetsReturned(r)} label="Assets" />
                    <Chip done={r.exitInterview} label="Exit interview" />
                    {r.settlementStatus !== null && <Chip done={r.settlementStatus === 'Approved'} label="Final dues" />}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <OffboardingDetail
        record={exits.detail && exits.detail.id === selectedId ? exits.detail : null}
        successors={employees.filter((e) => selectedEmp && e.id !== selectedEmp.id && e.departmentId === selectedEmp.departmentId && e.status !== 'Exited' && e.status !== 'Notice Period')}
        role={role}
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null)
            exits.close()
          }
        }}
        api={exits}
        countdown={exits.detail ? countdownText(exits.detail.lastDay) : ''}
      />

      <StartOffboardingDialog
        initialEmployeeId={preselect}
        open={startOpen}
        onOpenChange={setStartOpen}
        employees={eligible}
        onCreate={async (o, letter) => {
          const created = await exits.create(o, letter)
          setStartOpen(false)
          toast.success(`Offboarding started for ${created.employeeName}`, { description: `Last working day ${formatDate(o.lastDay)}${letter ? ` · ${letter.name} attached` : ''}.` })
        }}
      />
    </div>
  )
}
