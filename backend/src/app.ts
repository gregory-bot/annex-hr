import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { pool } from './db/pool'
import { errorHandler, notFoundHandler } from './lib/http'
import { requireAuth } from './middleware/auth'
import { authRouter, invitationsRouter } from './modules/auth/routes'
import { engagementRouter } from './modules/hr/engagement'
import { governanceRouter } from './modules/hr/governance'
import { leaveRouter } from './modules/hr/leave'
import { payrollRouter } from './modules/hr/payroll'
import { peopleRouter } from './modules/hr/people'
import { timesheetsRouter } from './modules/hr/timesheets'
import { workspaceRouter } from './modules/workspace/routes'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  if (!env.isProd) {
    app.use((req, res, next) => {
      const start = Date.now()
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`))
      next()
    })
  }

  const api = express.Router()

  api.get('/health', async (_req, res) => {
    const started = Date.now()
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'ok', latencyMs: Date.now() - started })
  })

  // Public
  api.use('/auth', authRouter)
  api.use('/invitations', invitationsRouter)
  api.use('/workspaces', workspaceRouter)

  // Authenticated, workspace-scoped resources
  api.use(requireAuth, peopleRouter, leaveRouter, payrollRouter, timesheetsRouter, governanceRouter, engagementRouter)

  app.use('/api', api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
