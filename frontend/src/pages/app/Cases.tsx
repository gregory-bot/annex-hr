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
import { roleLabels } from '@/lib/rbac'
import { formatDate } from '@/lib/utils'
import { errorMessage } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { LogCaseDialog, RevealDialog } from './cases/CaseDialogs'
import { CaseDetail } from './cases/CaseDetail'
import { CASE_STAGES, CASE_TYPES, MASK, resolutionDays, type CaseItem } from './cases/helpers'
import { useCases } from './cases/useCases'

export default function Cases() {
  const { cases: seed, employees, employee, user, role } = useWorkspace()
  const hrAdmin = employees.find((e) => e.role === 'company_admin')
  const ceo = employees.find((e) => e.role === 'ceo')
  const cases = useCases({ seed, employee, employees, me: user, role })
  const records = cases.items

  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revealId, setRevealId] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)

  const revealTarget = records.find((r) => r.id === revealId)
  const isMasked = (r: CaseItem) => r.masked

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (type === 'all' || r.type === type) &&
        (!q || r.ref.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || (r.subjectName ?? '').toLowerCase().includes(q)),
    )
  }, [records, status, type, query])

  const open = records.filter((r) => r.status !== 'Closed').length
  const investigating = records.filter((r) => r.status === 'Investigating').length
  const awaiting = records.filter((r) => r.status === 'Awaiting Approval').length
  const resolved = records.map(resolutionDays).filter((d): d is number => d !== null)
  const avgResolution = resolved.length ? Math.round(resolved.reduce((a, b) => a + b, 0) / resolved.length) : 0

  const openCase = (id: string) => {
    setSelectedId(id)
    cases.open(id).catch((err) => {
      toast.error('Could not open the case', { description: errorMessage(err) })
      setSelectedId(null)
    })
  }

  const confirmReveal = async (reason: string) => {
    if (!revealTarget) return
    const target = revealTarget
    try {
      await cases.reveal(target.id, reason)
      setRevealId(null)
      toast.success(`Identity revealed for ${target.ref}`, { description: 'Your access and reason were written to the case access log.' })
    } catch (err) {
      toast.error('Could not reveal the identity', { description: errorMessage(err) })
    }
  }

  const renderSubject = (r: CaseItem, compact = false) =>
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
        <PersonAvatar name={r.subjectName ?? 'Employee'} className="size-7 text-[10px]" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.subjectName}</div>
          {!compact && <div className="truncate text-xs text-muted-foreground">Reported by {r.reporterName}</div>}
        </div>
      </div>
    )

  const columns: Column<CaseItem>[] = [
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
    { key: 'assigned', header: 'Assigned to', cell: (r) => <span className="text-sm">{r.assigneeName}</span> },
  ]

  const mobileCard = (r: CaseItem) => (
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
        <span>· {r.reportedBy === 'Anonymous' ? 'Anonymous report' : `Reported by ${r.reporterName}`}</span>
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
        {cases.error ? (
          <EmptyState title="Cases are unavailable" description={cases.error} />
        ) : cases.loading ? (
          <div className="grid grid-cols-1 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => openCase(r.id)}
            mobileCard={mobileCard}
            empty={<EmptyState title="No cases match" description="Try a different status or type filter." />}
          />
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Anonymous reports are shown as “Anonymous” — reporter identity is never stored.
          <Badge variant="muted" className="ml-1">
            {filtered.length} shown
          </Badge>
        </p>
      </div>

      <CaseDetail
        record={cases.detail && cases.detail.id === selectedId ? cases.detail : null}
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null)
            cases.close()
          }
        }}
        onRequestReveal={() => selectedId && setRevealId(selectedId)}
        cases={cases}
      />

      <RevealDialog open={!!revealTarget} onOpenChange={(o) => !o && setRevealId(null)} caseRef={revealTarget?.ref} onConfirm={(reason) => void confirmReveal(reason)} />

      <LogCaseDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        employees={employees.filter((e) => e.status !== 'Exited')}
        onCreate={async (c, files) => {
          const created = await cases.create(c, files)
          setLogOpen(false)
          toast.success(`${created.ref} logged`, { description: `${c.type} case assigned to ${created.assigneeName}${files.length ? ` · ${files.length} evidence file${files.length > 1 ? 's' : ''} uploaded` : ''}.` })
        }}
      />
    </div>
  )
}
