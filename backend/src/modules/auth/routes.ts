import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { Role } from '@annex/shared/types'
import { DEFAULT_TICKET_TEAMS, workspaceData } from '@annex/shared/seed'
import { env } from '../../config/env'
import { pool, query, tx, type Queryable } from '../../db/pool'
import { insertMany } from '../../db/sql'
import { audit } from '../../lib/audit'
import { badRequest, conflict, forbidden, HttpError, notFound, parse, unauthorized } from '../../lib/http'
import { auth, clearSessionCookie, requireAuth, setSessionCookie, signSession, type AuthContext } from '../../middleware/auth'
import { getWorkspace, toEmployee } from '../workspace/repository'

export const authRouter = Router()

const ROLES = ['super_admin', 'company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo'] as const
const PERSONAL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']

// Compared against when the user doesn't exist, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('annex-timing-equaliser', 10)

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts — try again in a few minutes' } })

async function startSession(res: import('express').Response, ctx: AuthContext) {
  setSessionCookie(res, signSession(ctx))
  void query('UPDATE users SET last_login_at = now() WHERE id = $1', [ctx.userId]).catch(() => undefined)
  return sessionPayload(ctx)
}

/** The session shape returned to the frontend. */
export async function sessionPayload(ctx: AuthContext) {
  const [[employee], workspace] = await Promise.all([query('SELECT * FROM employees WHERE id = $1', [ctx.employeeId]), getWorkspace(ctx.workspaceId)])
  if (!employee || !workspace) throw unauthorized('Account no longer exists')
  return { user: toEmployee(employee), role: ctx.role, workspace, demo: !!ctx.demo, demoEnabled: env.ENABLE_DEMO_LOGIN }
}

/** Picks the demo persona for a role (mirrors personaFor in the frontend). */
async function personaFor(workspaceId: string, role: Role, db: Queryable = pool) {
  const target = role === 'super_admin' ? 'company_admin' : role
  const rows = await query<{ user_id: string; employee_id: string }>(
    `SELECT u.id AS user_id, e.id AS employee_id
       FROM employees e JOIN users u ON u.employee_id = e.id
      WHERE e.workspace_id = $1
      ORDER BY (e.role = 'employee' AND e.status = 'Onboarding' AND $2 = 'employee') DESC,
               (e.role = $2) DESC,
               (e.role = 'employee') DESC,
               e.employee_no
      LIMIT 1`,
    [workspaceId, target],
    db,
  )
  if (!rows[0]) throw notFound('Demo persona')
  return rows[0]
}

async function workspaceBySlug(slug: string) {
  const [ws] = await query<{ id: string; name: string }>('SELECT id, name FROM workspaces WHERE slug = $1', [slug.toLowerCase().trim()])
  return ws
}

// ── Register a company workspace ────────────────────────────────────
const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  industry: z.string().trim().min(2),
  country: z.string().trim().min(2),
  size: z.string().trim().min(1),
  adminName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/)
    .optional(),
})

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace'

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = parse(registerSchema, req.body)
  const domain = body.email.split('@')[1]!
  if (PERSONAL_DOMAINS.includes(domain)) throw badRequest('Please use your work email address')

  const slug = body.slug ?? slugify(body.companyName)
  if (await workspaceBySlug(slug)) throw conflict(`${slug}.annexhr.com is already taken — choose another workspace name`)

  const passwordHash = await bcrypt.hash(body.password, 12)
  const adminName = body.adminName ?? body.email.split('@')[0]!.split(/[._-]/).map((p) => p[0]!.toUpperCase() + p.slice(1)).join(' ')
  const template = workspaceData['ws-annex']

  const ctx = await tx(async (db) => {
    const [ws] = await query<{ id: string }>(
      `INSERT INTO workspaces (slug, name, industry, country, size, domain, logo_text, plan, founded)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Starter', $8) RETURNING id`,
      [slug, body.companyName, body.industry, body.country, body.size, `${slug}.annexhr.com`, body.companyName[0]!.toUpperCase(), new Date().getFullYear()],
      db,
    )
    const W = ws!.id
    const [people] = await query<{ id: string }>(`INSERT INTO departments (workspace_id, name, color) VALUES ($1, 'People & Culture', '#C1121F') RETURNING id`, [W], db)
    const [emp] = await query<{ id: string }>(
      `INSERT INTO employees (workspace_id, employee_no, name, email, title, department_id, role, employment_type, status, start_date, onboarding_progress)
       VALUES ($1, $2, $3, $4, 'HR Administrator', $5, 'company_admin', 'Full-time', 'Active', current_date, 100) RETURNING id`,
      [W, `${slug.slice(0, 3).toUpperCase()}-1001`, adminName, body.email, people!.id],
      db,
    )
    await query('UPDATE departments SET head_id = $1 WHERE id = $2', [emp!.id, people!.id], db)
    const [user] = await query<{ id: string }>(`INSERT INTO users (workspace_id, employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4, 'company_admin') RETURNING id`, [W, emp!.id, body.email, passwordHash], db)

    // Sensible defaults: the standard Kenyan onboarding checklist and the country's public holidays.
    await insertMany(db, 'onboarding_tasks', template.onboardingTasks.map((t, i) => ({ workspace_id: W, ...t, position: i })))
    const holidays = template.holidays.filter((h) => h.country === body.country)
    await insertMany(db, 'holidays', holidays.map((h) => ({ workspace_id: W, ...h })))
    await insertMany(db, 'ticket_teams', DEFAULT_TICKET_TEAMS.map((t, i) => ({ workspace_id: W, key: t.key, name: t.name, color: t.color, position: i })))
    await insertMany(db, 'metric_series', Object.keys(template.trends).map((metric) => ({ workspace_id: W, metric, data: '[]' })))
    await query(
      `INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1, 'system', $2, 'Next: add departments and invite your team.', '/app/people?invite=1')`,
      [W, `Welcome to Annex HR — ${body.companyName} is ready`],
      db,
    )
    return { userId: user!.id, employeeId: emp!.id, workspaceId: W, role: 'company_admin' as Role }
  })

  req.auth = ctx
  await audit(req, 'workspace.created', 'workspace', ctx.workspaceId, { slug })
  res.status(201).json(await startSession(res, ctx))
})

