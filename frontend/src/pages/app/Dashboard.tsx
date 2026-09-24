import { useWorkspace } from '@/context/auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { TODAY, formatDate } from '@/lib/utils'
import { OrgDashboard } from './dashboard/OrgDashboard'
import { PersonalDashboard } from './dashboard/PersonalDashboard'
import { firstName, greeting } from './dashboard/utils'

export default function Dashboard() {
  const { user, role, workspace } = useWorkspace()
  const personal = role === 'employee' || role === 'consultant'

  // The org dashboard opens with its own welcome card (pending counts + actions).
  if (!personal) return <OrgDashboard />

  return (
    <div>
      <PageHeader eyebrow={`${formatDate(TODAY, 'long')} · ${workspace.name}`} title={`${greeting()}, ${firstName(user.name)}`} description="Your time, leave and pay in one place." />
      <PersonalDashboard />
    </div>
  )
}
