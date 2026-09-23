import { Router } from 'express'
import { env } from '../../config/env'
import { query } from '../../db/pool'
import { notFound } from '../../lib/http'
import { auth, requireAuth } from '../../middleware/auth'
import { loadWorkspaceData } from './repository'

export const workspaceRouter = Router()

/** Public: does a workspace exist at <slug>.annexhr.com? Used by the login form. */
workspaceRouter.get('/lookup/:slug', async (req, res) => {
  const [ws] = await query('SELECT slug, name, domain, logo_text, industry, country FROM workspaces WHERE slug = $1', [req.params.slug.toLowerCase()])
  if (!ws) throw notFound('Workspace')
  res.json({ slug: ws.slug, name: ws.name, domain: ws.domain, logoText: ws.logo_text, industry: ws.industry, country: ws.country })
})

/** Workspaces the current user may switch to. In demo mode that's every workspace. */
workspaceRouter.get('/', requireAuth, async (req, res) => {
  const me = auth(req)
  const rows = env.ENABLE_DEMO_LOGIN
    ? await query('SELECT id, slug, name, domain, logo_text FROM workspaces ORDER BY created_at')
    : await query('SELECT id, slug, name, domain, logo_text FROM workspaces WHERE id = $1', [me.workspaceId])
  res.json(rows.map((w) => ({ id: w.id, slug: w.slug, name: w.name, domain: w.domain, logoText: w.logo_text })))
})

/** Everything the app needs for the signed-in workspace, redacted for the viewer's role. */
workspaceRouter.get('/current/bootstrap', requireAuth, async (req, res) => {
  res.json(await loadWorkspaceData(auth(req)))
})
