import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import type { Role } from '@/data/types'
import { TODAY } from '@/lib/utils'
import type { PendingInvite } from './helpers'

interface ApiInvite {
  id: string
  email: string
  role: Role
  departmentId: string | null
  status: 'Pending' | 'Accepted' | 'Revoked' | 'Expired'
  createdAt: string
  expiresAt: string
}

const toPending = (i: ApiInvite): PendingInvite => ({ id: i.id, email: i.email, role: i.role, departmentId: i.departmentId ?? '', sent: i.createdAt.slice(0, 10) })

export type InviteRequest = { email: string; departmentId: string; role: Role }

/**
 * Pending invitations for the workspace, backed by the API (or local state in mock mode).
 * `send` resolves to a short summary for the toast, or throws with the API's message.
 */
export function useInvites() {
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(!USE_MOCK_API)

  const reload = useCallback(async () => {
    if (USE_MOCK_API) return
    try {
      const rows = await api.get<ApiInvite[]>('/invitations')
      setInvites(rows.filter((r) => r.status === 'Pending').map(toPending))
    } catch {
      /* non-admins can't list invites — nothing to show */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const send = useCallback(async (list: InviteRequest[]) => {
    if (USE_MOCK_API) {
      const local = list.map((i, n) => ({ ...i, id: `inv-${Date.now()}-${n}`, sent: TODAY }))
      setInvites((p) => [...local, ...p])
      return { sent: local.length, emailed: local.length, skipped: [] as string[] }
    }
    const res = await api.post<{ sent: number; emailed: number; skipped: string[]; invitations: ApiInvite[] }>('/invitations', {
      invites: list.map((i) => ({ email: i.email, role: i.role, departmentId: i.departmentId || undefined })),
    })
    const fresh = res.invitations.map(toPending)
    setInvites((p) => [...fresh, ...p.filter((x) => !fresh.some((f) => f.email === x.email))])
    return { sent: res.sent, emailed: res.emailed, skipped: res.skipped }
  }, [])

  const resend = useCallback(async (id: string) => {
    if (USE_MOCK_API) {
      setInvites((p) => p.map((x) => (x.id === id ? { ...x, sent: TODAY } : x)))
      return
    }
    const row = await api.post<ApiInvite>(`/invitations/${id}/resend`)
    setInvites((p) => p.map((x) => (x.id === id ? toPending(row) : x)))
  }, [])

  const revoke = useCallback(async (id: string) => {
    if (!USE_MOCK_API) await api.post(`/invitations/${id}/revoke`)
    setInvites((p) => p.filter((x) => x.id !== id))
  }, [])

  return { invites, loading, send, resend, revoke, reload, errorMessage }
}
