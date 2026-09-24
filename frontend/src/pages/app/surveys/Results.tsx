import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { COMMENTS, EMOJIS, EMOJI_RESULTS, type Sentiment } from './data'
import { surveyApi, type SurveyFull, type SurveyResults } from './api'

const sentimentVariant: Record<Sentiment, 'success' | 'muted' | 'warning'> = { Positive: 'success', Neutral: 'muted', Constructive: 'warning' }

/** Mock mode: a plausible result set from the static demo data. */
function mockResults(survey: SurveyFull, departments: { id: string; name: string }[]): SurveyResults {
  const detractors = 16
  const promoters = survey.enps + detractors
  return {
    surveyId: survey.id,
    responses: survey.responses,
    audience: survey.audience,
    anonymous: survey.anonymous,
    minGroup: 5,
    suppressed: false,
    engagement: survey.engagement,
    enps: survey.enps,
    nps: { promoters, passives: 100 - promoters - detractors, detractors, enps: survey.enps, n: survey.responses },
    questions: survey.questions.map((q) => {
      const pct = EMOJI_RESULTS[q.id]
      return q.type === 'emoji' && pct ? { id: q.id, type: q.type, text: q.text, answered: survey.responses, pct, favourable: pct[3]! + pct[4]! } : { id: q.id, type: q.type, text: q.text, answered: survey.responses }
    }),
    departments: departments.slice(0, 5).map((d, i) => ({ departmentId: d.id, name: d.name, responses: 6, engagement: survey.engagement + 6 - i * 3, enps: survey.enps })),
    hiddenDepartments: Math.max(0, departments.length - 5),
    comments: COMMENTS.map((c) => ({ text: c.text, sentiment: c.sentiment, department: c.dept })),
    previous: null,
    trend: [],
  }
}

