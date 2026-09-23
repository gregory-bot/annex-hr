import type { Employee } from '@/data/types'

/**
 * Kenyan statutory payroll rules (2026 demo configuration).
 * - PAYE bands (monthly): 10% ≤ 24,000 · 25% 24,001–32,333 · 30% ≤ 500,000 · 32.5% ≤ 800,000 · 35% above
 * - Personal relief KES 2,400 / month
 * - NSSF 6% employee contribution, Tier I on first 8,000, Tier II thereafter, capped at KES 4,320
 * - SHIF 2.75% of gross (min KES 300)
 * - Affordable Housing Levy 1.5% of gross
 * NSSF, SHIF and AHL are allowable deductions before PAYE (Tax Laws (Amendment) Act, 2024).
 */
export const PAYE_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 24_000, rate: 0.1 },
  { upTo: 32_333, rate: 0.25 },
  { upTo: 500_000, rate: 0.3 },
  { upTo: 800_000, rate: 0.325 },
  { upTo: Infinity, rate: 0.35 },
]
export const PERSONAL_RELIEF = 2_400
export const NSSF_RATE = 0.06
export const NSSF_TIER1_LIMIT = 8_000
export const NSSF_CAP = 4_320
export const SHIF_RATE = 0.0275
export const SHIF_MIN = 300
export const AHL_RATE = 0.015
export const WHT_RATE = 0.05

export function payeOn(taxable: number) {
  let tax = 0
  let lower = 0
  for (const band of PAYE_BANDS) {
    if (taxable <= lower) break
    const slice = Math.min(taxable, band.upTo) - lower
    tax += slice * band.rate
    lower = band.upTo
  }
  return Math.max(0, Math.round(tax - PERSONAL_RELIEF))
}

export function nssfOn(pensionable: number) {
  const tier1 = Math.round(Math.min(pensionable, NSSF_TIER1_LIMIT) * NSSF_RATE)
  const total = Math.min(NSSF_CAP, Math.round(pensionable * NSSF_RATE))
  return { tier1, tier2: Math.max(0, total - tier1), total }
}

export interface Payslip {
  employeeId: string
  basic: number
  house: number
  transport: number
  airtime: number
  allowances: number
  bonus: number
  gross: number
  nssfTier1: number
  nssfTier2: number
  nssf: number
  shif: number
  housingLevy: number
  taxable: number
  paye: number
  totalDeductions: number
  net: number
}

/** Splits the monthly package into basic + allowances and applies statutory deductions. */
export function computePayslip(employee: Pick<Employee, 'id' | 'salaryKES'>, bonus = 0): Payslip {
  const pkg = employee.salaryKES
  const airtime = pkg >= 300_000 ? 5_000 : 2_000
  const transport = Math.round(pkg * 0.08 / 500) * 500
  const house = Math.round(pkg * 0.15 / 500) * 500
  const basic = pkg - house - transport - airtime
  const allowances = house + transport + airtime
  const gross = basic + allowances + bonus
  const n = nssfOn(gross)
  const shif = Math.max(SHIF_MIN, Math.round(gross * SHIF_RATE))
  const housingLevy = Math.round(gross * AHL_RATE)
  const taxable = gross - n.total - shif - housingLevy
  const paye = payeOn(taxable)
  const totalDeductions = paye + n.total + shif + housingLevy
  return {
    employeeId: employee.id,
    basic,
    house,
    transport,
    airtime,
    allowances,
    bonus,
    gross,
    nssfTier1: n.tier1,
    nssfTier2: n.tier2,
    nssf: n.total,
    shif,
    housingLevy,
    taxable,
    paye,
    totalDeductions,
    net: gross - totalDeductions,
  }
}

/* ------------------------------ Bonus engine ------------------------------ */

export interface BonusBand {
  min: number
  max: number
  pct: number
}

export const DEFAULT_BONUS_BANDS: BonusBand[] = [
  { min: 3.5, max: 4, pct: 25 },
  { min: 4, max: 4.5, pct: 50 },
  { min: 4.5, max: 5.01, pct: 100 },
]

export function bonusPctFor(rating: number, threshold: number, bands: BonusBand[]) {
  if (rating < threshold) return 0
  const band = bands.find((b) => rating >= b.min && rating < b.max)
  return band?.pct ?? (rating >= threshold ? bands[0]?.pct ?? 0 : 0)
}

/** Quarterly bonus is a % of one month's package, rounded to the nearest KES 100. */
export function bonusFor(e: Pick<Employee, 'salaryKES' | 'performance'>, threshold = 3.5, bands = DEFAULT_BONUS_BANDS) {
  const pct = bonusPctFor(e.performance, threshold, bands)
  return Math.round((e.salaryKES * pct) / 100 / 100) * 100
}

export function payrollEligible(e: Employee) {
  return e.employmentType !== 'Consultant' && e.status !== 'Exited'
}
