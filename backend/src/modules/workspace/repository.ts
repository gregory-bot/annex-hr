import type { WorkspaceData } from '@annex/shared/seed'
import type {
  ComplianceDoc,
  Department,
  DocFile,
  Employee,
  HRCase,
  Holiday,
  KPI,
  LeaveRequest,
  Notification,
  Offboarding,
  OnboardingTask,
  PayrollRun,
  Policy,
  Survey,
  Timesheet,
  Workspace,
} from '@annex/shared/types'
import { pool, query, type Queryable } from '../../db/pool'
import type { AuthContext } from '../../middleware/auth'
import { canSeePay, isAdmin, isExec } from '../../lib/roles'

type Row = Record<string, any>

/** Groups child rows by a foreign key. */
function groupBy(rows: Row[], key: string) {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const k = r[key] as string
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return map
}

// ── Row → domain mappers ────────────────────────────────────────────

export const toWorkspace = (w: Row, offices: Row[] = []): Workspace => ({
  id: w.id,
  slug: w.slug,
  name: w.name,
  industry: w.industry,
  country: w.country,
  size: w.size,
  domain: w.domain,
  logoText: w.logo_text,
  plan: w.plan,
  founded: w.founded ?? new Date(w.created_at).getFullYear(),
  offices: offices.map((o) => ({ city: o.city, country: o.country, address: o.address, headcount: o.headcount })),
})

export const toDepartment = (d: Row): Department => ({ id: d.id, name: d.name, headId: d.head_id ?? '', color: d.color, budgetKES: d.budget_kes })

export const toEmployee = (e: Row): Employee => ({
  id: e.id,
  workspaceId: e.workspace_id,
  employeeNo: e.employee_no,
  name: e.name,
  email: e.email,
  phone: e.phone ?? '',
  photo: e.photo ?? undefined,
  title: e.title,
  departmentId: e.department_id ?? '',
  managerId: e.manager_id ?? undefined,
  role: e.role,
  employmentType: e.employment_type,
  status: e.status,
  gender: e.gender,
  location: e.location ?? '',
  startDate: e.start_date,
  birthday: e.birthday ?? '',
  salaryKES: e.salary_kes,
  probationEnd: e.probation_end ?? undefined,
  performance: e.performance,
  potential: e.potential,
  onboardingProgress: e.onboarding_progress,
  kraPin: e.kra_pin ?? '',
  nationalId: e.national_id ?? '',
})

export const toLeave = (l: Row): LeaveRequest => ({
  id: l.id,
  employeeId: l.employee_id,
  type: l.type,
  start: l.start_date,
  end: l.end_date,
  days: l.days,
  reason: l.reason,
  status: l.status,
  stage: l.stage,
  submitted: l.submitted_at,
  handoverTo: l.handover_to ?? undefined,
  handoverNotes: l.handover_notes,
})

export const toPayrollRun = (p: Row, approvals: Row[] = []): PayrollRun => ({
  id: p.id,
  period: p.period,
  status: p.status,
  employees: p.employees,
  gross: p.gross,
  net: p.net,
  paye: p.paye,
  shif: p.shif,
  nssf: p.nssf,
  housingLevy: p.housing_levy,
  bonuses: p.bonuses,
  preparedBy: p.prepared_by,
  approvals: approvals.map((a) => ({ role: a.role, name: a.name, status: a.status, at: a.decided_at ?? undefined })),
})

export const toPolicy = (p: Row, history: Row[] = []): Policy => ({
  id: p.id,
  title: p.title,
  category: p.category,
  version: p.version,
  updated: p.updated_on,
  owner: p.owner,
  mandatory: p.mandatory,
  acknowledged: p.acknowledged,
  summary: p.summary,
  history: history.map((h) => ({ version: h.version, date: h.date, note: h.note })),
})

export const toComplianceDoc = (c: Row): ComplianceDoc => ({
  id: c.id,
  employeeId: c.employee_id,
  type: c.type,
  number: c.number,
  issued: c.issued,
  expires: c.expires ?? undefined,
  status: c.status,
})

export const toCase = (c: Row, events: Row[] = [], evidence: Row[] = []): HRCase => ({
  id: c.id,
  ref: c.ref,
  type: c.type,
  subjectId: c.subject_id,
  reportedBy: c.reported_by,
  opened: c.opened,
  status: c.status,
  severity: c.severity,
  assignedTo: c.assigned_to ?? '',
  confidential: c.confidential,
  summary: c.summary,
  timeline: events.map((t) => ({ date: t.date, title: t.title, by: t.by_name, note: t.note })),
  evidence: evidence.map((e) => ({ name: e.name, size: e.size, uploaded: e.uploaded })),
})

