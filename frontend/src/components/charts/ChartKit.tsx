import type { TooltipContentProps } from 'recharts'
import { cn } from '@/lib/utils'

/**
 * Validated categorical order (brand red first). Assign by entity, in order —
 * never cycle past six; fold extra series into "Other".
 */
export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'] as const
export const SERIES_SOFT = 'var(--chart-soft)'

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 11,
} as const

export const gridProps = { strokeDasharray: '3 3', vertical: false } as const

/** Shared tooltip: text in ink tokens, colour swatch carries identity. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = (v) => String(v),
}: Partial<TooltipContentProps<number, string>> & { valueFormatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <div className="mb-1.5 font-semibold text-foreground">{label}</div>}
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ background: (p.color ?? (p.payload as { fill?: string })?.fill) as string }} />
              {p.name}
            </span>
            <span className="font-semibold tabular text-foreground">{valueFormatter(Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
