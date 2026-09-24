/** Company document library: list, upload (with progress), versions, restore, delete and download links. */
import { useCallback, useEffect, useState } from 'react'
import type { DocFile } from '@/data/types'
import { api, ApiError, USE_MOCK_API } from '@/lib/api'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export const DOC_FOLDERS = ['Policies', 'Templates', 'Contracts', 'NDAs', 'Offer Letters', 'Certificates', 'Payslips'] as const
export const DOC_ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg'
const MAX_BYTES = 10 * 1024 * 1024

export interface DocItem extends Omit<DocFile, 'versions'> {
  employeeId?: string | null
  fileId?: string | null
  contentType?: string | null
  versions: { version: string; date: string; by: string; note?: string | null; hasFile?: boolean }[]
  /** Set for the employee's own uploads (served by the employee files API). */
  employeeFileId?: string
}

export function useDocuments(seed: DocFile[]) {
  const [docs, setDocs] = useState<DocItem[]>(seed)
  const [loading, setLoading] = useState(!USE_MOCK_API)
  const reload = useCallback(async () => {
    if (USE_MOCK_API) return
    try {
      setDocs(await api.get<DocItem[]>('/documents'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload])
  const upsert = useCallback((d: DocItem) => setDocs((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [d, ...list])), [])
  const drop = useCallback((id: string) => setDocs((list) => list.filter((x) => x.id !== id)), [])
  return { docs, setDocs, upsert, drop, loading, reload }
}

function sendForm<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    xhr.onload = () => {
      let data: unknown = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve(data as T)
      } else {
        const body = data as { error?: string; details?: unknown }
        reject(new ApiError(xhr.status, body.error ?? `Upload failed (${xhr.status})`, body.details))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the Annex HR server. Check your connection and try again.'))
    xhr.send(form)
  })
}

export const documentApi = {
  upload(file: File, folder: string, onProgress?: (pct: number) => void) {
    if (file.size > MAX_BYTES) return Promise.reject(new ApiError(413, 'File is larger than 10 MB'))
    const form = new FormData()
    form.append('file', file)
    form.append('folder', folder)
    return sendForm<DocItem>('/documents/upload', form, onProgress)
  },
  uploadVersion(id: string, file: File, note?: string, onProgress?: (pct: number) => void) {
    if (file.size > MAX_BYTES) return Promise.reject(new ApiError(413, 'File is larger than 10 MB'))
    const form = new FormData()
    form.append('file', file)
    if (note) form.append('note', note)
    return sendForm<DocItem>(`/documents/${encodeURIComponent(id)}/versions`, form, onProgress)
  },
  restore: (id: string, version: string) => api.post<DocItem>(`/documents/${encodeURIComponent(id)}/restore`, { version }),
  remove: (id: string) => api.delete<void>(`/documents/${encodeURIComponent(id)}`),
}

export function documentDownloadUrl(id: string, opts: { inline?: boolean; version?: string } = {}) {
  const q = new URLSearchParams()
  if (opts.inline) q.set('inline', '1')
  if (opts.version) q.set('version', opts.version)
  const s = q.toString()
  return `${BASE}/documents/${encodeURIComponent(id)}/download${s ? `?${s}` : ''}`
}

/** PDFs and images render inline in the preview. */
export const previewable = (contentType?: string | null) => !!contentType && (contentType === 'application/pdf' || contentType.startsWith('image/'))
