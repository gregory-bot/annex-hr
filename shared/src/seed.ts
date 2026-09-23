import type {
  ComplianceDoc,
  Department,
  DocFile,
  Employee,
  EmploymentType,
  EmployeeStatus,
  HRCase,
  Holiday,
  KPI,
  LeaveRequest,
  LeaveType,
  Notification,
  Offboarding,
  OnboardingTask,
  PayrollRun,
  Policy,
  Role,
  Survey,
  Timesheet,
  Workspace,
} from './types'

/* ------------------------------------------------------------------
   Deterministic PRNG so the demo data is identical on every load.
------------------------------------------------------------------- */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rnd: () => number, arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!
const between = (rnd: () => number, min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (date: string, days: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return iso(d)
}

/* ------------------------------------------------------------------ */

export const workspaces: Workspace[] = [
  {
    id: 'ws-annex',
    slug: 'annex',
    name: 'Annex Technologies',
    industry: 'Data & Software Engineering',
    country: 'Kenya',
    size: '51–200',
    domain: 'annex.annexhr.com',
    logoText: 'A',
    plan: 'Enterprise',
    founded: 2020,
    offices: [
      { city: 'Nairobi', country: 'Kenya', address: 'Kilimani, Argwings Kodhek Rd', headcount: 36 },
      { city: 'Kigali', country: 'Rwanda', address: 'Kigali Heights', headcount: 8 },
      { city: 'Kampala', country: 'Uganda', address: 'Kololo', headcount: 4 },
    ],
  },
  {
    id: 'ws-demo',
    slug: 'demo-manufacturing',
    name: 'Demo Manufacturing Ltd',
    industry: 'Manufacturing',
    country: 'Kenya',
    size: '11–50',
    domain: 'demo-manufacturing.annexhr.com',
    logoText: 'D',
    plan: 'Growth',
    founded: 2011,
    offices: [
      { city: 'Athi River', country: 'Kenya', address: 'Export Processing Zone, Plot 14', headcount: 28 },
      { city: 'Mombasa', country: 'Kenya', address: 'Changamwe Industrial Area', headcount: 6 },
    ],
  },
  {
    id: 'ws-chqi',
    slug: 'chqi',
    name: 'CHQI',
    industry: 'Healthcare',
    country: 'Kenya',
    size: '11–50',
    domain: 'chqi.annexhr.com',
    logoText: 'C',
    plan: 'Starter',
    founded: 2016,
    offices: [{ city: 'Nairobi', country: 'Kenya', address: 'Upper Hill', headcount: 18 }],
  },
]

const deptTemplates: Record<string, { name: string; color: string }[]> = {
  'ws-annex': [
    { name: 'Data Engineering', color: '#C1121F' },
    { name: 'Data Science & Analytics', color: '#E63946' },
    { name: 'Software Engineering', color: '#7F1D1D' },
    { name: 'Product & Design', color: '#374151' },
    { name: 'Delivery', color: '#F4A3A8' },
    { name: 'Sales & Partnerships', color: '#9CA3AF' },
    { name: 'Finance & Admin', color: '#B91C1C' },
    { name: 'People & Culture', color: '#6B7280' },
  ],
  'ws-demo': [
    { name: 'Production', color: '#C1121F' },
    { name: 'Quality Assurance', color: '#E63946' },
    { name: 'Supply Chain', color: '#7F1D1D' },
    { name: 'Maintenance', color: '#374151' },
    { name: 'Finance', color: '#F4A3A8' },
    { name: 'People & Culture', color: '#9CA3AF' },
  ],
  'ws-chqi': [
    { name: 'Clinical', color: '#C1121F' },
    { name: 'Research', color: '#E63946' },
    { name: 'Administration', color: '#374151' },
  ],
}

const firstF = ['Wanjiku', 'Achieng', 'Amina', 'Njeri', 'Aisha', 'Faith', 'Mercy', 'Grace', 'Chiamaka', 'Nafula', 'Akinyi', 'Zawadi', 'Imani', 'Wairimu', 'Adaeze', 'Nasimiyu', 'Halima', 'Esther', 'Joy', 'Nekesa', 'Makena', 'Kemunto', 'Tumaini', 'Ngozi', 'Sharon']
const firstM = ['Kamau', 'Otieno', 'Kipchoge', 'Mwangi', 'Omondi', 'Brian', 'Kevin', 'Chinedu', 'Baraka', 'Juma', 'Kiprono', 'Emeka', 'Wafula', 'Mutua', 'Hassan', 'Dennis', 'Tunde', 'Collins', 'Ochieng', 'Samuel', 'Kibet', 'Moses', 'David', 'Felix', 'Ivan']
const lasts = ['Mwangi', 'Odhiambo', 'Kariuki', 'Wanjala', 'Njoroge', 'Kiprotich', 'Otieno', 'Ndungu', 'Mutai', 'Okafor', 'Adeyemi', 'Mohamed', 'Chebet', 'Kimani', 'Muthoni', 'Ouma', 'Wekesa', 'Nyambura', 'Onyango', 'Barasa', 'Kiplagat', 'Nwosu', 'Ali', 'Kilonzo', 'Gitau', 'Musyoka', 'Achola', 'Mugo']

const titlesByDept: Record<string, string[]> = {
  'Data Engineering': ['Senior Data Engineer', 'Data Engineer', 'Analytics Engineer', 'Data Platform Engineer', 'DataOps Engineer'],
  'Data Science & Analytics': ['Data Scientist', 'Senior Data Analyst', 'Data Analyst', 'Machine Learning Engineer', 'BI Developer'],
  'Software Engineering': ['Senior Software Engineer', 'Backend Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer'],
  'Product & Design': ['Product Manager', 'Product Designer', 'UX Researcher'],
  Delivery: ['Project Manager', 'Scrum Master', 'Business Analyst', 'Solutions Consultant'],
  'Sales & Partnerships': ['Account Executive', 'Partnerships Manager', 'Pre-sales Engineer'],
  'Finance & Admin': ['Accountant', 'Payroll Specialist', 'Office Administrator'],
  'People & Culture': ['Talent Partner', 'HR Business Partner', 'People Operations Associate'],
  Production: ['Production Supervisor', 'Machine Operator', 'Line Technician', 'Production Planner'],
  'Quality Assurance': ['QA Inspector', 'Quality Engineer', 'Lab Technician'],
  'Supply Chain': ['Procurement Officer', 'Logistics Coordinator', 'Stores Clerk'],
  Maintenance: ['Maintenance Technician', 'Electrical Technician', 'Mechanical Fitter'],
  Finance: ['Financial Accountant', 'Payroll Specialist', 'Credit Controller'],
  Clinical: ['Clinical Officer', 'Nurse', 'Pharmacist'],
  Research: ['Research Associate', 'Biostatistician'],
  Administration: ['Administrator', 'Accountant'],
}

const leadTitle: Record<string, string> = {
  'Data Engineering': 'Head of Data Engineering',
  'Data Science & Analytics': 'Head of Data Science',
  'Software Engineering': 'Head of Engineering',
  'Product & Design': 'Head of Product',
  Delivery: 'Head of Delivery',
  'Sales & Partnerships': 'Head of Sales',
  'Finance & Admin': 'Finance Manager',
  'People & Culture': 'Head of People',
  Production: 'Production Manager',
  'Quality Assurance': 'Quality Manager',
  'Supply Chain': 'Supply Chain Manager',
  Maintenance: 'Maintenance Manager',
  Finance: 'Finance Manager',
  Clinical: 'Medical Director',
  Research: 'Research Lead',
  Administration: 'Admin Manager',
}

const locationsByWs: Record<string, string[]> = {
  'ws-annex': ['Nairobi, KE', 'Nairobi, KE', 'Nairobi, KE', 'Kigali, RW', 'Kampala, UG'],
  'ws-demo': ['Athi River, KE', 'Athi River, KE', 'Athi River, KE', 'Mombasa, KE'],
  'ws-chqi': ['Nairobi, KE'],
}

/** Named leadership per workspace so logins and approvals feel real. */
const leadership: Record<string, { name: string; gender: 'Female' | 'Male'; title: string; role: Role; dept?: string }[]> = {
  'ws-annex': [
    { name: 'David Mutua', gender: 'Male', title: 'Chief Executive Officer', role: 'ceo' },
    { name: 'Faith Njeri', gender: 'Female', title: 'Head of People', role: 'company_admin', dept: 'People & Culture' },
    { name: 'Brian Otieno', gender: 'Male', title: 'Head of Data Engineering', role: 'manager', dept: 'Data Engineering' },
    { name: 'Grace Achieng', gender: 'Female', title: 'Finance Manager', role: 'finance', dept: 'Finance & Admin' },
  ],
  'ws-demo': [
    { name: 'Peter Kamande', gender: 'Male', title: 'Managing Director', role: 'ceo' },
    { name: 'Mercy Wanjiru', gender: 'Female', title: 'Head of People', role: 'company_admin', dept: 'People & Culture' },
    { name: 'Joseph Mwangi', gender: 'Male', title: 'Production Manager', role: 'manager', dept: 'Production' },
    { name: 'Halima Yusuf', gender: 'Female', title: 'Finance Manager', role: 'finance', dept: 'Finance' },
  ],
  'ws-chqi': [
    { name: 'Esther Wairimu', gender: 'Female', title: 'Executive Director', role: 'ceo' },
    { name: 'Collins Ouma', gender: 'Male', title: 'Admin Manager', role: 'company_admin', dept: 'Administration' },
  ],
}

const sizes: Record<string, number> = { 'ws-annex': 48, 'ws-demo': 34, 'ws-chqi': 18 }

function slugEmail(name: string, domain: string) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.') + '@' + domain
}

