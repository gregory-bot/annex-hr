import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, CornerDownLeft, Tag, UserRound, X } from 'lucide-react'
import type { Employee, TicketPriority, TicketStatus, TicketTeam } from '@/data/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { LabelPill, PriorityIcon, StatusIcon, TeamDot, priorityLabel } from './meta'
import { AssigneePicker, PriorityMenu, StatusMenu, TeamMenu, propButton } from './pickers'
import type { NewTicket } from './useTickets'

const chip = cn(propButton, 'h-7 border bg-card px-2 text-[12px]')

export function CreateTicketDialog({
  open,
  onOpenChange,
  teams,
  defaultTeamId,
  defaultStatus = 'Todo',
  people,
  suggestedFor,
  meId,
  knownLabels,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  teams: TicketTeam[]
  defaultTeamId?: string
  defaultStatus?: TicketStatus
  people: Employee[]
  suggestedFor: (teamId: string) => Employee[]
  meId: string
  knownLabels: string[]
  onCreate: (t: NewTicket) => Promise<boolean>
}) {
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TicketStatus>(defaultStatus)
  const [priority, setPriority] = useState<TicketPriority>('None')
  const [assigneeId, setAssigneeId] = useState<string | undefined>()
  const [labels, setLabels] = useState<string[]>([])
  const [labelDraft, setLabelDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTeamId(defaultTeamId ?? teams[0]?.id ?? '')
    setStatus(defaultStatus)
  }, [open, defaultTeamId, defaultStatus, teams])

  const team = teams.find((t) => t.id === teamId)
  const assignee = people.find((e) => e.id === assigneeId)
  const suggested = useMemo(() => suggestedFor(teamId), [suggestedFor, teamId])

  const reset = () => {
    setTitle('')
    setDescription('')
    setPriority('None')
    setAssigneeId(undefined)
    setLabels([])
    setLabelDraft('')
  }

  const toLabels = (raw: string) =>
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase().slice(0, 32))
      .filter(Boolean)
  const addLabels = (parts: string[]) => parts.length && setLabels((l) => [...new Set([...l, ...parts])].slice(0, 10))
  const commitLabelDraft = () => {
    const parts = toLabels(labelDraft)
    addLabels(parts)
    setLabelDraft('')
    return parts
  }
  const onLabelInput = (v: string) => {
    if (!v.includes(',')) return setLabelDraft(v)
    const i = v.lastIndexOf(',')
    addLabels(toLabels(v.slice(0, i)))
    setLabelDraft(v.slice(i + 1).trimStart())
  }

  const submit = async () => {
    if (busy || title.trim().length < 3 || !teamId) return
    const extra = labelDraft.trim() ? commitLabelDraft() : []
    setBusy(true)
    const ok = await onCreate({ teamId, title: title.trim(), description: description.trim(), status, priority, assigneeId, labels: [...new Set([...labels, ...extra])] })
    setBusy(false)
    if (ok) {
      reset()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[8%] max-w-2xl translate-y-0 gap-0 p-0 sm:top-[14%]"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <div className="flex items-center gap-1.5 px-4 pt-4 text-[13px] text-muted-foreground">
          <TeamMenu teams={teams} value={teamId} onChange={setTeamId}>
            <button className={chip} aria-label="Team">
              {team && <TeamDot color={team.color} />}
              <span className="font-medium text-foreground">{team?.key ?? 'Team'}</span>
            </button>
          </TeamMenu>
          <ChevronRight className="size-3.5" />
          <DialogTitle className="text-[13px] font-medium text-foreground">New ticket</DialogTitle>
        </div>
        <DialogDescription className="sr-only">Create a ticket for {team?.name ?? 'a team'}.</DialogDescription>

        <div className="px-4 pt-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                ;(e.currentTarget.parentElement?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus()
              }
            }}
            maxLength={200}
            placeholder="Ticket title"
            aria-label="Title"
            className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description — what happened, what you expected, anything that helps the team…"
            aria-label="Description"
            className="mt-1 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          <StatusMenu value={status} onChange={setStatus}>
            <button className={chip}>
              <StatusIcon status={status} />
              {status}
            </button>
          </StatusMenu>
          <PriorityMenu value={priority} onChange={setPriority}>
            <button className={chip}>
              <PriorityIcon priority={priority} />
              {priority === 'None' ? 'Priority' : priorityLabel[priority]}
            </button>
          </PriorityMenu>
          <AssigneePicker value={assigneeId} onChange={(id) => setAssigneeId(id ?? undefined)} people={people} suggested={suggested} meId={meId}>
            <button className={chip}>
              {assignee ? <PersonAvatar name={assignee.name} src={assignee.photo} className="size-4 text-[8px]" /> : <UserRound className="size-3.5 text-muted-foreground" />}
              <span className="max-w-[9rem] truncate">{assignee?.name ?? 'Assignee'}</span>
            </button>
          </AssigneePicker>
        </div>

        {/* Chip input: type and press Enter or comma */}
        <div className="mx-4 mb-3 flex min-h-9 flex-wrap items-center gap-1 rounded-lg border px-2 py-1 focus-within:border-primary">
          <Tag className="size-3.5 shrink-0 text-muted-foreground" />
          {labels.map((l) => (
            <span key={l} className="inline-flex items-center gap-0.5">
              <LabelPill label={l} />
              <button type="button" onClick={() => setLabels((x) => x.filter((y) => y !== l))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${l}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={labelDraft}
            onChange={(e) => onLabelInput(e.target.value)}
            list="ticket-label-suggestions"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && labelDraft.trim()) {
                e.preventDefault()
                commitLabelDraft()
              } else if (e.key === 'Backspace' && !labelDraft && labels.length) setLabels((l) => l.slice(0, -1))
            }}
            onBlur={() => labelDraft.trim() && commitLabelDraft()}
            placeholder={labels.length ? '' : 'Labels, comma-separated'}
            aria-label="Labels"
            className="h-6 min-w-[8rem] flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <datalist id="ticket-label-suggestions">
            {knownLabels.filter((l) => !labels.includes(l)).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <span className="hidden items-center gap-1 text-[12px] text-muted-foreground sm:inline-flex">
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘</kbd>
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
              <CornerDownLeft className="inline size-2.5" />
            </kbd>
            to create
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy || title.trim().length < 3}>
              {busy ? 'Creating…' : 'Create ticket'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
