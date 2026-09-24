import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { PersonCell } from '@/components/shared/PersonCell'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { seeded, seededInt } from '../onboarding/util'
import type { DocRow } from './shared'

const REQUIRED = [
  { key: 'Contract', label: 'Signed employment contract', source: 'doc' },
  { key: 'nid', label: 'National ID / Huduma card' },
  { key: 'kra', label: 'KRA PIN certificate' },
  { key: 'nssf', label: 'NSSF registration' },
  { key: 'shif', label: 'SHIF registration' },
  { key: 'Certificate of Good Conduct', label: 'Certificate of Good Conduct', source: 'doc' },
  { key: 'Academic Certificate', label: 'Academic certificates', source: 'doc' },
  { key: 'nda', label: 'Signed NDA & IP assignment' },
  { key: 'policies', label: 'Mandatory policy acknowledgements' },
  { key: 'p9', label: 'P9 form (last tax year)' },
] as const

export function AuditFiles({ employees, docs, department }: { employees: Employee[]; docs: DocRow[]; department: (id?: string) => { name: string } | undefined }) {
  const [empId, setEmpId] = useState(employees[0]?.id)
  const emp = employees.find((e) => e.id === empId)

  const checklist = useMemo(() => {
    if (!emp) return []
    const mine = docs.filter((d) => d.employeeId === emp.id)
    return REQUIRED.map((r) => {
      const doc = mine.find((d) => d.type === r.key)
      let status: 'ok' | 'issue' | 'missing'
      if ('source' in r && doc) status = doc.status === 'Valid' ? 'ok' : doc.status === 'Missing' ? 'missing' : 'issue'
      else status = seeded(emp.id + r.key) < 0.82 ? 'ok' : 'missing'
      const note = doc ? `${doc.status}${doc.expires ? ` · expires ${formatDate(doc.expires)}` : ''}` : status === 'ok' ? 'On file' : 'Not uploaded'
      return { ...r, status, note }
    })
  }, [emp, docs])

  const pct = checklist.length ? Math.round((checklist.filter((c) => c.status === 'ok').length / checklist.length) * 100) : 0
  const lastAudit = useMemo(() => {
    if (!emp) return TODAY
    const d = new Date(TODAY)
    d.setDate(d.getDate() - seededInt(emp.id + 'audit', 12, 180))
    return d.toISOString().slice(0, 10)
  }, [emp])

  if (!emp) return null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="grid grid-cols-1 content-start gap-4">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Employee</Label>
              <SimpleSelect value={empId} onValueChange={setEmpId} options={employees.map((e) => ({ value: e.id, label: e.name }))} />
            </div>
            <PersonCell name={emp.name} sub={`${emp.employeeNo} · ${department(emp.departmentId)?.name ?? ''}`} />
            <div className="flex items-center gap-4 rounded-xl bg-subtle p-4">
              <ProgressRing value={pct} size={88} stroke={8} tone={pct === 100 ? 'success' : pct >= 70 ? 'primary' : 'warning'} />
              <div className="text-sm">
                <div className="font-semibold">File completeness</div>
                <div className="text-xs text-muted-foreground">
                  {checklist.filter((c) => c.status === 'ok').length} of {checklist.length} files ready
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Last audited {formatDate(lastAudit)}</div>
              </div>
            </div>
            <Button onClick={() => toast.success(`Audit pack for ${emp.name} is being prepared — ZIP download will start shortly`)}>
              Download audit pack (ZIP)
            </Button>
            <p className="text-xs text-muted-foreground">
              Includes every file below, an index and a signed audit trail — ready for NITA, KRA or labour inspections.
            </p>
          </CardContent>
        </Card>
      </div>

      <Section title="Required files" description="Kenya statutory & company requirements" action={<Badge variant={pct === 100 ? 'success' : 'warning'}>{pct === 100 ? 'Audit-ready' : 'Gaps found'}</Badge>}>
        <ul className="grid grid-cols-1 gap-2">
          {checklist.map((c, i) => (
            <motion.li
              key={c.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <span
                aria-label={c.status === 'ok' ? 'On file' : c.status === 'issue' ? 'Needs attention' : 'Missing'}
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  c.status === 'ok' && 'bg-success',
                  c.status === 'issue' && 'bg-warning',
                  c.status === 'missing' && 'bg-danger',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.note}</div>
              </div>
              {c.status !== 'ok' && (
                <Button size="sm" variant="ghost" onClick={() => toast.success(`Request sent to ${emp.name.split(' ')[0]} for ${c.label.toLowerCase()}`)}>
                  Request
                </Button>
              )}
            </motion.li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
