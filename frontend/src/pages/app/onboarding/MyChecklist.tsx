import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useWorkspace } from '@/context/auth'
import type { OnboardingTask } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { FILE_ACCEPT, uploadFile, type EmployeeFile } from '@/lib/files'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FileUploader } from '@/components/shared/FileUploader'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { StoredFileCard } from '@/components/shared/StoredFileCard'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { cn, daysUntil, formatDate, TODAY } from '@/lib/utils'
import { DOC_TASK_META, normaliseNumber, type CompleteResult, type OnboardingTaskState, type OnboardingView, type TaskValues } from './api'
import { seeded } from './util'

const categoryMeta: Record<OnboardingTask['category'], { label: string; hint: string }> = {
  Documents: { label: 'Statutory documents', hint: 'Needed for payroll, KRA and benefits registration' },
  Policies: { label: 'Policies & agreements', hint: 'Read, acknowledge and sign' },
  Profile: { label: 'Your profile', hint: 'Help us look after you' },
  Finance: { label: 'Salary payments', hint: 'Verified by Finance before first payroll' },
}

const BANKS = ['KCB', 'Equity', 'NCBA', 'Co-op', 'Stanbic', 'Absa', 'I&M', 'Family Bank', 'DTB', 'Standard Chartered']

/** A locally stored file (mock mode has no server to hold the bytes). */
type LocalFile = { filename: string; size: string }
type TaskView = OnboardingTaskState & { localFile?: LocalFile }
/** Completes a task; resolves false (after showing the error) when the server rejects it. */
type CompleteFn = (task: TaskView, body: Record<string, unknown>, message: string, localFile?: LocalFile) => Promise<boolean>

