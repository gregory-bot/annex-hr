import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { workspaceData, workspaces as mockWorkspaces, type WorkspaceData, type WorkspaceId } from '@/data/seed'
import type { Employee, Role, Workspace } from '@/data/types'
import { api, ApiError, errorMessage, USE_MOCK_API } from '@/lib/api'

/**
 * Multi-tenant session + workspace data.
 *
 * Real mode (default): the session lives in an httpOnly cookie set by the API,
 * and workspace data comes from GET /workspaces/current/bootstrap.
 * Mock mode (VITE_USE_MOCK_API=true): everything runs on the in-browser demo seed.
 */

interface Session {
  workspaceId: string
  userId: string
  role: Role
}

export interface WorkspaceSummary {
  id: string
  slug: string
  name: string
  domain: string
  logoText: string
  logoUrl?: string | null
}

export interface RegisterInput {
  companyName: string
  industry: string
  country: string
  size: string
  email: string
  password: string
  adminName?: string
  slug?: string
}

type Result = { ok: true } | { ok: false; error: string }

/** A pending sign-up waiting for its emailed 6-digit code. */
export interface PendingRegistration {
  verificationId: string
  email: string
  expiresInMinutes: number
}

interface AuthContextValue {
  status: 'loading' | 'ready'
  session: Session | null
  user: Employee | null
  role: Role
  workspace: Workspace | null
  data: WorkspaceData | null
  workspaces: WorkspaceSummary[]
  demoEnabled: boolean
  /** True only for demo sessions in demo workspaces — the only time "View as" is offered. */
  demoSession: boolean
  mock: boolean
  signIn: (slug: string, email: string, password: string) => Promise<Result>
  signInAs: (workspace: string, role: Role) => Promise<Result>
  /** Step 1 of sign-up: validates the details and emails a verification code. */
  startRegistration: (input: RegisterInput) => Promise<({ ok: true } & PendingRegistration) | { ok: false; error: string }>
  /** Step 2: checks the code, creates the workspace and signs the admin in. */
  verifyRegistration: (verificationId: string, code: string) => Promise<Result & { domain?: string }>
  resendRegistrationCode: (verificationId: string) => Promise<Result>
  acceptInvite: (token: string, input: { name: string; password: string; phone?: string; birthday?: string }) => Promise<Result>
  switchWorkspace: (workspaceId: string) => Promise<void>
  switchRole: (role: Role) => Promise<void>
  signOut: () => Promise<void>
  /** Re-fetch workspace data after a change on the server. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Mock-mode helpers ────────────────────────────────────────────────
const MOCK_KEY = 'annex-session'

/** Picks the demo persona that best represents a role inside a workspace (mock mode). */
export function personaFor(workspaceId: WorkspaceId, role: Role): Employee {
  const emps = workspaceData[workspaceId].employees
  const target: Role = role === 'super_admin' ? 'company_admin' : role
  return (
    // The employee persona is a new starter mid-onboarding, which best shows the self-service journey.
    (target === 'employee' ? emps.find((e) => e.role === 'employee' && e.status === 'Onboarding') : undefined) ??
    emps.find((e) => e.role === target) ??
    emps.find((e) => e.role === 'employee')!
  )
}

function loadMock(): Session | null {
  try {
    const raw = localStorage.getItem(MOCK_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    const data = workspaceData[s.workspaceId as WorkspaceId]
    if (!data) return null
    // Recover from stale sessions (e.g. seed data changed): fall back to the role's persona.
    if (!data.employees.some((e) => e.id === s.userId)) return { ...s, userId: personaFor(s.workspaceId as WorkspaceId, s.role).id }
    return s
  } catch {
    return null
  }
}

function saveMock(s: Session | null) {
  try {
    if (s) localStorage.setItem(MOCK_KEY, JSON.stringify(s))
    else localStorage.removeItem(MOCK_KEY)
  } catch {
    /* storage unavailable */
  }
}

const mockSummaries: WorkspaceSummary[] = mockWorkspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name, domain: w.domain, logoText: w.logoText }))

// ── API payloads ─────────────────────────────────────────────────────
interface SessionPayload {
  user: Employee
  role: Role
  workspace: Workspace
  demo: boolean
  demoEnabled: boolean
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready'>(USE_MOCK_API ? 'ready' : 'loading')
  const [session, setSession] = useState<Session | null>(() => (USE_MOCK_API ? loadMock() : null))
  const [remote, setRemote] = useState<WorkspaceData | null>(null)
  const [workspaceList, setWorkspaceList] = useState<WorkspaceSummary[]>(USE_MOCK_API ? mockSummaries : [])
  const [demoEnabled, setDemoEnabled] = useState(USE_MOCK_API)
  const [demoSession, setDemoSession] = useState(USE_MOCK_API)

