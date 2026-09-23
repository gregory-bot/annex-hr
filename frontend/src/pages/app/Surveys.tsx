import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, CalendarClock, Lock, PenLine, Plus, Send, Users } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import type { Survey } from '@/data/types'
import { isAdminLike, isLeader } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { daysUntil, formatDate } from '@/lib/utils'
import { Builder, type PublishedSurvey } from './surveys/Builder'
import { TakeSurvey } from './surveys/TakeSurvey'
import { Results } from './surveys/Results'

export default function Surveys() {
  const { workspace } = useWorkspace()
  return <SurveysPage key={workspace.id} />
}

function SurveysPage() {
  const { surveys: seed, role } = useWorkspace()
  const [surveys, setSurveys] = useState<Survey[]>(seed)
  const [builderKey, setBuilderKey] = useState(0)
  const [params, setParams] = useSearchParams()
  const canBuild = isAdminLike(role)
  const canSeeResults = isLeader(role) || role === 'finance'

  const tabs = [
    { value: 'surveys', label: 'Surveys' },
    { value: 'take', label: 'Take survey' },
    ...(canSeeResults ? [{ value: 'results', label: 'Q3 Pulse results' }] : []),
  ]
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'surveys'
  const builderOpen = canBuild && params.get('new') === '1'

  const patch = (fn: (p: URLSearchParams) => void) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        fn(next)
        return next
      },
      { replace: true },
    )
  const setTab = (v: string) => patch((p) => (v === 'surveys' ? p.delete('tab') : p.set('tab', v)))
  const setBuilder = (o: boolean) => patch((p) => (o ? p.set('new', '1') : p.delete('new')))

  const publish = (s: PublishedSurvey) => {
    setBuilderKey((k) => k + 1)
    setSurveys((list) => [
      { id: `s-${list.length + 1}`, title: s.title, status: 'Live', responses: 0, audience: s.audience, engagement: 0, enps: 0, closes: s.closes, anonymous: s.anonymous },
      ...list,
    ])
  }

  const pulse = surveys.find((s) => s.id === 's1') ?? surveys[0]!
  const live = surveys.filter((s) => s.status === 'Live')

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Pulse surveys"
        description="Short, anonymous check-ins that tell you how people really feel — and where to act."
        actions={
          canBuild && (
            <Button onClick={() => setBuilder(true)}>
              <Plus /> New survey
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="surveys">
          {!canBuild && live.length > 0 && (
            <Card className="mb-4 flex flex-col gap-3 bg-gradient-to-br from-accent to-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">You have {live.length} open survey{live.length > 1 ? 's' : ''}</div>
                <div className="text-sm text-muted-foreground">Takes about 2 minutes. Always anonymous.</div>
              </div>
              <Button onClick={() => setTab('take')}>
                <Send /> Take the Q3 Pulse
              </Button>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {surveys.map((s, i) => {
              const rate = s.audience ? Math.round((s.responses / s.audience) * 100) : 0
              const left = daysUntil(s.closes)
              return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -2 }}>
                  <Card className="flex h-full flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={s.status} />
                          {s.anonymous && (
                            <Badge variant="muted">
                              <Lock /> Anonymous
                            </Badge>
                          )}
                        </div>
                        <h3 className="mt-2 font-semibold leading-snug">{s.title}</h3>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Users className="size-3.5" /> {s.responses} of {s.audience} responded
                        </span>
                        <span className="font-semibold tabular">{rate}%</span>
                      </div>
                      <Progress value={rate} tone={s.status === 'Closed' ? 'muted' : 'primary'} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Engagement</dt>
                        <dd className="mt-0.5 font-semibold tabular">{s.engagement ? s.engagement : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">eNPS</dt>
                        <dd className="mt-0.5 font-semibold tabular">{s.status === 'Draft' || !s.responses ? '—' : `+${s.enps}`}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{s.status === 'Closed' ? 'Closed' : 'Closes'}</dt>
                        <dd className="mt-0.5 font-semibold">{formatDate(s.closes, 'short')}</dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" />
                        {s.status === 'Live' ? (left > 0 ? `${left} days left` : 'Closes today') : s.status === 'Draft' ? 'Not yet sent' : 'Results published'}
                      </span>
                      <div className="flex gap-2">
                        {s.status === 'Live' && (
                          <Button size="sm" variant="outline" onClick={() => setTab('take')}>
                            <Send /> Take
                          </Button>
                        )}
                        {canSeeResults && s.id === pulse.id && (
                          <Button size="sm" variant="soft" onClick={() => setTab('results')}>
                            <BarChart3 /> Results
                          </Button>
                        )}
                        {canBuild && s.status === 'Draft' && (
                          <Button size="sm" variant="outline" onClick={() => setBuilder(true)}>
                            <PenLine /> Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="take">
          <TakeSurvey survey={pulse} />
        </TabsContent>

        {canSeeResults && (
          <TabsContent value="results">
            <Results survey={pulse} />
          </TabsContent>
        )}
      </Tabs>

      {canBuild && <Builder key={builderKey} open={builderOpen} onOpenChange={setBuilder} onPublish={publish} />}
    </>
  )
}