// ── Login ───────────────────────────────────────────────────────────
const loginSchema = z.object({
  workspace: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(loginSchema, req.body)
  const ws = await workspaceBySlug(body.workspace)
  if (!ws) throw new HttpError(404, `No workspace found at ${body.workspace}.annexhr.com`)

  // Accounts are scoped to their workspace: employees can only sign in to their own organisation.
  const [user] = await query<{ id: string; employee_id: string; role: Role; password_hash: string }>(
    'SELECT id, employee_id, role, password_hash FROM users WHERE workspace_id = $1 AND email = $2',
    [ws.id, body.email],
  )
  const ok = user ? await bcrypt.compare(body.password, user.password_hash) : await bcrypt.compare(body.password, DUMMY_HASH)
  if (!user || !ok) throw unauthorized('Incorrect email or password')

  const ctx: AuthContext = { userId: user.id, employeeId: user.employee_id, workspaceId: ws.id, role: user.role }
  req.auth = ctx
  await audit(req, 'auth.login', 'user', user.id)
  res.json(await startSession(res, ctx))
})

// ── Demo sign-in & "View as" (only when ENABLE_DEMO_LOGIN=true) ─────
function requireDemo() {
  if (!env.ENABLE_DEMO_LOGIN) throw forbidden('Demo sign-in is disabled')
}

authRouter.post('/demo', authLimiter, async (req, res) => {
  requireDemo()
  const body = parse(z.object({ workspace: z.string().trim().min(1), role: z.enum(ROLES) }), req.body)
  const [ws] = await query<{ id: string }>('SELECT id FROM workspaces WHERE slug = $1 OR id = $1', [body.workspace])
  if (!ws) throw notFound('Workspace')
  const persona = await personaFor(ws.id, body.role)
  res.json(await startSession(res, { userId: persona.user_id, employeeId: persona.employee_id, workspaceId: ws.id, role: body.role, demo: true }))
})

authRouter.post('/switch-role', requireAuth, async (req, res) => {
  requireDemo()
  const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body)
  const current = auth(req)
  const persona = await personaFor(current.workspaceId, role)
  res.json(await startSession(res, { userId: persona.user_id, employeeId: persona.employee_id, workspaceId: current.workspaceId, role, demo: true }))
})

authRouter.post('/switch-workspace', requireAuth, async (req, res) => {
  requireDemo()
  const { workspaceId } = parse(z.object({ workspaceId: z.string().min(1) }), req.body)
  const role = auth(req).role
  const persona = await personaFor(workspaceId, role)
  res.json(await startSession(res, { userId: persona.user_id, employeeId: persona.employee_id, workspaceId, role, demo: true }))
})

// ── Session ─────────────────────────────────────────────────────────
/** Public client configuration. */
authRouter.get('/config', (_req, res) => {
  res.json({ demoEnabled: env.ENABLE_DEMO_LOGIN })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await sessionPayload(auth(req)))
})

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  parse(z.object({ workspace: z.string().min(1), email: z.string().email() }), req.body)
  // Always succeed so the endpoint can't be used to discover accounts.
  // TODO: generate a reset token and send it through the email provider.
  res.json({ ok: true })
})

