import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import type { InterviewAnswers } from './helpers'

export const LEAVE_REASONS = ['Career growth elsewhere', 'Compensation', 'Relocation', 'Work-life balance', 'Management', 'Further studies', 'Retirement', 'Other']

export type InterviewInput = Omit<InterviewAnswers, 'submittedAt'>

function YesNo({ value, onChange, name }: { value: boolean | null; onChange: (v: boolean) => void; name: string }) {
  return (
    <RadioGroup value={value === null ? '' : value ? 'yes' : 'no'} onValueChange={(v) => onChange(v === 'yes')} className="flex gap-3" aria-label={name}>
      {[
        ['yes', 'Yes'],
        ['no', 'No'],
      ].map(([v, l]) => (
        <label key={v} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm', (value ? 'yes' : value === false ? 'no' : '') === v && 'border-primary bg-accent/50')}>
          <RadioGroupItem value={v!} /> {l}
        </label>
      ))}
    </RadioGroup>
  )
}

/** The survey itself — filled in by the leaving employee. */
export function ExitInterviewForm({ company, onSubmit }: { company: string; onSubmit: (a: InterviewInput) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [nps, setNps] = useState<number | null>(null)
  const [recommend, setRecommend] = useState<boolean | null>(null)
  const [improve, setImprove] = useState('')
  const [manager, setManager] = useState(0)
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const valid = reason && nps !== null && recommend !== null && manager > 0 && wouldReturn !== null

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        Your answers are confidential. They are read by HR only and never shared with your line manager.
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label>1. What is your main reason for leaving?</Label>
        <RadioGroup value={reason} onValueChange={setReason} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEAVE_REASONS.map((r) => (
            <label key={r} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors', reason === r && 'border-primary bg-accent/50')}>
              <RadioGroupItem value={r} /> {r}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>2. On a scale of 0–10, how likely are you to recommend {company} as an employer?</Label>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setNps(i)}
              aria-pressed={nps === i}
              className={cn('h-9 rounded-md border text-xs font-medium tabular transition-colors hover:border-primary', nps === i ? 'border-primary bg-primary text-white' : 'bg-card text-foreground')}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>3. Would you recommend {company} to a friend looking for a job?</Label>
        <YesNo value={recommend} onChange={setRecommend} name="Would recommend" />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor="exit-improve">4. What could we improve?</Label>
        <Textarea id="exit-improve" value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Be as candid as you like — this helps the people who stay." />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>5. How would you rate your manager?</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setManager(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={manager === n} className="p-1">
              <Star className={cn('size-6 transition-colors', n <= manager ? 'fill-primary text-primary' : 'text-muted-foreground/50')} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>6. Would you consider returning to {company}?</Label>
        <YesNo value={wouldReturn} onChange={setWouldReturn} name="Would return" />
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit({ reason, nps: nps!, wouldRecommend: recommend!, improvements: improve.trim(), managerRating: manager, wouldReturn: wouldReturn! })
            } catch (err) {
              toast.error('Could not submit your exit interview', { description: errorMessage(err) })
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Submitting…' : 'Submit exit interview'}
        </Button>
      </div>
    </div>
  )
}

/** HR's read-only view of the answers (the API only sends them to HR admins). */
export function ExitInterviewAnswers({ answers, name, done, canSee }: { answers?: InterviewAnswers | null; name: string; done: boolean; canSee: boolean }) {
  const first = name.split(' ')[0]
  if (!done)
    return (
      <div className="grid grid-cols-1 gap-1 rounded-xl border border-dashed bg-muted/40 p-8 text-center">
        <div className="text-sm font-medium">Waiting for {first}</div>
        <p className="text-xs text-muted-foreground">The exit interview is filled in by {first} from their own Annex HR account. Answers appear here once submitted.</p>
      </div>
    )
  if (!canSee || !answers)
    return (
      <div className="grid grid-cols-1 place-items-center gap-3 rounded-xl border p-8 text-center">
        <SuccessCheck size={56} />
        <div className="text-sm font-semibold">Exit interview completed</div>
        <p className="max-w-sm text-xs text-muted-foreground">Answers are confidential and visible to HR administrators only.</p>
      </div>
    )
  const rows: [string, React.ReactNode][] = [
    ['Main reason for leaving', answers.reason],
    ['Likelihood to recommend (0–10)', <span className="tabular">{answers.nps}</span>],
    ['Would recommend to a friend', answers.wouldRecommend ? 'Yes' : 'No'],
    ['Manager rating', <span className="tabular">{answers.managerRating} / 5</span>],
    ['Would consider returning', answers.wouldReturn ? 'Yes' : 'No'],
  ]
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">Confidential — HR only. Never share individual answers with the line manager.</div>
      <dl className="divide-y rounded-xl border">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm font-medium">{v}</dd>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-1 p-3">
          <dt className="text-xs text-muted-foreground">What could we improve?</dt>
          <dd className="whitespace-pre-line text-sm">{answers.improvements || '—'}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Submitted {formatDate(answers.submittedAt.slice(0, 10))}</p>
    </div>
  )
}

interface MyOffboarding {
  offboarding: { id: string; reason: string; lastDay: string; stageLabel: string } | null
  interview: InterviewAnswers | null
}

/**
 * Employee-facing card: shows the exit interview when the signed-in user has an active offboarding.
 * Renders nothing otherwise (and in mock mode). Mount it on the employee dashboard or profile.
 */
export function MyExitInterview({ company, className }: { company: string; className?: string }) {
  const [data, setData] = useState<MyOffboarding | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    api
      .get<MyOffboarding>('/offboardings/me')
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (!data?.offboarding) return null
  const o = data.offboarding

  return (
    <Card className={cn('grid grid-cols-1 gap-4 p-4 sm:p-5', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Exit interview</div>
          <div className="text-xs text-muted-foreground">
            Last working day {formatDate(o.lastDay)} · {o.stageLabel}
          </div>
        </div>
        {!data.interview && !open && <Button onClick={() => setOpen(true)}>Start exit interview</Button>}
      </div>
      {data.interview ? (
        <div className="flex items-center gap-3 rounded-lg border bg-subtle p-3">
          <SuccessCheck size={36} />
          <p className="text-sm text-muted-foreground">Thank you — your answers were sent to HR confidentially on {formatDate(data.interview.submittedAt.slice(0, 10))}.</p>
        </div>
      ) : open ? (
        <ExitInterviewForm
          company={company}
          onSubmit={async (answers) => {
            const res = await api.post<{ interview: InterviewAnswers }>('/offboardings/me/exit-interview', answers)
            setData({ ...data, interview: res.interview })
            toast.success('Exit interview submitted', { description: 'Your answers were sent to HR confidentially.' })
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Six short questions about your time at {company}. It takes about three minutes and helps the people who stay.</p>
      )}
    </Card>
  )
}
