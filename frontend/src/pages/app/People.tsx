import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { EmptyState } from '@/components/shared/EmptyState'
import { Section } from '@/components/shared/Section'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SimpleSelect } from '@/components/ui/select'
import { useWorkspace } from '@/context/auth'
import type { Employee, EmploymentType, EmployeeStatus } from '@/data/types'
import { isAdminLike, roleLabels } from '@/lib/rbac'
import { cn, formatDate } from '@/lib/utils'
import { InviteDialog } from './people/InviteDialog'
import { useInvites } from './people/useInvites'
import { ProfileDrawer } from './people/ProfileDrawer'

const EMPLOYMENT_TYPES: EmploymentType[] = ['Full-time', 'Contract', 'Consultant', 'Intern', 'Part-time']
const STATUSES: EmployeeStatus[] = ['Active', 'Probation', 'On Leave', 'Onboarding', 'Notice Period', 'Exited']

function PersonAvatarCell({ e }: { e: Employee }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={e.name} src={e.photo} className="size-9" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{e.name}</div>
        <div className="truncate text-xs text-muted-foreground">{e.email}</div>
      </div>
    </div>
  )
}

export default function People() {
  const ws = useWorkspace()
  const { departments, role } = ws
  const admin = isAdminLike(role)
  const [params, setParams] = useSearchParams()

  const [employees, setEmployees] = useState<Employee[]>(ws.employees)
  useEffect(() => setEmployees(ws.employees), [ws.employees])

  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('all')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [view, setView] = useState<'table' | 'grid'>('table')
  const { invites, send: sendInvites, resend: resendInvite, revoke: revokeInvite } = useInvites()

  const inviteOpen = admin && params.get('invite') === '1'
  const selectedId = params.get('id')
  const selected = employees.find((e) => e.id === selectedId) ?? null

  const setParam = (key: string, value: string | null) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter(
      (e) =>
        (dept === 'all' || e.departmentId === dept) &&
        (type === 'all' || e.employmentType === type) &&
        (status === 'all' || e.status === status) &&
        (!q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)),
    )
  }, [employees, query, dept, type, status])

  const counts = useMemo(
    () => ({
      active: employees.filter((e) => e.status === 'Active').length,
      probation: employees.filter((e) => e.status === 'Probation' || e.status === 'Onboarding').length,
      onLeave: employees.filter((e) => e.status === 'On Leave').length,
    }),
    [employees],
  )

  const deptOf = (id: string) => ws.department(id)
  const hasFilters = query || dept !== 'all' || type !== 'all' || status !== 'all'

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'Employee', cell: (e) => <PersonAvatarCell e={e} />, sortValue: (e) => e.name, className: 'max-w-[260px]' },
    {
      key: 'dept',
      header: 'Department',
      cell: (e) => {
        const d = deptOf(e.departmentId)
        return (
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d?.color }} />
            {d?.name}
          </span>
        )
      },
      sortValue: (e) => deptOf(e.departmentId)?.name ?? '',
    },
    { key: 'manager', header: 'Manager', cell: (e) => <span className="whitespace-nowrap text-sm">{ws.employee(e.managerId)?.name ?? '—'}</span>, sortValue: (e) => ws.employee(e.managerId)?.name ?? '' },
    { key: 'title', header: 'Role', cell: (e) => <span className="text-sm">{e.title}</span>, sortValue: (e) => e.title },
    { key: 'type', header: 'Type', cell: (e) => <Badge variant={e.employmentType === 'Full-time' ? 'muted' : 'outline'}>{e.employmentType}</Badge>, sortValue: (e) => e.employmentType },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} />, sortValue: (e) => e.status },
    { key: 'location', header: 'Location', cell: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{e.location}</span>, sortValue: (e) => e.location },
    { key: 'start', header: 'Start date', cell: (e) => <span className="whitespace-nowrap text-sm tabular text-muted-foreground">{formatDate(e.startDate)}</span>, sortValue: (e) => e.startDate },
  ]

  const exportRows = filtered.map((e) => ({
    'Employee no.': e.employeeNo,
    Name: e.name,
    Email: e.email,
    Department: deptOf(e.departmentId)?.name ?? '',
    Title: e.title,
    Manager: ws.employee(e.managerId)?.name ?? '',
    'Employment type': e.employmentType,
    Status: e.status,
    Location: e.location,
    'Start date': e.startDate,
  }))

  const deactivate = (e: Employee) => {
    setEmployees((list) => list.map((x) => (x.id === e.id ? { ...x, status: 'Exited' } : x)))
    toast.success(`${e.name} deactivated`, { description: 'Access revoked across Annex HR and connected apps.' })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="People"
        description={
          <>
            {employees.length} people · {counts.active} active · {counts.probation} on probation or onboarding · {counts.onLeave} on leave
          </>
        }
        actions={
          <>
            <ExportMenu filename={`${ws.workspace.slug}-directory`} rows={exportRows} />
            {admin && (
              <Button onClick={() => setParam('invite', '1')}>
                Invite employees
              </Button>
            )}
          </>
        }
      />

      <AnimatePresence>
        {admin && invites.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mb-4">
            <Section
              title="Pending invites"
              description={`${invites.length} awaiting acceptance`}
            >
              <ul className="divide-y">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <PersonCell name={i.email.split('@')[0]!.replace(/[._-]/g, ' ')} sub={`${i.email} · ${deptOf(i.departmentId)?.name ?? ''} · ${roleLabels[i.role]}`} size="sm" />
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="info" dot>
                        Invited
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          resendInvite(i.id)
                            .then(() => toast.success('Invitation resent', { description: i.email }))
                            .catch((err: Error) => toast.error('Could not resend', { description: err.message }))
                        }
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Revoke invite"
                        onClick={() =>
                          revokeInvite(i.id)
                            .then(() => toast.success('Invitation revoked', { description: i.email }))
                            .catch((err: Error) => toast.error('Could not revoke', { description: err.message }))
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name, email or title…" className="sm:col-span-2 lg:w-72" />
        <SimpleSelect
          value={dept}
          onValueChange={setDept}
          options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          className="h-9 lg:w-48"
        />
        <SimpleSelect value={type} onValueChange={setType} options={[{ value: 'all', label: 'All types' }, ...EMPLOYMENT_TYPES]} className="h-9 lg:w-40" />
        <SimpleSelect value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES]} className="h-9 lg:w-40" />
        <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:ml-auto lg:justify-end">
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('')
                setDept('all')
                setType('all')
                setStatus('all')
              }}
            >
              Clear filters
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground lg:hidden">{filtered.length} results</span>
          )}
          <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="View">
            {(
              [
                ['table', 'Table'],
                ['grid', 'Grid'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors',
                  view === v && 'bg-muted text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No one matches those filters"
          description="Try a different name, or clear the department and status filters."
          action={
            admin ? (
              <Button variant="outline" onClick={() => setParam('invite', '1')}>
                Invite someone new
              </Button>
            ) : undefined
          }
        />
      ) : view === 'table' ? (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(e) => e.id}
          onRowClick={(e) => setParam('id', e.id)}
          pageSize={10}
          mobileCard={(e) => {
            const d = deptOf(e.departmentId)
            return (
              <div className="flex items-start gap-3">
                <PersonAvatar name={e.name} src={e.photo} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{e.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.title}</div>
                    </div>
                    <StatusBadge status={e.status} className="shrink-0" />
                  </div>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: d?.color }} />
                    {d?.name} · {e.location}
                  </div>
                </div>
              </div>
            )
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((e, i) => {
            const d = deptOf(e.departmentId)
            return (
              <motion.button
                key={e.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 16) * 0.025 }}
                whileHover={{ y: -2 }}
                onClick={() => setParam('id', e.id)}
                className="group relative flex flex-col items-center overflow-hidden rounded-xl border bg-card p-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-lg hover:shadow-black/[0.04]"
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: d?.color }} />
                <PersonAvatar name={e.name} src={e.photo} className="size-14 text-base" />
                <div className="mt-3 w-full truncate font-medium">{e.name}</div>
                <div className="w-full truncate text-xs text-muted-foreground">{e.title}</div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <StatusBadge status={e.status} />
                  <Badge variant="outline" className="max-w-[140px] truncate">
                    {d?.name}
                  </Badge>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={(o) => setParam('invite', o ? '1' : null)}
        departments={departments}
        onSend={sendInvites}
      />
      <ProfileDrawer employee={selected} onOpenChange={(o) => !o && setParam('id', null)} onDeactivate={deactivate} />
    </div>
  )
}
