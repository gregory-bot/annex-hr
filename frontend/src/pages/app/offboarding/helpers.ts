import { addDays, format, parseISO } from 'date-fns'
import type { Employee, Offboarding, Role } from '@/data/types'
import { TODAY, daysUntil } from '@/lib/utils'

export const WORKFLOW = ['Resignation submitted', 'Manager acknowledged', 'HR approved', 'Notice period', 'Clearance', 'Final settlement', 'Exit']
export const REASONS: Offboarding['reason'][] = ['Resignation', 'Contract End', 'Termination', 'Retirement']
export const NOTICE_DAYS = 30
export const GROUPS = ['HR', 'IT', 'Finance', 'Manager'] as const
export type Condition = 'Good' | 'Fair' | 'Damaged' | 'Lost'
export const CONDITIONS: Condition[] = ['Good', 'Fair', 'Damaged', 'Lost']

export function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function hash(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface ChecklistRow {
  id: string
  key: string
  group: (typeof GROUPS)[number]
  label: string
  done: boolean
  doneBy: string | null
  doneAt: string
}

export interface AssetRow {
  id: string
  name: string
  serial: string | null
  condition: Condition
  returned: boolean
  valueKES: number
  returnedAt: string
}

export interface ExitFile {
  id: string
  kind: 'resignation_letter' | 'knowledge_transfer'
  filename: string
  contentType: string
  sizeBytes: number
  uploadedBy: string | null
  createdAt: string
}

export interface SettlementLine {
  key: string
  label: string
  detail: string
  amount: number
  kind: 'earning' | 'deduction'
}

export interface SettlementInputs {
  unpaidDays: number
  leaveDays: number
  noticePayKES: number
  loanKES: number
  otherDeductionsKES: number
}

export interface SettlementApproval {
  stage: 'Finance' | 'HR' | 'CEO'
  status: 'Approved' | 'Pending' | 'Waiting'
  by: string | null
  at: string
  canAct: boolean
}

export interface SettlementView {
  inputs: SettlementInputs
  monthlySalaryKES: number
  lines: SettlementLine[]
  gross: number
  assetDeduction: number
  deductions: number
  net: number
  saved: boolean
  locked: boolean
  approvals: SettlementApproval[]
  updatedAt: string | null
}

export interface InterviewAnswers {
  reason: string
  nps: number
  wouldRecommend: boolean
  improvements: string
  managerRating: number
  wouldReturn: boolean
  submittedAt: string
}

/** Exit as served by GET /lifecycle/offboardings — progress and stage are computed server-side. */
export interface ExitItem {
  id: string
  employeeId: string
  employeeName: string
  employeeTitle: string
  reason: Offboarding['reason']
  submitted: string
  lastDay: string
  noticeDays: number
  progress: number
  stage: number
  stageLabel: string
  handover: boolean
  handoverNotes: string
  successorId: string | null
  successorName: string | null
  exitInterview: boolean
  finalDuesKES: number | null
  managerAck: { by: string | null; at: string } | null
  hrApproval: { by: string | null; at: string } | null
  checklist: ChecklistRow[]
  assets: AssetRow[]
  files: ExitFile[]
  settlementStatus: 'Approved' | 'In approval' | 'Draft' | 'Not started' | null
  canAcknowledge: boolean
  canApprove: boolean
}

export interface ExitDetail extends ExitItem {
  settlement?: SettlementView | null
  interview?: InterviewAnswers | null
}

export const CHECKLIST: Omit<ChecklistRow, 'id' | 'done' | 'doneBy' | 'doneAt'>[] = [
  { key: 'hr-accept', group: 'HR', label: 'Resignation acceptance letter issued' },
  { key: 'hr-clearance', group: 'HR', label: 'Clearance form signed' },
  { key: 'it-email', group: 'IT', label: 'Disable email account' },
  { key: 'it-github', group: 'IT', label: 'Revoke GitHub access' },
  { key: 'it-slack', group: 'IT', label: 'Revoke Slack access' },
  { key: 'fin-dues', group: 'Finance', label: 'Final dues computed' },
  { key: 'fin-loan', group: 'Finance', label: 'Loan / advance recovery confirmed' },
  { key: 'mgr-handover', group: 'Manager', label: 'Handover sign-off' },
]

const ASSET_META: Record<string, [string, number]> = { Laptop: ['LT', 145_000], 'Access card': ['AC', 1_500], 'SIM card': ['SIM', 1_000] }

export const allAssetsReturned = (r: ExitItem) => r.assets.every((a) => a.returned)
export const outstandingValue = (assets: AssetRow[]) =>
  assets.reduce((s, a) => s + (!a.returned || a.condition === 'Lost' ? a.valueKES : a.condition === 'Damaged' ? Math.round(a.valueKES * 0.4) : 0), 0)

/** Who may tick a checklist group (mirrors the API). */
export function canTick(role: Role, group: ChecklistRow['group']) {
  if (role === 'super_admin' || role === 'company_admin' || role === 'hr_officer') return true
  return (role === 'finance' && group === 'Finance') || (role === 'manager' && group === 'Manager')
}

// ── Mock mode: the same computations the API performs ─────────────
export function paye(taxable: number) {
  const bands: [number, number][] = [
    [24_000, 0.1],
    [8_333, 0.25],
    [467_667, 0.3],
    [300_000, 0.325],
    [Infinity, 0.35],
  ]
  let rest = taxable
  let tax = 0
  for (const [width, rate] of bands) {
    const slice = Math.min(rest, width)
    if (slice <= 0) break
    tax += slice * rate
    rest -= slice
  }
  return Math.max(0, Math.round(tax - 2_400))
}

export function computeSettlement(r: ExitItem, salary: number, inputs: SettlementInputs | null): Omit<SettlementView, 'saved' | 'locked' | 'approvals' | 'updatedAt'> {
  const last = parseISO(r.lastDay)
  const i: SettlementInputs = inputs ?? {
    unpaidDays: Math.min(30, last.getDate()),
    leaveDays: Math.round(((21 * (last.getMonth() + 1)) / 12) * 10) / 10,
    noticePayKES: r.reason === 'Termination' ? salary : 0,
    loanKES: 0,
    otherDeductionsKES: 0,
  }
  const unpaid = Math.round((salary * i.unpaidDays) / 30)
  const encash = Math.round((salary / 22) * i.leaveDays)
  const gross = unpaid + encash + Math.round(i.noticePayKES)
  const nssf = gross > 0 ? Math.round(Math.min(gross * 0.06, 4_320)) : 0
  const shif = gross > 0 ? Math.round(Math.max(gross * 0.0275, 300)) : 0
  const housing = Math.round(gross * 0.015)
  const tax = gross > 0 ? paye(gross - nssf - shif - housing) : 0
  const assets = outstandingValue(r.assets)
  const lines: SettlementLine[] = [
    { key: 'unpaid', label: 'Unpaid salary (pro-rata)', detail: `${i.unpaidDays}/30 days of KES ${new Intl.NumberFormat('en-KE').format(salary)}`, amount: unpaid, kind: 'earning' },
    { key: 'leave', label: 'Leave encashment', detail: `${i.leaveDays} annual days × daily rate`, amount: encash, kind: 'earning' },
    { key: 'notice', label: 'Notice pay', detail: i.noticePayKES ? 'In lieu of notice' : 'Notice served in full', amount: Math.round(i.noticePayKES), kind: 'earning' },
    { key: 'paye', label: 'PAYE', detail: 'KRA income tax, after personal relief', amount: tax, kind: 'deduction' },
    { key: 'shif', label: 'SHIF', detail: '2.75% of gross (min KES 300)', amount: shif, kind: 'deduction' },
    { key: 'nssf', label: 'NSSF', detail: 'Tier I + II, 6% capped', amount: nssf, kind: 'deduction' },
    { key: 'housing', label: 'Housing Levy', detail: '1.5% of gross', amount: housing, kind: 'deduction' },
    { key: 'assets', label: 'Unreturned asset recovery', detail: assets ? 'Outstanding or damaged company property' : 'All assets returned', amount: assets, kind: 'deduction' },
    { key: 'loan', label: 'Loan / advance recovery', detail: i.loanKES ? 'Staff loan or salary advance balance' : 'No outstanding loans', amount: Math.round(i.loanKES), kind: 'deduction' },
    { key: 'other', label: 'Other deductions', detail: i.otherDeductionsKES ? 'As agreed with the employee' : 'None', amount: Math.round(i.otherDeductionsKES), kind: 'deduction' },
  ]
  const deductions = lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0)
  return { inputs: i, monthlySalaryKES: salary, lines, gross, assetDeduction: assets, deductions, net: gross - deductions }
}

