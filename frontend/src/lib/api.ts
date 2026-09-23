/** Thin fetch wrapper for the Annex HR API. Session is an httpOnly cookie, so requests include credentials. */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

/** When true the UI runs entirely on in-browser demo data (no backend). */
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the Annex HR server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`, (data as { details?: unknown }).details)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong'
}
