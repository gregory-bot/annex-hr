import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { CalendarDays, Copy, Link2, Tag, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { Employee, Ticket, TicketTeam } from '@/data/types'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dayPickerClasses } from '@/components/shared/DatePicker'
import { LabelPill, PriorityIcon, StatusIcon, TeamDot, priorityLabel, relPhrase } from './meta'
import { AssigneePicker, LabelsPicker, PriorityMenu, StatusMenu, TeamMenu, propButton } from './pickers'
import type { TicketEvent, TicketPatch } from './useTickets'

const toIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function TicketSheet({
  ticket,
  open,
  onOpenChange,
  teams,
  people,
  employee,
  suggestedFor,
  meId,
  canEdit,
  knownLabels,
  events,
  onUpdate,
  onComment,
}: {
  ticket: Ticket | null
  open: boolean
  onOpenChange: (o: boolean) => void
  teams: TicketTeam[]
  people: Employee[]
  employee: (id?: string) => Employee | undefined
  suggestedFor: (teamId: string) => Employee[]
  meId: string
  canEdit: (t: Ticket) => boolean
  knownLabels: string[]
  events: TicketEvent[]
  onUpdate: (id: string, patch: TicketPatch) => void
  onComment: (id: string, body: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl lg:max-w-3xl"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          // Focus the panel itself rather than the first icon button.
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        {ticket ? (
          <Body
            key={ticket.id}
            ticket={ticket}
            teams={teams}
            people={people}
            employee={employee}
            suggestedFor={suggestedFor}
            meId={meId}
            editable={canEdit(ticket)}
            knownLabels={knownLabels}
            events={events.filter((e) => e.ticketId === ticket.id)}
            onUpdate={(p) => onUpdate(ticket.id, p)}
            onComment={(b) => onComment(ticket.id, b)}
          />
        ) : (
          <SheetTitle className="sr-only">Ticket</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Body({
  ticket: t,
  teams,
  people,
  employee,
  suggestedFor,
  meId,
  editable,
  knownLabels,
  events,
  onUpdate,
  onComment,
}: {
  ticket: Ticket
  teams: TicketTeam[]
  people: Employee[]
  employee: (id?: string) => Employee | undefined
  suggestedFor: (teamId: string) => Employee[]
  meId: string
  editable: boolean
  knownLabels: string[]
  events: TicketEvent[]
  onUpdate: (p: TicketPatch) => void
  onComment: (body: string) => void
}) {
  const team = teams.find((x) => x.id === t.teamId)
  const assignee = employee(t.assigneeId)
  const reporter = employee(t.reporterId)
  const canSelfAssign = !editable && !t.assigneeId

  const [title, setTitle] = useState(t.title)
  const [desc, setDesc] = useState(t.description)
  useEffect(() => setTitle(t.title), [t.title])
  useEffect(() => setDesc(t.description), [t.description])

  const titleRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  const saveTitle = () => {
    const v = title.trim()
    if (v.length < 3) return setTitle(t.title)
    if (v !== t.title) onUpdate({ title: v })
  }
  const saveDesc = () => desc.trim() !== t.description && onUpdate({ description: desc.trim() })

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => undefined,
    )
  }

  const due = t.dueDate ? daysUntil(t.dueDate) : null
  const closed = t.status === 'Done' || t.status === 'Canceled'

  const props = (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-[13px]">
      <span className="text-muted-foreground">Status</span>
      <StatusMenu value={t.status} onChange={(status) => onUpdate({ status })} disabled={!editable}>
        <button className={propButton}>
          <StatusIcon status={t.status} />
          {t.status}
        </button>
      </StatusMenu>

      <span className="text-muted-foreground">Priority</span>
      <PriorityMenu value={t.priority} onChange={(priority) => onUpdate({ priority })} disabled={!editable}>
        <button className={propButton}>
          <PriorityIcon priority={t.priority} />
          {priorityLabel[t.priority]}
        </button>
      </PriorityMenu>

      <span className="text-muted-foreground">Assignee</span>
      <div className="flex min-w-0 items-center gap-1">
        <AssigneePicker value={t.assigneeId} onChange={(assigneeId) => onUpdate({ assigneeId })} people={people} suggested={suggestedFor(t.teamId)} meId={meId} disabled={!editable}>
          <button className={propButton}>
            {assignee ? <PersonAvatar name={assignee.name} src={assignee.photo} className="size-5 text-[9px]" /> : <UserRound className="size-4 text-muted-foreground" />}
            <span className={cn('truncate', !assignee && 'text-muted-foreground')}>{assignee?.name ?? 'Unassigned'}</span>
          </button>
        </AssigneePicker>
        {canSelfAssign && (
          <button className={cn(propButton, 'text-primary')} onClick={() => onUpdate({ assigneeId: meId })}>
            Assign to me
          </button>
        )}
      </div>

      <span className="self-start pt-1 text-muted-foreground">Labels</span>
      <LabelsPicker value={t.labels} onChange={(labels) => onUpdate({ labels })} known={knownLabels} disabled={!editable}>
        <button className={cn(propButton, 'h-auto min-h-7 flex-wrap py-1')}>
          {t.labels.length ? t.labels.map((l) => <LabelPill key={l} label={l} />) : <span className="inline-flex items-center gap-2 text-muted-foreground"><Tag className="size-3.5" /> Add label</span>}
        </button>
      </LabelsPicker>

      <span className="text-muted-foreground">Team</span>
      <TeamMenu teams={teams} value={t.teamId} onChange={(teamId) => onUpdate({ teamId })} disabled={!editable}>
        <button className={propButton}>
          {team && <TeamDot color={team.color} />}
          <span className="truncate">{team?.name ?? '—'}</span>
        </button>
      </TeamMenu>

      <span className="text-muted-foreground">Due date</span>
      <Popover>
        <PopoverTrigger asChild disabled={!editable}>
          <button className={cn(propButton, due !== null && due < 0 && !closed && 'text-danger')}>
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {t.dueDate ? `${formatDate(t.dueDate, 'short')}${due !== null && !closed ? (due < 0 ? ' · overdue' : due === 0 ? ' · today' : ` · in ${due}d`) : ''}` : <span className="text-muted-foreground">Set due date</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="relative w-auto p-3">
          <DayPicker mode="single" selected={t.dueDate ? new Date(t.dueDate) : undefined} onSelect={(d) => onUpdate({ dueDate: d ? toIsoDay(d) : null })} classNames={dayPickerClasses} />
          {t.dueDate && (
            <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onUpdate({ dueDate: null })}>
              Clear due date
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground">Reporter</span>
      <div className="flex h-7 min-w-0 items-center gap-2 px-2">
        {reporter && <PersonAvatar name={reporter.name} src={reporter.photo} className="size-5 text-[9px]" />}
        <span className="truncate">{reporter?.name ?? 'Former employee'}</span>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card/95 px-4 pr-12 backdrop-blur">
        {team && <TeamDot color={team.color} />}
        <span className="text-[13px] text-muted-foreground">{team?.name}</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-mono text-[12px] text-muted-foreground">{t.identifier}</span>
        <div className="ml-auto flex items-center">
          <button className={cn(propButton, 'px-1.5')} onClick={() => copy(t.identifier, 'Ticket ID')} aria-label="Copy ticket ID" title="Copy ID">
            <Copy className="size-3.5 text-muted-foreground" />
          </button>
          <button className={cn(propButton, 'px-1.5')} onClick={() => copy(`${window.location.origin}/app/tickets?id=${encodeURIComponent(t.id)}`, 'Link')} aria-label="Copy link" title="Copy link">
            <Link2 className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 px-4 py-5 sm:px-6">
          <SheetTitle asChild>
            <textarea
              ref={titleRef}
              value={title}
              readOnly={!editable}
              rows={1}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') {
                  setTitle(t.title)
                }
              }}
              aria-label="Title"
              className="block w-full resize-none overflow-hidden bg-transparent text-xl font-semibold leading-snug tracking-tight outline-none"
            />
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t.identifier} · {t.status} · {priorityLabel[t.priority]}
          </SheetDescription>
          <Textarea
            value={desc}
            readOnly={!editable}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={saveDesc}
            placeholder={editable ? 'Add a description…' : 'No description.'}
            aria-label="Description"
            className="mt-2 min-h-[96px] resize-none border-0 bg-transparent px-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
          />

          {/* Properties inline on small screens */}
          <div className="my-4 rounded-lg border p-2 lg:hidden">{props}</div>

          <Activity ticket={t} events={events} employee={employee} teams={teams} onComment={onComment} me={employee(meId)} />
        </div>

        <aside className="hidden border-l px-3 py-5 lg:block">{props}</aside>
      </div>
    </div>
  )
}

type FeedItem = { kind: 'created'; at: string } | { kind: 'event'; at: string; e: TicketEvent } | { kind: 'comment'; at: string; c: Ticket['comments'][number] }

function Activity({ ticket: t, events, employee, teams, onComment, me }: { ticket: Ticket; events: TicketEvent[]; employee: (id?: string) => Employee | undefined; teams: TicketTeam[]; onComment: (b: string) => void; me?: Employee }) {
  const [draft, setDraft] = useState('')
  const feed = useMemo<FeedItem[]>(
    () =>
      [
        { kind: 'created' as const, at: t.createdAt },
        ...events.map((e) => ({ kind: 'event' as const, at: e.at, e })),
        ...t.comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [t.createdAt, t.comments, events],
  )
  const send = () => {
    const body = draft.trim()
    if (!body) return
    onComment(body)
    setDraft('')
  }
  const name = (id?: string) => employee(id)?.name ?? 'Someone'
  const eventText = (e: TicketEvent) => {
    switch (e.field) {
      case 'status':
        return <>changed status to <b className="font-medium text-foreground">{e.to}</b></>
      case 'priority':
        return <>set priority to <b className="font-medium text-foreground">{e.to === 'None' ? 'No priority' : e.to}</b></>
      case 'assignee':
        return e.to ? <>assigned to <b className="font-medium text-foreground">{e.to === e.actorId ? 'themselves' : name(e.to)}</b></> : <>removed the assignee</>
      case 'labels':
        return e.to ? <>set labels to <b className="font-medium text-foreground">{e.to}</b></> : <>removed all labels</>
      case 'team':
        return <>moved to <b className="font-medium text-foreground">{teams.find((x) => x.id === e.to)?.name ?? 'another team'}</b></>
      case 'due':
        return e.to ? <>set the due date to <b className="font-medium text-foreground">{formatDate(e.to, 'short')}</b></> : <>cleared the due date</>
      case 'title':
        return <>renamed the ticket</>
      case 'description':
        return <>updated the description</>
    }
  }

  return (
    <section className="mt-2 border-t pt-5">
      <h3 className="mb-3 text-[13px] font-semibold">Activity</h3>
      <ol className="relative space-y-3">
        {feed.map((item) =>
          item.kind === 'comment' ? (
            <li key={item.c.id} className="rounded-lg border bg-card">
              <div className="flex items-center gap-2 px-3 pt-2.5 text-[13px]">
                <PersonAvatar name={name(item.c.authorId)} src={employee(item.c.authorId)?.photo} className="size-5 text-[9px]" />
                <span className="truncate font-medium">{name(item.c.authorId)}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">{relPhrase(item.c.createdAt)}</span>
              </div>
              <p className={cn('whitespace-pre-wrap break-words px-3 pb-3 pt-1.5 text-[13.5px] leading-relaxed', item.c.id.startsWith('tmpc-') && 'opacity-60')}>{item.c.body}</p>
            </li>
          ) : (
            <li key={item.kind === 'event' ? item.e.id : 'created'} className="flex min-w-0 items-center gap-2 pl-1 text-[12.5px] text-muted-foreground">
              <span className="flex size-4 shrink-0 items-center justify-center">
                <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              </span>
              <span className="min-w-0">
                <span className="font-medium text-foreground">{name(item.kind === 'event' ? item.e.actorId : t.reporterId)}</span>{' '}
                {item.kind === 'event' ? eventText(item.e) : 'created the ticket'} · {relPhrase(item.at)}
              </span>
            </li>
          ),
        )}
      </ol>

      <div className="mt-4 rounded-lg border bg-card focus-within:border-primary">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Leave a comment…"
          aria-label="Comment"
          className="min-h-[72px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            {me && <PersonAvatar name={me.name} src={me.photo} className="size-4 text-[8px]" />}
            <span className="hidden truncate sm:inline">⌘ + Enter to send</span>
          </span>
          <Button size="sm" variant="secondary" onClick={send} disabled={!draft.trim()}>
            Comment
          </Button>
        </div>
      </div>
    </section>
  )
}
