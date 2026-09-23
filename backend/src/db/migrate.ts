import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env'
import { pool, SCHEMA, withConnectionRetry } from './pool'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

/** Drops every table in the Annex HR schema (the schema itself and all other schemas are untouched). */
async function reset() {
  if (env.isProd) throw new Error('Refusing to reset the database in production.')
  const { rows } = await pool.query<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1', [env.DB_SCHEMA])
  if (rows.length) {
    await pool.query(`DROP TABLE ${rows.map((r) => `${SCHEMA}."${r.tablename}"`).join(', ')} CASCADE`)
  }
  console.log(`↺ Dropped ${rows.length} tables from schema ${SCHEMA}`)
}

export async function migrate() {
  const exists = await withConnectionRetry(() => pool.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [env.DB_SCHEMA]))
  if (!exists.rowCount) throw new Error(`Schema ${SCHEMA} does not exist. Create it first: CREATE SCHEMA ${SCHEMA};`)

  await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const applied = new Set((await pool.query<{ name: string }>(`SELECT name FROM ${SCHEMA}.schema_migrations`)).rows.map((r) => r.name))
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    const client = await withConnectionRetry(() => pool.connect())
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL search_path TO ${SCHEMA}`)
      await client.query(sql)
      await client.query(`INSERT INTO ${SCHEMA}.schema_migrations (name) VALUES ($1)`, [file])
      await client.query('COMMIT')
      console.log(`✓ Applied ${file}`)
      count++
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
    } finally {
      client.release()
    }
  }
  console.log(count ? `Migrations complete (${count} applied) in schema ${SCHEMA}.` : `Schema ${SCHEMA} is up to date.`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (process.argv.includes('--reset')) await reset()
    await migrate()
  } catch (err) {
    console.error('✖', (err as Error).message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
