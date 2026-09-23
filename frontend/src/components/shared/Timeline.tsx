import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TimelineItem {
  title: React.ReactNode
  meta?: React.ReactNode
  body?: React.ReactNode
  icon?: LucideIcon
  state?: 'done' | 'current' | 'upcoming'
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => {
        const Icon = item.icon ?? Circle
        const state = item.state ?? 'done'
        return (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative flex gap-3 pb-6 last:pb-0"
          >
            {i < items.length - 1 && <span className={cn('absolute left-[15px] top-8 bottom-0 w-px', state === 'done' ? 'bg-primary/40' : 'bg-border')} />}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                state === 'done' && 'border-primary/30 bg-accent text-primary',
                state === 'current' && 'border-primary bg-primary text-white shadow-[0_0_0_4px] shadow-primary/15',
                state === 'upcoming' && 'border-border bg-card text-muted-foreground',
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
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
