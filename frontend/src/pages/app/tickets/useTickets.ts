import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Ticket, TicketComment, TicketPriority, TicketStatus, TicketTeam } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'

export type TicketPatch = Partial<Pick<Ticket, 'title' | 'description' | 'status' | 'priority' | 'labels' | 'teamId'>> & {
  assigneeId?: string | null
  dueDate?: string | null
}

export interface NewTicket {
  teamId: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  assigneeId?: string
  labels: string[]
}

/** A property change made this session, shown in the activity feed. */
export interface TicketEvent {
  id: string
  ticketId: string
  actorId: string
  field: 'status' | 'priority' | 'assignee' | 'labels' | 'team' | 'due' | 'title' | 'description'
  to: string
  at: string
}

const now = () => new Date().toISOString()
let seq = 0
const tempId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`

function applyPatch(t: Ticket, patch: TicketPatch, teams: TicketTeam[], all: Ticket[]): Ticket {
  const next: Ticket = { ...t, updatedAt: now() }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.description !== undefined) next.description = patch.description
  if (patch.status !== undefined) next.status = patch.status
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.labels !== undefined) next.labels = patch.labels
  if (patch.assigneeId !== undefined) next.assigneeId = patch.assigneeId ?? undefined
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate ?? undefined
  if (patch.teamId !== undefined && patch.teamId !== t.teamId) {
    next.teamId = patch.teamId
    next.identifier = nextIdentifier(patch.teamId, teams, all)
  }
  return next
}

function nextIdentifier(teamId: string, teams: TicketTeam[], all: Ticket[]) {
  const key = teams.find((x) => x.id === teamId)?.key ?? 'TKT'
  const max = all.filter((x) => x.teamId === teamId).reduce((m, x) => Math.max(m, Number(x.identifier.split('-').pop()) || 0), 0)
  return `${key}-${max + 1}`
}

function describe(patch: TicketPatch): Omit<TicketEvent, 'id' | 'ticketId' | 'actorId' | 'at'>[] {
  const out: Omit<TicketEvent, 'id' | 'ticketId' | 'actorId' | 'at'>[] = []
  if (patch.status) out.push({ field: 'status', to: patch.status })
  if (patch.priority) out.push({ field: 'priority', to: patch.priority })
  if (patch.assigneeId !== undefined) out.push({ field: 'assignee', to: patch.assigneeId ?? '' })
  if (patch.labels) out.push({ field: 'labels', to: patch.labels.join(', ') })
  if (patch.teamId) out.push({ field: 'team', to: patch.teamId })
  if (patch.dueDate !== undefined) out.push({ field: 'due', to: patch.dueDate ?? '' })
  if (patch.title !== undefined) out.push({ field: 'title', to: patch.title })
  if (patch.description !== undefined) out.push({ field: 'description', to: '' })
  return out
}

/**
 * Ticket state with optimistic mutations.
 * Real mode persists to the API and rolls back (with a toast) on failure; mock mode is local only.
 */
export function useTickets(initial: Ticket[], teams: TicketTeam[], meId: string) {
  const [tickets, setTickets] = useState<Ticket[]>(initial)
  const [events, setEvents] = useState<TicketEvent[]>([])
  const ref = useRef(tickets)
  ref.current = tickets

  // Real mode: the bootstrap snapshot may be stale after edits elsewhere — refresh once on mount.
  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    api
      .get<Ticket[]>('/tickets')
      .then((fresh) => !cancelled && setTickets((prev) => [...prev.filter((t) => t.id.startsWith('tmp-')), ...fresh]))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const logEvents = useCallback(
    (ticketId: string, patch: TicketPatch) => {
      const at = now()
      setEvents((prev) => [...prev, ...describe(patch).map((d) => ({ ...d, id: tempId('ev'), ticketId, actorId: meId, at }))])
    },
    [meId],
  )

  const create = useCallback(
    async (input: NewTicket): Promise<Ticket | null> => {
      const optimistic: Ticket = {
        id: tempId('tmp'),
        identifier: nextIdentifier(input.teamId, teams, ref.current),
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        reporterId: meId,
        assigneeId: input.assigneeId,
        labels: input.labels,
        createdAt: now(),
        updatedAt: now(),
        comments: [],
      }
      setTickets((prev) => [optimistic, ...prev])
      if (USE_MOCK_API) return optimistic
      try {
        const saved = await api.post<Ticket>('/tickets', input)
        setTickets((prev) => prev.map((t) => (t.id === optimistic.id ? saved : t)))
        return saved
      } catch (err) {
        setTickets((prev) => prev.filter((t) => t.id !== optimistic.id))
        toast.error('Ticket not created', { description: errorMessage(err) })
        return null
      }
    },
    [teams, meId],
  )

  const update = useCallback(
    (id: string, patch: TicketPatch) => {
      const before = ref.current.find((t) => t.id === id)
      if (!before) return
      const optimistic = applyPatch(before, patch, teams, ref.current)
      setTickets((prev) => prev.map((t) => (t.id === id ? optimistic : t)))
      logEvents(id, patch)
      if (USE_MOCK_API || id.startsWith('tmp-')) return
      api
        .patch<Ticket>(`/tickets/${encodeURIComponent(id)}`, patch)
        .then((saved) => setTickets((prev) => prev.map((t) => (t.id === id ? { ...saved, comments: mergeComments(t.comments, saved.comments) } : t))))
        .catch((err) => {
          // Roll back only if nothing else changed the ticket since.
          setTickets((prev) => prev.map((t) => (t.id === id && t.updatedAt === optimistic.updatedAt ? before : t)))
          setEvents((prev) => prev.filter((e) => !(e.ticketId === id && e.at >= optimistic.updatedAt)))
          toast.error(`${before.identifier} not updated`, { description: errorMessage(err) })
        })
    },
    [teams, logEvents],
  )

  const comment = useCallback(
    (id: string, body: string) => {
      const draft: TicketComment = { id: tempId('tmpc'), authorId: meId, body, createdAt: now() }
      const touch = (fn: (c: TicketComment[]) => TicketComment[]) => setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, comments: fn(t.comments), updatedAt: now() } : t)))
      touch((c) => [...c, draft])
      if (USE_MOCK_API || id.startsWith('tmp-')) return
      api
        .post<TicketComment>(`/tickets/${encodeURIComponent(id)}/comments`, { body })
        .then((saved) => touch((c) => c.map((x) => (x.id === draft.id ? saved : x))))
        .catch((err) => {
          touch((c) => c.filter((x) => x.id !== draft.id))
          toast.error('Comment not posted', { description: errorMessage(err) })
        })
    },
    [meId],
  )

  return { tickets, events, create, update, comment }
}

/** Keep optimistic comments that the server response doesn't know about yet. */
function mergeComments(local: TicketComment[], server: TicketComment[]) {
  const pending = local.filter((c) => c.id.startsWith('tmpc-'))
  return pending.length ? [...server, ...pending] : server
}
