import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, Wallet } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import type { PayrollRun } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { OverviewTab } from './payroll/OverviewTab'
import { RunTab } from './payroll/RunTab'
import { ConsultantsTab } from './payroll/ConsultantsTab'
import { FinalDuesTab } from './payroll/FinalDuesTab'
import { BonusTab } from './payroll/BonusTab'
import { IntegrationsTab } from './payroll/IntegrationsTab'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'run', label: 'Payroll run' },
  { value: 'consultants', label: 'Consultants' },
  { value: 'dues', label: 'Final dues' },
  { value: 'bonus', label: 'Bonus engine' },
  { value: 'integrations', label: 'Integrations' },
]

export default function Payroll() {
  const { workspace } = useWorkspace()
  return <PayrollPage key={workspace.id} />
}

function PayrollPage() {
  const { role, workspace, payrollRuns } = useWorkspace()
  const [runs, setRuns] = useState<PayrollRun[]>(payrollRuns)
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview'
  const setTab = (v: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (v === 'overview') next.delete('tab')
        else next.set('tab', v)
        return next
      },
      { replace: true },
    )

  if (!isAdminLike(role) && role !== 'finance') {
    return (
      <>
        <PageHeader title="Payroll" />
        <EmptyState icon={Lock} title="Payroll is restricted" description="Only HR, Finance and executives can view salary information." />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Money & Time"
        title="Payroll"
        description={`Kenyan statutory payroll for ${workspace.name} — PAYE, SHIF, NSSF and Housing Levy calculated automatically, approved in-app and synced to Odoo.`}
        actions={
          <Badge variant="outline" className="h-8 px-3">
            <Lock /> Confidential · KES
          </Badge>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start sm:w-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          {runs.length ? (
            <OverviewTab runs={runs} setRuns={setRuns} onReviewRun={() => setTab('run')} />
          ) : (
            <EmptyState
              icon={Wallet}
              title="No payroll runs yet"
              description="Generate your first payroll to calculate PAYE, SHIF, NSSF and Housing Levy for every employee."
              action={<Button onClick={() => setTab('run')}>Generate payroll</Button>}
            />
          )}
        </TabsContent>
        <TabsContent value="run">
          <RunTab />
        </TabsContent>
        <TabsContent value="consultants">
          <ConsultantsTab />
        </TabsContent>
        <TabsContent value="dues">
          <FinalDuesTab />
        </TabsContent>
        <TabsContent value="bonus">
          <BonusTab />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
      </Tabs>
    </>
  )
}
