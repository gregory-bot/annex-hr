import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/avatar'
import { SimpleSelect } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { SearchInput } from '@/components/shared/SearchInput'
import { useWorkspace } from '@/context/auth'
import type { HRCase } from '@/data/types'
import { roleLabels } from '@/lib/rbac'
import { TODAY, formatDate } from '@/lib/utils'
import { LogCaseDialog, RevealDialog } from './cases/CaseDialogs'
import { CaseDetail } from './cases/CaseDetail'
import { CASE_STAGES, CASE_TYPES, MASK, buildAccessLog, buildApprovals, buildNotes, clock, resolutionDays, type CaseRecord } from './cases/helpers'

export default function Cases() {
  const { cases, employees, employee, user, role } = useWorkspace()
  const hrAdmin = employees.find((e) => e.role === 'company_admin')
  const ceo = employees.find((e) => e.role === 'ceo')

  const [records, setRecords] = useState<CaseRecord[]>(() =>
    cases.map((c) => {
      const subject = employee(c.subjectId)
      return {
        ...c,
        approvals: buildApprovals(c, employee(c.assignedTo) ?? hrAdmin, ceo),
        notes: buildNotes(c, employee(c.assignedTo) ?? hrAdmin, employee(subject?.managerId)),
        accessLog: buildAccessLog(c, hrAdmin, ceo),
      }
    }),
  )
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const selected = records.find((r) => r.id === selectedId)
  const revealTarget = records.find((r) => r.id === revealId)

  const subjectName = (r: HRCase) => employee(r.subjectId)?.name ?? 'Unknown employee'
  const reporterName = (r: HRCase) => (r.reportedBy === 'Anonymous' ? 'Anonymous' : (employee(r.reportedBy)?.name ?? 'Unknown'))
  const isMasked = (r: HRCase) => r.confidential && !revealed.has(r.id)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (type === 'all' || r.type === type) &&
        (!q || r.ref.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || (!(r.confidential && !revealed.has(r.id)) && (employee(r.subjectId)?.name ?? '').toLowerCase().includes(q))),
    )
  }, [records, status, type, query, revealed, employee])

  const open = records.filter((r) => r.status !== 'Closed').length
  const investigating = records.filter((r) => r.status === 'Investigating').length
  const awaiting = records.filter((r) => r.status === 'Awaiting Approval').length
  const resolved = records.map(resolutionDays).filter((d): d is number => d !== null)
  const avgResolution = resolved.length ? Math.round(resolved.reduce((a, b) => a + b, 0) / resolved.length) : 0

  const update = (r: CaseRecord) => setRecords((prev) => prev.map((x) => (x.id === r.id ? r : x)))

  const logView = (id: string) => {
    // Opening a confidential file is itself an access event.
    setRecords((prev) =>
      prev.map((x) =>
        x.id === id && x.confidential
          ? { ...x, accessLog: [{ id: `${x.id}-v${x.accessLog.length}`, who: user.name, role: roleLabels[role], action: 'Opened case file', at: `${TODAY} ${clock(x.id + x.accessLog.length)}` }, ...x.accessLog] }
          : x,
      ),
    )
  }

  const confirmReveal = (reason: string) => {
    if (!revealTarget) return
    const id = revealTarget.id
    setRevealed((prev) => new Set(prev).add(id))
    setRecords((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, accessLog: [{ id: `${x.id}-r${x.accessLog.length}`, who: user.name, role: roleLabels[role], action: 'Revealed subject identity', at: `${TODAY} ${clock(x.id + 'r' + x.accessLog.length)}`, reason }, ...x.accessLog] }
          : x,
      ),
    )
    setRevealId(null)
    toast.success(`Identity revealed for ${revealTarget.ref}`, { description: 'Access logged and visible to the case team.' })
  }

  const renderSubject = (r: CaseRecord, compact = false) =>
    isMasked(r) ? (
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-full bg-muted blur-[1px]" />
        <span className="select-none font-medium tracking-widest text-muted-foreground">{MASK}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-primary"
          onClick={(e) => {
            e.stopPropagation()
            setRevealId(r.id)
          }}
        >
          Reveal
        </Button>
      </div>
    ) : (
      <div className="flex min-w-0 items-center gap-2">
        <PersonAvatar name={subjectName(r)} className="size-7 text-[10px]" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{subjectName(r)}</div>
          {!compact && <div className="truncate text-xs text-muted-foreground">Reported by {reporterName(r)}</div>}
        </div>
      </div>
    )

  const columns: Column<CaseRecord>[] = [
    {
      key: 'ref',
      header: 'Ref',
      sortValue: (r) => r.ref,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium">{r.ref}</span>
          {r.confidential && (
            <Tip label="Confidential">
              <span aria-label="Confidential" className="size-1.5 shrink-0 rounded-full bg-primary" />
            </Tip>
          )}
        </div>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (r) => r.type, cell: (r) => <span className="text-sm">{r.type}</span> },
    { key: 'subject', header: 'Subject', cell: (r) => renderSubject(r) },
    { key: 'severity', header: 'Severity', sortValue: (r) => ['Low', 'Medium', 'High', 'Critical'].indexOf(r.severity), cell: (r) => <StatusBadge status={r.severity} /> },
    { key: 'status', header: 'Status', sortValue: (r) => CASE_STAGES.indexOf(r.status), cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'opened', header: 'Opened', sortValue: (r) => r.opened, cell: (r) => <span className="text-sm text-muted-foreground tabular">{formatDate(r.opened)}</span> },
    { key: 'assigned', header: 'Assigned to', cell: (r) => <span className="text-sm">{employee(r.assignedTo)?.name ?? '—'}</span> },
  ]

  const mobileCard = (r: CaseRecord) => (
    <div className="grid grid-cols-1 gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium">{r.ref}</span>
          {r.confidential && <span aria-label="Confidential" className="size-1.5 shrink-0 rounded-full bg-primary" />}
          <span className="text-xs text-muted-foreground">· {r.type}</span>
        </div>
        <StatusBadge status={r.status} />
      </div>
      {renderSubject(r, true)}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusBadge status={r.severity} />
        <span>Opened {formatDate(r.opened, 'short')}</span>
        <span>· {r.reportedBy === 'Anonymous' ? 'Anonymous report' : `Reported by ${reporterName(r)}`}</span>
      </div>
    </div>
  )

  const team = [hrAdmin, ceo].filter((e): e is NonNullable<typeof e> => Boolean(e))

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Governance"
        title="Disciplinary & grievance"
        description="Confidential case management with fair-hearing workflow, evidence vault and sign-off trail."
        actions={
          <Button onClick={() => setLogOpen(true)}>Log case</Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-accent/60 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <div className="text-sm font-semibold text-foreground">Restricted — visible to the case team only. All access is logged.</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Subject names are masked on confidential cases until a reason is recorded.</div>
        </div>
        <div className="flex items-center gap-3 sm:shrink-0">
          <div className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Confidential access control</div>
          <div className="flex -space-x-2">
            {team.map((p) => (
              <Tip key={p.id} label={`${p.name} · ${roleLabels[p.role]}`}>
                <span className="rounded-full ring-2 ring-card">
                  <PersonAvatar name={p.name} className="size-8 text-[11px]" />
                </span>
              </Tip>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Open cases" value={open} tone="primary" index={0} hint={`${records.length} total this year`} />
        <StatCard label="Under investigation" value={investigating} index={1} />
        <StatCard label="Awaiting approval" value={awaiting} tone="warning" index={2} hint="HR Head / CEO sign-off" />
        <StatCard label="Avg resolution" value={avgResolution} format={(n) => `${Math.round(n)} days`} tone="success" index={3} hint="Target ≤ 21 days" />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search ref, type or revealed name…" className="sm:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
            <SimpleSelect value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...CASE_STAGES]} className="sm:w-44" />
            <SimpleSelect value={type} onValueChange={setType} options={[{ value: 'all', label: 'All types' }, ...CASE_TYPES]} className="sm:w-44" />
          </div>
        </div>
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            setSelectedId(r.id)
            logView(r.id)
          }}
          mobileCard={mobileCard}
          empty={<EmptyState title="No cases match" description="Try a different status or type filter." />}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Anonymous reports are shown as “Anonymous” — reporter identity is never stored.
          <Badge variant="muted" className="ml-1">
            {filtered.length} shown
          </Badge>
        </p>
      </div>

      <CaseDetail
        record={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelectedId(null)}
        revealed={selected ? revealed.has(selected.id) : false}
        onRequestReveal={() => selected && setRevealId(selected.id)}
        subjectName={selected ? subjectName(selected) : ''}
        reporterName={selected ? reporterName(selected) : ''}
        assigneeName={selected ? (employee(selected.assignedTo)?.name ?? '—') : ''}
        role={role}
        userName={user.name}
        onUpdate={update}
      />

      <RevealDialog open={!!revealTarget} onOpenChange={(o) => !o && setRevealId(null)} caseRef={revealTarget?.ref} onConfirm={confirmReveal} />

      <LogCaseDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        employees={employees.filter((e) => e.status !== 'Exited')}
        onCreate={(c) => {
          const n = records.length
          const ref = `HR-2026-${String(41 + n).padStart(4, '0')}`
          const assignee = hrAdmin ?? user
          const base: HRCase = {
            ...c,
            id: `case-new-${n}`,
            ref,
            assignedTo: assignee.id,
            timeline: [{ date: TODAY, title: 'Case logged', by: user.name, note: c.reportedBy === 'Anonymous' ? 'Logged from an anonymous report.' : 'Logged via case intake form.' }],
          }
          const rec: CaseRecord = {
            ...base,
            approvals: buildApprovals(base, assignee, ceo),
            notes: [],
            accessLog: [{ id: `${base.id}-a0`, who: user.name, role: roleLabels[role], action: 'Created case', at: `${TODAY} ${clock(base.id)}` }],
          }
          setRecords((prev) => [rec, ...prev])
          setLogOpen(false)
          toast.success(`${ref} logged`, { description: `${c.type} case assigned to ${assignee.name}.` })
        }}
      />
    </div>
  )
}
