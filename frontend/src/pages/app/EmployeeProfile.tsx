import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { ApiError, errorMessage, USE_MOCK_API } from '@/lib/api'
import { deleteFile, FILE_ACCEPT, FILE_CATEGORIES, uploadFile, type EmployeeFile, type FileCategory } from '@/lib/files'
import { roleLabels } from '@/lib/rbac'
import { cn, daysUntil, formatDate, formatKES } from '@/lib/utils'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { FileUploader } from '@/components/shared/FileUploader'
import { PersonCell } from '@/components/shared/PersonCell'
import { Section } from '@/components/shared/Section'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { StoredFileCard } from '@/components/shared/StoredFileCard'
import { Timeline, type TimelineItem } from '@/components/shared/Timeline'
import { isSelfRole } from './onboarding/util'
import { addDays, tenure } from './people/helpers'
import { saveProfile, useEmployeeProfile, type EmployeeProfileData, type ProfileFields } from './people/profileApi'

const TABS = ['personal', 'job', 'statutory', 'emergency', 'documents', 'onboarding', 'leave', 'timeline'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  personal: 'Personal',
  job: 'Job & pay',
  statutory: 'Statutory & bank',
  emergency: 'Emergency contact',
  documents: 'Documents',
  onboarding: 'Onboarding',
  leave: 'Leave',
  timeline: 'Timeline',
}

const BANKS = ['KCB', 'Equity', 'NCBA', 'Co-op', 'Stanbic', 'Absa', 'I&M', 'Family Bank', 'DTB', 'Standard Chartered']
const ANNUAL_ENTITLEMENT = 21

export default function EmployeeProfile() {
  const { id = '' } = useParams()
  const { user, role } = useWorkspace()
  // Employees and consultants only ever see their own profile.
  if (isSelfRole(role) && id !== user.id) return <Navigate to={`/app/people/${user.id}`} replace />
  return <ProfileView key={id} id={id} />
}

// ── Field helpers ────────────────────────────────────────────────────
function Field({ label, children, mono, className }: { label: string; children?: React.ReactNode; mono?: boolean; className?: string }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm', mono && 'font-mono tabular', empty && 'text-muted-foreground')}>{empty ? '—' : children}</dd>
    </div>
  )
}

function Fields({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
}

function EditButton({ onClick, label = 'Edit' }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      {label}
    </Button>
  )
}

interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'select'
  options?: string[]
  placeholder?: string
  mono?: boolean
  full?: boolean
}

interface EditSpec {
  title: string
  description?: string
  fields: FieldDef[]
}

