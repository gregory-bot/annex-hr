import type { Department, Employee, Ticket, TicketPriority, TicketStatus, TicketTeam, TicketTeamKey, Workspace } from './types'

/**
 * Deterministic demo tickets for the Linear-style ticketing module.
 * Uses its own PRNG stream so adding tickets never shifts the rest of the seed.
 */

/** The five teams every workspace starts with (also used for new sign-ups). */
export const DEFAULT_TICKET_TEAMS: { key: TicketTeamKey; name: string; color: string }[] = [
  { key: 'ENG', name: 'Engineering', color: '#C1121F' },
  { key: 'IT', name: 'IT Support', color: '#2563EB' },
  { key: 'HR', name: 'People & HR', color: '#DB2777' },
  { key: 'FIN', name: 'Finance', color: '#059669' },
  { key: 'OPS', name: 'Facilities & Ops', color: '#D97706' },
]

/** Teams whose tickets are private to the reporter, assignee and HR/exec roles. */
export const PRIVATE_TICKET_TEAMS: string[] = ['HR']

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (rnd: () => number, min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min
const pick = <T,>(rnd: () => number, arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!

type Who = 'r' | 'a' | 'x' // reporter, assignee, another teammate on the owning team

interface Template {
  team: TicketTeamKey
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  comments?: [Who, string][]
  /** Only for software-heavy workspaces. */
  tech?: boolean
  /** Only for workspaces that are not software companies. */
  nonTech?: boolean
  unassigned?: boolean
  due?: number // days from today
  reporter?: 'hr' | 'lead'
}

const templates: Template[] = [
  // ── Engineering ──
  {
    team: 'ENG',
    title: 'Access to Grafana dashboards',
    description: 'I need read access to the Production Grafana folder (Payments API latency and Kafka consumer lag) before my on-call rotation starts on Monday.',
    status: 'Done',
    priority: 'Medium',
    labels: ['access', 'observability'],
    comments: [
      ['a', 'Added you to the grafana-viewers group. Can you confirm you can see the "Payments API" folder?'],
      ['r', 'Confirmed — I can see both dashboards now. Thanks!'],
    ],
    tech: true,
  },
  {
    team: 'ENG',
    title: 'CI pipeline failing on main — flaky integration tests',
    description: 'The `integration-postgres` job has failed 4 of the last 6 runs on main. Failures are timeouts in the ledger reconciliation suite, not assertion errors. This is blocking the Friday release.',
    status: 'In Progress',
    priority: 'Urgent',
    labels: ['ci', 'bug'],
    comments: [
      ['a', 'Looks like the test container is starved — the runner pool was downsized last week. Bumping the job to the large runner as a first step.'],
      ['x', 'FYI the same suite passes locally in ~90s, so it is almost certainly resource contention.'],
    ],
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Refresh staging database from anonymised production snapshot',
    description: 'Staging data is three months old and QA cannot reproduce the M-Pesa callback issues reported by the client. Please restore last Sunday’s anonymised snapshot.',
    status: 'Todo',
    priority: 'High',
    labels: ['infra', 'staging'],
    due: 3,
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Rotate AWS access keys for the analytics service account',
    description: 'Quarterly key rotation is due for `svc-analytics`. Keys are referenced in the Airflow connections and two Lambda functions.',
    status: 'In Review',
    priority: 'High',
    labels: ['security', 'infra'],
    comments: [
      ['a', 'New keys are in Secrets Manager and Airflow connections are updated. PR for the Lambda env vars is up for review.'],
      ['x', 'Reviewed — one nit on the IAM policy, otherwise good to merge.'],
    ],
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Airflow nightly ingest DAG running out of memory',
    description: 'The `retail_bank_daily_ingest` DAG has been killed with OOM on the transform step for the last three nights. Row counts roughly doubled after the new branch data feed went live.',
    status: 'In Progress',
    priority: 'High',
    labels: ['data-platform', 'bug'],
    comments: [
      ['a', 'Switching the transform to process partitions in chunks of 500k rows instead of loading the whole day into memory.'],
    ],
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Provision dbt Cloud seat for new analytics engineer',
    description: 'Our new analytics engineer starts on the 28th and needs a developer seat plus access to the `client_telco` project.',
    status: 'Todo',
    priority: 'Medium',
    labels: ['access', 'onboarding'],
    due: 4,
    reporter: 'lead',
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Add Google Workspace SSO to the internal admin tool',
    description: 'The internal admin tool still uses local passwords. We should move it behind Google Workspace SSO before the ISO 27001 audit in November.',
    status: 'Backlog',
    priority: 'Medium',
    labels: ['feature', 'security'],
    unassigned: true,
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Deprecate legacy /v1/reports endpoint',
    description: 'Only one client still calls `/v1/reports`. Agree a sunset date with Delivery and add a deprecation header in the meantime.',
    status: 'Backlog',
    priority: 'Low',
    labels: ['tech-debt'],
    unassigned: true,
    tech: true,
  },
  {
    team: 'ENG',
    title: 'Replace the paper incident log with a simple digital form',
    description: 'Supervisors still fill in incidents on paper and scan them weekly. A shared digital form with photo upload would save hours and make trends visible.',
    status: 'Backlog',
    priority: 'Low',
    labels: ['feature'],
    unassigned: true,
    nonTech: true,
  },
  {
    team: 'ENG',
    title: 'Website contact form sending enquiries to an old inbox',
    description: 'Enquiries from the website contact form are going to an address that was retired in July. We may have missed customer requests.',
    status: 'In Progress',
    priority: 'High',
    labels: ['bug', 'website'],
    comments: [['a', 'Found it — the form still posts to the old SMTP relay. Updating the recipient and adding a copy to the shared inbox.']],
    nonTech: true,
  },

  // ── IT Support ──
  {
    team: 'IT',
    title: 'Laptop not connecting to VPN',
    description: 'Since yesterday’s macOS update GlobalProtect hangs at "Connecting…" and then times out. I’m working remotely today and can’t reach the file server or the ERP.',
    status: 'In Progress',
    priority: 'High',
    labels: ['vpn', 'network'],
    comments: [
      ['a', 'Can you remove the VPN profile and reinstall it from Self Service? The update reset the system extension approval.'],
      ['r', 'Reinstalled — still stuck on Connecting…'],
      ['a', 'I’ve pushed a new configuration profile to your device. Please restart and try again.'],
    ],
  },
  {
    team: 'IT',
    title: 'Onboarding: GitHub + Slack access for new starter',
    description: 'Please set up accounts for {newStarter}, who joins this week: Google Workspace, Slack (#general, #team-channel), GitHub org membership and 1Password.',
    status: 'Todo',
    priority: 'High',
    labels: ['onboarding', 'access'],
    due: 2,
    reporter: 'hr',
    comments: [['a', 'Google account created. Slack and GitHub invites go out once the laptop is enrolled in MDM.']],
  },
  {
    team: 'IT',
    title: 'Cracked laptop screen needs replacing',
    description: 'My laptop screen cracked in transit. It still works but there’s a line across the bottom third. Asset tag {asset}.',
    status: 'In Review',
    priority: 'Medium',
    labels: ['hardware'],
    comments: [
      ['a', 'Replacement screen arrived from the supplier. Can you drop the laptop at the IT desk on Thursday morning? Loaner is ready.'],
      ['r', 'Dropped it off, thanks for the loaner.'],
      ['a', 'Screen replaced — please check it over before I close this.'],
    ],
  },
  {
    team: 'IT',
    title: 'MFA reset — lost phone',
    description: 'I lost my phone over the weekend and can’t sign in to email or the HR system. I have a new SIM with the same number.',
    status: 'Done',
    priority: 'Urgent',
    labels: ['security', 'access'],
    comments: [
      ['a', 'Identity verified by phone. MFA has been reset — you’ll be prompted to enrol your new device at next sign-in.'],
      ['r', 'All working again. Thank you for the quick turnaround.'],
    ],
  },
  {
    team: 'IT',
    title: 'Scan-to-email not working on the 2nd floor printer',
    description: 'The Kyocera on the 2nd floor shows "SMTP authentication failed" when scanning to email. Printing works fine.',
    status: 'Todo',
    priority: 'Low',
    labels: ['printer'],
  },
  {
    team: 'IT',
    title: 'Second monitor for home office',
    description: 'Requesting a 24" monitor for my home setup under the hybrid work policy. Approved by my manager.',
    status: 'Backlog',
    priority: 'Low',
    labels: ['hardware', 'request'],
    unassigned: true,
  },
  {
    team: 'IT',
    title: 'Access to the finance@ shared mailbox',
    description: 'I’m covering supplier queries while a colleague is on leave and need delegate access to finance@ for two weeks.',
    status: 'Done',
    priority: 'Medium',
    labels: ['access', 'email'],
    comments: [['a', 'Delegate access granted until the 9th. It should appear in Outlook within 30 minutes.']],
  },
  {
    team: 'IT',
    title: 'Wi-Fi keeps dropping in the boardroom',
    description: 'Video calls in the boardroom drop every 10–15 minutes. Other rooms seem fine. Happened during two client calls this week.',
    status: 'In Progress',
    priority: 'High',
    labels: ['network'],
    comments: [
      ['a', 'The boardroom access point is on an old firmware and roaming aggressively. Scheduled an update for 7pm tonight.'],
      ['x', 'Let’s also move the AP off channel 6 — it overlaps with the neighbouring office.'],
    ],
  },
  {
    team: 'IT',
    title: 'Microsoft 365 licence for incoming contractor',
    description: 'We have a contractor joining for a three-month engagement who needs an E3 licence and access to the project SharePoint.',
    status: 'Canceled',
    priority: 'Low',
    labels: ['licence'],
    comments: [['r', 'Cancelling — the contractor will use their own firm’s tenant with guest access instead.']],
  },

  // ── People & HR ──
  {
    team: 'HR',
    title: 'Payslip shows wrong SHIF deduction',
    description: 'My August payslip deducts SHIF of KES 4,950, but at 2.75% of my gross it should be closer to KES 3,850. Could you check whether an arrear was applied?',
    status: 'In Review',
    priority: 'High',
    labels: ['payroll', 'shif'],
    comments: [
      ['a', 'Thanks for flagging. It looks like a one-off July arrear was added to August. I’m confirming with Finance.'],
      ['a', 'Confirmed: KES 1,100 was a July top-up. A breakdown note will be added to your payslip and September will be correct.'],
      ['r', 'That makes sense, thanks for explaining.'],
    ],
  },
  {
    team: 'HR',
    title: 'Update bank details for salary payments',
    description: 'I’ve moved my salary account from Equity to NCBA. The bank letter is attached in my documents.',
    status: 'Done',
    priority: 'Medium',
    labels: ['payroll', 'profile'],
    comments: [['a', 'Updated and verified with Finance. The change applies from the September payroll.']],
  },
  {
    team: 'HR',
    title: 'Leave balance not showing carried-over days',
    description: 'I carried over 5 annual leave days from last year, but my balance only shows the 2026 accrual.',
    status: 'Todo',
    priority: 'Medium',
    labels: ['leave'],
  },
  {
    team: 'HR',
    title: 'Employment confirmation letter for visa application',
    description: 'I need a letter confirming my role, start date and salary for a Schengen visa application. Appointment is on the 2nd.',
    status: 'In Progress',
    priority: 'High',
    labels: ['letters'],
    due: 5,
    comments: [['a', 'Draft is ready and waiting for signature from the Head of People. You’ll have it by Friday.']],
  },
  {
    team: 'HR',
    title: 'Add newborn as a dependant on medical cover',
    description: 'Our daughter was born on the 14th. Please add her to my medical cover — the birth notification is attached.',
    status: 'In Progress',
    priority: 'Medium',
    labels: ['benefits'],
    comments: [['a', 'Congratulations! Forms submitted to the insurer; cover is backdated to the date of birth.']],
  },
  {
    team: 'HR',
    title: 'P9 form for 2025 tax returns',
    description: 'I didn’t receive my P9 form and need it to file on iTax before the deadline.',
    status: 'Done',
    priority: 'Medium',
    labels: ['tax', 'kra'],
    comments: [['a', 'Your P9 has been uploaded to Documents → Payslips.']],
  },
  {
    team: 'HR',
    title: 'Clarify probation review date',
    description: 'My offer letter says a 3-month probation, but the system shows my review a month later. Which date is correct?',
    status: 'Backlog',
    priority: 'Low',
    labels: ['probation'],
    unassigned: true,
  },

  // ── Finance ──
  {
    team: 'FIN',
    title: 'Expense claim for Kisumu client visit not reimbursed',
    description: 'I submitted a claim for KES 18,400 (fuel, accommodation, meals) on the 2nd and it still shows as pending.',
    status: 'In Progress',
    priority: 'Medium',
    labels: ['expenses'],
    comments: [
      ['a', 'Two receipts were missing from the claim. Could you upload the hotel invoice and the fuel receipt?'],
      ['r', 'Uploaded both just now.'],
    ],
  },
  {
    team: 'FIN',
    title: 'Per diem advance for regional workshop',
    description: 'Requesting a per diem advance for 4 nights for the regional partner workshop. Travel is approved by my manager.',
    status: 'Todo',
    priority: 'High',
    labels: ['travel', 'advance'],
    due: 6,
  },
  {
    team: 'FIN',
    title: 'Supplier invoice stuck in approval',
    description: 'Invoice INV-2026-0918 from our cleaning services supplier has been pending approval for three weeks and they’ve sent a reminder.',
    status: 'Done',
    priority: 'High',
    labels: ['vendor', 'payables'],
    comments: [
      ['a', 'The approver was on leave. Re-routed to the deputy and the invoice is approved.'],
      ['a', 'Payment released in today’s run.'],
    ],
  },
  {
    team: 'FIN',
    title: 'Corporate card limit increase for cloud billing',
    description: 'Our monthly cloud bill is now above the KES 500,000 card limit and the last charge was declined.',
    status: 'In Review',
    priority: 'Urgent',
    labels: ['card'],
    comments: [['a', 'The bank has approved a temporary increase to KES 800,000. Waiting on CEO sign-off to make it permanent.']],
  },
  {
    team: 'FIN',
    title: 'Confirm 2026 mileage reimbursement rate',
    description: 'Is the mileage rate still KES 35/km after the fuel price review, or has it changed?',
    status: 'Backlog',
    priority: 'Low',
    labels: ['question'],
    unassigned: true,
  },

  // ── Facilities & Ops ──
  {
    team: 'OPS',
    title: 'Broken chair in meeting room 2',
    description: 'One of the chairs in meeting room 2 has a broken gas lift and sinks to the floor. It’s been moved to the corner and taped.',
    status: 'Todo',
    priority: 'Low',
    labels: ['furniture'],
  },
  {
    team: 'OPS',
    title: 'Air conditioning not working on the 3rd floor',
    description: 'The AC on the 3rd floor has been off since Monday. It’s above 29°C in the afternoons.',
    status: 'In Progress',
    priority: 'High',
    labels: ['hvac'],
    comments: [
      ['a', 'Technician is booked for Thursday 9am. Portable fans are in the store room in the meantime.'],
      ['r', 'Thanks — the fans help a lot.'],
    ],
  },
  {
    team: 'OPS',
    title: 'Access card not opening the side entrance',
    description: 'My access card works at the main door but not the side entrance near the parking lot.',
    status: 'Done',
    priority: 'Medium',
    labels: ['access-card', 'security'],
    comments: [['a', 'Your card was missing from the side-door access group. Added — please test it tomorrow morning.']],
  },
  {
    team: 'OPS',
    title: 'Book boardroom and catering for the quarterly all-hands',
    description: 'Quarterly all-hands on the 30th, 2pm–5pm. We expect about 40 people in person — please arrange tea, snacks and the screen.',
    status: 'In Review',
    priority: 'Medium',
    labels: ['events'],
    due: 7,
    reporter: 'hr',
    comments: [['a', 'Boardroom booked and catering quote received (KES 24,000). Can you confirm headcount by Friday?']],
  },
  {
    team: 'OPS',
    title: 'Water dispenser in the kitchen needs servicing',
    description: 'The water dispenser is leaking and the filter light has been red for a week.',
    status: 'Backlog',
    priority: 'None',
    labels: ['kitchen'],
    unassigned: true,
  },
  {
    team: 'OPS',
    title: 'Reserved parking slot request',
    description: 'Requesting a reserved parking slot on the days I come in with equipment for client demos.',
    status: 'Canceled',
    priority: 'None',
    labels: ['parking'],
    comments: [['a', 'We don’t have reserved slots available this quarter — the loading bay can be used for drop-offs.']],
  },
]

const teamPools: Record<TicketTeamKey, RegExp> = {
  ENG: /Software|Data Engineering|Maintenance|Research/,
  IT: /Software Engineering|Maintenance|Administration/,
  HR: /People|Administration/,
  FIN: /Finance/,
  OPS: /Admin|Supply Chain|Maintenance/,
}
const startNumbers: Record<TicketTeamKey, number> = { ENG: 131, IT: 212, HR: 48, FIN: 27, OPS: 63 }

const NOW = Date.parse('2026-09-23T14:30:00Z')
const HOUR = 3_600_000

/** Titles that best fit each team, preferred when picking assignees. */
const teamTitles: Record<TicketTeamKey, RegExp> = {
  ENG: /Engineer|Developer|Technician|Head of Engineering|Head of Data/,
  IT: /DevOps|Platform|Technician|Administrator|Backend/,
  HR: /HR|People|Talent/,
  FIN: /Account|Payroll|Finance|Credit/,
  OPS: /Admin|Technician|Logistics|Procurement|Stores/,
}

/** Employees who would plausibly work a team's tickets, best fits first. */
export function ticketAssigneePool(teamKey: string, employees: Employee[], departments: Department[]) {
  const key = teamKey as TicketTeamKey
  const deptRe = teamPools[key]
  const titleRe = teamTitles[key]
  const deptIds = new Set(departments.filter((d) => deptRe?.test(d.name)).map((d) => d.id))
  const active = employees.filter((e) => e.status !== 'Exited' && e.role !== 'ceo')
  const isHrAdmin = (e: Employee) => e.role === 'hr_officer' || e.role === 'company_admin'
  let pool: Employee[]
  if (key === 'HR') pool = active.filter((e) => isHrAdmin(e) || (deptIds.has(e.departmentId) && /People/.test(departments.find((d) => d.id === e.departmentId)?.name ?? '')))
  else if (key === 'FIN') pool = active.filter((e) => e.role === 'finance' || deptIds.has(e.departmentId))
  else pool = active.filter((e) => deptIds.has(e.departmentId) && (key !== 'IT' || !isHrAdmin(e)))
  const fit = (e: Employee) => (titleRe?.test(e.title) ? 0 : 1) + (e.role === 'consultant' ? 1 : 0)
  pool = pool.map((e, i) => ({ e, i })).sort((a, b) => fit(a.e) - fit(b.e) || a.i - b.i).map((x) => x.e)
  return pool.length ? pool : active.filter(isHrAdmin)
}

export function buildTickets(ws: Workspace, employees: Employee[], departments: Department[], seedNo: number): { ticketTeams: TicketTeam[]; tickets: Ticket[] } {
  const rnd = mulberry32(seedNo * 7919 + 17)
  const ticketTeams: TicketTeam[] = DEFAULT_TICKET_TEAMS.map((t) => ({ id: `${ws.slug}-team-${t.key.toLowerCase()}`, ...t }))
  const teamByKey = new Map(ticketTeams.map((t) => [t.key, t]))
  const active = employees.filter((e) => e.status !== 'Exited')
  const software = ws.id === 'ws-annex'
  const hr = employees.find((e) => e.role === 'hr_officer') ?? employees.find((e) => e.role === 'company_admin')!
  const leads = employees.filter((e) => e.role === 'manager' || departments.some((d) => d.headId === e.id))
  const newStarter = active.find((e) => e.status === 'Onboarding') ?? active[active.length - 1]!
  const first = (e?: Employee) => e?.name.split(' ')[0] ?? ''

  const drafts = templates
    .filter((t) => (software ? !t.nonTech : !t.tech))
    .map((t, i) => {
      const team = teamByKey.get(t.team)!
      const pool = ticketAssigneePool(t.team, employees, departments)
      let reporter: Employee
      if (t.reporter === 'hr') reporter = hr
      else if (t.reporter === 'lead' && leads.length) reporter = pick(rnd, leads)
      else {
        const others = active.filter((e) => !pool.slice(0, 4).some((p) => p.id === e.id))
        reporter = pick(rnd, others.length ? others : active)
      }
      const candidates = pool.filter((e) => e.id !== reporter.id)
      const assignee = t.unassigned || !candidates.length ? undefined : candidates[Math.floor(rnd() * Math.min(candidates.length, 4))]!
      const teammates = candidates.filter((e) => e.id !== assignee?.id)
      const other = teammates.length ? pick(rnd, teammates) : (assignee ?? reporter)

      const closed = t.status === 'Done' || t.status === 'Canceled'
      const comments = (t.comments ?? []).filter(([w]) => w !== 'a' || assignee)
      const minDays = Math.ceil((comments.length * 20) / 24) + 1
      const daysAgo = Math.max(minDays, closed ? between(rnd, 6, 38) : t.status === 'Backlog' ? between(rnd, 3, 30) : between(rnd, 1, 14))
      const created = NOW - daysAgo * 24 * HOUR - between(rnd, 0, 6) * HOUR - between(rnd, 0, 59) * 60_000
      let cursor = created
      const fill = (s: string) =>
        s
          .replace('{newStarter}', newStarter.name)
          .replace('{asset}', `${ws.slug.slice(0, 3).toUpperCase()}-LT-${between(rnd, 100, 480)}`)
          .replace('{assignee}', first(assignee))
          .replace('{reporter}', first(reporter))
      const ticketId = `tk-${ws.id}-${String(i + 1).padStart(2, '0')}`
      const mapped = comments.map(([w, body], k) => {
        cursor += between(rnd, 2, 20) * HOUR + between(rnd, 0, 59) * 60_000
        return {
          id: `${ticketId}-c${k + 1}`,
          authorId: (w === 'r' ? reporter : w === 'a' ? assignee! : other).id,
          body: fill(body),
          createdAt: new Date(Math.min(cursor, NOW)).toISOString(),
        }
      })
      const updated = Math.min(NOW, Math.max(cursor, created) + between(rnd, 1, 5) * HOUR)
      const ticket: Ticket = {
        id: ticketId,
        identifier: '',
        teamId: team.id,
        title: t.title,
        description: fill(t.description),
        status: t.status,
        priority: t.priority,
        reporterId: reporter.id,
        assigneeId: assignee?.id,
        labels: t.labels,
        createdAt: new Date(created).toISOString(),
        updatedAt: new Date(updated).toISOString(),
        dueDate: t.due !== undefined ? new Date(Date.parse('2026-09-23') + t.due * 24 * HOUR).toISOString().slice(0, 10) : undefined,
        comments: mapped,
      }
      return { ticket, key: t.team }
    })

  // Identifiers ascend with creation time inside each team, like a real tracker.
  const counters = { ...startNumbers }
  ;[...drafts]
    .sort((a, b) => a.ticket.createdAt.localeCompare(b.ticket.createdAt))
    .forEach((d) => {
      d.ticket.identifier = `${d.key}-${counters[d.key]++}`
    })

  const tickets = drafts.map((d) => d.ticket).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { ticketTeams, tickets }
}
