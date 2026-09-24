/**
 * Workspace from the browser address: <slug>.annexhr.com in production,
 * <slug>.localhost:5173 in local development. Returns null on the bare domain.
 */
const APP_DOMAIN = ((import.meta.env.VITE_APP_DOMAIN as string | undefined) ?? 'annexhr.com').toLowerCase()
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'mail', 'edge', 'cname'])

export function workspaceFromHost(hostname: string = window.location.hostname): string | null {
  const host = hostname.toLowerCase()
  for (const base of [APP_DOMAIN, 'localhost']) {
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1))
      if (sub && !sub.includes('.') && !RESERVED.has(sub) && /^[a-z0-9][a-z0-9-]{1,40}$/.test(sub)) return sub
    }
  }
  return null
}
