import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Section } from '@/components/shared/Section'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PersonCell } from '@/components/shared/PersonCell'
import { PersonAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { ChartTooltip, Legend, SERIES, axisProps, gridProps } from '@/components/charts/ChartKit'
import { useWorkspace } from '@/context/auth'
import type { Department, Employee } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { cn, formatKES } from '@/lib/utils'
import { OrgChart } from './departments/OrgChart'

/** Department accent palette (data colours, matching seeded departments). */
const DEPT_COLORS = ['#C1121F', '#E63946', '#7F1D1D', '#374151', '#F4A3A8', '#9CA3AF', '#B91C1C', '#6B7280']

interface DeptStats {
  dept: Department
  head?: Employee
  members: Employee[]
  avgPerf: number
  female: number
  male: number
}

function AvatarStack({ people, max = 5 }: { people: Employee[]; max?: number }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <PersonAvatar key={p.id} name={p.name} src={p.photo} className="size-7 text-[10px] ring-2 ring-card" />
      ))}
      {extra > 0 && (
        <span className="relative flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">+{extra}</span>
      )}
    </div>
  )
}

function GenderBar({ female, male }: { female: number; male: number }) {
  const total = Math.max(1, female + male)
  const f = Math.round((female / total) * 100)
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.span className="h-full" style={{ background: SERIES[0] }} initial={{ width: 0 }} animate={{ width: `${f}%` }} transition={{ duration: 0.8 }} />
        <motion.span
          className="h-full border-l-2 border-card"
          style={{ background: SERIES[1] }}
          initial={{ width: 0 }}
          animate={{ width: `${100 - f}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular">
        <span>{f}% female</span>
        <span>{100 - f}% male</span>
      </div>
    </div>
  )
}

export default function Departments() {
  const ws = useWorkspace()
  const navigate = useNavigate()
  const admin = isAdminLike(ws.role)
  const [depts, setDepts] = useState<Department[]>(ws.departments)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', headId: '', budget: '', color: DEPT_COLORS[0]! })

  const ceo = ws.employees.find((e) => e.role === 'ceo')
  const active = useMemo(() => ws.employees.filter((e) => e.status !== 'Exited'), [ws.employees])

  const stats = useMemo<DeptStats[]>(
    () =>
      depts.map((dept) => {
        const members = active.filter((e) => e.departmentId === dept.id)
        const head = ws.employee(dept.headId)
        const ordered = head ? [head, ...members.filter((m) => m.id !== head.id)] : members
        const avgPerf = members.length ? members.reduce((s, m) => s + m.performance, 0) / members.length : 0
        return {
          dept,
          head,
          members: ordered,
          avgPerf,
          female: members.filter((m) => m.gender === 'Female').length,
          male: members.filter((m) => m.gender === 'Male').length,
        }
      }),
    [depts, active, ws],
  )

  const totals = {
    headcount: active.length,
    budget: depts.reduce((s, d) => s + d.budgetKES, 0),
    avgPerf: active.reduce((s, e) => s + e.performance, 0) / Math.max(1, active.length),
  }

  const chartData = [...stats].sort((a, b) => b.members.length - a.members.length).map((s) => ({ name: s.dept.name, headcount: s.members.length }))
  const selected = stats.find((s) => s.dept.id === openId)

  const addDept = () => {
    const name = form.name.trim()
    if (!name) {
      toast.error('Give the department a name')
      return
    }
    if (depts.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`${name} already exists`)
      return
    }
    const budget = Number(form.budget.replace(/[^\d.]/g, '')) || 0
    const dept: Department = { id: `${ws.workspace.slug}-dnew${depts.length + 1}`, name, headId: form.headId, color: form.color, budgetKES: budget }
    setDepts((d) => [...d, dept])
    setAddOpen(false)
    setForm({ name: '', headId: '', budget: '', color: DEPT_COLORS[(depts.length + 1) % DEPT_COLORS.length]! })
    toast.success(`${name} department created`, { description: form.headId ? `${ws.employee(form.headId)?.name} is now head of ${name}.` : 'Assign a head when you are ready.' })
  }

  const headOptions = ws.employees
    .filter((e) => e.status !== 'Exited')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ value: e.id, label: `${e.name} — ${e.title}` }))

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        className="mb-0"
        eyebrow="Organisation"
        title="Departments"
        description={`${depts.length} departments · ${totals.headcount} people across ${ws.workspace.offices.length} office${ws.workspace.offices.length === 1 ? '' : 's'}`}
        actions={
          admin && (
            <Button onClick={() => setAddOpen(true)}>
              Add department
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Departments" value={depts.length} />
        <StatCard index={1} label="Headcount" value={totals.headcount} hint={`${(totals.headcount / Math.max(1, depts.length)).toFixed(1)} avg per team`} />
        <StatCard index={2} label="Annual budget" value={totals.budget} format={(n) => formatKES(n, { compact: true })} />
        <StatCard index={3} label="Avg performance" value={totals.avgPerf.toFixed(2)} hint="out of 5.0" />
      </div>

      {/* Cards */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">All departments</h2>
          <Legend
            items={[
              { label: 'Female', color: SERIES[0] },
              { label: 'Male', color: SERIES[1] },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {stats.map((s, i) => (
            <motion.button
              key={s.dept.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3 }}
              onClick={() => setOpenId(s.dept.id)}
              className="group relative overflow-hidden rounded-xl border bg-card p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-lg hover:shadow-black/[0.05]"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: s.dept.color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.dept.color }} />
                    <h3 className="truncate font-semibold">{s.dept.name}</h3>
                  </div>
                  {s.head ? (
                    <PersonCell name={s.head.name} sub="Department head" size="sm" className="mt-3" />
                  ) : (
                    <div className="mt-3 text-xs text-muted-foreground">No head assigned</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular">{s.members.length}</div>
                  <div className="text-[11px] text-muted-foreground">people</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Budget</div>
                  <div className="text-sm font-semibold tabular">{formatKES(s.dept.budgetKES, { compact: true })}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg performance</div>
                  <div className="text-sm font-semibold tabular">{s.members.length ? s.avgPerf.toFixed(1) : '—'} / 5</div>
                </div>
              </div>
              <div className="mt-3">
                <GenderBar female={s.female} male={s.male} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                {s.members.length ? <AvatarStack people={s.members} /> : <span className="text-xs text-muted-foreground">No members yet</span>}
                <span className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">View team →</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Section title="Org chart" description="Tap a leader to open their department. Expand a node to see the team." className="min-w-0 lg:col-span-3">
          <OrgChart ceo={ceo} branches={stats.map((s) => ({ dept: s.dept, head: s.head, members: s.members }))} onSelect={setOpenId} />
        </Section>
        <Section title="Headcount by department" description="Active and onboarding employees" className="min-w-0 lg:col-span-2">
          <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="name" width={112} {...axisProps} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <RTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip valueFormatter={(v) => `${v} people`} />} />
              <Bar dataKey="headcount" name="Headcount" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Department drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="sm:max-w-xl">
          {selected && (
            <div className="flex flex-col">
              <div className="relative border-b px-5 pb-5 pt-8 sm:px-6">
                <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: selected.dept.color }} />
                <SheetTitle>{selected.dept.name}</SheetTitle>
                <SheetDescription>{selected.head ? `Led by ${selected.head.name}` : 'No head assigned'}</SheetDescription>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Headcount', value: String(selected.members.length) },
                    { label: 'Budget', value: formatKES(selected.dept.budgetKES, { compact: true }) },
                    { label: 'Per head', value: selected.members.length ? formatKES(selected.dept.budgetKES / selected.members.length, { compact: true }) : '—' },
                    { label: 'Avg perf.', value: selected.members.length ? selected.avgPerf.toFixed(1) : '—' },
                  ].map((k) => (
                    <div key={k.label} className="rounded-lg border bg-subtle p-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                      <div className="mt-0.5 text-sm font-semibold tabular">{k.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <GenderBar female={selected.female} male={selected.male} />
                </div>
              </div>
              <div className="px-5 py-4 sm:px-6">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Members</h4>
                {selected.members.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No one in this department yet.</p>
                ) : (
                  <ul className="divide-y">
                    {selected.members.map((m, i) => (
                      <motion.li key={m.id} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/app/people?id=${m.id}`)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-muted/50"
                        >
                          <PersonCell name={m.name} sub={m.title} />
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="hidden w-16 sm:block">
                              <Progress value={(m.performance / 5) * 100} className="h-1" />
                            </div>
                            <StatusBadge status={m.status} />
                          </div>
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add department */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add department</DialogTitle>
            <DialogDescription>Departments drive approvals, budgets and reporting lines.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="dept-name">Name</Label>
              <Input id="dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Legal & Compliance" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Department head</Label>
                <SimpleSelect value={form.headId || undefined} onValueChange={(v) => setForm({ ...form, headId: v })} options={headOptions} placeholder="Select a leader" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label htmlFor="dept-budget">Annual budget (KES)</Label>
                <Input id="dept-budget" inputMode="numeric" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="12,000,000" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Accent colour</Label>
              <div className="flex flex-wrap gap-2">
                {DEPT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setForm({ ...form, color: c })}
                    className={cn('size-7 rounded-full ring-offset-2 ring-offset-card transition', form.color === c && 'ring-2 ring-foreground')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addDept}>
              Create department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
