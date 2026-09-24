import { useCallback, useEffect, useState } from 'react'
import { api, USE_MOCK_API } from '@/lib/api'
import type { BonusBand, Payslip } from './calc'

/* ------------------------------ Shared ------------------------------ */

export interface ChainStep {
  step: number
  role: string
  name: string
  status: 'Pending' | 'Approved'
  at: string | null
}

/** Loads a server resource once (skipped in mock mode) and exposes a setter for optimistic updates. */
export function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!USE_MOCK_API && !!path)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (USE_MOCK_API || !path) return
    setLoading(true)
    try {
      setData(await api.get<T>(path))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load')
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, setData, loading, error, reload }
}

/* ------------------------------ Payroll run ------------------------------ */

export type PayLine = Payslip & { name: string; title: string; employeeNo: string; kraPin: string; departmentId: string }

export interface RunLines {
  runId: string
  period: string
  /** True for runs imported before lines were stored — figures are recalculated from today's salaries. */
  estimated: boolean
  lines: PayLine[]
}

/* ------------------------------ Consultants ------------------------------ */

export type ConsultantStatus = 'Awaiting approval' | 'Ready' | 'Draft' | 'Approved' | 'Paid'

export interface ConsultantRow {
  employeeId: string
  name: string
  title: string
  phone: string
  hours: number
  pendingHours: number
  weeks: number
  rate: number
  gross: number
  wht: number
  net: number
  status: ConsultantStatus
  payoutId: string | null
  paymentRef: string | null
}

export interface ConsultantPayout {
  id: string
  period: string
  status: 'Draft' | 'Approved' | 'Paid'
  consultants: number
  hours: number
  gross: number
  wht: number
  net: number
  approvals: ChainStep[]
  paymentRef: string | null
  paidAt: string | null
  createdAt: string
}

export interface ConsultantsResponse {
  period: string
  whtRate: number
  consultants: ConsultantRow[]
  payouts: ConsultantPayout[]
}

/* ------------------------------ Final dues ------------------------------ */

export interface FinalDues {
  offboardingId: string
  employeeId: string
  name: string
  title: string
  employeeNo: string
  reason: string
  lastDay: string
  noticeDays: number
  source: 'settlement' | 'offboarding'
  lines: { label: string; amount: number }[]
  total: number
  assetsOutstanding: string[]
  approvals: ChainStep[]
  status: 'Pending' | 'Approved'
}

/* ------------------------------ Bonus ------------------------------ */

export interface BonusRules {
  threshold: number
  bands: BonusBand[]
  budgetCap: number
  updatedAt: string | null
  configured: boolean
}

export interface BonusCycle {
  id: string
  quarter: string
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Paid'
  threshold: number
  bands: BonusBand[]
  budgetCap: number
  headcount: number
  eligible: number
  total: number
  approvals: ChainStep[]
  queuedForPayroll: boolean
  payrollRunId: string | null
  payrollPeriod: string | null
  createdAt: string
  lines: { employeeId: string; rating: number; bandPct: number; monthlySalary: number; bonus: number }[]
}

/** Which employee roles sign each chain step (super admins can sign any). */
export const STEP_ROLES: Record<string, string[]> = {
  Finance: ['finance'],
  HR: ['company_admin', 'hr_officer'],
  CEO: ['ceo'],
}

export const canSign = (step: ChainStep | undefined, role: string) => !!step && (role === 'super_admin' || (STEP_ROLES[step.role] ?? []).includes(role))

export const nextStep = (chain: ChainStep[]) => chain.find((a) => a.status === 'Pending')
