import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { Employee, Ticket, TicketStatus, TicketTeam } from '@/data/types'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { PersonAvatar } from '@/components/ui/avatar'
import { Tip } from '@/components/ui/tooltip'
import { Kanban } from '@/components/shared/Kanban'
import { LabelPill, PRIORITY_RANK, PriorityIcon, STATUS_GROUP_ORDER, STATUSES, StatusIcon, TeamDot, priorityLabel, relTime } from './meta'
import { PriorityMenu, StatusMenu, propButton } from './pickers'
import type { TicketPatch } from './useTickets'

export interface ViewProps {
  tickets: Ticket[]
  teams: TicketTeam[]
  employee: (id?: string) => Employee | undefined
  canEdit: (t: Ticket) => boolean
  onOpen: (t: Ticket) => void
  onUpdate: (id: string, patch: TicketPatch) => void
  onNew: (status: TicketStatus) => void
  showTeam: boolean
}

const sortTickets = (a: Ticket, b: Ticket) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.updatedAt.localeCompare(a.updatedAt)

function Assignee({ person }: { person?: Employee }) {
  return person ? (
    <Tip label={person.name}>
      <span className="inline-flex">
        <PersonAvatar name={person.name} src={person.photo} className="size-5 text-[9px]" />
      </span>
    </Tip>
  ) : (
    <span className="inline-block size-5 shrink-0 rounded-full border border-dashed border-muted-foreground/40" aria-label="Unassigned" />
  )
}

function DueChip({ t }: { t: Ticket }) {
  if (!t.dueDate || t.status === 'Done' || t.status === 'Canceled') return null
  const d = daysUntil(t.dueDate)
  return (
    <span className={cn('hidden shrink-0 rounded border px-1.5 py-px text-[11px] tabular sm:inline', d < 0 ? 'border-danger/30 text-danger' : d <= 2 ? 'border-warning/30 text-warning' : 'text-muted-foreground')}>
      {formatDate(t.dueDate, 'short')}
    </span>
  )
}

/** Moves focus between rows with ↑/↓ or j/k. */
function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowDown', 'ArrowUp', 'j', 'k']
  if (!keys.includes(e.key)) return
  const target = e.target as HTMLElement
  if (!target.dataset.ticketRow) return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-ticket-row]'))
  const i = rows.indexOf(target)
  const next = rows[e.key === 'ArrowDown' || e.key === 'j' ? i + 1 : i - 1]
  if (next) {
    e.preventDefault()
    next.focus()
  }
}

