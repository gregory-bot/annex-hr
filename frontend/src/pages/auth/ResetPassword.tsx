import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, KeyRound, LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { api, ApiError, errorMessage, USE_MOCK_API } from '@/lib/api'
import { AuthLayout, slideVariants } from './AuthLayout'
import { Field, PasswordInput, StrengthMeter, SubmitButton, passwordStrength } from './fields'

type State = 'form' | 'done' | 'invalid'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<State>(token ? 'form' : 'invalid')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordError = touched && (password.length < 8 || passwordStrength(password).level < 2) ? 'Use at least 8 characters with numbers or symbols' : undefined
  const confirmError = touched && confirm !== password ? "Passwords don't match" : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (password.length < 8 || passwordStrength(password).level < 2 || confirm !== password) return
    setLoading(true)
    const request = USE_MOCK_API ? new Promise((r) => setTimeout(r, 800)) : api.post('/auth/reset-password', { token, password })
    request
      .then(() => setState('done'))
      .catch((err: unknown) => {
        // An unknown, used or expired token can't be retried — offer a fresh link instead.
        if (err instanceof ApiError && err.status === 400 && /invalid or has expired/i.test(err.message)) setState('invalid')
        else setError(errorMessage(err))
      })
      .finally(() => setLoading(false))
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" custom={1}>
        {state === 'form' && (
          <motion.div key="form" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Back to sign in
            </Link>
            <div className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
              <KeyRound className="size-5" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">Choose a new password</h1>
            <p className="mt-2 text-sm text-muted-foreground">Pick a strong password you don't use anywhere else.</p>
            <form onSubmit={submit} noValidate className="mt-8 grid grid-cols-1 gap-4">
              <Field id="rp-password" label="New password" error={passwordError}>
                <PasswordInput id="rp-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!passwordError} />
              </Field>
              <StrengthMeter password={password} />
              <Field id="rp-confirm" label="Confirm new password" error={confirmError}>
                <PasswordInput id="rp-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!confirmError} />
              </Field>
              {error && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">
                  {error}
                </p>
              )}
              <SubmitButton loading={loading} loadingText="Updating password…" className="mt-2">
                Update password
              </SubmitButton>
            </form>
          </motion.div>
        )}

        {state === 'done' && (
          <motion.div key="done" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit" className="text-center">
            <SuccessCheck />
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Password updated</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Your password has been changed. Sign in with your new password to continue.</p>
            <Button asChild size="lg" className="mt-8 w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </motion.div>
        )}

        {state === 'invalid' && (
          <motion.div key="invalid" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit" className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
              <LinkIcon className="size-6" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight">This reset link is invalid or has expired</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Reset links work once and expire after 30 minutes. Request a new one to continue.</p>
            <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild size="lg">
                <Link to="/forgot-password">Request a new link</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
