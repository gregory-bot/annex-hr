import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../../db/pool'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, parse } from '../../lib/http'
import { isLeader } from '../../lib/roles'
import { auth } from '../../middleware/auth'
import { toTimesheet } from '../workspace/repository'
import { isoDate, owned } from './helpers'

export const timesheetsRouter = Router()

async function sheet(id: string) {
  const [t] = await query('SELECT * FROM timesheets WHERE id = $1', [id])
  const entries = await query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY position', [id])
  return toTimesheet(t!, entries)
}

const canApprove = (role: string) => isLeader(role as never) || role === 'finance'

timesheetsRouter.get('/timesheets', async (req, res) => {
  const me = auth(req)
  const all = canApprove(me.role) && req.query.mine !== 'true'
  const rows = await query(
    `SELECT t.*, COALESCE((SELECT json_agg(e ORDER BY e.position) FROM timesheet_entries e WHERE e.timesheet_id = t.id), '[]') AS entries
       FROM timesheets t WHERE t.workspace_id = $1 AND ($2::text IS NULL OR t.employee_id = $2) ORDER BY t.week_start DESC`,
    [me.workspaceId, all ? null : me.employeeId],
  )
  res.json(rows.map((r) => toTimesheet(r, r.entries)))
})

const entries = z.array(z.object({ project: z.string().trim().min(1), billable: z.boolean(), hours: z.array(z.number().min(0).max(24)).length(7) })).max(20)

/** Create or replace the caller's timesheet for a week (only while Draft/Rejected). */
timesheetsRouter.put('/timesheets/week/:week', async (req, res) => {
  const me = auth(req)
  if (!isoDate.test(req.params.week)) throw badRequest('Week must be an ISO date (the Monday)')
  const b = parse(z.object({ entries, rate: z.number().nonnegative().optional() }), req.body)
  const id = await tx(async (db) => {
    const [existing] = (await db.query('SELECT * FROM timesheets WHERE employee_id = $1 AND week_start = $2', [me.employeeId, req.params.week])).rows
    if (existing && !['Draft', 'Rejected'].includes(existing.status)) throw badRequest(`Timesheet is ${existing.status.toLowerCase()} and can no longer be edited`)
    const tid: string =
      existing?.id ??
      (await db.query(`INSERT INTO timesheets (workspace_id, employee_id, week_start, status, rate_kes) VALUES ($1,$2,$3,'Draft',$4) RETURNING id`, [me.workspaceId, me.employeeId, req.params.week, b.rate ?? 0])).rows[0].id
    if (existing) await db.query(`UPDATE timesheets SET status = 'Draft' WHERE id = $1`, [tid])
    await db.query('DELETE FROM timesheet_entries WHERE timesheet_id = $1', [tid])
    for (const [i, e] of b.entries.entries()) {
      await db.query('INSERT INTO timesheet_entries (timesheet_id, project, billable, hours, position) VALUES ($1,$2,$3,$4,$5)', [tid, e.project, e.billable, e.hours, i])
    }
    return tid
  })
  res.json(await sheet(id))
})

timesheetsRouter.post('/timesheets/:id/submit', async (req, res) => {
  const me = auth(req)
  const t = await owned('timesheets', req.params.id, me.workspaceId, 'Timesheet')
  if (t.employee_id !== me.employeeId) throw forbidden()
  if (!['Draft', 'Rejected'].includes(t.status as string)) throw badRequest('Already submitted')
  await query(`UPDATE timesheets SET status = 'Pending' WHERE id = $1`, [t.id])
  await audit(req, 'timesheet.submitted', 'timesheet', t.id as string)
  res.json(await sheet(t.id as string))
})

timesheetsRouter.post('/timesheets/:id/decision', async (req, res) => {
  const me = auth(req)
  if (!canApprove(me.role)) throw forbidden()
  const { decision, comment } = parse(z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(500).optional() }), req.body)
  const t = await owned('timesheets', req.params.id, me.workspaceId, 'Timesheet')
  if (t.status !== 'Pending') throw badRequest('Only pending timesheets can be decided')
  await query('UPDATE timesheets SET status = $2, approved_by = $3, approved_at = now(), comment = $4 WHERE id = $1', [t.id, decision === 'approve' ? 'Approved' : 'Rejected', me.employeeId, comment ?? null])
  await audit(req, `timesheet.${decision}`, 'timesheet', t.id as string)
  res.json(await sheet(t.id as string))
})
