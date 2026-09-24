import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { TODAY } from '@/lib/utils'
import { entryFor, hash01 } from './data'
import { applyToday, currentPosition, todMs, useAttendanceStore, type TodaySummary } from './api'

const MIN = 60_000
const pad = (n: number) => String(n).padStart(2, '0')

/** HH:MM:SS from a duration in ms. */
export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
/** HH:MM from a time of day in ms. */
export const hm = (ms: number) => {
  const m = Math.floor(ms / MIN)
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
}
export const hrs = (ms: number) => (ms / 3_600_000).toFixed(2)

export type ClockEventKind = 'in' | 'out' | 'break' | 'resume'
export interface ClockEvent {
  /** Time of day in ms (workday clock). */
  at: number
  kind: ClockEventKind
  label: string
}

export interface ClockState {
  clockedIn: boolean
  onBreak: boolean
  /** Worked ms banked before the current segment. */
  accumulated: number
  /** Real timestamp when the current work segment started. */
  segmentStart: number | null
  breakAccum: number
  breakStart: number | null
  log: ClockEvent[]
}

/** What the clock card, today's activity and the dashboard read. */
export interface Clock {
  /** Time of day in ms (local). */
  now: number
  state: { clockedIn: boolean; onBreak: boolean; log: ClockEvent[] }
  elapsed: number
  breakMs: number
  toggle: (via?: string) => void
  toggleBreak: () => void
  statusLabel: string
  firstIn: number | null
  /** True while a punch is being saved. */
  busy?: boolean
  /** False until today's record has loaded from the server. */
  ready?: boolean
  /** Work date (server's local date in live mode). */
  date?: string
  location?: { latitude: number; longitude: number } | null
  lateMinutes?: number
}

/**
 * Demo mode: a deterministic workday that keeps ticking live. The person is already
 * punched in (seeded from their id); the timer then advances in real time.
 */
function useMockClock(seed: string): Clock {
  const [origin] = useState(() => {
    const entry = entryFor(seed, TODAY)
    const tea = 15 * MIN
    const worked = (150 + Math.round(hash01(seed + TODAY + 'worked') * 120)) * MIN
    const inAt = entry.inMin * MIN
    return { mount: Date.now(), inAt, tea, worked, nowAt: inAt + tea + worked }
  })
  const [tick, setTick] = useState(origin.mount)
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [state, setState] = useState<ClockState>(() => ({
    clockedIn: true,
    onBreak: false,
    accumulated: origin.worked,
    segmentStart: origin.mount,
    breakAccum: origin.tea,
    breakStart: null,
    log: [
      { at: origin.inAt, kind: 'in', label: 'Punch in' },
      { at: 10.5 * 60 * MIN, kind: 'break', label: 'Break started' },
      { at: 10.5 * 60 * MIN + origin.tea, kind: 'resume', label: 'Back from break' },
    ],
  }))

  const clockAt = (real: number) => origin.nowAt + (real - origin.mount)
  const now = clockAt(tick)
  const elapsed = state.accumulated + (state.segmentStart ? tick - state.segmentStart : 0)
  const breakMs = state.breakAccum + (state.breakStart ? tick - state.breakStart : 0)

  const toggle = (via?: string) => {
    const t = Date.now()
    const at = clockAt(t)
    if (!state.clockedIn) {
      setState((s) => ({ ...s, clockedIn: true, onBreak: false, segmentStart: t, log: [...s.log, { at, kind: 'in', label: via ? `Punch in · ${via}` : 'Punch in' }] }))
      toast.success(`Punched in at ${hm(at)}`, { description: 'Location verified' })
    } else {
      const worked = state.accumulated + (state.segmentStart ? t - state.segmentStart : 0)
      setState((s) => ({
        ...s,
        clockedIn: false,
        onBreak: false,
        accumulated: worked,
        segmentStart: null,
        breakAccum: s.breakAccum + (s.breakStart ? t - s.breakStart : 0),
        breakStart: null,
        log: [...s.log, { at, kind: 'out', label: 'Punch out' }],
      }))
      toast.success(`Punched out at ${hm(at)}`, { description: `${hrs(worked)} hrs worked today` })
    }
  }

  const toggleBreak = () => {
    const t = Date.now()
    const at = clockAt(t)
    if (!state.onBreak) {
      setState((s) => ({ ...s, onBreak: true, accumulated: s.accumulated + (s.segmentStart ? t - s.segmentStart : 0), segmentStart: null, breakStart: t, log: [...s.log, { at, kind: 'break', label: 'Break started' }] }))
      toast('Break started', { description: 'Timer paused' })
    } else {
      setState((s) => ({ ...s, onBreak: false, segmentStart: t, breakAccum: s.breakAccum + (s.breakStart ? t - s.breakStart : 0), breakStart: null, log: [...s.log, { at, kind: 'resume', label: 'Back from break' }] }))
      toast.success('Timer resumed')
    }
  }

  const statusLabel = !state.clockedIn ? 'Punched out' : state.onBreak ? 'On break' : 'Working'
  const firstIn = state.log.find((l) => l.kind === 'in')?.at ?? null

  return { now, state, elapsed, breakMs, toggle, toggleBreak, statusLabel, firstIn, ready: true, date: TODAY }
}

