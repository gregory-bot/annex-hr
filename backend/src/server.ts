import { env } from './config/env'
import { pool, SCHEMA } from './db/pool'
import { createApp } from './app'

const app = createApp()

const server = app.listen(env.API_PORT, async () => {
  console.log(`▲ Annex HR API listening on http://localhost:${env.API_PORT}/api`)
  try {
    await pool.query('SELECT 1')
    console.log(`  ✓ Connected to ${env.DB_HOST}/${env.DB_NAME} (schema ${SCHEMA})`)
  } catch (err) {
    console.error(`  ✖ Database unreachable: ${(err as Error).message}`)
  }
})

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down`)
  server.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
