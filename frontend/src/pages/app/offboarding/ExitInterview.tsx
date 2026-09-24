import { useState } from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { cn } from '@/lib/utils'

const LEAVE_REASONS = ['Career growth elsewhere', 'Compensation', 'Relocation', 'Work-life balance', 'Management', 'Further studies', 'Other']

const face = (n: number) => (n <= 3 ? '😞' : n <= 6 ? '😐' : n <= 8 ? '🙂' : '😍')

export function ExitInterview({ name, done, onSubmit }: { name: string; done: boolean; onSubmit: () => void }) {
  const [reason, setReason] = useState('')
  const [nps, setNps] = useState<number | null>(null)
  const [improve, setImprove] = useState('')
  const [manager, setManager] = useState(0)
  const [returnAns, setReturnAns] = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)

  const confidentiality = (
    <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
      Responses are confidential. They are shared with HR only in aggregate and never with {name.split(' ')[0]}'s line manager.
    </div>
  )

  if (done) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 place-items-center gap-3 rounded-xl border p-8 text-center">
          <SuccessCheck size={64} />
          <div className="text-base font-semibold">Exit interview {justSubmitted ? 'submitted' : 'completed'}</div>
          <p className="max-w-sm text-sm text-muted-foreground">Thank you — feedback is anonymised and rolled into the quarterly attrition report.</p>
        </motion.div>
        {confidentiality}
      </div>
    )
  }

  const valid = reason && nps !== null && manager > 0 && returnAns

  return (
    <div className="grid grid-cols-1 gap-5">
      {confidentiality}
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
        <div className="flex items-center justify-between gap-2">
          <Label>2. How likely are you to recommend us as an employer?</Label>
          {nps !== null && (
            <motion.span key={nps} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="text-2xl" aria-hidden>
              {face(nps)}
            </motion.span>
          )}
        </div>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setNps(i)}
              className={cn(
                'h-9 rounded-md border text-xs font-medium tabular transition-colors hover:border-primary',
                nps === i ? 'border-primary bg-primary text-white' : 'bg-card text-foreground',
              )}
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
        <Label htmlFor="exit-improve">3. What could we improve?</Label>
        <Textarea id="exit-improve" value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="Be as candid as you like — this helps the people who stay." />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>4. How would you rate your manager?</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <motion.button key={n} type="button" whileTap={{ scale: 0.85 }} onClick={() => setManager(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="p-1">
              <Star className={cn('size-6 transition-colors', n <= manager ? 'fill-primary text-primary' : 'text-muted-foreground/50')} />
            </motion.button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label>5. Would you consider returning to the company?</Label>
        <RadioGroup value={returnAns} onValueChange={setReturnAns} className="flex gap-3">
          {['Yes', 'No'].map((v) => (
            <label key={v} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm', returnAns === v && 'border-primary bg-accent/50')}>
              <RadioGroupItem value={v} /> {v}
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!valid}
          onClick={() => {
            setJustSubmitted(true)
            onSubmit()
            toast.success('Exit interview submitted', { description: 'Responses stored confidentially.' })
          }}
        >
          Submit exit interview
        </Button>
      </div>
    </div>
  )
}
