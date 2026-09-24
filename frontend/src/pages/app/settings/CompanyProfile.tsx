import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/shared/Section'
import { FileUploader } from '@/components/shared/FileUploader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { useAuth, useWorkspace } from '@/context/auth'
import type { Workspace } from '@/data/types'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { apiAssetUrl, contrast, DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_SECONDARY, hexToRgb, isDefaultBrand } from '@/lib/branding'
import { isAdminLike } from '@/lib/rbac'
import { LOGO_ACCEPT, removeLogo, replaceOffices, updateWorkspace, uploadLogo, verifyDomain, getWorkspaceSettings, type DomainCheck } from './workspaceSettingsApi'

const INDUSTRIES = ['Financial Services', 'Software & IT Services', 'Healthcare', 'Manufacturing', 'Retail & E-commerce', 'NGO & Development', 'Logistics', 'Education']
const COUNTRIES = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Nigeria', 'Ghana', 'South Africa']
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+']
const APP_DOMAIN = ((import.meta.env.VITE_APP_DOMAIN as string | undefined) ?? 'annexhr.com').toLowerCase()
const DEFAULT_TARGET = 'cname.annexhr.com'
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/

type DetailsForm = Pick<Workspace, 'name' | 'industry' | 'country' | 'size'>

export function CompanyProfile() {
  const { workspace } = useWorkspace()
  // Remount per workspace so form state never leaks across a workspace switch.
  return <CompanyProfileForm key={workspace.id} />
}

function copy(text: string, what: string) {
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(`${what} copied`))
    .catch(() => toast.error('Copy failed — select the text instead'))
}

function CompanyProfileForm() {
  const { workspace, role } = useWorkspace()
  const { refresh } = useAuth()
  const canEdit = isAdminLike(role)
  const [target, setTarget] = useState(DEFAULT_TARGET)

  useEffect(() => {
    if (!canEdit || USE_MOCK_API) return
    let cancelled = false
    getWorkspaceSettings()
      .then((s) => !cancelled && setTarget(s.customDomainTarget))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [canEdit])

  return (
    <div className="grid grid-cols-1 gap-4">
      <DetailsSection workspace={workspace} canEdit={canEdit} refresh={refresh} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LogoSection workspace={workspace} canEdit={canEdit} refresh={refresh} />
        <BrandSection workspace={workspace} canEdit={canEdit} refresh={refresh} />
      </div>
      <OfficesSection workspace={workspace} canEdit={canEdit} refresh={refresh} />
      <DomainSection workspace={workspace} canEdit={canEdit} refresh={refresh} target={target} onTarget={setTarget} />
    </div>
  )
}

interface SectionProps {
  workspace: Workspace
  canEdit: boolean
  refresh: () => Promise<void>
}

function DetailsSection({ workspace, canEdit, refresh }: SectionProps) {
  const initial: DetailsForm = { name: workspace.name, industry: workspace.industry, country: workspace.country, size: workspace.size }
  const [form, setForm] = useState<DetailsForm>(initial)
  const [saving, setSaving] = useState(false)
  const dirty = (Object.keys(initial) as (keyof DetailsForm)[]).some((k) => form[k].trim() !== initial[k])
  const valid = form.name.trim().length >= 2

  const save = async () => {
    setSaving(true)
    try {
      const ws = await updateWorkspace({ name: form.name.trim(), industry: form.industry, country: form.country, size: form.size })
      await refresh()
      setForm({ name: ws.name, industry: ws.industry, country: ws.country, size: ws.size })
      toast.success('Company profile saved')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Company details"
      description="Shown on payslips, offer letters and the employee portal."
      action={
        canEdit && (
          <Button size="sm" onClick={() => void save()} disabled={!dirty || !valid || saving}>
            {saving && <Loader2 className="animate-spin" />} Save changes
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor="co-name">Company name</Label>
          <Input id="co-name" value={form.name} maxLength={120} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!valid} />
          {!valid && <p className="text-xs text-danger">Enter at least 2 characters.</p>}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Industry</Label>
          <SimpleSelect value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })} options={Array.from(new Set([workspace.industry, ...INDUSTRIES]))} />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Country of registration</Label>
          <SimpleSelect value={form.country} onValueChange={(v) => setForm({ ...form, country: v })} options={Array.from(new Set([workspace.country, ...COUNTRIES]))} />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label>Company size</Label>
          <SimpleSelect value={form.size} onValueChange={(v) => setForm({ ...form, size: v })} options={Array.from(new Set([workspace.size, ...SIZES]))} />
        </div>
      </div>
    </Section>
  )
}

