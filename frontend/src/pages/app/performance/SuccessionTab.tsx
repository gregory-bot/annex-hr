import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Crown, ShieldAlert } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PersonAvatar } from '@/components/ui/avatar'
import { Tip } from '@/components/ui/tooltip'
import { Section } from '@/components/shared/Section'
import { cn } from '@/lib/utils'
import { NINE_BOX, flightRisk, perfBucket, readinessOf } from './data'

const CELL_TONE = ['bg-muted/60', 'bg-accent/50', 'bg-accent', 'bg-primary/15']
const PERF_LABELS = ['Low', 'Medium', 'High']

export function SuccessionTab() {
  const { employees, department, departments } = useWorkspace()
  const people = useMemo(() => employees.filter((e) => e.status !== 'Exited' && e.employmentType !== 'Consultant' && e.role !== 'ceo'), [employees])

  const grid = useMemo(() => {
    const map: Record<string, Employee[]> = {}
    for (const e of people) {
      const k = `${e.potential}-${perfBucket(e.performance)}`
      ;(map[k] ??= []).push(e)
    }
    return map
  }, [people])

  const roles = useMemo(() => {
    const preferred = /Engineering|Finance|People|Credit|Delivery|Clinical|Admin/
    return departments
      .filter((d) => d.headId)
      .sort((a, b) => Number(preferred.test(b.name)) - Number(preferred.test(a.name)))
      .slice(0, 4)
      .map((d) => {
        const head = employees.find((e) => e.id === d.headId)!
        const successors = people
          .filter((e) => e.id !== head.id && (e.departmentId === d.id || (e.potential === 3 && e.performance >= 4.3 && e.departmentId === d.id)))
          .sort((a, b) => b.performance + b.potential * 0.5 - (a.performance + a.potential * 0.5))
          .slice(0, 3)
        return { dept: d, head, successors }
      })
  }, [departments, employees, people])

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="Talent matrix" description="9-box of Q3 performance × potential. Hover an avatar for details.">
        <div className="flex gap-2">
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Potential →</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[3, 2, 1].map((pot) =>
                [0, 1, 2].map((perf) => {
                  const key = `${pot}-${perf}`
                  const box = NINE_BOX[key]!
                  const list = grid[key] ?? []
                  const max = 6
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: ((3 - pot) * 3 + perf) * 0.03 }}
                      className={cn('flex min-h-28 flex-col rounded-lg p-2 sm:min-h-32 sm:p-3', CELL_TONE[box.strength])}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold sm:text-xs">{box.label}</div>
                          <div className="hidden truncate text-[11px] text-muted-foreground sm:block">{box.hint}</div>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular">{list.length}</span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-1 pt-2">
                        {list.slice(0, max).map((e) => (
                          <Tip key={e.id} label={`${e.name} · ${e.performance.toFixed(1)} · ${department(e.departmentId)?.name}`}>
                            <span className="inline-flex rounded-full ring-2 ring-card">
                              <PersonAvatar name={e.name} className="size-6 text-[9px] sm:size-7 sm:text-[10px]" />
                            </span>
                          </Tip>
                        ))}
                        {list.length > max && (
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-card text-[10px] font-semibold text-muted-foreground sm:size-7">+{list.length - max}</span>
                        )}
                      </div>
                    </motion.div>
                  )
                }),
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-muted-foreground">
              {PERF_LABELS.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="mt-0.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Performance →</div>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roles.map(({ dept, head, successors }, i) => (
          <motion.div key={dept.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -2 }}>
            <Card className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Crown className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">{head.title}</div>
                    <div className="truncate text-xs text-muted-foreground">Incumbent: {head.name}</div>
                  </div>
                </div>
                <Badge variant={successors.some((s) => readinessOf(s) === 'Ready now') ? 'success' : 'warning'} dot>
                  {successors.some((s) => readinessOf(s) === 'Ready now') ? 'Covered' : 'Gap'}
                </Badge>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2">
                {successors.map((s, k) => {
                  const r = readinessOf(s)
                  const risk = flightRisk(s)
                  return (
                    <li key={s.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <span className="w-4 text-center text-xs font-semibold text-muted-foreground">{k + 1}</span>
                      <PersonAvatar name={s.name} className="size-8" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.title} · {s.performance.toFixed(1)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={r === 'Ready now' ? 'success' : r === '1–2 yrs' ? 'info' : 'muted'}>{r}</Badge>
                        <span className={cn('inline-flex items-center gap-1 text-[11px]', risk === 'High' ? 'text-danger' : risk === 'Medium' ? 'text-warning' : 'text-muted-foreground')}>
                          {risk !== 'Low' && <ShieldAlert className="size-3" />}
                          {risk} flight risk
                        </span>
                      </div>
                    </li>
                  )
                })}
                {!successors.length && <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No internal successor identified — consider external pipeline.</li>}
              </ul>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
