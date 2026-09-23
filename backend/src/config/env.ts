import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

// The single .env lives at the repository root (the folder whose package.json declares workspaces),
// shared with the frontend. Works from src/ (tsx) and dist/ (built) alike.
function findRootEnv() {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg) && 'workspaces' in JSON.parse(fs.readFileSync(pkg, 'utf8'))) return path.join(dir, '.env')
    dir = path.dirname(dir)
  }
  return path.resolve(process.cwd(), '.env')
}
dotenv.config({ path: findRootEnv(), quiet: true })

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SCHEMA: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'DB_SCHEMA may only contain letters, digits, _ and -').default('annex-hr'),
  DB_SSL: bool,
  DB_SSL_CA_PATH: z.string().optional().default(''),
  DB_POOL_MAX: z.coerce.number().int().positive().default(4),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('annex_session'),
  COOKIE_SECURE: bool,
  ENABLE_DEMO_LOGIN: bool,
  SEED_DEFAULT_PASSWORD: z.string().min(8).default('AnnexDemo#2026'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('✖ Invalid environment configuration:')
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  console.error('  Copy .env.example to .env at the repository root and fill it in.')
  process.exit(1)
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
}
