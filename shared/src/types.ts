export type Role = 'super_admin' | 'company_admin' | 'hr_officer' | 'manager' | 'employee' | 'consultant' | 'finance' | 'ceo'

export type EmploymentType = 'Full-time' | 'Contract' | 'Consultant' | 'Intern' | 'Part-time'
export type EmployeeStatus = 'Active' | 'Probation' | 'On Leave' | 'Onboarding' | 'Notice Period' | 'Exited'
export type Gender = 'Female' | 'Male'

export interface Workspace {
  id: string
  slug: string
  name: string
  industry: string
  country: string
  size: string
  domain: string
  logoText: string
  plan: 'Growth' | 'Enterprise' | 'Starter'
  founded: number
  offices: { city: string; country: string; address: string; headcount: number }[]
  /** Uploaded company logo (served by the API, cache-busted), or null when the workspace uses its letter mark. */
  logoUrl?: string | null
  /** Brand colours as #RRGGBB. */
  brandPrimary?: string
  brandSecondary?: string
  /** Custom sign-in domain, e.g. hr.company.com. */
  customDomain?: string | null
  customDomainVerified?: boolean
}

export interface Department {
  id: string
  name: string
  headId: string
  color: string
  budgetKES: number
}

export interface Employee {
  id: string
  workspaceId: string
  employeeNo: string
  name: string
  email: string
  phone: string
  photo?: string
  title: string
  departmentId: string
  managerId?: string
  role: Role
  employmentType: EmploymentType
  status: EmployeeStatus
  gender: Gender
  location: string
  startDate: string
  birthday: string
  salaryKES: number
  probationEnd?: string
  performance: number // 1–5
  potential: 1 | 2 | 3
  onboardingProgress: number // 0–100
  kraPin: string
  nationalId: string
}

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Draft' | 'Escalated'

export interface LeaveRequest {
  id: string
  employeeId: string
  type: LeaveType
  start: string
  end: string
  days: number
  reason: string
  status: ApprovalStatus
  stage: 'Manager' | 'HR' | 'CEO' | 'Complete'
  submitted: string
  handoverTo?: string
  handoverNotes?: boolean
}

export type LeaveType = 'Annual' | 'Sick' | 'Maternity' | 'Paternity' | 'Compassionate' | 'Study'

export interface Holiday {
  date: string
  name: string
  country: string
}

export interface PayrollRun {
  id: string
  period: string
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Paid' | 'Synced to Odoo'
  employees: number
  gross: number
  net: number
  paye: number
  shif: number
  nssf: number
  housingLevy: number
  bonuses: number
  preparedBy: string
  approvals: { role: string; name: string; status: ApprovalStatus; at?: string }[]
}

export interface Policy {
  id: string
  title: string
  category: string
  version: string
  updated: string
  owner: string
  mandatory: boolean
  acknowledged: number // % of employees
  summary: string
  history: { version: string; date: string; note: string }[]
}

export interface ComplianceDoc {
  id: string
  employeeId: string
  type: 'Passport' | 'Work Visa' | 'Driving Licence' | 'Contract' | 'Academic Certificate' | 'Certificate of Good Conduct' | 'Professional License'
  number: string
  issued: string
  expires?: string
  status: 'Valid' | 'Expiring' | 'Expired' | 'Missing'
}

export interface HRCase {
  id: string
  ref: string
  type: 'Disciplinary' | 'Grievance' | 'Harassment' | 'Misconduct' | 'Performance'
  subjectId: string
  reportedBy: string // 'Anonymous' or employee id
  opened: string
  status: 'Logged' | 'Investigating' | 'Hearing' | 'Awaiting Approval' | 'Closed'
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  assignedTo: string
  confidential: boolean
  summary: string
  timeline: { date: string; title: string; by: string; note: string }[]
  evidence: { name: string; size: string; uploaded: string }[]
}

export interface Offboarding {
  id: string
  employeeId: string
  reason: 'Resignation' | 'Contract End' | 'Termination' | 'Retirement'
  submitted: string
  lastDay: string
  noticeDays: number
  progress: number
  handover: boolean
  exitInterview: boolean
  finalDuesKES: number
  assets: { name: string; returned: boolean }[]
}

export interface Timesheet {
  id: string
  employeeId: string
  week: string
  entries: { project: string; hours: number[]; billable: boolean }[]
  status: ApprovalStatus
  rate: number
}

export interface Survey {
  id: string
  title: string
  status: 'Live' | 'Closed' | 'Draft'
  responses: number
  audience: number
  engagement: number
  enps: number
  closes: string
  anonymous: boolean
}

export interface Notification {
  id: string
  type: 'approval' | 'leave' | 'payroll' | 'performance' | 'policy' | 'probation' | 'document' | 'system'
  title: string
  body: string
  time: string
  read: boolean
  href: string
}

export interface OnboardingTask {
  id: string
  title: string
  description: string
  category: 'Documents' | 'Policies' | 'Profile' | 'Finance'
  required: boolean
}

export interface KPI {
  id: string
  perspective: 'Financial' | 'Customer' | 'Internal Process' | 'Learning & Growth'
  name: string
  target: number
  actual: number
  unit: string
  weight: number
  owner: string
}

export interface DocFile {
  id: string
  name: string
  folder: string
  size: string
  type: 'pdf' | 'docx' | 'xlsx' | 'png'
  updated: string
  owner: string
  version: string
  versions: { version: string; date: string; by: string }[]
}

// ── Ticketing (Linear-style requests to internal teams) ─────────────
export type TicketTeamKey = 'ENG' | 'IT' | 'HR' | 'FIN' | 'OPS'
export type TicketStatus = 'Backlog' | 'Todo' | 'In Progress' | 'In Review' | 'Done' | 'Canceled'
export type TicketPriority = 'Urgent' | 'High' | 'Medium' | 'Low' | 'None'

export interface TicketTeam {
  id: string
  key: TicketTeamKey | (string & {})
  name: string
  color: string
}

export interface TicketComment {
  id: string
  authorId: string
  body: string
  createdAt: string
}

export interface Ticket {
  id: string
  identifier: string // e.g. "ENG-142"
  teamId: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  reporterId: string
  assigneeId?: string
  labels: string[]
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
  dueDate?: string // YYYY-MM-DD
  comments: TicketComment[]
}
