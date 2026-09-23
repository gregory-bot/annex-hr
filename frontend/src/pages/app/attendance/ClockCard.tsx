import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Coffee, FingerprintPattern, Laptop, LogIn, LogOut, MapPin, Play, ShieldCheck, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { SHIFT } from './data'

const pad = (n: number) => String(n).padStart(2, '0')
export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
const clockTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export interface ClockState {
  clockedIn: boolean
  onBreak: boolean
  accumulated: number
  segmentStart: number | null
  log: { at: Date; label: string }[]
}

export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const [state, setState] = useState<ClockState>({ clockedIn: false, onBreak: false, accumulated: 0, segmentStart: null, log: [] })
  const elapsed = state.accumulated + (state.segmentStart ? now.getTime() - state.segmentStart : 0)
  return { now, state, setState, elapsed }
}

type Method = 'Web' | 'Mobile' | 'Biometric'
const methods: { id: Method; icon: typeof Laptop }[] = [
  { id: 'Web', icon: Laptop },
  { id: 'Mobile', icon: Smartphone },
  { id: 'Biometric', icon: FingerprintPattern },
]

export function ClockCard({ clock }: { clock: ReturnType<typeof useClock> }) {
  const { now, state, setState, elapsed } = clock
  const [method, setMethod] = useState<Method>('Web')

  const toggle = () => {
    const t = Date.now()
    if (!state.clockedIn) {
      setState((s) => ({ ...s, clockedIn: true, onBreak: false, segmentStart: t, log: [...s.log, { at: new Date(t), label: `Clocked in · ${method}` }] }))
      toast.success(`Clocked in at ${clockTime(new Date(t))}`, { description: 'Westlands Office · location verified' })
    } else {
      const total = state.accumulated + (state.segmentStart ? t - state.segmentStart : 0)
      setState((s) => ({ ...s, clockedIn: false, onBreak: false, accumulated: total, segmentStart: null, log: [...s.log, { at: new Date(t), label: 'Clocked out' }] }))
      toast.success(`Clocked out — ${hms(total)} worked today`, { description: 'Your timesheet has been updated.' })
    }
  }

  const toggleBreak = () => {
    const t = Date.now()
    if (!state.onBreak) {
      setState((s) => ({ ...s, onBreak: true, accumulated: s.accumulated + (s.segmentStart ? t - s.segmentStart : 0), segmentStart: null, log: [...s.log, { at: new Date(t), label: 'Break started' }] }))
      toast('Break started', { description: 'The timer is paused until you resume.' })
    } else {
      setState((s) => ({ ...s, onBreak: false, segmentStart: t, log: [...s.log, { at: new Date(t), label: 'Break ended' }] }))
      toast.success('Welcome back — timer resumed')
    }
  }

  const statusLabel = !state.clockedIn ? (state.accumulated ? 'Clocked out' : 'Not clocked in') : state.onBreak ? 'On break' : 'Working'

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{formatDate(TODAY, 'long')}</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular sm:text-5xl">{now.toLocaleTimeString('en-GB')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              Shift {SHIFT.start}–{SHIFT.end}
            </Badge>
            <Badge variant={state.clockedIn ? (state.onBreak ? 'warning' : 'success') : 'muted'} dot>
              {statusLabel}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <div className="text-xs text-muted-foreground">Worked today</div>
            <motion.div key={state.clockedIn ? 'on' : 'off'} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('font-mono text-3xl font-semibold tabular', state.clockedIn && !state.onBreak ? 'text-primary' : 'text-foreground')}>
              {hms(elapsed)}
            </motion.div>
          </div>
          <div className="flex gap-2">
            <AnimatePresence initial={false}>
              {state.clockedIn && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden">
                  <Button variant="outline" size="lg" onClick={toggleBreak} className="w-full">
                    {state.onBreak ? <Play /> : <Coffee />}
                    {state.onBreak ? 'Resume' : 'Break'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div layout className="flex-1 sm:flex-none">
              <Button size="xl" variant={state.clockedIn ? 'secondary' : 'default'} onClick={toggle} className="relative w-full min-w-40 overflow-hidden">
                {!state.clockedIn && <motion.span className="absolute inset-0 rounded-xl bg-white/20" animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 2.4, repeat: Infinity }} />}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={state.clockedIn ? 'out' : 'in'} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="relative flex items-center gap-2">
                    {state.clockedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
                    {state.clockedIn ? 'Clock Out' : 'Clock In'}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Method</span>
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              disabled={state.clockedIn}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                method === m.id ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <m.icon className="size-3.5" /> {m.id}
            </button>
          ))}
        </div>
        {state.log.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {state.log.slice(-3).map((l, i) => (
              <span key={i} className="tabular">
                {clockTime(l.at)} · {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export function GeoCard({ office }: { office: string }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative h-40 overflow-hidden bg-subtle sm:h-auto sm:flex-1">
        <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 320 180" aria-hidden>
          <defs>
            <pattern id="geo-grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" stroke="var(--border)" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="320" height="180" fill="url(#geo-grid)" />
          <path d="M-10 120 C 60 100, 120 140, 200 96 S 300 60, 340 70" fill="none" stroke="var(--muted)" strokeWidth="10" />
          <path d="M90 -10 L 130 200" fill="none" stroke="var(--muted)" strokeWidth="8" />
          <path d="M-10 40 L 340 58" fill="none" stroke="var(--muted)" strokeWidth="6" />
          <rect x="190" y="18" width="46" height="28" rx="4" fill="var(--muted)" />
          <rect x="30" y="140" width="40" height="26" rx="4" fill="var(--muted)" />
          <circle cx="160" cy="90" r="46" fill="color-mix(in srgb, var(--primary) 10%, transparent)" stroke="var(--primary)" strokeOpacity="0.5" strokeDasharray="4 4" />
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30" animate={{ scale: [0.6, 1.8], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="relative flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <MapPin className="size-4" />
          </motion.div>
        </div>
        <Badge variant="success" className="absolute left-3 top-3 bg-card shadow-sm">
          <ShieldCheck /> Location verified
        </Badge>
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold">{office} · within geofence</div>
        <div className="mt-0.5 text-xs text-muted-foreground">Geolocation · 150 m radius · accuracy ±12 m</div>
      </div>
    </Card>
  )
}
