import { useEffect, useState } from 'react'
import { findWorkspaceBySlug } from '@/data/seed'
import { api, USE_MOCK_API } from '@/lib/api'

export interface WorkspaceLookup {
  slug: string
  name: string
  domain: string
  logoText: string
  industry: string
  country: string
}

/** Resolves <slug>.annexhr.com to a workspace as the user types (debounced). */
export function useWorkspaceLookup(slug: string) {
  const [ws, setWs] = useState<WorkspaceLookup | undefined>()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const s = slug.toLowerCase().trim()
    if (!s) {
      setWs(undefined)
      setChecking(false)
      return
    }
    if (USE_MOCK_API) {
      setWs(findWorkspaceBySlug(s))
      return
    }
    setChecking(true)
    let cancelled = false
    const t = setTimeout(() => {
      api
        .get<WorkspaceLookup>(`/workspaces/lookup/${encodeURIComponent(s)}`)
        .then((w) => !cancelled && setWs(w))
        .catch(() => !cancelled && setWs(undefined))
        .finally(() => !cancelled && setChecking(false))
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [slug])

  return { ws, checking }
}