function LogoSection({ workspace, canEdit, refresh }: SectionProps) {
  const [removing, setRemoving] = useState(false)
  const src = apiAssetUrl(workspace.logoUrl)

  const remove = async () => {
    setRemoving(true)
    try {
      await removeLogo()
      await refresh()
      toast.success('Logo removed', { description: 'Your workspace shows its letter mark again.' })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Section title="Logo" description="Square PNG, JPG, WEBP or SVG, at least 256×256. Shown in the sidebar and on your sign-in page.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border bg-white p-2">
            {src ? (
              <img src={src} alt={`${workspace.name} logo`} className="size-full object-contain" />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">{workspace.logoText}</div>
            )}
          </div>
          {src && canEdit ? (
            <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={removing}>
              {removing && <Loader2 className="animate-spin" />} Remove logo
            </Button>
          ) : (
            <span className="text-[11px] text-muted-foreground">{src ? 'Custom logo' : 'Default mark'}</span>
          )}
        </div>
        {canEdit && (
          <FileUploader
            compact
            multiple={false}
            accept={LOGO_ACCEPT}
            label={src ? 'Replace logo' : 'Upload logo'}
            hint="PNG, JPG, WEBP or SVG up to 2 MB"
            className="min-w-0 flex-1"
            upload={(file, onProgress) => uploadLogo(file, onProgress)}
            onUploaded={() => {
              void refresh().then(() => toast.success('Logo updated', { description: 'Everyone in the workspace will see it on their next page load.' }))
            }}
          />
        )}
      </div>
    </Section>
  )
}

function BrandSection({ workspace, canEdit, refresh }: SectionProps) {
  const saved = { primary: (workspace.brandPrimary ?? DEFAULT_BRAND_PRIMARY).toUpperCase(), secondary: (workspace.brandSecondary ?? DEFAULT_BRAND_SECONDARY).toUpperCase() }
  const [primary, setPrimary] = useState(saved.primary)
  const [secondary, setSecondary] = useState(saved.secondary)
  const [saving, setSaving] = useState(false)
  const dirty = primary.toUpperCase() !== saved.primary || secondary.toUpperCase() !== saved.secondary
  const rgb = hexToRgb(primary)
  const lowContrast = rgb ? contrast(rgb, [255, 255, 255]) < 4.5 : false

  const save = async (p: string, s: string, message: string) => {
    setSaving(true)
    try {
      const ws = await updateWorkspace({ brandPrimary: p, brandSecondary: s })
      await refresh()
      setPrimary(ws.brandPrimary ?? p)
      setSecondary(ws.brandSecondary ?? s)
      toast.success(message)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Brand colours"
      description="Applied to the app for everyone in your workspace."
      action={
        canEdit && (
          <Button size="sm" onClick={() => void save(primary.toUpperCase(), secondary.toUpperCase(), 'Brand colours saved')} disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        )
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['Primary', primary, setPrimary],
              ['Secondary', secondary, setSecondary],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${canEdit ? 'cursor-pointer hover:bg-muted/40' : 'opacity-80'}`}>
              <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border" style={{ background: value }}>
                <input
                  type="color"
                  value={value.toLowerCase()}
                  disabled={!canEdit}
                  onChange={(e) => set(e.target.value.toUpperCase())}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`${label} colour`}
                />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{label}</span>
                <span className="block font-mono text-xs uppercase text-muted-foreground">{value}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="rounded-lg border bg-subtle p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white shadow-sm" style={{ background: primary }}>
              Approve leave
            </span>
            <span className="inline-flex h-9 items-center rounded-lg border-2 bg-card px-4 text-sm font-medium" style={{ borderColor: secondary }}>
              View policy
            </span>
            <span className="h-2 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
          </div>
          {lowContrast && <p className="mt-3 text-xs text-muted-foreground">This colour is light, so text and icons use a slightly deeper shade to stay readable.</p>}
        </div>
        {canEdit && !isDefaultBrand(saved.primary, saved.secondary) && (
          <div>
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save(DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_SECONDARY, 'Brand colours reset to the Annex default')}>
              Reset to default
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}

function OfficesSection({ workspace, canEdit, refresh }: SectionProps) {
  const offices = workspace.offices
  const [office, setOffice] = useState({ city: '', country: 'Kenya', address: '' })
  const [busy, setBusy] = useState(false)

  const persist = async (next: Workspace['offices'], message: string) => {
    setBusy(true)
    try {
      await replaceOffices(next)
      await refresh()
      toast.success(message)
      return true
    } catch (err) {
      toast.error(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const addOffice = async () => {
    const city = office.city.trim()
    const address = office.address.trim()
    if (!city || !address) {
      toast.error('City and address are required')
      return
    }
    if (offices.some((o) => o.city.toLowerCase() === city.toLowerCase() && o.address.toLowerCase() === address.toLowerCase())) {
      toast.error('That office is already listed')
      return
    }
    if (await persist([...offices, { city, country: office.country, address, headcount: 0 }], `${city} office added`)) setOffice({ city: '', country: 'Kenya', address: '' })
  }

  return (
    <Section title="Office locations" description="Used for holiday calendars, attendance geofences and payroll entities.">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {offices.map((o, i) => (
            <motion.li
              key={`${o.city}|${o.address}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {o.city}, {o.country}
                </div>
                <div className="truncate text-xs text-muted-foreground">{o.address}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {o.headcount} {o.headcount === 1 ? 'person' : 'people'}
                </div>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${o.city}`}
                  disabled={offices.length === 1 || busy}
                  onClick={() => void persist(offices.filter((_, j) => j !== i), `${o.city} office removed`)}
                >
                  <Trash2 />
                </Button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {canEdit && (
        <form
          className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            void addOffice()
          }}
        >
          <Input value={office.city} maxLength={80} onChange={(e) => setOffice({ ...office, city: e.target.value })} placeholder="City" aria-label="City" />
          <SimpleSelect value={office.country} onValueChange={(v) => setOffice({ ...office, country: v })} options={COUNTRIES} />
          <Input value={office.address} maxLength={200} onChange={(e) => setOffice({ ...office, address: e.target.value })} placeholder="Building, street" aria-label="Address" />
          <Button type="submit" variant="outline" className="h-10" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Add office
          </Button>
        </form>
      )}
    </Section>
  )
}

type DnsStatus = 'Not configured' | 'Pending DNS' | 'Verified'

function DomainSection({ workspace, canEdit, refresh, target, onTarget }: SectionProps & { target: string; onTarget: (t: string) => void }) {
  const address = `https://${workspace.slug}.${APP_DOMAIN}`
  const localAddress = `http://${workspace.slug}.localhost:${window.location.port || '5173'}`
  const savedDomain = workspace.customDomain ?? ''
  const [domain, setDomain] = useState(savedDomain)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<DomainCheck | null>(null)
  const draft = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
  const dirty = draft !== savedDomain
  const draftValid = !draft || HOSTNAME.test(draft)
  const status: DnsStatus = !savedDomain ? 'Not configured' : workspace.customDomainVerified ? 'Verified' : 'Pending DNS'

  const save = async (value: string | null) => {
    setSaving(true)
    try {
      const ws = await updateWorkspace({ customDomain: value })
      onTarget(ws.customDomainTarget)
      await refresh()
      setDomain(ws.customDomain ?? '')
      setCheck(null)
      toast.success(value ? 'Custom domain saved' : 'Custom domain removed', value ? { description: `Add the CNAME record below, then check DNS.` } : undefined)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const runCheck = async () => {
    setChecking(true)
    try {
      const res = await verifyDomain()
      onTarget(res.target)
      setCheck(res)
      await refresh()
      if (res.verified) toast.success('Domain verified', { description: `${res.domain} points to ${res.target}.` })
      else toast('DNS not ready yet', { description: res.found.length ? `${res.domain} points to ${res.found.join(', ')}` : `No CNAME record found for ${res.domain}.` })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Section title="Workspace address" description="Where your team signs in.">
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-1 gap-2 rounded-lg border bg-subtle p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-sm">{address}</span>
              <Badge variant="muted">Reserved</Badge>
            </div>
            <Button variant="ghost" size="sm" className="self-start sm:self-auto" onClick={() => copy(address, 'Address')}>
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your team will sign in here once Annex HR is live on this domain. In local development, open{' '}
            <a href={localAddress} className="font-mono text-foreground underline underline-offset-2">
              {localAddress}
            </a>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="custom-domain">Custom domain</Label>
            <Badge variant={status === 'Verified' ? 'success' : status === 'Pending DNS' ? 'warning' : 'muted'} dot>
              {status}
            </Badge>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (dirty && draftValid) void save(draft || null)
            }}
          >
            <Input id="custom-domain" value={domain} disabled={!canEdit} onChange={(e) => setDomain(e.target.value)} placeholder="hr.company.com" aria-invalid={!draftValid} />
            {canEdit && (
              <div className="flex shrink-0 gap-2">
                <Button type="submit" variant="outline" className="h-10 flex-1 sm:flex-none" disabled={!dirty || !draftValid || saving}>
                  {saving && <Loader2 className="animate-spin" />} Save
                </Button>
                <Button type="button" variant="outline" className="h-10 flex-1 sm:flex-none" onClick={() => void runCheck()} disabled={!savedDomain || dirty || checking}>
                  {checking && <Loader2 className="animate-spin" />} Check DNS
                </Button>
              </div>
            )}
          </form>
          {!draftValid ? (
            <p className="text-xs text-danger">Enter a hostname like hr.company.com — no https:// or paths.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Optional. Use a subdomain your company controls, e.g. hr.company.com.</p>
          )}
        </div>

        {savedDomain && (
          <div className="grid grid-cols-1 gap-2">
            <div className="text-[13px] font-medium">Add this record at your DNS provider</div>
            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[auto_1fr_1fr] sm:items-center sm:gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Type</div>
                <div className="font-mono text-xs">CNAME</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Host</div>
                <div className="break-all font-mono text-xs">{savedDomain}</div>
              </div>
              <div className="flex min-w-0 items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Points to</div>
                  <div className="break-all font-mono text-xs">{target}</div>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Copy CNAME target" onClick={() => copy(target, 'Target')}>
                  <Copy />
                </Button>
              </div>
            </div>
            {check && !check.verified && (
              <p className="text-xs text-muted-foreground">
                {check.found.length ? (
                  <>
                    {check.domain} currently points to <span className="font-mono">{check.found.join(', ')}</span>, not <span className="font-mono">{check.target}</span>.
                  </>
                ) : (
                  <>No CNAME record found for {check.domain} yet. DNS changes can take up to 48 hours to appear.</>
                )}
              </p>
            )}
            {status === 'Verified' && <p className="text-xs text-muted-foreground">DNS is set up. Your team can use {savedDomain} once Annex HR serves it.</p>}
            {canEdit && (
              <div>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => void save(null)}>
                  Remove custom domain
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
