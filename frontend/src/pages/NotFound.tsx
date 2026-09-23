import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/shared/Logo'

export default function NotFound({ inApp }: { inApp?: boolean }) {
  return (
    <div className={inApp ? 'flex min-h-[60dvh] flex-col items-center justify-center text-center' : 'flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center'}>
      {!inApp && <Logo className="mb-10" />}
      <div className="bg-gradient-to-br from-primary to-secondary bg-clip-text text-7xl font-extrabold tracking-tighter text-transparent">404</div>
      <h1 className="mt-3 text-xl font-bold">This page took unpaid leave</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">The page you're looking for doesn't exist or has moved.</p>
      <Button asChild className="mt-6">
        <Link to={inApp ? '/app' : '/'}>{inApp ? 'Back to dashboard' : 'Back home'}</Link>
      </Button>
    </div>
  )
}
