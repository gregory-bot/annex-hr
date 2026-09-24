import { useCallback, useEffect, useRef, useState } from 'react'
import type { Employee, HRCase, Role } from '@/data/types'
import { api, USE_MOCK_API } from '@/lib/api'
import { formatBytes } from '@/lib/files'
import { TODAY } from '@/lib/utils'
import {
  APPROVAL_STEPS,
  CASE_STAGES,
  maskFor,
  mockDetail,
  nowIso,
  toItem,
  type AccessEntry,
  type ApprovalStep,
  type CaseDetailData,
  type CaseEvidence,
  type CaseItem,
} from './helpers'
import { uploadTo } from './upload'

export interface NewCase {
  type: HRCase['type']
  subjectId: string
  reportedBy: string
  severity: HRCase['severity']
  summary: string
  confidential: boolean
}

const HR_ROLES: Role[] = ['super_admin', 'company_admin', 'hr_officer']
let seq = 0

/**
 * Case list + open case detail. Real mode reads and writes the API (subject names arrive masked
 * for confidential cases until this viewer reveals them); mock mode keeps an in-browser store.
 */
export function useCases(opts: { seed: HRCase[]; employee: (id?: string) => Employee | undefined; employees: Employee[]; me: Employee; role: Role }) {
  const { seed, employee, employees, me, role } = opts
  const hrHead = employees.find((e) => e.role === 'company_admin')
  const ceo = employees.find((e) => e.role === 'ceo')
  const isHr = HR_ROLES.includes(role)

  // Mock store (unmasked) + per-viewer reveals + access log.
  const store = useRef<Map<string, CaseDetailData>>(new Map())
  const revealed = useRef<Set<string>>(new Set())
  const logs = useRef<Map<string, AccessEntry[]>>(new Map())
  if (USE_MOCK_API && store.current.size === 0 && seed.length) {
    for (const c of seed) store.current.set(c.id, mockDetail(c, employee, hrHead, ceo))
  }

  const view = useCallback(
    (d: CaseDetailData): CaseDetailData => {
      const m = maskFor(d, revealed.current.has(d.id))
      return {
        ...m,
        notes: isHr ? m.notes : m.notes.filter((n) => n.visibility === 'case_team'),
        approvals: m.approvals.map((a, i) => ({ ...a, canAct: a.status === 'Pending' && APPROVAL_STEPS[i]!.roles.includes(role) })),
        canSeeHrNotes: isHr,
      }
    },
    [isHr, role],
  )

  const [items, setItems] = useState<CaseItem[]>(() => (USE_MOCK_API ? [...store.current.values()].map((d) => toItem(view(d))) : []))
  const [loading, setLoading] = useState(!USE_MOCK_API)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<CaseDetailData | null>(null)

  const loadList = useCallback(async () => {
    if (USE_MOCK_API) {
      setItems([...store.current.values()].map((d) => toItem(view(d))).sort((a, b) => (a.opened < b.opened ? 1 : -1)))
      return
    }
    try {
      setItems(await api.get<CaseItem[]>('/lifecycle/cases'))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cases')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const apply = useCallback((d: CaseDetailData) => {
    setDetail(d)
    setItems((prev) => (prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? toItem(d) : x)) : [toItem(d), ...prev]))
  }, [])

  const log = (id: string, action: string, reason: string | null = null) => {
    logs.current.set(id, [{ action, reason, at: nowIso(), by: me.name }, ...(logs.current.get(id) ?? [])])
  }

  /** Mock: mutate the unmasked record, then publish the viewer's view of it. */
  const mutate = (id: string, fn: (d: CaseDetailData) => CaseDetailData) => {
    const cur = store.current.get(id)
    if (!cur) return
    const next = fn(cur)
    store.current.set(id, next)
    apply(view(next))
  }

  const event = (d: CaseDetailData, title: string, note: string): CaseDetailData => ({ ...d, timeline: [...d.timeline, { date: TODAY, title, by: me.name, note }] })

  const refresh = useCallback(
    async (id: string) => {
      if (USE_MOCK_API) {
        const d = store.current.get(id)
        if (d) apply(view(d))
        return
      }
      apply(await api.get<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(id)}?silent=1`))
    },
    [apply, view],
  )

  const open = useCallback(
    async (id: string) => {
      setDetail(null)
      if (USE_MOCK_API) {
        log(id, 'viewed')
        const d = store.current.get(id)
        if (d) setDetail(view(d))
        return
      }
      setDetail(await api.get<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(id)}`))
    },
    [view],
  )

  const close = useCallback(() => setDetail(null), [])

  const create = useCallback(
    async (input: NewCase, files: File[]): Promise<CaseItem> => {
      if (USE_MOCK_API) {
        const n = store.current.size
        const id = `case-new-${++seq}`
        const base: HRCase = {
          ...input,
          id,
          ref: `HR-2026-${String(41 + n).padStart(4, '0')}`,
          opened: TODAY,
          status: 'Logged',
          assignedTo: me.id,
          timeline: [{ date: TODAY, title: 'Case logged', by: me.name, note: 'Case created via confidential intake.' }],
          evidence: files.map((f) => ({ name: f.name, size: formatBytes(f.size), uploaded: TODAY })),
        }
        const d = { ...mockDetail(base, employee, hrHead, ceo), notes: [] }
        store.current.set(id, d)
        log(id, 'created')
        const v = view(d)
        apply(v)
        return toItem(v)
      }
      const created = await api.post<{ id: string }>('/cases', input)
      for (const f of files) await uploadTo(`/lifecycle/cases/${encodeURIComponent(created.id)}/files`, f)
      const d = await api.get<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(created.id)}?silent=1`)
      apply(d)
      return toItem(d)
    },
    [apply, view, me, employee, hrHead, ceo],
  )

  const advance = useCallback(
    async (id: string) => {
      if (USE_MOCK_API) {
        mutate(id, (d) => {
          const i = CASE_STAGES.indexOf(d.status)
          const next = CASE_STAGES[i + 1]!
          let approvals = d.approvals
          if ((next === 'Hearing' || next === 'Awaiting Approval') && !approvals.some((a) => a.status === 'Pending')) {
            const k = approvals.findIndex((a) => a.status !== 'Approved')
            approvals = approvals.map((a, j) => (j === k ? { ...a, status: 'Pending' } : a))
          }
          return event({ ...d, status: next, approvals }, `Moved to ${next}`, '')
        })
        return
      }
      await api.post(`/cases/${encodeURIComponent(id)}/advance`, {})
      await refresh(id)
    },
    [refresh],
  )

  const addEvent = useCallback(
    async (id: string, title: string, note: string) => {
      if (USE_MOCK_API) return mutate(id, (d) => event(d, title, note))
      await api.post(`/cases/${encodeURIComponent(id)}/events`, { title, note })
      await refresh(id)
    },
    [refresh],
  )

  const addNote = useCallback(
    async (id: string, body: string, visibility: 'hr_only' | 'case_team') => {
      if (USE_MOCK_API)
        return mutate(id, (d) => ({ ...d, notes: [...d.notes, { id: `note-${++seq}`, body, visibility, author: me.name, authorId: me.id, createdAt: nowIso() }] }))
      apply(await api.post<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(id)}/notes`, { body, visibility }))
    },
    [apply, me],
  )

  const deleteNote = useCallback(
    async (id: string, noteId: string) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, notes: d.notes.filter((n) => n.id !== noteId) }))
      apply(await api.delete<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`))
    },
    [apply],
  )

  const uploadEvidence = useCallback(async (id: string, file: File, onProgress: (pct: number) => void): Promise<CaseEvidence> => {
    if (USE_MOCK_API) {
      onProgress(100)
      return { id: null, name: file.name, size: formatBytes(file.size), uploaded: TODAY, downloadable: false, uploadedBy: me.name }
    }
    return uploadTo<CaseEvidence>(`/lifecycle/cases/${encodeURIComponent(id)}/files`, file, {}, onProgress)
  }, [me])

  const evidenceAdded = useCallback(
    async (id: string, files: CaseEvidence[]) => {
      if (USE_MOCK_API) {
        files.forEach(() => log(id, 'uploaded_evidence'))
        return mutate(id, (d) => ({ ...d, evidence: [...d.evidence, ...files], evidenceCount: d.evidence.length + files.length }))
      }
      await refresh(id)
    },
    [refresh],
  )

  const reveal = useCallback(
    async (id: string, reason: string) => {
      if (USE_MOCK_API) {
        revealed.current.add(id)
        log(id, 'revealed_identity', reason)
        return mutate(id, (d) => d)
      }
      await api.post(`/cases/${encodeURIComponent(id)}/access`, { reason })
      await refresh(id)
    },
    [refresh],
  )

  const decide = useCallback(
    async (id: string, step: ApprovalStep, approve: boolean, comment?: string) => {
      if (USE_MOCK_API) {
        return mutate(id, (d) => {
          const idx = APPROVAL_STEPS.findIndex((s) => s.step === step)
          const label = APPROVAL_STEPS[idx]!.stage
          let approvals = d.approvals.map((a, i) => (i === idx ? { ...a, status: approve ? ('Approved' as const) : ('Rejected' as const), approver: me.name, decidedAt: nowIso(), comment: comment ?? null } : a))
          let next: CaseDetailData = { ...d }
          if (approve) {
            approvals = approvals.map((a, i) => (i === idx + 1 && a.status !== 'Approved' ? { ...a, status: 'Pending' as const } : a))
            next = event({ ...next, approvals }, `${label} approved`, comment || 'Recommendation endorsed.')
            if (idx === APPROVAL_STEPS.length - 1) next = event({ ...next, status: 'Closed' }, 'Case closed', 'All sign-offs complete. Outcome communicated in writing.')
            else if (d.status === 'Investigating' || d.status === 'Hearing') next = { ...next, status: 'Awaiting Approval' }
          } else {
            approvals = approvals.map((a, i) => (i > idx && a.status !== 'Approved' ? { ...a, status: 'Waiting' as const } : a))
            next = event({ ...next, approvals, status: 'Investigating' }, `${label} rejected`, comment || 'Returned to investigation for further evidence.')
          }
          return next
        })
      }
      apply(await api.post<CaseDetailData>(`/lifecycle/cases/${encodeURIComponent(id)}/approvals/${step}/${approve ? 'approve' : 'reject'}`, comment ? { comment } : {}))
    },
    [apply, me],
  )

  const accessLog = useCallback(async (id: string): Promise<AccessEntry[]> => {
    if (USE_MOCK_API) return logs.current.get(id) ?? []
    return api.get<AccessEntry[]>(`/cases/${encodeURIComponent(id)}/access-log`)
  }, [])

  return { items, loading, error, detail, open, close, refresh, create, advance, addEvent, addNote, deleteNote, uploadEvidence, evidenceAdded, reveal, decide, accessLog, reload: loadList }
}

export type CasesApi = ReturnType<typeof useCases>
