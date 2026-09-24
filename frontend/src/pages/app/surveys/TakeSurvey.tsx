import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { formatDate } from '@/lib/utils'
import type { Survey } from '@/data/types'
import { PULSE_QUESTIONS } from './data'
import { QuestionView, type Answer } from './QuestionView'

export function TakeSurvey({ survey }: { survey: Survey }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [done, setDone] = useState(false)
  const qs = PULSE_QUESTIONS
  const q = qs[step]!
  const last = step === qs.length - 1
  const answered = answers[q.id] !== undefined && answers[q.id] !== ''

  const submit = () => {
    setDone(true)
    toast.success('Thanks — your response is in', { description: 'It is anonymous and only reported in groups of 5 or more.' })
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card className="overflow-hidden">
        <div className="border-b bg-gradient-to-br from-accent to-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="soft">Closes {formatDate(survey.closes)}</Badge>
            {survey.anonymous && (
              <Badge variant="muted">Anonymous</Badge>
            )}
          </div>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">{survey.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">7 quick questions · about 2 minutes</p>
          {!done && <Progress value={((step + (answered ? 1 : 0)) / qs.length) * 100} className="mt-4 h-1.5" />}
        </div>
        <div className="min-h-[300px] p-5 sm:p-6">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-8 text-center">
                <SuccessCheck />
                <h3 className="mt-4 text-lg font-semibold">Response submitted</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">We share results with everyone within a week of the survey closing.</p>
                <Button
                  variant="outline"
                  className="mt-5"
                  onClick={() => {
                    setDone(false)
                    setStep(0)
                    setAnswers({})
                  }}
                >
                  Preview again
                </Button>
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
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {last ? (
              <Button onClick={submit}>Submit</Button>
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
