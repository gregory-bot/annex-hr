import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, LoaderCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SimpleSelect } from '@/components/ui/select'
import { Stepper } from '@/components/shared/Stepper'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { useAuth } from '@/context/auth'
import { cn } from '@/lib/utils'
import { AuthLayout, slideVariants } from './AuthLayout'
import { CodeInput } from './CodeInput'
import { FlowList, type FlowStep } from './FlowList'
import { Field, PasswordInput, StrengthMeter, SubmitButton, passwordStrength } from './fields'

const industries = ['Financial Services', 'Software & IT Services', 'Healthcare', 'Manufacturing', 'NGO & Non-profit', 'Faith-based Organisation', 'Retail & E-commerce', 'Logistics', 'Education', 'Hospitality']
const countries = ['Kenya', 'Nigeria', 'Uganda', 'Tanzania', 'Rwanda', 'Ghana', 'South Africa', 'Ethiopia']
const sizes = ['1–10', '11–50', '51–200', '201–500', '500+']

const statutory: Record<string, string> = {
  Kenya: 'PAYE, SHIF, NSSF',
  Nigeria: 'PAYE, Pension, NHF',
  Uganda: 'PAYE, NSSF, LST',
  Tanzania: 'PAYE, NSSF, SDL',
  Rwanda: 'PAYE, RSSB, CBHI',
  Ghana: 'PAYE, SSNIT, Tier 2',
  'South Africa': 'PAYE, UIF, SDL',
  Ethiopia: 'PIT, Pension',
}


const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32) || 'your-company'

interface Form {
  company: string
  industry: string
  country: string
  size: string
  email: string
  password: string
}
type Errors = Partial<Record<keyof Form, string>>

function validate(f: Form): Errors {
  const e: Errors = {}
  if (f.company.trim().length < 2) e.company = 'Enter your registered company name'
  if (!f.industry) e.industry = 'Select an industry'
  if (!f.country) e.country = 'Select a country'
  if (!f.size) e.size = 'Select company size'
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid work email'
  else if (/@(gmail|yahoo|hotmail|outlook)\./i.test(f.email)) e.email = 'Use your company email, not a personal address'
  if (passwordStrength(f.password).level < 2 || f.password.length < 8) e.password = 'Use at least 8 characters with numbers or symbols'
  return e
}

function Provisioning({ form, onDone }: { form: Form; onDone: () => void }) {
  const slug = slugify(form.company)
  const url = `${slug}.annexhr.com`
  const [chars, setChars] = useState(0)
  const [done, setDone] = useState(0)
  const items = ['Provisioning database', `Applying ${form.country} statutory settings (${statutory[form.country] ?? 'PAYE'})`, 'Creating default policies', 'Securing workspace']

  useEffect(() => {
    if (chars >= url.length) return
    const t = setTimeout(() => setChars((c) => c + 1), 38)
    return () => clearTimeout(t)
  }, [chars, url.length])

  useEffect(() => {
    if (done >= items.length) return
    const t = setTimeout(() => setDone((d) => d + 1), done === 0 ? 900 : 750)
    return () => clearTimeout(t)
  }, [done, items.length])

  const complete = done >= items.length
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{complete ? 'Workspace created' : 'Creating your workspace…'}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Email verified. We're setting up a private, isolated workspace for {form.company}.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b bg-subtle px-4 py-3">
          <span className="min-w-0 truncate font-mono text-sm font-semibold">
            https://{url.slice(0, chars)}
            {chars < url.length && <span className="ml-px inline-block h-4 w-px animate-pulse bg-foreground align-middle" />}
          </span>
          {complete && (
            <Badge variant="success" dot className="ml-auto">
              Live
            </Badge>
          )}
        </div>
        <ul className="grid grid-cols-1 gap-3 p-4">
          {items.map((it, i) => {
            const state = i < done ? 'done' : i === done ? 'active' : 'pending'
            return (
              <motion.li
                key={it}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: state === 'pending' ? 0.45 : 1, x: 0 }}
                transition={{ delay: i * 0.12 }}
                className="flex items-center gap-3 text-sm"
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
                    state === 'done' ? 'bg-success text-white' : state === 'active' ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'active' ? <LoaderCircle className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn(state === 'done' && 'text-foreground', state !== 'done' && 'text-muted-foreground')}>{it}</span>
              </motion.li>
            )
          })}
        </ul>
      </div>

      <Button size="lg" className="mt-6 w-full" disabled={!complete} onClick={onDone}>
        {complete ? (
          <>
            Continue
          </>
        ) : (
          <>
            <LoaderCircle className="animate-spin" /> Provisioning…
          </>
        )}
      </Button>
    </div>
  )
}

