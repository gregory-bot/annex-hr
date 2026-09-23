import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlarmClock,
  Award,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Clock,
  Coins,
  Gauge,
  Landmark,
  LogOut,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import type { WorkspaceData } from '@/data/seed'
import type { Department, Employee } from '@/data/types'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Progress } from '@/components/ui/progress'
import { daysUntil, formatDate, formatKES, formatNumber } from '@/lib/utils'
import { Donut, Funnel, HorizontalBars, SimpleBars, StackedBars, TrendArea, perfHistogram } from '../dashboard/charts'
import { GroupedBars, MultiLine } from './charts'

export type ReportTab = 'headcount' | 'turnover' | 'retention' | 'leave' | 'payroll' | 'performance' | 'recruitment' | 'attendance' | 'departments'

export const reportTabs: { value: ReportTab; label: string }[] = [
  { value: 'headcount', label: 'Headcount' },
  { value: 'turnover', label: 'Turnover' },
  { value: 'retention', label: 'Retention' },
  { value: 'leave', label: 'Leave' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'performance', label: 'Performance' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'departments', label: 'Department analytics' },
]

export type Period = '6m' | '12m' | 'ytd'

export interface Kpi {
  label: string
  value: number | string
  format?: (n: number) => string
  icon: LucideIcon
  delta?: number
  deltaLabel?: string
  hint?: string
  tone?: 'default' | 'primary' | 'warning' | 'success'
}

export interface Report {
  kpis: Kpi[]
  charts: { title: string; description?: string; node: React.ReactNode; wide?: boolean }[]
  tableTitle: string
  table: React.ReactNode
  rows: Record<string, string | number>[]
}

interface Ctx {
  data: WorkspaceData
  employees: Employee[] // filtered, non-exited
  allFiltered: Employee[] // filtered, including exited
  scale: number // filtered share of org, used to scale org-level trends
  period: Period
  deptName: (id: string) => string
}

const pct = (n: number) => `${n.toFixed(1)}%`
const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const tenureYears = (e: Employee) => Math.max(0, -daysUntil(e.startDate) / 365)

function sliceByPeriod<T>(rows: T[], period: Period) {
  // trend months run Oct → Sep; YTD = Jan → Sep (last 9)
  const n = period === '6m' ? 6 : period === 'ytd' ? 9 : 12
  return rows.slice(-n)
}

function deptRows(ctx: Ctx) {
  const { data, employees, allFiltered } = ctx
  return data.departments
    .map((d: Department) => {
      const people = employees.filter((e) => e.departmentId === d.id)
      const all = allFiltered.filter((e) => e.departmentId === d.id)
      const leavers = all.filter((e) => e.status === 'Exited' || e.status === 'Notice Period').length
      const turnover = all.length ? (leavers / all.length) * 100 : 0
      return {
        id: d.id,
        name: d.name,
        headcount: people.length,
        avgSalary: Math.round(avg(people.map((e) => e.salaryKES))),
        payroll: people.reduce((s, e) => s + e.salaryKES, 0),
        budget: d.budgetKES,
        avgPerf: round1(avg(people.map((e) => e.performance))),
        female: people.length ? Math.round((people.filter((e) => e.gender === 'Female').length / people.length) * 100) : 0,
        tenure: round1(avg(people.map(tenureYears))),
        turnover: round1(turnover),
        retention: round1(100 - turnover),
      }
    })
    .filter((r) => r.headcount > 0)
}
type DeptRow = ReturnType<typeof deptRows>[number]

