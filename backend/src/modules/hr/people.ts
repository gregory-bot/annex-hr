import { Router } from 'express'
import { z } from 'zod'
import { query } from '../../db/pool'
import { buildUpdate } from '../../db/sql'
import { audit } from '../../lib/audit'
import { forbidden, notFound, parse } from '../../lib/http'
import { ADMIN, canSeePay, LEADERS } from '../../lib/roles'
import { auth, requireRole } from '../../middleware/auth'
import { toDepartment, toEmployee } from '../workspace/repository'
import { isoDate, owned } from './helpers'

export const peopleRouter = Router()

// ── Employees ───────────────────────────────────────────────────────
peopleRouter.get('/employees', async (req, res) => {
  const me = auth(req)
  const { q, departmentId, status } = parse(z.object({ q: z.string().optional(), departmentId: z.string().optional(), status: z.string().optional() }), req.query)
  const rows = await query(
    `SELECT * FROM employees
      WHERE workspace_id = $1
        AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%' OR title ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR department_id = $3)
        AND ($4::text IS NULL OR status = $4)
      ORDER BY employee_no`,
    [me.workspaceId, q ?? null, departmentId ?? null, status ?? null],
  )
  const seePay = canSeePay(me.role)
  res.json(rows.map(toEmployee).map((e) => (seePay || e.id === me.employeeId ? e : { ...e, salaryKES: 0 })))
})

peopleRouter.get('/employees/:id', async (req, res) => {
  const me = auth(req)
  const e = toEmployee(await owned('employees', req.params.id, me.workspaceId, 'Employee'))
  res.json(canSeePay(me.role) || e.id === me.employeeId ? e : { ...e, salaryKES: 0 })
})

const employeeSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().optional(),
  title: z.string().trim().min(2),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  role: z.enum(['company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo']).default('employee'),
  employmentType: z.enum(['Full-time', 'Contract', 'Consultant', 'Intern', 'Part-time']),
  status: z.enum(['Active', 'Probation', 'On Leave', 'Onboarding', 'Notice Period', 'Exited']).default('Onboarding'),
  gender: z.enum(['Female', 'Male']).optional(),
  location: z.string().optional(),
  startDate: z.string().regex(isoDate),
  salaryKES: z.number().nonnegative().default(0),
  kraPin: z.string().optional(),
  nationalId: z.string().optional(),
})

peopleRouter.post('/employees', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  const b = parse(employeeSchema, req.body)
  const [{ n }] = (await query<{ n: number }>('SELECT count(*)::int AS n FROM employees WHERE workspace_id = $1', [me.workspaceId])) as [{ n: number }]
  const [ws] = await query<{ slug: string }>('SELECT slug FROM workspaces WHERE id = $1', [me.workspaceId])
  const [row] = await query(
    `INSERT INTO employees (workspace_id, employee_no, name, email, phone, title, department_id, manager_id, role, employment_type, status, gender, location, start_date, salary_kes, kra_pin, national_id, probation_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, $14::date + 90) RETURNING *`,
    [me.workspaceId, `${ws!.slug.slice(0, 3).toUpperCase()}-${1001 + n}`, b.name, b.email, b.phone ?? null, b.title, b.departmentId ?? null, b.managerId ?? null, b.role, b.employmentType, b.status, b.gender ?? null, b.location ?? null, b.startDate, b.salaryKES, b.kraPin ?? null, b.nationalId ?? null],
  )
  await audit(req, 'employee.created', 'employee', row!.id as string)
  res.status(201).json(toEmployee(row!))
})

const EMPLOYEE_COLUMNS = ['name', 'phone', 'title', 'department_id', 'manager_id', 'role', 'employment_type', 'status', 'gender', 'location', 'salary_kes', 'probation_end', 'performance', 'potential', 'onboarding_progress', 'kra_pin', 'national_id', 'birthday']

peopleRouter.patch('/employees/:id', async (req, res) => {
  const me = auth(req)
  await owned('employees', req.params.id, me.workspaceId, 'Employee')
  const self = req.params.id === me.employeeId
  if (!self && !ADMIN.includes(me.role)) throw forbidden()
  // Employees may only edit their own contact details.
  const allowed = self && !ADMIN.includes(me.role) ? ['phone', 'birthday'] : EMPLOYEE_COLUMNS
  const patch = { ...(req.body as Record<string, unknown>) }
  if ('salaryKES' in patch) (patch.salaryKes = patch.salaryKES), delete patch.salaryKES
  const upd = buildUpdate(patch, allowed, 3)
  if (!upd) throw notFound('Updatable fields')
  const [row] = await query(`UPDATE employees SET ${upd.sql}, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *`, [req.params.id, me.workspaceId, ...upd.params])
  await audit(req, 'employee.updated', 'employee', req.params.id, { fields: Object.keys(patch) })
  res.json(toEmployee(row!))
})

// ── Departments ─────────────────────────────────────────────────────
peopleRouter.get('/departments', async (req, res) => {
  res.json((await query('SELECT * FROM departments WHERE workspace_id = $1 ORDER BY name', [auth(req).workspaceId])).map(toDepartment))
})

peopleRouter.post('/departments', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  const b = parse(z.object({ name: z.string().trim().min(2), headId: z.string().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#C1121F'), budgetKES: z.number().nonnegative().default(0) }), req.body)
  if (b.headId) await owned('employees', b.headId, me.workspaceId, 'Department head')
  const [row] = await query('INSERT INTO departments (workspace_id, name, head_id, color, budget_kes) VALUES ($1,$2,$3,$4,$5) RETURNING *', [me.workspaceId, b.name, b.headId ?? null, b.color, b.budgetKES])
  await audit(req, 'department.created', 'department', row!.id as string)
  res.status(201).json(toDepartment(row!))
})

peopleRouter.patch('/departments/:id', requireRole(...ADMIN), async (req, res) => {
  const me = auth(req)
  await owned('departments', String(req.params.id), me.workspaceId, 'Department')
  const patch = { ...(req.body as Record<string, unknown>) }
  if ('budgetKES' in patch) (patch.budgetKes = patch.budgetKES), delete patch.budgetKES
  const upd = buildUpdate(patch, ['name', 'head_id', 'color', 'budget_kes'], 3)
  if (!upd) throw notFound('Updatable fields')
  const [row] = await query(`UPDATE departments SET ${upd.sql} WHERE id = $1 AND workspace_id = $2 RETURNING *`, [req.params.id, me.workspaceId, ...upd.params])
  res.json(toDepartment(row!))
})

// ── Org overview for leaders ────────────────────────────────────────
peopleRouter.get('/org-chart', requireRole(...LEADERS, 'finance'), async (req, res) => {
  const rows = await query('SELECT id, name, title, manager_id, department_id FROM employees WHERE workspace_id = $1 AND status <> $2 ORDER BY employee_no', [auth(req).workspaceId, 'Exited'])
  res.json(rows.map((r) => ({ id: r.id, name: r.name, title: r.title, managerId: r.manager_id, departmentId: r.department_id })))
})
