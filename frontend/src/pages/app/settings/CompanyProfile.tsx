import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Copy, Globe, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { FileUploader } from '@/components/shared/FileUploader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { useWorkspace } from '@/context/auth'
import type { Workspace } from '@/data/types'

const INDUSTRIES = ['Financial Services', 'Software & IT Services', 'Healthcare', 'Manufacturing', 'Retail & E-commerce', 'NGO & Development', 'Logistics', 'Education']
const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Nigeria', 'Ghana', 'South Africa']
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+']

type Dns = 'Not configured' | 'Pending' | 'Verified'

export function CompanyProfile() {
  const { workspace } = useWorkspace()
  const [form, setForm] = useState({ name: workspace.name, industry: workspace.industry, country: workspace.country, size: workspace.size })
  const [logo, setLogo] = useState<string | null>(null)
  const [primary, setPrimary] = useState('#C1121F')
  const [secondary, setSecondary] = useState('#E63946')
  const [offices, setOffices] = useState<Workspace['offices']>(workspace.offices)
  const [office, setOffice] = useState({ city: '', country: 'Kenya', address: '' })
  const [customDomain, setCustomDomain] = useState('')
  const [dns, setDns] = useState<Dns>('Not configured')

  const verify = () => {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(customDomain.trim())) {
      toast.error('Enter a valid domain, e.g. hr.company.com')
      return
    }
    setDns('Pending')
    toast('Checking DNS records…', { description: `Looking up CNAME for ${customDomain}` })
    setTimeout(() => {
      setDns('Verified')
      toast.success('Domain verified', { description: `${customDomain} now points to your workspace. SSL issued.` })
    }, 1600)
  }

  const addOffice = () => {
    if (!office.city.trim() || !office.address.trim()) {
      toast.error('City and address are required')
      return
    }
    setOffices((o) => [...o, { ...office, city: office.city.trim(), address: office.address.trim(), headcount: 0 }])
    setOffice({ city: '', country: 'Kenya', address: '' })
    toast.success('Office added', { description: `${office.city}, ${office.country}` })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Section
        title="Company details"
        description="Shown on payslips, offer letters and the employee portal."
        action={
          <Button size="sm" onClick={() => toast.success('Company profile saved')}>
            Save changes
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="co-name">Company name</Label>
            <Input id="co-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Industry</Label>
            <SimpleSelect value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })} options={Array.from(new Set([workspace.industry, ...INDUSTRIES]))} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Country of registration</Label>
            <SimpleSelect value={form.country} onValueChange={(v) => setForm({ ...form, country: v })} options={COUNTRIES} />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Company size</Label>
            <SimpleSelect value={form.size} onValueChange={(v) => setForm({ ...form, size: v })} options={SIZES} />
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Logo" description="Square PNG or SVG, at least 256×256.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border bg-subtle">
              <div className="flex size-12 items-center justify-center rounded-xl text-xl font-bold text-white" style={{ background: primary }}>
                {workspace.logoText}
              </div>
              <span className="max-w-[88px] truncate text-[10px] text-muted-foreground">{logo ?? 'Default mark'}</span>
            </div>
            <FileUploader
              compact
              multiple={false}
              accept="image/*"
              label="Upload new logo"
              className="min-w-0 flex-1"
              onComplete={(files) => {
                setLogo(files[0]?.name ?? null)
                toast.success('Logo updated', { description: files[0]?.name })
              }}
            />
          </div>
        </Section>

        <Section title="Brand colours" description="Applied to emails, the careers page and employee portal.">
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['Primary', primary, setPrimary],
                  ['Secondary', secondary, setSecondary],
                ] as const
              ).map(([label, value, set]) => (
                <label key={label} className="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/40">
                  <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border" style={{ background: value }}>
                    <input type="color" value={value} onChange={(e) => set(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={`${label} colour`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className="block font-mono text-xs uppercase text-muted-foreground">{value}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="rounded-lg border bg-subtle p-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live preview</div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="h-9 rounded-lg px-4 text-sm font-medium text-white shadow-sm" style={{ background: primary }}>
                  Accept offer
                </button>
                <button type="button" className="h-9 rounded-lg border-2 px-4 text-sm font-medium" style={{ borderColor: secondary, color: secondary }}>
                  View policy
                </button>
                <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Office locations" description="Used for holiday calendars, attendance geofences and payroll entities.">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {offices.map((o) => (
              <motion.li
                key={o.city + o.address}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <MapPin className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {o.city}, {o.country}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{o.address}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{o.headcount} people</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${o.city}`}
                  disabled={offices.length === 1}
                  onClick={() => {
                    setOffices((list) => list.filter((x) => x !== o))
                    toast.success(`${o.city} office removed`)
                  }}
                >
                  <Trash2 />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <Input value={office.city} onChange={(e) => setOffice({ ...office, city: e.target.value })} placeholder="City" aria-label="City" />
          <SimpleSelect value={office.country} onValueChange={(v) => setOffice({ ...office, country: v })} options={COUNTRIES} />
          <Input value={office.address} onChange={(e) => setOffice({ ...office, address: e.target.value })} placeholder="Building, street" aria-label="Address" />
          <Button variant="outline" className="h-10" onClick={addOffice}>
            <Plus /> Add office
          </Button>
        </div>
      </Section>

      <Section title="Workspace domain" description="Where your team signs in.">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2 rounded-lg border bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-sm">{workspace.slug}.annexhr.com</span>
              <Badge variant="success" dot>
                Active
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(`https://${workspace.slug}.annexhr.com`).catch(() => undefined)
                toast.success('Link copied')
              }}
            >
              <Copy /> Copy link
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="custom-domain">Custom domain</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="custom-domain"
                value={customDomain}
                onChange={(e) => {
                  setCustomDomain(e.target.value)
                  setDns('Not configured')
                }}
                placeholder={`hr.${workspace.slug}.com`}
              />
              <Button variant="outline" className="h-10 shrink-0" onClick={verify} disabled={dns === 'Pending'}>
                <RefreshCw className={dns === 'Pending' ? 'animate-spin' : undefined} /> Verify DNS
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-3 py-2.5 font-mono text-xs">CNAME</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{customDomain.split('.')[0] || 'hr'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">edge.annexhr.com</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={dns === 'Verified' ? 'success' : dns === 'Pending' ? 'warning' : 'muted'} dot>
                      {dns === 'Verified' && <CircleCheck />}
                      {dns}
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
