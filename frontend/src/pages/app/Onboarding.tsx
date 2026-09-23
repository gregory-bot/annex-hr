import { useSearchParams } from 'react-router-dom'
import { ClipboardCheck, Hourglass, LayoutDashboard, ScrollText, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { isLeader } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { MyChecklist } from './onboarding/MyChecklist'
import { HROverview } from './onboarding/HROverview'
import { PolicyAck } from './onboarding/PolicyAck'
import { Probation } from './onboarding/Probation'

const TABS = ['checklist', 'overview', 'policies', 'probation'] as const
type Tab = (typeof TABS)[number]

export default function Onboarding() {
  const { role, workspace, user } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const leader = isLeader(role)
  const allowed: Tab[] = leader ? [...TABS] : ['checklist', 'policies', 'probation']
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && allowed.includes(requested) ? requested : leader ? 'overview' : 'checklist'

  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        eyebrow="People Ops"
        title="Onboarding"
        description={leader ? 'Automated checklists, policy sign-off and probation tracking for every new joiner.' : 'Everything you need to get set up — documents, policies and your first week.'}
        actions={
          leader ? (
            <Button onClick={() => toast.success('Invite sent — “Kenya Standard” checklist assigned')}>
              <UserPlus /> Invite new joiner
            </Button>
          ) : undefined
        }
      />
      <Tabs key={`${workspace.id}-${user.id}`} value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="checklist">
            <ClipboardCheck /> My checklist
          </TabsTrigger>
          {leader && (
            <TabsTrigger value="overview">
              <LayoutDashboard /> HR overview
            </TabsTrigger>
          )}
          <TabsTrigger value="policies">
            <ScrollText /> Policy acknowledgement
          </TabsTrigger>
          <TabsTrigger value="probation">
            <Hourglass /> Probation
          </TabsTrigger>
        </TabsList>
        <TabsContent value="checklist">
          <MyChecklist />
        </TabsContent>
        {leader && (
          <TabsContent value="overview">
            <HROverview />
          </TabsContent>
        )}
        <TabsContent value="policies">
          <PolicyAck />
        </TabsContent>
        <TabsContent value="probation">
          <Probation />
        </TabsContent>
      </Tabs>
    </div>
  )
}
