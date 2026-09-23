import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { ComplianceDoc, Employee } from '@/data/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { DatePicker } from '@/components/shared/DatePicker'
import { FileUploader } from '@/components/shared/FileUploader'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { daysUntil, formatDate, TODAY } from '@/lib/utils'
import { DOC_TYPES, ExpiryText, maskNumber, type DocRow } from './shared'

export function EmployeeDocs({
  docs,
  employees,
  self,
  user,
  onAdd,
}: {
  docs: DocRow[]
  employees: Employee[]
  self: boolean
  user: Employee
  onAdd: (d: ComplianceDoc) => void
}) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [open, setOpen] = useState(false)

  const rows = docs.filter(
    (d) =>
      (type === 'all' || d.type === type) &&
      (status === 'all' || d.status === status) &&
      (!q || d.emp?.name.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase()) || d.number.toLowerCase().includes(q.toLowerCase())),
  )

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
        <div className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{d.type}</span>
        </div>
      ),
      sortValue: (d) => d.type,
    },
    { key: 'number', header: 'Number', cell: (d) => <span className="font-mono text-xs tabular">{maskNumber(d.number)}</span> },
    { key: 'issued', header: 'Issued', cell: (d) => <span className="text-sm">{formatDate(d.issued)}</span>, sortValue: (d) => d.issued, hideOnMobile: true },
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
  ]

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_200px_160px] lg:flex-1">
          <SearchInput value={q} onChange={setQ} placeholder={self ? 'Search my documents…' : 'Search employee, type or number…'} />
          <SimpleSelect value={type} onValueChange={setType} options={[{ value: 'all', label: 'All types' }, ...DOC_TYPES]} className="h-9" />
          <SimpleSelect value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, 'Valid', 'Expiring', 'Expired', 'Missing']} className="h-9" />
        </div>
        <Button onClick={() => setOpen(true)}>
          <Upload /> Upload document
        </Button>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(d) => d.id} pageSize={10} />
      <UploadDialog open={open} onOpenChange={setOpen} employees={employees} self={self} user={user} onAdd={onAdd} />
    </div>
  )
}

function UploadDialog({
  open,
  onOpenChange,
  employees,
  self,
  user,
  onAdd,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: Employee[]
  self: boolean
  user: Employee
  onAdd: (d: ComplianceDoc) => void
}) {
  const [empId, setEmpId] = useState<string | undefined>(self ? user.id : undefined)
  const [type, setType] = useState<string>()
  const [expiry, setExpiry] = useState<Date>()
  const [file, setFile] = useState<string>()

  const reset = () => {
    setEmpId(self ? user.id : undefined)
    setType(undefined)
    setExpiry(undefined)
    setFile(undefined)
  }

  const save = () => {
    if (!empId || !type || !file) return
    const exp = expiry ? `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}-${String(expiry.getDate()).padStart(2, '0')}` : undefined
    const days = exp ? daysUntil(exp) : 999
    onAdd({
      id: `cd-new-${Date.now()}`,
      employeeId: empId,
      type: type as ComplianceDoc['type'],
      number: `${type.slice(0, 2).toUpperCase()}-${String(Date.now()).slice(-5)}`,
      issued: TODAY,
      expires: exp,
      status: days < 0 ? 'Expired' : days < 60 ? 'Expiring' : 'Valid',
    })
    toast.success(`${type} uploaded for ${employees.find((e) => e.id === empId)?.name ?? 'employee'}`)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload compliance document</DialogTitle>
          <DialogDescription>We’ll track the expiry date and send reminders automatically.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">
          {!self && (
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Employee</Label>
              <SimpleSelect value={empId} onValueChange={setEmpId} options={employees.map((e) => ({ value: e.id, label: e.name }))} placeholder="Select employee" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Document type</Label>
              <SimpleSelect value={type} onValueChange={setType} options={DOC_TYPES} placeholder="Select type" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Expiry date</Label>
              <DatePicker value={expiry} onChange={setExpiry} placeholder="No expiry" />
            </div>
          </div>
          <FileUploader multiple={false} compact onComplete={(files) => setFile(files[0]?.name)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!empId || !type || !file} onClick={save}>
            Save document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
