import type { DocFile, Employee, Workspace } from '@/data/types'
import { formatDate, formatKES, TODAY } from '@/lib/utils'

export function personFromName(name: string, employees: Employee[]) {
  const who = name.split(' — ')[1]?.trim()
  return who ? employees.find((e) => e.name === who) : undefined
}

export function payslip(gross: number) {
  const basic = Math.round(gross * 0.85)
  const house = gross - basic
  const nssf = Math.round(0.06 * Math.min(gross, 8000) + 0.06 * Math.max(0, Math.min(gross, 72000) - 8000))
  const shif = Math.round(gross * 0.0275)
  const housing = Math.round(gross * 0.015)
  const taxable = gross - nssf - shif - housing
  const bands: [number, number][] = [
    [24000, 0.1],
    [8333, 0.25],
    [467667, 0.3],
    [300000, 0.325],
    [Infinity, 0.35],
  ]
  let rest = taxable
  let tax = 0
  for (const [size, rate] of bands) {
    const chunk = Math.min(rest, size)
    if (chunk <= 0) break
    tax += chunk * rate
    rest -= chunk
  }
  const paye = Math.max(0, Math.round(tax - 2400))
  const deductions = paye + shif + nssf + housing
  return { basic, house, gross, paye, shif, nssf, housing, deductions, net: gross - deductions, taxable }
}

function Letterhead({ ws, title, refNo }: { ws: Workspace; title: string; refNo: string }) {
  const office = ws.offices[0]
  return (
    <div className="flex flex-col gap-3 border-b-2 border-primary pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{ws.logoText}</div>
        <div>
          <div className="font-bold tracking-tight">{ws.name}</div>
          <div className="text-[11px] text-muted-foreground">{office ? `${office.address}, ${office.city}` : ws.country}</div>
        </div>
      </div>
      <div className="text-left text-[11px] text-muted-foreground sm:text-right">
        <div className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</div>
        <div>Ref: {refNo}</div>
        <div>hr@{ws.domain}</div>
      </div>
    </div>
  )
}

function Clauses({ items }: { items: { h: string; b: string }[] }) {
  return (
    <ol className="mt-4 grid grid-cols-1 gap-3">
      {items.map((c, i) => (
        <li key={c.h}>
          <div className="text-[13px] font-semibold">
            {i + 1}. {c.h}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{c.b}</p>
        </li>
      ))}
    </ol>
  )
}

function Signatures({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
      {[left, right].map((s) => (
        <div key={s}>
          <div className="font-serif text-lg italic text-foreground">{s.split(',')[0]}</div>
          <div className="mt-1 border-t pt-1 text-muted-foreground">{s}</div>
        </div>
      ))}
    </div>
  )
}