function buildWorkspace(ws: Workspace, seedNo: number) {
  const rnd = mulberry32(seedNo)
  const emailDomain = ({ annex: 'annex-technologies.com', 'demo-manufacturing': 'demomanufacturing.co.ke' } as Record<string, string>)[ws.slug] ?? `${ws.slug}.org`

  const departments: Department[] = deptTemplates[ws.id]!.map((d, i) => ({
    id: `${ws.slug}-d${i + 1}`,
    name: d.name,
    color: d.color,
    headId: '',
    budgetKES: between(rnd, 8, 60) * 1_000_000,
  }))

  const employees: Employee[] = []
  const usedNames = new Set<string>()
  let n = 0

  const makeEmployee = (partial: Partial<Employee> & { name: string; gender: 'Female' | 'Male' }): Employee => {
    n++
    const start = addDays('2026-09-23', -between(rnd, 20, 2400))
    const dept = partial.departmentId ?? pick(rnd, departments).id
    const deptName = departments.find((d) => d.id === dept)!.name
    const employmentType: EmploymentType = partial.employmentType ?? (rnd() < 0.72 ? 'Full-time' : pick(rnd, ['Contract', 'Consultant', 'Consultant', 'Intern', 'Part-time'] as const))
    const status: EmployeeStatus = partial.status ?? (rnd() < 0.7 ? 'Active' : pick(rnd, ['Probation', 'Probation', 'On Leave', 'Onboarding', 'Notice Period'] as const))
    const probationStart = addDays('2026-09-23', -between(rnd, 5, 85))
    return {
      id: `${ws.slug}-e${String(n).padStart(3, '0')}`,
      workspaceId: ws.id,
      employeeNo: `${ws.slug.toUpperCase().slice(0, 3)}-${String(1000 + n)}`,
      email: slugEmail(partial.name, emailDomain),
      phone: `+254 7${between(rnd, 10, 99)} ${between(rnd, 100, 999)} ${between(rnd, 100, 999)}`,
      title: pick(rnd, titlesByDept[deptName] ?? ['Associate']),
      departmentId: dept,
      role: 'employee',
      employmentType,
      status,
      location: pick(rnd, locationsByWs[ws.id]!),
      startDate: status === 'Probation' || status === 'Onboarding' ? probationStart : start,
      birthday: `19${between(rnd, 80, 99)}-${String(between(rnd, 9, 11)).padStart(2, '0')}-${String(between(rnd, 1, 28)).padStart(2, '0')}`,
      salaryKES: between(rnd, 9, 60) * 10_000,
      probationEnd: status === 'Probation' || status === 'Onboarding' ? addDays(probationStart, 90) : undefined,
      performance: Math.round((2.4 + rnd() * 2.5) * 10) / 10,
      potential: pick(rnd, [1, 2, 2, 3, 3] as const),
      onboardingProgress: status === 'Onboarding' ? between(rnd, 15, 85) : status === 'Probation' ? between(rnd, 70, 100) : 100,
      kraPin: `A0${between(rnd, 10000000, 99999999)}${pick(rnd, ['K', 'L', 'M', 'P', 'Z'])}`,
      nationalId: String(between(rnd, 20000000, 39999999)),
      ...partial,
    }
  }

  // Leadership first
  const ceoSpec = leadership[ws.id]![0]!
  const ceo = makeEmployee({
    name: ceoSpec.name,
    gender: ceoSpec.gender,
    title: ceoSpec.title,
    role: 'ceo',
    departmentId: departments[0]!.id,
    employmentType: 'Full-time',
    status: 'Active',
    salaryKES: 1_450_000,
    performance: 4.6,
    potential: 3,
    location: 'Nairobi, KE',
  })
  employees.push(ceo)
  usedNames.add(ceo.name)

  for (const spec of leadership[ws.id]!.slice(1)) {
    const dept = departments.find((d) => d.name === spec.dept)!
    const e = makeEmployee({
      name: spec.name,
      gender: spec.gender,
      title: spec.title,
      role: spec.role,
      departmentId: dept.id,
      managerId: ceo.id,
      employmentType: 'Full-time',
      status: 'Active',
      salaryKES: between(rnd, 55, 85) * 10_000 + 300_000,
      performance: Math.round((3.8 + rnd() * 1.1) * 10) / 10,
      potential: 3,
      location: 'Nairobi, KE',
    })
    dept.headId = e.id
    employees.push(e)
    usedNames.add(e.name)
  }

  // Remaining department heads
  for (const dept of departments) {
    if (dept.headId) continue
    let name = ''
    let gender: 'Female' | 'Male' = 'Female'
    do {
      gender = rnd() < 0.5 ? 'Female' : 'Male'
      name = `${pick(rnd, gender === 'Female' ? firstF : firstM)} ${pick(rnd, lasts)}`
    } while (usedNames.has(name))
    usedNames.add(name)
    const e = makeEmployee({
      name,
      gender,
      title: leadTitle[dept.name] ?? `${dept.name} Lead`,
      role: 'manager',
      departmentId: dept.id,
      managerId: ceo.id,
      employmentType: 'Full-time',
      status: 'Active',
      salaryKES: between(rnd, 40, 70) * 10_000 + 200_000,
      potential: pick(rnd, [2, 3] as const),
    })
    dept.headId = e.id
    employees.push(e)
  }

  // Everyone else
  while (employees.length < sizes[ws.id]!) {
    const gender: 'Female' | 'Male' = rnd() < 0.47 ? 'Female' : 'Male'
    const name = `${pick(rnd, gender === 'Female' ? firstF : firstM)} ${pick(rnd, lasts)}`
    if (usedNames.has(name)) continue
    usedNames.add(name)
    const dept = pick(rnd, departments)
    const e = makeEmployee({ name, gender, departmentId: dept.id, managerId: dept.headId })
    if (e.employmentType === 'Consultant') e.role = 'consultant'
    employees.push(e)
  }

  // Guarantee a named HR officer and a named consultant for demo logins.
  const hrDept = departments.find((d) => /People/.test(d.name)) ?? departments.find((d) => /Admin/.test(d.name))!
  const hr = employees.find((e) => e.departmentId === hrDept.id && e.role === 'employee')
  if (hr) {
    hr.role = 'hr_officer'
    hr.title = 'HR Officer'
    hr.status = 'Active'
    hr.employmentType = 'Full-time'
  }
  const consultant = employees.find((e) => e.role === 'consultant') ?? employees.find((e) => e.role === 'employee')!
  consultant.role = 'consultant'
  consultant.employmentType = 'Consultant'
  consultant.status = 'Active'

  // Consultants carry a consulting title for their practice area.
  for (const e of employees) {
    if (e.role !== 'consultant') continue
    const dept = departments.find((d) => d.id === e.departmentId)!.name.replace(/ &.*$/, '')
    e.title = `${dept} Consultant`
  }

  return { departments, employees }
}

