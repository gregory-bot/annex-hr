/** Leave API shapes: requests with handover files and HR alerts, balances, policies and holidays. */
import type { LeaveRequest, LeaveType } from '@/data/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export type LeaveRow = LeaveRequest & {
  handoverFileId?: string | null
  handoverFileName?: string | null
  /** Reasons HR was alerted when the request was made (long leave, team overlap, no manager, over balance). */
  alerts?: string[]
  balanceWarning?: boolean
}

export interface LeavePolicy {
  type: LeaveType
  annualDays: number
  accrual: 'monthly' | 'upfront'
  monthlyRate: number | null
  carryOverMax: number
  expiresMonthDay: string | null
  custom?: boolean
}

export interface LeaveBalance extends LeavePolicy {
  entitlement: number
  accrued: number
  carriedOver: number
  carryOverExpires: string | null
  carryOverLapsed: boolean
  taken: number
  pending: number
  available: number
  remaining: number
}

export interface BalancesResponse {
  employeeId: string
  name: string
  startDate: string
  year: number
  asOf: string
  balances: LeaveBalance[]
  annualSeries: { month: string; accrued: number; taken: number | null }[]
}

export interface HolidayRow {
  id?: string
  date: string
  name: string
  country: string
}

export const handoverUrl = (leaveId: string) => `${BASE}/leave-requests/${encodeURIComponent(leaveId)}/handover`
