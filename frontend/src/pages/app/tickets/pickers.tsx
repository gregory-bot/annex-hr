import { useState } from 'react'
import { Check, Plus, UserRound } from 'lucide-react'
import type { Employee, TicketPriority, TicketStatus, TicketTeam } from '@/data/types'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { LabelPill, PRIORITIES, PriorityIcon, STATUSES, StatusIcon, TeamDot, priorityLabel } from './meta'

/** Quiet, dense trigger used for inline properties. */
export const propButton =
  'inline-flex h-7 min-w-0 max-w-full items-center gap-2 rounded-md px-2 text-[13px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-70 data-[state=open]:bg-muted'

const stop = (e: React.SyntheticEvent) => e.stopPropagation()

export function StatusMenu({ value, onChange, disabled, children, align = 'start' }: { value: TicketStatus; onChange: (s: TicketStatus) => void; disabled?: boolean; children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled} onClick={stop}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48" onClick={stop}>
        {STATUSES.map((s, i) => (
          <DropdownMenuItem key={s} onSelect={() => s !== value && onChange(s)}>
            <StatusIcon status={s} />
            <span className="flex-1">{s}</span>
            {s === value ? <Check className="!text-foreground" /> : <span className="text-[11px] text-muted-foreground tabular">{i + 1}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PriorityMenu({ value, onChange, disabled, children, align = 'start' }: { value: TicketPriority; onChange: (p: TicketPriority) => void; disabled?: boolean; children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled} onClick={stop}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44" onClick={stop}>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => p !== value && onChange(p)}>
            <PriorityIcon priority={p} />
            <span className="flex-1">{priorityLabel[p]}</span>
            {p === value && <Check className="!text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TeamMenu({ teams, value, onChange, disabled, children }: { teams: TicketTeam[]; value: string; onChange: (id: string) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled} onClick={stop}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onClick={stop}>
        {teams.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => t.id !== value && onChange(t.id)}>
            <TeamDot color={t.color} />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{t.key}</span>
            {t.id === value && <Check className="!text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Searchable people picker; `suggested` (team-relevant people) are listed first. */
export function AssigneePicker({
  value,
  onChange,
  people,
  suggested,
  meId,
  disabled,
  children,
  align = 'start',
}: {
  value?: string
  onChange: (id: string | null) => void
  people: Employee[]
  suggested: Employee[]
  meId: string
  disabled?: boolean
  children: React.ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const sugIds = new Set(suggested.map((e) => e.id))
  const rest = people.filter((e) => !sugIds.has(e.id))
  const me = people.find((e) => e.id === meId)
  const choose = (id: string | null) => {
    setOpen(false)
    if (id !== (value ?? null)) onChange(id)
  }
  const item = (e: Employee) => (
    <CommandItem key={e.id} value={`${e.name} ${e.title} ${e.id}`} onSelect={() => choose(e.id)} className="gap-2 py-1.5">
      <PersonAvatar name={e.name} src={e.photo} className="size-5 text-[9px]" />
      <span className="truncate">{e.name}</span>
      <span className="ml-auto truncate text-[11px] text-muted-foreground">{e.title}</span>
      {e.id === value && <Check className="shrink-0" />}
    </CommandItem>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled} onClick={stop}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(20rem,calc(100vw-2rem))] p-0" onClick={stop}>
        <Command>
          <CommandInput placeholder="Assign to…" className="h-10" />
          <CommandList className="max-h-72">
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="no-assignee unassigned" onSelect={() => choose(null)} className="gap-2 py-1.5">
                <UserRound className="size-5 rounded-full border border-dashed p-0.5 text-muted-foreground" />
                No assignee
                {!value && <Check className="ml-auto" />}
              </CommandItem>
              {me && !sugIds.has(me.id) && item(me)}
            </CommandGroup>
            {suggested.length > 0 && <CommandGroup heading="Suggested for this team">{suggested.map(item)}</CommandGroup>}
            <CommandGroup heading="Everyone">{rest.filter((e) => e.id !== meId).map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Toggle existing labels or create a new one from the search text. */
export function LabelsPicker({ value, onChange, known, disabled, children }: { value: string[]; onChange: (labels: string[]) => void; known: string[]; disabled?: boolean; children: React.ReactNode }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const all = [...new Set([...value, ...known])].sort()
  const toggle = (l: string) => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l])
  return (
    <Popover onOpenChange={(o) => !o && setSearch('')}>
      <PopoverTrigger asChild disabled={disabled} onClick={stop}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" onClick={stop}>
        <Command>
          <CommandInput placeholder="Add labels…" value={search} onValueChange={setSearch} className="h-10" />
          <CommandList className="max-h-64">
            <CommandGroup>
              {q && !all.includes(q) && (
                <CommandItem value={`create ${q}`} onSelect={() => (toggle(q.slice(0, 32)), setSearch(''))} className="gap-2 py-1.5">
                  <Plus /> Create label <LabelPill label={q} />
                </CommandItem>
              )}
              {all.map((l) => (
                <CommandItem key={l} value={l} onSelect={() => toggle(l)} className="gap-2 py-1.5">
                  <span className={cn('flex size-4 items-center justify-center rounded border', value.includes(l) && 'border-primary bg-primary text-primary-foreground')}>
                    {value.includes(l) && <Check className="!size-3" />}
                  </span>
                  <LabelPill label={l} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