const built = {
  'ws-annex': buildWorkspace(workspaces[0]!, 20250415),
  'ws-demo': buildWorkspace(workspaces[1]!, 20240901),
  'ws-chqi': buildWorkspace(workspaces[2]!, 20230707),
}

export type WorkspaceId = keyof typeof built

/* ------------------------------------------------------------------
   Everything below is generated per workspace from its employees.
------------------------------------------------------------------- */

export interface WorkspaceData {
  workspace: Workspace
  departments: Department[]
  employees: Employee[]
  leaveRequests: LeaveRequest[]
  payrollRuns: PayrollRun[]
  policies: Policy[]
  complianceDocs: ComplianceDoc[]
  cases: HRCase[]
  offboardings: Offboarding[]
  timesheets: Timesheet[]
  surveys: Survey[]
  notifications: Notification[]
  kpis: KPI[]
  documents: DocFile[]
  holidays: Holiday[]
  onboardingTasks: OnboardingTask[]
  trends: {
    headcount: { month: string; headcount: number; hires: number; exits: number }[]
    leave: { month: string; annual: number; sick: number; other: number }[]
    hiringFunnel: { stage: string; count: number }[]
    attendance: { day: string; onTime: number; late: number; absent: number }[]
    engagement: { month: string; score: number; enps: number }[]
    payroll: { month: string; gross: number; net: number }[]
  }
}

