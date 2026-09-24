/** Company profile API: details, brand colours, offices, logo and custom domain. */
import { api, ApiError } from '@/lib/api'
import type { Workspace } from '@/data/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg'

export type WorkspaceSettings = Workspace & { customDomainTarget: string }

export interface DomainCheck {
  verified: boolean
  domain: string
  target: string
  found: string[]
}

export type WorkspacePatch = Partial<Pick<Workspace, 'name' | 'industry' | 'country' | 'size' | 'brandPrimary' | 'brandSecondary'>> & { customDomain?: string | null }

export const getWorkspaceSettings = () => api.get<WorkspaceSettings>('/workspaces/current/settings')
export const updateWorkspace = (patch: WorkspacePatch) => api.patch<WorkspaceSettings>('/workspaces/current', patch)
export const replaceOffices = (offices: Workspace['offices']) => api.put<WorkspaceSettings>('/workspaces/current/offices', { offices })
export const removeLogo = () => api.delete<WorkspaceSettings>('/workspaces/current/logo')
export const verifyDomain = () => api.post<DomainCheck>('/workspaces/current/domain/verify')

/** Uploads the company logo as multipart form data, reporting progress 0–100. */
export function uploadLogo(file: File, onProgress?: (pct: number) => void): Promise<WorkspaceSettings> {
  if (file.size > MAX_LOGO_BYTES) return Promise.reject(new ApiError(413, 'Logo is larger than 2 MB'))
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/workspaces/current/logo`)
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
        resolve(data as WorkspaceSettings)
      } else {
        reject(new ApiError(xhr.status, (data as { error?: string }).error ?? `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the Annex HR server. Check your connection and try again.'))
    xhr.send(form)
  })
}
