import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import type pg from 'pg'
import { workspaceData } from '@annex/shared/seed'
import { env } from '../config/env'
import { pool, tx } from './pool'
import { insertMany } from './sql'

/**
 * Loads the deterministic demo workspaces (Umba, Annex Technologies, CHQI).
 * Idempotent: existing demo workspaces are skipped unless --force is passed,
 * in which case they are deleted (cascading) and recreated.
 */
export async function seed({ force = false } = {}) {
  const passwordHash = await bcrypt.hash(env.SEED_DEFAULT_PASSWORD, 10)

  for (const data of Object.values(workspaceData)) {
    const ws = data.workspace
    await tx(async (db) => {
      const existing = await db.query('SELECT id FROM workspaces WHERE slug = $1', [ws.slug])
      if (existing.rowCount && !force) {
        console.log(`• ${ws.name} already seeded — skipping (use --force to recreate)`)
        return
      }
      if (existing.rowCount) await db.query('DELETE FROM workspaces WHERE id = $1', [ws.id])
      await seedWorkspace(db, data, passwordHash)
      console.log(`✓ Seeded ${ws.name} (${ws.domain}) — ${data.employees.length} employees`)
    })
  }
}

async function seedWorkspace(db: pg.PoolClient, d: (typeof workspaceData)[keyof typeof workspaceData], passwordHash: string) {
  const ws = d.workspace
  const W = ws.id

  await insertMany(db, 'workspaces', [
    {
      id: W,
      slug: ws.slug,
      name: ws.name,
      industry: ws.industry,
      country: ws.country,
      size: ws.size,
      domain: ws.domain,
      logo_text: ws.logoText,
      plan: ws.plan,
      founded: ws.founded,
      email_verified_at: new Date(),
    },
  ])
  await insertMany(db, 'offices', ws.offices.map((o) => ({ workspace_id: W, ...o })))

  // Departments first without heads (heads reference employees, inserted next).
  await insertMany(db, 'departments', d.departments.map((x) => ({ id: x.id, workspace_id: W, name: x.name, color: x.color, budget_kes: x.budgetKES })))

  await insertMany(
    db,
    'employees',
    d.employees.map((e) => ({
      id: e.id,
      workspace_id: W,
      employee_no: e.employeeNo,
      name: e.name,
      email: e.email,
      phone: e.phone,
      photo: e.photo ?? null,
      title: e.title,
      department_id: e.departmentId,
      manager_id: e.managerId ?? null,
      role: e.role,
      employment_type: e.employmentType,
      status: e.status,
      gender: e.gender,
      location: e.location,
      start_date: e.startDate,
      birthday: e.birthday,
      salary_kes: e.salaryKES,
      probation_end: e.probationEnd ?? null,
      performance: e.performance,
      potential: e.potential,
      onboarding_progress: e.onboardingProgress,
      kra_pin: e.kraPin,
      national_id: e.nationalId,
    })),
  )
  for (const dept of d.departments) {
    if (dept.headId) await db.query('UPDATE departments SET head_id = $1 WHERE id = $2', [dept.headId, dept.id])
  }

  await insertMany(
    db,
    'users',
    d.employees.map((e) => ({ id: `usr-${e.id}`, workspace_id: W, employee_id: e.id, email: e.email.toLowerCase(), password_hash: passwordHash, role: e.role })),
  )

  await insertMany(db, 'holidays', d.holidays.map((h) => ({ workspace_id: W, ...h })))
  await insertMany(db, 'onboarding_tasks', d.onboardingTasks.map((t, i) => ({ workspace_id: W, ...t, position: i })))

  await insertMany(
    db,
    'leave_requests',
    d.leaveRequests.map((l) => ({
      id: l.id,
      workspace_id: W,
      employee_id: l.employeeId,
      type: l.type,
      start_date: l.start,
      end_date: l.end,
      days: l.days,
      reason: l.reason,
      status: l.status,
      stage: l.stage,
      submitted_at: l.submitted,
      handover_to: l.handoverTo ?? null,
      handover_notes: l.handoverNotes ?? false,
    })),
  )

  await insertMany(
    db,
    'payroll_runs',
    d.payrollRuns.map((p, i) => ({
      id: p.id,
      workspace_id: W,
      period: p.period,
      status: p.status,
      employees: p.employees,
      gross: p.gross,
      net: p.net,
      paye: p.paye,
      shif: p.shif,
      nssf: p.nssf,
      housing_levy: p.housingLevy,
      bonuses: p.bonuses,
      prepared_by: p.preparedBy,
      position: i,
    })),
  )
  await insertMany(
    db,
    'payroll_approvals',
    d.payrollRuns.flatMap((p) => p.approvals.map((a, step) => ({ payroll_run_id: p.id, step, role: a.role, name: a.name, status: a.status, decided_at: a.at ?? null }))),
  )

  await insertMany(
    db,
    'policies',
    d.policies.map((p) => ({
      id: p.id,
      workspace_id: W,
      title: p.title,
      category: p.category,
      version: p.version,
      updated_on: p.updated,
      owner: p.owner,
      mandatory: p.mandatory,
      acknowledged: p.acknowledged,
      summary: p.summary,
    })),
  )
  await insertMany(db, 'policy_versions', d.policies.flatMap((p) => p.history.map((h, i) => ({ policy_id: p.id, ...h, position: i }))))

  await insertMany(
    db,
    'compliance_documents',
    d.complianceDocs.map((c) => ({ id: c.id, workspace_id: W, employee_id: c.employeeId, type: c.type, number: c.number, issued: c.issued, expires: c.expires ?? null, status: c.status })),
  )

  await insertMany(
    db,
    'hr_cases',
    d.cases.map((c) => ({
      id: c.id,
      workspace_id: W,
      ref: c.ref,
      type: c.type,
      subject_id: c.subjectId,
      reported_by: c.reportedBy,
      opened: c.opened,
      status: c.status,
      severity: c.severity,
      assigned_to: c.assignedTo,
      confidential: c.confidential,
      summary: c.summary,
    })),
  )
  await insertMany(db, 'case_events', d.cases.flatMap((c) => c.timeline.map((t, i) => ({ case_id: c.id, date: t.date, title: t.title, by_name: t.by, note: t.note, position: i }))))
  await insertMany(db, 'case_evidence', d.cases.flatMap((c) => c.evidence.map((e) => ({ case_id: c.id, ...e }))))

  await insertMany(
    db,
    'offboardings',
    d.offboardings.map((o) => ({
      id: o.id,
      workspace_id: W,
      employee_id: o.employeeId,
      reason: o.reason,
      submitted: o.submitted,
      last_day: o.lastDay,
      notice_days: o.noticeDays,
      progress: Math.min(100, o.progress),
      handover: o.handover,
      exit_interview: o.exitInterview,
      final_dues_kes: o.finalDuesKES,
    })),
  )
  await insertMany(db, 'offboarding_assets', d.offboardings.flatMap((o) => o.assets.map((a, i) => ({ offboarding_id: o.id, ...a, position: i }))))

  await insertMany(
    db,
    'timesheets',
    d.timesheets.map((t) => ({ id: t.id, workspace_id: W, employee_id: t.employeeId, week_start: t.week, status: t.status, rate_kes: t.rate })),
  )
  await insertMany(
    db,
    'timesheet_entries',
    d.timesheets.flatMap((t) => t.entries.map((e, i) => ({ timesheet_id: t.id, project: e.project, billable: e.billable, hours: e.hours, position: i }))),
  )

  await insertMany(
    db,
    'surveys',
    d.surveys.map((s, i) => ({
      id: `${W}-${s.id}`,
      workspace_id: W,
      title: s.title,
      status: s.status,
      responses: s.responses,
      audience: s.audience,
      engagement: s.engagement,
      enps: s.enps,
      closes: s.closes,
      anonymous: s.anonymous,
      position: i,
    })),
  )
  await insertMany(db, 'kpis', d.kpis.map((k, i) => ({ id: `${W}-${k.id}`, workspace_id: W, perspective: k.perspective, name: k.name, target: k.target, actual: k.actual, unit: k.unit, weight: k.weight, owner: k.owner, position: i })))

  await insertMany(
    db,
    'documents',
    d.documents.map((doc) => ({
      id: `${W}-${doc.id}`,
      workspace_id: W,
      name: doc.name,
      folder: doc.folder,
      size: doc.size,
      type: doc.type,
      updated_on: doc.updated,
      owner: doc.owner,
      version: doc.version,
    })),
  )
  await insertMany(db, 'document_versions', d.documents.flatMap((doc) => doc.versions.map((v, i) => ({ document_id: `${W}-${doc.id}`, version: v.version, date: v.date, by_name: v.by, position: i }))))

  // Notifications are ordered newest first in the seed; stagger created_at to preserve that order.
  const now = Date.now()
  await insertMany(
    db,
    'notifications',
    d.notifications.map((n, i) => ({
      id: `${W}-${n.id}`,
      workspace_id: W,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
      time_label: n.time,
      read: n.read,
      created_at: new Date(now - i * 60_000),
    })),
  )

  await insertMany(db, 'metric_series', Object.entries(d.trends).map(([metric, data]) => ({ workspace_id: W, metric, data: JSON.stringify(data) })))
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    await seed({ force: process.argv.includes('--force') })
    console.log(`Demo users sign in with password from SEED_DEFAULT_PASSWORD.`)
  } catch (err) {
    console.error('✖ Seed failed:', (err as Error).message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
