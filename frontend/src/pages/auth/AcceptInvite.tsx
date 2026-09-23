import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { addDays } from 'date-fns'
import { ArrowLeft, ArrowRight, BadgeCheck, Building, CalendarDays, CircleCheck, FileText, IdCard, Inbox, LoaderCircle, Lock, ShieldCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PersonAvatar } from '@/components/ui/avatar'
import { Stepper } from '@/components/shared/Stepper'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { FileUploader } from '@/components/shared/FileUploader'
import { personaFor, useAuth } from '@/context/auth'
import { workspaceData } from '@/data/seed'
import { TODAY, cn, formatDate } from '@/lib/utils'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { AuthLayout, slideVariants } from './AuthLayout'
import { FlowList } from './FlowList'
import { Field, PasswordInput, StrengthMeter, SubmitButton, passwordStrength } from './fields'

interface InviteInfo {
  email: string
  role: string
  invitedBy: string | null
  workspace: { name: string; slug: string; domain: string; logoText: string; industry: string; country: string }
}

/** jane.wanjiru@acme.co.ke → Jane Wanjiru */
const nameFromEmail = (email: string) =>
  email
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(' ')

const steps = ['Password', 'Workspace', 'Profile', 'Documents', 'Policies', 'Probation']
const stepTitles = ['Create password', 'Join company workspace', 'Complete profile', 'Upload documents', 'Policy acknowledgement', 'Start probation']
const policies = [
  { id: 'code', title: 'Code of Conduct', meta: 'v3.2 · 6 pages' },
  { id: 'dp', title: 'Data Protection & Confidentiality', meta: 'Data Protection Act 2019 · 4 pages' },
  { id: 'leave', title: 'Leave & Attendance Policy', meta: '21 days annual leave · 3 pages' },
]
const employeeFlow = ['Receive invitation', 'Create password', 'Join company workspace', 'Complete profile', 'Upload documents', 'Acknowledge policies', 'Start probation']

function InviteEmail({ inviter, company, domain, invitee, onAccept }: { inviter: string; company: string; domain: string; invitee: { name: string; email: string; title: string }; onAccept: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Inbox className="size-4" /> 1 new message
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5">
        <div className="border-b bg-subtle px-4 py-3 text-xs sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="text-muted-foreground">From</span> <span className="font-medium">Annex HR &lt;invites@annexhr.com&gt;</span>
            </span>
            <span className="text-muted-foreground">{formatDate(TODAY, 'medium')}, 08:42</span>
          </div>
          <div className="mt-1 truncate">
            <span className="text-muted-foreground">To</span> <span className="font-medium">{invitee.email}</span>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <PersonAvatar name={inviter} className="size-11" />
            <div className="min-w-0">
              <h1 className="text-balance text-lg font-semibold leading-snug">
                {inviter} invited you to join {company} on Annex HR
              </h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Hi {invitee.name.split(' ')[0]}, welcome to the team! You've been added as <span className="font-medium text-foreground">{invitee.title}</span>. Set up your account to complete onboarding before your first day.
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-xl border bg-subtle p-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">{company[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{company}</div>
              <div className="truncate text-xs text-muted-foreground">{domain}</div>
            </div>
            <Badge variant="muted">Expires in 14 days</Badge>
          </div>
          <Button size="lg" className="mt-5 w-full" onClick={onAccept}>
            Accept invitation <ArrowRight />
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Not expecting this? You can safely ignore this email.</p>
        </div>
      </motion.div>
    </div>
  )
}

