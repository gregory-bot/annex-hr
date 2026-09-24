import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/api'
import {
  getAutomations,
  runAutomation,
  updateAutomation,
  type AutomationRule,
  type AutomationsView,
  type LogEntry,
  type RuleConfig,
  type RuleKey,
  type RunResult,
} from './automationsApi'

const TZ = 'Africa/Nairobi'
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function when(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function scheduleText(c: RuleConfig) {
  const s = c.schedule
  return s.frequency === 'weekly' ? `Every ${WEEKDAYS[s.weekday]} at ${s.time}` : `Daily at ${s.time}`
}

function daysText(rule: AutomationRule) {
  const c = rule.config
  const list = (c.days ?? []).slice()
  switch (rule.key) {
    case 'probation':
      return `${list
        .sort((a, b) => b - a)
        .map((d) => (d === 0 ? 'on the day' : `${d} days before`))
        .join(', ')} probation ends`
    case 'document_expiry':
      return `${list.sort((a, b) => b - a).join(', ')} days before expiry${c.includeExpired ? ', and once expired' : ''}`
    case 'onboarding_nudges':
      return `Day ${list.sort((a, b) => a - b).join(', ')} after start · HR from day ${c.hrAfterDays}`
    case 'timesheet_approvals':
      return `Pending for more than ${c.olderThanDays} days`
    case 'leave_approvals':
      return `Waiting more than ${c.olderThanDays} days at a stage`
    case 'policy_acknowledgements':
      return `${c.graceDays} days after a new version`
  }
}

/* ------------------------------ config form ------------------------------ */

type NumberField = 'hrAfterDays' | 'olderThanDays' | 'graceDays'

const FIELDS: Record<RuleKey, { days?: { label: string; hint: string }; numbers?: { key: NumberField; label: string }[]; includeExpired?: boolean }> = {
  probation: { days: { label: 'Days before probation ends', hint: 'Comma separated. 0 = on the appraisal day.' } },
  document_expiry: { days: { label: 'Days before a document expires', hint: 'Comma separated, e.g. 90, 60, 30, 7.' }, includeExpired: true },
  onboarding_nudges: { days: { label: 'Days after the start date', hint: 'Comma separated, e.g. 1, 3, 7.' }, numbers: [{ key: 'hrAfterDays', label: 'Also alert HR from day' }] },
  timesheet_approvals: { numbers: [{ key: 'olderThanDays', label: 'Remind when pending for more than (days)' }] },
  leave_approvals: { numbers: [{ key: 'olderThanDays', label: 'Remind when waiting at a stage for more than (days)' }] },
  policy_acknowledgements: { numbers: [{ key: 'graceDays', label: 'Remind this many days after a new version' }] },
}

function ConfigForm({ rule, onSaved, onCancel }: { rule: AutomationRule; onSaved: (r: AutomationRule) => void; onCancel: () => void }) {
  const spec = FIELDS[rule.key]
  const [cfg, setCfg] = useState<RuleConfig>(() => structuredClone(rule.config))
  const [daysDraft, setDaysDraft] = useState((rule.config.days ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const next: RuleConfig = { ...cfg }
    if (spec.days) {
      const parts = daysDraft
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number)
      if (!parts.length || parts.some((n) => !Number.isInteger(n) || n < 0)) {
        toast.error('Enter whole numbers of days, separated by commas')
        return
      }
      next.days = parts
    }
    setSaving(true)
    try {
      const saved = await updateAutomation(rule.key, { config: next })
      onSaved(saved)
      toast.success(`${rule.name} updated`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const setSchedule = (patch: Partial<RuleConfig['schedule']>) => setCfg((c) => ({ ...c, schedule: { ...c.schedule, ...patch } }))

  return (
    <div className="mt-4 grid gap-4 rounded-xl border bg-subtle/40 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Frequency</Label>
          <SimpleSelect
            value={cfg.schedule.frequency}
            onValueChange={(v) => setSchedule({ frequency: v as 'daily' | 'weekly' })}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ]}
          />
        </div>
        {cfg.schedule.frequency === 'weekly' && (
          <div className="grid gap-1.5">
            <Label>Day</Label>
            <SimpleSelect value={String(cfg.schedule.weekday)} onValueChange={(v) => setSchedule({ weekday: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`${rule.key}-time`}>Time (Nairobi)</Label>
          <Input id={`${rule.key}-time`} type="time" value={cfg.schedule.time} onChange={(e) => setSchedule({ time: e.target.value })} />
        </div>
      </div>

      {spec.days && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${rule.key}-days`}>{spec.days.label}</Label>
          <Input id={`${rule.key}-days`} inputMode="numeric" value={daysDraft} onChange={(e) => setDaysDraft(e.target.value)} />
          <p className="text-xs text-muted-foreground">{spec.days.hint}</p>
        </div>
      )}

      {spec.numbers?.map((f) => (
        <div key={f.key} className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor={`${rule.key}-${f.key}`}>{f.label}</Label>
          <Input id={`${rule.key}-${f.key}`} type="number" min={1} value={cfg[f.key] ?? ''} onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))} />
        </div>
      ))}

      {spec.includeExpired && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Remind once more after a document has expired</span>
          <Switch checked={!!cfg.includeExpired} onCheckedChange={(v) => setCfg((c) => ({ ...c, includeExpired: v }))} aria-label="Remind after expiry" />
        </label>
      )}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Send emails as well as in-app notifications</span>
        <Switch checked={cfg.email} onCheckedChange={(v) => setCfg((c) => ({ ...c, email: v }))} aria-label="Send emails" />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setCfg(structuredClone(rule.defaults))} disabled={saving}>
          Reset to defaults
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------- rule card ------------------------------- */

function RuleCard({
  rule,
  onChange,
  onRun,
  running,
}: {
  rule: AutomationRule
  onChange: (r: AutomationRule) => void
  onRun: (rule: AutomationRule, dryRun: boolean) => void
  running: 'dry' | 'real' | null
}) {
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  const toggle = async (enabled: boolean) => {
    const before = rule
    onChange({ ...rule, enabled })
    setToggling(true)
    try {
      onChange(await updateAutomation(rule.key, { enabled }))
      toast.success(`${rule.name} ${enabled ? 'turned on' : 'turned off'}`)
    } catch (err) {
      onChange(before)
      toast.error(errorMessage(err))
    } finally {
      setToggling(false)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight">{rule.name}</h3>
            <Badge variant={rule.enabled ? 'success' : 'muted'}>{rule.enabled ? 'On' : 'Off'}</Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rule.description}</p>
        </div>
        <Switch checked={rule.enabled} onCheckedChange={toggle} disabled={toggling} aria-label={`${rule.enabled ? 'Turn off' : 'Turn on'} ${rule.name}`} className="mt-1" />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Notifies</dt>
          <dd className="min-w-0">{rule.audience}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Schedule</dt>
          <dd className="min-w-0">{scheduleText(rule.config)}</dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="shrink-0 text-muted-foreground">Reminders</dt>
          <dd className="min-w-0">{daysText(rule)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Last run</dt>
          <dd className="min-w-0">
            {when(rule.lastRunAt)}
            {rule.lastRunSummary && <span className="text-muted-foreground"> · {rule.lastRunSummary.reminders} sent</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Next run</dt>
          <dd className="min-w-0">{rule.enabled ? (rule.nextRunAt && new Date(rule.nextRunAt).getTime() <= Date.now() + 60_000 ? 'Within 15 minutes' : when(rule.nextRunAt)) : 'Off'}</dd>
        </div>
      </dl>

      {rule.emailSkipped && rule.config.email && <p className="mt-3 text-xs text-muted-foreground">Emails: {rule.emailSkipped}. In-app notifications are still created.</p>}
      {!rule.config.email && <p className="mt-3 text-xs text-muted-foreground">Emails are off for this reminder — in-app notifications only.</p>}

      {editing ? (
        <ConfigForm
          rule={rule}
          onCancel={() => setEditing(false)}
          onSaved={(r) => {
            onChange(r)
            setEditing(false)
          }}
        />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => onRun(rule, true)} disabled={running !== null}>
            {running === 'dry' ? 'Checking…' : 'Preview (dry run)'}
          </Button>
          <Button variant="soft" size="sm" onClick={() => onRun(rule, false)} disabled={running !== null}>
            {running === 'real' ? 'Running…' : 'Run now'}
          </Button>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------ run results ------------------------------ */

function RunDialog({ result, ruleName, onClose, onConfirm, confirming }: { result: RunResult | null; ruleName: string; onClose: () => void; onConfirm: () => void; confirming: boolean }) {
  const r = result
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {r && (
          <>
            <DialogHeader>
              <DialogTitle>{r.dryRun ? `Preview: ${ruleName}` : `${ruleName} — run complete`}</DialogTitle>
              <DialogDescription>
                {r.reminders.length === 0
                  ? r.alreadySent
                    ? `Nothing new to send — ${r.alreadySent} reminder${r.alreadySent === 1 ? ' was' : 's were'} already sent for these milestones.`
                    : 'Nothing is due right now.'
                  : r.dryRun
                    ? `${r.reminders.length} reminder${r.reminders.length === 1 ? '' : 's'} would be sent now (${r.notifications} in-app notification${r.notifications === 1 ? '' : 's'}, ${r.emails.length} email${r.emails.length === 1 ? '' : 's'}).`
                    : `Sent ${r.reminders.length} reminder${r.reminders.length === 1 ? '' : 's'}: ${r.notifications} in-app notification${r.notifications === 1 ? '' : 's'} and ${r.emailsSent} email${r.emailsSent === 1 ? '' : 's'}.`}
              </DialogDescription>
            </DialogHeader>

            {r.reminders.length > 0 && (
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who {r.dryRun ? 'would be' : 'was'} notified</div>
                <ul className="divide-y rounded-lg border text-sm">
                  {r.reminders.map((x) => (
                    <li key={x.subjectKey} className="px-3 py-2">
                      <div>{x.summary}</div>
                      <div className="text-xs text-muted-foreground">To {x.recipients.join(', ') || 'nobody'}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.emails.length > 0 && (
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Emails ({r.emails.length}){r.emailSkipped ? ' — not sent' : ''}
                </div>
                {r.emailSkipped && <p className="text-xs text-muted-foreground">{r.emailSkipped}.</p>}
                <ul className="divide-y rounded-lg border text-[13px]">
                  {r.emails.map((e, i) => (
                    <li key={`${e.to}-${i}`} className="px-3 py-2">
                      <div className="truncate">{e.name} &lt;{e.to}&gt;</div>
                      <div className="truncate text-xs text-muted-foreground">{e.subject}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {r.dryRun && r.reminders.length > 0 && (
                <Button onClick={onConfirm} disabled={confirming}>
                  {confirming ? 'Sending…' : 'Send these now'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- activity ------------------------------- */

function Activity({ entries, names }: { entries: LogEntry[]; names: Record<string, string> }) {
  const [rule, setRule] = useState('all')
  const shown = rule === 'all' ? entries.slice(0, 20) : entries.filter((e) => e.rule === rule).slice(0, 20)
  return (
    <Section
      title="Recent activity"
      description="The latest reminders sent. Each reminder is sent once per milestone."
      action={<SimpleSelect value={rule} onValueChange={setRule} className="h-9 w-44" options={[{ value: 'all', label: 'All reminders' }, ...Object.entries(names).map(([value, label]) => ({ value, label }))]} />}
    >
      {shown.length === 0 ? (
        <EmptyState title="No reminders yet" description="Sent reminders appear here after the next scheduled run, or when you use Run now." />
      ) : (
        <ul className="divide-y">
          {shown.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="text-sm">{e.summary}</div>
                <div className="text-xs text-muted-foreground">
                  {names[e.rule] ?? e.rule} · to {e.recipients.join(', ') || 'nobody'}
                  {e.emails > 0 && ` · ${e.emails} email${e.emails === 1 ? '' : 's'}`}
                </div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{when(e.sentAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/* --------------------------------- page --------------------------------- */

export function Automations() {
  const [view, setView] = useState<AutomationsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<{ key: RuleKey; mode: 'dry' | 'real' } | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)

  const load = useCallback(async () => {
    try {
      setView(await getAutomations())
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const names = useMemo(() => Object.fromEntries((view?.rules ?? []).map((r) => [r.key, r.name])), [view])
  const activity = useMemo(() => {
    const all = (view?.rules ?? []).flatMap((r) => r.recent)
    return all.sort((a, b) => b.sentAt.localeCompare(a.sentAt) || Number(b.id) - Number(a.id))
  }, [view])

  const replace = (r: AutomationRule) => setView((v) => (v ? { ...v, rules: v.rules.map((x) => (x.key === r.key ? r : x)) } : v))

  const run = async (key: RuleKey, dryRun: boolean) => {
    setRunning({ key, mode: dryRun ? 'dry' : 'real' })
    try {
      const res = await runAutomation(key, dryRun)
      setResult(res)
      if (!dryRun) {
        toast.success(res.reminders.length ? `Sent ${res.reminders.length} reminder${res.reminders.length === 1 ? '' : 's'}` : 'Nothing new to send')
        await load()
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRunning(null)
    }
  }

  if (error && !view)
    return (
      <EmptyState
        title="Couldn't load automations"
        description={error}
        action={
          <Button variant="outline" onClick={load}>
            Try again
          </Button>
        }
      />
    )

  if (!view)
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    )

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Automations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reminders and alerts that run on a schedule (Nairobi time). Each creates in-app notifications for the right people and, where email is on, a branded email.
          {!view.schedulerRunning && ' The scheduler is paused on this server — use Run now to send reminders manually.'}
        </p>
        {view.rules.every((r) => !r.enabled) && (
          <p className="mt-2 rounded-lg border bg-subtle/60 px-3 py-2 text-[13px]">All reminders are off. Preview a rule to see who would be notified before turning it on.</p>
        )}
      </div>

      {view.rules.map((r) => (
        <RuleCard key={r.key} rule={r} onChange={replace} onRun={(rule, dry) => run(rule.key, dry)} running={running?.key === r.key ? running.mode : null} />
      ))}

      <Activity entries={activity} names={names} />

      <RunDialog
        result={result}
        ruleName={result ? (names[result.rule] ?? result.rule) : ''}
        onClose={() => setResult(null)}
        confirming={running?.mode === 'real'}
        onConfirm={() => result && run(result.rule, false)}
      />
    </div>
  )
}
