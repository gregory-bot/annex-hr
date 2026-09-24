import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Employee, Timesheet } from '@/data/types'
import { useWorkspace } from '@/context/auth'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { isLeader } from '@/lib/rbac'
import { cn, daysUntil, formatKES } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { WeekGrid } from './timesheets/WeekGrid'
import { CURRENT_WEEK, WEEKLY_CAPACITY, fmtH, rowTotal, sheetBillable, sheetTotal, shiftWeek, weekLabel } from './timesheets/utils'

const cursorFill = { fill: 'var(--muted)', opacity: 0.6 }
const inSeptember = (week: string) => week >= '2026-09-01' && week <= '2026-09-30'

/** A timesheet as the API returns it: the shared shape plus review details. */
type Sheet = Timesheet & { comment?: string | null; submittedAt?: string | null; decidedAt?: string | null; lastRemindedAt?: string | null }
type SetSheets = React.Dispatch<React.SetStateAction<Sheet[]>>

const daysSince = (isoTs: string) => Math.floor((Date.now() - new Date(isoTs).getTime()) / 86_400_000)

export default function Timesheets() {
  const ws = useWorkspace()
  const { role, user } = ws
  const [sheets, setSheets] = useState<Sheet[]>(ws.timesheets)
  const approver = isLeader(role) || role === 'finance'

  // Live mode: the server's list (with submission and reminder times) replaces the bootstrap copy.
  useEffect(() => {
    if (USE_MOCK_API) return
    let live = true
    api
      .get<Sheet[]>(approver ? '/timesheets' : '/timesheets?mine=true')
      .then((list) => live && setSheets(list))
      .catch((err) => live && toast.error('Could not load timesheets', { description: errorMessage(err) }))
    return () => {
      live = false
    }
  }, [approver])

  return (
    <div>
      <PageHeader
        eyebrow="Money & Time"
        title={approver ? 'Consultant timesheets' : 'My timesheet'}
        description={approver ? 'Review consultant hours, approve timesheets and track billable utilisation.' : 'Log hours against projects each week and submit for approval.'}
        actions={approver ? <ExportMenu filename="timesheets-september-2026" /> : undefined}
      />
      {approver ? <ApproverView sheets={sheets} setSheets={setSheets} employee={ws.employee} /> : <ConsultantView sheets={sheets} setSheets={setSheets} user={user} />}
    </div>
  )
}

/* ------------------------------------------------------------------ Consultant */

