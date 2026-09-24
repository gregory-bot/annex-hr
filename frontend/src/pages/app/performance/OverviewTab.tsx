import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PersonAvatar } from '@/components/ui/avatar'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { ChartTooltip, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { daysUntil, formatDate } from '@/lib/utils'
import { quarterTrend, readinessOf, type Objective, type ReviewRow } from './data'

const cursor = { fill: 'var(--muted)', opacity: 0.6 }

export function OverviewTab({
  org,
  people,
  reviews,
  objectives,
  closesOn = '2026-10-10',
  onGo,
}: {
  org: boolean
  people: Employee[]
  reviews: ReviewRow[]
  objectives: Objective[]
  closesOn?: string
  onGo: (tab: string) => void
}) {
  const { user, department } = useWorkspace()
  const avg = people.reduce((s, e) => s + e.performance, 0) / Math.max(1, people.length)
  const completed = reviews.filter((r) => r.manager === 'Submitted').length
  const completedPct = reviews.length ? Math.round((completed / reviews.length) * 100) : 0
  const promo = people.filter((e) => e.performance >= 4.2 && e.potential === 3).sort((a, b) => b.performance - a.performance)
  const krs = objectives.flatMap((o) => o.keyResults)
  const onTrack = krs.filter((k) => k.progress >= 70).length

  const distribution = useMemo(() => {
    const buckets = [
      { band: '< 3.0', min: 0, max: 3 },
      { band: '3.0–3.4', min: 3, max: 3.5 },
      { band: '3.5–3.9', min: 3.5, max: 4 },
      { band: '4.0–4.4', min: 4, max: 4.5 },
      { band: '4.5–5.0', min: 4.5, max: 5.1 },
    ]
    return buckets.map((b) => ({ band: b.band, people: people.filter((e) => e.performance >= b.min && e.performance < b.max).length }))
  }, [people])

  const mine = reviews.find((r) => r.employee.id === user.id)
  const trend = quarterTrend(org ? avg : user.performance)

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {org ? (
          <>
            <StatCard index={0} label="Avg rating · Q3" value={avg.toFixed(2)} delta={2.4} deltaLabel="vs Q2" />
            <StatCard index={1} label="Reviews completed" value={completedPct} format={(n) => `${Math.round(n)}%`} hint={`${completed} of ${reviews.length}`} />
            <StatCard index={2} label="Promotion-ready" value={promo.length} tone="success" hint="Rating ≥ 4.2 · high potential" />
            <StatCard index={3} label="Goals on track" value={`${onTrack}/${krs.length}`} hint="Key results ≥ 70%" />
          </>
        ) : (
          <>
            <StatCard index={0} label="My last rating" value={user.performance.toFixed(1)} hint="Q2 2026 · calibrated" />
            <StatCard index={1} label="Self review" value={mine?.self ?? 'Not started'} tone={mine?.self === 'Submitted' ? 'success' : 'warning'} />
            <StatCard index={2} label="My key results on track" value={`${onTrack}/${krs.length}`} />
            <StatCard index={3} label="Cycle closes" value={`${Math.max(0, daysUntil(closesOn))} days`} hint={formatDate(closesOn)} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={org ? 'Average rating trend' : 'My rating trend'} description="Quarterly calibrated ratings, 1–5 scale">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="quarter" {...axisProps} />
              <YAxis {...axisProps} domain={[2.5, 5]} ticks={[2.5, 3, 3.5, 4, 4.5, 5]} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => v.toFixed(2)} />} cursor={{ stroke: 'var(--border)' }} />
              <Line type="monotone" dataKey="rating" name="Rating" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        {org ? (
          <Section title="Performance distribution" description={`${people.length} employees by Q3 rating band`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="band" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={cursor} />
                <Bar dataKey="people" name="Employees" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        ) : (
          <Card className="flex flex-col justify-between bg-gradient-to-br from-accent to-card p-6">
            <div>
              <Badge variant="soft">Q3 2026 review cycle</Badge>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">Your self review is {mine?.self === 'Submitted' ? 'submitted' : 'waiting for you'}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Reflect on the quarter, rate yourself on five competencies and share what you are proud of. Your manager sees it before your 1:1.
              </p>
            </div>
            <Button className="mt-5 self-start" onClick={() => onGo('reviews')}>
              Open my review
            </Button>
          </Card>
        )}
      </div>

      {org && (
        <Section
          title="Promotion readiness"
          description="High performers with high potential — candidates for the October promotion round"
          action={
            <Button variant="ghost" size="sm" onClick={() => onGo('succession')}>
              9-box
            </Button>
          }
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {promo.slice(0, 9).map((e, i) => {
              const r = readinessOf(e)
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <PersonAvatar name={e.name} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.title} · {department(e.departmentId)?.name}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular">{e.performance.toFixed(1)}</span>
                    <Badge variant={r === 'Ready now' ? 'success' : 'info'}>{r}</Badge>
                  </div>
                </motion.li>
              )
            })}
            {!promo.length && <li className="text-sm text-muted-foreground">No promotion-ready employees this cycle.</li>}
          </ul>
        </Section>
      )}
    </div>
  )
}