export const toOffboarding = (o: Row, assets: Row[] = []): Offboarding => ({
  id: o.id,
  employeeId: o.employee_id,
  reason: o.reason,
  submitted: o.submitted,
  lastDay: o.last_day,
  noticeDays: o.notice_days,
  progress: o.progress,
  handover: o.handover,
  exitInterview: o.exit_interview,
  finalDuesKES: o.final_dues_kes,
  assets: assets.map((a) => ({ name: a.name, returned: a.returned })),
})

export const toTimesheet = (t: Row, entries: Row[] = []): Timesheet => ({
  id: t.id,
  employeeId: t.employee_id,
  week: t.week_start,
  status: t.status,
  rate: t.rate_kes,
  entries: entries.map((e) => ({ project: e.project, billable: e.billable, hours: (e.hours as (string | number)[]).map(Number) })),
})

export const toSurvey = (s: Row): Survey => ({
  id: s.id,
  title: s.title,
  status: s.status,
  responses: s.responses,
  audience: s.audience,
  engagement: s.engagement,
  enps: s.enps,
  closes: s.closes,
  anonymous: s.anonymous,
})

export const toNotification = (n: Row): Notification => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  href: n.href,
  read: n.read,
  time: n.time_label ?? relativeTime(n.created_at),
})

export const toDocument = (d: Row, versions: Row[] = []): DocFile => ({
  id: d.id,
  name: d.name,
  folder: d.folder,
  size: d.size,
  type: d.type,
  updated: d.updated_on,
  owner: d.owner,
  version: d.version,
  versions: versions.map((v) => ({ version: v.version, date: v.date, by: v.by_name })),
})

function relativeTime(date: Date | string) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

// ── Loaders ─────────────────────────────────────────────────────────

const WORKSPACE_SQL = `SELECT w.*, COALESCE((SELECT json_agg(o ORDER BY o.headcount DESC) FROM offices o WHERE o.workspace_id = w.id), '[]') AS offices
  FROM workspaces w WHERE w.id = $1`

export async function getWorkspace(id: string, db: Queryable = pool) {
  const [w] = await query(WORKSPACE_SQL, [id], db)
  return w ? toWorkspace(w, w.offices) : null
}

