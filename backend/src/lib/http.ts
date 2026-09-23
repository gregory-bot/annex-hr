import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details)
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg)
export const forbidden = (msg = 'You do not have access to this resource') => new HttpError(403, msg)
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`)
export const conflict = (msg: string) => new HttpError(409, msg)

/** Parses and validates a request body/query with zod, throwing a 400 on failure. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const res = schema.safeParse(input)
  if (!res.success) throw badRequest('Validation failed', res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  return res.data
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `No route for ${req.method} ${req.path}`))
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.issues })
    return
  }
  const pgErr = err as { code?: string; detail?: string; constraint?: string }
  if (pgErr?.code === '23505') {
    res.status(409).json({ error: 'A record with these details already exists', details: pgErr.detail })
    return
  }
  if (pgErr?.code === '23503' || pgErr?.code === '23514' || pgErr?.code === '22P02') {
    res.status(400).json({ error: 'Invalid reference or value', details: pgErr.detail ?? pgErr.constraint })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
