import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Mail } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { api, USE_MOCK_API } from '@/lib/api'
import { useWorkspaceLookup } from './useWorkspaceLookup'
import { cn } from '@/lib/utils'
import { AuthLayout, slideVariants } from './AuthLayout'
import { Field, SubmitButton, WorkspaceInput } from './fields'

export default function ForgotPassword() {
  const [slug, setSlug] = useState('annex')
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { ws, checking, unreachable } = useWorkspaceLookup(slug)
  const slugError = slug && !ws && !checking ? (unreachable ? "Can't reach the Annex HR server — check your connection and try again" : `No workspace found at ${slug}.annexhr.com`) : touched && !slug ? 'Enter your company workspace' : undefined
  const emailOk = /^\S+@\S+\.\S+$/.test(email)
  const emailError = touched && !emailOk ? 'Enter a valid work email' : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!ws || !emailOk) return
    setLoading(true)
    const request = USE_MOCK_API ? new Promise((r) => setTimeout(r, 800)) : api.post('/auth/forgot-password', { workspace: slug, email })
    request
      .then(() => setSent(true))
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false))
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" custom={1}>
        {!sent ? (
          <motion.div key="form" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Back to sign in
            </Link>
            <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">Reset your password</h1>
            <p className="mt-2 text-sm text-muted-foreground">We'll email a secure reset link to the address registered in your company workspace.</p>
            <form onSubmit={submit} noValidate className="mt-8 grid grid-cols-1 gap-4">
              <Field id="fp-workspace" label="Company workspace" error={slugError} hint={ws ? `Resetting access for ${ws.name}` : undefined}>
                <WorkspaceInput id="fp-workspace" value={slug} onChange={setSlug} invalid={!!slugError} />
              </Field>
              <Field id="fp-email" label="Work email" error={emailError}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={cn('pl-9', emailError && 'border-danger')}
                    aria-invalid={!!emailError || undefined}
                  />
                </div>
              </Field>
              <SubmitButton loading={loading} loadingText="Sending link…">
                Send reset link
              </SubmitButton>
            </form>
          </motion.div>
        ) : (
          <motion.div key="sent" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit" className="text-center">
            <SuccessCheck />
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Check your inbox</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              If <span className="font-medium text-foreground">{email}</span> belongs to {ws?.name ?? 'your workspace'}, a reset link is on its way. It expires in 30 minutes.
            </p>
            <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="outline" size="lg" onClick={() => toast.success('Reset link sent again', { description: email })}>
                Resend email
              </Button>
              <Button asChild size="lg">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
            <button type="button" onClick={() => setSent(false)} className="mt-6 text-sm text-muted-foreground hover:text-foreground">
              Use a different email
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
