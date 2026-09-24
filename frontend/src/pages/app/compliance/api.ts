/** Compliance documents, policies & acknowledgements and audit packs — API calls and small hooks. */
import { useCallback, useEffect, useState } from 'react'
import type { ComplianceDoc, Policy } from '@/data/types'
import { api, ApiError, USE_MOCK_API } from '@/lib/api'
import type { FileCategory } from '@/lib/files'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export interface ComplianceItem extends ComplianceDoc {
  fileId?: string | null
  fileName?: string | null
  fileType?: string | null
  fileSize?: number | null
  requestedAt?: string | null
  requestedBy?: string | null
  remindedAt?: string | null
}

/** Which employee-file category a compliance document is stored under. */
export const FILE_CATEGORY_FOR: Record<ComplianceDoc['type'], FileCategory> = {
  Passport: 'Passport',
  'Work Visa': 'Other',
  'Driving Licence': 'Other',
  Contract: 'Contract',
  'Academic Certificate': 'Certificate',
  'Certificate of Good Conduct': 'Certificate',
  'Professional License': 'Certificate',
}

export function useComplianceDocs(seed: ComplianceDoc[]) {
  const [docs, setDocs] = useState<ComplianceItem[]>(seed)
  const reload = useCallback(async () => {
    if (USE_MOCK_API) return
    setDocs(await api.get<ComplianceItem[]>('/compliance-documents'))
  }, [])
  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])
  const upsert = useCallback((d: ComplianceItem) => setDocs((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [d, ...list])), [])
  return { docs, upsert, reload }
}

export interface NewComplianceDoc {
  employeeId: string
  type: ComplianceDoc['type']
  number?: string
  issued?: string
  expires?: string
  fileId?: string
}

export const complianceApi = {
  create: (d: NewComplianceDoc) => api.post<ComplianceItem>('/compliance-documents', d),
  requestNew: (employeeId: string, type: ComplianceDoc['type'], note?: string, email = true) =>
    api.post<ComplianceItem>('/compliance-documents/requests', { employeeId, type, note: note || undefined, email }),
  request: (id: string, note?: string, email = true) => api.post<ComplianceItem>(`/compliance-documents/${id}/request`, { note: note || undefined, email }),
  remind: (id: string, renewal: boolean, email = true) => api.post<ComplianceItem>(`/compliance-documents/${id}/remind`, { renewal, email }),
  remindMany: (ids: string[], renewal = false) => api.post<{ reminded: number }>('/compliance-documents/remind', { ids, renewal, email: true }),
}

// ── Policies ────────────────────────────────────────────────────────
export interface PolicyItem extends Policy {
  myAcknowledgement?: { policy_id: string; version: string; acknowledged_at: string } | null
}

export interface PolicyAcks {
  policyId: string
  version: string
  headcount: number
  signedCurrent: number
  acknowledgements: {
    employeeId: string
    name: string
    employeeNo: string
    departmentId?: string | null
    version: string
    signature: string
    ip?: string | null
    acknowledgedAt: string
    current: boolean
  }[]
  pending: { employeeId: string; name: string; employeeNo: string; departmentId?: string | null }[]
}

export function usePolicies(seed: Policy[]) {
  const [policies, setPolicies] = useState<PolicyItem[]>(seed)
  const reload = useCallback(async () => {
    if (USE_MOCK_API) return
    setPolicies(await api.get<PolicyItem[]>('/policies'))
  }, [])
  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])
  return { policies, setPolicies, reload }
}

export const policyApi = {
  acknowledge: (id: string, signature: string) => api.post<{ policyId: string; version: string; acknowledgedAt: string }>(`/policies/${id}/acknowledge`, { signature }),
  publishVersion: (id: string, version: string, note: string, summary?: string) => api.post<{ ok: true }>(`/policies/${id}/versions`, { version, note, summary: summary || undefined }),
  acknowledgements: (id: string) => api.get<PolicyAcks>(`/policies/${id}/acknowledgements`),
  remind: (id: string) => api.post<{ reminded: number }>(`/policies/${id}/remind`),
}

/** Suggests the next minor version, e.g. v3.2 → v3.3. */
export function nextVersion(v: string) {
  const m = /^v(\d+)\.(\d+)$/.exec(v)
  return m ? `v${m[1]}.${Number(m[2]) + 1}` : 'v1.1'
}

// ── Audit-ready files ───────────────────────────────────────────────
export interface AuditItem {
  key: string
  label: string
  status: 'ok' | 'issue' | 'missing'
  note: string
  type?: ComplianceDoc['type']
}

export interface AuditStatus {
  employeeId: string
  name: string
  items: AuditItem[]
  ready: number
  total: number
  completeness: number
  files: number
  complianceDocuments: number
  lastPackAt?: string | null
}

export const auditApi = {
  status: (employeeId: string) => api.get<AuditStatus>(`/employees/${encodeURIComponent(employeeId)}/audit-status`),
  /** Downloads the ZIP with the session cookie and saves it under the server's filename. */
  async downloadPack(employeeId: string) {
    const res = await fetch(`${BASE}/employees/${encodeURIComponent(employeeId)}/audit-pack`, { credentials: 'include' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new ApiError(res.status, body.error ?? `Download failed (${res.status})`)
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'audit-pack.zip'
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return name
  },
}