const setupSteps: FlowStep[] = [
  { title: 'Create your workspace', description: 'Company details and your admin account.' },
  { title: 'Verify your email', description: 'Confirm your work address to secure the workspace.' },
  { title: 'Invite your team', description: 'Employees join through a secure invitation link.' },
  { title: 'Go live', description: 'Onboarding, leave and payroll run from one place.' },
]

export default function Signup() {
  const { startRegistration, verifyRegistration, resendRegistrationCode, mock } = useAuth()
  const [domain, setDomain] = useState<string | null>(null)
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<'verify' | 'provision'>('verify')
  const [dir, setDir] = useState(1)
  const [form, setForm] = useState<Form>({ company: '', industry: '', country: 'Kenya', size: '', email: '', password: '' })
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [resending, setResending] = useState(false)

  // Resend cooldown countdown (the API refuses resends within 45 s).
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const errors = touched ? validate(form) : {}
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }


  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setFormError(null)
    if (Object.keys(validate(form)).length) return
    setLoading(true)
    void startRegistration({ companyName: form.company.trim(), industry: form.industry, country: form.country, size: form.size, email: form.email.trim(), password: form.password }).then((res) => {
      setLoading(false)
      if (!res.ok) {
        setFormError(res.error)
        toast.error('Could not start sign-up', { description: res.error })
        return
      }
      setVerificationId(res.verificationId)
      setCode('')
      setCodeError(null)
      setResendIn(45)
      setPhase('verify')
      go(1)
      toast.success('Verification code sent', { description: res.email })
    })
  }

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 6) {
      setCodeError('Enter all 6 digits of your code')
      return
    }
    if (!verificationId) return go(0)
    setLoading(true)
    void verifyRegistration(verificationId, code).then((res) => {
      setLoading(false)
      if (!res.ok) {
        setCodeError(res.error)
        setCode('')
        return
      }
      setDomain(res.domain ?? null)
      setDir(1)
      setPhase('provision')
    })
  }

  const resend = () => {
    if (!verificationId || resendIn > 0 || resending) return
    setResending(true)
    void resendRegistrationCode(verificationId).then((res) => {
      setResending(false)
      if (!res.ok) {
        toast.error('Could not resend the code', { description: res.error })
        return
      }
      setCode('')
      setCodeError(null)
      setResendIn(45)
      toast.success('New code sent', { description: form.email })
    })
  }

  const enter = () => {
    toast.success(`Welcome to Annex HR, ${form.company}!`, { description: `${domain ?? `${slugify(form.company)}.annexhr.com`} is ready.` })
    navigate('/app')
  }

  const slug = slugify(form.company)
  // Step 0: details · step 1: verifying → provisioned · step 2: admin ready (next up: invite the team).
  const setupIndex = step === 0 ? 0 : step === 1 ? (phase === 'verify' ? 1 : 2) : 2
  const aside = (
    <div className="max-w-sm">
      <h2 className="text-balance text-4xl font-bold tracking-tight">Set up your company in minutes.</h2>
      <p className="mt-4 text-lg text-white/80">One secure home for your people, payroll and policies.</p>
      <div className="mt-10 rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur">
        <FlowList title="How it works" steps={setupSteps} current={setupIndex} light />
      </div>
    </div>
  )

  return (
    <AuthLayout
      wide
      aside={aside}
    >
      <Stepper steps={['Company details', 'Verify & create', 'Admin ready']} current={step} className="mb-8" />

      <AnimatePresence mode="wait" custom={dir}>
        {step === 0 && (
          <motion.div key="details" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Create Company Workspace</h1>
            <p className="mt-2 text-sm text-muted-foreground">Start free for 30 days. You'll be the workspace's Company Admin.</p>
            <form onSubmit={submitDetails} noValidate className="mt-8 grid grid-cols-1 gap-4">
              <Field
                id="su-company"
                label="Company name"
                error={errors.company}
                hint={form.company ? (
                  <>
                    Your workspace: <span className="font-medium text-foreground">{slug}.annexhr.com</span>
                  </>
                ) : undefined}
              >
                <Input id="su-company" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Savannah Logistics Ltd" autoComplete="organization" aria-invalid={!!errors.company || undefined} className={cn(errors.company && 'border-danger')} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Industry" error={errors.industry}>
                  <SimpleSelect value={form.industry} onValueChange={(v) => set('industry', v)} options={industries} placeholder="Select industry" className={cn(errors.industry && 'border-danger')} />
                </Field>
                <Field label="Country" error={errors.country}>
                  <SimpleSelect value={form.country} onValueChange={(v) => set('country', v)} options={countries} placeholder="Select country" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Company size" error={errors.size}>
                  <SimpleSelect value={form.size} onValueChange={(v) => set('size', v)} options={sizes.map((s) => ({ value: s, label: `${s} employees` }))} placeholder="Select size" className={cn(errors.size && 'border-danger')} />
                </Field>
                <Field id="su-email" label="Work email" error={errors.email}>
                  <Input id="su-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.co.ke" autoComplete="email" aria-invalid={!!errors.email || undefined} className={cn(errors.email && 'border-danger')} />
                </Field>
              </div>
              <Field id="su-password" label="Password" error={errors.password}>
                <PasswordInput id="su-password" value={form.password} onChange={(v) => set('password', v)} autoComplete="new-password" invalid={!!errors.password} />
              </Field>
              <StrengthMeter password={form.password} />
              {formError && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">
                  {formError}
                </p>
              )}
              <SubmitButton loading={loading} loadingText="Sending code…" className="mt-2">
                Continue
              </SubmitButton>
            </form>
          </motion.div>
        )}

        {step === 1 && phase === 'verify' && (
          <motion.div key="verify" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Verify your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the 6-digit code we sent to <span className="font-medium text-foreground">{form.email}</span>.
            </p>
            <form onSubmit={submitCode} className="mt-8 grid grid-cols-1 gap-4">
              <CodeInput
                value={code}
                onChange={(v) => {
                  setCode(v)
                  setCodeError(null)
                }}
                invalid={!!codeError}
              />
              {codeError && (
                <p role="alert" className="text-xs font-medium text-danger">
                  {codeError}
                </p>
              )}
              {mock && <p className="text-xs text-muted-foreground">Demo: any 6 digits will work.</p>}
              <SubmitButton loading={loading} loadingText="Verifying…">
                Verify email
              </SubmitButton>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => go(0)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={resendIn > 0 || resending}
                  className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {resending ? 'Sending…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 1 && phase === 'provision' && (
          <motion.div key="provision" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <Provisioning form={form} onDone={() => go(2)} />
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="done" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <SuccessCheck />
            <h1 className="mt-6 text-center text-2xl font-bold tracking-tight sm:text-3xl">Admin invited automatically</h1>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
              {form.email} is now the Company Admin of <span className="font-medium text-foreground">{form.company}</span>.
            </p>

            <div className="mt-6 rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary font-bold text-white">{form.company.trim()[0]?.toUpperCase() ?? 'A'}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{form.company}</div>
                  <div className="truncate text-xs text-muted-foreground">{slug}.annexhr.com</div>
                </div>
                <Badge variant="soft">30-day trial</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  ['Industry', form.industry],
                  ['Country', form.country],
                  ['Size', form.size],
                  ['Statutory', statutory[form.country] ?? 'PAYE'],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-lg bg-subtle p-2.5">
                    <dt className="text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="truncate font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-6">
              <div className="text-sm font-semibold">Next steps</div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { t: 'Add departments', d: 'Structure & heads' },
                  { t: 'Invite employees', d: 'Email or CSV import' },
                  { t: 'Configure payroll', d: 'Pay dates & banks' },
                ].map((n, i) => (
                  <motion.div key={n.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex items-center gap-3 rounded-xl border p-3 sm:flex-col sm:items-start">
                    <span className="text-xs font-semibold tabular text-primary">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="text-sm font-medium">{n.t}</div>
                      <div className="text-xs text-muted-foreground">{n.d}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <Button size="lg" className="mt-6 w-full" onClick={enter} disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              {loading ? 'Opening workspace…' : (
                <>
                  Enter workspace
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {step === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have a workspace?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      )}

      <div className="mt-10 rounded-2xl border bg-subtle p-5 lg:hidden">
        <FlowList title="How it works" steps={setupSteps} current={setupIndex} />
      </div>
    </AuthLayout>
  )
}
