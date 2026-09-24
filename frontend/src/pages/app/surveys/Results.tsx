import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useWorkspace } from '@/context/auth'
import type { Survey } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { cn } from '@/lib/utils'
import { COMMENTS, EMOJIS, EMOJI_RESULTS, PULSE_QUESTIONS, type Sentiment } from './data'

const sentimentVariant: Record<Sentiment, 'success' | 'muted' | 'warning'> = { Positive: 'success', Neutral: 'muted', Constructive: 'warning' }

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function Results({ survey }: { survey: Survey }) {
  const { trends, departments, employees } = useWorkspace()
  const [filter, setFilter] = useState<Sentiment | 'All'>('All')

  const detractors = 16
  const promoters = survey.enps + detractors
  const passives = 100 - promoters - detractors
  const segments = [
    { label: 'Promoters (9–10)', value: promoters, color: SERIES[0] },
    { label: 'Passives (7–8)', value: passives, color: SERIES[1] },
    { label: 'Detractors (0–6)', value: detractors, color: SERIES[2] },
  ]

  const byDept = useMemo(
    () =>
      departments
        .map((d) => {
          const n = employees.filter((e) => e.departmentId === d.id && e.status !== 'Exited').length
          return { name: d.name, score: Math.max(58, Math.min(92, survey.engagement + ((hash(d.id) % 17) - 8))), n }
        })
        .filter((d) => d.n >= 5)
        .sort((a, b) => b.score - a.score),
    [departments, employees, survey.engagement],
  )
  const hidden = departments.length - byDept.length

  const comments = COMMENTS.map((c, i) => ({ ...c, dept: departments[i % departments.length]!.name }))
  const shown = comments.filter((c) => filter === 'All' || c.sentiment === filter)
  const emojiQs = PULSE_QUESTIONS.filter((q) => q.type === 'emoji')

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={survey.engagement} size={112} stroke={10} label={<span className="text-2xl">{survey.engagement}</span>} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Engagement</div>
            <div className="mt-1 text-lg font-semibold">Healthy and rising</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              +4 vs Q2 Pulse · {survey.responses} of {survey.audience} responded ({Math.round((survey.responses / survey.audience) * 100)}%)
            </p>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">Employee NPS</div>
              <div className="mt-1 text-3xl font-bold tabular">+{survey.enps}</div>
            </div>
            <span className="text-sm text-muted-foreground">% promoters − % detractors · benchmark +20</span>
          </div>
          <div className="mt-4 flex h-8 w-full overflow-hidden rounded-lg">
            {segments.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ width: 0 }}
                animate={{ width: `${s.value}%` }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
                className="flex h-full items-center justify-center border-r-2 border-card text-xs font-semibold text-white last:border-r-0"
                style={{ background: s.color }}
                title={`${s.label}: ${s.value}%`}
              >
                <span className="rounded bg-black/25 px-1 tabular">{s.value}%</span>
              </motion.div>
            ))}
          </div>
          <Legend className="mt-3" items={segments.map((s) => ({ label: `${s.label} · ${s.value}%`, color: s.color }))} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Engagement trend" description="Monthly pulse engagement score">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends.engagement} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} domain={[50, 100]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
              <Line type="monotone" dataKey="score" name="Engagement" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Engagement by department" description={hidden > 0 ? `${hidden} department${hidden > 1 ? 's' : ''} hidden — fewer than 5 responses` : 'Sorted highest to lowest'}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byDept} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axisProps} />
              <YAxis type="category" dataKey="name" {...axisProps} width={112} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '…' : v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
              <Bar dataKey="score" name="Engagement" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Question breakdown" description="Share of responses per emoji, anonymous aggregate">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {emojiQs.map((q, qi) => {
            const dist = EMOJI_RESULTS[q.id] ?? [20, 20, 20, 20, 20]
            const max = Math.max(...dist)
            const fav = dist[3]! + dist[4]!
            return (
              <div key={q.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium">{q.text}</div>
                  <Badge variant="outline" className="shrink-0 tabular">
                    {fav}% favourable
                  </Badge>
                </div>
                <div className="mt-4 grid h-28 grid-cols-5 items-end gap-2">
                  {dist.map((v, i) => (
                    <div key={i} className="flex h-full flex-col items-center justify-end gap-1">
                      <span className="text-[11px] font-semibold tabular text-muted-foreground">{v}%</span>
                      <motion.div
                        className="w-full max-w-9 rounded-t"
                        style={{ background: SERIES[0], opacity: 0.35 + (i / 4) * 0.65 }}
                        initial={{ height: 0 }}
                        animate={{ height: `${(v / max) * 70}%` }}
                        transition={{ duration: 0.6, delay: qi * 0.05 + i * 0.04 }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 grid grid-cols-5 gap-2 text-center text-lg">
                  {EMOJIS.map((e) => (
                    <span key={e.e} title={e.label}>
                      {e.e}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Anonymous comments"
        description="Names are never stored. Department shown only when 5+ people responded."
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(['All', 'Positive', 'Neutral', 'Constructive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', filter === f ? 'border-primary bg-primary text-white' : 'hover:bg-muted')}
            >
              {f}
              {f !== 'All' && <span className="ml-1 opacity-70">{comments.filter((c) => c.sentiment === f).length}</span>}
            </button>
          ))}
        </div>
        <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
          {shown.map((c, i) => (
            <motion.div
              key={c.text}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="mb-3 break-inside-avoid rounded-xl border bg-subtle p-4"
            >
              <p className="text-sm leading-relaxed">{c.text}</p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {c.dept} · {c.ago}
                </span>
                <Badge variant={sentimentVariant[c.sentiment]} dot>
                  {c.sentiment}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>
    </div>
  )
}
