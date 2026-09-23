import { useState } from 'react'
import { motion } from 'framer-motion'
import { BellRing, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { Section } from '@/components/shared/Section'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { ExpiryText, type DocRow } from './shared'

const groups = [
  { id: 'expired', title: 'Expired', test: (d: number) => d < 0, tone: 'danger' as const },
  { id: '30', title: 'Next 30 days', test: (d: number) => d >= 0 && d <= 30, tone: 'warning' as const },
  { id: '60', title: '31–60 days', test: (d: number) => d > 30 && d <= 60, tone: 'warning' as const },
  { id: '90', title: '61–90 days', test: (d: number) => d > 60 && d <= 90, tone: 'info' as const },
]

export function ExpiryAlerts({ docs, self }: { docs: DocRow[]; self: boolean }) {
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [offsets, setOffsets] = useState<Record<number, boolean>>({ 90: true, 60: true, 30: true, 7: true })
  const [recipients, setRecipients] = useState<Record<string, boolean>>({ Employee: true, Manager: true, HR: true })

  const dated = docs.filter((d) => d.expires)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid grid-cols-1 min-w-0 content-start gap-4">
        {groups.map((g, gi) => {
          const items = dated.filter((d) => g.test(daysUntil(d.expires!))).sort((a, b) => a.expires!.localeCompare(b.expires!))
          return (
            <motion.div key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
              <Section
                title={
                  <span className="flex items-center gap-2">
                    {g.title}
                    <Badge variant={g.tone}>{items.length}</Badge>
                  </span>
                }
                action={
                  items.length > 0 && !self ? (
                    <Button size="sm" variant="outline" onClick={() => toast.success(`${items.length} reminders sent via email & in-app`)}>
                      <Send /> <span className="hidden sm:inline">Remind all</span>
                    </Button>
                  ) : undefined
                }
              >
                {items.length === 0 ? (
                  <EmptyState title="All clear" description="No documents in this window." className="py-8" />
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {items.slice(0, 8).map((d) => (
                      <li key={d.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={cn('h-10 w-1 shrink-0 rounded-full', g.tone === 'danger' ? 'bg-danger' : g.tone === 'warning' ? 'bg-warning' : 'bg-info')} />
                          {self ? (
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{d.type}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(d.expires!)} · <ExpiryText date={d.expires} />
                              </div>
                            </div>
                          ) : (
                            <PersonCell
                              name={d.emp?.name ?? '—'}
                              sub={
                                <>
                                  {d.type} · {formatDate(d.expires!, 'short')} · <ExpiryText date={d.expires} />
                                </>
                              }
                            />
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="ghost" onClick={() => toast.success(self ? 'Reminder set for tomorrow' : `Reminder sent to ${d.emp?.name}`)}>
                            <BellRing /> {self ? 'Remind me' : 'Send reminder'}
                          </Button>
                          <Button
                            size="sm"
                            variant={requested.has(d.id) ? 'secondary' : 'outline'}
                            disabled={requested.has(d.id)}
                            onClick={() => {
                              setRequested((p) => new Set(p).add(d.id))
                              toast.success(self ? `Renewal request for your ${d.type} sent to HR` : `Renewal requested from ${d.emp?.name}`)
                            }}
                          >
                            <RefreshCw /> {requested.has(d.id) ? 'Requested' : 'Request renewal'}
                          </Button>
                        </div>
                      </li>
                    ))}
                    {items.length > 8 && <li className="p-3 text-center text-xs text-muted-foreground">+{items.length - 8} more</li>}
                  </ul>
                )}
              </Section>
            </motion.div>
          )
        })}
      </div>

      <Section title="Reminder automation" description="Sent by email and in-app notification" className="h-fit">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remind before expiry</div>
            <div className="grid grid-cols-1 gap-2">
              {[90, 60, 30, 7].map((n) => (
                <label key={n} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{n} days before</span>
                  <Switch
                    checked={offsets[n]}
                    disabled={self}
                    onCheckedChange={(v) => {
                      setOffsets((p) => ({ ...p, [n]: v }))
                      toast.success(`${n}-day reminder ${v ? 'on' : 'off'}`)
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipients</div>
            <div className="grid grid-cols-1 gap-2">
              {Object.keys(recipients).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={recipients[r]} disabled={self} onCheckedChange={(v) => setRecipients((p) => ({ ...p, [r]: v === true }))} />
                  {r === 'HR' ? 'HR team' : r === 'Manager' ? 'Line manager' : 'Employee'}
                </label>
              ))}
            </div>
          </div>
          {self && <p className="text-xs text-muted-foreground">Managed by HR. Contact HR to change reminder settings.</p>}
        </div>
      </Section>
    </div>
  )
}