function EditDialog({
  spec,
  initial,
  onOpenChange,
  onSave,
}: {
  spec: EditSpec | null
  initial: Record<string, string>
  onOpenChange: (open: boolean) => void
  onSave: (patch: Record<string, string | null>) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (spec) {
      setValues(initial)
      setErrors({})
    }
    // Reset only when a dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!spec) return
    const patch: Record<string, string | null> = {}
    for (const f of spec.fields) {
      const next = (values[f.key] ?? '').trim()
      if (next !== (initial[f.key] ?? '').trim()) patch[f.key] = next || null
    }
    if (!Object.keys(patch).length) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    setErrors({})
    try {
      await onSave(patch)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const map: Record<string, string> = {}
        for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message.replace(/^String should match pattern.*/, 'Check the format')
        setErrors(map)
      }
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!spec} onOpenChange={onOpenChange}>
      <DialogContent>
        {spec && (
          <form onSubmit={submit} className="grid grid-cols-1 gap-5">
            <DialogHeader>
              <DialogTitle>{spec.title}</DialogTitle>
              {spec.description && <DialogDescription>{spec.description}</DialogDescription>}
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {spec.fields.map((f) => (
                <div key={f.key} className={cn('grid grid-cols-1 gap-1.5', f.full && 'sm:col-span-2')}>
                  <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                  {f.type === 'select' ? (
                    <SimpleSelect
                      value={values[f.key] || undefined}
                      onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                      options={values[f.key] && !f.options!.includes(values[f.key]!) ? [...f.options!, values[f.key]!] : f.options!}
                      placeholder="Select"
                    />
                  ) : (
                    <Input
                      id={`f-${f.key}`}
                      type={f.type ?? 'text'}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className={cn(f.mono && 'font-mono')}
                      autoComplete="off"
                    />
                  )}
                  {errors[f.key] && <p className="text-xs text-danger">{errors[f.key]}</p>}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Page ─────────────────────────────────────────────────────────────
type EditKey = 'personal' | 'job' | 'statutory' | 'bank' | 'emergency'

function ProfileView({ id }: { id: string }) {
  const ws = useWorkspace()
  const { refresh } = useAuth()
  const { data, setData, error, loading, reload } = useEmployeeProfile(id, ws)
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<EditKey | null>(null)
  const directory = !isSelfRole(ws.role)

  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'personal'
  const setTab = (t: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', t)
    next.delete('edit')
    setParams(next, { replace: true })
  }

  // "Edit profile" from the People drawer opens the personal details editor.
  useEffect(() => {
    if (params.get('edit') === '1' && data) setEditing(data.access.canEdit ? 'personal' : data.access.canEditAll ? 'job' : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.access.canEdit])

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4" aria-busy="true">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <EmptyState
        title={error?.status === 403 ? 'This profile is private' : error?.status === 404 ? 'Employee not found' : 'Couldn’t load this profile'}
        description={error?.status === 403 ? 'Only HR, leadership and the employee can open it.' : error?.message}
        action={
          directory ? (
            <Button variant="outline" asChild>
              <Link to="/app/people">
                Back to People
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void reload()}>
              Try again
            </Button>
          )
        }
      />
    )
  }

  const { employee: emp, profile: p, access } = data

  const save = async (patch: Record<string, string | null>) => {
    if (USE_MOCK_API) {
      const empKeys = ['phone', 'birthday', 'title', 'location', 'gender', 'kraPin', 'nationalId']
      setData((d) => {
        if (!d) return d
        const e = { ...d.employee } as Record<string, unknown>
        const prof = { ...d.profile } as Record<string, unknown>
        for (const [k, v] of Object.entries(patch)) (empKeys.includes(k) ? e : prof)[k] = v ?? (empKeys.includes(k) ? '' : null)
        return { ...d, employee: e as unknown as Employee, profile: prof as ProfileFields }
      })
    } else {
      setData(await saveProfile(emp.id, access.isSelf, patch))
      void refresh()
    }
    toast.success(access.isSelf ? 'Your profile is updated' : `${emp.name.split(' ')[0]}’s profile is updated`)
  }

  const specs: Record<EditKey, EditSpec> = {
    personal: {
      title: 'Personal details',
      description: access.isSelf ? 'Keep your contact details current — HR sees changes straight away.' : `Editing ${emp.name}`,
      fields: [
        { key: 'preferredName', label: 'Preferred name', placeholder: emp.name.split(' ')[0] },
        { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+254 7XX XXX XXX' },
        { key: 'personalEmail', label: 'Personal email', type: 'email', placeholder: 'name@gmail.com' },
        { key: 'birthday', label: 'Date of birth', type: 'date' },
        { key: 'maritalStatus', label: 'Marital status', type: 'select', options: ['Single', 'Married', 'Divorced', 'Widowed', 'Prefer not to say'] },
        { key: 'nationality', label: 'Nationality', placeholder: 'Kenyan' },
        { key: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male'] },
        { key: 'city', label: 'City / town', placeholder: 'Nairobi' },
        { key: 'address', label: 'Home address', placeholder: 'Street, estate, house no.', full: true },
      ],
    },
    job: {
      title: 'Job details',
      description: 'Department, manager, status and pay changes go through the People directory and payroll.',
      fields: [
        { key: 'title', label: 'Job title', full: true },
        { key: 'location', label: 'Work location', placeholder: 'Nairobi HQ', full: true },
      ],
    },
    statutory: {
      title: 'Statutory numbers',
      description: 'Used for PAYE, SHIF, NSSF and Housing Levy filings.',
      fields: [
        { key: 'kraPin', label: 'KRA PIN', placeholder: 'A123456789B', mono: true },
        { key: 'nationalId', label: 'National ID', placeholder: '12345678', mono: true },
        { key: 'shifNumber', label: 'SHIF number', mono: true },
        { key: 'nssfNumber', label: 'NSSF number', mono: true },
        { key: 'passportNumber', label: 'Passport number', mono: true },
      ],
    },
    bank: {
      title: 'Bank details',
      description: 'Salary is paid into this account. Finance verifies changes before the next payroll run.',
      fields: [
        { key: 'bankName', label: 'Bank', type: 'select', options: BANKS },
        { key: 'bankBranch', label: 'Branch', placeholder: 'Westlands' },
        { key: 'bankAccountName', label: 'Account name', placeholder: emp.name },
        { key: 'bankAccountNumber', label: 'Account number', placeholder: '0123456789', mono: true },
      ],
    },
    emergency: {
      title: 'Emergency contact',
      fields: [
        { key: 'emergencyName', label: 'Full name', placeholder: 'Grace Wanjiru', full: true },
        { key: 'emergencyRelationship', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Sibling', 'Partner', 'Child', 'Friend', 'Other'] },
        { key: 'emergencyPhone', label: 'Phone', type: 'tel', placeholder: '+254 7XX XXX XXX' },
      ],
    },
  }

  const initialFor = (key: EditKey | null): Record<string, string> => {
    if (!key) return {}
    const src: Record<string, unknown> = { ...p, ...emp }
    return Object.fromEntries(specs[key].fields.map((f) => [f.key, typeof src[f.key] === 'string' ? (src[f.key] as string) : '']))
  }

  const canEditBank = access.canEdit && access.bank === 'full'

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {directory && (
        <Link to="/app/people" className="inline-flex items-center gap-1.5 justify-self-start text-sm text-muted-foreground hover:text-foreground">
          <span aria-hidden>←</span> People
        </Link>
      )}

      <ProfileHeader data={data} directory={directory} onEdit={access.canEdit ? () => setEditing('personal') : access.canEditAll ? () => setEditing('job') : undefined} />

      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList className="w-full justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="personal">
          <Section title="Personal details" description={access.isSelf ? 'Only you, HR and your manager can see this.' : undefined} action={access.canEdit && <EditButton onClick={() => setEditing('personal')} />}>
            <Fields>
              <Field label="Full name">{emp.name}</Field>
              <Field label="Preferred name">{p.preferredName}</Field>
              <Field label="Work email">
                <a href={`mailto:${emp.email}`} className="text-primary hover:underline">
                  {emp.email}
                </a>
              </Field>
              <Field label="Phone">{emp.phone}</Field>
              <Field label="Personal email">{p.personalEmail}</Field>
              <Field label="Date of birth">{emp.birthday ? formatDate(emp.birthday) : ''}</Field>
              <Field label="Gender">{emp.gender}</Field>
              <Field label="Marital status">{p.maritalStatus}</Field>
              <Field label="Nationality">{p.nationality}</Field>
              <Field label="City / town">{p.city}</Field>
              <Field label="Home address" className="sm:col-span-2">
                {p.address}
              </Field>
            </Fields>
          </Section>
        </TabsContent>

        <TabsContent value="job" className="grid grid-cols-1 gap-4">
          <Section title="Employment" action={access.canEditAll && <EditButton onClick={() => setEditing('job')} />}>
            <Fields>
              <Field label="Job title">{emp.title}</Field>
              <Field label="Department">
                {data.department && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: data.department.color }} />
                    {data.department.name}
                  </span>
                )}
              </Field>
              <Field label="Manager">{data.manager?.name}</Field>
              <Field label="Employment type">{emp.employmentType}</Field>
              <Field label="Access role">{roleLabels[emp.role]}</Field>
              <Field label="Status">
                <StatusBadge status={emp.status} />
              </Field>
              <Field label="Start date">{formatDate(emp.startDate)}</Field>
              <Field label="Tenure">{tenure(emp.startDate)}</Field>
              <Field label="Probation ends">{emp.probationEnd ? formatDate(emp.probationEnd) : ''}</Field>
              <Field label="Work location">{emp.location}</Field>
              <Field label="Employee no.">{emp.employeeNo}</Field>
              <Field label="Monthly gross">{access.salary ? formatKES(emp.salaryKES) : <span className="text-muted-foreground">Restricted</span>}</Field>
            </Fields>
          </Section>
          {data.directReports.length > 0 && (
            <Section title="Direct reports" description={`${data.directReports.length} ${data.directReports.length === 1 ? 'person' : 'people'}`}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.directReports.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3">
                    {directory ? (
                      <Link to={`/app/people/${r.id}`} className="block hover:text-primary">
                        <PersonCell name={r.name} sub={r.title} size="sm" />
                      </Link>
                    ) : (
                      <PersonCell name={r.name} sub={r.title} size="sm" />
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="statutory" className="grid grid-cols-1 gap-4">
          <Section
            title="Statutory identifiers"
            description={access.statutory === 'full' ? undefined : 'Masked — full numbers are visible to HR, Finance and the employee.'}
            action={access.canEdit && <EditButton onClick={() => setEditing('statutory')} />}
          >
            <Fields>
              <Field label="KRA PIN" mono>{emp.kraPin}</Field>
              <Field label="National ID" mono>{emp.nationalId}</Field>
              <Field label="SHIF number" mono>{p.shifNumber}</Field>
              <Field label="NSSF number" mono>{p.nssfNumber}</Field>
              <Field label="Passport number" mono>{p.passportNumber}</Field>
            </Fields>
          </Section>
          <Section
            title="Bank details"
            description={access.bank === 'masked' ? 'Masked — full account numbers are visible to HR, Finance and the employee.' : undefined}
            action={canEditBank && <EditButton onClick={() => setEditing('bank')} />}
          >
            {access.bank === 'none' ? (
              <p className="text-sm text-muted-foreground">
                Bank details are visible to HR, Finance and the employee only.
              </p>
            ) : (
              <Fields>
                <Field label="Bank">{p.bankName}</Field>
                <Field label="Branch">{p.bankBranch}</Field>
                <Field label="Account name">{p.bankAccountName}</Field>
                <Field label="Account number" mono>{p.bankAccountNumber}</Field>
              </Fields>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="emergency">
          <Section title="Emergency contact" description="Who we call if something happens at work." action={access.canEdit && <EditButton onClick={() => setEditing('emergency')} />}>
            {p.emergencyName ? (
              <Fields>
                <Field label="Name">{p.emergencyName}</Field>
                <Field label="Relationship">{p.emergencyRelationship}</Field>
                <Field label="Phone">
                  {p.emergencyPhone && (
                    <a href={`tel:${p.emergencyPhone.replace(/\s/g, '')}`} className="text-primary hover:underline">
                      {p.emergencyPhone}
                    </a>
                  )}
                </Field>
              </Fields>
            ) : (
              <p className="text-sm text-muted-foreground">No emergency contact yet{access.canEdit ? ' — add one so HR can reach someone quickly.' : '.'}</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab data={data} setData={setData} reload={reload} />
        </TabsContent>

        <TabsContent value="onboarding">
          <OnboardingTab data={data} />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveTab data={data} />
        </TabsContent>

        <TabsContent value="timeline">
          <Section title="Timeline">
            <ProfileTimeline data={data} workspaceName={ws.workspace.name} />
          </Section>
        </TabsContent>
      </Tabs>

      <EditDialog
        spec={editing ? (editing === 'bank' && !canEditBank ? null : specs[editing]) : null}
        initial={initialFor(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={save}
      />
    </div>
  )
}

function ProfileHeader({ data, directory, onEdit }: { data: EmployeeProfileData; directory: boolean; onEdit?: () => void }) {
  const { employee: emp, profile: p } = data
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PersonAvatar name={emp.name} src={emp.photo} className="size-16 text-lg sm:size-20 sm:text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-bold tracking-tight">
              {emp.name}
              {p.preferredName && p.preferredName !== emp.name.split(' ')[0] && <span className="ml-2 text-base font-medium text-muted-foreground">“{p.preferredName}”</span>}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {emp.title}
              {data.department ? ` · ${data.department.name}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={emp.status} />
              <Badge variant="outline">{emp.employmentType}</Badge>
              <Badge variant="muted">{roleLabels[emp.role]}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`mailto:${emp.email}`}>
                Email
              </a>
            </Button>
            {emp.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${emp.phone.replace(/\s/g, '')}`}>
                  Call
                </a>
              </Button>
            )}
            {onEdit && (
              <Button size="sm" onClick={onEdit}>
                Edit profile
              </Button>
            )}
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 lg:grid-cols-4">
          <Field label="Employee no.">{emp.employeeNo}</Field>
          <Field label="Department">{data.department?.name}</Field>
          <Field label="Manager">
            {data.manager &&
              (directory ? (
                <Link to={`/app/people/${data.manager.id}`} className="text-primary hover:underline">
                  {data.manager.name}
                </Link>
              ) : (
                data.manager.name
              ))}
          </Field>
          <Field label="Joined">
            {formatDate(emp.startDate)} · {tenure(emp.startDate)}
          </Field>
        </dl>
      </CardContent>
    </Card>
  )
}

function DocumentsTab({
  data,
  setData,
  reload,
}: {
  data: EmployeeProfileData
  setData: React.Dispatch<React.SetStateAction<EmployeeProfileData | null>>
  reload: () => Promise<void>
}) {
  const { access, employee: emp } = data
  const [category, setCategory] = useState<FileCategory>('Contract')
  const [confirm, setConfirm] = useState<EmployeeFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const canUpload = access.canUpload && !USE_MOCK_API

  const remove = async () => {
    if (!confirm) return
    setDeleting(true)
    try {
      await deleteFile(confirm.id)
      toast.success(`${confirm.filename} deleted`)
      setConfirm(null)
      // Deleting an onboarding upload reopens that task, so refetch everything.
      await reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4', canUpload && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Section
          title="Uploaded files" description={
            access.canViewFiles
              ? `${data.files.length} file${data.files.length === 1 ? '' : 's'}${access.isSelf ? '' : ' · uploaded and managed by the employee'}`
              : undefined
          }
        >
          {!access.canViewFiles ? (
            <p className="text-sm text-muted-foreground">
              Files are visible to HR, the employee and their manager.
            </p>
          ) : data.files.length === 0 ? (
            <EmptyState title="No files yet" description="ID, KRA PIN, SHIF and NSSF uploads from onboarding appear here." className="py-10" />
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {data.files.map((f) => (
                <li key={f.id}>
                  <StoredFileCard file={f}>
                    {access.isSelf && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${f.filename}`} onClick={() => setConfirm(f)}>
                        <Trash />
                      </Button>
                    )}
                  </StoredFileCard>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Compliance documents" description="Contracts, permits and certificates tracked for expiry">
          {data.complianceDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compliance documents recorded.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {data.complianceDocs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{d.type}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{d.number}</span> · {d.expires ? `Expires ${formatDate(d.expires)}` : `Issued ${formatDate(d.issued)}`}
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {canUpload && (
        <Section title="Upload a document" description={access.isSelf ? 'Add a document to your file' : `Add to ${emp.name.split(' ')[0]}’s file`} className="content-start self-start">
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Category</Label>
              <SimpleSelect value={category} onValueChange={(v) => setCategory(v as FileCategory)} options={[...FILE_CATEGORIES]} />
            </div>
            <FileUploader<EmployeeFile>
              accept={FILE_ACCEPT}
              label="Drop a file or click to browse"
              hint="PDF, image or Word document up to 10 MB"
              upload={(file, onProgress) => uploadFile(file, { category, employeeId: emp.id }, onProgress)}
              onUploaded={(files) => {
                setData((d) => (d ? { ...d, files: [...files, ...d.files] } : d))
                toast.success(files.length === 1 ? `${files[0]!.filename} uploaded` : `${files.length} files uploaded`)
              }}
            />
          </div>
        </Section>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription>
              {confirm?.filename} will be permanently removed{confirm?.taskId ? ' and the matching onboarding task reopened' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? 'Deleting…' : 'Delete file'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OnboardingTab({ data }: { data: EmployeeProfileData }) {
  const { onboarding } = data
  const done = onboarding.tasks.filter((t) => t.completedAt).length
  return (
    <Section title="Onboarding checklist" description={onboarding.requiredLeft ? `${onboarding.requiredLeft} required task${onboarding.requiredLeft === 1 ? '' : 's'} outstanding` : 'All required tasks complete'}>
      <div className="mb-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>
            {done} of {onboarding.tasks.length} tasks
          </span>
          <span className="tabular">{onboarding.progress}%</span>
        </div>
        <Progress value={onboarding.progress} tone={onboarding.progress >= 100 ? 'success' : 'primary'} />
      </div>
      <ul className="grid grid-cols-1 gap-2">
        {onboarding.tasks.map((t, ti) => (
          <li key={t.id} className="rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular', t.completedAt ? 'bg-success-soft text-success' : 'border text-muted-foreground')} aria-hidden>
                {t.completedAt ? <Check className="size-3.5" strokeWidth={2.5} /> : ti + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{t.title}</span>
                  {!t.required && <Badge variant="muted">Optional</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{t.completedAt ? `Completed ${formatDate(t.completedAt.slice(0, 10))}` : t.description}</div>
              </div>
              {t.completedAt ? (
                <Badge variant="success" dot>
                  Done
                </Badge>
              ) : (
                <Badge variant="outline">To do</Badge>
              )}
            </div>
            {t.file && <StoredFileCard file={t.file} className="mt-3" />}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function LeaveTab({ data }: { data: EmployeeProfileData }) {
  const leave = data.leaveRequests
  const usedAnnual = leave.filter((l) => l.type === 'Annual' && l.status === 'Approved').reduce((s, l) => s + l.days, 0)
  const pending = leave.filter((l) => l.status === 'Pending').reduce((s, l) => s + l.days, 0)
  const sick = leave.filter((l) => l.type === 'Sick' && l.status === 'Approved').reduce((s, l) => s + l.days, 0)
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Annual left', value: Math.max(0, ANNUAL_ENTITLEMENT - usedAnnual), hint: `of ${ANNUAL_ENTITLEMENT} days` },
          { label: 'Pending', value: pending, hint: 'days awaiting' },
          { label: 'Sick taken', value: sick, hint: 'of 14 days' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-xl font-bold tabular sm:text-2xl">{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Section title="Leave history">
        {leave.length === 0 ? (
          <EmptyState title="No leave requests" description="Requests and approvals will show up here." className="py-10" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {leave.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {l.type} · {l.days} day{l.days === 1 ? '' : 's'}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatDate(l.start, 'short')} – {formatDate(l.end)}
                    {l.reason ? ` · ${l.reason}` : ''}
                  </div>
                </div>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function ProfileTimeline({ data, workspaceName }: { data: EmployeeProfileData; workspaceName: string }) {
  const items = useMemo<TimelineItem[]>(() => {
    const emp = data.employee
    const out: (TimelineItem & { date: string })[] = []
    const add = (date: string, title: string, body?: string, state: TimelineItem['state'] = 'done') =>
      out.push({ date, title, meta: formatDate(date.slice(0, 10)), body, state })

    add(emp.startDate, `Joined ${workspaceName}`, `${emp.title}${data.department ? ` · ${data.department.name}` : ''}`)
    const probEnd = emp.probationEnd ?? addDays(emp.startDate, 90)
    if (daysUntil(probEnd) >= 0) add(probEnd, 'Probation review', `${daysUntil(probEnd)} days to go`, 'upcoming')
    else if (emp.status !== 'Onboarding' && emp.status !== 'Probation') add(probEnd, 'Probation confirmed')
    for (const t of data.onboarding.tasks) if (t.completedAt) add(t.completedAt, t.title, t.file ? t.file.filename : 'Onboarding task completed')
    for (const f of data.files) if (!f.taskId) add(f.createdAt, `${f.category} uploaded`, `${f.filename}${f.uploadedByName ? ` · by ${f.uploadedByName}` : ''}`)
    if (data.profile.ndaSignedAt) add(data.profile.ndaSignedAt, 'NDA signed', data.profile.ndaSignature ? `Signed as ${data.profile.ndaSignature}` : undefined)
    for (const l of data.leaveRequests) if (l.status === 'Approved') add(l.start, `${l.type} leave`, `${l.days} day${l.days === 1 ? '' : 's'}`)
    return out
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40)
      .map(({ date: _d, ...rest }) => rest)
  }, [data, workspaceName])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Timeline items={items} />
    </motion.div>
  )
}
