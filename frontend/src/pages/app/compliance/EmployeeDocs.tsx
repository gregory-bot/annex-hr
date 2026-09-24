import { useState } from 'react'
import { toast } from 'sonner'
import type { ComplianceDoc, Employee } from '@/data/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { DatePicker } from '@/components/shared/DatePicker'
import { FileUploader } from '@/components/shared/FileUploader'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { FILE_ACCEPT, fileDownloadUrl, uploadFile, type EmployeeFile } from '@/lib/files'
import { daysUntil, formatDate, TODAY } from '@/lib/utils'
import { complianceApi, FILE_CATEGORY_FOR, type ComplianceItem } from './api'
import { DOC_TYPES, ExpiryText, isoDate, maskNumber, type DocRow } from './shared'

type DialogKind = 'upload' | 'record' | 'request' | null

export function EmployeeDocs({
  docs,
  employees,
  self,
  user,
  onSaved,
}: {
  docs: DocRow[]
  employees: Employee[]
  self: boolean
  user: Employee
  onSaved: (d: ComplianceItem) => void
}) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [preset, setPreset] = useState<{ employeeId?: string; type?: ComplianceDoc['type'] }>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const rows = docs.filter(
    (d) =>
      (type === 'all' || d.type === type) &&
      (status === 'all' || d.status === status) &&
      (!q || d.emp?.name.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase()) || d.number.toLowerCase().includes(q.toLowerCase())),
  )

  const requestUpload = async (d: DocRow) => {
    setBusyId(d.id)
    try {
      const next = USE_MOCK_API ? { ...d, requestedAt: new Date().toISOString() } : await complianceApi.request(d.id)
      onSaved(next)
      toast.success(`Asked ${d.emp?.name.split(' ')[0] ?? 'the employee'} to upload their ${d.type}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const open = (kind: DialogKind, p: typeof preset = {}) => {
    setPreset(p)
    setDialog(kind)
  }

  const columns: Column<DocRow>[] = [
    ...(self
      ? []
      : [
          {
            key: 'emp',
            header: 'Employee',
            cell: (d: DocRow) => <PersonCell name={d.emp?.name ?? '—'} sub={d.emp?.employeeNo} />,
            sortValue: (d: DocRow) => d.emp?.name ?? '',
          },
        ]),
    {
      key: 'type',
      header: 'Document',
      cell: (d) => (
        <div className="min-w-0">
          <div className="text-sm font-medium">{d.type}</div>
          {d.fileId ? (
            <a href={fileDownloadUrl(d.fileId, true)} target="_blank" rel="noreferrer" className="block max-w-56 truncate text-xs text-primary hover:underline">
              {d.fileName ?? 'View file'}
            </a>
          ) : (
            <div className="text-xs text-muted-foreground">{d.requestedAt ? `Upload requested ${formatDate(d.requestedAt.slice(0, 10), 'short')}` : 'No file uploaded'}</div>
          )}
        </div>
      ),
      sortValue: (d) => d.type,
    },
    { key: 'number', header: 'Number', cell: (d) => <span className="font-mono text-xs tabular">{d.number ? maskNumber(d.number) : '—'}</span> },
    { key: 'issued', header: 'Issued', cell: (d) => <span className="text-sm">{d.status === 'Missing' ? '—' : formatDate(d.issued)}</span>, sortValue: (d) => d.issued, hideOnMobile: true },
    {
      key: 'expires',
      header: 'Expires',
      cell: (d) =>
        d.expires ? (
          <div className="text-sm">
            {formatDate(d.expires)}
            <div>
              <ExpiryText date={d.expires} />
            </div>
          </div>
        ) : (
          <ExpiryText />
        ),
      sortValue: (d) => (d.expires ? daysUntil(d.expires) : 99999),
    },
    { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} />, sortValue: (d) => d.status },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (d) =>
        self ? (
          !d.fileId || d.status !== 'Valid' ? (
            <Button size="sm" variant="outline" onClick={() => open('upload', { type: d.type })}>
              {d.fileId ? 'Upload renewal' : 'Upload'}
            </Button>
          ) : null
        ) : !d.fileId ? (
          <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => void requestUpload(d)}>
            {d.requestedAt ? 'Ask again' : 'Request upload'}
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_200px_160px] lg:flex-1">
          <SearchInput value={q} onChange={setQ} placeholder={self ? 'Search my documents…' : 'Search employee, type or number…'} />
          <SimpleSelect value={type} onValueChange={setType} options={[{ value: 'all', label: 'All types' }, ...DOC_TYPES]} className="h-9" />
          <SimpleSelect value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, 'Valid', 'Expiring', 'Expired', 'Missing']} className="h-9" />
        </div>
        {self ? (
          <Button onClick={() => open('upload')}>Upload document</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 lg:flex-none" onClick={() => open('record')}>
              Record item
            </Button>
            <Button className="flex-1 lg:flex-none" onClick={() => open('request')}>
              Request document
            </Button>
          </div>
        )}
      </div>
      {!self && <p className="text-xs text-muted-foreground">Documents belong to the employee — only they can upload files. You can record numbers and expiry dates and request uploads.</p>}
      <DataTable rows={rows} columns={columns} rowKey={(d) => d.id} pageSize={10} />
      <UploadDialog key={`u-${preset.type ?? ''}-${dialog === 'upload'}`} open={dialog === 'upload'} onOpenChange={(o) => !o && setDialog(null)} user={user} presetType={preset.type} onSaved={onSaved} />
      <RecordDialog key={`r-${dialog === 'record'}`} open={dialog === 'record'} onOpenChange={(o) => !o && setDialog(null)} employees={employees} onSaved={onSaved} />
      <RequestDialog
        key={`q-${dialog === 'request'}-${preset.employeeId ?? ''}`}
        open={dialog === 'request'}
        onOpenChange={(o) => !o && setDialog(null)}
        employees={employees}
        preset={preset}
        onSaved={onSaved}
      />
    </div>
  )
}

/** Employee self-service: upload the file (stored against their profile) and its details. */
function UploadDialog({
  open,
  onOpenChange,
  user,
  presetType,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  user: Employee
  presetType?: ComplianceDoc['type']
  onSaved: (d: ComplianceItem) => void
}) {
  const [type, setType] = useState<string | undefined>(presetType)
  const [number, setNumber] = useState('')
  const [issued, setIssued] = useState<Date>()
  const [expiry, setExpiry] = useState<Date>()
  const [file, setFile] = useState<EmployeeFile | { id: string; filename: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const docType = type as ComplianceDoc['type'] | undefined

  const save = async () => {
    if (!docType || !file) return
    const exp = isoDate(expiry)
    setSaving(true)
    try {
      const saved: ComplianceItem = USE_MOCK_API
        ? {
            id: `cd-new-${Date.now()}`,
            employeeId: user.id,
            type: docType,
            number: number.toUpperCase(),
            issued: isoDate(issued) ?? TODAY,
            expires: exp,
            status: exp && daysUntil(exp) < 0 ? 'Expired' : exp && daysUntil(exp) < 60 ? 'Expiring' : 'Valid',
            fileName: file.filename,
          }
        : await complianceApi.create({ employeeId: user.id, type: docType, number: number.trim() || undefined, issued: isoDate(issued), expires: exp, fileId: file.id })
      onSaved(saved)
      toast.success(`${docType} uploaded`, { description: 'HR has been notified.' })
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
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>Stored securely on your employee file. HR can view it; only you can replace it.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Document type</Label>
              <SimpleSelect value={type} onValueChange={setType} options={DOC_TYPES} placeholder="Select type" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="doc-number">Document number</Label>
              <Input id="doc-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. AK1234567" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Issue date</Label>
              <DatePicker value={issued} onChange={setIssued} placeholder="Select date" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Expiry date</Label>
              <DatePicker value={expiry} onChange={setExpiry} placeholder="No expiry" />
            </div>
          </div>
          <FileUploader<EmployeeFile>
            multiple={false}
            compact
            accept={FILE_ACCEPT}
            disabled={!docType}
            label={docType ? 'Drop the file here or click to browse' : 'Choose the document type first'}
            upload={
              USE_MOCK_API
                ? undefined
                : (f, onProgress) => uploadFile(f, { category: FILE_CATEGORY_FOR[docType ?? 'Contract'] }, onProgress)
            }
            onUploaded={(r) => setFile(r[0] ?? null)}
            onComplete={(fs) => USE_MOCK_API && fs[0] && setFile({ id: 'mock', filename: fs[0].name })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!docType || !file || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** HR records a compliance item's number and dates — the employee uploads the file. */
function RecordDialog({ open, onOpenChange, employees, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; employees: Employee[]; onSaved: (d: ComplianceItem) => void }) {
  const [empId, setEmpId] = useState<string>()
  const [type, setType] = useState<string>()
  const [number, setNumber] = useState('')
  const [issued, setIssued] = useState<Date>()
  const [expiry, setExpiry] = useState<Date>()
  const [saving, setSaving] = useState(false)
  const valid = !!empId && !!type && number.trim().length >= 2

  const save = async () => {
    if (!valid) return
    const exp = isoDate(expiry)
    setSaving(true)
    try {
      const body = { employeeId: empId!, type: type as ComplianceDoc['type'], number: number.trim(), issued: isoDate(issued), expires: exp }
      const saved: ComplianceItem = USE_MOCK_API
        ? { id: `cd-new-${Date.now()}`, ...body, issued: body.issued ?? TODAY, status: exp && daysUntil(exp) < 0 ? 'Expired' : exp && daysUntil(exp) < 60 ? 'Expiring' : 'Valid' }
        : await complianceApi.create(body)
      onSaved(saved)
      toast.success(`${type} recorded for ${employees.find((e) => e.id === empId)?.name ?? 'employee'}`)
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
          <DialogTitle>Record compliance item</DialogTitle>
          <DialogDescription>Track the number and expiry. The employee uploads the file itself.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Employee</Label>
            <SimpleSelect value={empId} onValueChange={setEmpId} options={employees.map((e) => ({ value: e.id, label: e.name }))} placeholder="Select employee" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Document type</Label>
              <SimpleSelect value={type} onValueChange={setType} options={DOC_TYPES} placeholder="Select type" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="rec-number">Number</Label>
              <Input id="rec-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. WP-2026-0142" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Issue date</Label>
              <DatePicker value={issued} onChange={setIssued} placeholder="Today" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Expiry date</Label>
              <DatePicker value={expiry} onChange={setExpiry} placeholder="No expiry" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** HR asks an employee to upload a document (in-app notification and optional email). */
export function RequestDialog({
  open,
  onOpenChange,
  employees,
  preset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: Employee[]
  preset: { employeeId?: string; type?: ComplianceDoc['type'] }
  onSaved: (d: ComplianceItem) => void
}) {
  const [empId, setEmpId] = useState<string | undefined>(preset.employeeId)
  const [type, setType] = useState<string | undefined>(preset.type)
  const [note, setNote] = useState('')
  const [email, setEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const emp = employees.find((e) => e.id === empId)

  const send = async () => {
    if (!empId || !type) return
    setSaving(true)
    try {
      const saved: ComplianceItem = USE_MOCK_API
        ? { id: `cd-req-${Date.now()}`, employeeId: empId, type: type as ComplianceDoc['type'], number: '', issued: TODAY, status: 'Missing', requestedAt: new Date().toISOString() }
        : await complianceApi.requestNew(empId, type as ComplianceDoc['type'], note.trim(), email)
      onSaved(saved)
      toast.success(`Request sent to ${emp?.name ?? 'employee'}`, { description: email ? 'In-app notification and email.' : 'In-app notification.' })
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
          <DialogTitle>Request a document</DialogTitle>
          <DialogDescription>The employee gets a “Please upload your document” notification.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Employee</Label>
              <SimpleSelect value={empId} onValueChange={setEmpId} options={employees.map((e) => ({ value: e.id, label: e.name }))} placeholder="Select employee" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Document</Label>
              <SimpleSelect value={type} onValueChange={setType} options={DOC_TYPES} placeholder="Select type" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="req-note">Note (optional)</Label>
            <Textarea id="req-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. We need a certified copy for the NITA audit." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} />
            Also send an email{emp ? ` to ${emp.email}` : ''}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!empId || !type || saving} onClick={() => void send()}>
            {saving ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