export function computeProgress(r: ExitDetail): { progress: number; stage: number } {
  const checks = r.checklist.filter((c) => c.done).length
  const returned = r.assets.filter((a) => a.returned).length
  const settled = r.settlement?.approvals.every((a) => a.status === 'Approved') ?? false
  const total = r.checklist.length + r.assets.length + 2
  const progress = Math.round((100 * (checks + returned + (r.exitInterview ? 1 : 0) + (settled ? 1 : 0))) / total)
  const cleared = checks === r.checklist.length && returned === r.assets.length
  let stage = 0
  if (settled && cleared) stage = 6
  else if (r.hrApproval) stage = cleared ? 5 : daysUntil(r.lastDay) <= 7 || (checks + returned) * 2 >= r.checklist.length + r.assets.length ? 4 : 3
  else if (r.managerAck) stage = 1
  return { progress, stage }
}

export function mockExit(o: Offboarding, emp: Employee | undefined, prefix: string, hrName: string): ExitDetail {
  const target = Math.round((o.progress / 100) * 7)
  const at = `${TODAY}T09:00:00.000Z`
  const d: ExitDetail = {
    id: o.id,
    employeeId: o.employeeId,
    employeeName: emp?.name ?? 'Employee',
    employeeTitle: emp?.title ?? '',
    reason: o.reason,
    submitted: o.submitted,
    lastDay: o.lastDay,
    noticeDays: o.noticeDays,
    progress: o.progress,
    stage: 0,
    stageLabel: WORKFLOW[0]!,
    handover: o.handover,
    handoverNotes: o.handover ? 'Open tickets reassigned. Weekly client stand-up handed to successor. Credentials rotated in the team vault.' : '',
    successorId: null,
    successorName: null,
    exitInterview: o.exitInterview,
    finalDuesKES: o.finalDuesKES,
    managerAck: o.progress > 0 ? { by: 'Line manager', at } : null,
    hrApproval: o.progress > 0 ? { by: hrName, at } : null,
    checklist: CHECKLIST.map((c, i) => ({ ...c, id: `${o.id}-${c.key}`, done: c.key === 'mgr-handover' ? o.handover : i < target, doneBy: null, doneAt: '' })),
    assets: o.assets.map((a, i) => {
      const meta = ASSET_META[a.name]
      return {
        id: `${o.id}-a${i}`,
        name: a.name,
        serial: meta ? `${prefix}-${meta[0]}-${1000 + (hash(o.id + a.name) % 9000)}` : (emp?.email ?? 'Account'),
        condition: 'Good',
        returned: a.returned,
        valueKES: meta ? meta[1] : 0,
        returnedAt: '',
      }
    }),
    files: [],
    settlementStatus: 'Not started',
    canAcknowledge: false,
    canApprove: false,
    settlement: null,
    interview: o.exitInterview
      ? { reason: 'Career growth elsewhere', nps: 8, wouldRecommend: true, improvements: 'Clearer promotion criteria and a structured learning budget.', managerRating: 4, wouldReturn: true, submittedAt: at }
      : null,
  }
  return d
}
