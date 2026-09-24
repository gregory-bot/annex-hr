import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { BadgeCheck, CircleAlert, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/auth'
import { useWorkspaceLookup } from './useWorkspaceLookup'
import { cn } from '@/lib/utils'
import { AuthLayout } from './AuthLayout'
import { Field, PasswordInput, SubmitButton, WorkspaceInput } from './fields'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { ws, checking, unreachable } = useWorkspaceLookup(slug)
  const slugError = slug && !ws && !checking ? (unreachable ? "Can't reach the Annex HR server — check your connection and try again" : `No workspace found with the name "${slug}"`) : !slug && touched ? 'Enter your company workspace' : undefined
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
    <AuthLayout>
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
                placeholder={ws?.slug === 'annex' ? 'you@annex-technologies.com' : 'you@company.com'}
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

        <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-xl border bg-subtle px-5 py-4 text-center sm:flex-row sm:text-left">
          <div>
            <div className="text-sm font-semibold">New to Annex HR?</div>
            <div className="text-xs text-muted-foreground">Set up a workspace for your company.</div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/signup">Create workspace</Link>
          </Button>
        </div>
      </motion.div>
    </AuthLayout>
  )
}
