import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../../db/pool'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, parse } from '../../lib/http'
import { ADMIN, EXEC, isAdmin, isExec, LEADERS } from '../../lib/roles'
import { auth, requireRole } from '../../middleware/auth'
import { toCase, toComplianceDoc, toDocument, toOffboarding, toPolicy } from '../workspace/repository'
import { isoDate, owned } from './helpers'

export const governanceRouter = Router()

// ── Policies & acknowledgements ─────────────────────────────────────
governanceRouter.get('/policies', async (req, res) => {
  const me = auth(req)
  const rows = await query('SELECT * FROM policies WHERE workspace_id = $1 ORDER BY title', [me.workspaceId])
  const versions = await query('SELECT v.* FROM policy_versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1 ORDER BY position', [me.workspaceId])
  const acks = await query<{ policy_id: string; version: string; acknowledged_at: string }>('SELECT policy_id, version, acknowledged_at FROM policy_acknowledgements WHERE employee_id = $1', [me.employeeId])
  res.json(
    rows.map((p) => ({
      ...toPolicy(p, versions.filter((v) => v.policy_id === p.id)),
      myAcknowledgement: acks.find((a) => a.policy_id === p.id && a.version === p.version) ?? null,
    })),
  )
})

governanceRouter.post('/policies/:id/acknowledge', async (req, res) => {
  const me = auth(req)
  const { signature } = parse(z.object({ signature: z.string().trim().min(2).max(120) }), req.body)
  const p = await owned('policies', req.params.id, me.workspaceId, 'Policy')
  const [ack] = await query(
    `INSERT INTO policy_acknowledgements (policy_id, employee_id, version, signature, ip_address) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (policy_id, employee_id, version) DO UPDATE SET signature = EXCLUDED.signature RETURNING *`,
    [p.id, me.employeeId, p.version, signature, req.ip ?? null],
  )
  // Keep the rolled-up acknowledgement percentage current.
  await query(
    `UPDATE policies SET acknowledged = LEAST(100, ROUND(100.0 * (SELECT count(DISTINCT employee_id) FROM policy_acknowledgements WHERE policy_id = $1 AND version = $2)
       / GREATEST(1, (SELECT count(*) FROM employees WHERE workspace_id = $3 AND status <> 'Exited')))) WHERE id = $1 AND acknowledged < 100`,
    [p.id, p.version, me.workspaceId],
  )
  await audit(req, 'policy.acknowledged', 'policy', p.id as string, { version: p.version })
  res.status(201).json({ policyId: p.id, version: p.version, acknowledgedAt: ack!.acknowledged_at })
})

governanceRouter.post('/policies/:id/versions', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  const b = parse(z.object({ version: z.string().regex(/^v\d+\.\d+$/), note: z.string().trim().min(3), summary: z.string().optional() }), req.body)
  const p = await owned('policies', String(req.params.id), me.workspaceId, 'Policy')
  await tx(async (db) => {
    await db.query('UPDATE policy_versions SET position = position + 1 WHERE policy_id = $1', [p.id])
    await db.query('INSERT INTO policy_versions (policy_id, version, date, note, position) VALUES ($1,$2,current_date,$3,0)', [p.id, b.version, b.note])
    await db.query('UPDATE policies SET version = $2, updated_on = current_date, acknowledged = 0, summary = COALESCE($3, summary) WHERE id = $1', [p.id, b.version, b.summary ?? null])
    await db.query(`INSERT INTO notifications (workspace_id, type, title, body, href) VALUES ($1,'policy',$2,'Please read and acknowledge the new version.','/app/onboarding?tab=policies')`, [me.workspaceId, `${p.title} ${b.version} published`])
  })
  await audit(req, 'policy.version_published', 'policy', p.id as string, { version: b.version })
  res.status(201).json({ ok: true })
})

// ── Onboarding checklist ────────────────────────────────────────────
governanceRouter.get('/onboarding/me', async (req, res) => {
  const me = auth(req)
  const tasks = await query('SELECT * FROM onboarding_tasks WHERE workspace_id = $1 ORDER BY position', [me.workspaceId])
  const done = await query<{ task_id: string; completed_at: string }>('SELECT task_id, completed_at FROM onboarding_task_completions WHERE employee_id = $1', [me.employeeId])
  res.json(tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, category: t.category, required: t.required, completedAt: done.find((d) => d.task_id === t.id)?.completed_at ?? null })))
})

