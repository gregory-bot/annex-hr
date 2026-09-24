/** Employee file uploads (stored by the API) — upload with progress, list, download and delete. */
import { api, ApiError } from '@/lib/api'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export const FILE_CATEGORIES = ['National ID', 'KRA PIN', 'SHIF', 'NSSF', 'Passport', 'NDA', 'Contract', 'Certificate', 'Handover', 'Other'] as const
export type FileCategory = (typeof FILE_CATEGORIES)[number]

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx'

export interface EmployeeFile {
  id: string
  employeeId: string
  category: FileCategory
  taskId?: string | null
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
  uploadedBy?: string | null
  uploadedByName?: string | null
  createdAt: string
}

export function formatBytes(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1000))} KB`
}

/** Uploads one file as multipart form data; reports progress 0–100. The session cookie is sent with it. */
export function uploadFile(
  file: File,
  meta: { category: FileCategory; employeeId?: string; taskId?: string },
  onProgress?: (pct: number) => void,
): Promise<EmployeeFile> {
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new ApiError(413, 'File is larger than 10 MB'))
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('category', meta.category)
    if (meta.employeeId) form.append('employeeId', meta.employeeId)
    if (meta.taskId) form.append('taskId', meta.taskId)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/files`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      let data: unknown = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve(data as EmployeeFile)
      } else {
        const body = data as { error?: string; details?: unknown }
        reject(new ApiError(xhr.status, body.error ?? `Upload failed (${xhr.status})`, body.details))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the Annex HR server. Check your connection and try again.'))
    xhr.send(form)
  })
}

export const listEmployeeFiles = (employeeId: string) => api.get<EmployeeFile[]>(`/employees/${encodeURIComponent(employeeId)}/files`)

export const deleteFile = (id: string) => api.delete<void>(`/files/${encodeURIComponent(id)}`)

/** Direct link to a file; `inline` opens PDFs and images in the browser instead of downloading. */
export function fileDownloadUrl(id: string, inline = false) {
  return `${BASE}/files/${encodeURIComponent(id)}/download${inline ? '?inline=1' : ''}`
}
