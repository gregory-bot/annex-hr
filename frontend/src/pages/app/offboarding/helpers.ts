import { addDays, format, parseISO } from 'date-fns'
import type { Employee, Offboarding, Role } from '@/data/types'
import { daysUntil } from '@/lib/utils'

export const WORKFLOW = ['Resignation submitted', 'Manager acknowledged', 'HR approved', 'Notice period', 'Clearance', 'Final settlement', 'Exit']
export const REASONS: Offboarding['reason'][] = ['Resignation', 'Contract End', 'Termination', 'Retirement']
export const NOTICE_DAYS = 30

export function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function hash(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface ChecklistItem {
  id: string
  group: 'HR' | 'IT' | 'Finance' | 'Manager'
  label: string
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'hr-accept', group: 'HR', label: 'Resignation acceptance letter issued' },
  { id: 'hr-clearance', group: 'HR', label: 'Clearance form signed' },
  { id: 'it-email', group: 'IT', label: 'Disable email account' },
  { id: 'it-github', group: 'IT', label: 'Revoke GitHub access' },
  { id: 'it-slack', group: 'IT', label: 'Revoke Slack access' },
  { id: 'fin-dues', group: 'Finance', label: 'Final dues computed' },
  { id: 'fin-loan', group: 'Finance', label: 'Loan / advance recovery confirmed' },
  { id: 'mgr-handover', group: 'Manager', label: 'Handover sign-off' },
]

export type Condition = 'Good' | 'Fair' | 'Damaged' | 'Lost'

export interface AssetItem {
  key: string
  name: string
  tag: string
  condition: Condition
  returned: boolean
  valueKES: number
}

const ASSET_META: Record<string, { prefix: string; value: number; label: string }> = {
  Laptop: { prefix: 'LT', value: 145_000, label: 'Laptop' },
  'Access card': { prefix: 'AC', value: 1_500, label: 'Access card' },
  'SIM card': { prefix: 'SIM', value: 1_000, label: 'SIM card' },
  'Email account': { prefix: 'EM', value: 0, label: 'Email' },
  'GitHub access': { prefix: 'GH', value: 0, label: 'GitHub' },
  'Slack access': { prefix: 'SL', value: 0, label: 'Slack' },
}

export interface Approval {
  stage: 'Finance' | 'HR' | 'CEO'
  status: 'Approved' | 'Pending' | 'Waiting' | 'Rejected'
  roles: Role[]
  at?: string
}

export interface HandoverDoc {
  name: string
  size: string
  uploaded: string
}

export interface ExitRecord extends Offboarding {
  checklist: Record<string, boolean>
  assetItems: AssetItem[]
  handoverNotes: string
  handoverDocs: HandoverDoc[]
  successorId: string
  settlementApprovals: Approval[]
  stage: number
  isNew?: boolean
}

export function buildRecord(o: Offboarding, emp: Employee | undefined, prefix: string, isNew = false): ExitRecord {
  const h = hash(o.id)
  const target = Math.round((o.progress / 100) * CHECKLIST.length)
  const checklist: Record<string, boolean> = {}
  CHECKLIST.forEach((c, i) => {
    checklist[c.id] = c.id === 'mgr-handover' ? o.handover : !isNew && i < target
  })
  const assetItems: AssetItem[] = o.assets.map((a, i) => {
    const meta = ASSET_META[a.name] ?? { prefix: 'AS', value: 0, label: a.name }
    return {
      key: a.name,
      name: meta.label,
      tag: meta.value > 0 ? `${prefix}-${meta.prefix}-${String(100 + ((h + i * 37) % 900)).padStart(4, '0')}` : emp ? emp.email : 'Account',
      condition: 'Good',
      returned: a.returned,
      valueKES: meta.value,
    }
  })
  return {
    ...o,
    checklist,
    assetItems,
    handoverNotes: o.handover ? 'Open tickets reassigned. Weekly client stand-up handed to successor. Credentials rotated in the team vault.' : '',
    handoverDocs: isNew
      ? []
      : [
          { name: 'handover-plan.docx', size: '46 KB', uploaded: shiftDate(o.submitted, 3) },
          ...(o.handover ? [{ name: 'system-access-inventory.xlsx', size: '28 KB', uploaded: shiftDate(o.submitted, 6) }] : []),
        ],
    successorId: '',
    settlementApprovals: [
      { stage: 'Finance', status: 'Pending', roles: ['finance', 'company_admin', 'super_admin'] },
      { stage: 'HR', status: 'Waiting', roles: ['company_admin', 'hr_officer', 'super_admin'] },
      { stage: 'CEO', status: 'Waiting', roles: ['ceo', 'super_admin'] },
    ],
    stage: isNew ? 0 : 3,
    isNew,
  }
}

