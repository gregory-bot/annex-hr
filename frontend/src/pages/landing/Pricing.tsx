import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Reveal, SectionHeading } from './Reveal'

interface Plan {
  name: string
  tagline: string
  /** Monthly price in USD for the whole company. */
  price: number
  audience: string
  features: string[]
  cta: { label: string; to?: string }
  featured?: boolean
}

const plans: Plan[] = [
  {
    name: 'Starter',
    tagline: 'Get your people records in order.',
    price: 94,
    audience: 'Up to 50 employees',
    features: [
      'Employee directory and digital files',
      'Onboarding checklists and policy sign-offs',
      'Leave requests, approvals and holiday calendars',
      'Clock-in / clock-out attendance',
      'Email support',
    ],
    cta: { label: 'Start free trial', to: '/signup' },
  },
  {
    name: 'Growth',
    tagline: 'Run HR and payroll end to end.',
    price: 187,
    audience: 'Up to 500 employees',
    features: [
      'Everything in Starter',
      'Payroll with PAYE, SHIF, NSSF and Housing Levy',
      'Consultant timesheets and billable hours',
      'Performance reviews, KPIs and pulse surveys',
      'Compliance and document-expiry alerts',
      'Reports with PDF and Excel export',
      'Priority support',
    ],
    cta: { label: 'Start free trial', to: '/signup' },
    featured: true,
  },
  {
    name: 'Enterprise',
    tagline: 'For large and multi-country teams.',
    price: 270,
    audience: 'Unlimited employees',
    features: [
      'Everything in Growth',
      'Multi-country payroll and entities',
      'Odoo and ERP integrations, API access',
      'SSO, enforced 2FA and full audit logs',
      'Confidential case management',
      'Dedicated success manager and SLA',
    ],
    cta: { label: 'Talk to sales' },
  },
]

const usd = (n: number) => `$${new Intl.NumberFormat('en-US').format(n)}`

export function Pricing({ onContactSales }: { onContactSales: () => void }) {
  return (
    <section id="pricing" className="scroll-mt-20 border-t bg-subtle py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Pricing" title="Simple pricing that grows with your team" description="One monthly price for your whole company. Every plan starts with a 30-day free trial." />


        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((plan, i) => {
            return (
              <Reveal key={plan.name} delay={i * 0.06}>
                <div className={cn('relative flex h-full flex-col rounded-2xl border bg-card p-6 sm:p-8', plan.featured && 'border-primary ring-1 ring-primary')}>
                  {plan.featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

                  <div className="mt-6">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-bold tracking-tight tabular">{usd(plan.price)}</span>
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Billed monthly · cancel anytime</p>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{plan.audience}</p>
                  </div>

                  {plan.cta.to ? (
                    <Button asChild size="lg" variant={plan.featured ? 'default' : 'outline'} className="mt-6 w-full">
                      <Link to={plan.cta.to}>{plan.cta.label}</Link>
                    </Button>
                  ) : (
                    <Button size="lg" variant="outline" className="mt-6 w-full" onClick={onContactSales}>
                      {plan.cta.label}
                    </Button>
                  )}

                  <ul className="mt-8 grid grid-cols-1 gap-3 border-t pt-6 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            )
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">Prices in USD, excluding applicable taxes. Non-profits and early-stage startups get special rates — talk to us.</p>
      </div>
    </section>
  )
}
