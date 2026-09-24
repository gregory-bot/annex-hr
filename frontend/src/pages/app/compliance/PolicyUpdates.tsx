import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import type { Policy } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Section } from '@/components/shared/Section'
import { formatDate } from '@/lib/utils'

export function PolicyUpdates({ policies, headcount, self }: { policies: Policy[]; headcount: number; self: boolean }) {
  const [reminded, setReminded] = useState<Set<string>>(new Set())
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
                  disabled={nonSigners === 0 || reminded.has(p.id)}
                  onClick={() => {
                    setReminded((s) => new Set(s).add(p.id))
                    toast.success(`Reminder sent to ${nonSigners} non-signers of ${p.title}`)
                  }}
                >
                  {nonSigners === 0 ? 'All signed' : reminded.has(p.id) ? 'Reminded' : `Remind ${nonSigners} non-signers`}
                </Button>
              )}
            </motion.li>
          )
        })}
      </ul>
    </Section>
  )
}
