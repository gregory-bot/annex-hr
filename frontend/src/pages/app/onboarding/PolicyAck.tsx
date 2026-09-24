import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { SuccessCheck } from '@/components/shared/SuccessCheck'
import { Timeline } from '@/components/shared/Timeline'
import { formatDate, TODAY } from '@/lib/utils'
import { nextVersion, policyApi, usePolicies, type PolicyAcks, type PolicyItem } from '../compliance/api'
import { seeded, seededInt } from './util'

function sections(p: PolicyItem, company: string) {
  return [
    { h: '1. Purpose', b: `${p.summary} This policy sets out what ${company} expects of every employee, consultant and contractor.` },
    { h: '2. Scope', b: `Applies to all staff across every ${company} office and to anyone working remotely on company business, including interns and consultants.` },
    { h: '3. Policy statement', b: `Employees must follow the standards described here at all times. Where this policy conflicts with Kenyan law, the Employment Act, 2007 and related regulations prevail.` },
    { h: '4. Responsibilities', b: `Line managers are responsible for making sure their teams understand this policy. HR (${p.owner}) owns the policy and answers questions.` },
    { h: '5. Breaches', b: 'Breaches are handled through the disciplinary procedure and may result in a warning, suspension or summary dismissal depending on severity.' },
    { h: '6. Review', b: `This policy is reviewed at least annually. Current version ${p.version}, last updated ${formatDate(p.updated)}.` },
  ]
}

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${formatDate(iso.slice(0, 10))} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Mock mode only: a plausible sign-off log. */
function mockAcks(p: PolicyItem, employees: Employee[]): PolicyAcks {
  const active = employees.filter((e) => e.status !== 'Exited')
  const n = Math.round((p.acknowledged / 100) * active.length)
  const ranked = active.map((e) => ({ e, r: seeded(p.id + e.id) })).sort((a, b) => a.r - b.r)
  const d = new Date(TODAY)
  return {
    policyId: p.id,
    version: p.version,
    headcount: active.length,
    signedCurrent: n,
    acknowledgements: ranked.slice(0, n).map(({ e }, i) => {
      const at = new Date(d)
      at.setDate(at.getDate() - seededInt(p.id + e.id, 0, 40) - i)
      return { employeeId: e.id, name: e.name, employeeNo: e.employeeNo, version: p.version, signature: e.name, ip: `41.${seededInt(e.id, 80, 220)}.${seededInt(p.id, 1, 254)}.12`, acknowledgedAt: at.toISOString(), current: true }
    }),
    pending: ranked.slice(n).map(({ e }) => ({ employeeId: e.id, name: e.name, employeeNo: e.employeeNo })),
  }
}

