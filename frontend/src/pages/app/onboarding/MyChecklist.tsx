import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  ChevronDown,
  Coffee,
  FileSignature,
  FileText,
  HeartPulse,
  IdCard,
  Landmark,
  Laptop,
  Mail,
  PartyPopper,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { OnboardingTask } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { FileUploader } from '@/components/shared/FileUploader'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { cn, daysUntil, formatDate, TODAY } from '@/lib/utils'
import { seeded } from './util'

const taskIcons: Record<string, LucideIcon> = {
  id: IdCard,
  kra: FileText,
  shif: HeartPulse,
  nssf: ShieldCheck,
  passport: IdCard,
  policy: ScrollText,
  nda: FileSignature,
  emergency: Users,
  bank: Landmark,
}

const categoryMeta: Record<OnboardingTask['category'], { label: string; hint: string }> = {
  Documents: { label: 'Statutory documents', hint: 'Needed for payroll, KRA and benefits registration' },
  Policies: { label: 'Policies & agreements', hint: 'Read, acknowledge and sign' },
  Profile: { label: 'Your profile', hint: 'Help us look after you' },
  Finance: { label: 'Salary payments', hint: 'Verified by Finance before first payroll' },
}

const BANKS = ['KCB', 'Equity', 'NCBA', 'Co-op', 'Stanbic', 'Absa', 'I&M']
const DOC_TASKS = ['id', 'kra', 'shif', 'nssf', 'passport']