  // Bumped on every sign-in/out so a slow session restore can't overwrite a newer sign-in.
  const epoch = useRef(0)
  const sessionRef = useRef<Session | null>(session)
  sessionRef.current = session

  /** Adopts a server session and loads its workspace data. */
  const adopt = useCallback(async (payload: SessionPayload) => {
    const [data, list] = await Promise.all([api.get<WorkspaceData>('/workspaces/current/bootstrap'), api.get<WorkspaceSummary[]>('/workspaces').catch(() => [])])
    setRemote(data)
    setWorkspaceList(list)
    setDemoEnabled(payload.demoEnabled)
    setDemoSession(payload.demo)
    setSession({ workspaceId: payload.workspace.id, userId: payload.user.id, role: payload.role })
  }, [])

  // The session is one cookie shared by every tab. When another tab signs in as someone
  // else (or signs out), reload this tab so it never shows one person's view with another's session.
  useEffect(() => {
    if (USE_MOCK_API) return
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('annex-hr-session') : null
    const follow = (userId: string | null) => {
      if ((sessionRef.current?.userId ?? null) === userId) return
      window.location.replace(userId ? '/app' : '/login')
    }
    if (channel) channel.onmessage = (e: MessageEvent<{ userId: string | null }>) => follow(e.data.userId)
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !sessionRef.current) return
      const at = epoch.current
      api
        .get<{ session: SessionPayload | null }>('/auth/session')
        .then(({ session: s }) => at === epoch.current && follow(s?.user.id ?? null))
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      channel?.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const announce = useCallback((userId: string | null) => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('annex-hr-session')
    channel.postMessage({ userId })
    channel.close()
  }, [])

  // Restore an existing cookie session on first load.
  useEffect(() => {
    if (USE_MOCK_API) return
    let cancelled = false
    api
      .get<{ demoEnabled: boolean }>('/auth/config')
      .then((c) => !cancelled && setDemoEnabled(c.demoEnabled))
      .catch(() => undefined)
    const at = epoch.current
    api
      .get<{ session: SessionPayload | null }>('/auth/session')
      .then(({ session }) => (cancelled || at !== epoch.current || !session ? undefined : adopt(session)))
      .catch(() => undefined)
      .finally(() => !cancelled && setStatus('ready'))
    return () => {
      cancelled = true
    }
  }, [adopt])

