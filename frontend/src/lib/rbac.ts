import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  FolderLock,
  Gauge,
  LayoutDashboard,
  LogOut,
  MessageSquareHeart,
  Rocket,
  Scale,
  Settings,
  ShieldCheck,
  TicketCheck,
  Timer,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/data/types'

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  company_admin: 'Company Admin (HR)',
  hr_officer: 'HR Officer',
  manager: 'Manager',
  employee: 'Employee',
  consultant: 'Consultant',
  finance: 'Finance',
  ceo: 'CEO',
}

export const roleDescriptions: Record<Role, string> = {
  super_admin: 'Annex HR platform operator — every workspace',
  company_admin: 'Full access to the company workspace',
  hr_officer: 'Day-to-day HR operations',
  manager: 'Team approvals, reviews and reports',
  employee: 'Self-service: leave, documents, reviews',
  consultant: 'Timesheets, documents and self-service',
  finance: 'Payroll, final dues and reports',
  ceo: 'Executive approvals and analytics',
}

export interface NavItem {
  key: string
  label: string
  href: string
  icon: LucideIcon
  roles: Role[] | 'all'
  section: 'Workspace' | 'People Ops' | 'Money & Time' | 'Growth' | 'Governance'
  badge?: number
}

const ADMIN: Role[] = ['super_admin', 'company_admin', 'hr_officer']
const LEADERS: Role[] = [...ADMIN, 'manager', 'ceo']

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/app', icon: LayoutDashboard, roles: 'all', section: 'Workspace' },
  { key: 'people', label: 'People', href: '/app/people', icon: Users, roles: [...LEADERS, 'finance', 'employee', 'consultant'], section: 'Workspace' },
  { key: 'departments', label: 'Departments', href: '/app/departments', icon: Briefcase, roles: [...LEADERS, 'finance'], section: 'Workspace' },
  { key: 'tickets', label: 'Tickets', href: '/app/tickets', icon: TicketCheck, roles: 'all', section: 'Workspace' },
  { key: 'onboarding', label: 'Onboarding', href: '/app/onboarding', icon: Rocket, roles: 'all', section: 'People Ops' },
  { key: 'leave', label: 'Leave', href: '/app/leave', icon: CalendarDays, roles: 'all', section: 'People Ops' },
  { key: 'attendance', label: 'Attendance', href: '/app/attendance', icon: Clock, roles: 'all', section: 'People Ops' },
  { key: 'timesheets', label: 'Timesheets', href: '/app/timesheets', icon: Timer, roles: [...LEADERS, 'consultant', 'finance'], section: 'Money & Time' },
  { key: 'payroll', label: 'Payroll', href: '/app/payroll', icon: Wallet, roles: [...ADMIN, 'finance', 'ceo'], section: 'Money & Time' },
  { key: 'performance', label: 'Performance', href: '/app/performance', icon: Gauge, roles: [...LEADERS, 'employee', 'finance'], section: 'Growth' },
  { key: 'surveys', label: 'Surveys', href: '/app/surveys', icon: MessageSquareHeart, roles: 'all', section: 'Growth' },
  { key: 'compliance', label: 'Compliance', href: '/app/compliance', icon: ShieldCheck, roles: [...ADMIN, 'ceo', 'employee', 'consultant', 'manager'], section: 'Governance' },
  { key: 'cases', label: 'Cases', href: '/app/cases', icon: Scale, roles: [...ADMIN, 'ceo'], section: 'Governance' },
  { key: 'offboarding', label: 'Offboarding', href: '/app/offboarding', icon: LogOut, roles: [...LEADERS, 'finance'], section: 'Governance' },
  { key: 'documents', label: 'Documents', href: '/app/documents', icon: FolderLock, roles: 'all', section: 'Governance' },
  { key: 'reports', label: 'Reports', href: '/app/reports', icon: BarChart3, roles: [...LEADERS, 'finance'], section: 'Governance' },
  { key: 'settings', label: 'Settings', href: '/app/settings', icon: Settings, roles: ADMIN, section: 'Governance' },
]

export const notificationsNav = { label: 'Notifications', href: '/app/notifications', icon: FileText }

export function canAccess(role: Role, key: string) {
  const item = navItems.find((n) => n.key === key)
  if (!item) return true
  return item.roles === 'all' || item.roles.includes(role)
}

/** Roles that only see themselves: People becomes "My profile" and the directory is hidden. */
export const SELF_SERVICE_ROLES: Role[] = ['employee', 'consultant']
export function isSelfServiceRole(role: Role) {
  return SELF_SERVICE_ROLES.includes(role)
}

export function navFor(role: Role) {
  return navItems
    .filter((n) => n.roles === 'all' || n.roles.includes(role))
    .map((n) => (n.key === 'people' && isSelfServiceRole(role) ? { ...n, label: 'My profile', icon: UserRound } : n))
}

/** Whether this role acts on behalf of the organisation (sees everyone) or only themselves. */
export function isAdminLike(role: Role) {
  return ADMIN.includes(role) || role === 'ceo'
}
export function isLeader(role: Role) {
  return LEADERS.includes(role)
}
