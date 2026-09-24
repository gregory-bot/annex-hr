import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/shared/EmptyState'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { surveyApi, type SurveyFull } from './api'
import { QuestionView, type Answer } from './QuestionView'

export function TakeSurvey({ survey, onSubmitted }: { survey: SurveyFull; onSubmitted: (id: string) => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [done, setDone] = useState(survey.respondedByMe)
  const [sending, setSending] = useState(false)
  const qs = survey.questions

  if (!qs.length) {
    return <EmptyState title="No questions yet" description="This survey has no questions to answer." />
  }

  const q = qs[Math.min(step, qs.length - 1)]!
  const last = step >= qs.length - 1
  const answered = answers[q.id] !== undefined && answers[q.id] !== ''
  const minutes = Math.max(1, Math.round(qs.length * 0.3))

  const submit = async () => {
    const payload: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(answers)) if (v !== undefined && v !== '') payload[k] = v
    if (!Object.keys(payload).length) return toast.error('Answer at least one question before submitting')
    setSending(true)
    try {
      if (!USE_MOCK_API) await surveyApi.respond(survey.id, payload)
      setDone(true)
      onSubmitted(survey.id)
      toast.success('Thanks — your response is in', {
        description: survey.anonymous ? 'It is anonymous and only reported in groups of 5 or more.' : undefined,
      })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card className="overflow-hidden">
        <div className="border-b bg-subtle p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="soft">Closes {formatDate(survey.closes)}</Badge>
            {survey.anonymous && <Badge variant="muted">Anonymous</Badge>}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">{survey.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {qs.length} quick question{qs.length === 1 ? '' : 's'} · about {minutes} minute{minutes === 1 ? '' : 's'}
          </p>
          {!done && <Progress value={((step + (answered ? 1 : 0)) / qs.length) * 100} className="mt-4 h-1.5" />}
        </div>
        <div className="min-h-[300px] p-5 sm:p-6">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center">
                <SuccessCheck />
                <h3 className="mt-4 text-lg font-semibold">Response submitted</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                  You’ve answered this survey. Results are shared with everyone after it closes.
                </p>
              </motion.div>
            ) : (
              <motion.div key={q.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <QuestionView q={q} index={step} total={qs.length} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {!done && (
          <div className="flex items-center justify-between border-t p-4">
            <Button variant="ghost" disabled={step === 0 || sending} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {last ? (
              <Button disabled={sending} onClick={() => void submit()}>
                {sending ? 'Submitting…' : 'Submit'}
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} variant={answered ? 'default' : 'outline'}>
                {answered ? 'Next' : 'Skip'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