export function MyChecklist() {
  const { user, workspace, onboardingTasks, employees, employee, policies } = useWorkspace()
  const { refresh } = useAuth()
  const live = !USE_MOCK_API
  const firstName = user.name.split(' ')[0]

  // Live: the server's per-task view. Mock: local state seeded from the demo progress.
  const [view, setView] = useState<OnboardingView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mock, setMock] = useState<Record<string, { completedAt: string; values?: TaskValues; localFile?: LocalFile }>>(() => {
    const n = Math.round((user.onboardingProgress / 100) * onboardingTasks.length)
    return Object.fromEntries(onboardingTasks.slice(0, n).map((t) => [t.id, { completedAt: TODAY }]))
  })
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(null)
    return api
      .get<OnboardingView>('/onboarding/me')
      .then((v) => {
        setView(v)
        setOpen((o) => o ?? v.tasks.find((t) => !t.completedAt)?.id ?? null)
      })
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (live) void load()
    else setOpen((o) => o ?? onboardingTasks.find((t) => !mock[t.id])?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, load])

  const tasks: TaskView[] = useMemo(
    () =>
      live
        ? (view?.tasks ?? [])
        : onboardingTasks.map((t) => ({ ...t, completedAt: mock[t.id]?.completedAt ?? null, file: null, values: mock[t.id]?.values ?? null, localFile: mock[t.id]?.localFile })),
    [live, view, onboardingTasks, mock],
  )

  const doneCount = tasks.filter((t) => t.completedAt).length
  const total = Math.max(1, tasks.length)
  const pct = Math.round((doneCount / total) * 100)
  const requiredLeft = tasks.filter((t) => t.required && !t.completedAt).length

  const complete: CompleteFn = async (task, body, message, localFile) => {
    const wasDone = !!task.completedAt
    try {
      if (live) {
        const r = await api.post<CompleteResult>(`/onboarding/tasks/${encodeURIComponent(task.id)}/complete`, body)
        setView((v) =>
          v && {
            ...v,
            onboardingProgress: r.onboardingProgress,
            status: r.status,
            requiredLeft: r.requiredLeft,
            tasks: v.tasks.map((t) => (t.id === task.id && r.task ? r.task : t)),
          },
        )
        void refresh()
      } else {
        const values: TaskValues = Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== 'fileId' && typeof v === 'string')) as TaskValues
        setMock((m) => ({ ...m, [task.id]: { completedAt: TODAY, values, localFile: localFile ?? m[task.id]?.localFile } }))
      }
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    }
    toast.success(message)
    if (!wasDone) {
      const left = tasks.filter((t) => t.id !== task.id && !t.completedAt)
      if (!left.length) setTimeout(() => toast.success('Onboarding complete — HR has been notified'), 250)
      setOpen(left[0]?.id ?? null)
    }
    return true
  }

  const manager = employee(user.managerId)
  const buddy = useMemo(() => {
    const pool = employees.filter((e) => e.id !== user.id && e.id !== user.managerId && e.status === 'Active' && e.departmentId === user.departmentId)
    const list = pool.length ? pool : employees.filter((e) => e.id !== user.id && e.status === 'Active')
    return list[Math.floor(seeded(user.id + 'buddy') * list.length)]
  }, [employees, user])

  const dayIn = Math.max(1, 1 - daysUntil(user.startDate))
  const agenda: TimelineItem[] = [
    { title: 'Welcome breakfast & laptop setup', meta: 'Day 1 · 9:00', body: 'Collect your laptop from IT, set up MFA and join the team channels.' },
    { title: `Team intro with ${manager?.name.split(' ')[0] ?? 'your manager'}`, meta: 'Day 1 · 14:00', body: 'Your 30-60-90 day plan and how the team works.' },
    { title: 'HR & payroll orientation', meta: 'Day 2 · 10:00', body: 'Benefits, SHIF cover, leave and how payroll runs each month.' },
    { title: `Coffee with your buddy${buddy ? `, ${buddy.name.split(' ')[0]}` : ''}`, meta: 'Day 3 · 11:00', body: 'Ask anything — from where to get lunch to how releases work.' },
    { title: 'First-week check-in', meta: 'Day 5 · 16:00', body: 'A quick 1:1 to share what’s going well and what’s unclear.' },
  ].map((item, i) => {
    const day = [1, 1, 2, 3, 5][i]!
    return { ...item, state: day < dayIn ? 'done' : day === dayIn || (i === 0 && dayIn <= 1) ? 'current' : 'upcoming' } as TimelineItem
  })

  const grouped = (Object.keys(categoryMeta) as OnboardingTask['category'][])
    .map((cat) => ({ cat, tasks: tasks.filter((t) => t.category === cat) }))
    .filter((g) => g.tasks.length)

  if (live && !view) {
    return loadError ? (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">We couldn’t load your checklist: {loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    ) : (
      <div className="grid grid-cols-1 gap-4" aria-busy="true">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    )
  }

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
            <div className="mb-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
              Day {dayIn} at {workspace.name}
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
                {doneCount} of {tasks.length} tasks
              </div>
              <div className="text-white/80">{requiredLeft ? `${requiredLeft} required left` : 'All required tasks done'}</div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
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
                          {doneCount}/{tasks.length}
                        </span>
                      </div>
                      <Progress value={pct} className="mt-3 h-3" />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {requiredLeft > 0
                          ? `${requiredLeft} required task${requiredLeft === 1 ? '' : 's'} remaining — your progress is saved as you go.`
                          : 'Required tasks done — the optional ones help too.'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          {/* Task groups */}
          {grouped.map(({ cat, tasks: group }, gi) => {
            const groupDone = group.filter((t) => t.completedAt).length
            return (
              <motion.div key={cat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * gi }}>
                <div className="mb-2 flex items-end justify-between gap-2 px-1">
                  <div>
                    <h3 className="text-sm font-semibold">{categoryMeta[cat].label}</h3>
                    <p className="text-xs text-muted-foreground">{categoryMeta[cat].hint}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular">
                    {groupDone}/{group.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {group.map((task, ti) => (
                    <TaskRow key={task.id} n={ti + 1} task={task} open={open === task.id} onToggle={() => setOpen((o) => (o === task.id ? null : task.id))}>
                      <TaskAction
                        task={task}
                        live={live}
                        onComplete={complete}
                        userName={user.name}
                        workspaceName={workspace.name}
                        policyTitles={policies.slice(0, 6).map((p) => p.title)}
                      />
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
                  Say hello to your buddy
                </Button>
              )}
            </div>
          </Section>

          <Section title="First-week agenda" description={`Started ${formatDate(user.startDate)}`}>
            <Timeline items={agenda} />
          </Section>

          <Card className="border-info/20 bg-info-soft/40">
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Automatic reminders</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">We’ll nudge you about incomplete tasks so nothing blocks your first payslip.</p>
              <ol className="mt-4 grid grid-cols-1 gap-2">
                {[
                  { day: 'Day 1', text: 'Welcome email with your checklist link' },
                  { day: 'Day 3', text: 'Reminder for outstanding required tasks' },
                  { day: 'Day 7', text: 'Final reminder — HR is notified' },
                ].map((r) => (
                  <li key={r.day} className="flex items-center gap-3 rounded-lg bg-card p-2.5 text-xs">
                    <span className="w-12 shrink-0 font-semibold text-foreground">{r.day}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">{r.text}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">Email · In-app</span>
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

function TaskRow({ task, n, open, onToggle, children }: { task: TaskView; n: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const done = !!task.completedAt
  const attached = task.file?.filename ?? task.localFile?.filename
  return (
    <motion.div layout="position" className={cn('overflow-hidden rounded-xl border bg-card transition-shadow', open && 'shadow-md ring-1 ring-primary/15')}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left sm:p-4" aria-expanded={open}>
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular transition-colors',
            done ? 'border-transparent bg-success text-white' : 'text-muted-foreground',
          )}
          aria-hidden
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-sm font-medium', done && 'text-muted-foreground')}>{task.title}</span>
            {task.required ? <Badge variant="soft">Required</Badge> : <Badge variant="muted">Optional</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{done && attached ? attached : task.description}</span>
        </span>
        <span className="hidden shrink-0 sm:block">
          {done ? (
            <Badge variant="success" dot>
              Done
            </Badge>
          ) : (
            <Badge variant="outline">To do</Badge>
          )}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="border-t bg-subtle/60 p-3 sm:p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function DoneNote({ task, children }: { task: TaskView; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm text-success">
        <Check className="size-4 shrink-0" /> Completed {task.completedAt ? formatDate(task.completedAt.slice(0, 10)) : ''} — HR will verify this shortly.
      </div>
      {children}
    </div>
  )
}

function TaskAction({
  task,
  live,
  onComplete,
  userName,
  workspaceName,
  policyTitles,
}: {
  task: TaskView
  live: boolean
  onComplete: CompleteFn
  userName: string
  workspaceName: string
  policyTitles: string[]
}) {
  if (DOC_TASK_META[task.id]) return <DocPanel task={task} live={live} onComplete={onComplete} />
  if (task.id === 'policy') return <PolicyPanel task={task} onComplete={onComplete} titles={policyTitles} />
  if (task.id === 'nda') return <NdaPanel task={task} onComplete={onComplete} userName={userName} workspaceName={workspaceName} />
  if (task.id === 'emergency') return <EmergencyForm task={task} onComplete={onComplete} />
  if (task.id === 'bank') return <BankForm task={task} onComplete={onComplete} />
  return task.completedAt ? (
    <DoneNote task={task} />
  ) : (
    <Button size="sm" onClick={() => void onComplete(task, {}, `${task.title} — done`)}>
      Mark as done
    </Button>
  )
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function DocPanel({ task, live, onComplete }: { task: TaskView; live: boolean; onComplete: CompleteFn }) {
  const meta = DOC_TASK_META[task.id]!
  const saved = str(task.values?.number)
  const [number, setNumber] = useState(saved)
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const normalised = normaliseNumber(number)
  const numberOk = !normalised || meta.pattern.test(normalised)
  const hasFile = !!(task.file || task.localFile)
  const docName = task.title.replace(/^Upload /, '')

  const finish = async (fileId: string | undefined, localFile?: LocalFile) => {
    setBusy(true)
    const ok = await onComplete(task, { ...(fileId ? { fileId } : {}), ...(normalised && numberOk ? { number: normalised } : {}) }, `${docName} saved`, localFile)
    setBusy(false)
    if (ok) setReplacing(false)
  }

  const numberField = (
    <div className="grid grid-cols-1 gap-1.5">
      <Label htmlFor={`num-${task.id}`}>
        {meta.numberLabel} <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Input id={`num-${task.id}`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder={meta.placeholder} autoComplete="off" className="font-mono" />
      {!numberOk && <p className="text-xs text-danger">Check the format — {meta.hint}.</p>}
    </div>
  )

  if (hasFile && !replacing) {
    const file = task.file
    return (
      <div className="grid grid-cols-1 gap-3">
        <StoredFileCard file={file ?? { filename: task.localFile!.filename, size: task.localFile!.size }}>
          <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
            Replace
          </Button>
        </StoredFileCard>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {numberField}
          <Button size="sm" variant="outline" disabled={busy || !numberOk || normalised === normaliseNumber(saved)} onClick={() => void finish(undefined)}>
            Save number
          </Button>
        </div>
        {task.completedAt && <DoneNote task={task} />}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {numberField}
      <FileUploader<EmployeeFile>
        compact
        multiple={false}
        accept={FILE_ACCEPT}
        disabled={busy || !numberOk}
        label={replacing ? `Upload a new ${docName}` : `Upload ${docName}`}
        hint="PDF, image or Word document up to 10 MB"
        upload={live ? (file, onProgress) => uploadFile(file, { category: meta.category, taskId: task.id }, onProgress) : undefined}
        onUploaded={(files) => void finish(files[0]?.id)}
        onComplete={live ? undefined : (files) => void finish(undefined, { filename: files[0]?.name ?? 'Document', size: files[0]?.size ?? '' })}
      />
      {replacing && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setReplacing(false)}>
            Keep the current file
          </Button>
        </div>
      )}
    </div>
  )
}

function PolicyPanel({ task, onComplete, titles }: { task: TaskView; onComplete: CompleteFn; titles: string[] }) {
  const [read, setRead] = useState<Set<string>>(new Set())
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const all = read.size === titles.length
  if (task.completedAt) {
    const accepted = Array.isArray(task.values?.policies) ? (task.values.policies as string[]) : titles
    return (
      <div className="grid grid-cols-1 gap-2">
        <DoneNote task={task} />
        <p className="text-xs text-muted-foreground">Accepted: {accepted.join(', ')}</p>
      </div>
    )
  }
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
              <span className={cn('size-1.5 shrink-0 rounded-full', isRead ? 'bg-success' : 'bg-muted-foreground/40')} aria-hidden />
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
        <Button
          size="sm"
          disabled={!agree || busy}
          onClick={async () => {
            setBusy(true)
            await onComplete(task, { policies: titles }, `${titles.length} policies acknowledged`)
            setBusy(false)
          }}
        >
          Accept policies
        </Button>
      </div>
    </div>
  )
}

function NdaPanel({ task, onComplete, userName, workspaceName }: { task: TaskView; onComplete: CompleteFn; userName: string; workspaceName: string }) {
  const [sig, setSig] = useState(str(task.values?.signature))
  const [busy, setBusy] = useState(false)
  const valid = sig.trim().length >= 3
  const signedAt = str(task.values?.signedAt) || task.completedAt || ''

  if (task.completedAt) {
    return (
      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-lg border border-dashed bg-card px-4 py-3">
          <div className="font-serif text-2xl italic text-foreground">{str(task.values?.signature) || userName}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Electronic signature · {signedAt ? formatDate(signedAt.slice(0, 10)) : formatDate(TODAY)}</div>
        </div>
        <DoneNote task={task} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="max-h-40 overflow-y-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground scrollbar-thin">
        <p className="font-semibold text-foreground">Non-Disclosure & IP Assignment Agreement</p>
        <p className="mt-2">
          This agreement is between <span className="text-foreground">{workspaceName}</span> (“the Company”) and <span className="text-foreground">{userName}</span> (“the Employee”).
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
        <Button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true)
            await onComplete(task, { signature: sig.trim() }, 'NDA signed')
            setBusy(false)
          }}
        >
          Sign
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

function SavedSummary({ task, rows, onEdit }: { task: TaskView; rows: [string, string][]; onEdit: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <dl className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 truncate text-sm">{v || '—'}</dd>
          </div>
        ))}
      </dl>
      <DoneNote task={task}>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </DoneNote>
    </div>
  )
}

function EmergencyForm({ task, onComplete }: { task: TaskView; onComplete: CompleteFn }) {
  const v = task.values
  const [editing, setEditing] = useState(!task.completedAt)
  const [name, setName] = useState(str(v?.name))
  const [rel, setRel] = useState<string | undefined>(str(v?.relationship) || undefined)
  const [phone, setPhone] = useState(str(v?.phone))
  const [busy, setBusy] = useState(false)
  const ok = name.trim().length >= 2 && rel && phone.replace(/\D/g, '').length >= 9

  if (task.completedAt && !editing) {
    return (
      <SavedSummary
        task={task}
        rows={[
          ['Name', str(v?.name)],
          ['Relationship', str(v?.relationship)],
          ['Phone', str(v?.phone)],
        ]}
        onEdit={() => setEditing(true)}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grace Wanjiru" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Relationship</Label>
          <SimpleSelect value={rel} onValueChange={setRel} options={['Spouse', 'Parent', 'Sibling', 'Partner', 'Child', 'Friend', 'Other']} placeholder="Select" />
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:col-span-2">
          <Label>Phone number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" inputMode="tel" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true)
            if (await onComplete(task, { name: name.trim(), relationship: rel, phone: phone.trim() }, 'Emergency contact saved')) setEditing(false)
            setBusy(false)
          }}
        >
          Save contact
        </Button>
        {task.completedAt && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

function BankForm({ task, onComplete }: { task: TaskView; onComplete: CompleteFn }) {
  const v = task.values
  const [editing, setEditing] = useState(!task.completedAt)
  const [bank, setBank] = useState<string | undefined>(str(v?.bankName) || undefined)
  const [branch, setBranch] = useState(str(v?.branch))
  const [acctName, setAcctName] = useState(str(v?.accountName))
  const [acct, setAcct] = useState(str(v?.accountNumber))
  const [busy, setBusy] = useState(false)
  const digits = acct.replace(/[\s-]/g, '')
  const ok = bank && branch.trim() && /^\d{6,20}$/.test(digits)
  const options = bank && !BANKS.includes(bank) ? [...BANKS, bank] : BANKS

  if (task.completedAt && !editing) {
    return (
      <SavedSummary
        task={task}
        rows={[
          ['Bank', str(v?.bankName)],
          ['Branch', str(v?.branch)],
          ['Account', str(v?.accountNumber)],
        ]}
        onEdit={() => setEditing(true)}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Bank</Label>
          <SimpleSelect value={bank} onValueChange={setBank} options={options} placeholder="Select bank" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Branch</Label>
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Westlands" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>
            Account name <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} placeholder="As it appears on your statement" />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Account number</Label>
          <Input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="0123456789" inputMode="numeric" autoComplete="off" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Visible only to you, HR and Finance.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true)
            const body = { bankName: bank, branch: branch.trim(), accountNumber: digits, ...(acctName.trim() ? { accountName: acctName.trim() } : {}) }
            if (await onComplete(task, body, `${bank} account saved — Finance will verify`)) setEditing(false)
            setBusy(false)
          }}
        >
          Save bank details
        </Button>
        {task.completedAt && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 22 }, (_, i) => i)
  const tones = ['bg-primary', 'bg-secondary', 'bg-warning', 'bg-success', 'bg-info']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
