import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowUpRight } from 'lucide-react'
import { useNotifications } from '@/context/notifications'
import { notificationMeta } from '@/components/layout/notificationMeta'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { Notification } from '@/data/types'

type Filter = 'all' | 'unread' | Exclude<Notification['type'], 'system'>

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'approval', label: 'Approvals' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'performance', label: 'Performance' },
  { value: 'policy', label: 'Policy' },
  { value: 'probation', label: 'Probation' },
  { value: 'document', label: 'Documents' },
]

type Resolution = 'approved' | 'declined' | 'done'

function useIsDesktop() {
  const q = '(min-width: 1024px)'
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setDesktop(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return desktop
}

const isRecent = (t: string) => t === 'Just now' || t.endsWith('ago')

export default function Notifications() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [resolved, setResolved] = useState<Record<string, Resolution>>({})
  const [prefs, setPrefs] = useState({ email: true, inapp: true, sms: false, whatsapp: true })

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, unread: items.filter((n) => !n.read).length }
    for (const f of filters.slice(2)) c[f.value] = items.filter((n) => n.type === f.value).length
    return c
  }, [items])

  const visible = useMemo(
    () => items.filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.read : n.type === filter)),
    [items, filter],
  )
  const groups = [
    { label: 'Today', items: visible.filter((n) => isRecent(n.time)) },
    { label: 'Earlier', items: visible.filter((n) => !isRecent(n.time)) },
  ].filter((g) => g.items.length)

  const selected = items.find((n) => n.id === selectedId) ?? (desktop ? visible[0] : undefined)

  const select = (n: Notification) => {
    setSelectedId(n.id)
    if (!n.read) markRead(n.id)
    if (!desktop) setSheetOpen(true)
  }

  const open = (n: Notification) => {
    markRead(n.id)
    setSheetOpen(false)
    navigate(n.href)
  }

  const resolve = (n: Notification, r: Resolution, message: string, description?: string) => {
    setResolved((p) => ({ ...p, [n.id]: r }))
    markRead(n.id)
    if (r === 'declined') toast(message, { description })
    else toast.success(message, { description })
  }

  const togglePref = (key: keyof typeof prefs, label: string) => {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] }
      toast.success(`${label} notifications ${next[key] ? 'on' : 'off'}`)
      return next
    })
  }

  const preview = selected ? (
    <Preview notification={selected} resolution={resolved[selected.id]} onOpen={() => open(selected)} onResolve={(r, m, d) => resolve(selected, r, m, d)} />
  ) : null

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description={unread ? `You have ${unread} unread notification${unread > 1 ? 's' : ''}. Approvals and alerts arrive here in real time.` : 'You are all caught up. New approvals and alerts arrive here in real time.'}
        actions={
          <Button
            variant="outline"
            disabled={!unread}
            onClick={() => {
              markAllRead()
              toast.success('All notifications marked as read')
            }}
          >
            Mark all read
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <LayoutGroup id="notif-filters">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
              {filters.map((f) => {
                const active = filter === f.value
                const count = counts[f.value] ?? 0
                return (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                      active ? 'border-transparent text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {active && <motion.span layoutId="notif-chip" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                    <span className="relative">{f.label}</span>
                    <motion.span
                      key={count}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={cn(
                        'relative min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular leading-5',
                        active ? 'bg-white/20 text-white' : f.value === 'unread' && count ? 'bg-accent text-primary' : 'bg-muted',
                      )}
                    >
                      {count}
                    </motion.span>
                  </button>
                )
              })}
            </div>
          </LayoutGroup>

          <Card className="overflow-hidden">
            {visible.length === 0 ? (
              <EmptyState
                title={filter === 'unread' ? 'No unread notifications' : 'Nothing here yet'}
                description={filter === 'unread' ? 'Everything has been read. Nice work.' : 'Notifications in this category will appear here.'}
                className="py-14"
              />
            ) : (
              groups.map((g) => (
                <div key={g.label}>
                  <div className="border-b bg-subtle px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                  <ul className="divide-y">
                    <AnimatePresence initial={false}>
                      {g.items.map((n, i) => (
                        <NotificationRow key={n.id} n={n} index={i} active={desktop && selected?.id === n.id} resolution={resolved[n.id]} onSelect={() => select(n)} onOpen={() => open(n)} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {desktop && (
            <div className="lg:sticky lg:top-20">
              <Card className="overflow-hidden">
                <AnimatePresence mode="wait">
                  {preview ? (
                    <motion.div key={selected!.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                      {preview}
                    </motion.div>
                  ) : (
                    <EmptyState title="Select a notification" description="Details and quick actions appear here." className="py-14" />
                  )}
                </AnimatePresence>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Notification preferences</CardTitle>
              <CardDescription className="mt-1">Choose where Annex HR reaches you. Approvals are always shown in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {(
                [
                  { key: 'email', label: 'Email', hint: 'Daily digest and approval requests' },
                  { key: 'inapp', label: 'In-app', hint: 'Real-time bell and toast alerts' },
                  { key: 'sms', label: 'SMS', hint: 'Urgent payroll and compliance alerts' },
                  { key: 'whatsapp', label: 'WhatsApp', hint: 'Leave approvals and payslip notices' },
                ] as const
              ).map((c) => (
                <div key={c.key} className="flex items-center gap-3 rounded-lg px-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`pref-${c.key}`} className="cursor-pointer text-sm font-medium">
                      {c.label}
                    </Label>
                    <div className="truncate text-xs text-muted-foreground">{c.hint}</div>
                  </div>
                  <Switch id={`pref-${c.key}`} checked={prefs[c.key]} onCheckedChange={() => togglePref(c.key, c.label)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {!desktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetTitle className="sr-only">{selected?.title ?? 'Notification'}</SheetTitle>
            <SheetDescription className="sr-only">Notification details and actions</SheetDescription>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
            {preview}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

function NotificationRow({
  n,
  index,
  active,
  resolution,
  onSelect,
  onOpen,
}: {
  n: Notification
  index: number
  active: boolean
  resolution?: Resolution
  onSelect: () => void
  onOpen: () => void
}) {
  const meta = notificationMeta[n.type]
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0, transition: { delay: Math.min(index, 8) * 0.03 } }}
      exit={{ opacity: 0, x: 16 }}
      className={cn('group relative', active && 'bg-accent/50')}
    >
      {active && <motion.span layoutId="notif-active" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
      >
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', meta.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={cn('min-w-0 flex-1 text-sm leading-snug', n.read ? 'text-muted-foreground' : 'font-semibold text-foreground')}>{n.title}</p>
            <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{n.time}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge variant="muted">{meta.label}</Badge>
            {resolution && <Badge variant={resolution === 'declined' ? 'danger' : 'success'}>{resolution === 'approved' ? 'Approved' : resolution === 'declined' ? 'Declined' : 'Done'}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 self-stretch">
          <AnimatePresence>
            {!n.read && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="mt-1.5 size-2 rounded-full bg-primary" aria-label="Unread" />}
          </AnimatePresence>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            aria-label="Open"
            className="mt-auto rounded-md p-1 text-muted-foreground opacity-100 transition hover:bg-muted hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100"
          >
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>
    </motion.li>
  )
}

function Preview({
  notification: n,
  resolution,
  onOpen,
  onResolve,
}: {
  notification: Notification
  resolution?: Resolution
  onOpen: () => void
  onResolve: (r: Resolution, message: string, description?: string) => void
}) {
  const meta = notificationMeta[n.type]

  const actions: Record<Notification['type'], { label: string; run: () => void }> = {
    approval: { label: 'Approve', run: () => onResolve('approved', 'Request approved', 'The requester has been notified.') },
    payroll: { label: 'Approve payroll', run: () => onResolve('approved', 'Payroll approved', 'Disbursement scheduled and journal queued for Odoo sync.') },
    document: { label: 'Send renewal reminder', run: () => onResolve('done', 'Reminder sent', 'Email and WhatsApp reminder delivered.') },
    probation: { label: 'Schedule review', run: () => onResolve('done', 'Review scheduled', 'Calendar invite sent for Monday, 28 Sep at 10:00.') },
    policy: { label: 'Nudge pending staff', run: () => onResolve('done', 'Reminder sent', 'Employees yet to acknowledge have been nudged.') },
    performance: { label: 'Remind reviewers', run: () => onResolve('done', 'Reminder sent', 'Managers with open reviews were notified.') },
    leave: { label: 'Approve', run: () => onResolve('approved', 'Approved', 'Timesheet approved and sent to Finance.') },
    system: { label: 'Acknowledge', run: () => onResolve('done', 'Acknowledged') },
  }
  const primary = actions[n.type]
  const canDecline = n.type === 'approval' || n.type === 'payroll' || n.type === 'leave'

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', meta.dot)} aria-hidden />
        <span className="font-medium text-foreground">{meta.label}</span>
        <span aria-hidden>·</span>
        <span>{n.time}</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold leading-snug">{n.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{n.body}</p>

      <div className="mt-5 rounded-lg border bg-subtle p-3 text-xs text-muted-foreground">
        <div className="flex justify-between gap-3">
          <span>Status</span>
          <span className="font-medium text-foreground">{resolution ? { approved: 'Approved', declined: 'Declined', done: 'Actioned' }[resolution] : n.read ? 'Read' : 'Unread'}</span>
        </div>
        <div className="mt-1.5 flex justify-between gap-3">
          <span>Delivered via</span>
          <span className="font-medium text-foreground">In-app · Email</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
        {resolution ? (
          <div className={cn('flex flex-1 items-center justify-center rounded-lg py-2 text-sm font-medium', resolution === 'declined' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
            {resolution === 'approved' ? 'Approved' : resolution === 'declined' ? 'Declined' : 'Done'}
          </div>
        ) : (
          <>
            <Button className="flex-1" onClick={primary.run}>
              {primary.label}
            </Button>
            {canDecline && (
              <Button variant="outline" className="flex-1" onClick={() => onResolve('declined', 'Declined', 'The requester has been notified with your comment.')}>
                Decline
              </Button>
            )}
          </>
        )}
      </div>
      <Button variant="ghost" className="mt-2 w-full" onClick={onOpen}>
        Open in {meta.label}
      </Button>
    </div>
  )
}
