import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace } from '@/context/auth'
import { CompanyProfile } from './settings/CompanyProfile'
import { HolidayCalendars, InviteUsers, PoliciesSettings, Taxonomy } from './settings/OrgSettings'
import { Integrations, RolesPermissions } from './settings/AccessSettings'
import { ApiKeys, AuditLogs, SecuritySettings } from './settings/SecuritySettings'

const TABS: { id: string; label: string; group: string; render: () => React.ReactNode }[] = [
  { id: 'company', label: 'Company profile', group: 'Organisation', render: () => <CompanyProfile /> },
  { id: 'holidays', label: 'Holiday calendars', group: 'Organisation', render: () => <HolidayCalendars /> },
  { id: 'structure', label: 'Departments & titles', group: 'Organisation', render: () => <Taxonomy /> },
  { id: 'policies', label: 'Policies', group: 'Organisation', render: () => <PoliciesSettings /> },
  { id: 'invite', label: 'Invite users', group: 'Access', render: () => <InviteUsers /> },
  { id: 'roles', label: 'Roles & permissions', group: 'Access', render: () => <RolesPermissions /> },
  { id: 'integrations', label: 'Integrations', group: 'Platform', render: () => <Integrations /> },
  { id: 'security', label: 'Security', group: 'Platform', render: () => <SecuritySettings /> },
  { id: 'audit', label: 'Audit logs', group: 'Platform', render: () => <AuditLogs /> },
  { id: 'api', label: 'API keys', group: 'Platform', render: () => <ApiKeys /> },
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
              const newGroup = i === 0 || TABS[i - 1]!.group !== t.group
              return (
                <div key={t.id} className="contents">
                  {newGroup && (
                    <div className={cn('hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block', i === 0 ? 'pt-0' : 'pt-5')}>{t.group}</div>
                  )}
                  <TabsTrigger
                    value={t.id}
                    className="lg:h-9 lg:justify-start lg:px-3 lg:data-[state=active]:bg-accent lg:data-[state=active]:text-accent-foreground lg:data-[state=active]:shadow-none"
                  >
                    {t.label}
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