/** Live mode: today's record comes from the server (GET /attendance/me) and every punch is saved. */
function useLiveClock(seed: string): Clock {
  const key = seed
  const { data, receivedAt } = useAttendanceStore(key, true)
  const [tick, setTick] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const today = data?.today
  const since = Math.max(0, tick - receivedAt)
  const working = today?.state === 'working'
  const onBreak = today?.state === 'break'
  const elapsed = (today?.workedSeconds ?? 0) * 1000 + (working ? since : 0)
  const breakMs = (today?.breakSeconds ?? 0) * 1000 + (onBreak ? since : 0)
  const d = new Date(tick)
  const now = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000
  const log: ClockEvent[] = (today?.events ?? []).map((e) => ({ at: todMs(e.at), kind: e.kind, label: e.label }))

  const run = async (label: string, fn: () => Promise<TodaySummary>, done: (t: TodaySummary) => void) => {
    if (busy) return
    setBusy(true)
    try {
      const t = await fn()
      applyToday(key, t)
      done(t)
    } catch (err) {
      toast.error(`${label} not saved`, { description: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const toggle = (via?: string) => {
    if (!today) return
    if (today.state === 'out') {
      void run(
        'Punch in',
        async () => {
          const pos = await currentPosition()
          return api.post<TodaySummary>('/attendance/clock-in', { method: via ?? 'Web', ...(pos ?? {}) })
        },
        (t) => toast.success(`Punched in at ${hm(todMs(t.events.filter((e) => e.kind === 'in').at(-1)?.at ?? t.serverTime))}`, { description: t.location ? 'Location recorded with your punch' : 'Location not shared' }),
      )
    } else {
      void run('Punch out', () => api.post<TodaySummary>('/attendance/clock-out'), (t) =>
        toast.success(`Punched out at ${hm(todMs(t.lastOut ?? t.serverTime))}`, { description: `${hrs(t.workedSeconds * 1000)} hrs worked today` }),
      )
    }
  }

  const toggleBreak = () => {
    if (!today || today.state === 'out') return
    if (today.state === 'working') void run('Break', () => api.post<TodaySummary>('/attendance/break/start'), () => toast('Break started', { description: 'Timer paused' }))
    else void run('Break', () => api.post<TodaySummary>('/attendance/break/end'), () => toast.success('Timer resumed'))
  }

  return {
    now,
    state: { clockedIn: working || onBreak, onBreak, log },
    elapsed,
    breakMs,
    toggle,
    toggleBreak,
    statusLabel: !today ? 'Loading…' : today.state === 'out' ? (today.firstIn ? 'Punched out' : 'Not punched in') : onBreak ? 'On break' : 'Working',
    firstIn: today?.firstIn ? todMs(today.firstIn) : null,
    busy,
    ready: !!today,
    date: today?.date,
    location: today?.location ?? null,
    lateMinutes: today?.lateMinutes ?? 0,
  }
}

/** The workday clock: persisted through the API, or simulated in demo (mock API) mode. */
export const useClock: (seed: string) => Clock = USE_MOCK_API ? useMockClock : useLiveClock
