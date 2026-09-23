import { query, type Queryable, pool } from '../../db/pool'
import { ident } from '../../db/sql'
import { notFound } from '../../lib/http'

/** Loads a row by id that must belong to the workspace, or throws 404 (never leaks other tenants' rows). */
export async function owned<T extends Record<string, any> = Record<string, any>>(table: string, id: string, workspaceId: string, what = 'Record', db: Queryable = pool) {
  const [row] = await query<T>(`SELECT * FROM ${ident(table)} WHERE id = $1 AND workspace_id = $2`, [id, workspaceId], db)
  if (!row) throw notFound(what)
  return row
}

export const isoDate = /^\d{4}-\d{2}-\d{2}$/
