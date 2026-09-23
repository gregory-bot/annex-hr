import type { ComplianceDoc, Employee } from '@/data/types'
import { cn, daysUntil } from '@/lib/utils'

export const DOC_TYPES: ComplianceDoc['type'][] = ['Passport', 'Work Visa', 'Driving Licence', 'Contract', 'Academic Certificate', 'Certificate of Good Conduct', 'Professional License']

export interface DocRow extends ComplianceDoc {
  emp?: Employee
}

export function maskNumber(n: string) {
  if (n.length <= 4) return '••••'
  return `${n.slice(0, 2)}${'•'.repeat(Math.max(3, n.length - 5))}${n.slice(-3)}`
}

export function ExpiryText({ date, className }: { date?: string; className?: string }) {
  if (!date) return <span className={cn('text-xs text-muted-foreground', className)}>No expiry</span>
  const d = daysUntil(date)
  const label = d === 0 ? 'today' : d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `${-d} day${d === -1 ? '' : 's'} ago`
  return <span className={cn('text-xs', d < 0 ? 'text-danger' : d < 60 ? 'text-warning' : 'text-muted-foreground', className)}>{label}</span>
}