export function DocPreview({ file, ws, employees, hrName }: { file: DocFile; ws: Workspace; employees: Employee[]; hrName: string }) {
  const emp = personFromName(file.name, employees)
  const who = emp?.name ?? 'The Employee'
  const refNo = `${ws.slug.toUpperCase().slice(0, 3)}/${file.folder.slice(0, 3).toUpperCase()}/${file.id.replace(/\D/g, '').padStart(4, '0')}`
  const paper = 'rounded-lg border bg-card p-5 text-foreground shadow-sm sm:p-7'

  if (file.folder === 'Payslips') {
    const p = payslip(emp?.salaryKES ?? 150_000)
    const period = file.name.replace('Payslip ', '').split(' — ')[0]
    const Row = ({ l, v, strong }: { l: string; v: number; strong?: boolean }) => (
      <div className={`flex justify-between gap-3 py-1.5 text-[13px] ${strong ? 'border-t font-semibold' : ''}`}>
        <span className={strong ? '' : 'text-muted-foreground'}>{l}</span>
        <span className="tabular">{formatKES(v)}</span>
      </div>
    )
    return (
      <div className={paper}>
        <Letterhead ws={ws} title={`Payslip · ${period}`} refNo={refNo} />
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          {[
            ['Employee', who],
            ['Staff no.', emp?.employeeNo ?? '—'],
            ['KRA PIN', emp?.kraPin ?? '—'],
            ['Pay date', `28 ${period}`],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-muted-foreground">{k}</div>
              <div className="truncate font-medium">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Earnings</div>
            <Row l="Basic salary" v={p.basic} />
            <Row l="House allowance" v={p.house} />
            <Row l="Gross pay" v={p.gross} strong />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deductions</div>
            <Row l="PAYE" v={p.paye} />
            <Row l="SHIF (2.75%)" v={p.shif} />
            <Row l="NSSF (Tier I & II)" v={p.nssf} />
            <Row l="Housing Levy (1.5%)" v={p.housing} />
            <Row l="Total deductions" v={p.deductions} strong />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between rounded-lg bg-accent px-4 py-3 text-accent-foreground">
          <span className="text-sm font-semibold">Net pay</span>
          <span className="text-lg font-bold tabular">{formatKES(p.net)}</span>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Taxable pay {formatKES(p.taxable)} · Personal relief KES 2,400 applied · Paid to registered bank account. Generated by Annex HR.
        </p>
      </div>
    )
  }

  if (file.folder === 'Certificates') {
    const title = file.name.split(' — ')[0]
    return (
      <div className={`${paper} text-center`}>
        <div className="rounded-md border-4 border-double border-primary/40 px-4 py-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Certificate</div>
          <div className="mt-3 font-serif text-2xl font-semibold">{title}</div>
          <p className="mt-4 text-sm text-muted-foreground">This is to certify that</p>
          <div className="mt-1 font-serif text-xl italic">{who}</div>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">has satisfied all requirements for the above award. Verified copy held on file by {ws.name} HR.</p>
          <div className="mt-6 text-xs text-muted-foreground">
            Verified {formatDate(file.updated)} · {refNo}
          </div>
        </div>
      </div>
    )
  }

  if (file.folder === 'Policies') {
    return (
      <div className={paper}>
        <Letterhead ws={ws} title="Company policy" refNo={refNo} />
        <h3 className="mt-5 text-lg font-bold">{file.name}</h3>
        <div className="text-xs text-muted-foreground">
          {file.version} · Effective {formatDate(file.updated)} · Owner: {hrName}
        </div>
        <Clauses
          items={[
            { h: 'Purpose', b: `This policy sets out the standards ${ws.name} expects from everyone who works with us.` },
            { h: 'Scope', b: 'Applies to all employees, consultants, interns and contractors in every office and when working remotely.' },
            { h: 'Responsibilities', b: 'Managers ensure their teams understand this policy. HR owns and reviews it annually.' },
            { h: 'Compliance', b: 'Breaches are handled through the disciplinary procedure in line with the Employment Act, 2007.' },
          ]}
        />
      </div>
    )
  }

  const kind = file.folder === 'NDAs' ? 'nda' : file.folder === 'Offer Letters' ? 'offer' : 'contract'
  const salary = emp ? formatKES(emp.salaryKES) : 'as agreed'
  const start = emp ? formatDate(emp.startDate, 'long') : formatDate(TODAY, 'long')

  if (kind === 'offer') {
    return (
      <div className={paper}>
        <Letterhead ws={ws} title="Offer of employment" refNo={refNo} />
        <div className="mt-5 text-[13px]">
          <div className="text-muted-foreground">{formatDate(file.updated, 'long')}</div>
          <p className="mt-3">Dear {who.split(' ')[0]},</p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            We are delighted to offer you the position of <span className="font-medium text-foreground">{emp?.title ?? 'Associate'}</span> at {ws.name}, starting{' '}
            <span className="font-medium text-foreground">{start}</span>, on a gross monthly salary of <span className="font-medium text-foreground">{salary}</span>.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            This offer is subject to satisfactory references, a valid Certificate of Good Conduct and a 90-day probation period. Please confirm your acceptance within 7 days.
          </p>
        </div>
        <Signatures left={`${hrName}, Head of People`} right={`${who}, Candidate`} />
      </div>
    )
  }

  return (
    <div className={paper}>
      <Letterhead ws={ws} title={kind === 'nda' ? 'Non-disclosure agreement' : 'Contract of employment'} refNo={refNo} />
      <div className="mt-5 text-[13px]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Between</div>
        <p className="mt-1">
          <span className="font-semibold">{ws.name}</span> (“the Company”) and <span className="font-semibold">{who}</span>
          {emp && <span className="text-muted-foreground">, ID No. {emp.nationalId}</span>} (“the Employee”).
        </p>
      </div>
      <Clauses
        items={
          kind === 'nda'
            ? [
                { h: 'Confidential information', b: 'Includes all non-public business, technical, client and employee information disclosed during employment.' },
                { h: 'Obligations', b: 'The Employee shall not disclose confidential information to any third party without written consent.' },
                { h: 'Intellectual property', b: 'All work product created in the course of employment belongs exclusively to the Company.' },
                { h: 'Data protection', b: 'Personal data shall be processed only in line with the Kenya Data Protection Act, 2019.' },
                { h: 'Duration', b: 'These obligations survive termination of employment for three (3) years.' },
              ]
            : [
                { h: 'Position & start date', b: `The Employee is employed as ${emp?.title ?? 'Associate'} with effect from ${start}.` },
                { h: 'Remuneration', b: `A gross monthly salary of ${salary}, subject to PAYE, SHIF, NSSF and the Affordable Housing Levy.` },
                { h: 'Probation', b: 'The first 90 days are probationary, during which either party may terminate with 7 days’ notice.' },
                { h: 'Hours & leave', b: '40 hours per week. 21 working days of annual leave plus public holidays gazetted in Kenya.' },
                { h: 'Termination', b: 'After probation, either party may terminate with one month’s written notice or pay in lieu.' },
              ]
        }
      />
      <Signatures left={`${hrName}, for the Company`} right={`${who}, Employee`} />
    </div>
  )
}

export function previewText(file: DocFile, ws: Workspace, employees: Employee[]) {
  const emp = personFromName(file.name, employees)
  const lines = [`${ws.name}`, `${file.name}`, `Folder: ${file.folder} · Version ${file.version}`, `Updated: ${formatDate(file.updated)}`, '']
  if (file.folder === 'Payslips') {
    const p = payslip(emp?.salaryKES ?? 150_000)
    lines.push(`Gross pay: ${formatKES(p.gross)}`, `PAYE: ${formatKES(p.paye)}`, `SHIF: ${formatKES(p.shif)}`, `NSSF: ${formatKES(p.nssf)}`, `Housing Levy: ${formatKES(p.housing)}`, `Net pay: ${formatKES(p.net)}`)
  } else {
    lines.push(`Prepared for ${emp?.name ?? ws.name}.`, 'This is a demo export generated by Annex HR.')
  }
  return lines.join('\n')
}
