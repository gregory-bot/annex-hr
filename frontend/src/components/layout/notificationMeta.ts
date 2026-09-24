import { AlarmClock, BadgeCheck, Bell, CalendarDays, FileWarning, Gauge, ScrollText, Wallet, type LucideIcon } from 'lucide-react'
import type { Notification } from '@/data/types'

/** `icon` is kept for backward compatibility; UI should prefer the `dot` colour. */
export const notificationMeta: Record<Notification['type'], { icon: LucideIcon; label: string; tone: string; dot: string }> = {
  approval: { icon: BadgeCheck, label: 'Approvals', tone: 'bg-accent text-primary', dot: 'bg-primary' },
  leave: { icon: CalendarDays, label: 'Leave', tone: 'bg-info-soft text-info', dot: 'bg-info' },
  payroll: { icon: Wallet, label: 'Payroll', tone: 'bg-success-soft text-success', dot: 'bg-success' },
  performance: { icon: Gauge, label: 'Performance', tone: 'bg-muted text-foreground', dot: 'bg-foreground/60' },
  policy: { icon: ScrollText, label: 'Policy', tone: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  probation: { icon: AlarmClock, label: 'Probation', tone: 'bg-info-soft text-info', dot: 'bg-info' },
  document: { icon: FileWarning, label: 'Documents', tone: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  system: { icon: Bell, label: 'System', tone: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
}
