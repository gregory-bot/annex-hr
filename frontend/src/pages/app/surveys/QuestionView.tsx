import { AnimatePresence, motion } from 'framer-motion'
import { Textarea } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { EMOJIS, type Question } from './data'

export type Answer = number | string | undefined

/** A single question exactly as respondents see it. */
export function QuestionView({ q, value, onChange, index, total }: { q: Question; value: Answer; onChange: (v: Answer) => void; index?: number; total?: number }) {
  return (
    <div>
      {index !== undefined && total !== undefined && (
        <div className="mb-2 text-xs font-medium text-muted-foreground tabular">
          Question {index + 1} of {total}
        </div>
      )}
      <h3 className="text-base font-semibold leading-snug sm:text-lg">{q.text || 'Untitled question'}</h3>

      {q.type === 'emoji' && (
        <div className="mt-5">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
            {EMOJIS.map((em, i) => {
              const on = value === i + 1
              return (
                <motion.button
                  key={em.e}
                  type="button"
                  aria-label={em.label}
                  aria-pressed={on}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.9 }}
                  animate={on ? { scale: [1, 1.25, 1.08] } : { scale: 1 }}
                  transition={{ duration: 0.35 }}
                  onClick={() => onChange(i + 1)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-[28px] transition-colors sm:text-4xl',
                    on ? 'border-primary bg-accent shadow-md shadow-primary/10' : 'border-transparent bg-muted/60 grayscale-[35%] hover:grayscale-0',
                  )}
                >
                  <span>{em.e}</span>
                </motion.button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>Not at all</span>
            <AnimatePresence mode="wait">
              {typeof value === 'number' && (
                <motion.span key={value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="font-medium text-foreground">
                  {EMOJIS[value - 1]?.label}
                </motion.span>
              )}
            </AnimatePresence>
            <span>Absolutely</span>
          </div>
        </div>
      )}

      {q.type === 'nps' && (
        <div className="mt-5">
          <div className="grid grid-cols-11 gap-1 sm:gap-1.5">
            {Array.from({ length: 11 }, (_, n) => {
              const on = value === n
              return (
                <motion.button
                  key={n}
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  animate={on ? { y: -3 } : { y: 0 }}
                  onClick={() => onChange(n)}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-lg border text-xs font-semibold tabular transition-colors sm:h-11 sm:text-sm',
                    on ? 'border-primary bg-primary text-white shadow-sm shadow-primary/30' : 'bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {n}
                </motion.button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>Not likely</span>
            <span>Extremely likely</span>
          </div>
        </div>
      )}

      {q.type === 'choice' && (
        <div className="mt-5 grid grid-cols-1 gap-2">
          {(q.options ?? []).map((o) => {
            const on = value === o
            return (
              <motion.button
                key={o}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => onChange(o)}
                className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors', on ? 'border-primary bg-accent font-medium' : 'hover:bg-muted/60')}
              >
                <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border', on && 'border-primary')}>
                  {on && <motion.span layoutId={`dot-${q.id}`} className="size-2 rounded-full bg-primary" />}
                </span>
                {o || 'Option'}
              </motion.button>
            )
          })}
        </div>
      )}

      {q.type === 'text' && (
        <Textarea className="mt-5" placeholder="Type your answer… it stays anonymous." value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
