import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { formatNumber } from '@/lib/utils'

const cursorFill = { fill: 'var(--muted)', opacity: 0.6 }

/** Single-series area (brand red) with a soft gradient. */
export function TrendArea({
  data,
  xKey,
  yKey,
  name,
  height = 260,
  valueFormatter,
  yTickFormatter,
}: {
  data: object[]
  xKey: string
  yKey: string
  name: string
  height?: number
  valueFormatter?: (v: number) => string
  yTickFormatter?: (v: number) => string
}) {
  const id = useId().replace(/:/g, '')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} width={yTickFormatter ? 56 : 40} tickFormatter={yTickFormatter} domain={['auto', 'auto']} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={SERIES[0]} strokeWidth={2} fill={`url(#g-${id})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Stacked vertical bars with ChartKit legend. Series are assigned SERIES in order. */
export function StackedBars({
  data,
  xKey,
  series,
  height = 260,
  valueFormatter,
}: {
  data: object[]
  xKey: string
  series: { key: string; label: string }[]
  height?: number
  valueFormatter?: (v: number) => string
}) {
  return (
    <div>
      <Legend className="mb-3" items={series.map((s, i) => ({ label: s.label, color: SERIES[i]! }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={40} />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={cursorFill} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={SERIES[i]}
              stroke="var(--card)"
              strokeWidth={2}
              maxBarSize={32}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Single-series vertical bars. */
export function SimpleBars({
  data,
  xKey,
  yKey,
  name,
  height = 260,
  valueFormatter,
  yTickFormatter,
}: {
  data: object[]
  xKey: string
  yKey: string
  name: string
  height?: number
  valueFormatter?: (v: number) => string
  yTickFormatter?: (v: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={xKey} {...axisProps} interval={0} />
        <YAxis {...axisProps} width={yTickFormatter ? 56 : 40} tickFormatter={yTickFormatter} allowDecimals={false} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={cursorFill} />
        <Bar dataKey={yKey} name={name} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal single-colour bars — best for many categories. */
export function HorizontalBars({
  data,
  name,
  valueFormatter = formatNumber,
}: {
  data: { label: string; value: number }[]
  name: string
  valueFormatter?: (v: number) => string
}) {
  const height = Math.max(160, data.length * 34 + 16)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...axisProps} allowDecimals={false} tickFormatter={(v: number) => valueFormatter(v)} />
        <YAxis type="category" dataKey="label" {...axisProps} width={104} interval={0} />
        <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={cursorFill} />
        <Bar dataKey="value" name={name} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donut with centre label and ChartKit legend. */
export function Donut({
  data,
  centerLabel,
  centerValue,
  height = 220,
  valueFormatter = formatNumber,
}: {
  data: { label: string; value: number }[]
  centerLabel: string
  centerValue: string
  height?: number
  valueFormatter?: (v: number) => string
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={1} stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270}>
              {data.map((d, i) => (
                <Cell key={d.label} fill={SERIES[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold tabular">{centerValue}</div>
          <div className="text-xs text-muted-foreground">{centerLabel}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <Legend items={[{ label: d.label, color: SERIES[i]! }]} />
            <span className="font-semibold tabular text-foreground">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Funnel as horizontal bars with stage-to-stage conversion. */
export function Funnel({ data }: { data: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="space-y-1">
      {data.map((d, i) => {
        const prev = data[i - 1]
        const conv = prev ? Math.round((d.count / Math.max(1, prev.count)) * 100) : null
        return (
          <div key={d.stage}>
            {conv !== null && (
              <div className="flex items-center gap-1 py-0.5 pl-1 text-[11px] text-muted-foreground">
                <ChevronDown className="size-3" />
                <span className="font-medium tabular text-foreground">{conv}%</span> conversion
              </div>
            )}
            <div className="group flex items-center gap-3" title={`${d.stage}: ${formatNumber(d.count)}`}>
              <div className="w-20 shrink-0 text-xs text-muted-foreground sm:w-24">{d.stage}</div>
              <div className="relative h-7 min-w-0 flex-1 rounded-md bg-muted/60">
                <motion.div
                  className="h-full rounded-md transition-opacity group-hover:opacity-85"
                  style={{ background: SERIES[0] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, (d.count / max) * 100)}%` }}
                  transition={{ duration: 0.7, delay: i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
              <div className="w-12 shrink-0 text-right text-sm font-semibold tabular">{formatNumber(d.count)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const perfBuckets = [
  { label: '1–2', min: 1, max: 2 },
  { label: '2–3', min: 2, max: 3 },
  { label: '3–3.5', min: 3, max: 3.5 },
  { label: '3.5–4', min: 3.5, max: 4 },
  { label: '4–4.5', min: 4, max: 4.5 },
  { label: '4.5–5', min: 4.5, max: 5.01 },
]

export function perfHistogram(scores: number[]) {
  return perfBuckets.map((b) => ({ bucket: b.label, employees: scores.filter((s) => s >= b.min && s < b.max).length }))
}
