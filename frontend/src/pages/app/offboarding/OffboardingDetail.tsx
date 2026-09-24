import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PersonAvatar } from '@/components/ui/avatar'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { FileUploader } from '@/components/shared/FileUploader'
import { ProgressRing } from '@/components/shared/ProgressRing'
import type { Employee, Role } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { TODAY, cn, formatDate, formatKES } from '@/lib/utils'
import { WorkflowSteps } from './StartOffboardingDialog'
import { ExitInterview } from './ExitInterview'
import { Settlement } from './Settlement'
import { CHECKLIST, completion, outstandingValue, stageOf, type Condition, type ExitRecord } from './helpers'

const GROUPS = ['HR', 'IT', 'Finance', 'Manager'] as const
const CONDITIONS: Condition[] = ['Good', 'Fair', 'Damaged', 'Lost']

export function OffboardingDetail({
  record,
  emp,
  successors,
  role,
  open,
  onOpenChange,
  onUpdate,
  countdown,
}: {
  record?: ExitRecord
  emp?: Employee
  successors: Employee[]
  role: Role
  open: boolean
  onOpenChange: (o: boolean) => void
  onUpdate: (r: ExitRecord) => void
  countdown: React.ReactNode
}) {
  if (!record) return null
  const r = record
  const pct = completion(r)
  const outstanding = outstandingValue(r)
  const canSeeSettlement = isAdminLike(role) || role === 'finance'
  const name = emp?.name ?? 'Employee'

  const toggleCheck = (id: string, v: boolean) => {
    onUpdate({ ...r, checklist: { ...r.checklist, [id]: v }, handover: id === 'mgr-handover' ? v : r.handover })
    if (v) toast.success(`${CHECKLIST.find((c) => c.id === id)?.label ?? 'Task'} — done`)
  }

  const updateAsset = (key: string, patch: Partial<ExitRecord['assetItems'][number]>) =>
    onUpdate({ ...r, assetItems: r.assetItems.map((a) => (a.key === key ? { ...a, ...patch } : a)) })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <div className="border-b p-5 pr-12 sm:p-6 sm:pr-14">
          <div className="flex items-center gap-3">
            <PersonAvatar name={name} className="size-11" />
            <div className="min-w-0">
              <SheetTitle className="truncate">{name}</SheetTitle>
              <SheetDescription className="truncate">
                {emp?.title} · {r.reason} · last day {formatDate(r.lastDay)}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-xl border bg-subtle p-4">
            <ProgressRing value={pct} size={64} tone={pct === 100 ? 'success' : 'primary'} label={<AnimatedNumber value={pct} format={(n) => `${Math.round(n)}%`} />} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">Offboarding completion</span>
                <span className="text-xs text-muted-foreground">{countdown}</span>
              </div>
              <Progress value={pct} tone={pct === 100 ? 'success' : 'primary'} className="mt-2" />
              <WorkflowSteps current={stageOf(r)} className="mt-3 hidden sm:grid" />
            </div>
          </div>
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
              {GROUPS.map((g, gi) => {
                const items = CHECKLIST.filter((c) => c.group === g)
                const done = items.filter((c) => r.checklist[c.id]).length
                return (
                  <motion.div key={g} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }} className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <span className="text-sm font-semibold">{g}</span>
                      <Badge variant={done === items.length ? 'success' : 'muted'}>
                        {done}/{items.length}
                      </Badge>
                    </div>
                    <ul className="divide-y">
                      {items.map((c) => {
                        const checked = !!r.checklist[c.id]
                        return (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/40">
                              <Checkbox checked={checked} onCheckedChange={(v) => toggleCheck(c.id, v === true)} />
                              <motion.span animate={{ opacity: checked ? 0.6 : 1 }} className={cn('text-sm', checked && 'line-through')}>
                                {c.label}
                              </motion.span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </motion.div>
                )
              })}
            </TabsContent>

            <TabsContent value="handover" className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-2">
                <Label>Successor</Label>
                <SimpleSelect
                  value={r.successorId}
                  onValueChange={(v) => {
                    onUpdate({ ...r, successorId: v })
                    toast.success(`Successor set: ${successors.find((s) => s.id === v)?.name ?? ''}`)
                  }}
                  options={successors.map((s) => ({ value: s.id, label: `${s.name} · ${s.title}` }))}
                  placeholder="Who takes over this role?"
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="handover-notes">Handover notes</Label>
                <Textarea
                  id="handover-notes"
                  value={r.handoverNotes}
                  onChange={(e) => onUpdate({ ...r, handoverNotes: e.target.value })}
                  placeholder="Open work, key contacts, recurring deadlines, where things live…"
                  className="min-h-[120px]"
                />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>Knowledge transfer upload</Label>
                <FileUploader
                  compact
                  label="Upload SOPs, runbooks or recordings"
                  hint="Shared with the successor and line manager"
                  onComplete={(files) => {
                    onUpdate({ ...r, handoverDocs: [...r.handoverDocs, ...files.map((f) => ({ ...f, uploaded: TODAY }))] })
                    toast.success(`${files.length} handover document${files.length > 1 ? 's' : ''} added`)
                  }}
                />
              </div>
              <ul className="divide-y rounded-xl border">
                {r.handoverDocs.map((d, i) => (
                  <motion.li key={d.name + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3">
                    <span className="w-9 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {d.name.includes('.') ? d.name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.size} · {formatDate(d.uploaded)}
                      </div>
                    </div>
                  </motion.li>
                ))}
                {r.handoverDocs.length === 0 && <li className="p-4 text-sm text-muted-foreground">No handover documents yet.</li>}
              </ul>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    onUpdate({ ...r, handover: true, checklist: { ...r.checklist, 'mgr-handover': true } })
                    toast.success('Handover signed off', { description: 'Manager checklist item completed.' })
                  }}
                  disabled={!!r.checklist['mgr-handover']}
                >
                  {r.checklist['mgr-handover'] ? 'Handover signed off' : 'Save & sign off handover'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="assets" className="grid grid-cols-1 gap-3">
              {outstanding > 0 ? (
                <motion.div layout className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
                  <span className="font-semibold">{formatKES(outstanding)} outstanding.</span>{' '}
                  <span className="text-muted-foreground">Unreturned or damaged property will be recovered from final dues.</span>
                </motion.div>
              ) : (
                <div className="rounded-xl border bg-success-soft p-3 text-sm font-medium text-success">All company property recovered.</div>
              )}
              <ul className="grid grid-cols-1 gap-2">
                {r.assetItems.map((a, i) => {
                  return (
                    <motion.li
                      key={a.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn('grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center', a.returned && 'bg-subtle')}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span aria-label={a.returned ? 'Returned' : 'Outstanding'} className={cn('size-2 shrink-0 rounded-full', a.returned ? 'bg-success' : 'bg-warning')} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{a.name}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {a.tag}
                            {a.valueKES > 0 && ` · ${formatKES(a.valueKES)}`}
                          </div>
                        </div>
                      </div>
                      <SimpleSelect value={a.condition} onValueChange={(v) => updateAsset(a.key, { condition: v as Condition })} options={CONDITIONS} className="h-9 sm:w-32" />
                      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:justify-start">
                        {a.valueKES > 0 ? 'Returned' : 'Revoked'}
                        <Switch
                          checked={a.returned}
                          onCheckedChange={(v) => {
                            updateAsset(a.key, { returned: v })
                            if (v) toast.success(`${a.name} ${a.valueKES > 0 ? 'returned' : 'access revoked'}`)
                          }}
                        />
                      </label>
                    </motion.li>
                  )
                })}
              </ul>
            </TabsContent>

            <TabsContent value="interview">
              <ExitInterview key={r.id} name={name} done={r.exitInterview} onSubmit={() => onUpdate({ ...r, exitInterview: true })} />
            </TabsContent>

            <TabsContent value="settlement">
              {canSeeSettlement ? (
                <Settlement record={r} emp={emp} role={role} onApprove={(approvals) => onUpdate({ ...r, settlementApprovals: approvals, stage: Math.max(r.stage, 5) })} />
              ) : (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed bg-muted/40 p-8 text-center">
                  <div className="text-sm font-medium">Restricted to HR, Finance and the CEO</div>
                  <p className="text-xs text-muted-foreground">Final dues contain salary information.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