export function TicketList({ tickets, teams, employee, canEdit, onOpen, onUpdate, onNew, showTeam }: ViewProps) {
  const [collapsed, setCollapsed] = useState<Partial<Record<TicketStatus, boolean>>>({ Canceled: true })
  const teamOf = (id: string) => teams.find((t) => t.id === id)
  const groups = STATUS_GROUP_ORDER.map((s) => ({ status: s, items: tickets.filter((t) => t.status === s).sort(sortTickets) })).filter((g) => g.items.length)

  return (
    <div className="overflow-hidden rounded-xl border bg-card" onKeyDown={onListKey}>
      {groups.map((g) => {
        const isCollapsed = !!collapsed[g.status]
        return (
          <section key={g.status}>
            <div className="flex h-9 items-center gap-2 border-b bg-subtle px-3 text-[13px]">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
              >
                <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
                <StatusIcon status={g.status} />
                <span className="font-medium">{g.status}</span>
                <span className="text-muted-foreground tabular">{g.items.length}</span>
              </button>
              <Tip label={`New ticket in ${g.status}`}>
                <button className={cn(propButton, 'size-7 justify-center px-0')} onClick={() => onNew(g.status)} aria-label={`New ticket in ${g.status}`}>
                  <Plus className="size-3.5 text-muted-foreground" />
                </button>
              </Tip>
            </div>
            {!isCollapsed && (
              <ul>
                {g.items.map((t) => {
                  const team = teamOf(t.teamId)
                  const editable = canEdit(t)
                  return (
                    <li key={t.id} className="border-b last:border-b-0">
                      <div
                        role="button"
                        tabIndex={0}
                        data-ticket-row
                        onClick={() => onOpen(t)}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault()
                            onOpen(t)
                          }
                        }}
                        className={cn('flex h-11 min-w-0 cursor-default items-center gap-2 px-3 text-[13px] outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted sm:h-10 sm:gap-2.5', t.id.startsWith('tmp-') && 'opacity-60')}
                      >
                        <PriorityMenu value={t.priority} onChange={(priority) => onUpdate(t.id, { priority })} disabled={!editable}>
                          <button className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted" aria-label={`Priority: ${priorityLabel[t.priority]}`}>
                            <PriorityIcon priority={t.priority} />
                          </button>
                        </PriorityMenu>
                        <span className="hidden w-[4.5rem] shrink-0 font-mono text-[12px] text-muted-foreground sm:block">{t.identifier}</span>
                        <StatusMenu value={t.status} onChange={(status) => onUpdate(t.id, { status })} disabled={!editable}>
                          <button className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted" aria-label={`Status: ${t.status}`}>
                            <StatusIcon status={t.status} />
                          </button>
                        </StatusMenu>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground sm:hidden">{t.identifier}</span>
                          <span className={cn(t.status === 'Canceled' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{t.title}</span>
                        </span>
                        <span className="hidden min-w-0 shrink items-center gap-1 overflow-hidden md:flex">
                          {t.labels.slice(0, 2).map((l) => (
                            <LabelPill key={l} label={l} />
                          ))}
                          {t.labels.length > 2 && <span className="text-[11px] text-muted-foreground">+{t.labels.length - 2}</span>}
                        </span>
                        {showTeam && team && (
                          <Tip label={team.name}>
                            <span className="hidden shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[11px] text-muted-foreground lg:inline-flex">
                              <TeamDot color={team.color} className="size-1.5" />
                              {team.key}
                            </span>
                          </Tip>
                        )}
                        <DueChip t={t} />
                        <Assignee person={employee(t.assigneeId)} />
                        <span className="hidden w-14 shrink-0 whitespace-nowrap text-right text-[12px] text-muted-foreground tabular sm:block">{relTime(t.updatedAt)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

const tone: Record<TicketStatus, 'default' | 'warning' | 'success' | 'danger' | 'info'> = {
  Backlog: 'default',
  Todo: 'default',
  'In Progress': 'warning',
  'In Review': 'info',
  Done: 'success',
  Canceled: 'default',
}

export function TicketBoard({ tickets, teams, employee, canEdit, onOpen, onUpdate }: ViewProps) {
  const columns = STATUSES.map((s) => ({ id: s, title: s, tone: tone[s], items: tickets.filter((t) => t.status === s).sort(sortTickets) }))
  return (
    <Kanban
      columns={columns}
      itemKey={(t) => t.id}
      renderCard={(t) => {
        const team = teams.find((x) => x.id === t.teamId)
        const person = employee(t.assigneeId)
        const editable = canEdit(t)
        return (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(t)}
            onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onOpen(t)}
            className="cursor-default rounded-lg border bg-card p-3 text-[13px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors hover:border-foreground/20 focus-visible:border-primary"
          >
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {team && <TeamDot color={team.color} className="size-1.5" />}
              <span className="font-mono">{t.identifier}</span>
              <span className="ml-auto">
                <Assignee person={person} />
              </span>
            </div>
            <div className="mt-1.5 line-clamp-2 font-medium leading-snug">{t.title}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              <PriorityMenu value={t.priority} onChange={(priority) => onUpdate(t.id, { priority })} disabled={!editable}>
                <button className="flex size-6 items-center justify-center rounded border hover:bg-muted" aria-label={`Priority: ${priorityLabel[t.priority]}`}>
                  <PriorityIcon priority={t.priority} />
                </button>
              </PriorityMenu>
              <StatusMenu value={t.status} onChange={(status) => onUpdate(t.id, { status })} disabled={!editable}>
                <button className="inline-flex h-6 items-center gap-1.5 rounded border px-1.5 text-[11px] hover:bg-muted" aria-label="Move ticket">
                  <StatusIcon status={t.status} className="size-3" />
                  {t.status}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </StatusMenu>
              {t.labels.slice(0, 2).map((l) => (
                <LabelPill key={l} label={l} />
              ))}
            </div>
          </div>
        )
      }}
    />
  )
}
