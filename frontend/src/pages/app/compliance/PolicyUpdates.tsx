import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Section } from '@/components/shared/Section'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { policyApi, type PolicyItem } from './api'

export function PolicyUpdates({ policies, headcount, self, onChanged }: { policies: PolicyItem[]; headcount: number; self: boolean; onChanged: () => void }) {
  const [reminded, setReminded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  const remind = async (p: PolicyItem) => {
    setBusy(p.id)
    try {
      const n = USE_MOCK_API ? Math.round(((100 - p.acknowledged) / 100) * headcount) : (await policyApi.remind(p.id)).reminded
      setReminded((s) => new Set(s).add(p.id))
      toast.success(n ? `Reminder sent to ${n} non-signer${n === 1 ? '' : 's'} of ${p.title}` : `Everyone has signed ${p.title}`)
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  const sorted = [...policies].sort((a, b) => b.updated.localeCompare(a.updated))

  return (
    <Section
      title="Policy updates & acknowledgements"
      description="Most recently updated first"
      action={
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/onboarding?tab=policies">
            {self ? 'Review & sign' : 'Manage policies'}
          </Link>
        </Button>
      }
    >
      <ul className="divide-y rounded-xl border">
        {sorted.map((p, i) => {
          const nonSigners = Math.round(((100 - p.acknowledged) / 100) * headcount)
          return (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center sm:p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{p.title}</span>
                  <Badge variant="muted">{p.version}</Badge>
                  {p.mandatory && <Badge variant="soft">Mandatory</Badge>}
                  {self && p.myAcknowledgement && (
                    <Badge variant="success" dot>
                      Signed
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  Updated {formatDate(p.updated)} · {p.history[0]?.note}
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">Acknowledged</span>
                  <span className="font-semibold tabular">{p.acknowledged}%</span>
                </div>
                <Progress value={p.acknowledged} className="h-1.5" tone={p.acknowledged >= 90 ? 'success' : p.acknowledged >= 75 ? 'primary' : 'warning'} />
              </div>
              {!self && (
                <Button
                  size="sm"
                  variant={reminded.has(p.id) ? 'secondary' : 'outline'}
                  disabled={nonSigners === 0 || reminded.has(p.id) || busy === p.id}
                  onClick={() => void remind(p)}
                >
                  {nonSigners === 0 ? 'All signed' : reminded.has(p.id) ? 'Reminded' : 'Remind non-signers'}
                </Button>
              )}
            </motion.li>
          )
        })}
      </ul>
    </Section>
  )
}