export default function AcceptInvite() {
  const { token } = useParams()
  const { acceptInvite } = useAuth()
  const navigate = useNavigate()
  const umba = workspaceData['ws-umba']

  // Real invitations are loaded from the API; /invite/demo walks through the flow with demo data.
  const isDemo = !token || token === 'demo' || USE_MOCK_API
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  useEffect(() => {
    if (isDemo) return
    api
      .get<InviteInfo>(`/invitations/${encodeURIComponent(token!)}`)
      .then(setInvite)
      .catch((err) => setInviteError(errorMessage(err)))
  }, [isDemo, token])

  const demoInvitee = useMemo(() => personaFor('ws-umba', 'employee'), [])
  const invitee = invite ? { name: nameFromEmail(invite.email), email: invite.email, title: 'New starter', phone: '' } : demoInvitee
  const inviter = invite?.invitedBy ?? umba.employees.find((e) => e.role === 'company_admin')?.name ?? 'Your HR team'
  const company = invite
    ? { name: invite.workspace.name, logoText: invite.workspace.logoText, domain: invite.workspace.domain, industry: invite.workspace.industry, hq: invite.workspace.country }
    : { name: umba.workspace.name, logoText: umba.workspace.logoText, domain: umba.workspace.domain, industry: umba.workspace.industry, hq: `${umba.workspace.offices[0]?.city}, ${umba.workspace.country}` }

  const [accepted, setAccepted] = useState(false)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [joinConfirmed, setJoinConfirmed] = useState(true)
  const [profile, setProfile] = useState({ phone: invitee.phone ?? '', emergencyName: '', emergencyPhone: '', dob: '' })
  const [docs, setDocs] = useState<{ id: boolean; kra: boolean }>({ id: false, kra: false })
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  const [signature, setSignature] = useState('')

  const probationEnd = addDays(new Date(TODAY), 90)

  const errors: Record<string, string | undefined> = touched
    ? {
        password: step === 0 && (password.length < 8 || passwordStrength(password).level < 2) ? 'Use at least 8 characters with numbers or symbols' : undefined,
        confirm: step === 0 && confirm !== password ? 'Passwords do not match' : undefined,
        phone: step === 2 && !/^\+?[\d\s]{9,15}$/.test(profile.phone) ? 'Enter a valid phone number' : undefined,
        emergencyName: step === 2 && profile.emergencyName.trim().length < 2 ? 'Enter an emergency contact' : undefined,
        emergencyPhone: step === 2 && !/^\+?[\d\s]{9,15}$/.test(profile.emergencyPhone) ? 'Enter a valid phone number' : undefined,
        dob: step === 2 && !profile.dob ? 'Select your date of birth' : undefined,
        docs: step === 3 && !(docs.id && docs.kra) ? 'Upload both your national ID and KRA PIN certificate' : undefined,
        acks: step === 4 && !policies.every((p) => acks[p.id]) ? 'Acknowledge all three policies to continue' : undefined,
        signature: step === 4 && signature.trim().toLowerCase() !== invitee.name.toLowerCase() ? `Type your full name exactly: ${invitee.name}` : undefined,
      }
    : {}

  const next = (e?: React.FormEvent) => {
    e?.preventDefault()
    setTouched(true)
    const stepValid = [
      password.length >= 8 && passwordStrength(password).level >= 2 && confirm === password,
      joinConfirmed,
      /^\+?[\d\s]{9,15}$/.test(profile.phone) && profile.emergencyName.trim().length >= 2 && /^\+?[\d\s]{9,15}$/.test(profile.emergencyPhone) && !!profile.dob,
      docs.id && docs.kra,
      policies.every((p) => acks[p.id]) && signature.trim().toLowerCase() === invitee.name.toLowerCase(),
    ][step]
    if (!stepValid) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setTouched(false)
      setDir(1)
      setStep((s) => s + 1)
      if (step === 4) toast.success('Policies signed', { description: 'Copies saved to your documents.' })
    }, 600)
  }

  const back = () => {
    setDir(-1)
    setTouched(false)
    setStep((s) => Math.max(0, s - 1))
  }

  const finish = () => {
    setLoading(true)
    void acceptInvite(token ?? 'demo', { name: invitee.name, password, phone: profile.phone || undefined, birthday: profile.dob || undefined }).then((res) => {
      setLoading(false)
      if (!res.ok) {
        toast.error('Could not join the workspace', { description: res.error })
        return
      }
      toast.success(`Welcome to ${company.name}, ${invitee.name.split(' ')[0]}!`, { description: 'Your onboarding checklist is ready.' })
      navigate('/app')
    })
  }

  const aside = (
    <div className="max-w-sm">
      <h2 className="text-balance text-3xl font-bold tracking-tight">Your first day, sorted before it starts.</h2>
      <p className="mt-3 text-white/80">Complete your paperwork in minutes — no printing, scanning or chasing HR.</p>
      <div className="mt-8 rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur">
        <FlowList title="Employee flow" steps={employeeFlow} current={accepted ? step + 1 : 0} light />
      </div>
    </div>
  )

  const navButtons = (label = 'Continue') => (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
      {step > 0 && (
        <Button type="button" variant="outline" size="lg" onClick={back} className="sm:w-auto">
          <ArrowLeft /> Back
        </Button>
      )}
      <SubmitButton loading={loading} loadingText="Saving…" className="sm:flex-1">
        {label} <ArrowRight />
      </SubmitButton>
    </div>
  )

  if (inviteError) {
    return (
      <AuthLayout aside={aside}>
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
            <Lock className="size-5" />
          </div>
          <h1 className="mt-4 text-xl font-bold">This invitation can't be used</h1>
          <p className="mt-2 text-sm text-muted-foreground">{inviteError}</p>
          <Button asChild className="mt-6">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }
  if (!isDemo && !invite) {
    return (
      <AuthLayout aside={aside}>
        <div className="flex justify-center py-16">
          <LoaderCircle className="size-6 animate-spin text-primary" />
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      wide
      aside={aside}
      topRight={
        <Link to="/login" className="mr-1 hidden text-muted-foreground hover:text-foreground sm:inline">
          Sign in
        </Link>
      }
    >
      <AnimatePresence mode="wait" custom={dir}>
        {!accepted ? (
          <motion.div key="email" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <InviteEmail
              inviter={inviter}
              company={company.name}
              domain={company.domain}
              invitee={invitee}
              onAccept={() => {
                setDir(1)
                setAccepted(true)
              }}
            />
            {token && <p className="mt-4 text-center text-[11px] text-muted-foreground">Invitation reference · {token}</p>}
          </motion.div>
        ) : (
          <motion.div key="wizard" custom={1} variants={slideVariants} initial="enter" animate="center" exit="exit">
            <Stepper steps={steps} current={step} />
            <div className="mb-6 mt-3 text-xs font-medium text-muted-foreground sm:hidden">
              Step {step + 1} of {steps.length} · {stepTitles[step]}
            </div>
            <div className="hidden h-6 sm:block" />

            <AnimatePresence mode="wait" custom={dir}>
              <motion.div key={step} custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit">
                {step === 0 && (
                  <form onSubmit={next} noValidate>
                    <h1 className="text-2xl font-bold tracking-tight">Create your password</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      You'll sign in as <span className="font-medium text-foreground">{invitee.email}</span>
                    </p>
                    <div className="mt-6 grid grid-cols-1 gap-4">
                      <Field id="inv-pw" label="Password" error={errors.password}>
                        <PasswordInput id="inv-pw" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!errors.password} />
                      </Field>
                      <StrengthMeter password={password} />
                      <Field id="inv-confirm" label="Confirm password" error={errors.confirm}>
                        <PasswordInput id="inv-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!errors.confirm} />
                      </Field>
                    </div>
                    {navButtons()}
                  </form>
                )}

                {step === 1 && (
                  <form onSubmit={next}>
                    <h1 className="text-2xl font-bold tracking-tight">Join company workspace</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Confirm this is the organization that hired you. Your account only works inside this workspace.</p>
                    <div className="mt-6 rounded-2xl border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-lg font-bold text-white">{company.logoText}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 font-semibold">
                            {company.name} <BadgeCheck className="size-4 text-primary" />
                          </div>
                          <div className="truncate font-mono text-xs text-muted-foreground">{company.domain}</div>
                        </div>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        {[
                          ['Industry', company.industry],
                          ['Headquarters', company.hq],
                          ['Your role', invitee.title],
                          ['Invited by', inviter],
                        ].map(([k, v]) => (
                          <div key={k} className="min-w-0 rounded-lg bg-subtle p-2.5">
                            <dt className="text-[11px] text-muted-foreground">{k}</dt>
                            <dd className="truncate font-medium">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div className="mt-4 flex items-start gap-2">
                      <Checkbox id="inv-join" checked={joinConfirmed} onCheckedChange={(v) => setJoinConfirmed(v === true)} className="mt-0.5" />
                      <Label htmlFor="inv-join" className="font-normal leading-snug text-muted-foreground">
                        I confirm I'm joining {company.name} and agree to its workspace terms.
                      </Label>
                    </div>
                    {navButtons('Join workspace')}
                  </form>
                )}

                {step === 2 && (
                  <form onSubmit={next} noValidate>
                    <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
                    <p className="mt-2 text-sm text-muted-foreground">HR uses this for payroll, benefits and emergencies. Only HR can see it.</p>
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field id="inv-phone" label="Phone number" error={errors.phone}>
                        <Input id="inv-phone" type="tel" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+254 712 345 678" autoComplete="tel" className={cn(errors.phone && 'border-danger')} />
                      </Field>
                      <Field id="inv-dob" label="Date of birth" error={errors.dob}>
                        <Input id="inv-dob" type="date" max="2008-09-23" value={profile.dob} onChange={(e) => setProfile((p) => ({ ...p, dob: e.target.value }))} className={cn(errors.dob && 'border-danger')} />
                      </Field>
                      <Field id="inv-ec" label="Emergency contact name" error={errors.emergencyName}>
                        <Input id="inv-ec" value={profile.emergencyName} onChange={(e) => setProfile((p) => ({ ...p, emergencyName: e.target.value }))} placeholder="Mary Wambui (Mother)" className={cn(errors.emergencyName && 'border-danger')} />
                      </Field>
                      <Field id="inv-ecp" label="Emergency contact phone" error={errors.emergencyPhone}>
                        <Input id="inv-ecp" type="tel" value={profile.emergencyPhone} onChange={(e) => setProfile((p) => ({ ...p, emergencyPhone: e.target.value }))} placeholder="+254 722 000 111" className={cn(errors.emergencyPhone && 'border-danger')} />
                      </Field>
                    </div>
                    {navButtons()}
                  </form>
                )}

                {step === 3 && (
                  <form onSubmit={next}>
                    <h1 className="text-2xl font-bold tracking-tight">Upload documents</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Stored encrypted in your employee file. PDF, PNG or JPG up to 10MB.</p>
                    <div className="mt-6 grid grid-cols-1 gap-4">
                      {(
                        [
                          { key: 'id', label: 'National ID / Passport', icon: IdCard },
                          { key: 'kra', label: 'KRA PIN certificate', icon: FileText },
                        ] as const
                      ).map((d) => (
                        <div key={d.key} className="rounded-2xl border p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <d.icon className="size-4 text-primary" /> {d.label}
                            </div>
                            {docs[d.key] ? (
                              <Badge variant="success">
                                <CircleCheck /> Uploaded
                              </Badge>
                            ) : (
                              <Badge variant="muted">Required</Badge>
                            )}
                          </div>
                          <FileUploader compact multiple={false} accept=".pdf,.png,.jpg,.jpeg" label={`Upload ${d.label}`} onComplete={() => setDocs((s) => ({ ...s, [d.key]: true }))} />
                        </div>
                      ))}
                      {errors.docs && (
                        <p role="alert" className="text-xs font-medium text-danger">
                          {errors.docs}
                        </p>
                      )}
                      <button type="button" className="justify-self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setDocs({ id: true, kra: true })}>
                        Demo: mark both as uploaded
                      </button>
                    </div>
                    {navButtons()}
                  </form>
                )}

                {step === 4 && (
                  <form onSubmit={next} noValidate>
                    <h1 className="text-2xl font-bold tracking-tight">Policy acknowledgement</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Read and acknowledge {company.name}'s core policies.</p>
                    <div className="mt-6 grid grid-cols-1 gap-2">
                      {policies.map((p) => (
                        <label key={p.id} htmlFor={`pol-${p.id}`} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:bg-subtle', acks[p.id] && 'border-primary/40 bg-accent/30')}>
                          <Checkbox id={`pol-${p.id}`} checked={!!acks[p.id]} onCheckedChange={(v) => setAcks((a) => ({ ...a, [p.id]: v === true }))} />
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <ShieldCheck className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{p.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.meta}</span>
                          </span>
                          <button type="button" className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={(e) => { e.preventDefault(); toast.info(`${p.title}`, { description: 'Policy opened in the document viewer.' }) }}>
                            Read
                          </button>
                        </label>
                      ))}
                      {errors.acks && (
                        <p role="alert" className="text-xs font-medium text-danger">
                          {errors.acks}
                        </p>
                      )}
                    </div>
                    <div className="mt-5">
                      <Field id="inv-sign" label="Typed signature" error={errors.signature} hint={`Type your full name (${invitee.name}) to sign electronically.`}>
                        <Input id="inv-sign" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={invitee.name} className={cn('h-12 font-serif text-lg italic', errors.signature && 'border-danger')} autoComplete="name" />
                      </Field>
                    </div>
                    {navButtons('Sign & continue')}
                  </form>
                )}

                {step === 5 && (
                  <div className="text-center">
                    <SuccessCheck />
                    <h1 className="mt-6 text-2xl font-bold tracking-tight">You're all set, {invitee.name.split(' ')[0]}!</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Your 90-day probation starts today.</p>
                    <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
                      {[
                        { icon: CalendarDays, k: 'Start date', v: formatDate(TODAY) },
                        { icon: Lock, k: 'Probation ends', v: formatDate(probationEnd) },
                        { icon: Building, k: 'Workspace', v: company.domain },
                      ].map((r, i) => (
                        <motion.div key={r.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.08 }} className="min-w-0 rounded-xl border bg-card p-3">
                          <r.icon className="size-4 text-primary" />
                          <div className="mt-2 text-[11px] text-muted-foreground">{r.k}</div>
                          <div className="truncate text-sm font-semibold">{r.v}</div>
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl bg-subtle p-3 text-left text-xs text-muted-foreground">
                      Your manager will schedule a 30-day and 60-day check-in. Your onboarding checklist, IT access and payroll setup are waiting on your dashboard.
                    </div>
                    <Button size="lg" className="mt-6 w-full" onClick={finish} disabled={loading}>
                      {loading ? <LoaderCircle className="animate-spin" /> : null}
                      {loading ? 'Opening dashboard…' : (
                        <>
                          Go to my dashboard <ArrowRight />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
