import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, Gauge, Send, UserPlus, Workflow, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { daysUntil, formatDate } from '@/lib/utils'
import { scopeEmployees } from './util'

interface Row {
  emp: Employee
  missing: string[]
  overdue: boolean
}

const defaultRules = [
  { id: 'r1', trigger: 'When an employee is invited', action: 'Assign checklist “Kenya Standard” (9 tasks)', on: true },
  { id: 'r2', trigger: 'If a task is incomplete after 3 days', action: 'Remind employee by email & WhatsApp', on: true },
  { id: 'r3', trigger: 'If still incomplete after 7 days', action: 'Notify HR and the line manager', on: true },
  { id: 'r4', trigger: 'When bank details are added', action: 'Send to Finance for verification', on: true },
  { id: 'r5', trigger: 'When all tasks are complete', action: 'Create payroll profile and notify IT', on: false },
]

export function HROverview() {
  const { employees, onboardingTasks, user, role, department } = useWorkspace()
  const [q, setQ] = useState('')
  const [rules, setRules] = useState(defaultRules)
  const [reminded, setReminded] = useState<Set<string>>(new Set())

  const rows = useMemo<Row[]>(() => {
    return scopeEmployees(employees, user, role)
      .filter((e) => e.status === 'Onboarding' || e.status === 'Probation')
      .map((emp) => {
        const doneCount = Math.round((emp.onboardingProgress / 100) * onboardingTasks.length)
        const missing = onboardingTasks.slice(doneCount).map((t) => t.title.replace(/^Upload /, '').replace(/^Add /, ''))
        const daysIn = -daysUntil(emp.startDate)
        return { emp, missing, overdue: missing.length > 0 && daysIn > 7 }
      })
      .sort((a, b) => a.emp.onboardingProgress - b.emp.onboardingProgress)
  }, [employees, onboardingTasks, user, role])

  const filtered = rows.filter((r) => !q || r.emp.name.toLowerCase().includes(q.toLowerCase()))
  const inOnboarding = rows.filter((r) => r.emp.onboardingProgress < 100).length
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.emp.onboardingProgress, 0) / rows.length) : 0
  const overdueTasks = rows.filter((r) => r.overdue).reduce((s, r) => s + r.missing.length, 0)
  const completedMonth = rows.filter((r) => r.emp.onboardingProgress === 100).length

  const remind = (r: Row) => {
    setReminded((p) => new Set(p).add(r.emp.id))
    toast.success(`Reminder sent to ${r.emp.name} via email & WhatsApp`)
  }
  const bulk = () => {
    const targets = rows.filter((r) => r.missing.length > 0)
    setReminded(new Set(targets.map((r) => r.emp.id)))
    toast.success(`Reminders sent to ${targets.length} employees via email & WhatsApp`)
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Employee', cell: (r) => <PersonCell name={r.emp.name} sub={r.emp.title} />, sortValue: (r) => r.emp.name },
    { key: 'dept', header: 'Department', cell: (r) => <span className="text-sm">{department(r.emp.departmentId)?.name}</span>, sortValue: (r) => department(r.emp.departmentId)?.name ?? '', hideOnMobile: true },
    {
      key: 'start',
      header: 'Start date',
      cell: (r) => (
        <div className="text-sm">
          {formatDate(r.emp.startDate)}
          <div className="text-xs text-muted-foreground">
            <StatusBadge status={r.emp.status} className="mt-1" />
          </div>
        </div>
      ),
      sortValue: (r) => r.emp.startDate,
    },
    {
      key: 'progress',
      header: 'Progress',
      cell: (r) => (
        <div className="flex min-w-32 items-center gap-2">
          <Progress value={r.emp.onboardingProgress} className="h-1.5" tone={r.emp.onboardingProgress === 100 ? 'success' : 'primary'} />
          <span className="w-9 text-right text-xs font-semibold tabular">{r.emp.onboardingProgress}%</span>
        </div>
      ),
      sortValue: (r) => r.emp.onboardingProgress,
    },
    {
      key: 'missing',
      header: 'Missing items',
      cell: (r) =>
        r.missing.length === 0 ? (
          <Badge variant="success" dot>
            Complete
          </Badge>
        ) : (
          <div className="flex max-w-64 flex-wrap gap-1">
            {r.missing.slice(0, 2).map((m) => (
              <Badge key={m} variant={r.overdue ? 'danger' : 'muted'}>
                {m}
              </Badge>
            ))}
            {r.missing.length > 2 && <Badge variant="outline">+{r.missing.length - 2}</Badge>}
          </div>
        ),
      sortValue: (r) => r.missing.length,
    },
    {
      key: 'action',
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (r) =>
        r.missing.length > 0 ? (
          <Button
            size="sm"
            variant={reminded.has(r.emp.id) ? 'secondary' : 'outline'}
            onClick={(e) => {
              e.stopPropagation()
              remind(r)
            }}
          >
            <Send /> {reminded.has(r.emp.id) ? 'Sent' : 'Send reminder'}
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="In onboarding" value={inOnboarding} icon={UserPlus} index={0} hint="New joiners & probation" />
        <StatCard label="Avg completion" value={avg} format={(n) => `${Math.round(n)}%`} icon={Gauge} index={1} tone="primary" />
        <StatCard label="Overdue tasks" value={overdueTasks} icon={AlertTriangle} index={2} tone="warning" hint="Older than 7 days" />
        <StatCard label="Completed this month" value={completedMonth} icon={BadgeCheck} index={3} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Section
          title="New joiners"
          description={`${rows.length} people in onboarding or probation`}
          action={
            <Button size="sm" onClick={bulk}>
              <Send /> <span className="hidden sm:inline">Bulk remind</span>
            </Button>
          }
          className="min-w-0"
        >
          <SearchInput value={q} onChange={setQ} placeholder="Search new joiners…" className="mb-3 sm:max-w-xs" />
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.emp.id} pageSize={8} />
        </Section>

        <Section title="Automation rules" description="Runs automatically for every new joiner" action={<Workflow className="size-4 text-muted-foreground" />}>
          <div className="grid grid-cols-1 gap-2">
            {rules.map((rule, i) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Zap className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rule.trigger}</div>
                  <div className="mt-0.5 text-sm">{rule.action}</div>
                </div>
                <Switch
                  checked={rule.on}
                  onCheckedChange={(v) => {
                    setRules((p) => p.map((r) => (r.id === rule.id ? { ...r, on: v } : r)))
                    toast.success(`Rule ${v ? 'enabled' : 'paused'}`)
                  }}
                  aria-label={`Toggle rule: ${rule.trigger}`}
                />
              </motion.div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