export function PolicyAck() {
  const { policies: seed, workspace, user, role } = useWorkspace()
  const { policies, setPolicies, reload } = usePolicies(seed)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const admin = isAdminLike(role)

  const list = policies.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase()))
  const open = policies.find((p) => p.id === openId) ?? null
  const signedCount = policies.filter((p) => p.myAcknowledgement).length
  const toSign = policies.filter((p) => p.mandatory && !p.myAcknowledgement).length

  const onSigned = (id: string, at: string) =>
    setPolicies((ps) => ps.map((p) => (p.id === id ? { ...p, myAcknowledgement: { policy_id: id, version: p.version, acknowledged_at: at }, acknowledged: Math.min(100, p.acknowledged + (USE_MOCK_API ? 1 : 0)) } : p)))

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search policies…" className="sm:w-72" />
        <div className="text-xs text-muted-foreground">
          {policies.filter((p) => p.mandatory).length} mandatory · {policies.length} total · {signedCount} signed by you
          {toSign > 0 && ` · ${toSign} mandatory to sign`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p, i) => (
          <motion.button
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.03 }}
            onClick={() => setOpenId(p.id)}
            className="flex flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20"
          >
            <div className="min-w-0">
              <div className="truncate font-semibold">{p.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{p.category}</span>·<span className="tabular">{p.version}</span>·<span>Updated {formatDate(p.updated, 'short')}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.mandatory ? <Badge variant="soft">Mandatory</Badge> : <Badge variant="muted">Optional</Badge>}
              {p.myAcknowledgement ? (
                <Badge variant="success" dot>
                  Signed by you
                </Badge>
              ) : (
                p.mandatory && (
                  <Badge variant="warning" dot>
                    Needs your signature
                  </Badge>
                )
              )}
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">Acknowledged</span>
                <span className="font-semibold tabular">{p.acknowledged}%</span>
              </div>
              <Progress value={p.acknowledged} className="h-1.5" tone={p.acknowledged >= 90 ? 'success' : p.acknowledged >= 75 ? 'primary' : 'warning'} />
            </div>
          </motion.button>
        ))}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="sm:max-w-xl">
          {open && (
            <PolicySheet
              key={`${open.id}-${open.version}`}
              policy={open}
              company={workspace.name}
              userName={user.name}
              onSigned={(at) => {
                onSigned(open.id, at)
                void reload().catch(() => undefined)
              }}
              onPublished={() => void reload().catch(() => undefined)}
              admin={admin}
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
  onSigned,
  onPublished,
  admin,
}: {
  policy: PolicyItem
  company: string
  userName: string
  onSigned: (at: string) => void
  onPublished: () => void
  admin: boolean
}) {
  const { employees } = useWorkspace()
  const [agree, setAgree] = useState(false)
  const [sig, setSig] = useState('')
  const [signing, setSigning] = useState(false)
  const [acks, setAcks] = useState<PolicyAcks | null>(null)
  const [reminding, setReminding] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const body = useMemo(() => sections(policy, company), [policy, company])
  const canSign = agree && sig.trim().length >= 2
  const signedAt = policy.myAcknowledgement?.acknowledged_at

  useEffect(() => {
    if (!admin) return
    if (USE_MOCK_API) {
      setAcks(mockAcks(policy, employees))
      return
    }
    let live = true
    policyApi
      .acknowledgements(policy.id)
      .then((a) => live && setAcks(a))
      .catch((e) => live && toast.error(errorMessage(e)))
    return () => {
      live = false
    }
  }, [admin, policy, employees])

  const sign = async () => {
    setSigning(true)
    try {
      const at = USE_MOCK_API ? new Date().toISOString() : (await policyApi.acknowledge(policy.id, sig.trim())).acknowledgedAt
      onSigned(at)
      toast.success(`${policy.title} acknowledged`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSigning(false)
    }
  }

  const remind = async () => {
    setReminding(true)
    try {
      const n = USE_MOCK_API ? (acks?.pending.length ?? 0) : (await policyApi.remind(policy.id)).reminded
      toast.success(n ? `Reminder sent to ${n} ${n === 1 ? 'person' : 'people'}` : 'Everyone has signed this version')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setReminding(false)
    }
  }

  const current = acks?.acknowledgements.filter((a) => a.current) ?? []
  const older = acks?.acknowledgements.filter((a) => !a.current) ?? []

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
              {policy.version} signed by {userName} on {stamp(signedAt)}
            </div>
            <div className="mt-3 font-serif text-xl italic">{userName}</div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-3 rounded-xl border p-4">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>
                I have read and accept the {policy.title} ({policy.version}).
              </span>
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="pol-sig">Type your full name to sign</Label>
              <Input id="pol-sig" value={sig} onChange={(e) => setSig(e.target.value)} placeholder={userName} maxLength={120} />
            </div>
            <Button disabled={!canSign || signing} onClick={() => void sign()}>
              {signing ? 'Signing…' : 'Accept and sign'}
            </Button>
            <p className="text-xs text-muted-foreground">Your typed signature, the time and your IP address are recorded for audit.</p>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Version history</h4>
            {admin && (
              <Button size="sm" variant="outline" onClick={() => setPublishOpen(true)}>
                Publish new version
              </Button>
            )}
          </div>
          <Timeline
            items={policy.history.map((h, i) => ({
              title: h.version,
              meta: formatDate(h.date),
              body: h.note,
              state: i === 0 ? 'current' : 'done',
            }))}
          />
        </div>

        {admin && (
          <>
            <Separator />
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Acknowledgement audit log</h4>
                {acks && (
                  <ExportMenu
                    filename={`${policy.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-acknowledgements`}
                    rows={acks.acknowledgements.map((a) => ({ name: a.name, employeeNo: a.employeeNo, version: a.version, signature: a.signature, ip: a.ip ?? '', acknowledgedAt: a.acknowledgedAt }))}
                  />
                )}
              </div>
              {!acks ? (
                <Skeleton className="h-32" />
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {acks.signedCurrent} of {acks.headcount} signed {acks.version}
                    {acks.pending.length > 0 && ` · ${acks.pending.length} still to sign`}
                  </p>
                  {acks.pending.length > 0 && (
                    <div className="mb-3 flex flex-col gap-2 rounded-xl border bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 text-xs text-muted-foreground">
                        Not signed yet: {acks.pending.slice(0, 4).map((p) => p.name).join(', ')}
                        {acks.pending.length > 4 && ` and ${acks.pending.length - 4} more`}
                      </p>
                      <Button size="sm" variant="outline" disabled={reminding} className="shrink-0" onClick={() => void remind()}>
                        {reminding ? 'Sending…' : `Remind ${acks.pending.length}`}
                      </Button>
                    </div>
                  )}
                  {current.length === 0 && older.length === 0 ? (
                    <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">No acknowledgements yet.</p>
                  ) : (
                    <ul className="max-h-96 divide-y overflow-y-auto rounded-xl border scrollbar-thin">
                      {[...current, ...older].map((row) => (
                        <li key={`${row.employeeId}-${row.version}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <PersonCell name={row.name} sub={stamp(row.acknowledgedAt)} size="sm" />
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
                            <span className="font-mono tabular">{row.ip ?? '—'}</span>
                            <Badge variant={row.current ? 'success' : 'muted'}>{row.version}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {admin && <PublishVersionDialog open={publishOpen} onOpenChange={setPublishOpen} policy={policy} onPublished={onPublished} />}
    </div>
  )
}

function PublishVersionDialog({ open, onOpenChange, policy, onPublished }: { open: boolean; onOpenChange: (o: boolean) => void; policy: PolicyItem; onPublished: () => void }) {
  const [version, setVersion] = useState(() => nextVersion(policy.version))
  const [note, setNote] = useState('')
  const [summary, setSummary] = useState(policy.summary)
  const [saving, setSaving] = useState(false)
  const validVersion = /^v\d+\.\d+$/.test(version)

  const publish = async () => {
    setSaving(true)
    try {
      if (!USE_MOCK_API) await policyApi.publishVersion(policy.id, version, note.trim(), summary.trim() !== policy.summary ? summary.trim() : undefined)
      toast.success(`${policy.title} ${version} published`, { description: 'Everyone has been asked to read and acknowledge it.' })
      onPublished()
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish a new version</DialogTitle>
          <DialogDescription>Acknowledgements reset to 0% and everyone is notified to sign {policy.title} again.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="pv-version">Version</Label>
            <Input id="pv-version" value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder="v1.1" />
            {!validVersion && <p className="text-xs text-danger">Use the format v1.2</p>}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="pv-note">What changed</Label>
            <Input id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated per diem rates for 2027" maxLength={200} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="pv-summary">Summary</Label>
            <Textarea id="pv-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!validVersion || note.trim().length < 3 || saving} onClick={() => void publish()}>
            {saving ? 'Publishing…' : 'Publish and notify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
