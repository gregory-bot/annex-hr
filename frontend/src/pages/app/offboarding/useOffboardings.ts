import { useCallback, useEffect, useRef, useState } from 'react'
import type { Employee, Offboarding, Role } from '@/data/types'
import { api, USE_MOCK_API } from '@/lib/api'
import { TODAY } from '@/lib/utils'
import { downloadFrom, uploadTo } from '../cases/upload'
import {
  CHECKLIST,
  WORKFLOW,
  computeProgress,
  computeSettlement,
  mockExit,
  type AssetRow,
  type ExitDetail,
  type ExitFile,
  type ExitItem,
  type SettlementApproval,
  type SettlementInputs,
  type SettlementView,
} from './helpers'

export interface NewExit {
  employeeId: string
  reason: Offboarding['reason']
  submitted: string
  lastDay: string
}

const ADMIN: Role[] = ['super_admin', 'company_admin', 'hr_officer']
const SETTLE_ROLES: Record<SettlementApproval['stage'], Role[]> = {
  Finance: ['finance', 'company_admin', 'super_admin'],
  HR: ['company_admin', 'hr_officer', 'super_admin'],
  CEO: ['ceo', 'super_admin'],
}
let seq = 0
const nowIso = () => `${TODAY}T${new Date().toISOString().slice(11)}`
const enc = encodeURIComponent

function strip(d: ExitDetail): ExitItem {
  const { settlement, interview, ...item } = d
  void settlement
  void interview
  return item
}

/**
 * Exit records with their checklist, assets, handover, files and settlement.
 * Real mode persists every change through /lifecycle/offboardings; mock mode computes locally.
 */
