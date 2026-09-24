import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspace } from '@/context/auth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { isSelfRole, scopeEmployees } from './onboarding/util'
import { Overview } from './compliance/Overview'
import { EmployeeDocs } from './compliance/EmployeeDocs'
import { ExpiryAlerts } from './compliance/ExpiryAlerts'
import { PolicyUpdates } from './compliance/PolicyUpdates'
import { AuditFiles } from './compliance/AuditFiles'
import type { DocRow } from './compliance/shared'
import { useComplianceDocs, usePolicies } from './compliance/api'

const TABS = ['overview', 'documents', 'alerts', 'policies', 'audit'] as const
type Tab = (typeof TABS)[number]

export default function Compliance() {
  const { complianceDocs, employees, policies: policySeed, user, role, employee, department } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const { docs: items, upsert } = useComplianceDocs(complianceDocs)
  const { policies, reload: reloadPolicies } = usePolicies(policySeed)
  const self = isSelfRole(role)

  const scope = useMemo(() => scopeEmployees(employees.filter((e) => e.status !== 'Exited'), user, role), [employees, user, role])
  const docs = useMemo<DocRow[]>(() => {
    const ids = new Set(scope.map((e) => e.id))
    return items.filter((d) => ids.has(d.employeeId)).map((d) => ({ ...d, emp: employee(d.employeeId) }))
  }, [items, scope, employee])

  const allowed: Tab[] = self ? ['overview', 'documents', 'alerts', 'policies'] : [...TABS]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && allowed.includes(requested) ? requested : 'overview'
  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title={self ? 'My compliance' : 'Compliance'}
        description={self ? 'Your statutory documents, expiry reminders and policy sign-offs.' : 'Track employee documents, expiries and policy sign-off — always audit-ready.'}
        actions={
          !self ? (
            <ExportMenu
              filename="compliance-register"
              rows={docs.map((d) => ({ employee: d.emp?.name ?? '', type: d.type, issued: d.issued, expires: d.expires ?? '', status: d.status }))}
            />
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">{self ? 'My documents' : 'Employee documents'}</TabsTrigger>
          <TabsTrigger value="alerts">Expiry alerts</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          {!self && (
            <TabsTrigger value="audit">Audit-ready files</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="overview">
          <Overview docs={docs} self={self} firstName={user.name.split(' ')[0]!} />
        </TabsContent>
        <TabsContent value="documents">
          <EmployeeDocs docs={docs} employees={scope} self={self} user={user} onSaved={upsert} />
        </TabsContent>
        <TabsContent value="alerts">
          <ExpiryAlerts docs={docs} self={self} onSaved={upsert} />
        </TabsContent>
        <TabsContent value="policies">
          <PolicyUpdates policies={policies} headcount={employees.filter((e) => e.status !== 'Exited').length} self={self} onChanged={reloadPolicies} />
        </TabsContent>
        {!self && (
          <TabsContent value="audit">
            <AuditFiles employees={scope} docs={docs} department={department} onSaved={upsert} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
