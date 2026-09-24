import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee, Policy } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { Timeline } from '@/components/shared/Timeline'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { nowTime, seeded, seededInt } from './util'

function sections(p: Policy, company: string) {
  return [
    { h: '1. Purpose', b: `${p.summary} This policy sets out what ${company} expects of every employee, consultant and contractor.` },
    { h: '2. Scope', b: `Applies to all staff across every ${company} office and to anyone working remotely on company business, including interns and consultants.` },
    { h: '3. Policy statement', b: `Employees must follow the standards described here at all times. Where this policy conflicts with Kenyan law, the Employment Act, 2007 and related regulations prevail.` },
    { h: '4. Responsibilities', b: `Line managers are responsible for making sure their teams understand this policy. HR (${p.owner}) owns the policy and answers questions.` },
    { h: '5. Breaches', b: 'Breaches are handled through the disciplinary procedure and may result in a warning, suspension or summary dismissal depending on severity.' },
    { h: '6. Review', b: `This policy is reviewed at least annually. Current version ${p.version}, last updated ${formatDate(p.updated)}.` },
  ]
}

const methods = [{ label: 'Typed signature' }, { label: 'Click-to-accept (web)' }, { label: 'Mobile app' }]

function auditLog(p: Policy, employees: Employee[]) {
  const count = Math.min(10, Math.round((p.acknowledged / 100) * employees.length))
  return employees
    .filter((e) => e.status !== 'Exited')
    .map((e) => ({ e, r: seeded(p.id + e.id) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, count)
    .map(({ e }, i) => {
      const daysAgo = seededInt(p.id + e.id + 'd', 0, 40) + i
      const d = new Date(TODAY)
      d.setDate(d.getDate() - daysAgo)
      const hh = String(seededInt(e.id + p.id + 'h', 7, 19)).padStart(2, '0')
      const mm = String(seededInt(e.id + p.id + 'm', 0, 59)).padStart(2, '0')
      return {
        id: e.id,
        name: e.name,
        at: `${formatDate(d)} · ${hh}:${mm}`,
        sortKey: daysAgo,
        ip: `41.${seededInt(e.id + 'a', 80, 220)}.${seededInt(e.id + 'b', 1, 254)}.${seededInt(p.id + e.id + 'c', 1, 254)}`,
        method: methods[seededInt(e.id + p.id + 'x', 0, 2)]!,
      }
    })
    .sort((a, b) => a.sortKey - b.sortKey)
}

export function PolicyAck() {
  const { policies, employees, workspace, user, role } = useWorkspace()
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [signed, setSigned] = useState<Record<string, string>>({})
  const admin = isAdminLike(role)

  const list = policies.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
  const open = policies.find((p) => p.id === openId) ?? null

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search policies…" className="sm:w-72" />
        <div className="text-xs text-muted-foreground">
          {policies.filter((p) => p.mandatory).length} mandatory · {policies.length} total · {Object.keys(signed).length} signed by you this session
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p, i) => {
          const ack = signed[p.id] ? Math.min(100, p.acknowledged + 1) : p.acknowledged
          return (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ y: -2 }}
              onClick={() => setOpenId(p.id)}
              className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-lg hover:shadow-black/[0.04]"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{p.category}</span>·<span className="tabular">{p.version}</span>·<span>Updated {formatDate(p.updated, 'short')}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.mandatory ? <Badge variant="soft">Mandatory</Badge> : <Badge variant="muted">Optional</Badge>}
                {signed[p.id] && (
                  <Badge variant="success" dot>
                    Signed by you
                  </Badge>
                )}
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Acknowledged</span>
                  <span className="font-semibold tabular">{ack}%</span>
                </div>
                <Progress value={ack} className="h-1.5" tone={ack >= 90 ? 'success' : ack >= 75 ? 'primary' : 'warning'} />
              </div>
            </motion.button>
          )
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="sm:max-w-xl">
          {open && (
            <PolicySheet
              key={open.id}
              policy={open}
              company={workspace.name}
              userName={user.name}
              signedAt={signed[open.id]}
              onSign={(at) => setSigned((s) => ({ ...s, [open.id]: at }))}
              log={auditLog(open, employees)}
              showAudit={admin || role === 'manager'}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function PolicySheet({
  policy,
  company,
  userName,
  signedAt,
  onSign,
  log,
  showAudit,
}: {
  policy: Policy
  company: string
  userName: string
  signedAt?: string
  onSign: (at: string) => void
  log: ReturnType<typeof auditLog>
  showAudit: boolean
}) {
  const [agree, setAgree] = useState(false)
  const [sig, setSig] = useState('')
  const body = useMemo(() => sections(policy, company), [policy, company])
  const canSign = agree && sig.trim().length >= 3

  return (
    <div className="flex flex-col">
      <div className="border-b p-5 pr-12">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{policy.category}</Badge>
          <Badge variant="muted">{policy.version}</Badge>
          {policy.mandatory && <Badge variant="soft">Mandatory</Badge>}
        </div>
        <SheetTitle className="mt-2">{policy.title}</SheetTitle>
        <SheetDescription className="mt-1">{policy.summary}</SheetDescription>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5">
        <Card className="max-h-72 overflow-y-auto bg-subtle p-4 scrollbar-thin">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{company}</div>
          <h3 className="mt-1 font-semibold">{policy.title}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {body.map((s) => (
              <div key={s.h}>
                <div className="text-sm font-semibold">{s.h}</div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
              </div>
            ))}
          </div>
        </Card>

        {signedAt ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-success/30 bg-success-soft/40 p-5 text-center">
            <SuccessCheck size={60} />
            <div className="mt-3 font-semibold">Acknowledged</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Signed by {userName} on {signedAt}
            </div>
            <div className="mt-3 font-serif text-xl italic">{userName}</div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>I have read and accept the {policy.title} ({policy.version}).</span>
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="pol-sig">Type your full name to sign</Label>
              <Input id="pol-sig" value={sig} onChange={(e) => setSig(e.target.value)} placeholder={userName} />
            </div>
            <Button
              disabled={!canSign}
              onClick={() => {
                const at = `${formatDate(TODAY)} at ${nowTime()}`
                onSign(at)
                toast.success(`${policy.title} acknowledged`)
              }}
            >
              Accept
            </Button>
          </div>
        )}

        <div>
          <h4 className="mb-3 text-sm font-semibold">Version history
          </h4>
          <Timeline
            items={policy.history.map((h, i) => ({
              title: h.version,
              meta: formatDate(h.date),
              body: h.note,
              state: i === 0 ? 'current' : 'done',
            }))}
          />
        </div>

        {showAudit && (
          <>
            <Separator />
            <div>
              <h4 className="mb-1 text-sm font-semibold">Acknowledgement audit log
              </h4>
              <p className="mb-3 text-xs text-muted-foreground">Most recent {log.length} of {policy.acknowledged}% acknowledged. Tamper-evident, exportable for audits.</p>
              <ul className="divide-y rounded-xl border">
                {log.map((row) => {
                  return (
                    <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <PersonCell name={row.name} sub={row.at} size="sm" />
                      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end')}>
                        <span className="font-mono tabular">{row.ip}</span>
                        <span>{row.method.label}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
