import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/auth'
import { roleLabels } from '@/lib/rbac'

export default function Forbidden() {
  const { role } = useAuth()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Lock className="size-6" />
      </div>
      <h1 className="text-xl font-bold">You don't have access to this module</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Your role (<span className="font-medium text-foreground">{roleLabels[role]}</span>) doesn't include this area. Ask your HR administrator if you need access.
      </p>
      <Button asChild className="mt-6">
        <Link to="/app">Back to dashboard</Link>
      </Button>
    </div>
  )
}
