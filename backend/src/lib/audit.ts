import type { Request } from 'express'
import { pool, type Queryable } from '../db/pool'

/** Records an audit event. Never throws — auditing must not break the request. */
export async function audit(req: Request, action: string, entity: string, entityId?: string | null, details: Record<string, unknown> = {}, db: Queryable = pool) {
  try {
    await db.query('INSERT INTO audit_logs (workspace_id, user_id, action, entity, entity_id, ip_address, details) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      req.auth?.workspaceId ?? null,
      req.auth?.userId ?? null,
      action,
      entity,
      entityId ?? null,
      req.ip ?? null,
      JSON.stringify(details),
    ])
  } catch (err) {
    console.warn('audit log failed:', (err as Error).message)
  }
}
