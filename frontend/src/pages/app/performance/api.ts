import { useCallback, useEffect, useState } from 'react'
import type { KPI } from '@/data/types'
import { api, USE_MOCK_API } from '@/lib/api'
import type { StepStatus } from './data'

export type Kpi = KPI & { lowerIsBetter?: boolean }

export interface Scorecard {
  overall: number
  onTrack: number
  total: number
  perspectives: { perspective: KPI['perspective']; score: number; weight: number; count: number }[]
  kpis: { id: string; attainment: number; onTrack: boolean }[]
}

export interface KpiPayload {
  kpis: Kpi[]
  scorecard: Scorecard
}

export interface KrUpdate {
  progress: number
  current: string
  note: string | null
  author: string | null
  at: string
}

export interface ServerKeyResult {
  id: string
  title: string
  current: string
  target: string
  progress: number
  updatedAt: string
  updates: KrUpdate[]
}

export interface ServerObjective {
  id: string
  quarter: string
  title: string
  ownerId: string
  confidence: 'High' | 'Medium' | 'Low'
  progress: number
  updatedAt: string
  keyResults: ServerKeyResult[]
}

export interface ReviewCycle {
  id: string
  name: string
  quarter: string
  periodStart: string
  periodEnd: string
  closesOn: string
  stage: number
  stageLabel: string
  released: boolean
  releasedAt: string | null
}

export interface ReviewListRow {
  employeeId: string
  self: StepStatus
  manager: StepStatus
  peer: StepStatus
  peerCount: number
  myPeerStatus: StepStatus | null
  finalRating: number | null
}

export interface ReviewDoc {
  status: StepStatus
  ratings: Record<string, number>
  overall: number | null
  strengths: string
  improvements: string
  submittedAt: string | null
  updatedAt: string
}

export interface ReviewDetail {
  employeeId: string
  cycle: ReviewCycle
  self: ReviewDoc | null
  manager: ReviewDoc | null
  peers: { strengths: string; improvements: string; overall: number | null }[]
  myPeer: ReviewDoc | null
  finalRating: number | null
  canWrite: { self: boolean; manager: boolean; peer: boolean }
}

export interface TalentRow {
  employeeId: string
  performance: number
  potential: number
}

export type Readiness = 'Ready now' | '1–2 years' | '3+ years'

export interface SuccessionPlan {
  id: string
  roleTitle: string
  departmentId: string | null
  incumbentId: string | null
  successors: { employeeId: string; readiness: Readiness; flightRisk: 'Low' | 'Medium' | 'High' }[]
  notes: string
  updatedAt: string
}

/** Loads a server resource (skipped in mock mode) with a setter for optimistic updates. */
export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!USE_MOCK_API && !!path)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    if (USE_MOCK_API || !path) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setData(await api.get<T>(path))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load')
    } finally {
      setLoading(false)
    }
  }, [path])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, setData, loading, error, reload }
}
