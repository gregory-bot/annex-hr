import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../../db/pool'
import { audit } from '../../lib/audit'
import { badRequest, forbidden, parse } from '../../lib/http'
import { PAYROLL } from '../../lib/roles'
import { auth, requireRole } from '../../middleware/auth'
import { toPayrollRun } from '../workspace/repository'
import { owned } from './helpers'

export const payrollRouter = Router()
payrollRouter.use('/payroll-runs', requireRole(...PAYROLL))

async function runWithApprovals(id: string) {
  const [run] = await query('SELECT * FROM payroll_runs WHERE id = $1', [id])
  const approvals = await query('SELECT * FROM payroll_approvals WHERE payroll_run_id = $1 ORDER BY step', [id])
  return toPayrollRun(run!, approvals)
}

payrollRouter.get('/payroll-runs', async (req, res) => {
  const runs = await query(
    `SELECT r.*, COALESCE((SELECT json_agg(a ORDER BY a.step) FROM payroll_approvals a WHERE a.payroll_run_id = r.id), '[]') AS approvals
       FROM payroll_runs r WHERE r.workspace_id = $1 ORDER BY r.position, r.created_at DESC`,
    [auth(req).workspaceId],
  )
  res.json(runs.map((r) => toPayrollRun(r, r.approvals)))
})

// ── Kenyan statutory deductions (2026) ──────────────────────────────
const PAYE_BANDS: [number, number][] = [
  [24_000, 0.1],
  [8_333, 0.25],
  [467_667, 0.3],
  [300_000, 0.325],
  [Infinity, 0.35],
]
const PERSONAL_RELIEF = 2_400

export function statutory(gross: number) {
  const nssf = Math.min(gross * 0.06, 4_320)
  const shif = Math.max(gross * 0.0275, 300)
  const housingLevy = gross * 0.015
  // NSSF, SHIF and the Affordable Housing Levy are deductible before PAYE.
  let taxable = Math.max(0, gross - nssf - shif - housingLevy)
  let paye = 0
  for (const [width, rate] of PAYE_BANDS) {
    const slice = Math.min(taxable, width)
    paye += slice * rate
    taxable -= slice
    if (taxable <= 0) break
  }
  paye = Math.max(0, paye - PERSONAL_RELIEF)
  return { paye: Math.round(paye), nssf: Math.round(nssf), shif: Math.round(shif), housingLevy: Math.round(housingLevy), net: Math.round(gross - paye - nssf - shif - housingLevy) }
}

/** Generates a draft payroll run from active employees' salaries. */
payrollRouter.post('/payroll-runs', async (req, res) => {
  const me = auth(req)
  const { period, bonuses } = parse(z.object({ period: z.string().trim().min(3), bonuses: z.number().nonnegative().default(0) }), req.body)
  const emps = await query<{ salary_kes: number }>(`SELECT salary_kes FROM employees WHERE workspace_id = $1 AND status <> 'Exited' AND employment_type <> 'Consultant'`, [me.workspaceId])
  const t = emps.reduce(
    (acc, e) => {
      const s = statutory(e.salary_kes)
      return { gross: acc.gross + e.salary_kes, paye: acc.paye + s.paye, nssf: acc.nssf + s.nssf, shif: acc.shif + s.shif, housingLevy: acc.housingLevy + s.housingLevy, net: acc.net + s.net }
    },
    { gross: 0, paye: 0, nssf: 0, shif: 0, housingLevy: 0, net: 0 },
  )
  const [preparer] = await query<{ name: string }>('SELECT name FROM employees WHERE id = $1', [me.employeeId])
  const id = await tx(async (db) => {
    const [run] = await db
      .query(
        `INSERT INTO payroll_runs (workspace_id, period, status, employees, gross, net, paye, shif, nssf, housing_levy, bonuses, prepared_by, position)
         VALUES ($1,$2,'Pending Approval',$3,$4,$5,$6,$7,$8,$9,$10,$11,-1) RETURNING id`,
        [me.workspaceId, period, emps.length, t.gross, t.net + bonuses, t.paye, t.shif, t.nssf, t.housingLevy, bonuses, preparer!.name],
      )
      .then((r) => r.rows)
    const chain = await db.query(
      `SELECT role, name FROM (
         SELECT 0 AS step, 'Finance' AS role, (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'finance' ORDER BY employee_no LIMIT 1) AS name
         UNION ALL SELECT 1, 'HR', (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'company_admin' ORDER BY employee_no LIMIT 1)
         UNION ALL SELECT 2, 'CEO', (SELECT name FROM employees WHERE workspace_id = $1 AND role = 'ceo' ORDER BY employee_no LIMIT 1)
       ) c ORDER BY step`,
      [me.workspaceId],
    )
    for (const [step, a] of chain.rows.entries()) {
      await db.query('INSERT INTO payroll_approvals (payroll_run_id, step, role, name, status) VALUES ($1,$2,$3,$4,$5)', [run.id, step, a.role, a.name ?? '—', 'Pending'])
    }
    return run.id as string
  })
  await audit(req, 'payroll.generated', 'payroll_run', id, { period })
  res.status(201).json(await runWithApprovals(id))
})

