import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from './AnimatedNumber'

export function StatCard({
  label,
  value,
  format,
  delta,
  deltaLabel,
  hint,
  href,
  tone = 'default',
  index = 0,
}: {
  label: string
  value: number | string
  format?: (n: number) => string
  /** @deprecated Icons are no longer rendered on stat cards; kept for backward compatibility. */
  icon?: LucideIcon
  delta?: number
  deltaLabel?: string
  hint?: React.ReactNode
  href?: string
  tone?: 'default' | 'primary' | 'warning' | 'success'
  index?: number
}) {
  const up = (delta ?? 0) >= 0
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className={cn(
        'group relative h-full overflow-hidden rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5',
        tone === 'primary' && 'border-transparent bg-gradient-to-br from-primary to-[#8f0d17] text-white',
      )}
    >
      <div className="flex items-center gap-2">
        {tone !== 'default' && (
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              tone === 'primary' && 'bg-white/80',
              tone === 'warning' && 'bg-warning',
              tone === 'success' && 'bg-success',
            )}
          />
        )}
        <div className={cn('truncate text-[13px] font-medium text-muted-foreground', tone === 'primary' && 'text-white/80')}>{label}</div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular sm:text-[28px]">
        {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
      </div>
      {(delta !== undefined || hint) && (
        <div className={cn('mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground', tone === 'primary' && 'text-white/75')}>
          {delta !== undefined && (
            <span
              className={cn(
                'font-semibold tabular',
                up ? 'text-success' : 'text-danger',
                tone === 'primary' && 'text-white',
              )}
            >
              {up ? '+' : '−'}
              {Math.abs(delta)}%
            </span>
          )}
          {deltaLabel && <span>{deltaLabel}</span>}
          {hint}
        </div>
      )}
    </motion.div>
  )
  return href ? (
    <Link to={href} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  )
}
