import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'

type Series = { key: string; label: string }

/** Multi-series line chart on one shared axis, ChartKit legend. */
export function MultiLine({
  data,
  xKey,
  series,
  valueFormatter,
  yTickFormatter,
  height = 260,
}: {
  data: object[]
  xKey: string
  series: Series[]
  valueFormatter?: (v: number) => string
  yTickFormatter?: (v: number) => string
  height?: number
}) {
  return (
    <div>
      {series.length > 1 && <Legend className="mb-3" items={series.map((s, i) => ({ label: s.label, color: SERIES[i]! }))} />}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={yTickFormatter ? 60 : 40} tickFormatter={yTickFormatter} />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Side-by-side bars (2–3 series) with 2px gap between adjacent bars. */
export function GroupedBars({
  data,
  xKey,
  series,
  valueFormatter,
  height = 260,
}: {
  data: object[]
  xKey: string
  series: Series[]
  valueFormatter?: (v: number) => string
  height?: number
}) {
  return (
    <div>
      <Legend className="mb-3" items={series.map((s, i) => ({ label: s.label, color: SERIES[i]! }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={16} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
