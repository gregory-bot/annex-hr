import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Section } from '@/components/shared/Section'

const MAPPINGS: { rule: string; code: string; account: string; side: 'Debit' | 'Credit' }[] = [
  { rule: 'Basic salary', code: 'BASIC', account: '6100 Salaries & Wages', side: 'Debit' },
  { rule: 'House allowance', code: 'HOUSE', account: '6110 Housing Allowance', side: 'Debit' },
  { rule: 'Transport allowance', code: 'TRANS', account: '6120 Transport Allowance', side: 'Debit' },
  { rule: 'Airtime allowance', code: 'AIRTIME', account: '6130 Communication Allowance', side: 'Debit' },
  { rule: 'Performance bonus', code: 'BONUS', account: '6140 Staff Bonuses', side: 'Debit' },
  { rule: 'PAYE', code: 'PAYE', account: '2310 PAYE Payable', side: 'Credit' },
  { rule: 'SHIF', code: 'SHIF', account: '2320 SHIF Payable', side: 'Credit' },
  { rule: 'NSSF (employee + employer)', code: 'NSSF', account: '2330 NSSF Payable', side: 'Credit' },
  { rule: 'Housing Levy', code: 'AHL', account: '2340 Housing Levy Payable', side: 'Credit' },
  { rule: 'Withholding tax (consultants)', code: 'WHT', account: '2350 Withholding Tax Payable', side: 'Credit' },
  { rule: 'Net pay', code: 'NET', account: '2100 Salaries Payable', side: 'Credit' },
]

const FLOW = [
  { title: 'Generated in Annex HR', body: 'Attendance, leave and bonuses feed the payroll draft.' },
  { title: 'Approved in Annex HR', body: 'Finance → HR → CEO sign-off with full audit trail.' },
  { title: 'Journal posted to Odoo', body: 'One balanced entry in the Salaries journal (SAL).' },
  { title: 'Paid from Odoo', body: 'Accountant validates and exports the bank payment batch.' },
]

export function IntegrationsTab() {
  const { workspace } = useWorkspace()
  const [testing, setTesting] = useState(false)

  const test = () => {
    setTesting(true)
    window.setTimeout(() => {
      setTesting(false)
      toast.success('Connection healthy', { description: `${workspace.slug}-prod.odoo.com responded in 184 ms · XML-RPC v17` })
    }, 1300)
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold tracking-tight">Odoo Accounting</div>
                <div className="text-xs text-muted-foreground">Payroll journal & approvals</div>
              </div>
              <Badge variant="success" dot>
                Connected
              </Badge>
            </div>
            <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
              {[
                ['Database', `${workspace.slug}-prod.odoo.com`],
                ['Company', `${workspace.name} Ltd`],
                ['Journal', 'Salaries (SAL)'],
                ['Last sync', '20 Sep 2026, 18:42 · August payroll'],
                ['Auth', 'API key · rotated 3 Sep 2026'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={test} disabled={testing}>
                {testing && <Loader2 className="animate-spin" />} {testing ? 'Testing…' : 'Test connection'}
              </Button>
              <Badge variant="muted" className="h-9 px-3">
                TLS 1.3 · IP allow-listed
              </Badge>
            </div>
          </Card>
        </motion.div>

        <Section title="Salary rule → Odoo account mapping" description="Every payroll line posts to a mapped chart-of-accounts code" contentClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Salary rule</TableHead>
                <TableHead className="hidden sm:table-cell">Code</TableHead>
                <TableHead>Odoo account</TableHead>
                <TableHead className="hidden sm:table-cell">Side</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MAPPINGS.map((m) => (
                <TableRow key={m.code}>
                  <TableCell className="py-2.5 font-medium">{m.rule}</TableCell>
                  <TableCell className="hidden py-2.5 sm:table-cell">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{m.code}</code>
                  </TableCell>
                  <TableCell className="py-2.5 tabular">{m.account}</TableCell>
                  <TableCell className="hidden py-2.5 sm:table-cell">
                    <Badge variant={m.side === 'Debit' ? 'outline' : 'muted'}>{m.side}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <Section title="Payroll approvals on Odoo" description="Annex HR owns the people data and approvals; Odoo owns the ledger and the money movement.">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f, i) => (
            <motion.li
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="min-w-0 rounded-xl border bg-subtle p-4"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary tabular">Step {i + 1}</div>
              <div className="mt-1 text-sm font-semibold">{f.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{f.body}</div>
            </motion.li>
          ))}
        </ol>
        <div className="mt-4 rounded-lg bg-success-soft p-3 text-xs text-success">
          Journal entries post as drafts. Nothing moves in Odoo until all three Annex HR approvals are complete.
        </div>
      </Section>
    </div>
  )
}
