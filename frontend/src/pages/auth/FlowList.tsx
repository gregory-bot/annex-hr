import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Compact vertical progress list for multi-stage journeys (e.g. company admin setup). */
export function FlowList({ title, steps, current, light }: { title: string; steps: string[]; current: number; light?: boolean }) {
  return (
    <div>
      <div className={cn('text-xs font-semibold uppercase tracking-[0.14em]', light ? 'text-white/75' : 'text-muted-foreground')}>{title}</div>
      <ol className="mt-4 grid grid-cols-1">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && (
                <span className={cn('absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px', light ? 'bg-white/25' : 'bg-border')}>
                  <motion.span
                    className={cn('block w-full', light ? 'bg-white' : 'bg-primary')}
                    initial={false}
                    animate={{ height: done ? '100%' : '0%' }}
                    transition={{ duration: 0.4 }}
                  />
                </span>
              )}
              <motion.span
                initial={false}
                animate={{ scale: active ? 1.1 : 1 }}
                className={cn(
                  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors',
                  light
                    ? done
                      ? 'border-white bg-white text-primary'
                      : active
                        ? 'border-white bg-white/20 text-white'
                        : 'border-white/30 text-white/60'
                    : done
                      ? 'border-primary bg-primary text-primary-foreground'
                      : active
                        ? 'border-primary bg-accent text-primary'
                        : 'bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </motion.span>
              <span
                className={cn(
                  'pt-0.5 text-sm',
                  light ? (done || active ? 'text-white' : 'text-white/60') : done || active ? 'text-foreground' : 'text-muted-foreground',
                  active && 'font-semibold',
                )}
              >
                {s}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
