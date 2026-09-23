import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Notification } from '@/data/types'
import { api, USE_MOCK_API } from '@/lib/api'
import { useAuth } from './auth'

interface Ctx {
  items: Notification[]
  unread: number
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext = createContext<Ctx | null>(null)

/** Simulated real-time events that arrive shortly after sign-in. */
const liveEvents: Omit<Notification, 'id' | 'time' | 'read'>[] = [
  { type: 'approval', title: 'New leave request needs approval', body: 'Sick leave · 2 days · starts tomorrow', href: '/app/leave' },
  { type: 'document', title: 'Driving licence uploaded', body: 'Compliance record updated automatically.', href: '/app/compliance' },
]

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAuth()
  const [items, setItems] = useState<Notification[]>(data?.notifications ?? [])

  useEffect(() => {
    setItems(data?.notifications ?? [])
    // Simulated real-time events are a demo-only feature; real notifications come from the API.
    if (!data || !USE_MOCK_API) return
    const timers = liveEvents.map((ev, i) =>
      setTimeout(
        () => {
          const n: Notification = { ...ev, id: `live-${Date.now()}-${i}`, time: 'Just now', read: false }
          setItems((prev) => [n, ...prev])
          toast(n.title, { description: n.body })
        },
        14000 + i * 26000,
      ),
    )
    return () => timers.forEach(clearTimeout)
  }, [data])

  const markRead = useCallback((id: string) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)))
    if (!USE_MOCK_API && !id.startsWith('live-')) api.post(`/notifications/${encodeURIComponent(id)}/read`).catch(() => undefined)
  }, [])
  const markAllRead = useCallback(() => {
    setItems((p) => p.map((n) => ({ ...n, read: true })))
    if (!USE_MOCK_API) api.post('/notifications/read-all').catch(() => undefined)
  }, [])

  const value = useMemo(() => ({ items, unread: items.filter((n) => !n.read).length, markRead, markAllRead }), [items, markRead, markAllRead])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider')
  return ctx
}
