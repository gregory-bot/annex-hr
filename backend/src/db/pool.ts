import fs from 'node:fs'
import pg from 'pg'
import { env } from '../config/env'

// Return NUMERIC and BIGINT as JS numbers (amounts here fit comfortably) and DATE as 'YYYY-MM-DD'.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v))
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v))
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)

/** Quoted schema identifier, e.g. "annex-hr". */
export const SCHEMA = `"${env.DB_SCHEMA.replace(/"/g, '')}"`

function ssl(): pg.PoolConfig['ssl'] {
  if (!env.DB_SSL) return false
  if (env.DB_SSL_CA_PATH) return { ca: fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8'), rejectUnauthorized: true }
  return { rejectUnauthorized: false }
}

export const pool = new pg.Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: ssl(),
  max: env.DB_POOL_MAX,
  // Release idle connections quickly — the instance's connection budget is shared with other apps.
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
  // Every connection resolves unqualified table names inside the Annex HR schema only.
  options: `-c search_path=${SCHEMA}`,
  application_name: 'annex-hr-api',
})

pool.on('error', (err) => console.error('Postgres pool error:', err.message))

export type Queryable = pg.Pool | pg.PoolClient

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB rows are mapped explicitly at the edges.
export async function query<T extends pg.QueryResultRow = Record<string, any>>(text: string, params: unknown[] = [], db: Queryable = pool) {
  const res = await withConnectionRetry(() => db.query<T>(text, params))
  return res.rows
}

/**
 * Retries briefly when Postgres has no free connection slots (SQLSTATE 53300).
 * Small managed plans (e.g. Aiven hobby: 20 connections shared by every app) hit this under load.
 */
export async function withConnectionRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if ((err as { code?: string }).code !== '53300' || i >= attempts) throw err
      await new Promise((r) => setTimeout(r, 150 * i * i))
    }
  }
}

/** Runs `fn` inside a transaction, rolling back on any error. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await withConnectionRetry(() => pool.connect())
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
