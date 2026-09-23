import { AlarmClock, BadgeCheck, Bell, CalendarDays, FileWarning, Gauge, ScrollText, Wallet, type LucideIcon } from 'lucide-react'
import type { Notification } from '@/data/types'

export const notificationMeta: Record<Notification['type'], { icon: LucideIcon; label: string; tone: string }> = {
  approval: { icon: BadgeCheck, label: 'Approvals', tone: 'bg-accent text-primary' },
  leave: { icon: CalendarDays, label: 'Leave', tone: 'bg-info-soft text-info' },
  payroll: { icon: Wallet, label: 'Payroll', tone: 'bg-success-soft text-success' },
  performance: { icon: Gauge, label: 'Performance', tone: 'bg-muted text-foreground' },
  policy: { icon: ScrollText, label: 'Policy', tone: 'bg-warning-soft text-warning' },
  probation: { icon: AlarmClock, label: 'Probation', tone: 'bg-info-soft text-info' },
  document: { icon: FileWarning, label: 'Documents', tone: 'bg-danger-soft text-danger' },
  system: { icon: Bell, label: 'System', tone: 'bg-muted text-muted-foreground' },
}
