import { useMemo, useState } from 'react'
import { Copy, KeyRound, Plus, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { SearchInput } from '@/components/shared/SearchInput'
import { ExportMenu } from '@/components/shared/ExportMenu'
import { PersonCell } from '@/components/shared/PersonCell'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useWorkspace } from '@/context/auth'
import { cn, formatDate } from '@/lib/utils'
import { prng, SettingRow } from './shared'

/* -------------------------------- Security ------------------------------- */

function FakeQr({ seed }: { seed: number }) {
  const N = 21
  const cells = useMemo(() => {
    const rnd = prng(seed)
    const finder = (r: number, c: number) => {
      const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7
      for (const [r0, c0] of [
        [0, 0],
        [0, N - 7],
        [N - 7, 0],
      ] as const) {
        if (inBox(r0, c0)) {
          const rr = r - r0
          const cc = c - c0
          const ring = rr === 0 || rr === 6 || cc === 0 || cc === 6
          const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4
          return ring || core ? 1 : 0
        }
        if (r >= r0 - 1 && r <= r0 + 7 && c >= c0 - 1 && c <= c0 + 7) return 0
      }
      return -1
    }
    return Array.from({ length: N * N }, (_, i) => {
      const f = finder(Math.floor(i / N), i % N)
      return f === -1 ? (rnd() > 0.52 ? 1 : 0) : f
    })
  }, [seed])
  return (
    <div className="mx-auto w-44 rounded-xl border bg-white p-3">
      <div className="grid grid-cols-1" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {cells.map((c, i) => (
          <span key={i} className={cn('aspect-square', c ? 'bg-[#111827]' : 'bg-white')} />
        ))}
      </div>
    </div>
  )
}

