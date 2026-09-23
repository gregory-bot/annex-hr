import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import { isLeader } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { buildObjectives, reviewFor, type ReviewRow } from './performance/data'
import { OverviewTab } from './performance/OverviewTab'
import { KpiTab } from './performance/KpiTab'
import { OkrTab } from './performance/OkrTab'
import { ReviewsTab } from './performance/ReviewsTab'
import { SuccessionTab } from './performance/SuccessionTab'

export default function Performance() {
  const { workspace } = useWorkspace()
  return <PerformancePage key={workspace.id} />
}

function PerformancePage() {
  const { employees, departments, workspace, role } = useWorkspace()
  const org = isLeader(role)
  const [params, setParams] = useSearchParams()

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'kpis', label: 'KPIs & Scorecard' },
    { value: 'okrs', label: 'OKRs' },
    { value: 'reviews', label: org ? 'Reviews' : 'My review' },
    ...(org ? [{ value: 'succession', label: 'Succession' }] : []),
  ]
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview'
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

  const objectives = useMemo(() => buildObjectives(workspace.id, departments, employees), [workspace.id, departments, employees])
  const [reviews, setReviews] = useState<ReviewRow[]>(() =>
    employees.filter((e) => e.status !== 'Exited' && e.employmentType !== 'Consultant' && e.role !== 'ceo').map(reviewFor),
  )

  const submitReview = (employeeId: string, mode: 'self' | 'manager', rating: number) =>
    setReviews((rs) => rs.map((r) => (r.employee.id !== employeeId ? r : mode === 'self' ? { ...r, self: 'Submitted' } : { ...r, manager: 'Submitted', final: rating })))

  return (
    <>
      <PageHeader
        eyebrow="Growth"
        title="Performance"
        description={org ? 'Balanced scorecard, OKRs, quarterly reviews and succession — calibrated in one place.' : 'Your goals, company KPIs and your Q3 review.'}
        actions={
          <Badge variant="outline" className="h-8 px-3">
            <CalendarClock /> Q3 2026 cycle · closes 10 Oct
          </Badge>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab org={org} reviews={reviews} objectives={objectives} onGo={setTab} />
        </TabsContent>
        <TabsContent value="kpis">
          <KpiTab />
        </TabsContent>
        <TabsContent value="okrs">
          <OkrTab objectives={objectives} />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsTab org={org} reviews={reviews} onSubmit={submitReview} />
        </TabsContent>
        {org && (
          <TabsContent value="succession">
            <SuccessionTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  )
}
