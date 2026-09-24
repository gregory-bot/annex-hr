import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { Employee } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { PersonCell } from '@/components/shared/PersonCell'
import { StatCard } from '@/components/shared/StatCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatKES } from '@/lib/utils'
import { WHT_RATE } from './calc'

type PayStatus = 'Ready to pay' | 'Processing' | 'Paid' | 'Awaiting approval'

interface Row {
  employee: Employee
  hours: number
  pendingHours: number
  rate: number
  gross: number
  wht: number
  net: number
  weeks: number
}

export function ConsultantsTab() {
  const { employees, timesheets } = useWorkspace()

  const rows: Row[] = useMemo(() => {
    return employees
      .filter((e) => e.employmentType === 'Consultant')
      .map((e) => {
        const mine = timesheets.filter((t) => t.employeeId === e.id)
        const sum = (status: string) =>
          mine.filter((t) => t.status === status).reduce((h, t) => h + t.entries.reduce((a, en) => a + en.hours.reduce((x, y) => x + y, 0), 0), 0)
        const hours = sum('Approved')
        const rate = mine[0]?.rate ?? 3500
        const gross = hours * rate
        const wht = Math.round(gross * WHT_RATE)
        return { employee: e, hours, pendingHours: sum('Pending'), rate, gross, wht, net: gross - wht, weeks: mine.filter((t) => t.status === 'Approved').length }
      })
  }, [employees, timesheets])

  const [status, setStatus] = useState<Record<string, PayStatus>>(() =>
    Object.fromEntries(rows.map((r) => [r.employee.id, r.hours > 0 ? 'Ready to pay' : 'Awaiting approval'])),
  )

  const pay = (r: Row) => {
    setStatus((s) => ({ ...s, [r.employee.id]: 'Processing' }))
    window.setTimeout(() => {
      setStatus((s) => ({ ...s, [r.employee.id]: 'Paid' }))
      toast.success(`${formatKES(r.net)} sent via M-Pesa B2C`, { description: `${r.employee.name} · ${r.employee.phone} · Ref QJ${r.employee.employeeNo.replace(/\D/g, '')}K7` })
    }, 1200)
  }

  const payAll = () => {
    const ready = rows.filter((r) => status[r.employee.id] === 'Ready to pay')
    if (!ready.length) return toast.info('Nothing ready to pay')
    ready.forEach(pay)
  }

  const totals = rows.reduce((t, r) => ({ gross: t.gross + r.gross, wht: t.wht + r.wht, hours: t.hours + r.hours }), { gross: 0, wht: 0, hours: 0 })

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Consultant', cell: (r) => <PersonCell name={r.employee.name} sub={r.employee.title} />, sortValue: (r) => r.employee.name, className: 'min-w-48' },
    {
      key: 'hours',
      header: 'Approved hours',
      cell: (r) => (
        <div className="leading-tight tabular">
          {r.hours} h<div className="text-[11px] text-muted-foreground">{r.weeks} weeks{r.pendingHours ? ` · ${r.pendingHours} h pending` : ''}</div>
        </div>
      ),
      sortValue: (r) => r.hours,
    },
    { key: 'rate', header: 'Rate / hr', cell: (r) => <span className="tabular">{formatKES(r.rate)}</span>, sortValue: (r) => r.rate },
    { key: 'gross', header: 'Gross', cell: (r) => <span className="tabular">{formatKES(r.gross)}</span>, sortValue: (r) => r.gross },
    { key: 'wht', header: 'WHT 5%', cell: (r) => <span className="tabular text-muted-foreground">−{formatKES(r.wht)}</span> },
    { key: 'net', header: 'Net', cell: (r) => <span className="font-semibold tabular">{formatKES(r.net)}</span>, sortValue: (r) => r.net },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={status[r.employee.id] === 'Ready to pay' ? 'Approved' : status[r.employee.id] === 'Awaiting approval' ? 'Pending' : status[r.employee.id] === 'Processing' ? 'In Progress' : 'Paid'} /> },
    {
      key: 'action',
      header: '',
      cell: (r) => {
        const s = status[r.employee.id]
        return (
          <Button size="sm" variant={s === 'Ready to pay' ? 'default' : 'outline'} disabled={s !== 'Ready to pay'} onClick={(ev) => { ev.stopPropagation(); pay(r) }}>
            {s === 'Paid' ? 'Paid' : s === 'Processing' ? 'Sending…' : 'Pay via M-Pesa B2C'}
          </Button>
        )
      },
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Active consultants" value={rows.length} />
        <StatCard index={1} label="Approved hours" value={totals.hours} hint="Last 3 weeks" />
        <StatCard index={2} label="Gross payable" value={totals.gross} format={(v) => formatKES(v, { compact: true })} />
        <StatCard index={3} label="Withholding tax" value={totals.wht} format={(v) => formatKES(v, { compact: true })} hint="Remit to KRA by 20th" />
      </div>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="font-medium">Paid from approved timesheets</div>
          <div className="text-muted-foreground">Consultants are not on PAYE. 5% withholding tax on professional fees is deducted and remitted to KRA.</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">M-Pesa B2C · sandbox</Badge>
          <Button onClick={payAll}>Pay all ready</Button>
        </div>
      </Card>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.employee.id} />
    </div>
  )
}
