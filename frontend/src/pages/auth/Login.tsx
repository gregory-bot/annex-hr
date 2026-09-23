import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, BadgeCheck, CircleAlert, Lock, Mail, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/context/auth'
import { useWorkspaceLookup } from './useWorkspaceLookup'
import type { Role } from '@/data/types'
import { roleDescriptions, roleLabels } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { AuthLayout } from './AuthLayout'
import { Field, PasswordInput, SubmitButton, WorkspaceInput } from './fields'

const demoRoles: Role[] = ['company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo', 'super_admin']
const demoWorkspaces: { id: string; label: string }[] = [
  { id: 'umba', label: 'Umba' },
  { id: 'annex', label: 'Annex Technologies' },
]

function DemoAccounts() {
  const { signInAs } = useAuth()
  const navigate = useNavigate()
  const [ws, setWs] = useState('umba')
  const [busy, setBusy] = useState<Role | null>(null)

  const go = (role: Role) => {
    setBusy(role)
    void signInAs(ws, role).then((res) => {
      setBusy(null)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Signed in as ${roleLabels[role]}`, { description: `${demoWorkspaces.find((w) => w.id === ws)?.label} demo workspace` })
      navigate('/app')
    })
  }

  return (
    <div className="rounded-2xl border bg-subtle p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" /> Demo accounts
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Explore Annex HR as any role — no password needed.</p>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Demo workspace">
        {demoWorkspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={ws === w.id}
            onClick={() => setWs(w.id)}
            className={cn('truncate rounded-md px-2 py-1.5 text-xs font-medium transition', ws === w.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {demoRoles.map((r) => (
          <button
            key={r}
            type="button"
            title={roleDescriptions[r]}
            disabled={busy !== null}
            onClick={() => go(r)}
            className={cn(
              'rounded-full border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-primary/50 hover:bg-accent hover:text-accent-foreground disabled:opacity-60',
              busy === r && 'border-primary bg-accent text-accent-foreground',
            )}
          >
            {busy === r ? 'Signing in…' : roleLabels[r]}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Login() {
  const { signIn, demoEnabled } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  const [slug, setSlug] = useState('umba')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { ws, checking } = useWorkspaceLookup(slug)
  const slugError = slug && !ws && !checking ? `No workspace found at ${slug}.annexhr.com` : !slug && touched ? 'Enter your company workspace' : undefined
  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? 'Enter a valid work email' : undefined
  const pwError = touched && password.length < 6 ? 'Password must be at least 6 characters' : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!ws || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return
    setLoading(true)
    void signIn(slug, email, password).then((res) => {
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(`Welcome back to ${ws.name}`)
      navigate(from, { replace: true })
    })
  }

  return (
    <AuthLayout
      topRight={
        <span className="mr-1 hidden text-muted-foreground sm:inline">
          New company?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create workspace
          </Link>
        </span>
      }
    >
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sign in to your workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your company workspace to continue. Employees can only log into their own organization.</p>

        <form onSubmit={submit} noValidate className="mt-8 grid grid-cols-1 gap-4">
          <Field id="workspace" label="Company workspace" error={slugError}>
            <WorkspaceInput id="workspace" value={slug} onChange={setSlug} invalid={!!slugError} />
          </Field>
          <AnimatePresence initial={false}>
            {ws && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">{ws.logoText}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{ws.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {ws.industry} · {ws.country}
                    </div>
                  </div>
                  <Badge variant="success">
                    <BadgeCheck /> Verified
                  </Badge>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Field id="email" label="Work email" error={emailError}>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ws ? `you@${ws.slug === 'annex' ? 'annextech.co.ke' : `${ws.slug}.com`}` : 'you@company.com'}
                className={cn('pl-9', emailError && 'border-danger')}
                aria-invalid={!!emailError || undefined}
              />
            </div>
          </Field>

          <Field
            id="password"
            label="Password"
            error={pwError}
            action={
              <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            }
          >
            <PasswordInput id="password" value={password} onChange={setPassword} invalid={!!pwError} />
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            <Label htmlFor="remember" className="font-normal text-muted-foreground">
              Remember me on this device
            </Label>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <CircleAlert className="size-4 shrink-0" /> {error}
            </div>
          )}

          <SubmitButton loading={loading} loadingText="Signing in…">
            <Lock /> Sign in
          </SubmitButton>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" /> or try the demo <Separator className="flex-1" />
        </div>

        {demoEnabled && <DemoAccounts />}

        <div className="mt-6 grid grid-cols-1 gap-2 text-center text-sm text-muted-foreground">
          <p>
            Got an invite?{' '}
            <Link to="/invite/demo" className="font-medium text-primary hover:underline">
              Accept your invitation
            </Link>
          </p>
          <p className="sm:hidden">
            New company?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create a workspace
            </Link>
          </p>
          <Button asChild variant="link" className="mx-auto hidden text-sm sm:inline-flex">
            <Link to="/signup">
              Start a free company workspace <ArrowRight />
            </Link>
          </Button>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
