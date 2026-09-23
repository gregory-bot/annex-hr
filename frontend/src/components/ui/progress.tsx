import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Animated progress bar. Tone switches colour for status-driven bars. */
export function Progress({
  value,
  className,
  barClassName,
  tone = 'primary',
}: {
  value: number
  className?: string
  barClassName?: string
  tone?: 'primary' | 'success' | 'warning' | 'muted'
}) {
  const toneClass = {
    primary: 'bg-gradient-to-r from-primary to-secondary',
    success: 'bg-success',
    warning: 'bg-warning',
    muted: 'bg-muted-foreground/40',
  }[tone]
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={cn('h-full rounded-full', toneClass, barClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  )
}
