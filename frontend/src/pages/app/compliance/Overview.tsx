import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarClock, CircleAlert, FileX, ShieldCheck, TriangleAlert } from 'lucide-react'
import { axisProps, ChartTooltip, gridProps, SERIES } from '@/components/charts/ChartKit'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/EmptyState'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { StatCard } from '@/components/shared/StatCard'
import { Timeline } from '@/components/shared/Timeline'
import { daysUntil, formatDate } from '@/lib/utils'
import { DOC_TYPES, type DocRow } from './shared'

const shortType: Record<string, string> = {
  Passport: 'Passport',
  'Work Visa': 'Work visa',
  'Driving Licence': 'Licence',
  Contract: 'Contract',
  'Academic Certificate': 'Academic',
  'Certificate of Good Conduct': 'Good conduct',
  'Professional License': 'Prof. licence',
}

export function Overview({ docs, self, firstName }: { docs: DocRow[]; self: boolean; firstName: string }) {
  const counts = useMemo(() => {
    const c = { Valid: 0, Expiring: 0, Expired: 0, Missing: 0 }
    docs.forEach((d) => c[d.status]++)
    return c
  }, [docs])
  const score = docs.length ? Math.round((counts.Valid / docs.length) * 100) : 100
  const byType = DOC_TYPES.map((t) => ({ type: shortType[t] ?? t, full: t, count: docs.filter((d) => d.type === t).length })).filter((d) => d.count > 0)
  const upcoming = docs
    .filter((d) => d.expires && daysUntil(d.expires) >= 0 && daysUntil(d.expires) <= 90)
    .sort((a, b) => a.expires!.localeCompare(b.expires!))
    .slice(0, 7)
  const attention = counts.Expiring + counts.Expired + counts.Missing

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <ProgressRing value={score} size={132} stroke={12} tone={score >= 85 ? 'success' : score >= 65 ? 'primary' : 'warning'} label={<span className="text-3xl font-bold">{score}%</span>} />
            <div>
              <div className="font-semibold">{self ? 'My compliance' : 'Compliance score'}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {self
                  ? attention
                    ? `${firstName}, ${attention} document${attention === 1 ? ' needs' : 's need'} your attention.`
                    : `You’re fully compliant, ${firstName}.`
                  : `${counts.Valid} of ${docs.length} documents valid`}
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 content-start gap-3 sm:gap-4">
          <StatCard label="Valid" value={counts.Valid} icon={ShieldCheck} tone="success" index={0} />
          <StatCard label="Expiring" value={counts.Expiring} icon={TriangleAlert} tone="warning" index={1} hint="Within 60 days" />
          <StatCard label="Expired" value={counts.Expired} icon={CircleAlert} index={2} hint="Renew immediately" />
          <StatCard label="Missing" value={counts.Missing} icon={FileX} index={3} hint="Not yet uploaded" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Documents by type" description={`${docs.length} documents on file`} className="min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byType} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="type" {...axisProps} fontSize={10} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} docs`} />} />
              <Bar dataKey="count" name="Documents" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Upcoming expiries" description="Next 90 days">
          {upcoming.length ? (
            <Timeline
              items={upcoming.map((d, i) => {
                const days = daysUntil(d.expires!)
                return {
                  title: self ? d.type : `${d.emp?.name ?? 'Employee'} — ${d.type}`,
                  meta: formatDate(d.expires!, 'short'),
                  body: `Expires in ${days} day${days === 1 ? '' : 's'}`,
                  icon: CalendarClock,
                  state: i === 0 ? 'current' : 'upcoming',
                }
              })}
            />
          ) : (
            <EmptyState icon={CalendarClock} title="Nothing expiring soon" description="No documents expire in the next 90 days." />
          )}
        </Section>
      </div>
    </div>
  )
}