  const run = useCallback(
    async (fn: () => Promise<SessionPayload>): Promise<Result> => {
      const at = ++epoch.current
      try {
        const payload = await fn()
        if (at !== epoch.current) return { ok: false, error: 'Superseded by a newer sign-in' }
        await adopt(payload)
        announce(payload.user.id)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: errorMessage(err) }
      }
    },
    [adopt, announce],
  )

  const setMock = useCallback((s: Session | null) => {
    saveMock(s)
    setSession(s)
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (slug, email, password) => {
      if (USE_MOCK_API) {
        const ws = mockWorkspaces.find((w) => w.slug === slug.toLowerCase().trim())
        if (!ws) return { ok: false, error: `No workspace found at ${slug}.annexhr.com` }
        const wsId = ws.id as WorkspaceId
        const match = workspaceData[wsId].employees.find((e) => e.email.toLowerCase() === email.toLowerCase().trim())
        const persona = match ?? personaFor(wsId, 'company_admin')
        setMock({ workspaceId: wsId, userId: persona.id, role: persona.role })
        return { ok: true }
      }
      return run(() => api.post<SessionPayload>('/auth/login', { workspace: slug, email, password }))
    },
    [run, setMock],
  )

  const signInAs = useCallback<AuthContextValue['signInAs']>(
    async (workspace, role) => {
      if (USE_MOCK_API) {
        const ws = mockWorkspaces.find((w) => w.id === workspace || w.slug === workspace)
        if (!ws) return { ok: false, error: 'Workspace not found' }
        setMock({ workspaceId: ws.id, role, userId: personaFor(ws.id as WorkspaceId, role).id })
        return { ok: true }
      }
      return run(() => api.post<SessionPayload>('/auth/demo', { workspace, role }))
    },
    [run, setMock],
  )

  const startRegistration = useCallback<AuthContextValue['startRegistration']>(async (input) => {
    if (USE_MOCK_API) return { ok: true, verificationId: 'mock', email: input.email, expiresInMinutes: 15 }
    try {
      return { ok: true, ...(await api.post<PendingRegistration>('/auth/register/start', input)) }
    } catch (err) {
      return { ok: false, error: errorMessage(err) }
    }
  }, [])

  const verifyRegistration = useCallback<AuthContextValue['verifyRegistration']>(
    async (verificationId, code) => {
      if (USE_MOCK_API) {
        setMock({ workspaceId: 'ws-annex', role: 'company_admin', userId: personaFor('ws-annex', 'company_admin').id })
        return { ok: true, domain: 'annex.annexhr.com' }
      }
      try {
        const payload = await api.post<SessionPayload>('/auth/register/verify', { verificationId, code })
        epoch.current++
        await adopt(payload)
        announce(payload.user.id)
        return { ok: true, domain: payload.workspace.domain }
      } catch (err) {
        return { ok: false, error: errorMessage(err) }
      }
    },
    [adopt, setMock, announce],
  )

  const resendRegistrationCode = useCallback<AuthContextValue['resendRegistrationCode']>(async (verificationId) => {
    if (USE_MOCK_API) return { ok: true }
    try {
      await api.post('/auth/register/resend', { verificationId })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: errorMessage(err) }
    }
  }, [])

  const acceptInvite = useCallback<AuthContextValue['acceptInvite']>(
    async (token, input) => {
      if (USE_MOCK_API || token === 'demo') {
        // The /invite/demo walkthrough has no real invitation behind it.
        return signInAs(USE_MOCK_API ? 'ws-annex' : 'annex', 'employee')
      }
      return run(() => api.post<SessionPayload>(`/invitations/${encodeURIComponent(token)}/accept`, input))
    },
    [run, signInAs],
  )

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (USE_MOCK_API) {
        const role = session?.role ?? 'company_admin'
        setMock({ workspaceId, role, userId: personaFor(workspaceId as WorkspaceId, role).id })
        return
      }
      const res = await run(() => api.post<SessionPayload>('/auth/switch-workspace', { workspaceId }))
      if (!res.ok) throw new Error(res.error)
    },
    [session, run, setMock],
  )

  const switchRole = useCallback(
    async (role: Role) => {
      if (!session) return
      if (USE_MOCK_API) {
        setMock({ ...session, role, userId: personaFor(session.workspaceId as WorkspaceId, role).id })
        return
      }
      const res = await run(() => api.post<SessionPayload>('/auth/switch-role', { role }))
      if (!res.ok) throw new Error(res.error)
    },
    [session, run, setMock],
  )

  const signOut = useCallback(async () => {
    epoch.current++
    if (!USE_MOCK_API) await api.post('/auth/logout').catch(() => undefined)
    saveMock(null)
    setSession(null)
    setRemote(null)
    announce(null)
  }, [announce])

  const refresh = useCallback(async () => {
    if (USE_MOCK_API || !session) return
    try {
      setRemote(await api.get<WorkspaceData>('/workspaces/current/bootstrap'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession(null)
        setRemote(null)
      }
    }
  }, [session])

  const value = useMemo<AuthContextValue>(() => {
    const data = session ? (USE_MOCK_API ? workspaceData[session.workspaceId as WorkspaceId] : remote) : null
    const user = data ? (data.employees.find((e) => e.id === session!.userId) ?? null) : null
    return {
      status,
      session,
      user,
      role: session?.role ?? 'employee',
      workspace: data?.workspace ?? null,
      data: data ?? null,
      workspaces: workspaceList,
      demoEnabled,
      demoSession,
      mock: USE_MOCK_API,
      signIn,
      signInAs,
      startRegistration,
      verifyRegistration,
      resendRegistrationCode,
      acceptInvite,
      switchWorkspace,
      switchRole,
      signOut,
      refresh,
    }
  }, [status, session, remote, workspaceList, demoEnabled, demoSession, signIn, signInAs, startRegistration, verifyRegistration, resendRegistrationCode, acceptInvite, switchWorkspace, switchRole, signOut, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/**
 * The active workspace's data plus lookup helpers.
 * Only use inside /app routes (guarded, so data is always present).
 */
export function useWorkspace() {
  const { data, user, role, workspace } = useAuth()
  if (!data || !user || !workspace) throw new Error('useWorkspace used outside an authenticated route')
  return useMemo(() => {
    const empMap = new Map(data.employees.map((e) => [e.id, e]))
    const deptMap = new Map(data.departments.map((d) => [d.id, d]))
    return {
      ...data,
      user,
      role,
      workspace,
      employee: (id?: string) => (id ? empMap.get(id) : undefined),
      department: (id?: string) => (id ? deptMap.get(id) : undefined),
    }
  }, [data, user, role, workspace])
}
