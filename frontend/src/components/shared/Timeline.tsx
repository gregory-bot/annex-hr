import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TimelineItem {
  title: React.ReactNode
  meta?: React.ReactNode
  body?: React.ReactNode
  /** @deprecated Icons are no longer rendered on timeline nodes; kept for backward compatibility. */
  icon?: LucideIcon
  state?: 'done' | 'current' | 'upcoming'
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => {
        const state = item.state ?? 'done'
        return (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative flex gap-3.5 pb-5 last:pb-0"
          >
            {i < items.length - 1 && <span className={cn('absolute left-[5px] top-5 bottom-0 w-px', state === 'done' ? 'bg-primary/40' : 'bg-border')} />}
            <span
              className={cn(
                'relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2',
                state === 'done' && 'border-primary bg-primary',
                state === 'current' && 'border-primary bg-card shadow-[0_0_0_4px] shadow-primary/15',
                state === 'upcoming' && 'border-border bg-card',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div className={cn('text-sm font-medium', state === 'upcoming' && 'text-muted-foreground')}>{item.title}</div>
                {item.meta && <div className="text-xs text-muted-foreground">{item.meta}</div>}
              </div>
              {item.body && <div className="mt-1 text-[13px] text-muted-foreground">{item.body}</div>}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}
