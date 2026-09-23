import { Badge, type BadgeProps } from '@/components/ui/badge'

const map: Record<string, BadgeProps['variant']> = {
  Active: 'success',
  Approved: 'success',
  Paid: 'success',
  Valid: 'success',
  Closed: 'muted',
  Complete: 'success',
  Completed: 'success',
  'Synced to Odoo': 'info',
  Live: 'success',
  Returned: 'success',
  Pending: 'warning',
  'Pending Approval': 'warning',
  Probation: 'info',
  Onboarding: 'info',
  Expiring: 'warning',
  Investigating: 'warning',
  Hearing: 'warning',
  'Awaiting Approval': 'warning',
  'In Progress': 'warning',
  Draft: 'muted',
  Logged: 'muted',
  'On Leave': 'muted',
  Rejected: 'danger',
  Expired: 'danger',
  Missing: 'danger',
  Escalated: 'danger',
  'Notice Period': 'danger',
  Exited: 'muted',
  Critical: 'danger',
  High: 'danger',
  Medium: 'warning',
  Low: 'muted',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={map[status] ?? 'outline'} dot className={className}>
      {status}
    </Badge>
  )
}
