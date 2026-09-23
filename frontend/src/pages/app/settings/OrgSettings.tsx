import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarPlus, ScrollText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useWorkspace } from '@/context/auth'
import type { Holiday, Policy } from '@/data/types'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { InviteForm, PendingInvitesTable } from '../people/InviteDialog'
import type { PendingInvite } from '../people/helpers'
import { ChipEditor } from './shared'

/* --------------------------- Holiday calendars --------------------------- */

const FLAG: Record<string, string> = { Kenya: 'KE', Nigeria: 'NG', Uganda: 'UG', Rwanda: 'RW', Tanzania: 'TZ', Ghana: 'GH' }

export function HolidayCalendars() {
  const { holidays: seed, workspace } = useWorkspace()
  const [holidays, setHolidays] = useState<Holiday[]>(seed)
  const officeCountries = new Set(workspace.offices.map((o) => o.country))
  const countries = useMemo(() => Array.from(new Set([...workspace.offices.map((o) => o.country), ...holidays.map((h) => h.country)])), [holidays, workspace.offices])
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(countries.map((c) => [c, officeCountries.has(c)])))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', country: workspace.country })

  const add = () => {
    if (!form.name.trim() || !form.date) {
      toast.error('Holiday name and date are required')
      return
    }
    setHolidays((h) => [...h, { name: form.name.trim(), date: form.date, country: form.country }])
    setEnabled((e) => ({ ...e, [form.country]: e[form.country] ?? true }))
    setOpen(false)
    toast.success(`${form.name.trim()} added`, { description: `${formatDate(form.date, 'long')} · ${form.country}` })
    setForm({ name: '', date: '', country: workspace.country })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Public holidays are excluded from leave day counts and attendance for employees in that country.</p>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <CalendarPlus /> Add holiday
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {countries.map((country, ci) => {
          const list = holidays.filter((h) => h.country === country).sort((a, b) => a.date.localeCompare(b.date))
          const on = enabled[country] ?? false
          return (
            <motion.div key={country} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05 }}>
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{FLAG[country] ?? country.slice(0, 2).toUpperCase()}</span>
                    {country}
                  </span>
                }
                description={`${list.length} public holiday${list.length === 1 ? '' : 's'} in 2026${officeCountries.has(country) ? '' : ' · no office'}`}
                action={
                  <Switch
                    checked={on}
                    onCheckedChange={(v) => {
                      setEnabled((e) => ({ ...e, [country]: v }))
                      toast.success(`${country} calendar ${v ? 'enabled' : 'disabled'}`)
                    }}
                    aria-label={`Toggle ${country} calendar`}
                  />
                }
                className={cn('h-full transition-opacity', !on && 'opacity-60')}
              >
                <ul className="divide-y">
                  {list.map((h) => {
                    const d = daysUntil(h.date)
                    return (
                      <li key={h.date + h.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border bg-subtle py-1 leading-none">
                            <span className="text-[10px] uppercase text-muted-foreground">{new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
                            <span className="mt-0.5 text-sm font-bold tabular">{new Date(h.date + 'T12:00:00').getDate()}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{h.name}</div>
                            <div className="text-xs text-muted-foreground">{new Date(h.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}</div>
                          </div>
                        </div>
                        {d < 0 ? (
                          <Badge variant="muted">Passed</Badge>
                        ) : d <= 30 ? (
                          <Badge variant="soft">In {d} days</Badge>
                        ) : (
                          <Badge variant="outline">Upcoming</Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Section>
            </motion.div>
          )
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add public holiday</DialogTitle>
            <DialogDescription>Gazetted or company-specific days off.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="hol-name">Name</Label>
              <Input id="hol-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Eid al-Fitr" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-1 gap-1.5">
                <Label htmlFor="hol-date">Date</Label>
                <Input id="hol-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Country</Label>
                <SimpleSelect value={form.country} onValueChange={(v) => setForm({ ...form, country: v })} options={Array.from(new Set([...countries, 'Tanzania', 'Ghana']))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add}>Add holiday</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------ Departments & job titles ----------------------- */

export function Taxonomy() {
  const { departments, employees } = useWorkspace()
  const [depts, setDepts] = useState(departments.map((d) => d.name))
  const [titles, setTitles] = useState(() => Array.from(new Set(employees.map((e) => e.title))).sort())
  const [levels, setLevels] = useState(['Intern', 'Associate', 'Mid-level', 'Senior', 'Lead', 'Head of', 'Director', 'C-suite'])
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="Departments" description="Used across approvals, reporting and payroll cost centres.">
        <ChipEditor items={depts} onChange={setDepts} placeholder="Add a department" noun="Department" />
      </Section>
      <Section title="Job levels" description="Career bands used for pay ranges and promotions.">
        <ChipEditor items={levels} onChange={setLevels} placeholder="Add a level" noun="Level" />
      </Section>
      <Section title="Job titles" description="Standardised titles keep reports and org charts clean." className="lg:col-span-2">
        <ChipEditor items={titles} onChange={setTitles} placeholder="Add a job title" noun="Title" />
      </Section>
    </div>
  )
}

/* -------------------------------- Policies ------------------------------- */

function bump(v: string) {
  const m = /^v(\d+)\.(\d+)$/.exec(v)
  if (!m) return v + '.1'
  return `v${m[1]}.${Number(m[2]) + 1}`
}

export function PoliciesSettings() {
  const ws = useWorkspace()
  const [policies, setPolicies] = useState<Policy[]>(ws.policies)
  const publish = (p: Policy) => {
    const next = bump(p.version)
    setPolicies((list) =>
      list.map((x) =>
        x.id === p.id
          ? { ...x, version: next, updated: '2026-09-23', acknowledged: 0, history: [{ version: next, date: '2026-09-23', note: 'Published from settings' }, ...x.history] }
          : x,
      ),
    )
    toast.success(`${p.title} ${next} published`, { description: `${ws.employees.length} employees asked to re-acknowledge.` })
  }
  return (
    <Section title="Company policies" description="Mandatory policies block onboarding until acknowledged." contentClassName="p-0">
      <ul className="divide-y border-t">
        {policies.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <ScrollText className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <Badge variant="outline" className="font-mono">
                    {p.version}
                  </Badge>
                  <Badge variant="muted">{p.category}</Badge>
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  Updated {formatDate(p.updated)} · Owner {p.owner}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 pl-12 lg:pl-0">
              <div className="w-32">
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>Acknowledged</span>
                  <span className="tabular">{p.acknowledged}%</span>
                </div>
                <Progress value={p.acknowledged} className="h-1.5" tone={p.acknowledged >= 90 ? 'success' : p.acknowledged >= 60 ? 'primary' : 'warning'} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={p.mandatory}
                  onCheckedChange={(v) => {
                    setPolicies((list) => list.map((x) => (x.id === p.id ? { ...x, mandatory: v } : x)))
                    toast.success(`${p.title} is now ${v ? 'mandatory' : 'optional'}`)
                  }}
                />
                Mandatory
              </label>
              <Button variant="outline" size="sm" onClick={() => publish(p)}>
                <Upload /> Publish new version
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ------------------------------ Invite users ----------------------------- */

export function InviteUsers() {
  const { departments, workspace, employees } = useWorkspace()
  // Derive the company's email domain from an existing employee address.
  const domain = employees[0]?.email.split('@')[1] ?? `${workspace.slug}.com`
  const [invites, setInvites] = useState<PendingInvite[]>(() => [
    { id: 'seed-1', email: `mercy.chebet@${domain}`, departmentId: departments[0]!.id, role: 'employee', sent: '2026-09-21' },
    { id: 'seed-2', email: `ivan.kilonzo@${domain}`, departmentId: departments[1 % departments.length]!.id, role: 'consultant', sent: '2026-09-19' },
    { id: 'seed-3', email: `halima.ali@${domain}`, departmentId: departments[2 % departments.length]!.id, role: 'manager', sent: '2026-09-16' },
  ])
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Section title="Invite users" description="Invite by email. Roles can be changed later under Roles & permissions." className="xl:col-span-2">
        <InviteForm departments={departments} onSent={(inv) => setInvites((p) => [...inv, ...p])} />
      </Section>
      <div className="min-w-0 xl:col-span-3">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold">Pending invites</h3>
          <span className="text-xs text-muted-foreground">Links expire after 7 days</span>
        </div>
        <PendingInvitesTable
          invites={invites}
          departments={departments}
          onRevoke={(id) => {
            setInvites((p) => p.filter((x) => x.id !== id))
            toast.success('Invitation revoked')
          }}
          onResend={(inv) => {
            setInvites((p) => p.map((x) => (x.id === inv.id ? { ...x, sent: '2026-09-23' } : x)))
            toast.success('Invitation resent', { description: inv.email })
          }}
        />
      </div>
    </div>
  )
}
