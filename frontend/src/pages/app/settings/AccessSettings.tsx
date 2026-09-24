import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/context/auth'
import type { Role } from '@/data/types'
import { navItems, roleDescriptions, roleLabels } from '@/lib/rbac'
import { cn } from '@/lib/utils'

const ROLES = Object.keys(roleLabels) as Role[]

/* --------------------------- Roles & permissions -------------------------- */

export function RolesPermissions() {
  const { switchRole, role: current, demoSession } = useAuth()
  const navigate = useNavigate()
  const [matrix, setMatrix] = useState<Record<string, Role[]>>(() =>
    Object.fromEntries(navItems.map((n) => [n.key, n.roles === 'all' ? [...ROLES] : [...n.roles]])),
  )
  const [dirty, setDirty] = useState(false)

  const toggle = (key: string, role: Role, on: boolean) => {
    setMatrix((m) => ({ ...m, [key]: on ? [...(m[key] ?? []), role] : (m[key] ?? []).filter((r) => r !== role) }))
    setDirty(true)
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title="Permission matrix"
        description="Which roles can open each module. Changes apply at next sign-in."
        contentClassName="p-0"
        action={
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setDirty(false)
              toast.success('Permissions saved', { description: 'Audit log entry created.' })
            }}
          >
            Save
          </Button>
        }
      >
        <div className="overflow-x-auto border-t scrollbar-thin">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/90 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">Module</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-2 py-2.5 text-center text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                    {roleLabels[r].replace(' (HR)', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {navItems.map((n) => {
                return (
                  <tr key={n.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                      <span className="font-medium">{n.label}</span>
                    </td>
                    {ROLES.map((r) => {
                      const locked = r === 'super_admin' || (n.key === 'dashboard')
                      return (
                        <td key={r} className="px-2 py-2.5 text-center">
                          <Checkbox
                            checked={matrix[n.key]?.includes(r) ?? false}
                            disabled={locked}
                            onCheckedChange={(v) => toggle(n.key, r, v === true)}
                            aria-label={`${roleLabels[r]} can access ${n.label}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {demoSession && (
      <Section title="Preview as role" description="See Annex HR exactly as each role does. Your admin session is kept.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((r, i) => (
            <motion.button
              key={r}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ y: -2 }}
              onClick={() => {
                switchRole(r)
                  .then(() => {
                    navigate('/app')
                    toast.success(`Previewing as ${roleLabels[r]}`, { description: 'Switch back any time from the account menu.' })
                  })
                  .catch((err: Error) => toast.error(err.message))
              }}
              className={cn('group flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30', current === r && 'border-primary/50 bg-accent/40')}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {roleLabels[r]}
                  {current === r && <Badge variant="soft">Current</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{roleDescriptions[r]}</div>
              </div>
            </motion.button>
          ))}
        </div>
      </Section>
      )}
    </div>
  )
}

/* ------------------------------ Integrations ----------------------------- */

interface Integration {
  id: string
  name: string
  category: string
  description: string
  connected: boolean
  enabled: boolean
  lastSync?: string
  placeholder?: boolean
}

const INTEGRATIONS: Integration[] = [
  { id: 'odoo', name: 'Odoo', category: 'Payroll & accounting', description: 'Post approved payroll journals, final dues and expense claims to Odoo Accounting.', connected: true, enabled: true, lastSync: 'Today, 07:42' },
  { id: 'itax', name: 'KRA iTax', category: 'Statutory', description: 'Generate P10 returns and PAYE schedules ready for iTax upload.', connected: false, enabled: false, placeholder: true },
  { id: 'mpesa', name: 'M-Pesa B2C', category: 'Payouts', description: 'Pay casuals, consultants and reimbursements straight to M-Pesa wallets.', connected: true, enabled: true, lastSync: 'Yesterday, 18:05' },
  { id: 'google', name: 'Google Workspace', category: 'Identity & email', description: 'Provision accounts on hire and suspend them on exit. Sync org units.', connected: true, enabled: true, lastSync: 'Today, 09:10' },
  { id: 'm365', name: 'Microsoft 365', category: 'Identity & email', description: 'Entra ID user provisioning and Outlook calendar sync for leave.', connected: false, enabled: false },
  { id: 'slack', name: 'Slack', category: 'Collaboration', description: 'Approve leave from Slack, post birthdays and new-joiner announcements.', connected: false, enabled: false },
  { id: 'bio', name: 'Biometric clock-in', category: 'Time & attendance', description: 'ZKTeco and Suprema terminals push clock-ins every 5 minutes.', connected: true, enabled: true, lastSync: '4 min ago' },
]

export function Integrations() {
  const [items, setItems] = useState(INTEGRATIONS)
  const [busy, setBusy] = useState<string | null>(null)

  const connect = (it: Integration) => {
    if (it.placeholder) {
      toast('Coming soon', { description: `${it.name} is in private beta. We'll notify you when it's live.` })
      return
    }
    setBusy(it.id)
    setTimeout(() => {
      setItems((l) => l.map((x) => (x.id === it.id ? { ...x, connected: true, enabled: true, lastSync: 'Just now' } : x)))
      setBusy(null)
      toast.success(`${it.name} connected`)
    }, 1100)
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it, i) => {
        return (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -2 }}
            className="flex flex-col rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold tracking-tight">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.category}</div>
              </div>
              {it.connected ? (
                <Switch
                  checked={it.enabled}
                  aria-label={`Toggle ${it.name}`}
                  onCheckedChange={(v) => {
                    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, enabled: v } : x)))
                    toast.success(`${it.name} ${v ? 'resumed' : 'paused'}`)
                  }}
                />
              ) : null}
            </div>
            <p className="mt-3 flex-1 text-[13px] text-muted-foreground">{it.description}</p>
            <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
              {it.connected ? (
                <>
                  <div className="min-w-0">
                    <Badge variant={it.enabled ? 'success' : 'muted'} dot>
                      {it.enabled ? 'Connected' : 'Paused'}
                    </Badge>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">Last sync {it.lastSync}</div>
                  </div>
                  <Button variant="ghost" size="sm" disabled={!it.enabled} onClick={() => toast.success(`${it.name} sync started`)}>
                    Sync now
                  </Button>
                </>
              ) : (
                <>
                  <Badge variant={it.placeholder ? 'outline' : 'muted'}>{it.placeholder ? 'Beta' : 'Not connected'}</Badge>
                  <Button size="sm" variant={it.placeholder ? 'outline' : 'default'} disabled={busy === it.id} onClick={() => connect(it)}>
                    {busy === it.id ? 'Connecting…' : it.placeholder ? 'Join waitlist' : 'Connect'}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
