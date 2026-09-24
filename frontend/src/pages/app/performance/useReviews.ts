import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Employee } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { reviewFor, type ReviewRow } from './data'
import type { ReviewCycle, ReviewDetail, ReviewDoc, ReviewListRow } from './api'

export type ReviewKind = 'self' | 'manager' | 'peer'
export interface ReviewInput {
  ratings: Record<string, number>
  strengths: string
  improvements: string
  submit: boolean
}

const MOCK_CYCLE: ReviewCycle = {
  id: 'mock-q3',
  name: 'Q3 2026 review',
  quarter: '2026-Q3',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  closesOn: '2026-10-10',
  stage: 1,
  stageLabel: 'Manager review',
  released: false,
  releasedAt: null,
}
const STAGES = ['Self review', 'Manager review', 'Peer feedback', 'Calibration', 'Released']

/** The current review cycle and its rows. The server scopes rows: employees get themselves, managers their reports. */
export function useReviews(employees: Employee[]) {
  const reviewable = useMemo(() => employees.filter((e) => e.status !== 'Exited' && e.employmentType !== 'Consultant' && e.role !== 'ceo'), [employees])
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const [cycle, setCycle] = useState<ReviewCycle | null>(USE_MOCK_API ? MOCK_CYCLE : null)
  const [rows, setRows] = useState<ReviewRow[]>(() => (USE_MOCK_API ? reviewable.map(reviewFor) : []))
  const [loading, setLoading] = useState(!USE_MOCK_API)

  const toRow = useCallback(
    (r: ReviewListRow): ReviewRow[] => {
      const e = byId.get(r.employeeId)
      return e ? [{ employee: e, self: r.self, manager: r.manager, peer: r.peer, final: r.finalRating ?? undefined, peerCount: r.peerCount, myPeerStatus: r.myPeerStatus }] : []
    },
    [byId],
  )

  const loadRows = useCallback(
    async (c: ReviewCycle) => {
      const res = await api.get<{ cycle: ReviewCycle; rows: ReviewListRow[] }>(`/performance/review-cycles/${c.id}/reviews`)
      setCycle(res.cycle)
      setRows(res.rows.flatMap(toRow))
    },
    [toRow],
  )

  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    ;(async () => {
      try {
        const cycles = await api.get<ReviewCycle[]>('/performance/review-cycles')
        const current = cycles.find((c) => !c.released) ?? cycles[0]
        if (current && !cancelled) await loadRows(current)
      } catch (err) {
        toast.error('Could not load reviews', { description: errorMessage(err) })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadRows])

  const detail = useCallback(
    async (employeeId: string): Promise<ReviewDetail | null> => {
      if (USE_MOCK_API || !cycle) return null
      try {
        return await api.get<ReviewDetail>(`/performance/review-cycles/${cycle.id}/reviews/${employeeId}`)
      } catch (err) {
        toast.error('Could not load the review', { description: errorMessage(err) })
        return null
      }
    },
    [cycle],
  )

  const save = useCallback(
    async (employeeId: string, kind: ReviewKind, input: ReviewInput): Promise<ReviewDetail | true | null> => {
      const status = input.submit ? 'Submitted' : 'In Progress'
      const values = Object.values(input.ratings)
      const overall = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : undefined
      const patchRow = (r: ReviewRow): ReviewRow =>
        r.employee.id !== employeeId
          ? r
          : kind === 'self'
            ? { ...r, self: status }
            : kind === 'manager'
              ? { ...r, manager: status, final: input.submit ? overall : r.final }
              : { ...r, myPeerStatus: status, peer: input.submit ? 'Submitted' : r.peer }
      if (USE_MOCK_API) {
        setRows((rs) => rs.map(patchRow))
        return true
      }
      if (!cycle) return null
      try {
        const d = await api.put<ReviewDetail>(`/performance/review-cycles/${cycle.id}/reviews/${employeeId}/${kind}`, input)
        setRows((rs) => rs.map(patchRow))
        return d
      } catch (err) {
        toast.error('Review not saved', { description: errorMessage(err) })
        return null
      }
    },
    [cycle],
  )

  const advance = useCallback(async () => {
    if (!cycle) return
    if (USE_MOCK_API) {
      const stage = Math.min(4, cycle.stage + 1)
      setCycle({ ...cycle, stage, stageLabel: STAGES[stage]!, released: stage === 4 })
      toast.success(stage === 4 ? 'Results released' : `Moved to ${STAGES[stage]}`)
      return
    }
    try {
      const res = await api.post<ReviewCycle & { ratingsReleased: number }>(`/performance/review-cycles/${cycle.id}/advance`)
      await loadRows(res)
      toast.success(res.released ? 'Results released' : `Moved to ${res.stageLabel}`, {
        description: res.released ? `${res.ratingsReleased} final ratings published to employee profiles.` : undefined,
      })
    } catch (err) {
      toast.error('Stage not changed', { description: errorMessage(err) })
    }
  }, [cycle, loadRows])

  const calibrate = useCallback(
    async (employeeId: string, rating: number) => {
      if (!USE_MOCK_API && cycle) {
        try {
          await api.post(`/performance/review-cycles/${cycle.id}/calibrate`, { employeeId, rating })
        } catch (err) {
          toast.error('Rating not saved', { description: errorMessage(err) })
          return false
        }
      }
      setRows((rs) => rs.map((r) => (r.employee.id === employeeId ? { ...r, final: rating } : r)))
      toast.success('Calibrated rating saved')
      return true
    },
    [cycle],
  )

  return { cycle, rows, loading, detail, save, advance, calibrate }
}

export type Reviews = ReturnType<typeof useReviews>
export type { ReviewDoc }