export function buildReport(tab: ReportTab, ctx: Ctx): Report {
  const { data, employees, scale, period } = ctx
  const hc = sliceByPeriod(data.trends.headcount, period).map((h) => ({
    month: h.month,
    headcount: Math.max(0, Math.round(h.headcount * scale)),
    hires: Math.round(h.hires * scale),
    exits: Math.round(h.exits * scale),
  }))
  const hcNow = employees.length
  const hcStart = hc[0]?.headcount ?? hcNow
  const exits = hc.reduce((s, h) => s + h.exits, 0)
  const hires = hc.reduce((s, h) => s + h.hires, 0)
  const avgHc = avg(hc.map((h) => h.headcount)) || 1
  const turnover = (exits / avgHc) * 100
  const annualised = turnover * (12 / Math.max(1, hc.length))
  const monthlyTurnover = hc.map((h) => ({ month: h.month, turnover: round1(h.headcount ? (h.exits / h.headcount) * 100 : 0), retention: round1(100 - (h.headcount ? (h.exits / h.headcount) * 100 : 0)) }))
  const depts = deptRows(ctx)

  const deptColumns: Column<DeptRow>[] = [
    { key: 'name', header: 'Department', cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
    { key: 'hc', header: 'Headcount', cell: (r) => <span className="tabular">{r.headcount}</span>, sortValue: (r) => r.headcount },
    { key: 'sal', header: 'Avg salary', cell: (r) => <span className="tabular">{formatKES(r.avgSalary)}</span>, sortValue: (r) => r.avgSalary },
    { key: 'perf', header: 'Avg performance', cell: (r) => <span className="tabular">{r.avgPerf.toFixed(1)} / 5</span>, sortValue: (r) => r.avgPerf },
    { key: 'to', header: 'Turnover', cell: (r) => <span className="tabular">{pct(r.turnover)}</span>, sortValue: (r) => r.turnover },
  ]

  switch (tab) {
    case 'headcount': {
      const contractors = employees.filter((e) => e.employmentType !== 'Full-time').length
      const growth = hcStart ? ((hcNow - hcStart) / hcStart) * 100 : 0
      return {
        kpis: [
          { label: 'Headcount', value: hcNow, icon: Users, delta: round1(growth), deltaLabel: 'over period', tone: 'primary' },
          { label: 'New hires', value: hires, icon: UserPlus, hint: `${hc.length} months` },
          { label: 'Net change', value: `${hires - exits >= 0 ? '+' : ''}${hires - exits}`, icon: TrendingUp, hint: `${exits} leavers` },
          { label: 'Non full-time', value: pct(hcNow ? (contractors / hcNow) * 100 : 0), icon: Briefcase, hint: `${contractors} contract, consultant & interns` },
        ],
        charts: [
          { title: 'Headcount over time', description: 'Active employees at month end', node: <TrendArea data={hc} xKey="month" yKey="headcount" name="Headcount" />, wide: true },
          {
            title: 'Hires vs exits',
            node: (
              <GroupedBars
                data={hc}
                xKey="month"
                series={[
                  { key: 'hires', label: 'Hires' },
                  { key: 'exits', label: 'Exits' },
                ]}
              />
            ),
          },
        ],
        tableTitle: 'Headcount by department',
        table: (
          <DataTable
            rows={depts}
            rowKey={(r) => r.id}
            columns={[
              deptColumns[0]!,
              deptColumns[1]!,
              { key: 'share', header: 'Share', cell: (r) => <ShareBar value={hcNow ? (r.headcount / hcNow) * 100 : 0} />, sortValue: (r) => r.headcount },
              { key: 'fem', header: 'Women', cell: (r) => <span className="tabular">{r.female}%</span>, sortValue: (r) => r.female },
              { key: 'ten', header: 'Avg tenure', cell: (r) => <span className="tabular">{r.tenure} yrs</span>, sortValue: (r) => r.tenure },
            ]}
          />
        ),
        rows: depts.map((r) => ({ Department: r.name, Headcount: r.headcount, 'Women %': r.female, 'Avg tenure (yrs)': r.tenure })),
      }
    }

    case 'turnover': {
      const offs = data.offboardings.filter((o) => employees.some((e) => e.id === o.employeeId) || ctx.allFiltered.some((e) => e.id === o.employeeId))
      const voluntary = offs.filter((o) => o.reason === 'Resignation' || o.reason === 'Retirement').length
      const reasons = ['Resignation', 'Contract End', 'Termination', 'Retirement'].map((r) => ({ label: r, value: offs.filter((o) => o.reason === r).length })).filter((r) => r.value > 0)
      return {
        kpis: [
          { label: 'Turnover rate', value: pct(turnover), icon: TrendingDown, hint: `${hc.length}-month period`, tone: 'primary' },
          { label: 'Annualised', value: pct(annualised), icon: Activity, hint: 'Benchmark: 12–15%' },
          { label: 'Leavers', value: exits, icon: LogOut, hint: `avg headcount ${Math.round(avgHc)}` },
          { label: 'Voluntary exits', value: pct(offs.length ? (voluntary / offs.length) * 100 : 0), icon: UserCheck, hint: `${offs.length} in-flight offboardings` },
        ],
        charts: [
          { title: 'Monthly turnover', description: 'Exits ÷ month-end headcount', node: <MultiLine data={monthlyTurnover} xKey="month" series={[{ key: 'turnover', label: 'Turnover' }]} valueFormatter={pct} yTickFormatter={(v) => `${v}%`} />, wide: true },
          {
            title: 'Exit reasons',
            description: 'Current offboardings',
            node: reasons.length ? <HorizontalBars data={reasons} name="Exits" /> : <p className="py-10 text-center text-sm text-muted-foreground">No exits in this selection.</p>,
          },
        ],
        tableTitle: 'Leavers',
        table: (
          <DataTable
            rows={offs}
            rowKey={(o) => o.id}
            columns={[
              { key: 'e', header: 'Employee', cell: (o) => { const e = data.employees.find((x) => x.id === o.employeeId); return <PersonCell name={e?.name ?? '—'} sub={e?.title} /> }, sortValue: (o) => data.employees.find((x) => x.id === o.employeeId)?.name ?? '' },
              { key: 'r', header: 'Reason', cell: (o) => o.reason, sortValue: (o) => o.reason },
              { key: 'd', header: 'Last day', cell: (o) => formatDate(o.lastDay), sortValue: (o) => o.lastDay },
              { key: 'n', header: 'Notice', cell: (o) => `${o.noticeDays} days`, sortValue: (o) => o.noticeDays },
              { key: 'p', header: 'Clearance', cell: (o) => <ShareBar value={o.progress} />, sortValue: (o) => o.progress },
            ]}
          />
        ),
        rows: offs.map((o) => ({ Employee: data.employees.find((x) => x.id === o.employeeId)?.name ?? '', Reason: o.reason, 'Last day': o.lastDay, 'Notice days': o.noticeDays, 'Clearance %': o.progress })),
      }
    }

    case 'retention': {
      const oneYear = employees.filter((e) => tenureYears(e) >= 1).length
      const buckets = [
        { label: '< 1 yr', min: 0, max: 1 },
        { label: '1–2 yrs', min: 1, max: 2 },
        { label: '2–3 yrs', min: 2, max: 3 },
        { label: '3–5 yrs', min: 3, max: 5 },
        { label: '5+ yrs', min: 5, max: 99 },
      ].map((b) => ({ bucket: b.label, employees: employees.filter((e) => tenureYears(e) >= b.min && tenureYears(e) < b.max).length }))
      return {
        kpis: [
          { label: 'Retention rate', value: pct(100 - turnover), icon: ShieldCheck, hint: '100 − turnover', tone: 'primary' },
          { label: 'Annualised retention', value: pct(Math.max(0, 100 - annualised)), icon: Activity },
          { label: 'Past first year', value: pct(hcNow ? (oneYear / hcNow) * 100 : 0), icon: BadgeCheck, hint: `${oneYear} of ${hcNow}` },
          { label: 'Avg tenure', value: `${round1(avg(employees.map(tenureYears)))} yrs`, icon: Clock },
        ],
        charts: [
          { title: 'Monthly retention', node: <MultiLine data={monthlyTurnover} xKey="month" series={[{ key: 'retention', label: 'Retention' }]} valueFormatter={pct} yTickFormatter={(v) => `${v}%`} />, wide: true },
          { title: 'Tenure distribution', node: <SimpleBars data={buckets} xKey="bucket" yKey="employees" name="Employees" /> },
        ],
        tableTitle: 'Retention by department',
        table: (
          <DataTable
            rows={depts}
            rowKey={(r) => r.id}
            columns={[
              deptColumns[0]!,
              deptColumns[1]!,
              { key: 'ret', header: 'Retention', cell: (r) => <ShareBar value={r.retention} />, sortValue: (r) => r.retention },
              { key: 'ten', header: 'Avg tenure', cell: (r) => <span className="tabular">{r.tenure} yrs</span>, sortValue: (r) => r.tenure },
            ]}
          />
        ),
        rows: depts.map((r) => ({ Department: r.name, Headcount: r.headcount, 'Retention %': r.retention, 'Avg tenure (yrs)': r.tenure })),
      }
    }

    case 'leave': {
      const trend = sliceByPeriod(data.trends.leave, period).map((l) => ({ month: l.month, annual: Math.round(l.annual * scale), sick: Math.round(l.sick * scale), other: Math.round(l.other * scale) }))
      const reqs = data.leaveRequests.filter((l) => employees.some((e) => e.id === l.employeeId))
      const total = trend.reduce((s, l) => s + l.annual + l.sick + l.other, 0)
      const sick = trend.reduce((s, l) => s + l.sick, 0)
      const decided = reqs.filter((r) => r.status === 'Approved' || r.status === 'Rejected')
      const approved = decided.filter((r) => r.status === 'Approved').length
      const byType = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study'].map((t) => ({ label: t, value: reqs.filter((r) => r.type === t).reduce((s, r) => s + r.days, 0) })).filter((r) => r.value > 0)
      return {
        kpis: [
          { label: 'Days taken', value: total, icon: CalendarDays, hint: `${hc.length} months`, tone: 'primary' },
          { label: 'Sick-day share', value: pct(total ? (sick / total) * 100 : 0), icon: Activity },
          { label: 'Pending requests', value: reqs.filter((r) => r.status === 'Pending').length, icon: AlarmClock, tone: 'warning' },
          { label: 'Approval rate', value: pct(decided.length ? (approved / decided.length) * 100 : 0), icon: BadgeCheck },
        ],
        charts: [
          {
            title: 'Leave days by month',
            node: (
              <StackedBars
                data={trend}
                xKey="month"
                series={[
                  { key: 'annual', label: 'Annual' },
                  { key: 'sick', label: 'Sick' },
                  { key: 'other', label: 'Other' },
                ]}
                valueFormatter={(v) => `${v} days`}
              />
            ),
            wide: true,
          },
          { title: 'Days requested by type', node: byType.length ? <HorizontalBars data={byType} name="Days" /> : <p className="py-10 text-center text-sm text-muted-foreground">No requests.</p> },
        ],
        tableTitle: 'Leave requests',
        table: (
          <DataTable
            rows={reqs}
            rowKey={(r) => r.id}
            columns={[
              { key: 'e', header: 'Employee', cell: (r) => <PersonCell name={data.employees.find((e) => e.id === r.employeeId)?.name ?? '—'} sub={ctx.deptName(data.employees.find((e) => e.id === r.employeeId)?.departmentId ?? '')} />, sortValue: (r) => data.employees.find((e) => e.id === r.employeeId)?.name ?? '' },
              { key: 't', header: 'Type', cell: (r) => r.type, sortValue: (r) => r.type },
              { key: 'd', header: 'Dates', cell: (r) => `${formatDate(r.start, 'short')} – ${formatDate(r.end, 'short')}`, sortValue: (r) => r.start },
              { key: 'n', header: 'Days', cell: (r) => <span className="tabular">{r.days}</span>, sortValue: (r) => r.days },
              { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
            ]}
          />
        ),
        rows: reqs.map((r) => ({ Employee: data.employees.find((e) => e.id === r.employeeId)?.name ?? '', Type: r.type, Start: r.start, End: r.end, Days: r.days, Status: r.status })),
      }
    }

    case 'payroll': {
      const trend = sliceByPeriod(data.trends.payroll, period).map((p) => ({ month: p.month, gross: Math.round(p.gross * scale), net: Math.round(p.net * scale) }))
      const run = data.payrollRuns[0]!
      const statutory = run.paye + run.shif + run.nssf + run.housingLevy
      const prevGross = trend[trend.length - 2]?.gross ?? 0
      const lastGross = trend[trend.length - 1]?.gross ?? 0
      const k = (n: number) => formatKES(n, { compact: true })
      return {
        kpis: [
          { label: 'Gross payroll', value: k(lastGross), icon: Wallet, delta: prevGross ? round1(((lastGross - prevGross) / prevGross) * 100) : undefined, deltaLabel: 'vs last month', tone: 'primary' },
          { label: 'Net pay', value: k(Math.round(run.net * scale)), icon: Coins, hint: run.period },
          { label: 'Statutory deductions', value: k(Math.round(statutory * scale)), icon: Landmark, hint: 'PAYE · SHIF · NSSF · Housing' },
          { label: 'Avg cost per head', value: k(hcNow ? Math.round((lastGross || 0) / hcNow) : 0), icon: Receipt },
        ],
        charts: [
          {
            title: 'Gross vs net pay',
            node: (
              <MultiLine
                data={trend}
                xKey="month"
                series={[
                  { key: 'gross', label: 'Gross' },
                  { key: 'net', label: 'Net' },
                ]}
                valueFormatter={(v) => formatKES(v)}
                yTickFormatter={(v) => formatKES(v, { compact: true }).replace('KES ', '')}
              />
            ),
            wide: true,
          },
          {
            title: 'Deductions mix',
            description: run.period,
            node: (
              <Donut
                data={[
                  { label: 'PAYE', value: Math.round(run.paye * scale) },
                  { label: 'SHIF 2.75%', value: Math.round(run.shif * scale) },
                  { label: 'NSSF', value: Math.round(run.nssf * scale) },
                  { label: 'Housing 1.5%', value: Math.round(run.housingLevy * scale) },
                ]}
                centerValue={k(Math.round(statutory * scale))}
                centerLabel="statutory"
                valueFormatter={(v) => formatKES(v)}
              />
            ),
          },
        ],
        tableTitle: 'Payroll runs',
        table: (
          <DataTable
            rows={data.payrollRuns}
            rowKey={(r) => r.id}
            columns={[
              { key: 'p', header: 'Period', cell: (r) => <span className="font-medium">{r.period}</span> },
              { key: 'e', header: 'Employees', cell: (r) => <span className="tabular">{r.employees}</span> },
              { key: 'g', header: 'Gross', cell: (r) => <span className="tabular">{formatKES(r.gross)}</span>, sortValue: (r) => r.gross },
              { key: 'paye', header: 'PAYE', cell: (r) => <span className="tabular">{formatKES(r.paye)}</span>, hideOnMobile: true },
              { key: 'n', header: 'Net', cell: (r) => <span className="tabular">{formatKES(r.net)}</span>, sortValue: (r) => r.net },
              { key: 's', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        ),
        rows: data.payrollRuns.map((r) => ({ Period: r.period, Employees: r.employees, Gross: r.gross, PAYE: r.paye, SHIF: r.shif, NSSF: r.nssf, 'Housing Levy': r.housingLevy, Net: r.net, Status: r.status })),
      }
    }

    case 'performance': {
      const scores = employees.map((e) => e.performance)
      const byDept = depts.map((d) => ({ label: d.name, value: d.avgPerf })).sort((a, b) => b.value - a.value)
      return {
        kpis: [
          { label: 'Average rating', value: `${avg(scores).toFixed(2)} / 5`, icon: Gauge, tone: 'primary' },
          { label: 'Top performers', value: scores.filter((s) => s >= 4.5).length, icon: Award, hint: 'rated 4.5+' },
          { label: 'Needs support', value: scores.filter((s) => s < 2.5).length, icon: AlarmClock, hint: 'rated below 2.5', tone: 'warning' },
          { label: 'High potential', value: employees.filter((e) => e.potential === 3).length, icon: Sparkles, hint: '9-box top row' },
        ],
        charts: [
          { title: 'Rating distribution', node: <SimpleBars data={perfHistogram(scores)} xKey="bucket" yKey="employees" name="Employees" />, wide: true },
          { title: 'Average rating by department', node: <HorizontalBars data={byDept} name="Avg rating" valueFormatter={(v) => v.toFixed(1)} /> },
        ],
        tableTitle: 'Performance by department',
        table: (
          <DataTable
            rows={depts}
            rowKey={(r) => r.id}
            columns={[
              deptColumns[0]!,
              deptColumns[1]!,
              deptColumns[3]!,
              { key: 'top', header: 'Top performers', cell: (r) => <span className="tabular">{employees.filter((e) => e.departmentId === r.id && e.performance >= 4.5).length}</span> },
            ]}
          />
        ),
        rows: depts.map((r) => ({ Department: r.name, Headcount: r.headcount, 'Avg performance': r.avgPerf })),
      }
    }

    case 'recruitment': {
      const funnel = data.trends.hiringFunnel.map((f) => ({ ...f, count: Math.max(1, Math.round(f.count * scale)) }))
      const applied = funnel[0]!.count
      const offer = funnel.find((f) => f.stage === 'Offer')?.count ?? 1
      const hired = funnel[funnel.length - 1]!.count
      const funnelRows = funnel.map((f, i) => ({ ...f, conv: i === 0 ? 100 : round1((f.count / Math.max(1, funnel[i - 1]!.count)) * 100), overall: round1((f.count / applied) * 100) }))
      return {
        kpis: [
          { label: 'Applicants', value: applied, icon: Users, tone: 'primary' },
          { label: 'Hired', value: hired, icon: UserPlus, hint: `${pct((hired / applied) * 100)} of applicants` },
          { label: 'Offer acceptance', value: pct((hired / offer) * 100), icon: BadgeCheck },
          { label: 'Time to hire', value: '27 days', icon: Clock, hint: 'median, application → offer' },
        ],
        charts: [
          { title: 'Hiring funnel', description: 'Conversion between stages', node: <Funnel data={funnel} /> },
          { title: 'Hires per month', node: <SimpleBars data={hc} xKey="month" yKey="hires" name="Hires" />, wide: true },
        ],
        tableTitle: 'Funnel breakdown',
        table: (
          <DataTable
            rows={funnelRows}
            rowKey={(r) => r.stage}
            columns={[
              { key: 's', header: 'Stage', cell: (r) => <span className="font-medium">{r.stage}</span> },
              { key: 'c', header: 'Candidates', cell: (r) => <span className="tabular">{formatNumber(r.count)}</span> },
              { key: 'v', header: 'Stage conversion', cell: (r) => <span className="tabular">{pct(r.conv)}</span> },
              { key: 'o', header: 'Of applicants', cell: (r) => <ShareBar value={r.overall} /> },
            ]}
          />
        ),
        rows: funnelRows.map((r) => ({ Stage: r.stage, Candidates: r.count, 'Stage conversion %': r.conv, 'Of applicants %': r.overall })),
      }
    }

    case 'attendance': {
      const att = data.trends.attendance.map((a) => {
        const total = Math.max(1, hcNow)
        const late = Math.round(a.late * scale)
        const absent = Math.round(a.absent * scale)
        return { day: a.day, onTime: Math.max(0, total - late - absent), late, absent, rate: round1(((total - late - absent) / total) * 100) }
      })
      const totalSlots = att.reduce((s, a) => s + a.onTime + a.late + a.absent, 0) || 1
      const onTime = att.reduce((s, a) => s + a.onTime, 0)
      const lates = att.reduce((s, a) => s + a.late, 0)
      const absents = att.reduce((s, a) => s + a.absent, 0)
      return {
        kpis: [
          { label: 'On-time rate', value: pct((onTime / totalSlots) * 100), icon: UserCheck, tone: 'primary' },
          { label: 'Late arrivals', value: lates, icon: AlarmClock, hint: 'this week' },
          { label: 'Absence rate', value: pct((absents / totalSlots) * 100), icon: TrendingDown, hint: `${absents} person-days` },
          { label: 'Avg hours / day', value: '8.2h', icon: Clock, hint: 'clocked, excluding breaks' },
        ],
        charts: [
          {
            title: 'Daily attendance',
            description: 'This week',
            node: (
              <StackedBars
                data={att}
                xKey="day"
                series={[
                  { key: 'onTime', label: 'On time' },
                  { key: 'late', label: 'Late' },
                  { key: 'absent', label: 'Absent' },
                ]}
                valueFormatter={(v) => `${v} people`}
              />
            ),
            wide: true,
          },
          { title: 'On-time rate by day', node: <HorizontalBars data={att.map((a) => ({ label: a.day, value: a.rate }))} name="On time" valueFormatter={(v) => `${v}%`} /> },
        ],
        tableTitle: 'Attendance by day',
        table: (
          <DataTable
            rows={att}
            rowKey={(r) => r.day}
            columns={[
              { key: 'd', header: 'Day', cell: (r) => <span className="font-medium">{r.day}</span> },
              { key: 'o', header: 'On time', cell: (r) => <span className="tabular">{r.onTime}</span> },
              { key: 'l', header: 'Late', cell: (r) => <span className="tabular">{r.late}</span> },
              { key: 'a', header: 'Absent', cell: (r) => <span className="tabular">{r.absent}</span> },
              { key: 'r', header: 'On-time rate', cell: (r) => <ShareBar value={r.rate} /> },
            ]}
          />
        ),
        rows: att.map((r) => ({ Day: r.day, 'On time': r.onTime, Late: r.late, Absent: r.absent, 'On-time %': r.rate })),
      }
    }

    case 'departments': {
      const largest = [...depts].sort((a, b) => b.headcount - a.headcount)[0]
      const priciest = [...depts].sort((a, b) => b.avgSalary - a.avgSalary)[0]
      const annualPayroll = depts.reduce((s, d) => s + d.payroll * 12, 0)
      const budget = depts.reduce((s, d) => s + d.budget, 0) || 1
      return {
        kpis: [
          { label: 'Departments', value: depts.length, icon: Briefcase, tone: 'primary' },
          { label: 'Largest team', value: largest?.name ?? '—', icon: Users, hint: largest ? `${largest.headcount} people` : undefined },
          { label: 'Highest avg salary', value: priciest?.name ?? '—', icon: Coins, hint: priciest ? formatKES(priciest.avgSalary) : undefined },
          { label: 'Budget utilisation', value: pct((annualPayroll / budget) * 100), icon: Landmark, hint: 'annualised payroll ÷ budget' },
        ],
        charts: [
          { title: 'Average salary by department', node: <HorizontalBars data={[...depts].sort((a, b) => b.avgSalary - a.avgSalary).map((d) => ({ label: d.name, value: d.avgSalary }))} name="Avg salary" valueFormatter={(v) => formatKES(v, { compact: true }).replace('KES ', '')} />, wide: true },
          { title: 'Turnover by department', node: <HorizontalBars data={[...depts].sort((a, b) => b.turnover - a.turnover).map((d) => ({ label: d.name, value: d.turnover }))} name="Turnover" valueFormatter={(v) => `${v}%`} /> },
        ],
        tableTitle: 'Department analytics',
        table: (
          <DataTable
            rows={depts}
            rowKey={(r) => r.id}
            columns={[
              ...deptColumns,
              { key: 'ret', header: 'Retention', cell: (r) => <span className="tabular">{pct(r.retention)}</span>, sortValue: (r) => r.retention, hideOnMobile: true },
              { key: 'pay', header: 'Monthly payroll', cell: (r) => <span className="tabular">{formatKES(r.payroll, { compact: true })}</span>, sortValue: (r) => r.payroll, hideOnMobile: true },
            ]}
          />
        ),
        rows: depts.map((r) => ({ Department: r.name, Headcount: r.headcount, 'Avg salary (KES)': r.avgSalary, 'Avg performance': r.avgPerf, 'Turnover %': r.turnover, 'Retention %': r.retention, 'Monthly payroll (KES)': r.payroll })),
      }
    }
  }
}

function ShareBar({ value }: { value: number }) {
  return (
    <div className="flex min-w-28 items-center gap-2">
      <Progress value={value} className="h-1.5 flex-1" />
      <span className="w-12 text-right text-xs tabular text-muted-foreground">{value.toFixed(1)}%</span>
    </div>
  )
}

