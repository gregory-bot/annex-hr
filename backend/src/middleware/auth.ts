import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Role } from '@annex/shared/types'
import { env } from '../config/env'
import { forbidden, unauthorized } from '../lib/http'

export interface AuthContext {
  userId: string
  employeeId: string
  workspaceId: string
  role: Role
  /** True when the role was switched through the demo "View as" control. */
  demo?: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext
  }
}

export function signSession(ctx: AuthContext) {
  return jwt.sign(ctx, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'], issuer: 'annex-hr' })
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { path: '/' })
}

function readToken(req: Request): string | undefined {
  const cookie = req.cookies?.[env.COOKIE_NAME] as string | undefined
  if (cookie) return cookie
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined
}

/** Requires a valid session; attaches req.auth. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req)
  if (!token) return next(unauthorized())
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'annex-hr' }) as AuthContext
    req.auth = { userId: payload.userId, employeeId: payload.employeeId, workspaceId: payload.workspaceId, role: payload.role, demo: payload.demo }
    next()
  } catch {
    next(unauthorized('Session expired — please sign in again'))
  }
}

/** Allows the request only for the listed roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized())
    if (!roles.includes(req.auth.role)) return next(forbidden())
    next()
  }
}

export const auth = (req: Request) => {
  if (!req.auth) throw unauthorized()
  return req.auth
}
