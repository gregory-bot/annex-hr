/** Multipart upload with progress for case evidence and offboarding documents (session cookie sent). */
import { ApiError } from '@/lib/api'
import { MAX_FILE_BYTES } from '@/lib/files'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export function apiUrl(path: string) {
  return `${BASE}${path}`
}

export function uploadTo<T>(path: string, file: File, fields: Record<string, string> = {}, onProgress?: (pct: number) => void): Promise<T> {
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new ApiError(413, 'File is larger than 10 MB'))
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
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

/** Starts a browser download of an authenticated file endpoint. */
export function downloadFrom(path: string) {
  const a = document.createElement('a')
  a.href = apiUrl(path)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export const FILE_ACCEPT_DOCS = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx'
