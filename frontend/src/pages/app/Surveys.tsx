import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isAdminLike, isLeader } from '@/lib/rbac'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { Builder } from './surveys/Builder'
import { TakeSurvey } from './surveys/TakeSurvey'
import { Results } from './surveys/Results'
import { surveyApi, useSurveys, type SurveyFull } from './surveys/api'

export default function Surveys() {
  const { workspace, user } = useWorkspace()
  return <SurveysPage key={`${workspace.id}-${user.id}`} />
}

function SurveyPicker({ surveys, value, onChange }: { surveys: SurveyFull[]; value?: string; onChange: (id: string) => void }) {
  if (surveys.length < 2) return null
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {surveys.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            value === s.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {s.title}
        </button>
      ))}
    </div>
  )
}

function SurveysPage() {
  const { surveys: seed, role } = useWorkspace()
  const { surveys, upsert, setSurveys } = useSurveys(seed)
  const [builderKey, setBuilderKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const canBuild = isAdminLike(role)
  const canSeeResults = isLeader(role) || role === 'finance'

  const tabs = [
    { value: 'surveys', label: 'Surveys' },
    { value: 'take', label: 'Take survey' },
    ...(canSeeResults ? [{ value: 'results', label: 'Results' }] : []),
  ]
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'surveys'
  const editId = params.get('edit')
  const draft = editId ? (surveys.find((s) => s.id === editId && s.status === 'Draft') ?? null) : null
  const builderOpen = canBuild && (params.get('new') === '1' || !!draft)

  const patch = (fn: (p: URLSearchParams) => void) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        fn(next)
        return next
      },
      { replace: true },
    )
  const go = (t: string, surveyId?: string) =>
    patch((p) => {
      if (t === 'surveys') p.delete('tab')
      else p.set('tab', t)
      if (surveyId) p.set('survey', surveyId)
    })
  const openBuilder = (id?: string) => {
    setBuilderKey((k) => k + 1)
    patch((p) => {
      p.delete('new')
      p.delete('edit')
      if (id) p.set('edit', id)
      else p.set('new', '1')
    })
  }
  const closeBuilder = () =>
    patch((p) => {
      p.delete('new')
      p.delete('edit')
    })

  const live = surveys.filter((s) => s.status === 'Live')
  const pending = live.filter((s) => !s.respondedByMe)
  const withResults = surveys.filter((s) => s.status !== 'Draft')
  const wanted = params.get('survey')
  const takeSurvey = live.find((s) => s.id === wanted) ?? pending[0] ?? live[0]
  const resultSurvey = withResults.find((s) => s.id === wanted) ?? withResults.find((s) => s.responses > 0) ?? withResults[0]

  const act = async (s: SurveyFull, action: 'publish' | 'close' | 'delete') => {
    setBusy(s.id)
    try {
      if (action === 'delete') {
        if (!USE_MOCK_API) await surveyApi.remove(s.id)
        setSurveys((list) => list.filter((x) => x.id !== s.id))
        toast.success('Draft deleted')
      } else {
        const next = USE_MOCK_API ? { ...s, status: action === 'publish' ? ('Live' as const) : ('Closed' as const) } : await surveyApi[action](s.id)
        upsert(next)
        toast.success(action === 'publish' ? `“${s.title}” is live` : `“${s.title}” closed — results are final`)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Pulse surveys"
        description="Short, anonymous check-ins that tell you how people really feel — and where to act."
        actions={canBuild && <Button onClick={() => openBuilder()}>New survey</Button>}
      />
      <Tabs value={tab} onValueChange={(v) => go(v)}>
        <TabsList className="w-full justify-start sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="surveys">
          {pending.length > 0 && (
            <Card className="mb-4 flex flex-col gap-3 bg-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold">
                  You have {pending.length} open survey{pending.length > 1 ? 's' : ''}
                </div>
                <div className="text-sm text-muted-foreground">Takes about 2 minutes.{pending[0]!.anonymous ? ' Your answers are anonymous.' : ''}</div>
              </div>
              <Button onClick={() => go('take', pending[0]!.id)}>Take “{pending[0]!.title.split(' — ')[0]}”</Button>
            </Card>
          )}
          {surveys.length === 0 ? (
            <EmptyState title="No surveys yet" description={canBuild ? 'Create your first pulse survey to hear from your team.' : 'Open surveys will show up here.'} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {surveys.map((s, i) => {
                const rate = s.audience ? Math.min(100, Math.round((s.responses / s.audience) * 100)) : 0
                const left = daysUntil(s.closes)
                const hasScore = s.status !== 'Draft' && s.responses > 0
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                    <Card className="flex h-full flex-col p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={s.status} />
                        {s.anonymous && <Badge variant="muted">Anonymous</Badge>}
                        {s.respondedByMe && (
                          <Badge variant="success" dot>
                            You responded
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">{s.title}</h3>
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {s.responses} of {s.audience} responded
                          </span>
                          <span className="font-semibold tabular">{rate}%</span>
                        </div>
                        <Progress value={rate} tone={s.status === 'Closed' ? 'muted' : 'primary'} />
                      </div>
                      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Engagement</dt>
                          <dd className="mt-0.5 font-semibold tabular">{hasScore && s.responses >= 5 ? s.engagement : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">eNPS</dt>
                          <dd className="mt-0.5 font-semibold tabular">{hasScore && s.responses >= 5 ? `${s.enps > 0 ? '+' : ''}${s.enps}` : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{s.status === 'Closed' ? 'Closed' : 'Closes'}</dt>
                          <dd className="mt-0.5 font-semibold">{formatDate(s.closes, 'short')}</dd>
                        </div>
                      </dl>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                        <span className="text-xs text-muted-foreground">
                          {s.status === 'Live'
                            ? left > 0
                              ? `${left} day${left === 1 ? '' : 's'} left`
                              : left === 0
                                ? 'Closes today'
                                : 'Past closing date'
                            : s.status === 'Draft'
                              ? `Draft · ${s.questions.length} question${s.questions.length === 1 ? '' : 's'}`
                              : 'Results final'}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {s.status === 'Live' && !s.respondedByMe && (
                            <Button size="sm" variant="outline" onClick={() => go('take', s.id)}>
                              Take
                            </Button>
                          )}
                          {canSeeResults && s.status !== 'Draft' && (
                            <Button size="sm" variant="soft" onClick={() => go('results', s.id)}>
                              Results
                            </Button>
                          )}
                          {canBuild && s.status === 'Live' && (
                            <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => void act(s, 'close')}>
                              Close
                            </Button>
                          )}
                          {canBuild && s.status === 'Draft' && (
                            <>
                              <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => void act(s, 'delete')}>
                                Delete
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => openBuilder(s.id)}>
                                Edit
                              </Button>
                              <Button size="sm" disabled={busy === s.id || !s.questions.length} onClick={() => void act(s, 'publish')}>
                                Publish
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="take">
          {takeSurvey ? (
            <>
              <SurveyPicker surveys={live} value={takeSurvey.id} onChange={(id) => go('take', id)} />
              <TakeSurvey
                key={takeSurvey.id}
                survey={takeSurvey}
                onSubmitted={(id) => setSurveys((list) => list.map((x) => (x.id === id ? { ...x, respondedByMe: true, responses: x.responses + 1 } : x)))}
              />
            </>
          ) : (
            <EmptyState title="No open surveys" description="When HR launches a pulse survey for your team, it will appear here." />
          )}
        </TabsContent>

        {canSeeResults && (
          <TabsContent value="results">
            {resultSurvey ? (
              <>
                <SurveyPicker surveys={withResults} value={resultSurvey.id} onChange={(id) => go('results', id)} />
                <Results key={resultSurvey.id} survey={resultSurvey} />
              </>
            ) : (
              <EmptyState title="No results yet" description="Publish a survey to start collecting responses." />
            )}
          </TabsContent>
        )}
      </Tabs>

      {canBuild && (
        <Builder
          key={`${builderKey}-${draft?.id ?? 'new'}`}
          open={builderOpen}
          draft={draft}
          onOpenChange={(o) => !o && closeBuilder()}
          onSaved={(s) => upsert(s)}
        />
      )}
    </>
  )
}
