import { motion } from 'framer-motion'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { ChartTooltip, SERIES } from '@/components/charts/ChartKit'
import { PERSPECTIVES, attainment, isLowerBetter, kpiOnTrack, weightedScore } from './data'

const fmt = (v: number, unit: string) => (unit === '%' || unit.startsWith('/') ? `${v}${unit}` : unit ? `${v} ${unit}` : String(v))

export function KpiTab() {
  const { kpis } = useWorkspace()
  const overall = weightedScore(kpis)
  const radar = PERSPECTIVES.map((p) => ({ perspective: p === 'Internal Process' ? 'Process' : p === 'Learning & Growth' ? 'Learning' : p, score: Math.round(weightedScore(kpis.filter((k) => k.perspective === p))) }))
  const onTrack = kpis.filter(kpiOnTrack).length

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <ProgressRing value={overall} size={132} stroke={12} tone={overall >= 90 ? 'success' : overall >= 75 ? 'primary' : 'warning'} label={<span className="text-2xl">{Math.round(overall)}%</span>} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Balanced scorecard</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">Overall weighted score</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {onTrack} of {kpis.length} KPIs on track. Attainment is capped at 100% per KPI and weighted by importance.
            </p>
          </div>
        </Card>
        <Section title="Perspective scores" description="Weighted attainment per scorecard perspective">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="perspective" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}%`} />} />
              <Radar dataKey="score" name="Score" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.18} />
            </RadarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PERSPECTIVES.map((p, pi) => {
          const items = kpis.filter((k) => k.perspective === p)
          const score = weightedScore(items)
          return (
            <motion.div key={p} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: pi * 0.06 }} whileHover={{ y: -2 }}>
              <Card className="h-full p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{p}</div>
                    <div className="text-xs text-muted-foreground">Weight {items.reduce((s, k) => s + k.weight, 0)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold tabular">{Math.round(score)}%</div>
                    <div className="text-[11px] text-muted-foreground">attainment</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  {items.map((k) => {
                    const a = attainment(k)
                    const ok = kpiOnTrack(k)
                    return (
                      <div key={k.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{k.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {k.owner} · weight {k.weight}%{isLowerBetter(k) ? ' · lower is better' : ''}
                            </div>
                          </div>
                          <Badge variant={ok ? 'success' : 'warning'} dot>
                            {ok ? 'On track' : 'At risk'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Progress value={Math.min(100, a * 100)} tone={ok ? 'primary' : 'warning'} className="flex-1" />
                          <span className="w-28 shrink-0 text-right text-xs tabular">
                            <span className="font-semibold">{fmt(k.actual, k.unit)}</span>
                            <span className="text-muted-foreground"> / {fmt(k.target, k.unit)}</span>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
