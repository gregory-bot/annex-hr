import type { OnboardingTask } from '@/data/types'
import type { EmployeeFile, FileCategory } from '@/lib/files'

/** Saved form values for a task (numbers are masked when the viewer may not see them in full). */
export type TaskValues = Record<string, string | string[] | null | undefined>

export interface OnboardingTaskState extends OnboardingTask {
  completedAt: string | null
  file: EmployeeFile | null
  values?: TaskValues | null
}

export interface OnboardingView {
  employeeId: string
  status: string
  onboardingProgress: number
  requiredLeft: number
  tasks: OnboardingTaskState[]
}

export interface CompleteResult {
  taskId: string
  onboardingProgress: number
  status: string
  requiredLeft: number
  task: OnboardingTaskState | null
}

/** Onboarding document tasks → file category and the number captured with it. */
export const DOC_TASK_META: Record<string, { category: FileCategory; numberLabel: string; placeholder: string; pattern: RegExp; hint: string }> = {
  id: { category: 'National ID', numberLabel: 'ID number', placeholder: '12345678', pattern: /^\d{6,10}$/, hint: '6–10 digits' },
  kra: { category: 'KRA PIN', numberLabel: 'KRA PIN', placeholder: 'A123456789B', pattern: /^[A-Z]\d{9}[A-Z]$/, hint: 'Letter, 9 digits, letter' },
  shif: { category: 'SHIF', numberLabel: 'SHIF member number', placeholder: 'SHIF-000000', pattern: /^[A-Z0-9-]{4,20}$/, hint: '4–20 letters, digits or dashes' },
  nssf: { category: 'NSSF', numberLabel: 'NSSF number', placeholder: '2012345678', pattern: /^[A-Z0-9-]{4,20}$/, hint: '4–20 letters, digits or dashes' },
  passport: { category: 'Passport', numberLabel: 'Passport number', placeholder: 'AK1234567', pattern: /^[A-Z0-9-]{4,20}$/, hint: '4–20 letters, digits or dashes' },
}

export const normaliseNumber = (v: string) => v.toUpperCase().replace(/\s/g, '')