const leaveTypes: LeaveType[] = ['Annual', 'Annual', 'Annual', 'Sick', 'Sick', 'Compassionate', 'Study', 'Paternity', 'Maternity']
const leaveReasons: Record<LeaveType, string> = {
  Annual: 'Family trip to the coast',
  Sick: 'Medical appointment and recovery',
  Maternity: 'Maternity leave',
  Paternity: 'Paternity leave — newborn',
  Compassionate: 'Bereavement in the family',
  Study: 'CPA Section 5 examinations',
}

function buildDerived(wsId: WorkspaceId, seedNo: number): WorkspaceData {
  const rnd = mulberry32(seedNo)
  const workspace = workspaces.find((w) => w.id === wsId)!
  const { departments, employees } = built[wsId]
  const active = employees.filter((e) => e.status !== 'Exited')
  const byRole = (r: Role) => employees.find((e) => e.role === r)!
  const hr = byRole('company_admin')
  const ceo = byRole('ceo')

  const leaveRequests: LeaveRequest[] = Array.from({ length: Math.min(18, Math.round(active.length / 2.6)) }, (_, i) => {
    const e = active[between(rnd, 1, active.length - 1)]!
    const type = pick(rnd, leaveTypes)
    const days = type === 'Maternity' ? 90 : type === 'Paternity' ? 14 : between(rnd, 1, 8)
    const start = addDays('2026-09-23', between(rnd, -30, 40))
    const status = i < 6 ? 'Pending' : pick(rnd, ['Approved', 'Approved', 'Approved', 'Rejected', 'Pending'] as const)
    return {
      id: `lv-${wsId}-${i}`,
      employeeId: e.id,
      type,
      start,
      end: addDays(start, days - 1),
      days,
      reason: leaveReasons[type],
      status,
      stage: status === 'Pending' ? (days > 10 ? 'CEO' : pick(rnd, ['Manager', 'HR'] as const)) : 'Complete',
      submitted: addDays(start, -between(rnd, 3, 20)),
      handoverTo: active[between(rnd, 0, active.length - 1)]!.id,
      handoverNotes: rnd() > 0.3,
    }
  })

  const scale = active.length / 48
  const payrollRuns: PayrollRun[] = ['September 2026', 'August 2026', 'July 2026', 'June 2026'].map((period, i) => {
    const gross = Math.round((14_850_000 + i * -180_000) * scale)
    const paye = Math.round(gross * 0.24)
    const shif = Math.round(gross * 0.0275)
    const nssf = Math.round(active.length * 4320)
    const housingLevy = Math.round(gross * 0.015)
    const bonuses = i === 0 ? Math.round(1_240_000 * scale) : i === 3 ? Math.round(980_000 * scale) : 0
    return {
      id: `pr-${wsId}-${i}`,
      period,
      status: i === 0 ? 'Pending Approval' : i === 1 ? 'Synced to Odoo' : 'Paid',
      employees: active.length - i,
      gross,
      net: gross - paye - shif - nssf - housingLevy + bonuses,
      paye,
      shif,
      nssf,
      housingLevy,
      bonuses,
      preparedBy: byRole('finance')?.name ?? hr.name,
      approvals: [
        { role: 'Finance', name: byRole('finance')?.name ?? hr.name, status: 'Approved', at: '2026-09-20' },
        { role: 'HR', name: hr.name, status: i === 0 ? 'Approved' : 'Approved', at: '2026-09-21' },
        { role: 'CEO', name: ceo.name, status: i === 0 ? 'Pending' : 'Approved', at: i === 0 ? undefined : '2026-08-27' },
      ],
    }
  })

  const policies: Policy[] = [
    { title: 'Code of Conduct', category: 'Ethics', mandatory: true, summary: 'Standards of professional behaviour, conflicts of interest and anti-bribery commitments.' },
    { title: 'Data Protection & Privacy', category: 'Compliance', mandatory: true, summary: 'How we handle personal data in line with the Kenya Data Protection Act, 2019.' },
    { title: 'Leave Policy', category: 'People', mandatory: true, summary: 'Entitlements, accrual, carry-over and approval routing for all leave types.' },
    { title: 'Remote & Hybrid Work', category: 'People', mandatory: false, summary: 'Eligibility, core hours and equipment for hybrid working.' },
    { title: 'Anti-Harassment & Grievance', category: 'Ethics', mandatory: true, summary: 'Zero-tolerance commitment and the confidential grievance procedure.' },
    { title: 'IT Acceptable Use', category: 'Security', mandatory: true, summary: 'Use of company devices, accounts, passwords and MFA.' },
    { title: 'Travel & Expenses', category: 'Finance', mandatory: false, summary: 'Per diems, booking rules and expense claims.' },
    { title: 'Health & Safety', category: 'Compliance', mandatory: true, summary: 'OSHA 2007 obligations, incident reporting and fire safety.' },
  ].map((p, i) => {
    const major = between(rnd, 1, 4)
    const minor = between(rnd, 0, 3)
    return {
      id: `pol-${wsId}-${i}`,
      ...p,
      version: `v${major}.${minor}`,
      updated: addDays('2026-09-23', -between(rnd, 4, 200)),
      owner: hr.name,
      acknowledged: i === 1 ? 64 : between(rnd, 72, 100),
      history: Array.from({ length: major }, (_, k) => ({
        version: `v${major - k}.${k === 0 ? minor : 0}`,
        date: addDays('2026-09-23', -between(rnd, 4, 200) - k * 240),
        note: k === 0 ? 'Updated to reflect 2026 statutory changes' : k === major - 1 ? 'Initial publication' : 'Clarified approval routing and definitions',
      })),
    }
  })

  const docTypes: ComplianceDoc['type'][] = ['Passport', 'Work Visa', 'Driving Licence', 'Contract', 'Academic Certificate', 'Certificate of Good Conduct', 'Professional License']
  const complianceDocs: ComplianceDoc[] = []
  active.forEach((e, idx) => {
    const count = between(rnd, 2, 4)
    for (let k = 0; k < count; k++) {
      const type = docTypes[(idx + k * 2) % docTypes.length]!
      const hasExpiry = ['Passport', 'Work Visa', 'Driving Licence', 'Certificate of Good Conduct', 'Professional License', 'Contract'].includes(type)
      const expiresIn = between(rnd, -20, 700)
      const expires = hasExpiry ? addDays('2026-09-23', expiresIn) : undefined
      const status: ComplianceDoc['status'] = rnd() < 0.05 ? 'Missing' : !expires ? 'Valid' : expiresIn < 0 ? 'Expired' : expiresIn < 60 ? 'Expiring' : 'Valid'
      complianceDocs.push({
        id: `cd-${wsId}-${idx}-${k}`,
        employeeId: e.id,
        type,
        number: type === 'Passport' ? `AK${between(rnd, 1000000, 9999999)}` : `${type.slice(0, 2).toUpperCase()}-${between(rnd, 10000, 99999)}`,
        issued: addDays('2026-09-23', -between(rnd, 200, 2000)),
        expires,
        status,
      })
    }
  })

  const caseTypes: HRCase['type'][] = ['Grievance', 'Disciplinary', 'Misconduct', 'Harassment', 'Performance']
  const cases: HRCase[] = Array.from({ length: 6 }, (_, i) => {
    const subject = active[between(rnd, 4, active.length - 1)]!
    const opened = addDays('2026-09-23', -between(rnd, 3, 60))
    const status = (['Investigating', 'Logged', 'Hearing', 'Awaiting Approval', 'Closed', 'Investigating'] as const)[i]!
    const type = caseTypes[i % caseTypes.length]!
    return {
      id: `case-${wsId}-${i}`,
      ref: `HR-2026-${String(41 + i).padStart(4, '0')}`,
      type,
      subjectId: subject.id,
      reportedBy: i % 2 === 0 ? 'Anonymous' : active[between(rnd, 4, active.length - 1)]!.id,
      opened,
      status,
      severity: (['Medium', 'Low', 'High', 'Critical', 'Low', 'Medium'] as const)[i]!,
      assignedTo: hr.id,
      confidential: i !== 4,
      summary: {
        Grievance: 'Concerns raised about workload distribution and overtime not being recognised.',
        Disciplinary: 'Repeated unexplained absence from scheduled shifts over a four-week period.',
        Misconduct: 'Alleged misuse of company fuel card outside of approved business travel.',
        Harassment: 'Report of inappropriate comments made during team meetings.',
        Performance: 'Sustained under-delivery against agreed quarterly objectives.',
      }[type],
      timeline: [
        { date: opened, title: 'Case logged', by: 'System', note: 'Case created via confidential intake form.' },
        { date: addDays(opened, 1), title: 'Assigned to investigator', by: hr.name, note: 'Investigation lead assigned and access restricted to case team.' },
        ...(status !== 'Logged' ? [{ date: addDays(opened, 4), title: 'Statements collected', by: hr.name, note: '3 witness statements recorded and uploaded.' }] : []),
        ...(status === 'Hearing' || status === 'Awaiting Approval' || status === 'Closed' ? [{ date: addDays(opened, 9), title: 'Hearing held', by: hr.name, note: 'Employee attended with a colleague of their choice.' }] : []),
        ...(status === 'Closed' ? [{ date: addDays(opened, 14), title: 'Case closed', by: ceo.name, note: 'Outcome communicated in writing. Written warning issued.' }] : []),
      ],
      evidence: [
        { name: 'intake-statement.pdf', size: '184 KB', uploaded: opened },
        ...(status !== 'Logged' ? [{ name: 'witness-statements.zip', size: '2.1 MB', uploaded: addDays(opened, 4) }] : []),
      ],
    }
  })

  const noticeEmployees = active.filter((e) => e.status === 'Notice Period')
  const offboardingPool = noticeEmployees.length >= 3 ? noticeEmployees.slice(0, 4) : [...noticeEmployees, ...active.slice(-3)].slice(0, 3)
  const offboardings: Offboarding[] = offboardingPool.map((e, i) => {
    const noticeDays = 30
    const submitted = addDays('2026-09-23', -between(rnd, 3, 25))
    const assets = ['Laptop', 'Access card', 'SIM card', 'Email account', 'GitHub access', 'Slack access'].map((name) => ({ name, returned: rnd() < 0.45 + i * 0.1 }))
    const done = assets.filter((a) => a.returned).length
    return {
      id: `off-${wsId}-${i}`,
      employeeId: e.id,
      reason: pick(rnd, ['Resignation', 'Resignation', 'Contract End', 'Retirement'] as const),
      submitted,
      lastDay: addDays(submitted, noticeDays),
      noticeDays,
      progress: Math.round((done / assets.length) * 70 + (i % 2 ? 20 : 5)),
      handover: rnd() > 0.4,
      exitInterview: rnd() > 0.6,
      finalDuesKES: Math.round(e.salaryKES * (0.8 + rnd() * 0.9)),
      assets,
    }
  })

  const projects =
    wsId === 'ws-annex'
      ? ['Retail Bank Data Platform', 'Telco Analytics Lakehouse', 'Claims Fraud Model', 'Internal Tools']
      : wsId === 'ws-demo'
        ? ['Plant ERP Rollout', 'Warehouse Automation', 'Line 3 Upgrade', 'Internal Tools']
        : ['Patient Records Migration', 'Research Data Portal', 'Clinic Scheduling', 'Internal Tools']
  const consultants = employees.filter((e) => e.employmentType === 'Consultant' || e.role === 'consultant')
  const timesheets: Timesheet[] = consultants.flatMap((c, ci) =>
    ['2026-09-21', '2026-09-14', '2026-09-07'].map((week, wi) => ({
      id: `ts-${c.id}-${wi}`,
      employeeId: c.id,
      week,
      rate: between(rnd, 25, 60) * 100,
      status: wi === 0 ? (ci % 2 ? 'Pending' : 'Draft') : wi === 1 ? pick(rnd, ['Pending', 'Approved'] as const) : 'Approved',
      entries: projects.slice(0, between(rnd, 2, 3)).map((project, pi) => ({
        project,
        billable: pi !== 2,
        hours: [1, 2, 3, 4, 5, 6, 7].map((d) => (d > 5 ? 0 : between(rnd, pi === 0 ? 4 : 1, pi === 0 ? 7 : 3))),
      })),
    })),
  )

  const surveys: Survey[] = [
    { id: 's1', title: 'Q3 Pulse — How are we doing?', status: 'Live', responses: Math.round(active.length * 0.68), audience: active.length, engagement: 78, enps: 32, closes: '2026-09-30', anonymous: true },
    { id: 's2', title: 'Hybrid Work Experience', status: 'Live', responses: Math.round(active.length * 0.41), audience: active.length, engagement: 72, enps: 24, closes: '2026-10-04', anonymous: true },
    { id: 's3', title: 'Q2 Pulse', status: 'Closed', responses: Math.round(active.length * 0.82), audience: active.length, engagement: 74, enps: 27, closes: '2026-06-28', anonymous: true },
    { id: 's4', title: 'Manager Effectiveness', status: 'Draft', responses: 0, audience: active.length, engagement: 0, enps: 0, closes: '2026-10-20', anonymous: false },
  ]

  const onProbation = active.filter((e) => e.status === 'Probation')
  const notifications: Notification[] = [
    { id: 'n1', type: 'approval', title: `${leaveRequests[0] ? employees.find((e) => e.id === leaveRequests[0]!.employeeId)!.name : 'An employee'} requested ${leaveRequests[0]?.days ?? 3} days of leave`, body: 'Awaiting your approval as line manager.', time: '6m ago', read: false, href: '/app/leave' },
    { id: 'n2', type: 'payroll', title: 'September payroll awaiting CEO approval', body: `Prepared by ${payrollRuns[0]!.preparedBy}. Finance and HR have signed off.`, time: '42m ago', read: false, href: '/app/payroll' },
    { id: 'n3', type: 'document', title: 'Work visa expiring in 18 days', body: `${active[5]?.name}'s work permit expires soon. Renewal reminder sent.`, time: '2h ago', read: false, href: '/app/compliance' },
    { id: 'n4', type: 'probation', title: `${onProbation[0]?.name ?? active[7]!.name}'s 90-day appraisal is due`, body: 'Probation ends this week. Schedule the confirmation review.', time: '3h ago', read: false, href: '/app/onboarding?tab=probation' },
    { id: 'n5', type: 'policy', title: 'Data Protection policy v3.1 published', body: '36% of employees have not yet acknowledged it.', time: 'Yesterday', read: true, href: '/app/compliance?tab=policies' },
    { id: 'n6', type: 'performance', title: 'Q3 reviews open for self-assessment', body: 'Reviews close on 10 October. 14 self-reviews submitted so far.', time: 'Yesterday', read: true, href: '/app/performance' },
    { id: 'n7', type: 'leave', title: 'Timesheet submitted for approval', body: `${consultants[0]?.name ?? 'A consultant'} logged 42 billable hours this week.`, time: '2 days ago', read: true, href: '/app/timesheets' },
    { id: 'n8', type: 'system', title: 'Odoo sync completed', body: 'August payroll journal entries posted to Odoo successfully.', time: '3 days ago', read: true, href: '/app/payroll' },
  ]

  const kpis: KPI[] = [
    { perspective: 'Financial', name: 'Revenue growth (YoY)', target: 35, actual: 31, unit: '%', weight: 15 },
    { perspective: 'Financial', name: 'Operating cost ratio', target: 42, actual: 44, unit: '%', weight: 10 },
    { perspective: 'Customer', name: 'Net Promoter Score', target: 55, actual: 61, unit: '', weight: 15 },
    { perspective: 'Customer', name: 'First response time', target: 2, actual: 1.6, unit: 'hrs', weight: 10 },
    { perspective: 'Internal Process', name: 'Deployment frequency', target: 20, actual: 24, unit: '/mo', weight: 10 },
    { perspective: 'Internal Process', name: 'Payroll processed on time', target: 100, actual: 100, unit: '%', weight: 10 },
    { perspective: 'Learning & Growth', name: 'Training hours per employee', target: 24, actual: 17, unit: 'hrs', weight: 15 },
    { perspective: 'Learning & Growth', name: 'Internal promotion rate', target: 20, actual: 22, unit: '%', weight: 15 },
  ].map((k, i) => ({ ...k, id: `kpi-${i}`, owner: employees[i % 6]!.name })) as KPI[]

  const folders = ['Contracts', 'NDAs', 'Offer Letters', 'Certificates', 'Payslips', 'Policies']
  const documents: DocFile[] = folders.flatMap((folder, fi) =>
    Array.from({ length: between(rnd, 3, 6) }, (_, k) => {
      const e = active[(fi * 7 + k * 3) % active.length]!
      const base = {
        Contracts: `Employment Contract — ${e.name}`,
        NDAs: `NDA — ${e.name}`,
        'Offer Letters': `Offer Letter — ${e.name}`,
        Certificates: `${pick(rnd, ['BSc Certificate', 'CPA Certificate', 'Good Conduct', 'AWS Certification'])} — ${e.name}`,
        Payslips: `Payslip ${['Aug', 'Jul', 'Jun', 'May', 'Apr', 'Mar'][k]} 2026 — ${e.name}`,
        Policies: policies[k % policies.length]!.title,
      }[folder]!
      const ver = between(rnd, 1, 3)
      return {
        id: `doc-${fi}-${k}`,
        name: base,
        folder,
        size: `${between(rnd, 80, 900)} KB`,
        type: (folder === 'Payslips' ? 'pdf' : pick(rnd, ['pdf', 'pdf', 'docx'] as const)) as DocFile['type'],
        updated: addDays('2026-09-23', -between(rnd, 0, 120)),
        owner: hr.name,
        version: `v${ver}.0`,
        versions: Array.from({ length: ver }, (_, v) => ({ version: `v${ver - v}.0`, date: addDays('2026-09-23', -between(rnd, 0, 120) - v * 60), by: v === 0 ? hr.name : ceo.name })),
      }
    }),
  )

  const holidays: Holiday[] = [
    { date: '2026-01-01', name: "New Year's Day", country: 'Kenya' },
    { date: '2026-04-03', name: 'Good Friday', country: 'Kenya' },
    { date: '2026-04-06', name: 'Easter Monday', country: 'Kenya' },
    { date: '2026-05-01', name: 'Labour Day', country: 'Kenya' },
    { date: '2026-06-01', name: 'Madaraka Day', country: 'Kenya' },
    { date: '2026-10-10', name: 'Mazingira Day', country: 'Kenya' },
    { date: '2026-10-20', name: 'Mashujaa Day', country: 'Kenya' },
    { date: '2026-12-12', name: 'Jamhuri Day', country: 'Kenya' },
    { date: '2026-12-25', name: 'Christmas Day', country: 'Kenya' },
    { date: '2026-12-26', name: 'Boxing Day', country: 'Kenya' },
    { date: '2026-10-01', name: 'Independence Day', country: 'Nigeria' },
    { date: '2026-10-09', name: 'Independence Day', country: 'Uganda' },
    { date: '2026-07-04', name: 'Liberation Day', country: 'Rwanda' },
  ]

  const onboardingTasks: OnboardingTask[] = [
    { id: 'id', title: 'Upload National ID', description: 'Front and back of your national ID or Huduma card.', category: 'Documents', required: true },
    { id: 'kra', title: 'Upload KRA PIN certificate', description: 'Needed for PAYE filing on iTax.', category: 'Documents', required: true },
    { id: 'shif', title: 'Upload SHIF registration', description: 'Social Health Insurance Fund member number.', category: 'Documents', required: true },
    { id: 'nssf', title: 'Upload NSSF card', description: 'National Social Security Fund membership.', category: 'Documents', required: true },
    { id: 'passport', title: 'Upload passport', description: 'Bio-data page. Required for regional travel.', category: 'Documents', required: false },
    { id: 'policy', title: 'Accept company policies', description: 'Read and acknowledge the Code of Conduct and 5 other policies.', category: 'Policies', required: true },
    { id: 'nda', title: 'Sign NDA', description: 'Non-disclosure and IP assignment agreement.', category: 'Policies', required: true },
    { id: 'emergency', title: 'Add emergency contact', description: 'Someone we can reach if something happens at work.', category: 'Profile', required: true },
    { id: 'bank', title: 'Add bank details', description: 'Account for salary payments. Verified by Finance.', category: 'Finance', required: true },
  ]

  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
  let hc = Math.round(active.length * 0.74)
  const headcount = months.map((month, i) => {
    const hires = between(rnd, 1, Math.max(2, Math.round(active.length / 12)))
    const exits = between(rnd, 0, Math.max(1, Math.round(active.length / 30)))
    hc = i === months.length - 1 ? active.length : Math.min(active.length, hc + hires - exits)
    return { month, headcount: hc, hires, exits }
  })

  const trends = {
    headcount,
    leave: months.map((month, i) => ({
      month,
      annual: between(rnd, 8, 22) + (i === 2 || i === 8 ? 18 : 0),
      sick: between(rnd, 3, 10),
      other: between(rnd, 1, 5),
    })),
    hiringFunnel: [
      { stage: 'Applied', count: 412 },
      { stage: 'Screened', count: 164 },
      { stage: 'Interviewed', count: 58 },
      { stage: 'Offer', count: 14 },
      { stage: 'Hired', count: 11 },
    ].map((s) => ({ ...s, count: Math.round(s.count * Math.max(0.4, scale)) })),
    attendance: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => {
      const late = between(rnd, 1, 6)
      const absent = between(rnd, 0, 3)
      return { day, onTime: active.length - late - absent, late, absent }
    }),
    engagement: months.slice(-6).map((month, i) => ({ month, score: 68 + i * 2 + between(rnd, -2, 2), enps: 18 + i * 3 + between(rnd, -3, 3) })),
    payroll: months.map((month, i) => {
      const gross = Math.round(12_400_000 * scale + i * 210_000 * scale + between(rnd, -150_000, 150_000))
      return { month, gross, net: Math.round(gross * 0.69) }
    }),
  }

  return {
    workspace,
    departments,
    employees,
    leaveRequests,
    payrollRuns,
    policies,
    complianceDocs,
    cases,
    offboardings,
    timesheets,
    surveys,
    notifications,
    kpis,
    documents,
    holidays,
    onboardingTasks,
    trends,
  }
}

export const workspaceData: Record<WorkspaceId, WorkspaceData> = {
  'ws-annex': buildDerived('ws-annex', 22),
  'ws-demo': buildDerived('ws-demo', 11),
  'ws-chqi': buildDerived('ws-chqi', 33),
}

export function findWorkspaceBySlug(slug: string) {
  return workspaces.find((w) => w.slug === slug.toLowerCase().trim())
}
