import type { Department, Employee, KPI } from '@/data/types'
import type { KrUpdate } from './api'

export function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/* ------------------------------ KPIs ------------------------------ */

const LOWER_IS_BETTER = new Set(['Operating cost ratio', 'First response time'])

type KpiLike = KPI & { lowerIsBetter?: boolean }

export const isLowerBetter = (k: KpiLike) => k.lowerIsBetter ?? LOWER_IS_BETTER.has(k.name)
export function attainment(k: KpiLike) {
  if (isLowerBetter(k)) return k.actual ? k.target / k.actual : 1
  return k.target ? k.actual / k.target : 0
}
export const kpiOnTrack = (k: KpiLike) => attainment(k) >= 0.95

export const PERSPECTIVES: KPI['perspective'][] = ['Financial', 'Customer', 'Internal Process', 'Learning & Growth']

export function weightedScore(kpis: KpiLike[]) {
  const w = kpis.reduce((s, k) => s + k.weight, 0)
  if (!w) return 0
  return (kpis.reduce((s, k) => s + Math.min(1, attainment(k)) * k.weight, 0) / w) * 100
}

/* ------------------------------ OKRs ------------------------------ */

export interface KeyResult {
  id?: string
  updates?: KrUpdate[]
  title: string
  progress: number
  current: string
  target: string
}
export interface Objective {
  id: string
  title: string
  ownerId: string
  confidence: 'High' | 'Medium' | 'Low'
  keyResults: KeyResult[]
}

type Tpl = { title: string; dept?: RegExp; confidence: Objective['confidence']; krs: KeyResult[] }

const OKR_TEMPLATES: Record<string, Tpl[]> = {
  'ws-demo': [
    {
      title: 'Hit record output without compromising safety',
      dept: /Production/,
      confidence: 'High',
      krs: [
        { title: 'Raise line OEE to 78%', progress: 84, current: '74%', target: '78%' },
        { title: 'Zero lost-time incidents this quarter', progress: 100, current: '0', target: '0' },
        { title: 'Cut changeover time to 25 minutes', progress: 62, current: '31 min', target: '25 min' },
      ],
    },
    {
      title: 'Ship right-first-time to every customer',
      dept: /Quality/,
      confidence: 'Medium',
      krs: [
        { title: 'Defect rate below 0.8%', progress: 70, current: '1.1%', target: '< 0.8%' },
        { title: 'Pass ISO 9001 surveillance audit', progress: 90, current: 'Pre-audit done', target: 'Certified' },
        { title: 'On-time delivery at 96%', progress: 88, current: '94%', target: '96%' },
      ],
    },
    {
      title: 'Build a resilient supply chain',
      dept: /Supply/,
      confidence: 'Medium',
      krs: [
        { title: 'Dual-source 80% of critical inputs', progress: 55, current: '44%', target: '80%' },
        { title: 'Inventory turns to 9×', progress: 72, current: '7.8×', target: '9×' },
        { title: 'Supplier lead time under 21 days', progress: 64, current: '26 days', target: '21 days' },
      ],
    },
    {
      title: 'Make Demo Manufacturing a great place to build a career',
      confidence: 'High',
      krs: [
        { title: 'Engagement score ≥ 80', progress: 86, current: '77', target: '80' },
        { title: '24 training hours per employee', progress: 58, current: '14 h', target: '24 h' },
        { title: 'Promote 20% of supervisors from within', progress: 75, current: '15%', target: '20%' },
      ],
    },
  ],
  'ws-annex': [
    {
      title: 'Deliver flagship client programmes on time',
      dept: /Delivery/,
      confidence: 'Medium',
      krs: [
        { title: 'Retail Bank Data Platform go-live by 31 Oct', progress: 74, current: 'Sprint 9 of 12', target: 'Go-live' },
        { title: 'Client CSAT ≥ 4.5 across accounts', progress: 92, current: '4.4', target: '4.5' },
        { title: 'Keep billable utilisation at 78%', progress: 81, current: '74%', target: '78%' },
      ],
    },
    {
      title: 'Grow recurring revenue from managed services',
      dept: /Sales/,
      confidence: 'High',
      krs: [
        { title: 'Sign 4 new retainer clients', progress: 75, current: '3', target: '4' },
        { title: 'MRR to KES 18M', progress: 68, current: 'KES 12.2M', target: 'KES 18M' },
        { title: 'Pipeline coverage 3× target', progress: 90, current: '2.7×', target: '3×' },
      ],
    },
    {
      title: 'Raise the bar on engineering excellence',
      dept: /Engineering/,
      confidence: 'High',
      krs: [
        { title: '80% automated test coverage on core repos', progress: 71, current: '57%', target: '80%' },
        { title: 'Deploy to production 20× a month', progress: 100, current: '24', target: '20' },
        { title: 'Every engineer completes AWS certification', progress: 40, current: '6 of 15', target: '15' },
      ],
    },
  ],
  'ws-chqi': [
    {
      title: 'Improve patient outcomes across partner clinics',
      dept: /Clinical/,
      confidence: 'Medium',
      krs: [
        { title: 'Reduce readmission rate to 6%', progress: 64, current: '7.4%', target: '6%' },
        { title: 'Roll out digital triage in 12 clinics', progress: 75, current: '9', target: '12' },
        { title: 'Patient satisfaction ≥ 90%', progress: 88, current: '87%', target: '90%' },
      ],
    },
    {
      title: 'Advance high-impact research output',
      dept: /Research/,
      confidence: 'High',
      krs: [
        { title: 'Publish 3 peer-reviewed papers', progress: 67, current: '2', target: '3' },
        { title: 'Secure 2 new grant awards', progress: 50, current: '1', target: '2' },
      ],
    },
    {
      title: 'Run a lean, compliant operation',
      dept: /Admin/,
      confidence: 'High',
      krs: [
        { title: 'Pass KMPDC facility audit with no findings', progress: 100, current: 'Passed', target: 'Pass' },
        { title: 'Cut procurement cycle to 5 days', progress: 60, current: '8 days', target: '5 days' },
        { title: '100% staff licences valid', progress: 94, current: '94%', target: '100%' },
      ],
    },
  ],
}