export function Results({ survey }: { survey: SurveyFull }) {
  const { trends, departments } = useWorkspace()
  const [filter, setFilter] = useState<Sentiment | 'All'>('All')
  const [data, setData] = useState<SurveyResults | null>(() => (USE_MOCK_API ? mockResults(survey, departments) : null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (USE_MOCK_API) return
    let live = true
    setData(null)
    setError(null)
    surveyApi
      .results(survey.id)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [survey.id, survey.responses])

  const trendData = useMemo(
    () => (data?.trend.length && data.trend.length > 1 ? data.trend.map((t) => ({ month: formatDate(t.closes, 'short'), score: t.engagement })) : trends.engagement),
    [data, trends.engagement],
  )

  if (error) return <EmptyState title="Couldn’t load results" description={error} />
  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 lg:col-span-2" />
      </div>
    )
  }
  if (data.responses === 0) return <EmptyState title="No responses yet" description="Results appear as soon as people start answering." />
  if (data.suppressed) {
    return (
      <EmptyState
        title="Not enough responses yet"
        description={`To protect anonymity, results show once at least ${data.minGroup} people have responded (${data.responses} so far).`}
      />
    )
  }

  const engagement = data.engagement ?? 0
  const rate = data.audience ? Math.round((data.responses / data.audience) * 100) : 0
  const delta = data.previous ? engagement - data.previous.engagement : null
  const nps = data.nps
  const segments = nps
    ? [
        { label: 'Promoters (9–10)', value: nps.promoters, color: SERIES[0] },
        { label: 'Passives (7–8)', value: nps.passives, color: SERIES[1] },
        { label: 'Detractors (0–6)', value: nps.detractors, color: SERIES[2] },
      ]
    : []
  const emojiQs = data.questions.filter((q) => q.type === 'emoji' && q.pct)
  const choiceQs = data.questions.filter((q) => q.type === 'choice' && q.options)
  const shown = data.comments.filter((c) => filter === 'All' || c.sentiment === filter)
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={engagement} size={112} stroke={10} label={<span className="text-2xl">{engagement}</span>} />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Engagement</div>
            <div className="mt-1 text-lg font-semibold">{engagement >= 75 ? 'Healthy' : engagement >= 60 ? 'Steady' : 'Needs attention'}</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {delta !== null && `${signed(delta)} vs ${data.previous!.title} · `}
              {data.responses} of {data.audience} responded ({rate}%)
            </p>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          {nps ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-primary">Employee NPS</div>
                  <div className="mt-1 text-3xl font-bold tabular">{signed(nps.enps)}</div>
                </div>
                <span className="text-sm text-muted-foreground">% promoters − % detractors · {nps.n} answers</span>
              </div>
              <div className="mt-4 flex h-8 w-full overflow-hidden rounded-lg bg-muted">
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
                    {s.value >= 8 && <span className="rounded bg-black/25 px-1 tabular">{s.value}%</span>}
                  </motion.div>
                ))}
              </div>
              <Legend className="mt-3" items={segments.map((s) => ({ label: `${s.label} · ${s.value}%`, color: s.color }))} />
            </>
          ) : (
            <EmptyState title="No eNPS question" description="Add an NPS 0–10 question to track employee NPS." className="py-6" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Engagement trend" description={data.trend.length > 1 ? 'Engagement score per survey' : 'Monthly pulse engagement score'}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...axisProps} domain={[0, 100]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
              <Line type="monotone" dataKey="score" name="Engagement" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
        <Section
          title="Engagement by department"
          description={
            data.hiddenDepartments > 0
              ? `${data.hiddenDepartments} group${data.hiddenDepartments > 1 ? 's' : ''} hidden — fewer than ${data.minGroup} responses`
              : 'Sorted highest to lowest'
          }
        >
          {data.departments.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.departments} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...axisProps} />
                <YAxis type="category" dataKey="name" {...axisProps} width={112} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + '…' : v)} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
                <Bar dataKey="engagement" name="Engagement" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Not enough responses per team" description={`Departments appear once ${data.minGroup} or more people from the team have responded.`} className="py-10" />
          )}
        </Section>
      </div>

      {emojiQs.length > 0 && (
        <Section title="Question breakdown" description="Share of responses per answer, anonymous aggregate">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {emojiQs.map((q, qi) => {
              const dist = q.pct!
              const max = Math.max(1, ...dist)
              return (
                <div key={q.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium">{q.text}</div>
                    <Badge variant="outline" className="shrink-0 tabular">
                      {q.favourable}% favourable
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
                      <span key={e.e} title={e.label} aria-label={e.label}>
                        {e.e}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            {choiceQs.map((q) => (
              <div key={q.id} className="rounded-xl border p-4">
                <div className="text-sm font-medium">{q.text}</div>
                <ul className="mt-4 grid grid-cols-1 gap-2.5">
                  {[...q.options!].sort((a, b) => b.count - a.count).map((o) => (
                    <li key={o.label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{o.label}</span>
                        <span className="font-semibold tabular">{o.pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div className="h-full rounded-full" style={{ background: SERIES[0] }} initial={{ width: 0 }} animate={{ width: `${o.pct}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title={data.anonymous ? 'Anonymous comments' : 'Comments'}
        description={`Names are never shown. Department shown only when ${data.minGroup}+ people from it responded.`}
      >
        {data.comments.length === 0 ? (
          <EmptyState title="No comments yet" description="Free-text answers will appear here." className="py-8" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {(['All', 'Positive', 'Neutral', 'Constructive'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', filter === f ? 'border-primary bg-primary text-white' : 'hover:bg-muted')}
                >
                  {f}
                  {f !== 'All' && <span className="ml-1 opacity-70">{data.comments.filter((c) => c.sentiment === f).length}</span>}
                </button>
              ))}
            </div>
            <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
              {shown.map((c, i) => (
                <motion.div
                  key={`${i}-${c.text}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  className="mb-3 break-inside-avoid rounded-xl border bg-subtle p-4"
                >
                  <p className="text-sm leading-relaxed">{c.text}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{c.department ?? 'Team hidden'}</span>
                    <Badge variant={sentimentVariant[c.sentiment]} dot>
                      {c.sentiment}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
