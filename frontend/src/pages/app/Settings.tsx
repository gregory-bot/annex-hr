import { useSearchParams } from 'react-router-dom'
import { CalendarRange, Building, History, KeyRound, Lock, Plug, ScrollText, ShieldCheck, Tags, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace } from '@/context/auth'
import { CompanyProfile } from './settings/CompanyProfile'
import { HolidayCalendars, InviteUsers, PoliciesSettings, Taxonomy } from './settings/OrgSettings'
import { Integrations, RolesPermissions } from './settings/AccessSettings'
import { ApiKeys, AuditLogs, SecuritySettings } from './settings/SecuritySettings'

const TABS: { id: string; label: string; icon: LucideIcon; group: string; render: () => React.ReactNode }[] = [
  { id: 'company', label: 'Company profile', icon: Building, group: 'Organisation', render: () => <CompanyProfile /> },
  { id: 'holidays', label: 'Holiday calendars', icon: CalendarRange, group: 'Organisation', render: () => <HolidayCalendars /> },
  { id: 'structure', label: 'Departments & titles', icon: Tags, group: 'Organisation', render: () => <Taxonomy /> },
  { id: 'policies', label: 'Policies', icon: ScrollText, group: 'Organisation', render: () => <PoliciesSettings /> },
  { id: 'invite', label: 'Invite users', icon: UserPlus, group: 'Access', render: () => <InviteUsers /> },
  { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck, group: 'Access', render: () => <RolesPermissions /> },
  { id: 'integrations', label: 'Integrations', icon: Plug, group: 'Platform', render: () => <Integrations /> },
  { id: 'security', label: 'Security', icon: Lock, group: 'Platform', render: () => <SecuritySettings /> },
  { id: 'audit', label: 'Audit logs', icon: History, group: 'Platform', render: () => <AuditLogs /> },
  { id: 'api', label: 'API keys', icon: KeyRound, group: 'Platform', render: () => <ApiKeys /> },
]

const ALIASES: Record<string, string> = {
  profile: 'company',
  departments: 'structure',
  titles: 'structure',
  users: 'invite',
  permissions: 'roles',
  'audit-logs': 'audit',
  'api-keys': 'api',
}

export default function Settings() {
  const { workspace } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') ?? ''
  const requested = ALIASES[raw] ?? raw
  const tab = TABS.some((t) => t.id === requested) ? requested! : 'company'

  const setTab = (id: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Company settings"
        description={
          <>
            Configure {workspace.name}'s profile, access, integrations and security.{' '}
            <Badge variant="soft" className="ml-1 align-middle">
              {workspace.plan} plan
            </Badge>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <TabsList className="w-full justify-start lg:h-auto lg:flex-col lg:items-stretch lg:gap-0.5 lg:bg-transparent lg:p-0">
            {TABS.map((t, i) => {
              const Icon = t.icon
              const newGroup = i === 0 || TABS[i - 1]!.group !== t.group
              return (
                <div key={t.id} className="contents">
                  {newGroup && (
                    <div className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-0 lg:block">{t.group}</div>
                  )}
                  <TabsTrigger
                    value={t.id}
                    className="lg:h-9 lg:justify-start lg:gap-2.5 lg:px-3 lg:data-[state=active]:bg-accent lg:data-[state=active]:text-accent-foreground lg:data-[state=active]:shadow-none"
                  >
                    <Icon /> {t.label}
                  </TabsTrigger>
                </div>
              )
            })}
          </TabsList>
        </div>
        <div className="min-w-0">
          {TABS.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mt-0">
              {t.render()}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}
