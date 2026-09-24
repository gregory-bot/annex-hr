import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useWorkspace } from '@/context/auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SimpleSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildReport, reportTabs, type Period, type ReportTab } from './reports/buildReport'

const periodOptions = [
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
]

export default function Reports() {
  const ws = useWorkspace()
  const { departments, employees, workspace } = ws
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as ReportTab | null
  const tab: ReportTab = reportTabs.some((t) => t.value === tabParam) ? tabParam! : 'headcount'

  const [dept, setDept] = useState('all')
  const [period, setPeriod] = useState<Period>('12m')
  const [location, setLocation] = useState('all')

  const locations = useMemo(() => Array.from(new Set(employees.map((e) => e.location))).sort(), [employees])

  const report = useMemo(() => {
    const match = (e: (typeof employees)[number]) => (dept === 'all' || e.departmentId === dept) && (location === 'all' || e.location === location)
    const allFiltered = employees.filter(match)
    const active = allFiltered.filter((e) => e.status !== 'Exited')
    const orgActive = employees.filter((e) => e.status !== 'Exited').length || 1
    return buildReport(tab, {
      data: ws,
      employees: active,
      allFiltered,
      scale: active.length / orgActive,
      period,
      deptName: (id) => ws.department(id)?.name ?? '',
    })
  }, [tab, dept, location, period, employees, ws])

  const filtered = dept !== 'all' || location !== 'all' || period !== '12m'
  const tabLabel = reportTabs.find((t) => t.value === tab)!.label

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description={`Workforce analytics for ${workspace.name}. Filter by department, period and location, then export for the board pack.`}
        actions={<ExportMenu filename={`${workspace.slug}-${tab}-report`} rows={report.rows} />}
      />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="w-full justify-start sm:w-auto">
          {reportTabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="px-1 text-xs font-medium text-muted-foreground">Filters</div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-1 sm:flex-wrap">
          <SimpleSelect
            value={dept}
            onValueChange={setDept}
            className="sm:w-48"
            options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <SimpleSelect value={period} onValueChange={(v) => setPeriod(v as Period)} className="sm:w-44" options={periodOptions} />
          <SimpleSelect value={location} onValueChange={setLocation} className="sm:w-44" options={[{ value: 'all', label: 'All locations' }, ...locations]} />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDept('all')
              setPeriod('12m')
              setLocation('all')
            }}
          >
            Reset
          </Button>
        )}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {report.kpis.map((k, i) => (
            <StatCard key={k.label} {...k} index={i} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {report.charts.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.05 }}
              className={cn('min-w-0 overflow-hidden', c.wide ? 'lg:col-span-2' : 'lg:col-span-1', report.charts.length === 1 && 'lg:col-span-3')}
            >
              <Section title={c.title} description={c.description} className="h-full">
                {c.node}
              </Section>
            </motion.div>
          ))}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">{report.tableTitle}</h2>
            <span className="text-xs text-muted-foreground">
              {tabLabel} · {periodOptions.find((p) => p.value === period)!.label}
            </span>
          </div>
          {report.table}
        </div>
      </motion.div>
    </div>
  )
}
