import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../../db/pool'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, parse } from '../../lib/http'
import { ADMIN, isLeader } from '../../lib/roles'
import { auth, requireRole } from '../../middleware/auth'
import { toLeave } from '../workspace/repository'
import { isoDate, owned } from './helpers'

export const leaveRouter = Router()

const LEAVE_TYPES = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study'] as const

/** Working days between two ISO dates (inclusive), excluding weekends and the given holidays. */
function workingDays(start: string, end: string, holidays: Set<string>) {
  let n = 0
  for (let d = new Date(start); d <= new Date(end); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6 && !holidays.has(d.toISOString().slice(0, 10))) n++
  }
  return n
}

leaveRouter.get('/leave-requests', async (req, res) => {
  const me = auth(req)
  const mine = req.query.mine === 'true' || !isLeader(me.role)
  const rows = await query(
    `SELECT * FROM leave_requests WHERE workspace_id = $1 AND ($2::text IS NULL OR employee_id = $2) ORDER BY created_at DESC`,
    [me.workspaceId, mine ? me.employeeId : null],
  )
  res.json(rows.map(toLeave))
})

leaveRouter.post('/leave-requests', async (req, res) => {
  const me = auth(req)
  const b = parse(
    z.object({
      type: z.enum(LEAVE_TYPES),
      start: z.string().regex(isoDate),
      end: z.string().regex(isoDate),
      reason: z.string().trim().max(500).default(''),
      handoverTo: z.string().optional(),
      handoverNotes: z.boolean().default(false),
    }),
    req.body,
  )
  if (b.end < b.start) throw badRequest('End date must be on or after the start date')
  const [ws] = await query<{ country: string }>('SELECT country FROM workspaces WHERE id = $1', [me.workspaceId])
  const hol = await query<{ date: string }>('SELECT date FROM holidays WHERE workspace_id = $1 AND country = $2 AND date BETWEEN $3 AND $4', [me.workspaceId, ws!.country, b.start, b.end])
  const days = workingDays(b.start, b.end, new Set(hol.map((h) => h.date)))
  if (days === 0) throw badRequest('The selected dates contain no working days')
  if (b.handoverTo) await owned('employees', b.handoverTo, me.workspaceId, 'Handover colleague')

  const [row] = await query(
    `INSERT INTO leave_requests (workspace_id, employee_id, type, start_date, end_date, days, reason, status, stage, handover_to, handover_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending','Manager',$8,$9) RETURNING *`,
    [me.workspaceId, me.employeeId, b.type, b.start, b.end, days, b.reason, b.handoverTo ?? null, b.handoverNotes],
  )
  // Notify the line manager.
  const [emp] = await query<{ name: string; manager_id: string | null }>('SELECT name, manager_id FROM employees WHERE id = $1', [me.employeeId])
  await query(`INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1, $2, 'approval', $3, $4, '/app/leave')`, [
    me.workspaceId,
    emp!.manager_id,
    `${emp!.name} requested ${days} day${days === 1 ? '' : 's'} of ${b.type.toLowerCase()} leave`,
    'Awaiting your approval as line manager.',
  ])
  await audit(req, 'leave.requested', 'leave_request', row!.id as string, { days })
  res.status(201).json(toLeave(row!))
})

/**
 * Approval routing: Manager → HR → CEO (CEO only for >10 days, Maternity or Study).
 * Approving advances one stage; rejecting ends the request.
 */