export function useOffboardings(opts: { seed: Offboarding[]; employee: (id?: string) => Employee | undefined; me: Employee; role: Role; prefix: string }) {
  const { seed, employee, me, role, prefix } = opts
  const isAdmin = ADMIN.includes(role)
  const store = useRef<Map<string, ExitDetail>>(new Map())
  const settlementInputs = useRef<Map<string, SettlementInputs>>(new Map())

  /** Mock: recompute everything the server would. */
  const finish = useCallback(
    (d: ExitDetail): ExitDetail => {
      const salary = employee(d.employeeId)?.salaryKES ?? 0
      let settlement: SettlementView | null = null
      const prev = d.settlement
      if (role === 'finance' || isAdmin || role === 'ceo') {
        const approvals: SettlementApproval[] = (prev?.approvals ?? (['Finance', 'HR', 'CEO'] as const).map((stage) => ({ stage, status: 'Waiting' as const, by: null, at: '', canAct: false }))).map(
          (a, i, all) => {
            const status = a.at ? 'Approved' : i === 0 || all[i - 1]!.at ? 'Pending' : 'Waiting'
            return { ...a, status, canAct: status === 'Pending' && SETTLE_ROLES[a.stage].includes(role) }
          },
        )
        const locked = !!approvals[0]!.at
        const calc = locked && prev ? { ...prev } : computeSettlement(d, salary, settlementInputs.current.get(d.id) ?? null)
        settlement = { ...calc, saved: settlementInputs.current.has(d.id) || locked, locked, approvals, updatedAt: prev?.updatedAt ?? null }
      }
      const next: ExitDetail = { ...d, settlement, handover: d.checklist.find((c) => c.key === 'mgr-handover')?.done ?? d.handover }
      const { progress, stage } = computeProgress(next)
      const settled = settlement?.approvals.every((a) => a.status === 'Approved')
      return {
        ...next,
        progress,
        stage,
        stageLabel: WORKFLOW[stage]!,
        settlementStatus: settlement ? (settled ? 'Approved' : settlement.locked ? 'In approval' : settlement.saved ? 'Draft' : 'Not started') : null,
        finalDuesKES: settlement ? Math.max(0, settlement.net) : null,
        canAcknowledge: !next.managerAck && (isAdmin || employee(next.employeeId)?.managerId === me.id),
        canApprove: !!next.managerAck && !next.hrApproval && isAdmin,
        interview: isAdmin ? next.interview : null,
      }
    },
    [employee, role, isAdmin, me],
  )

  if (USE_MOCK_API && store.current.size === 0 && seed.length) {
    const hr = me.name
    for (const o of seed) store.current.set(o.id, mockExit(o, employee(o.employeeId), prefix, hr))
  }

  const [items, setItems] = useState<ExitItem[]>(() => (USE_MOCK_API ? [...store.current.values()].map((d) => strip(finish(d))) : []))
  const [loading, setLoading] = useState(!USE_MOCK_API)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExitDetail | null>(null)

  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    api
      .get<ExitItem[]>('/lifecycle/offboardings')
      .then((rows) => !cancelled && (setItems(rows), setError(null)))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load offboarding'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const apply = useCallback((d: ExitDetail) => {
    setDetail(d)
    setItems((prev) => (prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? strip(d) : x)) : [strip(d), ...prev]))
  }, [])

  const mutate = (id: string, fn: (d: ExitDetail) => ExitDetail) => {
    const cur = store.current.get(id)
    if (!cur) return
    const next = finish(fn(cur))
    store.current.set(id, next)
    apply(next)
  }

  const fetchDetail = useCallback(async (id: string) => apply(await api.get<ExitDetail>(`/lifecycle/offboardings/${enc(id)}`)), [apply])

  const open = useCallback(
    async (id: string) => {
      setDetail(null)
      if (USE_MOCK_API) {
        const d = store.current.get(id)
        if (d) setDetail(finish(d))
        return
      }
      await fetchDetail(id)
    },
    [finish, fetchDetail],
  )

  const close = useCallback(() => setDetail(null), [])

  const create = useCallback(
    async (input: NewExit, letter?: File): Promise<ExitItem> => {
      if (USE_MOCK_API) {
        const emp = employee(input.employeeId)
        const notice = Math.round((new Date(input.lastDay).getTime() - new Date(input.submitted).getTime()) / 86_400_000)
        const o: Offboarding = {
          ...input,
          id: `off-new-${++seq}`,
          noticeDays: notice,
          progress: 0,
          handover: false,
          exitInterview: false,
          finalDuesKES: emp?.salaryKES ?? 0,
          assets: ['Laptop', 'Access card', 'SIM card', 'Email account', 'GitHub access', 'Slack access'].map((name) => ({ name, returned: false })),
        }
        const d = { ...mockExit(o, emp, prefix, me.name), managerAck: null, hrApproval: null }
        if (letter) d.files = [{ id: `f-${++seq}`, kind: 'resignation_letter', filename: letter.name, contentType: letter.type, sizeBytes: letter.size, uploadedBy: me.name, createdAt: nowIso() }]
        const fin = finish(d)
        store.current.set(o.id, fin)
        apply(fin)
        return strip(fin)
      }
      const created = await api.post<{ id: string }>('/offboardings', input)
      if (letter) await uploadTo(`/lifecycle/offboardings/${enc(created.id)}/files`, letter, { kind: 'resignation_letter' })
      const d = await api.get<ExitDetail>(`/lifecycle/offboardings/${enc(created.id)}`)
      apply(d)
      return strip(d)
    },
    [apply, finish, employee, prefix, me],
  )

  const acknowledge = useCallback(
    async (id: string) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, managerAck: { by: me.name, at: nowIso() } }))
      apply(await api.post<ExitDetail>(`/lifecycle/offboardings/${enc(id)}/acknowledge`, {}))
    },
    [apply, me],
  )

  const approve = useCallback(
    async (id: string) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, hrApproval: { by: me.name, at: nowIso() } }))
      apply(await api.post<ExitDetail>(`/lifecycle/offboardings/${enc(id)}/approve`, {}))
    },
    [apply, me],
  )

  const toggleItem = useCallback(
    async (id: string, itemId: string, done: boolean) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, checklist: d.checklist.map((c) => (c.id === itemId ? { ...c, done, doneBy: done ? me.name : null, doneAt: done ? nowIso() : '' } : c)) }))
      apply(await api.patch<ExitDetail>(`/lifecycle/offboardings/${enc(id)}/checklist/${enc(itemId)}`, { done }))
    },
    [apply, me],
  )

  const patchAsset = useCallback(
    async (id: string, assetId: string, patch: Partial<Pick<AssetRow, 'returned' | 'condition' | 'serial'>>) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, assets: d.assets.map((a) => (a.id === assetId ? { ...a, ...patch } : a)) }))
      apply(await api.patch<ExitDetail>(`/lifecycle/offboardings/${enc(id)}/assets/${enc(assetId)}`, patch))
    },
    [apply],
  )

  const saveHandover = useCallback(
    async (id: string, patch: { handoverNotes?: string; successorId?: string; signOff?: boolean }) => {
      if (USE_MOCK_API)
        return mutate(id, (d) => ({
          ...d,
          handoverNotes: patch.handoverNotes ?? d.handoverNotes,
          successorId: patch.successorId ?? d.successorId,
          successorName: patch.successorId ? (employee(patch.successorId)?.name ?? null) : d.successorName,
          checklist: patch.signOff === undefined ? d.checklist : d.checklist.map((c) => (c.key === 'mgr-handover' ? { ...c, done: patch.signOff!, doneBy: me.name } : c)),
        }))
      apply(await api.patch<ExitDetail>(`/lifecycle/offboardings/${enc(id)}/handover`, patch))
    },
    [apply, employee, me],
  )

  const uploadFile = useCallback(
    async (id: string, kind: ExitFile['kind'], file: File, onProgress: (pct: number) => void): Promise<ExitFile> => {
      if (USE_MOCK_API) {
        onProgress(100)
        return { id: `f-${++seq}`, kind, filename: file.name, contentType: file.type, sizeBytes: file.size, uploadedBy: me.name, createdAt: nowIso() }
      }
      return uploadTo<ExitFile>(`/lifecycle/offboardings/${enc(id)}/files`, file, { kind }, onProgress)
    },
    [me],
  )

  const filesAdded = useCallback(
    async (id: string, files: ExitFile[]) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, files: [...d.files, ...files] }))
      await fetchDetail(id)
    },
    [fetchDetail],
  )

  const deleteFile = useCallback(
    async (id: string, fileId: string) => {
      if (USE_MOCK_API) return mutate(id, (d) => ({ ...d, files: d.files.filter((f) => f.id !== fileId) }))
      await api.delete(`/lifecycle/offboarding-files/${enc(fileId)}`)
      await fetchDetail(id)
    },
    [fetchDetail],
  )

  const downloadFile = (fileId: string) => downloadFrom(`/lifecycle/offboarding-files/${enc(fileId)}/download`)

  const saveSettlement = useCallback(
    async (id: string, inputs: SettlementInputs) => {
      if (USE_MOCK_API) {
        settlementInputs.current.set(id, inputs)
        return mutate(id, (d) => ({ ...d, checklist: d.checklist.map((c) => (c.key === 'fin-dues' ? { ...c, done: true, doneBy: me.name } : c)) }))
      }
      await api.put(`/lifecycle/offboardings/${enc(id)}/settlement`, inputs)
      await fetchDetail(id)
    },
    [fetchDetail, me],
  )

  const approveSettlement = useCallback(
    async (id: string, stage: SettlementApproval['stage']) => {
      if (USE_MOCK_API) {
        if (stage === 'Finance' && !settlementInputs.current.has(id)) {
          const cur = store.current.get(id)
          if (cur) settlementInputs.current.set(id, finish(cur).settlement!.inputs)
        }
        return mutate(id, (d) => {
          const cur = finish(d).settlement!
          return { ...d, settlement: { ...cur, approvals: cur.approvals.map((a) => (a.stage === stage ? { ...a, at: nowIso(), by: me.name } : a)) } }
        })
      }
      await api.post(`/lifecycle/offboardings/${enc(id)}/settlement/approve`, { stage })
      await fetchDetail(id)
    },
    [fetchDetail, finish, me],
  )

  const certificate = useCallback(
    (id: string) => {
      if (!USE_MOCK_API) return downloadFrom(`/lifecycle/offboardings/${enc(id)}/certificate`)
      const d = store.current.get(id)
      if (!d) return
      const emp = employee(d.employeeId)
      const text = `CERTIFICATE OF SERVICE\n\nThis is to certify that ${d.employeeName} was employed as ${d.employeeTitle} from ${emp?.startDate ?? ''} to ${d.lastDay}.\n\nIssued under Section 51 of the Employment Act, 2007.\n`
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-of-service-${d.employeeName.toLowerCase().replace(/\s+/g, '-')}.txt`
      a.click()
      URL.revokeObjectURL(url)
    },
    [employee],
  )

  return {
    items,
    loading,
    error,
    detail,
    open,
    close,
    create,
    acknowledge,
    approve,
    toggleItem,
    patchAsset,
    saveHandover,
    uploadFile,
    filesAdded,
    deleteFile,
    downloadFile,
    saveSettlement,
    approveSettlement,
    certificate,
    checklistTemplate: CHECKLIST,
  }
}

export type OffboardingApi = ReturnType<typeof useOffboardings>