// ── Invitations ─────────────────────────────────────────────────────
export const invitationsRouter = Router()

invitationsRouter.post('/', requireAuth, async (req, res) => {
  const me = auth(req)
  if (!['super_admin', 'company_admin', 'hr_officer'].includes(me.role)) throw forbidden()
  const body = parse(
    z.object({
      invites: z.array(z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES).default('employee'), departmentId: z.string().optional() })).min(1).max(100),
    }),
    req.body,
  )
  const rows = body.invites.map((i) => ({
    workspace_id: me.workspaceId,
    email: i.email,
    role: i.role,
    department_id: i.departmentId ?? null,
    token: crypto.randomBytes(24).toString('base64url'),
    invited_by: me.employeeId,
  }))
  await insertMany(pool, 'invitations', rows)
  await audit(req, 'invitations.sent', 'invitation', null, { count: rows.length })
  // TODO: send invitation emails; the accept link is /invite/<token>.
  res.status(201).json({ sent: rows.length, invitations: rows.map((r) => ({ email: r.email, role: r.role, token: r.token, link: `/invite/${r.token}` })) })
})

invitationsRouter.get('/', requireAuth, async (req, res) => {
  const rows = await query('SELECT id, email, role, status, expires_at, created_at FROM invitations WHERE workspace_id = $1 ORDER BY created_at DESC', [auth(req).workspaceId])
  res.json(rows)
})

async function findInvitation(token: string) {
  const [inv] = await query<Record<string, any>>(
    `SELECT i.*, w.name AS workspace_name, w.slug, w.domain, w.logo_text, w.industry, w.country, e.name AS inviter_name
       FROM invitations i JOIN workspaces w ON w.id = i.workspace_id LEFT JOIN employees e ON e.id = i.invited_by
      WHERE i.token = $1`,
    [token],
  )
  if (!inv) throw notFound('Invitation')
  if (inv.status !== 'Pending') throw badRequest(`This invitation has already been ${inv.status.toLowerCase()}`)
  if (new Date(inv.expires_at) < new Date()) throw badRequest('This invitation has expired — ask HR to resend it')
  return inv
}

invitationsRouter.get('/:token', async (req, res) => {
  const inv = await findInvitation(req.params.token)
  res.json({ email: inv.email, role: inv.role, workspace: { name: inv.workspace_name, slug: inv.slug, domain: inv.domain, logoText: inv.logo_text, industry: inv.industry, country: inv.country }, invitedBy: inv.inviter_name })
})

invitationsRouter.post('/:token/accept', authLimiter, async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(80),
      password: z.string().min(8).max(128),
      phone: z.string().trim().max(30).optional(),
      birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    req.body,
  )
  const inv = await findInvitation(String(req.params.token))
  const passwordHash = await bcrypt.hash(body.password, 12)

  const ctx = await tx(async (db) => {
    const [{ count }] = (await query<{ count: number }>('SELECT count(*)::int AS count FROM employees WHERE workspace_id = $1', [inv.workspace_id], db)) as [{ count: number }]
    const [emp] = await query<{ id: string }>(
      `INSERT INTO employees (workspace_id, employee_no, name, email, phone, birthday, title, department_id, role, employment_type, status, start_date, probation_end, onboarding_progress)
       VALUES ($1, $2, $3, $4, $5, $6, 'New starter', $7, $8, $9, 'Onboarding', current_date, current_date + 90, 10) RETURNING id`,
      [inv.workspace_id, `${String(inv.slug).slice(0, 3).toUpperCase()}-${1001 + count}`, body.name, inv.email, body.phone ?? null, body.birthday ?? null, inv.department_id, inv.role, inv.role === 'consultant' ? 'Consultant' : 'Full-time'],
      db,
    )
    const [user] = await query<{ id: string }>('INSERT INTO users (workspace_id, employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id', [inv.workspace_id, emp!.id, inv.email, passwordHash, inv.role], db)
    await query(`UPDATE invitations SET status = 'Accepted', accepted_at = now() WHERE id = $1`, [inv.id], db)
    await query(`INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1, 'system', $2, 'Onboarding checklist assigned automatically.', '/app/onboarding?tab=overview')`, [inv.workspace_id, `${body.name} joined the workspace`], db)
    return { userId: user!.id, employeeId: emp!.id, workspaceId: inv.workspace_id as string, role: inv.role as Role }
  })
  res.status(201).json(await startSession(res, ctx))
})
