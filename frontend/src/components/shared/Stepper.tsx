import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Horizontal step indicator (vertical on narrow screens when `responsive`). */
export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn('flex w-full items-center', className)}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2">
              <motion.div
                initial={false}
                animate={{ scale: active ? 1.08 : 1 }}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                  done && 'border-primary bg-primary text-white',
                  active && 'border-primary bg-accent text-primary',
                  !done && !active && 'border-border bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </motion.div>
              <span className={cn('hidden text-xs font-medium sm:inline', active || done ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border sm:mx-3">
                <motion.div className="absolute inset-y-0 left-0 bg-primary" initial={false} animate={{ width: done ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
