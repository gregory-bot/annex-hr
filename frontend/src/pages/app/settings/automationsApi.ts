/** Automations API: scheduled reminders & alerts (HR admins). */
import { api, USE_MOCK_API } from '@/lib/api'

export type RuleKey = 'probation' | 'document_expiry' | 'onboarding_nudges' | 'timesheet_approvals' | 'leave_approvals' | 'policy_acknowledgements'

export interface Schedule {
  frequency: 'daily' | 'weekly'
  /** 0 = Monday … 6 = Sunday */
  weekday: number
  /** HH:MM, Africa/Nairobi */
  time: string
}

export interface RuleConfig {
  schedule: Schedule
  email: boolean
  days?: number[]
  includeExpired?: boolean
  hrAfterDays?: number
  olderThanDays?: number
  graceDays?: number
}

export interface LogEntry {
  id: string
  rule: RuleKey
  subjectKey: string
  summary: string
  recipients: string[]
  emails: number
  sentAt: string
}

export interface RunSummary {
  at: string
  trigger: string
  reminders: number
  notifications: number
  emails: number
  emailSkipped: string | null
}

export interface AutomationRule {
  key: RuleKey
  name: string
  description: string
  audience: string
  enabled: boolean
  config: RuleConfig
  defaults: RuleConfig
  lastRunAt: string | null
  lastRunSummary: RunSummary | null
  nextRunAt: string | null
  updatedAt: string | null
  emailSkipped: string | null
  totalSent: number
  recent: LogEntry[]
}

export interface AutomationsView {
  schedulerRunning: boolean
  timezone: string
  rules: AutomationRule[]
  activity: LogEntry[]
}

export interface RunResult {
  rule: RuleKey
  workspace: string
  dryRun: boolean
  matched: number
  alreadySent: number
  reminders: { subjectKey: string; summary: string; recipients: string[] }[]
  notifications: number
  emails: { to: string; name: string; subject: string }[]
  emailsSent: number
  emailSkipped: string | null
}

export type RulePatch = { enabled?: boolean; config?: Partial<Omit<RuleConfig, 'schedule'>> & { schedule?: Partial<Schedule> } }

/* ------------------------------ mock mode ------------------------------ */

const daily = (time: string): Schedule => ({ frequency: 'daily', weekday: 0, time })

const MOCK_RULES: Omit<AutomationRule, 'config' | 'enabled' | 'lastRunAt' | 'lastRunSummary' | 'nextRunAt' | 'updatedAt' | 'emailSkipped' | 'totalSent' | 'recent'>[] = [
  { key: 'probation', name: 'Probation appraisals', description: 'Reminds the line manager and HR ahead of each probation end date, and on the day the 90-day appraisal is due.', audience: 'Line manager and HR', defaults: { schedule: daily('08:00'), email: true, days: [60, 30, 0] } },
  { key: 'document_expiry', name: 'Expiring documents', description: 'Warns employees and HR when a passport, work visa, licence or other compliance document is about to expire or has expired.', audience: 'Employee and HR', defaults: { schedule: daily('08:00'), email: true, days: [90, 60, 30, 7], includeExpired: true } },
  { key: 'onboarding_nudges', name: 'Onboarding nudges', description: 'Nudges new starters who still have required onboarding tasks open a few days after their start date, and alerts HR when they fall behind.', audience: 'New starter, then HR', defaults: { schedule: daily('08:00'), email: true, days: [1, 3, 7], hrAfterDays: 7 } },
  { key: 'timesheet_approvals', name: 'Timesheet approvals', description: "Weekly digest of submitted timesheets still waiting for approval, sent to the consultant's line manager (or HR and finance when there is none).", audience: 'Line manager, or HR and finance', defaults: { schedule: { frequency: 'weekly', weekday: 0, time: '09:00' }, email: true, olderThanDays: 3 } },
  { key: 'leave_approvals', name: 'Leave approvals', description: 'Chases leave requests that have waited too long at their current stage, sent to whoever must approve next — line manager, HR or the CEO.', audience: 'Current approver', defaults: { schedule: daily('09:00'), email: true, olderThanDays: 2 } },
  { key: 'policy_acknowledgements', name: 'Policy acknowledgements', description: "Reminds employees who haven't acknowledged a mandatory policy some days after a new version is published.", audience: 'Employee', defaults: { schedule: daily('09:00'), email: true, graceDays: 7 } },
]

let mockView: AutomationsView | null = null

function mock(): AutomationsView {
  mockView ??= {
    schedulerRunning: false,
    timezone: 'Africa/Nairobi',
    activity: [],
    rules: MOCK_RULES.map((r) => ({
      ...r,
      enabled: true,
      config: structuredClone(r.defaults),
      lastRunAt: null,
      lastRunSummary: null,
      nextRunAt: null,
      updatedAt: null,
      emailSkipped: 'Demo mode — nothing is sent',
      totalSent: 0,
      recent: [],
    })),
  }
  return mockView
}

/* -------------------------------- calls -------------------------------- */

export function getAutomations(): Promise<AutomationsView> {
  if (USE_MOCK_API) return Promise.resolve(structuredClone(mock()))
  return api.get<AutomationsView>('/automations')
}

export function updateAutomation(key: RuleKey, patch: RulePatch): Promise<AutomationRule> {
  if (USE_MOCK_API) {
    const rule = mock().rules.find((r) => r.key === key)!
    if (patch.enabled !== undefined) rule.enabled = patch.enabled
    if (patch.config) rule.config = { ...rule.config, ...patch.config, schedule: { ...rule.config.schedule, ...patch.config.schedule } }
    rule.updatedAt = new Date().toISOString()
    return Promise.resolve(structuredClone(rule))
  }
  return api.put<AutomationRule>(`/automations/${key}`, patch)
}

export function runAutomation(key: RuleKey, dryRun: boolean): Promise<RunResult> {
  if (USE_MOCK_API)
    return Promise.resolve({ rule: key, workspace: 'demo', dryRun, matched: 0, alreadySent: 0, reminders: [], notifications: 0, emails: [], emailsSent: 0, emailSkipped: 'Demo mode — nothing is sent' })
  return api.post<RunResult>(`/automations/${key}/run`, { dryRun })
}
