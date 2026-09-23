import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Flag } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { PersonAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { objectiveProgress, type Objective } from './data'

const confidenceVariant = { High: 'success', Medium: 'warning', Low: 'danger' } as const

export function OkrTab({ objectives }: { objectives: Objective[] }) {
  const { employee, department } = useWorkspace()
  const [open, setOpen] = useState<string | null>(objectives[0]?.id ?? null)

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Q3 2026 company objectives · {objectives.length} objectives · {objectives.reduce((s, o) => s + o.keyResults.length, 0)} key results
        </span>
        <span className="text-xs">Confidence is the owner's weekly check-in</span>
      </div>
      {objectives.map((o, i) => {
        const owner = employee(o.ownerId)
        const pct = objectiveProgress(o)
        const isOpen = open === o.id
        return (
          <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="overflow-hidden">
              <button
                className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40 sm:p-5"
                onClick={() => setOpen(isOpen ? null : o.id)}
                aria-expanded={isOpen}
              >
                <ProgressRing value={pct} size={52} stroke={5} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <Flag className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="font-semibold leading-snug">{o.title}</div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {owner && (
                      <span className="inline-flex items-center gap-1.5">
                        <PersonAvatar name={owner.name} className="size-5 text-[9px]" />
                        {owner.name} · {department(owner.departmentId)?.name}
                      </span>
                    )}
                    <span>{o.keyResults.length} key results</span>
                  </div>
                </div>
                <Badge variant={confidenceVariant[o.confidence]} dot className="hidden sm:inline-flex">
                  {o.confidence} confidence
                </Badge>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="grid grid-cols-1 gap-4 border-t bg-subtle p-4 sm:p-5">
                      <Badge variant={confidenceVariant[o.confidence]} dot className="self-start sm:hidden">
                        {o.confidence} confidence
                      </Badge>
                      {o.keyResults.map((kr, k) => (
                        <div key={kr.title}>
                          <div className="flex items-start justify-between gap-3 text-sm">
                            <span className="min-w-0">
                              <span className="mr-1.5 text-xs font-semibold text-muted-foreground">KR{k + 1}</span>
                              {kr.title}
                            </span>
                            <span className="shrink-0 font-semibold tabular">{kr.progress}%</span>
                          </div>
                          <Progress value={kr.progress} tone={kr.progress >= 70 ? 'primary' : 'warning'} className="mt-2" />
                          <div className="mt-1 text-xs text-muted-foreground">
                            {kr.current} of {kr.target}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}
