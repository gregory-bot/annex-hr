import { useRef } from 'react'
import { cn } from '@/lib/utils'

/** Six single-digit boxes with auto-advance, backspace and paste support. */
export function CodeInput({ value, onChange, length = 6, invalid }: { value: string; onChange: (v: string) => void; length?: number; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const setAt = (i: number, d: string) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join('').slice(0, length))
  }

  return (
    <div className="flex justify-between gap-2 sm:gap-3" role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            setAt(i, v)
            if (v && i < length - 1) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) {
              refs.current[i - 1]?.focus()
              setAt(i - 1, '')
            }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus()
          }}
          onPaste={(e) => {
            const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
            if (!txt) return
            e.preventDefault()
            onChange(txt)
            refs.current[Math.min(txt.length, length - 1)]?.focus()
          }}
          className={cn(
            'h-12 w-full min-w-0 rounded-xl border border-input bg-card text-center text-lg font-semibold tabular outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 sm:h-14 sm:text-xl',
            d && 'border-primary/50 bg-accent/30',
            invalid && 'border-danger',
          )}
        />
      ))}
    </div>
  )
}