leaveRouter.post('/leave-requests/:id/decision', async (req, res) => {
  const me = auth(req)
  const { decision } = parse(z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(500).optional() }), req.body)
  const result = await tx(async (db) => {
    const row = await owned('leave_requests', req.params.id, me.workspaceId, 'Leave request', db)
    if (row.status !== 'Pending') throw badRequest(`This request is already ${String(row.status).toLowerCase()}`)
    if (row.employee_id === me.employeeId) throw forbidden('You cannot approve your own leave')

    const stage = row.stage as string
    const canAct = (stage === 'Manager' && isLeader(me.role)) || (stage === 'HR' && ADMIN.includes(me.role)) || (stage === 'CEO' && ['ceo', 'super_admin'].includes(me.role))
    if (!canAct) throw forbidden(`Only the ${stage === 'HR' ? 'HR team' : stage === 'CEO' ? 'CEO' : 'line manager'} can act at this stage`)

    const needsCeo = Number(row.days) > 10 || ['Maternity', 'Study'].includes(row.type as string)
    let status = 'Pending'
    let next = stage
    if (decision === 'reject') [status, next] = ['Rejected', 'Complete']
    else if (stage === 'Manager') next = 'HR'
    else if (stage === 'HR' && needsCeo) next = 'CEO'
    else [status, next] = ['Approved', 'Complete']

    const [updated] = await db.query(
      `UPDATE leave_requests SET status = $3, stage = $4, decided_by = CASE WHEN $3 <> 'Pending' THEN $5 ELSE decided_by END, decided_at = CASE WHEN $3 <> 'Pending' THEN now() ELSE decided_at END
        WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [req.params.id, me.workspaceId, status, next, me.employeeId],
    ).then((r) => r.rows)
    if (status !== 'Pending') {
      await db.query(`INSERT INTO notifications (workspace_id, recipient_id, type, title, body, href) VALUES ($1, $2, 'leave', $3, $4, '/app/leave?tab=mine')`, [
        me.workspaceId,
        row.employee_id,
        `Your ${String(row.type).toLowerCase()} leave was ${status.toLowerCase()}`,
        `${row.start_date} → ${row.end_date} · ${row.days} days`,
      ])
    }
    return updated
  })
  await audit(req, `leave.${decision}`, 'leave_request', req.params.id)
  res.json(toLeave(result))
})

// ── Holidays ────────────────────────────────────────────────────────
leaveRouter.get('/holidays', async (req, res) => {
  res.json(await query('SELECT date, name, country FROM holidays WHERE workspace_id = $1 ORDER BY date', [auth(req).workspaceId]))
})

leaveRouter.post('/holidays', requireRole(...ADMIN), async (req, res) => {
  const b = parse(z.object({ date: z.string().regex(isoDate), name: z.string().trim().min(2), country: z.string().trim().min(2) }), req.body)
  const [row] = await query('INSERT INTO holidays (workspace_id, date, name, country) VALUES ($1,$2,$3,$4) RETURNING date, name, country', [auth(req).workspaceId, b.date, b.name, b.country])
  res.status(201).json(row)
})

// ── Attendance ──────────────────────────────────────────────────────
leaveRouter.get('/attendance/me', async (req, res) => {
  const me = auth(req)
  const rows = await query('SELECT * FROM attendance_records WHERE employee_id = $1 ORDER BY clock_in DESC LIMIT 60', [me.employeeId])
  res.json(rows.map((r) => ({ id: r.id, date: r.work_date, clockIn: r.clock_in, clockOut: r.clock_out, method: r.method })))
})

const geo = z.object({ method: z.enum(['Web', 'Mobile', 'Biometric']).default('Web'), latitude: z.number().optional(), longitude: z.number().optional() })

leaveRouter.post('/attendance/clock-in', async (req, res) => {
  const me = auth(req)
  const b = parse(geo, req.body ?? {})
  const [open] = await query('SELECT id FROM attendance_records WHERE employee_id = $1 AND clock_out IS NULL', [me.employeeId])
  if (open) throw badRequest('You are already clocked in')
  const [row] = await query(
    `INSERT INTO attendance_records (workspace_id, employee_id, work_date, clock_in, method, latitude, longitude) VALUES ($1,$2,current_date,now(),$3,$4,$5) RETURNING *`,
    [me.workspaceId, me.employeeId, b.method, b.latitude ?? null, b.longitude ?? null],
  )
  res.status(201).json({ id: row!.id, clockIn: row!.clock_in, method: row!.method })
})

leaveRouter.post('/attendance/clock-out', async (req, res) => {
  const me = auth(req)
  const [row] = await query('UPDATE attendance_records SET clock_out = now() WHERE employee_id = $1 AND clock_out IS NULL RETURNING *', [me.employeeId])
  if (!row) throw badRequest('You are not clocked in')
  res.json({ id: row.id, clockIn: row.clock_in, clockOut: row.clock_out })
})
