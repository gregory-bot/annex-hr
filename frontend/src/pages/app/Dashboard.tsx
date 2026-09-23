import { Link } from 'react-router-dom'
import { UserPlus, Wallet } from 'lucide-react'
import { useWorkspace } from '@/context/auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { isAdminLike, roleLabels } from '@/lib/rbac'
import { TODAY, formatDate } from '@/lib/utils'
import { OrgDashboard } from './dashboard/OrgDashboard'
import { PersonalDashboard } from './dashboard/PersonalDashboard'
import { firstName, greeting } from './dashboard/utils'

export default function Dashboard() {
  const { user, role, workspace } = useWorkspace()
  const personal = role === 'employee' || role === 'consultant'
  const canAct = isAdminLike(role)

  return (
    <div>
      <PageHeader
        eyebrow={`${formatDate(TODAY, 'long')} · ${workspace.name}`}
        title={`${greeting()}, ${firstName(user.name)}`}
        description={
          personal
            ? 'Here is everything you need for today — tasks, time off and pay in one place.'
            : `Your ${roleLabels[role].toLowerCase()} overview of people, approvals and workforce trends.`
        }
        actions={
          canAct ? (
            <>
              <Button asChild variant="outline">
                <Link to="/app/people?invite=1">
                  <UserPlus /> Invite employee
                </Link>
              </Button>
              <Button asChild>
                <Link to="/app/payroll">
                  <Wallet /> Run payroll
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />
      {personal ? <PersonalDashboard /> : <OrgDashboard />}
    </div>
  )
}
