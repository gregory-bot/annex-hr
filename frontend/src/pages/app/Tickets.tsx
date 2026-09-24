import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { Ticket, TicketPriority, TicketStatus } from '@/data/types'
import { PRIVATE_TICKET_TEAMS, ticketAssigneePool } from '@/data/seed'
import { useWorkspace } from '@/context/auth'
import { USE_MOCK_API } from '@/lib/api'
import { isAdminLike, isLeader } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateTicketDialog } from './tickets/CreateTicketDialog'
import { TicketSheet } from './tickets/TicketSheet'
import { TicketBoard, TicketList } from './tickets/views'
import { PRIORITIES, PriorityIcon, STATUSES, StatusIcon, TeamDot, isTyping, priorityLabel } from './tickets/meta'
import { useTickets, type NewTicket } from './tickets/useTickets'

type Scope = 'all' | 'assigned' | 'created'
const scopes: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'created', label: 'Created by me' },
]

const chipBase = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function Tickets() {
  const ws = useWorkspace()
  const { user, role, employees, departments, ticketTeams: teams, employee } = ws
  const [params, setParams] = useSearchParams()

  // Mock mode mirrors the server's privacy rule for People & HR tickets.
  const initial = useMemo(() => {
    if (!USE_MOCK_API || isAdminLike(role)) return ws.tickets
    const privateTeams = new Set(teams.filter((t) => PRIVATE_TICKET_TEAMS.includes(t.key)).map((t) => t.id))
    return ws.tickets.filter((t) => !privateTeams.has(t.teamId) || t.reporterId === user.id || t.assigneeId === user.id)
  }, [ws.tickets, teams, role, user.id])
  const { tickets, events, create, update, comment } = useTickets(initial, teams, user.id)

  const view = params.get('view') === 'board' ? 'board' : 'list'
  const openId = params.get('id')
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (p) => {
          if (value === null) p.delete(key)
          else p.set(key, value)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  const [teamFilter, setTeamFilter] = useState<string>(() => {
    const t = params.get('team')
    return teams.find((x) => x.id === t || x.key.toLowerCase() === t?.toLowerCase())?.id ?? 'all'
  })
  const [scope, setScope] = useState<Scope>('all')
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([])
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority[]>([])
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(() => params.get('new') === '1')
  const [createStatus, setCreateStatus] = useState<TicketStatus>('Todo')
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (params.get('new') === '1') setCreateOpen(true)
  }, [params])

  const openCreate = useCallback((status: TicketStatus = 'Todo') => {
    setCreateStatus(status)
    setCreateOpen(true)
  }, [])

  // Keyboard: C creates, / searches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        openCreate()
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCreate])

  const people = useMemo(() => employees.filter((e) => e.status !== 'Exited').sort((a, b) => a.name.localeCompare(b.name)), [employees])
  const suggestedFor = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId)
      return team ? ticketAssigneePool(team.key, employees, departments).slice(0, 8) : []
    },
    [teams, employees, departments],
  )
  const knownLabels = useMemo(() => {
    const freq = new Map<string, number>()
    tickets.forEach((t) => t.labels.forEach((l) => freq.set(l, (freq.get(l) ?? 0) + 1)))
    return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l)
  }, [tickets])
  const canEdit = useCallback((t: Ticket) => t.reporterId === user.id || t.assigneeId === user.id || isLeader(role), [user.id, role])

  const scoped = useMemo(
    () => tickets.filter((t) => (scope === 'assigned' ? t.assigneeId === user.id : scope === 'created' ? t.reporterId === user.id : true)),
    [tickets, scope, user.id],
  )
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped.filter(
      (t) =>
        (teamFilter === 'all' || t.teamId === teamFilter) &&
        (!statusFilter.length || statusFilter.includes(t.status)) &&
        (!priorityFilter.length || priorityFilter.includes(t.priority)) &&
        (!needle || t.title.toLowerCase().includes(needle) || t.identifier.toLowerCase().includes(needle) || t.labels.some((l) => l.includes(needle)) || (employee(t.assigneeId)?.name.toLowerCase().includes(needle) ?? false)),
    )
  }, [scoped, teamFilter, statusFilter, priorityFilter, q, employee])

  const isOpen = (t: Ticket) => t.status !== 'Done' && t.status !== 'Canceled'
  const openCount = tickets.filter(isOpen).length
  const mineOpen = tickets.filter((t) => isOpen(t) && t.assigneeId === user.id).length
  const teamCount = (id: string) => scoped.filter((t) => (id === 'all' || t.teamId === id) && isOpen(t)).length

  const selected = openId ? (tickets.find((t) => t.id === openId || t.identifier === openId) ?? null) : null
  const filtersActive = statusFilter.length > 0 || priorityFilter.length > 0 || q.trim() !== '' || teamFilter !== 'all' || scope !== 'all'
  const clearFilters = () => {
    setStatusFilter([])
    setPriorityFilter([])
    setQ('')
    setTeamFilter('all')
    setScope('all')
  }

  const handleCreate = async (input: NewTicket) => {
    const saved = await create(input)
    if (!saved) return false
    toast.success(`${saved.identifier} created`, {
      description: saved.title,
      action: { label: 'Open', onClick: () => setParam('id', saved.id) },
    })
    return true
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const viewProps = {
    tickets: filtered,
    teams,
    employee,
    canEdit,
    onOpen: (t: Ticket) => setParam('id', t.id),
    onUpdate: update,
    onNew: openCreate,
    showTeam: teamFilter === 'all',
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Tickets"
        description={`${openCount} open · ${mineOpen} assigned to you`}
        className="mb-4"
        actions={
          <>
            <div className="inline-flex h-9 items-center rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="View">
              {(
                [
                  ['list', 'List'],
                  ['board', 'Board'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setParam('view', v === 'list' ? null : v)}
                  className={cn('inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground', view === v && 'bg-muted font-medium text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={() => openCreate()}>
              New ticket
              <kbd className="ml-0.5 hidden rounded border border-white/30 px-1 font-mono text-[10px] leading-4 sm:inline">C</kbd>
            </Button>
          </>
        }
      />

      {/* Team chips */}
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-0.5 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {[{ id: 'all', key: '', name: 'All teams', color: '' }, ...teams].map((t) => {
          const active = teamFilter === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTeamFilter(t.id)}
              aria-pressed={active}
              className={cn(chipBase, active ? 'border-foreground/15 bg-muted font-medium text-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
            >
              {t.color && <TeamDot color={t.color} />}
              {t.id === 'all' ? 'All' : t.name}
              {t.key && <span className="font-mono text-[10.5px] text-muted-foreground">{t.key}</span>}
              <span className="text-[11px] text-muted-foreground tabular">{teamCount(t.id)}</span>
            </button>
          )
        })}
      </div>

      {/* Scope + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-0.5 no-scrollbar">
          {scopes.map((s) => (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={cn('h-7 shrink-0 rounded-md px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground', scope === s.value && 'bg-card font-medium text-foreground shadow-sm')}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(chipBase, 'bg-card', statusFilter.length ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                Status
                {statusFilter.length > 0 && <span className="rounded bg-muted px-1 text-[11px] tabular">{statusFilter.length}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {STATUSES.map((s) => (
                <DropdownMenuCheckboxItem key={s} checked={statusFilter.includes(s)} onCheckedChange={() => setStatusFilter((l) => toggle(l, s))} onSelect={(e) => e.preventDefault()}>
                  <span className="flex items-center gap-2">
                    <StatusIcon status={s} /> {s}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {statusFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setStatusFilter([])}>Clear</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(chipBase, 'bg-card', priorityFilter.length ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                Priority
                {priorityFilter.length > 0 && <span className="rounded bg-muted px-1 text-[11px] tabular">{priorityFilter.length}</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              {PRIORITIES.map((p) => (
                <DropdownMenuCheckboxItem key={p} checked={priorityFilter.includes(p)} onCheckedChange={() => setPriorityFilter((l) => toggle(l, p))} onSelect={(e) => e.preventDefault()}>
                  <span className="flex items-center gap-2">
                    <PriorityIcon priority={p} /> {priorityLabel[p]}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              {priorityFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPriorityFilter([])}>Clear</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div ref={searchRef} className="min-w-0 flex-1 sm:max-w-60">
            <SearchInput value={q} onChange={setQ} placeholder="Search tickets…" className="[&_input]:h-8" />
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {filtered.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No tickets match these filters' : 'No tickets yet'}
            description={filtersActive ? 'Try another team, status or search term.' : 'Raise a request with Engineering, IT, People & HR, Finance or Facilities — they’ll pick it up from here.'}
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => openCreate()}>
                  New ticket
                </Button>
              )
            }
          />
        ) : view === 'board' ? (
          <TicketBoard {...viewProps} />
        ) : (
          <TicketList {...viewProps} />
        )}
      </motion.div>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o && params.get('new')) setParam('new', null)
        }}
        teams={teams}
        defaultTeamId={teamFilter !== 'all' ? teamFilter : undefined}
        defaultStatus={createStatus}
        people={people}
        suggestedFor={suggestedFor}
        meId={user.id}
        knownLabels={knownLabels}
        onCreate={handleCreate}
      />

      <TicketSheet
        ticket={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setParam('id', null)}
        teams={teams}
        people={people}
        employee={employee}
        suggestedFor={suggestedFor}
        meId={user.id}
        canEdit={canEdit}
        knownLabels={knownLabels}
        events={events}
        onUpdate={update}
        onComment={comment}
      />
    </div>
  )
}