export function MyChecklist() {
  const { user, workspace, onboardingTasks, employees, employee, policies } = useWorkspace()
  const firstName = user.name.split(' ')[0]

  const initialDone = useMemo(() => {
    const n = Math.round((user.onboardingProgress / 100) * onboardingTasks.length)
    return new Set(onboardingTasks.slice(0, n).map((t) => t.id))
  }, [user.onboardingProgress, onboardingTasks])

  const [done, setDone] = useState<Set<string>>(initialDone)
  const [open, setOpen] = useState<string | null>(() => onboardingTasks.find((t) => !initialDone.has(t.id))?.id ?? null)

  const pct = Math.round((done.size / onboardingTasks.length) * 100)
  const requiredLeft = onboardingTasks.filter((t) => t.required && !done.has(t.id)).length

  const complete = (task: OnboardingTask, message?: string) => {
    setDone((prev) => {
      const next = new Set(prev)
      next.add(task.id)
      if (next.size === onboardingTasks.length) {
        setTimeout(() => toast.success('Onboarding complete — HR has been notified'), 250)
      }
      return next
    })
    toast.success(message ?? `${task.title} — done`)
    const nextTask = onboardingTasks.find((t) => t.id !== task.id && !done.has(t.id))
    setOpen(nextTask?.id ?? null)
  }

  const manager = employee(user.managerId)
  const buddy = useMemo(() => {
    const pool = employees.filter((e) => e.id !== user.id && e.id !== user.managerId && e.status === 'Active' && e.departmentId === user.departmentId)
    const list = pool.length ? pool : employees.filter((e) => e.id !== user.id && e.status === 'Active')
    return list[Math.floor(seeded(user.id + 'buddy') * list.length)]
  }, [employees, user])

  const dayIn = Math.max(1, 1 - daysUntil(user.startDate))
  const agenda: TimelineItem[] = [
    { title: 'Welcome breakfast & laptop setup', meta: 'Day 1 · 9:00', body: 'Collect your laptop from IT, set up MFA and join the team channels.', icon: Laptop },
    { title: `Team intro with ${manager?.name.split(' ')[0] ?? 'your manager'}`, meta: 'Day 1 · 14:00', body: 'Your 30-60-90 day plan and how the team works.', icon: Users },
    { title: 'HR & payroll orientation', meta: 'Day 2 · 10:00', body: 'Benefits, SHIF cover, leave and how payroll runs each month.', icon: Landmark },
    { title: `Coffee with your buddy${buddy ? `, ${buddy.name.split(' ')[0]}` : ''}`, meta: 'Day 3 · 11:00', body: 'Ask anything — from where to get lunch to how releases work.', icon: Coffee },
    { title: 'First-week check-in', meta: 'Day 5 · 16:00', body: 'A quick 1:1 to share what’s going well and what’s unclear.', icon: CalendarClock },
  ].map((item, i) => {
    const day = [1, 1, 2, 3, 5][i]!
    return { ...item, state: day < dayIn ? 'done' : day === dayIn || (i === 0 && dayIn <= 1) ? 'current' : 'upcoming' } as TimelineItem
  })

  const grouped = (Object.keys(categoryMeta) as OnboardingTask['category'][]).map((cat) => ({ cat, tasks: onboardingTasks.filter((t) => t.category === cat) }))

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-white sm:p-7"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
              <Sparkles className="size-3" /> Day {dayIn} at {workspace.name}
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Karibu, {firstName}!</h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              Welcome to {workspace.name}. Finish your checklist so we can register you with KRA, SHIF and NSSF and pay you on time.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white/10 p-3 backdrop-blur-sm">
            <div className="relative flex size-[68px] items-center justify-center">
              <svg width={68} height={68} className="-rotate-90">
                <circle cx={34} cy={34} r={29} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={6} />
                <motion.circle
                  cx={34}
                  cy={34}
                  r={29}
                  fill="none"
                  stroke="white"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 29}
                  animate={{ strokeDashoffset: 2 * Math.PI * 29 * (1 - pct / 100) }}
                  initial={{ strokeDashoffset: 2 * Math.PI * 29 }}
                  transition={{ duration: 0.9 }}
                />
              </svg>
              <span className="absolute text-sm font-bold tabular">{pct}%</span>
            </div>
            <div className="text-sm">
              <div className="font-semibold">
                {done.size} of {onboardingTasks.length} tasks
              </div>
              <div className="text-white/80">{requiredLeft ? `${requiredLeft} required left` : 'All required tasks done'}</div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-1 min-w-0 content-start gap-4">
          {/* Progress */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <AnimatePresence mode="wait" initial={false}>
                {pct === 100 ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative py-4 text-center">
                    <Confetti />
                    <SuccessCheck size={76} />
                    <h3 className="mt-4 text-lg font-bold">You’re all set, {firstName}!</h3>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      Every onboarding task is complete. HR will verify your documents within 24 hours and you’ll be included in the next payroll run.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-4 sm:gap-6">
                    <ProgressRing value={pct} size={84} stroke={8} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-semibold">Your onboarding progress</h3>
                        <span className="text-xs text-muted-foreground tabular">
                          {done.size}/{onboardingTasks.length}
                        </span>
                      </div>
                      <Progress value={pct} className="mt-3 h-3" />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {requiredLeft > 0 ? `${requiredLeft} required task${requiredLeft === 1 ? '' : 's'} remaining — most people finish in under 20 minutes.` : 'Required tasks done — the optional ones help too.'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Task groups */}
          {grouped.map(({ cat, tasks }, gi) => {
            const doneCount = tasks.filter((t) => done.has(t.id)).length
            return (
              <motion.div key={cat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * gi }}>
                <div className="mb-2 flex items-end justify-between gap-2 px-1">
                  <div>
                    <h3 className="text-sm font-semibold">{categoryMeta[cat].label}</h3>
                    <p className="text-xs text-muted-foreground">{categoryMeta[cat].hint}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular">
                    {doneCount}/{tasks.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      done={done.has(task.id)}
                      open={open === task.id}
                      onToggle={() => setOpen((o) => (o === task.id ? null : task.id))}
                    >
                      <TaskAction task={task} onComplete={complete} userName={user.name} workspaceName={workspace.name} policyTitles={policies.slice(0, 6).map((p) => p.title)} />
                    </TaskRow>
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Right rail */}
        <div className="grid grid-cols-1 content-start gap-4">
          <Section title="Your people" description="Here to help you settle in">
            <div className="grid grid-cols-1 gap-3">
              {manager && (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <PersonCell name={manager.name} sub={manager.title} />
                  <Badge variant="muted">Manager</Badge>
                </div>
              )}
              {buddy && (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <PersonCell name={buddy.name} sub={buddy.title} />
                  <Badge variant="soft">Buddy</Badge>
                </div>
              )}
              {buddy && (
                <Button variant="outline" size="sm" onClick={() => toast.success(`Message sent to ${buddy.name.split(' ')[0]}`)}>
                  <Mail /> Say hello to your buddy
                </Button>
              )}
            </div>
          </Section>

          <Section title="First-week agenda" description={`Started ${formatDate(user.startDate)}`}>
            <Timeline items={agenda} />
          </Section>

          <Card className="border-info/20 bg-info-soft/40">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                  <BellRing className="size-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Automatic reminders</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">We’ll nudge you about incomplete tasks so nothing blocks your first payslip.</p>
                </div>
              </div>
              <ol className="mt-4 grid grid-cols-1 gap-2">
                {[
                  { day: 'Day 1', text: 'Welcome email with your checklist link' },
                  { day: 'Day 3', text: 'Reminder for outstanding required tasks' },
                  { day: 'Day 7', text: 'Final reminder — HR is notified' },
                ].map((r) => (
                  <li key={r.day} className="flex items-center gap-3 rounded-lg bg-card p-2.5 text-xs">
                    <span className="w-12 shrink-0 font-semibold text-foreground">{r.day}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">{r.text}</span>
                    <span className="flex shrink-0 gap-1 text-muted-foreground">
                      <Mail className="size-3.5" aria-label="Email" />
                      <Bell className="size-3.5" aria-label="In-app" />
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, done, open, onToggle, children }: { task: OnboardingTask; done: boolean; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const Icon = taskIcons[task.id] ?? FileText
  return (
    <motion.div layout="position" whileHover={{ y: done ? 0 : -1 }} className={cn('overflow-hidden rounded-xl border bg-card transition-shadow', open && 'shadow-md ring-1 ring-primary/15')}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left sm:p-4" aria-expanded={open}>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            done ? 'bg-success-soft text-success' : 'bg-accent text-accent-foreground',
          )}
        >
          {done ? <Check className="size-5" strokeWidth={2.5} /> : <Icon className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-sm font-medium', done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{task.title}</span>
            {task.required ? <Badge variant="soft">Required</Badge> : <Badge variant="muted">Optional</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{task.description}</span>
        </span>
        <span className="hidden shrink-0 sm:block">{done ? <Badge variant="success" dot>Done</Badge> : <Badge variant="outline">To do</Badge>}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="border-t bg-subtle/60 p-3 sm:p-4">
              {done ? (
                <div className="flex items-center gap-2 text-sm text-success">
                  <Check className="size-4" /> Completed — HR will verify this shortly.
                </div>
              ) : (
                children
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function TaskAction({
  task,
  onComplete,
  userName,
  workspaceName,
  policyTitles,
}: {
  task: OnboardingTask
  onComplete: (t: OnboardingTask, msg?: string) => void
  userName: string
  workspaceName: string
  policyTitles: string[]
}) {
  if (DOC_TASKS.includes(task.id)) {
    return (
      <FileUploader
        compact
        multiple={false}
        label={`Upload ${task.title.replace('Upload ', '')}`}
        onComplete={(files) => onComplete(task, `${files[0]?.name ?? 'Document'} uploaded`)}
      />
    )
  }
  if (task.id === 'policy') return <PolicyPanel task={task} onComplete={onComplete} titles={policyTitles} />
  if (task.id === 'nda') return <NdaPanel task={task} onComplete={onComplete} userName={userName} workspaceName={workspaceName} />
  if (task.id === 'emergency') return <EmergencyForm task={task} onComplete={onComplete} />
  if (task.id === 'bank') return <BankForm task={task} onComplete={onComplete} />
  return (
    <Button size="sm" onClick={() => onComplete(task)}>
      Mark as done
    </Button>
  )
}

function PolicyPanel({ task, onComplete, titles }: { task: OnboardingTask; onComplete: (t: OnboardingTask, msg?: string) => void; titles: string[] }) {
  const [read, setRead] = useState<Set<string>>(new Set())
  const [agree, setAgree] = useState(false)
  const all = read.size === titles.length
  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-xs text-muted-foreground">Open each policy to mark it read. It takes about 10 minutes in total.</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {titles.map((t) => {
          const isRead = read.has(t)
          return (
            <button
              key={t}
              onClick={() => setRead((p) => new Set(p).add(t))}
              className={cn('flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/40', isRead && 'border-success/30')}
            >
              {isRead ? <Check className="size-4 text-success" /> : <ScrollText className="size-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{t}</span>
              <span className="text-[11px] text-muted-foreground">{isRead ? 'Read' : 'Open'}</span>
            </button>
          )
        })}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} disabled={!all} className="mt-0.5" />
        <span className={cn(!all && 'text-muted-foreground')}>I have read and accept these company policies.</span>
      </label>
      <div>
        <Button size="sm" disabled={!agree} onClick={() => onComplete(task, `${titles.length} policies acknowledged`)}>
          Accept policies
        </Button>
      </div>
    </div>
  )
}

function NdaPanel({ task, onComplete, userName, workspaceName }: { task: OnboardingTask; onComplete: (t: OnboardingTask, msg?: string) => void; userName: string; workspaceName: string }) {
  const [sig, setSig] = useState('')
  const valid = sig.trim().length >= 3
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="max-h-40 overflow-y-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground scrollbar-thin">
        <p className="font-semibold text-foreground">Non-Disclosure & IP Assignment Agreement</p>
        <p className="mt-2">
          This agreement is between <span className="text-foreground">{workspaceName}</span> (“the Company”) and{' '}
          <span className="text-foreground">{userName}</span> (“the Employee”).
        </p>
        <p className="mt-2">1. The Employee shall keep confidential all non-public information about the Company, its clients and employees, during and after employment.</p>
        <p className="mt-2">2. All work product created in the course of employment is the exclusive property of the Company.</p>
        <p className="mt-2">3. Personal data shall be processed only in line with the Kenya Data Protection Act, 2019.</p>
        <p className="mt-2">4. Obligations under this agreement survive termination for a period of three (3) years.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="nda-sig">Type your full name to sign</Label>
          <Input id="nda-sig" value={sig} onChange={(e) => setSig(e.target.value)} placeholder={userName} />
        </div>
        <Button disabled={!valid} onClick={() => onComplete(task, 'NDA signed')}>
          <FileSignature /> Sign
        </Button>
      </div>
      {valid && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-dashed bg-card px-4 py-3">
          <div className="font-serif text-2xl italic text-foreground">{sig}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Electronic signature · {formatDate(TODAY)}</div>
        </motion.div>
      )}
    </div>
  )
}

function EmergencyForm({ task, onComplete }: { task: OnboardingTask; onComplete: (t: OnboardingTask, msg?: string) => void }) {
  const [name, setName] = useState('')
  const [rel, setRel] = useState<string>()
  const [phone, setPhone] = useState('')
  const ok = name.trim() && rel && phone.replace(/\D/g, '').length >= 9
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grace Wanjiru" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Relationship</Label>
          <SimpleSelect value={rel} onValueChange={setRel} options={['Spouse', 'Parent', 'Sibling', 'Partner', 'Friend', 'Other']} placeholder="Select" />
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:col-span-2">
          <Label>Phone number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" inputMode="tel" />
        </div>
      </div>
      <div>
        <Button size="sm" disabled={!ok} onClick={() => onComplete(task, 'Emergency contact saved')}>
          Save contact
        </Button>
      </div>
    </div>
  )
}

function BankForm({ task, onComplete }: { task: OnboardingTask; onComplete: (t: OnboardingTask, msg?: string) => void }) {
  const [bank, setBank] = useState<string>()
  const [branch, setBranch] = useState('')
  const [acct, setAcct] = useState('')
  const ok = bank && branch.trim() && acct.replace(/\D/g, '').length >= 8
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Bank</Label>
          <SimpleSelect value={bank} onValueChange={setBank} options={BANKS} placeholder="Select bank" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Branch</Label>
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Westlands" />
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:col-span-2">
          <Label>Account number</Label>
          <Input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="0123456789" inputMode="numeric" />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Encrypted and visible only to Finance.
      </p>
      <div>
        <Button size="sm" disabled={!ok} onClick={() => onComplete(task, `${bank} account saved — Finance will verify`)}>
          Save bank details
        </Button>
      </div>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 22 }, (_, i) => i)
  const tones = ['bg-primary', 'bg-secondary', 'bg-warning', 'bg-success', 'bg-info']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <PartyPopper className="absolute left-4 top-2 size-5 text-primary/70" />
      <PartyPopper className="absolute right-4 top-2 size-5 -scale-x-100 text-primary/70" />
      {pieces.map((i) => {
        const x = (seeded('c' + i) - 0.5) * 520
        const y = 60 + seeded('y' + i) * 120
        return (
          <motion.span
            key={i}
            className={cn('absolute left-1/2 top-10 h-2 w-1.5 rounded-[2px]', tones[i % tones.length])}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x, y, opacity: 0, rotate: 360 * (seeded('r' + i) > 0.5 ? 1 : -1) }}
            transition={{ duration: 1.6 + seeded('d' + i), ease: 'easeOut', delay: 0.1 }}
          />
        )
      })}
    </div>
  )
}
