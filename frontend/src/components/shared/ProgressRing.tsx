import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  className,
  label,
  tone = 'primary',
}: {
  value: number
  size?: number
  stroke?: number
  className?: string
  label?: React.ReactNode
  tone?: 'primary' | 'success' | 'warning'
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = { primary: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)' }[tone]
  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (Math.min(100, Math.max(0, value)) / 100) * c }}
          transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular">{label ?? `${Math.round(value)}%`}</div>
    </div>
  )
}
