import { Router } from 'express'
import { z } from 'zod'
import { query } from '../../db/pool'
import { audit } from '../../lib/audit'
import { badRequest, parse } from '../../lib/http'
import { ADMIN, EXEC } from '../../lib/roles'
import { auth, requireRole } from '../../middleware/auth'
import { toNotification, toSurvey } from '../workspace/repository'
import { isoDate, owned } from './helpers'

export const engagementRouter = Router()

// ── Pulse surveys ───────────────────────────────────────────────────
engagementRouter.get('/surveys', async (req, res) => {
  res.json((await query('SELECT * FROM surveys WHERE workspace_id = $1 ORDER BY position', [auth(req).workspaceId])).map(toSurvey))
})

const question = z.object({
  id: z.string(),
  type: z.enum(['emoji', 'nps', 'choice', 'text']),
  prompt: z.string().trim().min(3),
  options: z.array(z.string()).optional(),
})

engagementRouter.post('/surveys', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({ title: z.string().trim().min(3), anonymous: z.boolean().default(true), closes: z.string().regex(isoDate), publish: z.boolean().default(false), questions: z.array(question).min(1).max(30) }),
    req.body,
  )
  const [{ n }] = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM employees WHERE workspace_id = $1 AND status <> 'Exited'`, [me.workspaceId])) as [{ n: number }]
  const [row] = await query(`INSERT INTO surveys (workspace_id, title, status, audience, closes, anonymous, questions, position) VALUES ($1,$2,$3,$4,$5,$6,$7,-1) RETURNING *`, [
    me.workspaceId,
    b.title,
    b.publish ? 'Live' : 'Draft',
    n,
    b.closes,
    b.anonymous,
    JSON.stringify(b.questions),
  ])
  await audit(req, 'survey.created', 'survey', row!.id as string)
  res.status(201).json(toSurvey(row!))
})

engagementRouter.post('/surveys/:id/responses', async (req, res) => {
  const me = auth(req)
  const { answers } = parse(z.object({ answers: z.record(z.string(), z.union([z.string(), z.number()])) }), req.body)
  const s = await owned('surveys', req.params.id, me.workspaceId, 'Survey')
  if (s.status !== 'Live') throw badRequest('This survey is not accepting responses')
  const [emp] = await query<{ department_id: string | null }>('SELECT department_id FROM employees WHERE id = $1', [me.employeeId])
  // Anonymous surveys never store who answered — only the department, for aggregate comparisons.
  await query('INSERT INTO survey_responses (survey_id, employee_id, department_id, answers) VALUES ($1,$2,$3,$4)', [s.id, s.anonymous ? null : me.employeeId, emp?.department_id ?? null, JSON.stringify(answers)])
  await query('UPDATE surveys SET responses = responses + 1 WHERE id = $1', [s.id])
  res.status(201).json({ ok: true })
})

// ── KPIs ────────────────────────────────────────────────────────────
engagementRouter.get('/kpis', async (req, res) => {
  const rows = await query('SELECT * FROM kpis WHERE workspace_id = $1 ORDER BY position', [auth(req).workspaceId])
  res.json(rows.map((k) => ({ id: k.id, perspective: k.perspective, name: k.name, target: k.target, actual: k.actual, unit: k.unit, weight: k.weight, owner: k.owner })))
})

engagementRouter.patch('/kpis/:id', requireRole(...EXEC, 'manager'), async (req, res) => {
  const me = auth(req)
  const b = parse(z.object({ actual: z.number().optional(), target: z.number().optional() }), req.body)
  await owned('kpis', String(req.params.id), me.workspaceId, 'KPI')
  const [k] = await query('UPDATE kpis SET actual = COALESCE($2, actual), target = COALESCE($3, target) WHERE id = $1 RETURNING *', [req.params.id, b.actual ?? null, b.target ?? null])
  res.json(k)
})

// ── Notifications ───────────────────────────────────────────────────
engagementRouter.get('/notifications', async (req, res) => {
  const me = auth(req)
  const rows = await query('SELECT * FROM notifications WHERE workspace_id = $1 AND (recipient_id IS NULL OR recipient_id = $2) ORDER BY created_at DESC LIMIT 100', [me.workspaceId, me.employeeId])
  res.json(rows.map(toNotification))
})

engagementRouter.post('/notifications/:id/read', async (req, res) => {
  const me = auth(req)
  await query('UPDATE notifications SET read = true WHERE id = $1 AND workspace_id = $2 AND (recipient_id IS NULL OR recipient_id = $3)', [req.params.id, me.workspaceId, me.employeeId])
  res.status(204).end()
})

engagementRouter.post('/notifications/read-all', async (req, res) => {
  const me = auth(req)
  await query('UPDATE notifications SET read = true WHERE workspace_id = $1 AND (recipient_id IS NULL OR recipient_id = $2) AND NOT read', [me.workspaceId, me.employeeId])
  res.status(204).end()
})

// ── Audit logs ──────────────────────────────────────────────────────
engagementRouter.get('/audit-logs', requireRole(...ADMIN), async (req, res) => {
  const rows = await query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.ip_address, a.details, a.created_at, e.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN employees e ON e.id = u.employee_id
      WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT 200`,
    [auth(req).workspaceId],
  )
  res.json(rows.map((r) => ({ id: r.id, action: r.action, entity: r.entity, entityId: r.entity_id, ip: r.ip_address, details: r.details, at: r.created_at, user: r.user_name ?? 'System' })))
})