/** Overall completion: checklist + returned assets + exit interview. */
export function completion(r: ExitRecord) {
  const checks = CHECKLIST.filter((c) => r.checklist[c.id]).length
  const assets = r.assetItems.filter((a) => a.returned).length
  const total = CHECKLIST.length + r.assetItems.length + 1
  return Math.round(((checks + assets + (r.exitInterview ? 1 : 0)) / total) * 100)
}

export function stageOf(r: ExitRecord) {
  const d = daysUntil(r.lastDay)
  if (d < 0 || r.settlementApprovals.every((a) => a.status === 'Approved')) return 6
  const pct = completion(r)
  if (pct >= 90) return 5
  if (pct >= 50) return 4
  return Math.max(r.stage, r.isNew ? 0 : 3)
}

export const allAssetsReturned = (r: ExitRecord) => r.assetItems.every((a) => a.returned)
export const handoverDone = (r: ExitRecord) => !!r.checklist['mgr-handover']
export const duesSettled = (r: ExitRecord) => r.settlementApprovals.every((a) => a.status === 'Approved')
export const outstandingValue = (r: ExitRecord) => r.assetItems.reduce((s, a) => s + (!a.returned || a.condition === 'Lost' ? a.valueKES : a.condition === 'Damaged' ? Math.round(a.valueKES * 0.4) : 0), 0)

/** Kenyan PAYE monthly bands (2026), after personal relief. */
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

export interface SettlementLine {
  label: string
  detail: string
  amount: number
  kind: 'earning' | 'deduction'
}

export function settlement(r: ExitRecord, emp: Employee | undefined) {
  const salary = emp?.salaryKES ?? 0
  const daily = salary / 22
  const lastDayOfMonth = parseISO(r.lastDay).getDate()
  const worked = Math.min(30, lastDayOfMonth)
  const leaveDays = 3 + (hash(r.id + 'leave') % 12)
  const unpaid = Math.round((salary * worked) / 30)
  const encash = Math.round(leaveDays * daily)
  const noticePay = r.reason === 'Termination' ? salary : 0
  const gross = unpaid + encash + noticePay
  const shif = Math.round(gross * 0.0275)
  const nssf = Math.min(Math.round(gross * 0.06), 4_320)
  const housing = Math.round(gross * 0.015)
  const tax = paye(gross - shif - nssf - housing)
  const assets = outstandingValue(r)
  const loan = hash(r.id + 'loan') % 3 === 0 ? 25_000 + (hash(r.id) % 5) * 5_000 : 0
  const lines: SettlementLine[] = [
    { label: 'Unpaid salary (pro-rata)', detail: `${worked}/30 days of ${new Intl.NumberFormat('en-KE').format(salary)}`, amount: unpaid, kind: 'earning' },
    { label: 'Leave encashment', detail: `${leaveDays} annual days × daily rate`, amount: encash, kind: 'earning' },
    { label: 'Notice pay', detail: r.reason === 'Termination' ? 'One month in lieu of notice' : 'Notice served in full', amount: noticePay, kind: 'earning' },
    { label: 'PAYE', detail: 'KRA income tax, after personal relief', amount: tax, kind: 'deduction' },
    { label: 'SHIF', detail: '2.75% of gross', amount: shif, kind: 'deduction' },
    { label: 'NSSF', detail: 'Tier I + II, 6% capped', amount: nssf, kind: 'deduction' },
    { label: 'Housing Levy', detail: '1.5% of gross', amount: housing, kind: 'deduction' },
    { label: 'Unreturned asset recovery', detail: assets ? 'Outstanding company property' : 'All assets returned', amount: assets, kind: 'deduction' },
    { label: 'Loan / advance recovery', detail: loan ? 'Staff salary advance balance' : 'No outstanding loans', amount: loan, kind: 'deduction' },
  ]
  const deductions = lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0)
  return { lines, gross, deductions, net: gross - deductions }
}