function ConsultantView({ sheets, setSheets, user }: { sheets: Sheet[]; setSheets: SetSheets; user: Employee }) {
  const [week, setWeek] = useState(CURRENT_WEEK)
  const [newProject, setNewProject] = useState('')
  const [saving, setSaving] = useState(false)
  const mine = sheets.filter((s) => s.employeeId === user.id)
  const latest = [...mine].sort((a, b) => b.week.localeCompare(a.week))[0]
  const rate = latest?.rate ?? 3500

  const existing = mine.find((s) => s.week === week)
  const sheet: Sheet = existing ?? {
    id: `ts-${user.id}-${week}`,
    employeeId: user.id,
    week,
    rate,
    status: 'Draft',
    entries: (latest?.entries ?? [{ project: 'Client project', billable: true, hours: [] }]).map((e) => ({ project: e.project, billable: e.billable, hours: [0, 0, 0, 0, 0, 0, 0] })),
  }
  const editable = sheet.status === 'Draft' || sheet.status === 'Rejected'

  const update = (fn: (t: Sheet) => Sheet) =>
    setSheets((prev) => {
      const has = prev.some((s) => s.id === sheet.id)
      return has ? prev.map((s) => (s.id === sheet.id ? fn(s) : s)) : [...prev, fn(sheet)]
    })

  const setHours = (row: number, day: number, v: number) =>
    update((t) => ({ ...t, entries: t.entries.map((e, i) => (i === row ? { ...e, hours: e.hours.map((h, d) => (d === day ? v : h)) } : e)) }))
  const setBillable = (row: number, v: boolean) => update((t) => ({ ...t, entries: t.entries.map((e, i) => (i === row ? { ...e, billable: v } : e)) }))
  const removeRow = (row: number) => update((t) => ({ ...t, entries: t.entries.filter((_, i) => i !== row) }))
  const addRow = () => {
    const name = newProject.trim()
    if (!name) return
    if (sheet.entries.some((e) => e.project.toLowerCase() === name.toLowerCase())) {
      toast.error(`${name} is already on this timesheet`)
      return
    }
    update((t) => ({ ...t, entries: [...t.entries, { project: name, billable: true, hours: [0, 0, 0, 0, 0, 0, 0] }] }))
    setNewProject('')
    toast.success(`Added ${name}`)
  }

  const total = sheetTotal(sheet)
  const billable = sheetBillable(sheet)

  /** Replaces the local copy of this week with the server's version. */
  const adopt = (saved: Sheet) => setSheets((prev) => [...prev.filter((s) => !(s.employeeId === user.id && s.week === saved.week) && s.id !== saved.id), saved])

  const save = async (andSubmit: boolean) => {
    const entries = sheet.entries.filter((e) => e.project.trim()).map((e) => ({ project: e.project, billable: e.billable, hours: Array.from({ length: 7 }, (_, i) => Number(e.hours[i]) || 0) }))
    if (USE_MOCK_API) {
      update((t) => ({ ...t, status: andSubmit ? 'Pending' : 'Draft' }))
    } else {
      setSaving(true)
      try {
        let saved = await api.put<Sheet>(`/timesheets/week/${week}`, { entries, rate })
        if (andSubmit) saved = await api.post<Sheet>(`/timesheets/${saved.id}/submit`)
        adopt(saved)
      } catch (err) {
        toast.error(andSubmit ? 'Timesheet not submitted' : 'Draft not saved', { description: errorMessage(err) })
        return
      } finally {
        setSaving(false)
      }
    }
    if (andSubmit) toast.success('Timesheet submitted for approval', { description: `${fmtH(total)} h · ${formatKES(billable * rate)} billable` })
    else toast.success('Draft saved', { description: `${fmtH(total)} hours for ${weekLabel(week)}` })
  }

  // Monthly summary (September 2026)
  const month = useMemo(() => {
    const byWeek = new Map<string, Timesheet>()
    mine.filter((s) => inSeptember(s.week)).forEach((s) => byWeek.set(s.week, s))
    if (inSeptember(sheet.week)) byWeek.set(sheet.week, sheet)
    const list = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week))
    const hours = list.reduce((a, s) => a + sheetTotal(s), 0)
    const bill = list.reduce((a, s) => a + sheetBillable(s), 0)
    const capacity = Math.max(1, list.length) * WEEKLY_CAPACITY
    return {
      hours,
      bill,
      util: Math.round((bill / capacity) * 100),
      invoice: list.reduce((a, s) => a + sheetBillable(s) * s.rate, 0),
      chart: list.map((s) => ({ week: `Wk ${weekLabel(s.week).split(' –')[0]}`, hours: sheetTotal(s) })),
    }
  }, [mine, sheet])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Section
        className="xl:col-span-2"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Week of {weekLabel(week)} <StatusBadge status={sheet.status} />
          </span>
        }
        description={`${fmtH(total)} h logged · ${fmtH(billable)} h billable · ${formatKES(rate)}/h`}
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeek((w) => shiftWeek(w, -1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next week" disabled={week >= CURRENT_WEEK} onClick={() => setWeek((w) => shiftWeek(w, 1))}>
              <ChevronRight />
            </Button>
          </div>
        }
      >
        <AnimatePresence mode="wait">
          <motion.div key={week} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}>
            {!editable && (
              <div className="mb-3 rounded-lg bg-subtle px-3 py-2 text-xs text-muted-foreground">
                {sheet.status === 'Approved' ? 'Approved — this week is locked and ready for invoicing.' : 'Submitted — waiting for your manager’s approval. Editing is locked.'}
              </div>
            )}
            {sheet.status === 'Rejected' && (
              <div className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                Returned for changes{sheet.comment ? ` — “${sheet.comment}”` : ''}. Update the hours and submit again.
              </div>
            )}
            <WeekGrid sheet={sheet} editable={editable} onHours={setHours} onBillable={setBillable} onRemove={removeRow} />
          </motion.div>
        </AnimatePresence>

        {editable && (
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addRow()
              }}
            >
              <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Add project, e.g. Equity Bank Onboarding" className="h-9 sm:w-72" />
              <Button type="submit" variant="outline" disabled={!newProject.trim()}>
                Add
              </Button>
            </form>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" disabled={saving} onClick={() => void save(false)}>
                Save draft
              </Button>
              <Button disabled={total === 0 || saving} onClick={() => void save(true)}>
                {saving ? 'Saving…' : 'Submit'}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="September summary" description={`${mine.filter((s) => inSeptember(s.week)).length || 1} weeks logged`}>
        <div className="flex items-center gap-4">
          <ProgressRing value={month.util} size={84} stroke={8} label={<span className="text-base">{month.util}%</span>} tone={month.util >= 70 ? 'success' : 'primary'} />
          <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Total hours</div>
              <div className="text-lg font-bold tabular">{fmtH(month.hours)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Billable</div>
              <div className="text-lg font-bold tabular">{fmtH(month.bill)}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground">Estimated invoice</div>
              <div className="text-lg font-bold tabular">{formatKES(month.invoice)}</div>
            </div>
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Utilisation = billable hours ÷ {WEEKLY_CAPACITY} h weekly capacity</div>
        <div className="mt-4 text-xs font-medium text-muted-foreground">Hours by week</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={month.chart} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="week" {...axisProps} />
            <YAxis {...axisProps} width={40} />
            <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtH(v)} h`} />} cursor={cursorFill} />
            <Bar dataKey="hours" name="Hours" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </Section>
    </div>
  )
}

/* ------------------------------------------------------------------ Approvers */

type Filter = 'Pending' | 'Approved' | 'Rejected' | 'All'

function ApproverView({
  sheets,
  setSheets,
  employee,
}: {
  sheets: Sheet[]
  setSheets: SetSheets
  employee: (id?: string) => Employee | undefined
}) {
  const { user } = useWorkspace()
  const [filter, setFilter] = useState<Filter>('Pending')
  const [open, setOpen] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [reminded, setReminded] = useState<string[]>([])
  const [sending, setSending] = useState<string | null>(null)

  const submitted = sheets.filter((s) => s.status !== 'Draft')
  const september = sheets.filter((s) => inSeptember(s.week))
  const consultants = new Set(sheets.map((s) => s.employeeId)).size
  const hours = september.reduce((a, s) => a + sheetTotal(s), 0)
  const billable = september.reduce((a, s) => a + sheetBillable(s), 0)
  const pending = sheets.filter((s) => s.status === 'Pending')
  const rows = (filter === 'All' ? submitted : sheets.filter((s) => s.status === filter)).sort((a, b) => b.week.localeCompare(a.week))

  const decide = (s: Sheet, status: 'Approved' | 'Rejected') => {
    const name = employee(s.employeeId)?.name ?? 'Consultant'
    const note = comments[s.id]?.trim()
    setSheets((prev) => prev.map((x) => (x.id === s.id ? { ...x, status, comment: note || null } : x)))
    setOpen(null)
    if (!USE_MOCK_API) {
      api
        .post<Sheet>(`/timesheets/${s.id}/decision`, { decision: status === 'Approved' ? 'approve' : 'reject', comment: note || undefined })
        .then((saved) => setSheets((prev) => prev.map((x) => (x.id === s.id ? saved : x))))
        .catch((err) => {
          setSheets((prev) => prev.map((x) => (x.id === s.id ? s : x)))
          toast.error('Decision not saved', { description: errorMessage(err) })
        })
    }
    if (status === 'Approved') toast.success(`Approved ${name}'s timesheet`, { description: `${fmtH(sheetTotal(s))} h · ${formatKES(sheetBillable(s) * s.rate)} queued for invoicing` })
    else toast.error(`Returned to ${name}`, { description: note ? `“${note}”` : 'Sent back for corrections.' })
  }

  // Managers with pending approvals; "waiting" counts from submission (or the week's Saturday).
  const managers = useMemo(() => {
    const map = new Map<string, { manager: Employee; count: number; waiting: number; lastReminded: string | null }>()
    pending.forEach((s) => {
      const m = employee(employee(s.employeeId)?.managerId)
      if (!m) return
      const waiting = s.submittedAt ? daysSince(s.submittedAt) : Math.max(0, -daysUntil(s.week) - 5)
      const cur = map.get(m.id)
      const reminded = s.lastRemindedAt ?? null
      if (!cur) map.set(m.id, { manager: m, count: 1, waiting, lastReminded: reminded })
      else map.set(m.id, { ...cur, count: cur.count + 1, waiting: Math.max(cur.waiting, waiting), lastReminded: reminded && (!cur.lastReminded || reminded > cur.lastReminded) ? reminded : cur.lastReminded })
    })
    return [...map.values()].map((x) => ({ ...x, overdue: Math.max(0, x.waiting - 3) })).sort((a, b) => b.overdue - a.overdue)
  }, [pending, employee])

  /** POST /timesheets/reminders — nudges managers with timesheets pending over 3 days. */
  const remind = async (manager?: Employee) => {
    const key = manager?.id ?? 'all'
    if (USE_MOCK_API) {
      setReminded((r) => [...r, ...(manager ? [manager.id] : managers.map((m) => m.manager.id))])
      toast.success(manager ? `Reminder sent to ${manager.name.split(' ')[0]}` : 'Reminders sent')
      return
    }
    setSending(key)
    try {
      const res = await api.post<{ reminded: { managerId: string; name: string; count: number }[]; timesheets: number; emailed: number }>('/timesheets/reminders', manager ? { managerId: manager.id } : {})
      if (!res.reminded.length) {
        toast('Nothing overdue', { description: 'Reminders go out for timesheets pending more than 3 days.' })
        return
      }
      const at = new Date().toISOString()
      const ids = new Set(res.reminded.map((r) => r.managerId))
      setReminded((r) => [...r, ...ids])
      setSheets((prev) => prev.map((s) => (s.status === 'Pending' && ids.has(employee(s.employeeId)?.managerId ?? '') ? { ...s, lastRemindedAt: at } : s)))
      toast.success(manager ? `Reminder sent to ${manager.name.split(' ')[0]}` : `Reminders sent to ${res.reminded.length} manager${res.reminded.length === 1 ? '' : 's'}`, {
        description: `${res.timesheets} timesheet${res.timesheets === 1 ? '' : 's'} awaiting approval · in-app${res.emailed ? ' and email' : ''}`,
      })
    } catch (err) {
      toast.error('Reminder not sent', { description: errorMessage(err) })
    } finally {
      setSending(null)
    }
  }

  const byProject = useMemo(() => {
    const map = new Map<string, { project: string; billable: number; nonBillable: number }>()
    september.forEach((s) =>
      s.entries.forEach((e) => {
        const cur = map.get(e.project) ?? { project: e.project, billable: 0, nonBillable: 0 }
        if (e.billable) cur.billable += rowTotal(e)
        else cur.nonBillable += rowTotal(e)
        map.set(e.project, cur)
      }),
    )
    return [...map.values()].sort((a, b) => b.billable + b.nonBillable - (a.billable + a.nonBillable))
  }, [september])

  const series = [
    { key: 'billable', label: 'Billable', color: SERIES[0] },
    { key: 'nonBillable', label: 'Non-billable', color: SERIES[1] },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Active consultants" value={consultants} />
        <StatCard index={1} label="Hours this month" value={hours} format={(n) => fmtH(Math.round(n))} />
        <StatCard index={2} label="Billable hours" value={billable} format={(n) => fmtH(Math.round(n))} hint={<span>{hours ? Math.round((billable / hours) * 100) : 0}% of logged</span>} />
        <StatCard index={3} label="Pending approvals" value={pending.length} tone={pending.length ? 'warning' : 'success'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Approval queue"
          description="Expand a timesheet to review the weekly grid"
          action={
            <div className="flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5 text-xs no-scrollbar">
              {(['Pending', 'Approved', 'Rejected', 'All'] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={cn('shrink-0 rounded-md px-2.5 py-1 font-medium', filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                  {f}
                  {f === 'Pending' && pending.length > 0 && <span className="ml-1 tabular">{pending.length}</span>}
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <EmptyState title={filter === 'Pending' ? 'All caught up' : `No ${filter.toLowerCase()} timesheets`} description="Submitted timesheets appear here for review." />
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <AnimatePresence initial={false}>
                {rows.map((s) => {
                  const e = employee(s.employeeId)
                  const isOpen = open === s.id
                  const t = sheetTotal(s)
                  const b = sheetBillable(s)
                  return (
                    <motion.div key={s.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24, height: 0 }} className="overflow-hidden rounded-xl border bg-card">
                      <button className="flex w-full flex-col gap-3 p-3.5 text-left sm:flex-row sm:items-center" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                        <PersonCell name={e?.name ?? 'Consultant'} sub={weekLabel(s.week)} className="sm:w-60" />
                        <div className="grid flex-1 grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-[11px] text-muted-foreground">Total</div>
                            <div className="font-semibold tabular">{fmtH(t)} h</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Billable</div>
                            <div className="font-semibold tabular">{fmtH(b)} h</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Amount</div>
                            <div className="font-semibold tabular">{formatKES(b * s.rate, { compact: true })}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <StatusBadge status={s.status} />
                          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="border-t p-3.5">
                              <WeekGrid sheet={s} />
                              <div className="mt-2 text-xs text-muted-foreground">Rate {formatKES(s.rate)}/h · invoice value {formatKES(b * s.rate)}</div>
                              {s.comment && s.status !== 'Pending' && <div className="mt-2 text-xs text-muted-foreground">Reviewer comment: “{s.comment}”</div>}
                              {s.status === 'Pending' && s.employeeId !== user.id && (
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                  <Input
                                    placeholder="Comment (optional) — e.g. split Friday between projects"
                                    value={comments[s.id] ?? ''}
                                    onChange={(ev) => setComments((c) => ({ ...c, [s.id]: ev.target.value }))}
                                    className="h-9 flex-1"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" onClick={() => decide(s, 'Rejected')}>
                                      Reject
                                    </Button>
                                    <Button onClick={() => decide(s, 'Approved')}>
                                      Approve
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </Section>

        <Section
          title="Approval reminders for managers"
          description="Managers with timesheets waiting on them"
          action={
            managers.some((m) => m.overdue > 0) ? (
              <Button size="sm" variant="outline" disabled={sending !== null} onClick={() => void remind()}>
                Remind all
              </Button>
            ) : undefined
          }
        >
          <div className="mb-4 rounded-lg bg-subtle p-3 text-xs text-muted-foreground">
            Automatic reminders are managed in{' '}
            <Link to="/app/settings?tab=automations" className="font-medium text-primary underline-offset-2 hover:underline">
              Settings → Automations
            </Link>
            . Manual reminders go to managers with timesheets pending more than 3 days.
          </div>
          {managers.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No pending approvals</div>
          ) : (
            <ul className="divide-y">
              {managers.map(({ manager, count, overdue, lastReminded }) => {
                const sent = reminded.includes(manager.id)
                const self = manager.id === user.id
                return (
                  <li key={manager.id} className="flex items-center justify-between gap-3 py-2.5">
                    <PersonCell
                      name={manager.name}
                      sub={`${count} pending · ${overdue ? `${overdue}d overdue` : 'within 3 days'}${lastReminded ? ` · reminded ${daysSince(lastReminded) === 0 ? 'today' : `${daysSince(lastReminded)}d ago`}` : ''}`}
                      size="sm"
                    />
                    <Button size="sm" variant={sent ? 'ghost' : 'soft'} disabled={sent || self || overdue === 0 || sending !== null} onClick={() => void remind(manager)}>
                      {sending === manager.id ? 'Sending…' : sent ? 'Sent' : 'Send reminder'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Billable vs non-billable hours by project" description="September 2026 · all consultants" action={<Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}>
        {byProject.length === 0 ? (
          <EmptyState title="No hours logged yet" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProject} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="project" {...axisProps} interval={0} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} />
              <YAxis {...axisProps} width={40} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${fmtH(v)} h`} />} cursor={cursorFill} />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="h" fill={s.color} stroke="var(--card)" strokeWidth={2} maxBarSize={36} radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Approved hours flow to invoicing</div>
          <div className="text-xs text-muted-foreground">
            {formatKES(sheets.filter((s) => s.status === 'Approved' && inSeptember(s.week)).reduce((a, s) => a + sheetBillable(s) * s.rate, 0))} approved for September billing
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.success('Invoice draft generated', { description: 'Sent to Finance for review in Odoo.' })}>
          Generate invoice draft
        </Button>
      </Card>
    </div>
  )
}
