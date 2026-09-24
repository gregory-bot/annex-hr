import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { cn } from '@/lib/utils'

/** Calm KPI tile — entrance fade only, no hover movement. */
export function Kpi({
  label,
  value,
  icon: Icon,
  hint,
  href,
  format,
  index = 0,
}: {
  label: string
  value: number
  icon: LucideIcon
  hint?: React.ReactNode
  href?: string
  format?: (n: number) => string
  index?: number
}) {
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className={cn('h-full rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors sm:p-5', href && 'hover:border-primary/30')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular sm:text-[28px]">
        <AnimatedNumber value={value} format={format} />
      </div>
      {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
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
