import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { PersonAvatar } from '@/components/ui/avatar'
import type { Department, Employee } from '@/data/types'
import { cn } from '@/lib/utils'

export interface OrgBranch {
  dept: Department
  head?: Employee
  members: Employee[]
}

function Node({ person, sub, accent, className }: { person: Employee; sub: string; accent?: string; className?: string }) {
  return (
    <div className={cn('relative w-44 overflow-hidden rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm', className)}>
      {accent && <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />}
      <div className="flex items-center gap-2.5">
        <PersonAvatar name={person.name} src={person.photo} className="size-8 text-[11px]" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{person.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </div>
    </div>
  )
}

/** CEO → department heads → collapsible teams. Scrolls horizontally on small screens. */
export function OrgChart({ ceo, branches, onSelect }: { ceo?: Employee; branches: OrgBranch[]; onSelect: (deptId: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!ceo) return null
  const n = branches.length
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2 scrollbar-thin">
      <div className="mx-auto flex w-max min-w-full flex-col items-center py-2">
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <Node person={ceo} sub={ceo.title} className="border-primary/40 ring-4 ring-primary/10" />
        </motion.div>
        <motion.span
          className="block h-6 w-px origin-top bg-border"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 0.15, duration: 0.25 }}
        />
        <div className="flex">
          {branches.map((b, i) => {
            const expanded = !!open[b.dept.id]
            const team = b.members.filter((m) => m.id !== b.head?.id && m.id !== ceo.id)
            return (
              <div key={b.dept.id} className="relative flex flex-col items-center px-2">
                {/* horizontal connector halves */}
                {n > 1 && (
                  <motion.span
                    className={cn('absolute top-0 h-px bg-border', i === 0 ? 'left-1/2 right-0 origin-left' : i === n - 1 ? 'left-0 right-1/2 origin-right' : 'inset-x-0')}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.3, duration: 0.35 }}
                  />
                )}
                <motion.span
                  className="block h-5 w-px origin-top bg-border"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.5 + i * 0.03, duration: 0.2 }}
                />
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 + i * 0.05 }}
                  whileHover={{ y: -2 }}
                  onClick={() => onSelect(b.dept.id)}
                  className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {b.head ? (
                    <Node person={b.head} sub={b.dept.name} accent={b.dept.color} />
                  ) : (
                    <div className="w-44 rounded-xl border border-dashed px-3 py-3 text-[13px] text-muted-foreground">{b.dept.name} · No head</div>
                  )}
                </motion.button>
                <span className="block h-3 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [b.dept.id]: !o[b.dept.id] }))}
                  className="inline-flex items-center gap-1 rounded-full border bg-subtle px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={expanded}
                >
                  {team.length} {team.length === 1 ? 'report' : 'reports'}
                  <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 w-44 space-y-1 overflow-hidden"
                    >
                      {team.slice(0, 8).map((m) => (
                        <li key={m.id} className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
                          <PersonAvatar name={m.name} src={m.photo} className="size-6 text-[9px]" />
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-medium">{m.name}</div>
                            <div className="truncate text-[10px] text-muted-foreground">{m.title}</div>
                          </div>
                        </li>
                      ))}
                      {team.length > 8 && <li className="px-2 text-[11px] text-muted-foreground">+{team.length - 8} more</li>}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
