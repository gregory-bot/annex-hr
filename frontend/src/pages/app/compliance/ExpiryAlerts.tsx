import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import { Section } from '@/components/shared/Section'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { complianceApi, type ComplianceItem } from './api'
import { ExpiryText, type DocRow } from './shared'

const groups = [
  { id: 'expired', title: 'Expired', test: (d: number) => d < 0, tone: 'danger' as const },
  { id: '30', title: 'Next 30 days', test: (d: number) => d >= 0 && d <= 30, tone: 'warning' as const },
  { id: '60', title: '31–60 days', test: (d: number) => d > 30 && d <= 60, tone: 'warning' as const },
  { id: '90', title: '61–90 days', test: (d: number) => d > 60 && d <= 90, tone: 'info' as const },
]

const sentToday = (at?: string | null) => !!at && at.slice(0, 10) === new Date().toISOString().slice(0, 10)

export function ExpiryAlerts({ docs, self, onSaved }: { docs: DocRow[]; self: boolean; onSaved: (d: ComplianceItem) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const dated = docs.filter((d) => d.expires)

  const remind = async (d: DocRow, renewal: boolean) => {
    setBusy(`${d.id}-${renewal}`)
    try {
      const next = USE_MOCK_API ? { ...d, remindedAt: new Date().toISOString(), requestedAt: renewal ? new Date().toISOString() : d.requestedAt } : await complianceApi.remind(d.id, renewal)
      onSaved(next)
      toast.success(renewal ? `Renewal requested from ${d.emp?.name}` : `Reminder sent to ${d.emp?.name}`, { description: 'In-app notification and email.' })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const remindAll = async (id: string, items: DocRow[]) => {
    setBusy(id)
    try {
      const n = USE_MOCK_API ? items.length : (await complianceApi.remindMany(items.map((d) => d.id))).reminded
      const at = new Date().toISOString()
      items.forEach((d) => onSaved({ ...d, remindedAt: at }))
      toast.success(`${n} reminder${n === 1 ? '' : 's'} sent`, { description: 'In-app notification and email.' })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                    <Button size="sm" variant="outline" disabled={busy === g.id} onClick={() => void remindAll(g.id, items)}>
                      Remind all
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
                                  {d.remindedAt && ` · reminded ${formatDate(d.remindedAt.slice(0, 10), 'short')}`}
                                </>
                              }
                            />
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {self ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link to="/app/compliance?tab=documents">Upload renewal</Link>
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" disabled={busy === `${d.id}-false` || sentToday(d.remindedAt)} onClick={() => void remind(d, false)}>
                                {sentToday(d.remindedAt) ? 'Reminded today' : 'Send reminder'}
                              </Button>
                              <Button
                                size="sm"
                                variant={d.requestedAt ? 'secondary' : 'outline'}
                                disabled={busy === `${d.id}-true`}
                                onClick={() => void remind(d, true)}
                              >
                                {d.requestedAt ? 'Request again' : 'Request renewal'}
                              </Button>
                            </>
                          )}
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

      <Section title="Automatic reminders" description="Expiry reminders by email and in-app notification" className="h-fit">
        <p className="text-sm text-muted-foreground">
          {self
            ? 'HR sends reminders before your documents expire. Upload the renewed copy from My documents.'
            : 'When reminders go out (e.g. 90, 60, 30 and 7 days before expiry) and who receives them is configured in automations.'}
        </p>
        {!self && (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/app/settings?tab=automations">Managed in Settings → Automations</Link>
          </Button>
        )}
      </Section>
    </div>
  )
}
