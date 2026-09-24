import type { TicketPriority, TicketStatus } from '@/data/types'
import { cn } from '@/lib/utils'

/** List grouping order (active work first), like Linear. */
export const STATUS_GROUP_ORDER: TicketStatus[] = ['In Progress', 'In Review', 'Todo', 'Backlog', 'Done', 'Canceled']
/** Workflow order used by menus and the board. */
export const STATUSES: TicketStatus[] = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled']
export const PRIORITIES: TicketPriority[] = ['Urgent', 'High', 'Medium', 'Low', 'None']
export const PRIORITY_RANK: Record<TicketPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3, None: 4 }

export const statusTone: Record<TicketStatus, string> = {
  Backlog: 'text-muted-foreground',
  Todo: 'text-muted-foreground',
  'In Progress': 'text-warning',
  'In Review': 'text-info',
  Done: 'text-success',
  Canceled: 'text-muted-foreground',
}

export const priorityLabel: Record<TicketPriority, string> = { Urgent: 'Urgent', High: 'High', Medium: 'Medium', Low: 'Low', None: 'No priority' }

/** Linear-style status glyphs, drawn at 14px. */
export function StatusIcon({ status, className }: { status: TicketStatus; className?: string }) {
  const cls = cn('size-3.5 shrink-0', statusTone[status], className)
  const C = 2 * Math.PI * 3.5
  switch (status) {
    case 'Backlog':
      return (
        <svg viewBox="0 0 14 14" className={cls} fill="none" aria-label="Backlog">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.4 1.75" />
        </svg>
      )
    case 'Todo':
      return (
        <svg viewBox="0 0 14 14" className={cls} fill="none" aria-label="Todo">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'In Progress':
    case 'In Review': {
      const frac = status === 'In Progress' ? 0.5 : 0.75
      return (
        <svg viewBox="0 0 14 14" className={cls} fill="none" aria-label={status}>
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="1.75" stroke="currentColor" strokeWidth="3.5" strokeDasharray={`${(C / 2) * frac} ${C}`} transform="rotate(-90 7 7)" />
        </svg>
      )
    }
    case 'Done':
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-label="Done">
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="M4.3 7.2 6.2 9l3.6-3.8" fill="none" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'Canceled':
      return (
        <svg viewBox="0 0 14 14" className={cls} aria-label="Canceled">
          <circle cx="7" cy="7" r="6.5" fill="currentColor" />
          <path d="m4.8 4.8 4.4 4.4m0-4.4-4.4 4.4" stroke="var(--card)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
  }
}

/** Signal bars for priority; urgent is a filled exclamation square. */
export function PriorityIcon({ priority, className }: { priority: TicketPriority; className?: string }) {
  const cls = cn('size-3.5 shrink-0', className)
  if (priority === 'Urgent') {
    return (
      <svg viewBox="0 0 14 14" className={cn(cls, 'text-primary')} aria-label="Urgent priority">
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.8v4" stroke="var(--card)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="10.1" r="0.95" fill="var(--card)" />
      </svg>
    )
  }
  if (priority === 'None') {
    return (
      <svg viewBox="0 0 14 14" className={cn(cls, 'text-muted-foreground')} aria-label="No priority">
        {[2.5, 7, 11.5].map((x) => (
          <rect key={x} x={x - 1} y="6.25" width="2" height="1.5" rx="0.5" fill="currentColor" />
        ))}
      </svg>
    )
  }
  const level = priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1
  return (
    <svg viewBox="0 0 14 14" className={cn(cls, 'text-foreground')} aria-label={`${priority} priority`}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4.25} y={9 - i * 3} width="2.75" height={4 + i * 3} rx="0.75" fill="currentColor" opacity={i < level ? 0.85 : 0.2} />
      ))}
    </svg>
  )
}

/** Compact relative time: "now", "12m", "5h", "3d", then "12 Sep". */
export function relTime(iso: string) {
  const t = new Date(iso).getTime()
  const mins = Math.round((Date.now() - t) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Longer relative phrase for the activity feed. */
export function relPhrase(iso: string) {
  const r = relTime(iso)
  if (r === 'now') return 'just now'
  return /\d$/.test(r) ? r : `${r} ago`
}

function hue(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

export function LabelPill({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 max-w-[9rem] items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium text-muted-foreground', className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `hsl(${hue(label)} 55% 52%)` }} />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function TeamDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('size-2 shrink-0 rounded-[3px]', className)} style={{ backgroundColor: color }} />
}

/** True when the keyboard event originates from a text field (so single-key shortcuts should not fire). */
export function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('[role="dialog"],[role="menu"],[role="listbox"]')
}