governanceRouter.post('/onboarding/tasks/:taskId/complete', async (req, res) => {
  const me = auth(req)
  const payload = parse(z.record(z.string(), z.unknown()).default({}), req.body ?? {})
  // Never store bank or ID numbers in plain payloads beyond what the task needs.
  await query(
    `INSERT INTO onboarding_task_completions (workspace_id, task_id, employee_id, payload) VALUES ($1,$2,$3,$4)
     ON CONFLICT (employee_id, task_id) DO UPDATE SET completed_at = now(), payload = EXCLUDED.payload`,
    [me.workspaceId, req.params.taskId, me.employeeId, JSON.stringify(payload)],
  )
  const [{ pct }] = (await query<{ pct: number }>(
    `SELECT ROUND(100.0 * (SELECT count(*) FROM onboarding_task_completions WHERE employee_id = $2) / GREATEST(1, (SELECT count(*) FROM onboarding_tasks WHERE workspace_id = $1)))::int AS pct`,
    [me.workspaceId, me.employeeId],
  )) as [{ pct: number }]
  await query('UPDATE employees SET onboarding_progress = LEAST(100, $2), updated_at = now() WHERE id = $1', [me.employeeId, pct])
  res.json({ taskId: req.params.taskId, onboardingProgress: Math.min(100, pct) })
})

// ── Compliance documents ────────────────────────────────────────────
governanceRouter.get('/compliance-documents', async (req, res) => {
  const me = auth(req)
  const all = isExec(me.role) || me.role === 'manager'
  const rows = await query('SELECT * FROM compliance_documents WHERE workspace_id = $1 AND ($2::text IS NULL OR employee_id = $2) ORDER BY expires NULLS LAST', [me.workspaceId, all ? null : me.employeeId])
  res.json(rows.map(toComplianceDoc))
})

governanceRouter.post('/compliance-documents', async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({
      employeeId: z.string(),
      type: z.enum(['Passport', 'Work Visa', 'Driving Licence', 'Contract', 'Academic Certificate', 'Certificate of Good Conduct', 'Professional License']),
      number: z.string().trim().min(2),
      issued: z.string().regex(isoDate),
      expires: z.string().regex(isoDate).optional(),
    }),
    req.body,
  )
  if (b.employeeId !== me.employeeId && !isAdmin(me.role)) throw forbidden()
  await owned('employees', b.employeeId, me.workspaceId, 'Employee')
  const days = b.expires ? (new Date(b.expires).getTime() - Date.now()) / 86_400_000 : Infinity
  const status = days < 0 ? 'Expired' : days < 60 ? 'Expiring' : 'Valid'
  const [row] = await query('INSERT INTO compliance_documents (workspace_id, employee_id, type, number, issued, expires, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [
    me.workspaceId,
    b.employeeId,
    b.type,
    b.number,
    b.issued,
    b.expires ?? null,
    status,
  ])
  await audit(req, 'compliance.document_added', 'compliance_document', row!.id as string)
  res.status(201).json(toComplianceDoc(row!))
})

// ── Documents ───────────────────────────────────────────────────────
governanceRouter.get('/documents', async (req, res) => {
  const me = auth(req)
  const rows = await query('SELECT * FROM documents WHERE workspace_id = $1 AND ($2::text IS NULL OR folder = $2) ORDER BY updated_on DESC', [me.workspaceId, (req.query.folder as string) ?? null])
  const versions = await query('SELECT v.* FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE d.workspace_id = $1 ORDER BY position', [me.workspaceId])
  res.json(rows.map((d) => toDocument(d, versions.filter((v) => v.document_id === d.id))))
})

governanceRouter.post('/documents', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({ name: z.string().trim().min(2), folder: z.string().trim().min(2), size: z.string().default('—'), type: z.enum(['pdf', 'docx', 'xlsx', 'png']).default('pdf'), employeeId: z.string().optional() }),
    req.body,
  )
  const [owner] = await query<{ name: string }>('SELECT name FROM employees WHERE id = $1', [me.employeeId])
  // TODO: upload the file body to object storage and store its key in storage_key.
  const [row] = await query(`INSERT INTO documents (workspace_id, name, folder, size, type, updated_on, owner, version, employee_id) VALUES ($1,$2,$3,$4,$5,current_date,$6,'v1.0',$7) RETURNING *`, [
    me.workspaceId,
    b.name,
    b.folder,
    b.size,
    b.type,
    owner!.name,
    b.employeeId ?? null,
  ])
  await query(`INSERT INTO document_versions (document_id, version, date, by_name) VALUES ($1,'v1.0',current_date,$2)`, [row!.id, owner!.name])
  await audit(req, 'document.uploaded', 'document', row!.id as string)
  res.status(201).json(toDocument(row!, [{ version: 'v1.0', date: row!.updated_on, by_name: owner!.name }]))
})

// ── Disciplinary & grievance cases (confidential) ───────────────────
const caseRouter = Router()
caseRouter.use(requireRole(...EXEC))