const STEP_ROLE: Record<string, string[]> = { Finance: ['finance'], HR: ['company_admin', 'hr_officer'], CEO: ['ceo'] }

/** Signs the next pending approval step if the caller holds that role. Fully approved runs become Approved. */
payrollRouter.post('/payroll-runs/:id/approve', async (req, res) => {
  const me = auth(req)
  await tx(async (db) => {
    const run = await owned('payroll_runs', req.params.id, me.workspaceId, 'Payroll run', db)
    if (run.status !== 'Pending Approval') throw badRequest(`Payroll is ${String(run.status).toLowerCase()}`)
    const [step] = (await db.query(`SELECT * FROM payroll_approvals WHERE payroll_run_id = $1 AND status = 'Pending' ORDER BY step LIMIT 1`, [run.id])).rows
    if (!step) throw badRequest('Nothing left to approve')
    const allowed = [...(STEP_ROLE[step.role as string] ?? []), 'super_admin']
    if (!allowed.includes(me.role)) throw forbidden(`Waiting for ${step.role} approval`)
    await db.query(`UPDATE payroll_approvals SET status = 'Approved', decided_at = current_date WHERE id = $1`, [step.id])
    const [{ left }] = (await db.query(`SELECT count(*)::int AS left FROM payroll_approvals WHERE payroll_run_id = $1 AND status = 'Pending'`, [run.id])).rows
    if (left === 0) await db.query(`UPDATE payroll_runs SET status = 'Approved' WHERE id = $1`, [run.id])
  })
  await audit(req, 'payroll.approved', 'payroll_run', req.params.id)
  res.json(await runWithApprovals(req.params.id))
})

/** Placeholder for the Odoo integration: marks an approved run as synced. */
payrollRouter.post('/payroll-runs/:id/sync-odoo', async (req, res) => {
  const me = auth(req)
  const run = await owned('payroll_runs', req.params.id, me.workspaceId, 'Payroll run')
  if (!['Approved', 'Paid'].includes(run.status as string)) throw badRequest('Payroll must be fully approved before syncing to Odoo')
  // TODO: post the journal entry to Odoo via XML-RPC / JSON-RPC.
  await query(`UPDATE payroll_runs SET status = 'Synced to Odoo', odoo_synced_at = now() WHERE id = $1`, [run.id])
  await audit(req, 'payroll.synced_odoo', 'payroll_run', req.params.id)
  res.json(await runWithApprovals(req.params.id))
})

payrollRouter.get('/payroll/preview/:employeeId', requireRole(...PAYROLL), async (req, res) => {
  const e = await owned('employees', String(req.params.employeeId), auth(req).workspaceId, 'Employee')
  res.json({ employeeId: e.id, gross: e.salary_kes, ...statutory(e.salary_kes as number) })
})
