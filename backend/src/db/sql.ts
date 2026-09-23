import type { Queryable } from './pool'

const IDENT = /^[a-z_][a-z0-9_]*$/

/** Guards identifiers that are interpolated into SQL (never user input, but be strict anyway). */
export function ident(name: string) {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return name
}

/** Multi-row INSERT, chunked to stay well under Postgres' 65k parameter limit. */
export async function insertMany(db: Queryable, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0]!).map(ident)
  const perChunk = Math.max(1, Math.floor(20_000 / cols.length))
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk)
    const params: unknown[] = []
    const values = chunk.map((row) => `(${cols.map((c) => (params.push(row[c] ?? null), `$${params.length}`)).join(', ')})`)
    await db.query(`INSERT INTO ${ident(table)} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params)
  }
}

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** snake_case DB row → camelCase API object. */
export function camel<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v
  return out as T
}

/**
 * Builds a parameterised UPDATE … SET from a camelCase patch, allowing only whitelisted columns.
 * Returns null when nothing updatable was supplied.
 */
export function buildUpdate(patch: Record<string, unknown>, allowed: string[], startIndex = 1) {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    const col = toSnake(key)
    if (value === undefined || !allowed.includes(col)) continue
    params.push(value)
    sets.push(`${ident(col)} = $${startIndex + params.length - 1}`)
  }
  return sets.length ? { sql: sets.join(', '), params } : null
}
