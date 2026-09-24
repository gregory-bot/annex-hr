import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import type { KeyResult, Objective } from './data'
import type { ServerObjective } from './api'

export interface NewObjective {
  title: string
  ownerId: string
  confidence: Objective['confidence']
  keyResults: { title: string; current: string; target: string; progress: number }[]
}

export interface CheckIn {
  progress: number
  current: string
  note?: string
}

const fromServer = (o: ServerObjective): Objective => ({
  id: o.id,
  title: o.title,
  ownerId: o.ownerId,
  confidence: o.confidence,
  keyResults: o.keyResults.map((k) => ({ id: k.id, title: k.title, current: k.current, target: k.target, progress: k.progress, updates: k.updates })),
})

let seq = 0
const tmp = (p: string) => `${p}-tmp-${Date.now().toString(36)}-${++seq}`

/** OKRs with server persistence (real mode) or local state (mock mode). Employees only ever receive their own objectives. */
export function useObjectives(initial: Objective[], meName: string) {
  const [objectives, setObjectives] = useState<Objective[]>(USE_MOCK_API ? initial : [])
  const [loading, setLoading] = useState(!USE_MOCK_API)

  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    api
      .get<ServerObjective[]>('/performance/objectives?quarter=2026-Q3')
      .then((rows) => !cancelled && setObjectives(rows.map(fromServer)))
      .catch((err) => toast.error('Could not load objectives', { description: errorMessage(err) }))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const replace = (o: Objective) => setObjectives((os) => os.map((x) => (x.id === o.id ? o : x)))

  const create = useCallback(async (input: NewObjective) => {
    if (USE_MOCK_API) {
      const o: Objective = { id: tmp('okr'), ...input, keyResults: input.keyResults.map((k) => ({ ...k, id: tmp('kr') })) }
      setObjectives((os) => [...os, o])
      return true
    }
    try {
      const saved = await api.post<ServerObjective>('/performance/objectives', { ...input, quarter: '2026-Q3' })
      setObjectives((os) => [...os, fromServer(saved)])
      return true
    } catch (err) {
      toast.error('Objective not saved', { description: errorMessage(err) })
      return false
    }
  }, [])

  const update = useCallback(
    async (id: string, patch: Partial<Pick<Objective, 'title' | 'confidence' | 'ownerId'>>) => {
      let prev: Objective | undefined
      setObjectives((os) => os.map((o) => (o.id === id ? ((prev = o), { ...o, ...patch }) : o)))
      if (USE_MOCK_API) return
      try {
        replace(fromServer(await api.patch<ServerObjective>(`/performance/objectives/${id}`, patch)))
      } catch (err) {
        if (prev) replace(prev)
        toast.error('Objective not updated', { description: errorMessage(err) })
      }
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    let snapshot: Objective[] = []
    setObjectives((os) => ((snapshot = os), os.filter((o) => o.id !== id)))
    if (USE_MOCK_API) return
    try {
      await api.delete(`/performance/objectives/${id}`)
    } catch (err) {
      setObjectives(snapshot)
      toast.error('Objective not deleted', { description: errorMessage(err) })
    }
  }, [])

  const addKeyResult = useCallback(async (objectiveId: string, kr: Omit<KeyResult, 'id' | 'updates'>) => {
    if (USE_MOCK_API) {
      setObjectives((os) => os.map((o) => (o.id === objectiveId ? { ...o, keyResults: [...o.keyResults, { ...kr, id: tmp('kr') }] } : o)))
      return true
    }
    try {
      replace(fromServer(await api.post<ServerObjective>(`/performance/objectives/${objectiveId}/key-results`, kr)))
      return true
    } catch (err) {
      toast.error('Key result not added', { description: errorMessage(err) })
      return false
    }
  }, [])

  const checkIn = useCallback(
    async (objectiveId: string, krId: string, c: CheckIn) => {
      let prev: Objective | undefined
      setObjectives((os) =>
        os.map((o) => {
          if (o.id !== objectiveId) return o
          prev = o
          return {
            ...o,
            keyResults: o.keyResults.map((k) =>
              k.id === krId
                ? { ...k, progress: c.progress, current: c.current, updates: [{ progress: c.progress, current: c.current, note: c.note ?? null, author: meName, at: new Date().toISOString() }, ...(k.updates ?? [])] }
                : k,
            ),
          }
        }),
      )
      if (USE_MOCK_API) return true
      try {
        replace(fromServer(await api.patch<ServerObjective>(`/performance/key-results/${krId}`, { progress: c.progress, current: c.current, note: c.note || undefined })))
        return true
      } catch (err) {
        if (prev) replace(prev)
        toast.error('Check-in not saved', { description: errorMessage(err) })
        return false
      }
    },
    [meName],
  )

  const removeKeyResult = useCallback(async (objectiveId: string, krId: string) => {
    let prev: Objective | undefined
    setObjectives((os) => os.map((o) => (o.id === objectiveId ? ((prev = o), { ...o, keyResults: o.keyResults.filter((k) => k.id !== krId) }) : o)))
    if (USE_MOCK_API) return
    try {
      replace(fromServer(await api.delete<ServerObjective>(`/performance/key-results/${krId}`)))
    } catch (err) {
      if (prev) replace(prev)
      toast.error('Key result not removed', { description: errorMessage(err) })
    }
  }, [])

  return { objectives, loading, create, update, remove, addKeyResult, checkIn, removeKeyResult }
}