async function fullCase(id: string) {
  const [c] = await query('SELECT * FROM hr_cases WHERE id = $1', [id])
  const events = await query('SELECT * FROM case_events WHERE case_id = $1 ORDER BY position, date', [id])
  const evidence = await query('SELECT * FROM case_evidence WHERE case_id = $1 ORDER BY uploaded', [id])
  return toCase(c!, events, evidence)
}

caseRouter.get('/', async (req, res) => {
  const rows = await query(
    `SELECT c.*,
            COALESCE((SELECT json_agg(e ORDER BY e.position, e.date) FROM case_events e WHERE e.case_id = c.id), '[]') AS events,
            COALESCE((SELECT json_agg(v ORDER BY v.uploaded) FROM case_evidence v WHERE v.case_id = c.id), '[]') AS evidence
       FROM hr_cases c WHERE c.workspace_id = $1 ORDER BY c.opened DESC`,
    [auth(req).workspaceId],
  )
  res.json(rows.map((c) => toCase(c, c.events, c.evidence)))
})

caseRouter.post('/', async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({
      type: z.enum(['Disciplinary', 'Grievance', 'Harassment', 'Misconduct', 'Performance']),
      subjectId: z.string(),
      reportedBy: z.string().default('Anonymous'),
      severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
      summary: z.string().trim().min(10).max(2000),
      confidential: z.boolean().default(true),
    }),
    req.body,
  )
  await owned('employees', b.subjectId, me.workspaceId, 'Subject')
  const [me2] = await query<{ name: string }>('SELECT name FROM employees WHERE id = $1', [me.employeeId])
  const id = await tx(async (db) => {
    const [{ n }] = (await db.query('SELECT count(*)::int AS n FROM hr_cases WHERE workspace_id = $1', [me.workspaceId])).rows
    const ref = `HR-${new Date().getFullYear()}-${String(41 + n).padStart(4, '0')}`
    const [c] = (
      await db.query(
        `INSERT INTO hr_cases (workspace_id, ref, type, subject_id, reported_by, severity, assigned_to, confidential, summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [me.workspaceId, ref, b.type, b.subjectId, b.reportedBy, b.severity, me.employeeId, b.confidential, b.summary],
      )
    ).rows
    await db.query(`INSERT INTO case_events (case_id, date, title, by_name, note) VALUES ($1,current_date,'Case logged',$2,'Case created via confidential intake.')`, [c.id, me2!.name])
    return c.id as string
  })
  await audit(req, 'case.logged', 'hr_case', id)
  res.status(201).json(await fullCase(id))
})

caseRouter.get('/:id', async (req, res) => {
  const me = auth(req)
  await owned('hr_cases', req.params.id, me.workspaceId, 'Case')
  await query(`INSERT INTO case_access_log (case_id, user_id, action) VALUES ($1,$2,'viewed')`, [req.params.id, me.userId])
  res.json(await fullCase(req.params.id))
})

const STAGES = ['Logged', 'Investigating', 'Hearing', 'Awaiting Approval', 'Closed'] as const

caseRouter.post('/:id/advance', async (req, res) => {
  const me = auth(req)
  const c = await owned('hr_cases', req.params.id, me.workspaceId, 'Case')
  const i = STAGES.indexOf(c.status as (typeof STAGES)[number])
  if (i >= STAGES.length - 1) throw badRequest('Case is already closed')
  // Closing requires CEO sign-off.
  if (STAGES[i + 1] === 'Closed' && !['ceo', 'super_admin'].includes(me.role)) throw forbidden('Closing a case requires CEO sign-off')
  const next = STAGES[i + 1]!
  const [actor] = await query<{ name: string }>('SELECT name FROM employees WHERE id = $1', [me.employeeId])
  await query('UPDATE hr_cases SET status = $2 WHERE id = $1', [c.id, next])
  await query(`INSERT INTO case_events (case_id, date, title, by_name, note, position) VALUES ($1,current_date,$2,$3,$4,(SELECT COALESCE(max(position),0)+1 FROM case_events WHERE case_id = $1))`, [
    c.id,
    `Moved to ${next}`,
    actor!.name,
    (req.body as { note?: string })?.note ?? '',
  ])
  await audit(req, 'case.advanced', 'hr_case', c.id as string, { to: next })
  res.json(await fullCase(c.id as string))
})

caseRouter.post('/:id/events', async (req, res) => {
  const me = auth(req)
  const b = parse(z.object({ title: z.string().trim().min(2), note: z.string().trim().max(2000).default('') }), req.body)
  const c = await owned('hr_cases', req.params.id, me.workspaceId, 'Case')
  const [actor] = await query<{ name: string }>('SELECT name FROM employees WHERE id = $1', [me.employeeId])
  await query(`INSERT INTO case_events (case_id, date, title, by_name, note, position) VALUES ($1,current_date,$2,$3,$4,(SELECT COALESCE(max(position),0)+1 FROM case_events WHERE case_id = $1))`, [
    c.id,
    b.title,
    actor!.name,
    b.note,
  ])
  res.status(201).json(await fullCase(c.id as string))
})

caseRouter.post('/:id/access', async (req, res) => {
  const me = auth(req)
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body)
  await owned('hr_cases', req.params.id, me.workspaceId, 'Case')
  await query(`INSERT INTO case_access_log (case_id, user_id, action, reason) VALUES ($1,$2,'revealed_identity',$3)`, [req.params.id, me.userId, reason])
  await audit(req, 'case.identity_revealed', 'hr_case', req.params.id, { reason })
  res.status(201).json({ ok: true })
})

caseRouter.get('/:id/access-log', async (req, res) => {
  const me = auth(req)
  await owned('hr_cases', req.params.id, me.workspaceId, 'Case')
  const rows = await query(
    `SELECT l.action, l.reason, l.created_at, e.name FROM case_access_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN employees e ON e.id = u.employee_id WHERE l.case_id = $1 ORDER BY l.created_at DESC`,
    [req.params.id],
  )
  res.json(rows.map((r) => ({ action: r.action, reason: r.reason, at: r.created_at, by: r.name })))
})

governanceRouter.use('/cases', caseRouter)

// ── Offboarding ─────────────────────────────────────────────────────
async function fullOffboarding(id: string) {
  const [o] = await query('SELECT * FROM offboardings WHERE id = $1', [id])
  const assets = await query('SELECT * FROM offboarding_assets WHERE offboarding_id = $1 ORDER BY position', [id])
  return toOffboarding(o!, assets)
}

governanceRouter.get('/offboardings', requireRole(...LEADERS, 'finance'), async (req, res) => {
  const rows = await query(
    `SELECT o.*, COALESCE((SELECT json_agg(a ORDER BY a.position) FROM offboarding_assets a WHERE a.offboarding_id = o.id), '[]') AS assets
       FROM offboardings o WHERE o.workspace_id = $1 ORDER BY o.submitted DESC`,
    [auth(req).workspaceId],
  )
  res.json(rows.map((o) => toOffboarding(o, o.assets)))
})

governanceRouter.post('/offboardings', requireRole(...ADMIN, 'manager'), async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({ employeeId: z.string(), reason: z.enum(['Resignation', 'Contract End', 'Termination', 'Retirement']), submitted: z.string().regex(isoDate), lastDay: z.string().regex(isoDate) }),
    req.body,
  )
  if (b.lastDay < b.submitted) throw badRequest('Last working day must be after the submission date')
  const emp = await owned('employees', b.employeeId, me.workspaceId, 'Employee')
  const notice = Math.round((new Date(b.lastDay).getTime() - new Date(b.submitted).getTime()) / 86_400_000)
  const id = await tx(async (db) => {
    const [o] = (
      await db.query(`INSERT INTO offboardings (workspace_id, employee_id, reason, submitted, last_day, notice_days, final_dues_kes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [
        me.workspaceId,
        b.employeeId,
        b.reason,
        b.submitted,
        b.lastDay,
        notice,
        emp.salary_kes,
      ])
    ).rows
    for (const [i, name] of ['Laptop', 'Access card', 'SIM card', 'Email account', 'GitHub access', 'Slack access'].entries()) {
      await db.query('INSERT INTO offboarding_assets (offboarding_id, name, position) VALUES ($1,$2,$3)', [o.id, name, i])
    }
    await db.query(`UPDATE employees SET status = 'Notice Period', updated_at = now() WHERE id = $1`, [b.employeeId])
    return o.id as string
  })
  await audit(req, 'offboarding.started', 'offboarding', id)
  res.status(201).json(await fullOffboarding(id))
})

governanceRouter.patch('/offboardings/:id', requireRole(...ADMIN, 'manager', 'finance'), async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({
      handover: z.boolean().optional(),
      exitInterview: z.boolean().optional(),
      progress: z.number().int().min(0).max(100).optional(),
      assets: z.array(z.object({ name: z.string(), returned: z.boolean() })).optional(),
    }),
    req.body,
  )
  const o = await owned('offboardings', String(req.params.id), me.workspaceId, 'Offboarding')
  await tx(async (db) => {
    await db.query('UPDATE offboardings SET handover = COALESCE($2, handover), exit_interview = COALESCE($3, exit_interview), progress = COALESCE($4, progress) WHERE id = $1', [
      o.id,
      b.handover ?? null,
      b.exitInterview ?? null,
      b.progress ?? null,
    ])
    for (const a of b.assets ?? []) await db.query('UPDATE offboarding_assets SET returned = $3 WHERE offboarding_id = $1 AND name = $2', [o.id, a.name, a.returned])
  })
  res.json(await fullOffboarding(o.id as string))
})
