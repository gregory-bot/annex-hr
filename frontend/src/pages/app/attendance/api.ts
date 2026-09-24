/** Attendance API: types, a shared store for the signed-in person's attendance, and small fetch hooks. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, errorMessage } from '@/lib/api'

export interface AttendanceSettings {
  shiftStart: string
  shiftEnd: string
  graceMin: number
  hoursPerDay: number
  timezone: string
}

export interface AttendanceEvent {
  at: string
  kind: 'in' | 'out' | 'break' | 'resume'
  label: string
}

export interface TodaySummary {
  date: string
  serverTime: string
  state: 'out' | 'working' | 'break'
  openRecordId: string | null
  workedSeconds: number
  breakSeconds: number
  firstIn: string | null
  lastOut: string | null
  method: 'Web' | 'Mobile' | 'Biometric' | null
  location: { latitude: number; longitude: number } | null
  lateMinutes: number
  overtimeMinutes: number
  events: AttendanceEvent[]
}

export type ServerDayStatus = 'present' | 'late' | 'absent' | 'leave' | 'holiday'

export interface AttendanceDay {
  date: string
  status: ServerDayStatus
  label?: string | null
  firstIn: string | null
  lastOut: string | null
  inMin: number | null
  outMin: number | null
  workedMinutes: number
  breakMinutes: number
  lateMinutes: number
  overtimeMinutes: number
  open: boolean
  onBreak: boolean
  method: string | null
}

export interface MeResponse {
  settings: AttendanceSettings
  today: TodaySummary
  days: AttendanceDay[]
}

export interface AttendanceSummary {
  date: string
  scope: 'organisation' | 'team'
  settings: AttendanceSettings
  active: number
  present: number
  late: number
  absent: number
  onLeave: number
  notInYet: number
  holiday: number
  lateArrivals: { employeeId: string; name: string; title: string; firstIn: string; inMin: number; minutesLate: number }[]
  overtime: { employeeId: string; name: string; title: string; hours: number }[]
  overtimeWeekHours: number
  trend: { day: string; date: string; onTime: number | null; late: number | null; absent: number | null }[]
}

export interface HeatCellDto {
  date: string
  pct: number | null
}

// ── Shared store: one fetch serves the clock card, stats, history and the dashboard ──
interface StoreState {
  key: string | null
  data: MeResponse | null
  /** Client clock (ms) when `data.today` arrived — the live timer counts from here. */
  receivedAt: number
  loading: boolean
  error: string | null
}

let store: StoreState = { key: null, data: null, receivedAt: 0, loading: false, error: null }
let inflight: Promise<void> | null = null
let fetchedAt = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (patch: Partial<StoreState>) => {
  store = { ...store, ...patch }
  emit()
}

/** Loads GET /attendance/me for `key` (the signed-in employee). Cached for a minute unless forced. */
export function loadAttendance(key: string, force = false): Promise<void> {
  if (store.key !== key) {
    store = { key, data: null, receivedAt: 0, loading: false, error: null }
    inflight = null
    fetchedAt = 0
  }
  if (inflight) return inflight
  if (!force && store.data && Date.now() - fetchedAt < 60_000) return Promise.resolve()
  set({ loading: true })
  inflight = api
    .get<MeResponse>('/attendance/me')
    .then((data) => {
      if (store.key !== key) return
      fetchedAt = Date.now()
      set({ data, receivedAt: Date.now(), loading: false, error: null })
    })
    .catch((err) => {
      if (store.key === key) set({ loading: false, error: errorMessage(err) })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Applies a fresh `today` from a clock action, then refreshes the history in the background. */
export function applyToday(key: string, today: TodaySummary) {
  if (store.key !== key || !store.data) return void loadAttendance(key, true)
  set({ data: { ...store.data, today }, receivedAt: Date.now() })
  void loadAttendance(key, true)
}

export function useAttendanceStore(key: string, enabled: boolean) {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => store,
  )
  useEffect(() => {
    if (enabled) void loadAttendance(key)
  }, [key, enabled])
  return snap.key === key ? snap : { ...snap, data: null }
}

/** GET helper with loading / error state; refetches when `path` changes (null = skip). */
export function useApiGet<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    api
      .get<T>(path)
      .then((data) => live && setState({ path, data, error: null }))
      .catch((err) => live && setState({ path, data: null, error: errorMessage(err) }))
    return () => {
      live = false
    }
  }, [path, version])
  return { data: state.path === path ? state.data : null, error: state.path === path ? state.error : null, loading: !!path && state.path !== path, reload: () => setVersion((v) => v + 1) }
}

/** Minutes since local midnight → ms (the workday clock's unit). */
export const todMs = (isoTs: string) => {
  const d = new Date(isoTs)
  return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000
}

/** The browser's position when the person allows it (resolves null when denied, unavailable or slow). */
export function currentPosition(timeoutMs = 6000): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        resolve({ latitude: +p.coords.latitude.toFixed(6), longitude: +p.coords.longitude.toFixed(6) })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    )
  })
}
