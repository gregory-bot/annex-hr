import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { SHIFT } from './data'
import { hms, type Clock } from './workday'

type Method = 'Web' | 'Mobile' | 'Biometric'
const methods: { id: Method }[] = [{ id: 'Web' }, { id: 'Mobile' }, { id: 'Biometric' }]

export function ClockCard({ clock, shiftLabel }: { clock: Clock; shiftLabel?: string }) {
  const { now, state, elapsed, toggle, toggleBreak, statusLabel, busy, ready = true } = clock
  const [method, setMethod] = useState<Method>('Web')
  const shift = shiftLabel ?? `${SHIFT.start}–${SHIFT.end}`

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{formatDate(clock.date ?? TODAY, 'long')}</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular sm:text-5xl">{hms(now)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              Shift {shift}
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
                  <Button variant="outline" size="lg" onClick={toggleBreak} disabled={busy} className="w-full">
                    {state.onBreak ? 'Resume' : 'Break'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div layout className="flex-1 sm:flex-none">
              <Button size="xl" variant={state.clockedIn ? 'secondary' : 'default'} onClick={() => toggle(method)} disabled={busy || !ready} className="relative w-full min-w-40 overflow-hidden">
                {!state.clockedIn && ready && !busy && <motion.span className="absolute inset-0 rounded-xl bg-white/20" animate={{ opacity: [0, 0.5, 0] }} transition={{ duration: 2.4, repeat: Infinity }} />}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={state.clockedIn ? 'out' : 'in'} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="relative flex items-center gap-2">
                    {busy ? 'Saving…' : state.clockedIn ? 'Punch out' : 'Punch in'}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Method</span>
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              disabled={state.clockedIn}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                method === m.id ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {m.id}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

/**
 * Where today's punch was recorded. Live mode shows the browser location captured with the
 * punch-in (only when the person allowed it); demo mode shows the office geofence.
 */
export function GeoCard({ office, live, location, clockedIn }: { office: string; live?: boolean; location?: { latitude: number; longitude: number } | null; clockedIn?: boolean }) {
  const captured = !live || !!location
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
          <circle cx="160" cy="90" r="46" opacity={captured ? 1 : 0.35} fill="color-mix(in srgb, var(--primary) 10%, transparent)" stroke="var(--primary)" strokeOpacity="0.5" strokeDasharray="4 4" />
        </svg>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30" animate={{ scale: [0.6, 1.8], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="relative flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <MapPin className="size-4" />
          </motion.div>
        </div>
        <Badge variant={captured ? 'success' : 'muted'} dot className="absolute left-3 top-3 bg-card shadow-sm">
          {captured ? (live ? 'Location recorded' : 'Location verified') : 'Location not shared'}
        </Badge>
      </div>
      <div className="p-4">
        {live ? (
          <>
            <div className="text-sm font-semibold">{location ? 'Recorded with today’s punch in' : clockedIn ? 'Punched in without location' : 'Location is optional'}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} · shared from this device` : 'Allow location access in your browser when punching in to attach it to your record.'}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">{office} · within geofence</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Geolocation · 150 m radius · accuracy ±12 m</div>
          </>
        )}
      </div>
    </Card>
  )
}