export function SecuritySettings() {
  const { workspace } = useWorkspace()
  const [twoFa, setTwoFa] = useState(false)
  const [enforce, setEnforce] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [code, setCode] = useState('')
  const [minLength, setMinLength] = useState('12')
  const [rules, setRules] = useState({ upper: true, number: true, symbol: true, reuse: true })
  const [expiry, setExpiry] = useState('90')
  const [timeout, setTimeout_] = useState('30')
  const [ips, setIps] = useState(['196.201.214.0/24', '41.90.64.12'])
  const [ipDraft, setIpDraft] = useState('')
  const [ipOn, setIpOn] = useState(false)

  const verify = () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your authenticator app')
      return
    }
    setTwoFa(true)
    setSetupOpen(false)
    setCode('')
    toast.success('Two-factor authentication enabled', { description: 'Save your recovery codes somewhere safe.' })
  }

  const addIp = () => {
    const v = ipDraft.trim()
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v)) {
      toast.error('Enter an IPv4 address or CIDR range')
      return
    }
    if (ips.includes(v)) return
    setIps((l) => [...l, v])
    setIpDraft('')
    toast.success('IP range added', { description: v })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section title="Two-factor authentication" description="Protect sign-in with a time-based one-time code.">
        <div className="divide-y">
          <SettingRow title="Require 2FA for my account" description={twoFa ? 'Enabled with an authenticator app' : 'Use Google Authenticator, Microsoft Authenticator or 1Password'}>
            <Switch
              checked={twoFa}
              onCheckedChange={(v) => {
                if (v) setSetupOpen(true)
                else {
                  setTwoFa(false)
                  toast.success('Two-factor authentication disabled')
                }
              }}
              aria-label="Two-factor authentication"
            />
          </SettingRow>
          <SettingRow title="Enforce for all admins and HR" description="Admins, HR officers and Finance must enrol at next sign-in.">
            <Switch
              checked={enforce}
              onCheckedChange={(v) => {
                setEnforce(v)
                toast.success(v ? '2FA enforced for privileged roles' : '2FA enforcement removed')
              }}
              aria-label="Enforce 2FA"
            />
          </SettingRow>
        </div>
      </Section>

      <Section
        title="Single sign-on (SAML 2.0)"
        description="Let employees sign in with Google Workspace, Entra ID or Okta."
        action={<Badge variant={workspace.plan === 'Enterprise' ? 'soft' : 'outline'}>{workspace.plan === 'Enterprise' ? 'Included in Enterprise' : 'Enterprise plan'}</Badge>}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-1 gap-1.5">
            <Label>ACS URL</Label>
            <Input readOnly value={`https://${workspace.slug}.annexhr.com/sso/saml/acs`} className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Entity ID</Label>
            <Input readOnly value={`urn:annexhr:${workspace.slug}`} className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:col-span-2">
            <Label htmlFor="idp">Identity provider metadata URL</Label>
            <Input id="idp" placeholder="https://login.microsoftonline.com/…/federationmetadata.xml" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => toast('SSO setup requested', { description: 'Our solutions team will reach out within one business day.' })}>
            Request SSO setup
          </Button>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Password policy">
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Minimum length</Label>
                <SimpleSelect value={minLength} onValueChange={setMinLength} options={['8', '10', '12', '14', '16'].map((v) => ({ value: v, label: `${v} characters` }))} />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Password expiry</Label>
                <SimpleSelect
                  value={expiry}
                  onValueChange={setExpiry}
                  options={[
                    { value: '0', label: 'Never' },
                    { value: '60', label: 'Every 60 days' },
                    { value: '90', label: 'Every 90 days' },
                    { value: '180', label: 'Every 180 days' },
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {(
                [
                  ['upper', 'Require an uppercase letter'],
                  ['number', 'Require a number'],
                  ['symbol', 'Require a symbol'],
                  ['reuse', 'Block the last 5 passwords'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 text-sm">
                  <Checkbox checked={rules[k]} onCheckedChange={(v) => setRules({ ...rules, [k]: v === true })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Sessions">
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Idle session timeout</Label>
              <SimpleSelect
                value={timeout}
                onValueChange={(v) => {
                  setTimeout_(v)
                  toast.success('Session timeout updated')
                }}
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                  { value: '240', label: '4 hours' },
                  { value: '720', label: '12 hours' },
                ]}
              />
            </div>
            <div className="rounded-lg border bg-subtle p-3 text-[13px] text-muted-foreground">
              Payroll approval and bank-detail changes always require re-authentication, regardless of session length.
            </div>
            <Button variant="outline" className="justify-self-start" onClick={() => toast.success('All other sessions signed out', { description: '14 active sessions ended.' })}>
              Sign out all other sessions
            </Button>
          </div>
        </Section>
      </div>

      <Section
        title="IP allowlist"
        description="Restrict admin and payroll access to office and VPN networks."
        action={
          <Switch
            checked={ipOn}
            onCheckedChange={(v) => {
              setIpOn(v)
              toast.success(v ? 'IP allowlist enforced' : 'IP allowlist disabled')
            }}
            aria-label="Enforce IP allowlist"
          />
        }
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addIp()
          }}
        >
          <Input value={ipDraft} onChange={(e) => setIpDraft(e.target.value)} placeholder="e.g. 102.68.76.0/24" className="font-mono" />
          <Button type="submit" variant="outline" className="h-10 shrink-0">
            <Plus /> Add
          </Button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ips.map((ip) => (
            <li key={ip} className="inline-flex items-center gap-1 rounded-full border bg-subtle py-1 pl-3 pr-1 font-mono text-xs">
              {ip}
              <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${ip}`} onClick={() => setIps((l) => l.filter((x) => x !== ip))}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Dialog
        open={setupOpen}
        onOpenChange={(o) => {
          setSetupOpen(o)
          if (!o) setCode('')
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>Scan the code with your authenticator app, then enter the 6-digit code it shows.</DialogDescription>
          </DialogHeader>
          <FakeQr seed={workspace.slug.length * 7919 + 13} />
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Or enter this key</div>
            <div className="mt-1 font-mono text-sm tracking-widest">JBSW Y3DP EHPK 3PXP</div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="h-12 text-center font-mono text-xl tracking-[0.5em]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={verify} disabled={code.length !== 6}>
              <ShieldCheck /> Verify & enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------- Audit logs ------------------------------ */

interface AuditEvent {
  id: string
  user: string
  userSub: string
  action: string
  entity: string
  ip: string
  at: string
}

const ACTIONS: { action: string; entity: (n: string) => string }[] = [
  { action: 'Approved leave request', entity: (n) => `Leave · ${n}` },
  { action: 'Updated salary', entity: (n) => `Employee · ${n}` },
  { action: 'Signed in', entity: () => 'Session' },
  { action: 'Exported report', entity: () => 'Headcount report (xlsx)' },
  { action: 'Approved payroll run', entity: () => 'Payroll · Sep 2026' },
  { action: 'Published policy', entity: () => 'Policy · Data Protection & Privacy' },
  { action: 'Changed role', entity: (n) => `User · ${n}` },
  { action: 'Viewed KRA PIN', entity: (n) => `Employee · ${n}` },
  { action: 'Uploaded document', entity: (n) => `Contract · ${n}` },
  { action: 'Invited user', entity: (n) => `Invite · ${n.split(' ')[0]!.toLowerCase()}@…` },
  { action: 'Synced to Odoo', entity: () => 'Payroll journal · Aug 2026' },
  { action: 'Updated bank details', entity: (n) => `Employee · ${n}` },
  { action: 'Failed sign-in', entity: () => 'Session' },
]

export function AuditLogs() {
  const { employees, workspace } = useWorkspace()
  const [q, setQ] = useState('')
  const events = useMemo<AuditEvent[]>(() => {
    const rnd = prng(workspace.name.length * 104729 + 7)
    const actors = employees.filter((e) => ['company_admin', 'hr_officer', 'finance', 'ceo', 'manager'].includes(e.role))
    let t = new Date('2026-09-23T10:48:00Z').getTime()
    return Array.from({ length: 25 }, (_, i) => {
      const actor = actors[Math.floor(rnd() * actors.length)]!
      const subject = employees[Math.floor(rnd() * employees.length)]!
      const a = ACTIONS[Math.floor(rnd() * ACTIONS.length)]!
      t -= Math.floor(rnd() * 5 * 3600_000) + 6 * 60_000
      const ip = rnd() > 0.3 ? `196.201.${214 + Math.floor(rnd() * 3)}.${Math.floor(rnd() * 250) + 2}` : `41.90.${Math.floor(rnd() * 120) + 10}.${Math.floor(rnd() * 250) + 2}`
      return { id: `ev-${i}`, user: actor.name, userSub: actor.email, action: a.action, entity: a.entity(subject.name), ip, at: new Date(t).toISOString() }
    })
  }, [employees, workspace.name])

  const rows = events.filter((e) => !q || `${e.user} ${e.action} ${e.entity} ${e.ip}`.toLowerCase().includes(q.toLowerCase()))
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })

  const columns: Column<AuditEvent>[] = [
    { key: 'user', header: 'User', cell: (e) => <PersonCell name={e.user} sub={e.userSub} size="sm" />, sortValue: (e) => e.user },
    {
      key: 'action',
      header: 'Action',
      cell: (e) => <span className={cn('text-sm font-medium', e.action === 'Failed sign-in' && 'text-danger')}>{e.action}</span>,
      sortValue: (e) => e.action,
    },
    { key: 'entity', header: 'Entity', cell: (e) => <span className="text-sm text-muted-foreground">{e.entity}</span> },
    { key: 'ip', header: 'IP address', cell: (e) => <span className="font-mono text-xs">{e.ip}</span>, sortValue: (e) => e.ip },
    {
      key: 'at',
      header: 'Timestamp',
      cell: (e) => (
        <span className="whitespace-nowrap text-sm tabular text-muted-foreground">
          {formatDate(e.at)} · {time(e.at)}
        </span>
      ),
      sortValue: (e) => e.at,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search user, action, entity or IP…" className="sm:w-80" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Retained for 7 years</span>
          <ExportMenu filename={`${workspace.slug}-audit-log`} rows={rows.map((r) => ({ User: r.user, Action: r.action, Entity: r.entity, IP: r.ip, Timestamp: r.at }))} />
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} pageSize={10} empty={<EmptyState title="No matching events" description="Try a different search." />} />
    </div>
  )
}

/* -------------------------------- API keys ------------------------------- */

interface ApiKey {
  id: string
  name: string
  prefix: string
  last4: string
  scope: string
  created: string
  lastUsed: string
  status: 'Active' | 'Revoked'
}

function randomKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `ak_live_${s}`
}

export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([
    { id: 'k1', name: 'Odoo payroll sync', prefix: 'ak_live', last4: '3f9a', scope: 'payroll:write', created: '2026-03-14', lastUsed: 'Today', status: 'Active' },
    { id: 'k2', name: 'Data warehouse (read)', prefix: 'ak_live', last4: 'b21c', scope: 'read:all', created: '2026-06-02', lastUsed: '2 days ago', status: 'Active' },
    { id: 'k3', name: 'Legacy attendance bridge', prefix: 'ak_live', last4: '07de', scope: 'attendance:write', created: '2025-11-20', lastUsed: '41 days ago', status: 'Active' },
  ])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('read:all')
  const [created, setCreated] = useState<string | null>(null)

  const create = () => {
    if (!name.trim()) {
      toast.error('Name your key so you can recognise it later')
      return
    }
    const k = randomKey()
    setKeys((l) => [{ id: `k${Date.now()}`, name: name.trim(), prefix: 'ak_live', last4: k.slice(-4), scope, created: '2026-09-23', lastUsed: 'Never', status: 'Active' }, ...l])
    setCreated(k)
    toast.success('API key created')
  }

  const close = (o: boolean) => {
    setOpen(o)
    if (!o) {
      setCreated(null)
      setName('')
      setScope('read:all')
    }
  }

  return (
    <Section
      title="API keys"
      description="Server-to-server access to the Annex HR REST API. Keys inherit workspace data residency."
      action={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Create key
        </Button>
      }
      contentClassName="p-0"
    >
      <ul className="divide-y border-t">
        {keys.map((k) => (
          <li key={k.id} className={cn('flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center', k.status === 'Revoked' && 'opacity-60')}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <KeyRound className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{k.name}</span>
                  <Badge variant={k.status === 'Active' ? 'success' : 'muted'} dot>
                    {k.status}
                  </Badge>
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {k.prefix}_••••••••••••••••{k.last4}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">{k.scope}</span> · Created {formatDate(k.created)} · Last used {k.lastUsed}
                </div>
              </div>
            </div>
            {k.status === 'Active' && (
              <Button
                variant="outline"
                size="sm"
                className="self-start text-danger hover:text-danger sm:self-center"
                onClick={() => {
                  setKeys((l) => l.map((x) => (x.id === k.id ? { ...x, status: 'Revoked' } : x)))
                  toast.success(`${k.name} revoked`, { description: 'Requests using this key now return 401.' })
                }}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{created ? 'Copy your new key' : 'Create API key'}</DialogTitle>
            <DialogDescription>{created ? "This is the only time you'll see the full key. Store it in your secrets manager." : 'Scope keys narrowly and rotate them every 90 days.'}</DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="flex items-center gap-2 rounded-lg border bg-subtle p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{created}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(created).catch(() => undefined)
                  toast.success('Key copied')
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Power BI connector" />
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Scope</Label>
                <SimpleSelect
                  value={scope}
                  onValueChange={setScope}
                  options={[
                    { value: 'read:all', label: 'Read-only · all modules' },
                    { value: 'people:write', label: 'People · read & write' },
                    { value: 'payroll:write', label: 'Payroll · read & write' },
                    { value: 'attendance:write', label: 'Attendance · write' },
                  ]}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            {created ? (
              <Button onClick={() => close(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button onClick={create}>Create key</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