/** Full data set for one workspace, redacted for the viewer's role. */
export async function loadWorkspaceData(viewer: AuthContext): Promise<WorkspaceData> {
  const W = viewer.workspaceId

  // One round trip: every collection is aggregated to JSON server-side. This keeps the
  // bootstrap to a single pooled connection (Aiven hobby plans allow only ~20 in total).
  const sets = {
    departments: 'SELECT * FROM departments WHERE workspace_id = $1 ORDER BY created_at, name',
    employees: 'SELECT * FROM employees WHERE workspace_id = $1 ORDER BY employee_no',
    leave: 'SELECT * FROM leave_requests WHERE workspace_id = $1 ORDER BY created_at, id',
    payroll: 'SELECT * FROM payroll_runs WHERE workspace_id = $1 ORDER BY position, created_at DESC',
    payrollApprovals: 'SELECT a.* FROM payroll_approvals a JOIN payroll_runs r ON r.id = a.payroll_run_id WHERE r.workspace_id = $1 ORDER BY a.step',
    policies: 'SELECT * FROM policies WHERE workspace_id = $1 ORDER BY title',
    policyVersions: 'SELECT v.* FROM policy_versions v JOIN policies p ON p.id = v.policy_id WHERE p.workspace_id = $1 ORDER BY v.position',
    complianceDocs: 'SELECT * FROM compliance_documents WHERE workspace_id = $1 ORDER BY id',
    cases: 'SELECT * FROM hr_cases WHERE workspace_id = $1 ORDER BY opened DESC',
    caseEvents: 'SELECT e.* FROM case_events e JOIN hr_cases c ON c.id = e.case_id WHERE c.workspace_id = $1 ORDER BY e.position, e.date',
    caseEvidence: 'SELECT e.* FROM case_evidence e JOIN hr_cases c ON c.id = e.case_id WHERE c.workspace_id = $1 ORDER BY e.uploaded',
    offboardings: 'SELECT * FROM offboardings WHERE workspace_id = $1 ORDER BY submitted DESC',
    offboardingAssets: 'SELECT a.* FROM offboarding_assets a JOIN offboardings o ON o.id = a.offboarding_id WHERE o.workspace_id = $1 ORDER BY a.position',
    timesheets: 'SELECT * FROM timesheets WHERE workspace_id = $1 ORDER BY week_start DESC',
    timesheetEntries: 'SELECT e.* FROM timesheet_entries e JOIN timesheets t ON t.id = e.timesheet_id WHERE t.workspace_id = $1 ORDER BY e.position',
    surveys: 'SELECT * FROM surveys WHERE workspace_id = $1 ORDER BY position',
    notifications: 'SELECT * FROM notifications WHERE workspace_id = $1 AND (recipient_id IS NULL OR recipient_id = $2) ORDER BY created_at DESC LIMIT 50',
    kpis: 'SELECT * FROM kpis WHERE workspace_id = $1 ORDER BY position',
    documents: 'SELECT * FROM documents WHERE workspace_id = $1 ORDER BY folder, created_at',
    documentVersions: 'SELECT v.* FROM document_versions v JOIN documents d ON d.id = v.document_id WHERE d.workspace_id = $1 ORDER BY v.position',
    holidays: 'SELECT * FROM holidays WHERE workspace_id = $1 ORDER BY date',
    tasks: 'SELECT * FROM onboarding_tasks WHERE workspace_id = $1 ORDER BY position',
    metrics: 'SELECT metric, data FROM metric_series WHERE workspace_id = $1',
  } as const
  const select = Object.entries(sets)
    .map(([key, sql]) => `(SELECT COALESCE(json_agg(t), '[]'::json) FROM (${sql}) t) AS "${key}"`)
    .concat(`(SELECT row_to_json(ws) FROM (${WORKSPACE_SQL}) ws) AS "workspaceRow"`)
    .join(',\n')
  const [bundle] = await query<Record<keyof typeof sets, Row[]> & { workspaceRow: Row | null }>(`SELECT ${select}`, [W, viewer.employeeId])
  const {
    departments,
    employees,
    leave,
    payroll,
    payrollApprovals,
    policies,
    policyVersions,
    complianceDocs,
    cases,
    caseEvents,
    caseEvidence,
    offboardings,
    offboardingAssets,
    timesheets,
    timesheetEntries,
    surveys,
    notifications,
    kpis,
    documents,
    documentVersions,
    holidays,
    tasks,
    metrics,
    workspaceRow,
  } = bundle!
  const workspace = workspaceRow ? toWorkspace(workspaceRow, workspaceRow.offices) : null
  if (!workspace) throw new Error('Workspace not found')

  const approvalsBy = groupBy(payrollApprovals, 'payroll_run_id')
  const versionsBy = groupBy(policyVersions, 'policy_id')
  const eventsBy = groupBy(caseEvents, 'case_id')
  const evidenceBy = groupBy(caseEvidence, 'case_id')
  const assetsBy = groupBy(offboardingAssets, 'offboarding_id')
  const entriesBy = groupBy(timesheetEntries, 'timesheet_id')
  const docVersionsBy = groupBy(documentVersions, 'document_id')
  const metric = (name: string) => (metrics.find((m) => m.metric === name)?.data ?? []) as never

  // Server-side redaction: sensitive fields never leave the API for roles that shouldn't see them.
  const seePay = canSeePay(viewer.role)
  const seeIds = isAdmin(viewer.role)
  const redact = (e: Employee): Employee => {
    if (e.id === viewer.employeeId) return e
    return {
      ...e,
      salaryKES: seePay ? e.salaryKES : 0,
      kraPin: seeIds ? e.kraPin : e.kraPin.replace(/.(?=.{3})/g, '•'),
      nationalId: seeIds ? e.nationalId : e.nationalId.replace(/.(?=.{3})/g, '•'),
    }
  }

  return {
    workspace,
    departments: departments.map(toDepartment),
    employees: employees.map(toEmployee).map(redact),
    leaveRequests: leave.map(toLeave),
    payrollRuns: seePay ? payroll.map((p) => toPayrollRun(p, approvalsBy.get(p.id))) : [],
    policies: policies.map((p) => toPolicy(p, versionsBy.get(p.id))),
    complianceDocs: complianceDocs.map(toComplianceDoc),
    // Confidential cases are only ever sent to HR admins and the CEO.
    cases: isExec(viewer.role) ? cases.map((c) => toCase(c, eventsBy.get(c.id), evidenceBy.get(c.id))) : [],
    offboardings: offboardings.map((o) => toOffboarding(o, assetsBy.get(o.id))),
    timesheets: timesheets.map((t) => toTimesheet(t, entriesBy.get(t.id))),
    surveys: surveys.map(toSurvey),
    notifications: notifications.map(toNotification),
    kpis: kpis.map((k) => ({ id: k.id, perspective: k.perspective, name: k.name, target: k.target, actual: k.actual, unit: k.unit, weight: k.weight, owner: k.owner }) as KPI),
    documents: documents.map((d) => toDocument(d, docVersionsBy.get(d.id))),
    holidays: holidays.map((h) => ({ date: h.date, name: h.name, country: h.country }) as Holiday),
    onboardingTasks: tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, category: t.category, required: t.required }) as OnboardingTask),
    trends: {
      headcount: metric('headcount'),
      leave: metric('leave'),
      hiringFunnel: metric('hiringFunnel'),
      attendance: metric('attendance'),
      engagement: metric('engagement'),
      payroll: metric('payroll'),
    },
  }
}
