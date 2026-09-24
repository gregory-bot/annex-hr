/** Pulse survey API: list, drafts, publish/close, responses and server-computed results. */
import { useCallback, useEffect, useState } from 'react'
import type { Survey } from '@/data/types'
import { api, USE_MOCK_API } from '@/lib/api'
import { PULSE_QUESTIONS, type Question } from './data'

export interface SurveyFull extends Survey {
  questions: Question[]
  departments: string[]
  respondedByMe: boolean
  createdAt?: string | null
  publishedAt?: string | null
}

export interface SurveyInput {
  title: string
  anonymous: boolean
  closes: string
  departments: string[]
  questions: Question[]
}

export interface QuestionResult {
  id: string
  type: Question['type']
  text: string
  answered: number
  counts?: number[]
  pct?: number[]
  favourable?: number
  promoters?: number
  passives?: number
  detractors?: number
  enps?: number
  options?: { label: string; count: number; pct: number }[]
}

export interface SurveyResults {
  surveyId: string
  responses: number
  audience: number
  anonymous: boolean
  minGroup: number
  suppressed: boolean
  engagement: number | null
  enps: number | null
  nps: { promoters: number; passives: number; detractors: number; enps: number; n: number } | null
  questions: QuestionResult[]
  departments: { departmentId: string; name: string; responses: number; engagement: number; enps: number }[]
  hiddenDepartments: number
  comments: { text: string; sentiment: 'Positive' | 'Neutral' | 'Constructive'; department: string | null }[]
  previous: { title: string; engagement: number; enps: number } | null
  trend: { title: string; closes: string; engagement: number; enps: number }[]
}

/** Mock mode: the seed surveys get the standard pulse questions. */
function fromSeed(s: Survey): SurveyFull {
  return { ...s, questions: s.status === 'Draft' ? [] : PULSE_QUESTIONS, departments: [], respondedByMe: false }
}

export function useSurveys(seed: Survey[]) {
  const [surveys, setSurveys] = useState<SurveyFull[]>(() => seed.map(fromSeed))
  const [loading, setLoading] = useState(!USE_MOCK_API)

  const reload = useCallback(async () => {
    if (USE_MOCK_API) return
    try {
      setSurveys(await api.get<SurveyFull[]>('/surveys'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const upsert = (s: SurveyFull) => setSurveys((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list]))

  return { surveys, setSurveys, upsert, loading, reload }
}

export const surveyApi = {
  create: (input: SurveyInput, publish: boolean) => api.post<SurveyFull>('/surveys', { ...input, publish }),
  update: (id: string, input: Partial<SurveyInput>) => api.patch<SurveyFull>(`/surveys/${id}`, input),
  publish: (id: string) => api.post<SurveyFull>(`/surveys/${id}/publish`),
  close: (id: string) => api.post<SurveyFull>(`/surveys/${id}/close`),
  remove: (id: string) => api.delete<void>(`/surveys/${id}`),
  respond: (id: string, answers: Record<string, string | number>) => api.post<{ ok: true }>(`/surveys/${id}/responses`, { answers }),
  results: (id: string) => api.get<SurveyResults>(`/surveys/${id}/results`),
}