export function buildObjectives(workspaceId: string, departments: Department[], employees: Employee[]): Objective[] {
  const tpls = OKR_TEMPLATES[workspaceId] ?? OKR_TEMPLATES['ws-annex']!
  return tpls.map((t, i) => {
    const dept = departments.find((d) => t.dept?.test(d.name))
    return {
      id: `okr-${i}`,
      title: t.title,
      ownerId: dept?.headId || employees[0]!.id,
      confidence: t.confidence,
      keyResults: t.krs.map((k, j) => ({ ...k, id: `okr-${i}-kr-${j}` })),
    }
  })
}

export const objectiveProgress = (o: Objective) => (o.keyResults.length ? Math.round(o.keyResults.reduce((s, k) => s + k.progress, 0) / o.keyResults.length) : 0)

/* ------------------------------ Reviews ------------------------------ */

export const COMPETENCIES = [
  { key: 'delivery', label: 'Delivery & results', hint: 'Hits commitments with quality' },
  { key: 'craft', label: 'Craft & expertise', hint: 'Depth in their discipline' },
  { key: 'collab', label: 'Collaboration', hint: 'Works across teams, gives credit' },
  { key: 'ownership', label: 'Ownership', hint: 'Acts like an owner, follows through' },
  { key: 'comms', label: 'Communication', hint: 'Clear, timely, candid' },
]

export const RATING_LABELS = ['Unsatisfactory', 'Needs improvement', 'Meets expectations', 'Exceeds expectations', 'Exceptional']

export const CYCLE_STAGES = ['Self review', 'Manager review', 'Peer feedback', 'Calibration', 'Released']

export type StepStatus = 'Submitted' | 'In Progress' | 'Not started'

export interface ReviewRow {
  employee: Employee
  self: StepStatus
  manager: StepStatus
  peer: StepStatus
  final?: number
  peerCount?: number
  myPeerStatus?: StepStatus | null
}

export function reviewFor(e: Employee): ReviewRow {
  const h = hash(e.id + 'q3')
  const self: StepStatus = h % 10 < 7 ? 'Submitted' : h % 10 < 9 ? 'In Progress' : 'Not started'
  const manager: StepStatus = self !== 'Submitted' ? 'Not started' : h % 7 < 4 ? 'Submitted' : h % 7 < 6 ? 'In Progress' : 'Not started'
  const peer: StepStatus = h % 5 < 3 ? 'Submitted' : h % 5 < 4 ? 'In Progress' : 'Not started'
  const final = manager === 'Submitted' ? Math.round(e.performance * 10) / 10 : undefined
  return { employee: e, self, manager, peer, final }
}

export const PEER_QUOTES = [
  'Always the first to jump on a production issue — and writes the best post-mortems on the team.',
  'Brings calm to chaotic weeks. I would love to see them present more in leadership forums.',
  'Very generous with time when onboarding new joiners. Could delegate more instead of doing it all.',
  'Their stakeholder updates are crisp. Sometimes pushes back late rather than early in planning.',
  'Raised the quality bar for the whole squad this quarter.',
]

/* ------------------------------ 9-box ------------------------------ */

export const perfBucket = (p: number) => (p < 3.3 ? 0 : p < 4.1 ? 1 : 2)

export const NINE_BOX: Record<string, { label: string; hint: string; strength: number }> = {
  '3-0': { label: 'Rough diamond', hint: 'High potential, low performance', strength: 1 },
  '3-1': { label: 'High potential', hint: 'Develop quickly', strength: 2 },
  '3-2': { label: 'Star', hint: 'Future leader', strength: 3 },
  '2-0': { label: 'Inconsistent', hint: 'Coach on delivery', strength: 0 },
  '2-1': { label: 'Core player', hint: 'Solid contributor', strength: 1 },
  '2-2': { label: 'High performer', hint: 'Stretch assignments', strength: 2 },
  '1-0': { label: 'Talent risk', hint: 'Performance plan', strength: 0 },
  '1-1': { label: 'Effective', hint: 'Keep engaged', strength: 0 },
  '1-2': { label: 'Trusted pro', hint: 'Deep expert', strength: 1 },
}

export type Readiness = 'Ready now' | '1–2 years' | '3+ years'
export function readinessOf(e: Employee): Readiness {
  const score = e.performance + e.potential * 0.5
  return score >= 5.4 ? 'Ready now' : score >= 4.6 ? '1–2 years' : '3+ years'
}
export function flightRisk(e: Employee): 'Low' | 'Medium' | 'High' {
  const h = hash(e.id + 'risk') % 10
  if (e.performance >= 4.3 && h < 4) return 'High'
  return h < 3 ? 'Medium' : h < 8 ? 'Low' : 'Medium'
}

export function quarterTrend(base: number) {
  return [
    { quarter: "Q4'25", rating: Math.round((base - 0.22) * 100) / 100 },
    { quarter: "Q1'26", rating: Math.round((base - 0.14) * 100) / 100 },
    { quarter: "Q2'26", rating: Math.round((base - 0.09) * 100) / 100 },
    { quarter: "Q3'26", rating: Math.round(base * 100) / 100 },
  ]
}
