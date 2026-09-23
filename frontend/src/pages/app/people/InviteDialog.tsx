import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MailPlus, Plus, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { PersonCell } from '@/components/shared/PersonCell'
import type { Department, Role } from '@/data/types'
import { roleLabels } from '@/lib/rbac'
import { TODAY, formatDate } from '@/lib/utils'
import { EMAIL_RE, inviteRoles, type PendingInvite } from './helpers'

interface Row {
  key: number
  email: string
  departmentId: string
  role: Role
}

let seq = 0

/** Invite form with two modes: paste many emails, or add rows individually. */
export function InviteForm({
  departments,
  onSent,
  submitLabel = 'Send invitations',
  onCancel,
}: {
  departments: Department[]
  onSent: (invites: PendingInvite[]) => void
  submitLabel?: string
  onCancel?: () => void
}) {
  const firstDept = departments[0]?.id ?? ''
  const [mode, setMode] = useState<'bulk' | 'rows'>('bulk')
  const [bulk, setBulk] = useState('')
  const [bulkDept, setBulkDept] = useState(firstDept)
  const [bulkRole, setBulkRole] = useState<Role>('employee')
  const [rows, setRows] = useState<Row[]>([{ key: ++seq, email: '', departmentId: firstDept, role: 'employee' }])

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }))
  const roleOptions = inviteRoles.map((r) => ({ value: r, label: roleLabels[r] }))

  const bulkEmails = Array.from(new Set(bulk.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)))
  const bulkValid = bulkEmails.filter((e) => EMAIL_RE.test(e))
  const bulkInvalid = bulkEmails.length - bulkValid.length

  const submit = () => {
    const list =
      mode === 'bulk'
        ? bulkValid.map((email) => ({ email, departmentId: bulkDept, role: bulkRole }))
        : rows.filter((r) => EMAIL_RE.test(r.email.trim())).map((r) => ({ email: r.email.trim().toLowerCase(), departmentId: r.departmentId, role: r.role }))
    if (!list.length) {
      toast.error('Add at least one valid work email')
      return
    }
    const invites = list.map((i) => ({ ...i, id: `inv-${++seq}`, sent: TODAY }))
    onSent(invites)
    toast.success(`${invites.length} invitation${invites.length === 1 ? '' : 's'} sent`, {
      description: 'Invitees get a secure link to join your workspace.',
    })
    setBulk('')
    setRows([{ key: ++seq, email: '', departmentId: firstDept, role: 'employee' }])
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'bulk' | 'rows')}>
        <TabsList>
          <TabsTrigger value="bulk">Paste emails</TabsTrigger>
          <TabsTrigger value="rows">Add individually</TabsTrigger>
        </TabsList>
        <TabsContent value="bulk" className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-1.5">
            <Label htmlFor="bulk-emails">Work emails</Label>
            <Textarea
              id="bulk-emails"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={'jane.wambui@company.com\nkevin.ouma@company.com'}
              className="min-h-[110px] font-mono text-[13px]"
            />
            <p className="text-xs text-muted-foreground">
              Separate with commas or new lines.{' '}
              {bulkEmails.length > 0 && (
                <span className="font-medium text-foreground">
                  {bulkValid.length} valid{bulkInvalid > 0 && <span className="text-danger"> · {bulkInvalid} invalid</span>}
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Department</Label>
              <SimpleSelect value={bulkDept} onValueChange={setBulkDept} options={deptOptions} />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Role</Label>
              <SimpleSelect value={bulkRole} onValueChange={(v) => setBulkRole(v as Role)} options={roleOptions} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="rows" className="grid grid-cols-1 gap-3">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 gap-2 rounded-lg border bg-subtle p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
                  <Input
                    aria-label={`Email ${i + 1}`}
                    type="email"
                    value={r.email}
                    placeholder="name@company.com"
                    onChange={(e) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, email: e.target.value } : x)))}
                  />
                  <SimpleSelect
                    value={r.departmentId}
                    onValueChange={(v) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, departmentId: v } : x)))}
                    options={deptOptions}
                  />
                  <SimpleSelect
                    value={r.role}
                    onValueChange={(v) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, role: v as Role } : x)))}
                    options={roleOptions}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove row"
                    disabled={rows.length === 1}
                    onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setRows((p) => [...p, { key: ++seq, email: '', departmentId: firstDept, role: 'employee' }])}
          >
            <Plus /> Add another
          </Button>
        </TabsContent>
      </Tabs>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={submit}>
          <Send /> {submitLabel}
        </Button>
      </div>
    </div>
  )
}

export function InviteDialog({
  open,
  onOpenChange,
  departments,
  onSent,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  departments: Department[]
  onSent: (invites: PendingInvite[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite employees</DialogTitle>
          <DialogDescription>They'll receive a link to set a password and complete onboarding.</DialogDescription>
        </DialogHeader>
        <InviteForm
          departments={departments}
          onCancel={() => onOpenChange(false)}
          onSent={(inv) => {
            onSent(inv)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function PendingInvitesTable({
  invites,
  departments,
  onRevoke,
  onResend,
}: {
  invites: PendingInvite[]
  departments: Department[]
  onRevoke: (id: string) => void
  onResend: (inv: PendingInvite) => void
}) {
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—'
  const columns: Column<PendingInvite>[] = [
    { key: 'email', header: 'Invitee', cell: (r) => <PersonCell name={r.email.split('@')[0]!.replace(/[._-]/g, ' ')} sub={r.email} size="sm" />, sortValue: (r) => r.email },
    { key: 'dept', header: 'Department', cell: (r) => <span className="text-sm">{deptName(r.departmentId)}</span> },
    { key: 'role', header: 'Role', cell: (r) => <span className="text-sm">{roleLabels[r.role]}</span> },
    { key: 'sent', header: 'Sent', cell: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.sent)}</span> },
    { key: 'status', header: 'Status', cell: () => <Badge variant="info" dot>Invited</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onResend(r)}>
            Resend
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => onRevoke(r.id)}>
            Revoke
          </Button>
        </div>
      ),
    },
  ]
  return (
    <DataTable
      rows={invites}
      columns={columns}
      rowKey={(r) => r.id}
      pageSize={5}
      empty={<EmptyState icon={MailPlus} title="No pending invites" description="Invitations you send appear here until they're accepted." />}
    />
  )
}
