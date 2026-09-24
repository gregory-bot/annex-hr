import { addDays, format, parseISO } from 'date-fns'
import type { Employee, HRCase } from '@/data/types'
import { TODAY } from '@/lib/utils'

export const CASE_STAGES: HRCase['status'][] = ['Logged', 'Investigating', 'Hearing', 'Awaiting Approval', 'Closed']
export const CASE_TYPES: HRCase['type'][] = ['Disciplinary', 'Grievance', 'Harassment', 'Misconduct', 'Performance']
export const SEVERITIES: HRCase['severity'][] = ['Low', 'Medium', 'High', 'Critical']
export const MASK = '•••• ••••'

export type ApprovalState = 'Approved' | 'Rejected' | 'Pending' | 'Waiting'
export type ApprovalStep = 'investigator' | 'hr' | 'ceo'

/** Case as served by GET /lifecycle/cases — the subject is null while masked for this viewer. */
export interface CaseItem {
  id: string
  ref: string
  type: HRCase['type']
  subjectId: string | null
  subjectName: string | null
  subjectTitle: string | null
  masked: boolean
  reportedBy: string
  reporterName: string
  opened: string
  status: HRCase['status']
  severity: HRCase['severity']
  assignedTo: string
  assigneeName: string
  confidential: boolean
  summary: string
  timeline: HRCase['timeline']
  evidenceCount: number
}

export interface CaseEvidence {
  id: string | null
  name: string
  size: string
  uploaded: string
  downloadable: boolean
  uploadedBy?: string | null
}

export interface CaseNote {
  id: string
  body: string
  visibility: 'hr_only' | 'case_team'
  author: string
  authorId: string | null
  createdAt: string
}

export interface CaseApproval {
  step: ApprovalStep
  stage: string
  status: ApprovalState
  approver: string
  decidedAt: string
  comment: string | null
  canAct: boolean
}

export interface CaseDetailData extends CaseItem {
  evidence: CaseEvidence[]
  notes: CaseNote[]
  approvals: CaseApproval[]
  canSeeHrNotes: boolean
}

export interface AccessEntry {
  action: string
  reason: string | null
  at: string
  by: string | null
}

export const ACCESS_LABELS: Record<string, string> = {
  viewed: 'Opened case file',
  revealed_identity: 'Revealed subject identity',
  uploaded_evidence: 'Uploaded evidence',
  downloaded_evidence: 'Downloaded evidence',
  created: 'Created case',
}

export const APPROVAL_STEPS: { step: ApprovalStep; stage: string; roles: string[] }[] = [
  { step: 'investigator', stage: 'Investigator recommendation', roles: ['hr_officer', 'company_admin', 'super_admin'] },
  { step: 'hr', stage: 'HR Head review', roles: ['company_admin', 'super_admin'] },
  { step: 'ceo', stage: 'CEO sign-off', roles: ['ceo', 'super_admin'] },
]

export function shiftDate(date: string, days: number) {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

export function resolutionDays(c: Pick<CaseItem, 'timeline' | 'opened'>) {
  const closed = c.timeline.find((t) => t.title === 'Case closed')
  if (!closed) return null
  return Math.round((parseISO(closed.date).getTime() - parseISO(c.opened).getTime()) / 86_400_000)
}

// ── Mock mode (no backend): build the same shapes from the in-browser demo data ──
export function mockApprovals(status: HRCase['status'], investigator: string, hrHead: string, ceo: string): CaseApproval[] {
  const init: Record<string, ApprovalState[]> = {
    Closed: ['Approved', 'Approved', 'Approved'],
    'Awaiting Approval': ['Approved', 'Pending', 'Waiting'],
    Hearing: ['Pending', 'Waiting', 'Waiting'],
  }
  const s = init[status] ?? ['Waiting', 'Waiting', 'Waiting']
  const names = [investigator, hrHead, ceo]
  return APPROVAL_STEPS.map((a, i) => ({ step: a.step, stage: a.stage, status: s[i]!, approver: names[i]!, decidedAt: '', comment: null, canAct: false }))
}

export function mockDetail(c: HRCase, employee: (id?: string) => Employee | undefined, hrHead?: Employee, ceo?: Employee): CaseDetailData {
  const subject = employee(c.subjectId)
  const assignee = employee(c.assignedTo)
  const manager = employee(subject?.managerId)
  return {
    id: c.id,
    ref: c.ref,
    type: c.type,
    subjectId: c.subjectId,
    subjectName: subject?.name ?? 'Unknown employee',
    subjectTitle: subject?.title ?? null,
    masked: c.confidential,
    reportedBy: c.reportedBy,
    reporterName: c.reportedBy === 'Anonymous' ? 'Anonymous' : (employee(c.reportedBy)?.name ?? 'Unknown'),
    opened: c.opened,
    status: c.status,
    severity: c.severity,
    assignedTo: c.assignedTo,
    assigneeName: assignee?.name ?? '—',
    confidential: c.confidential,
    summary: c.summary,
    timeline: c.timeline,
    evidenceCount: c.evidence.length,
    evidence: c.evidence.map((e) => ({ id: null, name: e.name, size: e.size, uploaded: e.uploaded, downloadable: false })),
    notes: [
      {
        id: `${c.id}-n1`,
        body: `Spoke with ${manager?.name.split(' ')[0] ?? 'the line manager'} (line manager): expectations were discussed informally before escalation.`,
        visibility: 'case_team',
        author: assignee?.name ?? 'Investigator',
        authorId: c.assignedTo,
        createdAt: `${shiftDate(c.opened, 1)}T09:00:00.000Z`,
      },
      {
        id: `${c.id}-n2`,
        body: 'Reviewed prior record — no previous warnings on file. Recommend a fair-hearing process under Section 41 of the Employment Act before any sanction.',
        visibility: 'hr_only',
        author: hrHead?.name ?? 'HR',
        authorId: hrHead?.id ?? null,
        createdAt: `${shiftDate(c.opened, 2)}T09:00:00.000Z`,
      },
    ],
    approvals: mockApprovals(c.status, assignee?.name ?? 'Investigator', hrHead?.name ?? 'Head of HR', ceo?.name ?? 'Chief Executive'),
    canSeeHrNotes: true,
  }
}

export function toItem(d: CaseDetailData): CaseItem {
  const { evidence, notes, approvals, canSeeHrNotes, ...item } = d
  void notes
  void approvals
  void canSeeHrNotes
  return { ...item, evidenceCount: evidence.length }
}

/** Masks a mock record for a viewer who has not revealed it. */
export function maskFor(d: CaseDetailData, revealed: boolean): CaseDetailData {
  const masked = d.confidential && !revealed
  return masked ? { ...d, masked, subjectId: null, subjectName: null, subjectTitle: null } : { ...d, masked: false }
}

export const nowIso = () => `${TODAY}T${new Date().toISOString().slice(11)}`
