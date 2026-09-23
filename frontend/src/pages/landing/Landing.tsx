import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowRight,
  CalendarDays,
  FolderLock,
  Gauge,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Play,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
  CircleCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { PersonAvatar } from '@/components/ui/avatar'
import { Logo } from '@/components/shared/Logo'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { useTheme } from '@/context/theme'
import { cn } from '@/lib/utils'
import { HeroDashboard } from './HeroDashboard'
import { WorkflowFlow } from './WorkflowFlow'
import { TrustedLogos } from './TrustedLogos'
import { Reveal, SectionHeading } from './Reveal'

const navLinks = [
  { label: 'Platform', href: '#platform' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Why Annex', href: '#why' },
  { label: 'Customers', href: '#customers' },
]

const features: { title: string; body: string; icon: LucideIcon }[] = [
  { title: 'Employee Directory', body: 'One searchable record for every person, contract and reporting line.', icon: Users },
  { title: 'Onboarding Automation', body: 'Checklists, documents and IT access that run themselves from day one.', icon: Rocket },
  { title: 'Leave Management', body: 'Balances, accruals and approvals aligned with the Employment Act.', icon: CalendarDays },
  { title: 'Payroll Automation', body: 'PAYE, SHIF, NSSF and Housing Levy computed and approved in minutes.', icon: Wallet },
  { title: 'Performance Reviews', body: 'Goals, 360° feedback and calibrated review cycles on autopilot.', icon: Gauge },
  { title: 'Compliance Management', body: 'Expiring permits, KRA PINs and policy sign-offs tracked with alerts.', icon: ShieldCheck },
  { title: 'Consultants & Timesheets', body: 'Log hours, approve timesheets and pay contractors accurately.', icon: Timer },
  { title: 'Exit & Offboarding', body: 'Clearance, asset returns and final dues handled without spreadsheets.', icon: LogOut },
]

const testimonials = [
  {
    quote: 'We replaced four spreadsheets and a shared inbox. Leave approvals that took three days now close the same morning.',
    name: 'Faith Njeri',
    title: 'Head of People, Annex Technologies',
  },
  {
    quote: 'Payroll used to eat the last week of every month. With Annex HR the statutory numbers are right the first time and finance signs off in one click.',
    name: 'Peter Kamande',
    title: 'Managing Director, Demo Manufacturing Ltd',
  },
  {
    quote: 'Our consultants submit timesheets from their phones and every employee file is finally digital and audit-ready.',
    name: 'Grace Akinyi',
    title: 'Admin Manager, CHQI',
  },
]

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

function Nav({ onDemo }: { onDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('sticky top-0 z-40 border-b transition-colors', scrolled ? 'border-border bg-background/80 backdrop-blur-xl' : 'border-transparent bg-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/signup">
              Start free <ArrowRight />
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Site navigation</SheetDescription>
              <Logo />
              <nav className="mt-8 grid grid-cols-1 gap-1" aria-label="Mobile">
                {navLinks.map((l) => (
                  <SheetClose asChild key={l.href}>
                    <a href={l.href} className="rounded-lg px-3 py-3 text-base font-medium hover:bg-muted">
                      {l.label}
                    </a>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto grid grid-cols-1 gap-2 pt-8">
                <SheetClose asChild>
                  <Button variant="outline" size="lg" onClick={onDemo}>
                    Book Demo
                  </Button>
                </SheetClose>
                <Button asChild variant="secondary" size="lg">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="/signup">Start free</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}


function Hero({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_22%,transparent),transparent)]" />
        <div className="absolute -right-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--secondary)_16%,transparent),transparent)]" />
      </div>
      <div className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:gap-12 lg:pb-24 lg:pt-20">
        <div className="text-center lg:text-left">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-accent/70 px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="size-3.5" />
              HR &amp; payroll software for African companies
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-5 text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.6rem]"
          >
            Hire, pay and manage your team{' '}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">in one place.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg lg:mx-0"
          >
            Annex HR runs onboarding, leave, payroll and performance for you — so your HR team spends less time on paperwork and more time on people.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Button asChild size="xl">
              <Link to="/signup">
                Start Free Company Workspace <ArrowRight />
              </Link>
            </Button>
            <Button size="xl" variant="outline" onClick={onDemo}>
              <Play /> Book Demo
            </Button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground lg:justify-start"
          >
            {['Payroll with PAYE, SHIF & NSSF built in', 'Leave approved in one tap', 'Every employee file in one place'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 font-medium">
                <CircleCheck className="size-4 text-primary" /> {t}
              </span>
            ))}
          </motion.div>
        </div>
        <HeroDashboard />
      </div>
    </section>
  )
}

function Trusted() {
  return (
    <section className="pb-8 sm:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trusted by growing organisations across East Africa</p>
        </Reveal>
        <div className="mt-6">
          <TrustedLogos />
        </div>
      </div>
    </section>
  )
}

function Platform() {
  return (
    <section id="platform" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Platform"
          title="Every HR process, one connected system"
          description="Eight modules that share one employee record, so every change flows through onboarding, payroll and compliance automatically."
        />
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.06}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="group h-full rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="size-5 transition-transform duration-300 group-hover:scale-110" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-20 border-y bg-subtle py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Workflow"
          title="From company registration to live reports"
          description="Set up your workspace once. Annex HR routes every request to the right manager and keeps your reports current."
        />
        <Reveal className="mt-12 rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
          <WorkflowFlow />
        </Reveal>
      </div>
    </section>
  )
}

function Why() {
  const metrics: { value?: number; suffix?: string; title: string; label: string; body: string; icon: LucideIcon }[] = [
    { value: 90, suffix: '%', title: 'Less Manual HR Work', label: 'less manual HR work', body: 'Approvals, reminders and document chasing run on rules you define.', icon: Sparkles },
    { value: 100, suffix: '%', title: 'Digital Employee Files', label: 'digital employee files', body: 'Contracts, IDs, KRA PINs and sign-offs stored securely per employee.', icon: FolderLock },
    { title: 'Automated', label: 'Performance cycles', body: 'Reviews open, remind and close themselves, with calibration built in.', icon: Gauge },
    { title: 'Payroll Ready', label: 'Integrations', body: 'Export to Odoo, QuickBooks or your bank file with statutory deductions applied.', icon: Plug },
  ]
  return (
    <section id="why" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Why Annex HR" title="Built for how African teams actually work" description="Local statutory rules, multi-country offices and mobile-first employees are the default, not an add-on." />
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m, i) => (
            <Reveal key={m.label} delay={i * 0.08}>
              <div className="relative h-full overflow-hidden rounded-2xl border bg-card p-6">
                <div className="absolute -right-10 -top-10 size-32 rounded-full bg-accent/60 blur-2xl" aria-hidden />
                <m.icon className="relative size-5 text-primary" />
                <div className="relative mt-5 text-4xl font-bold tracking-tight tabular">
                  {m.value !== undefined ? (
                    <>
                      <AnimatedNumber value={m.value} duration={1.4} />
                      {m.suffix}
                    </>
                  ) : (
                    <span className="text-3xl">{m.title}</span>
                  )}
                </div>
                <div className="relative mt-1 font-semibold capitalize">{m.label}</div>
                <p className="relative mt-2 text-sm text-muted-foreground">{m.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section id="customers" className="scroll-mt-20 border-t bg-subtle py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow="Customers" title="What people leaders say" description="Finance, technology, healthcare and faith organisations run their people operations on Annex HR." />
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.1}>
              <motion.figure whileHover={{ y: -3 }} className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex gap-0.5 text-warning" aria-label="Rated 5 out of 5">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} className="size-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed">“{t.quote}”</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <PersonAvatar name={t.name} className="size-10" />
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.title}</div>
                  </div>
                </figcaption>
              </motion.figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaBand({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-secondary px-6 py-12 text-center text-white shadow-2xl shadow-primary/25 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse,black,transparent_70%)]" aria-hidden />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">Give your people team its week back.</h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-white/85">Create your company workspace in minutes. Free for 30 days, no card required.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="xl" variant="white">
              <Link to="/signup">
                Start Free Company Workspace <ArrowRight />
              </Link>
            </Button>
            <Button size="xl" onClick={onDemo} className="border border-white/40 bg-white/10 text-white shadow-none hover:bg-white/20">
              Book Demo
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function Footer({ onDemo }: { onDemo: () => void }) {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    { title: 'Company', links: [{ label: 'About', href: '#why' }, { label: 'Customers', href: '#customers' }, { label: 'Careers', href: '#' }, { label: 'Contact', href: 'mailto:hello@annexhr.com' }] },
    { title: 'Resources', links: [{ label: 'Platform', href: '#platform' }, { label: 'Kenya payroll guide', href: '#' }, { label: 'Help centre', href: '#' }, { label: 'Status', href: '#' }] },
    { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'Data processing', href: '#' }] },
  ]
  return (
    <footer className="border-t">
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">HR and payroll software for African companies. Automate every employee journey — from first day to final pay.</p>
          <Button className="mt-5" variant="outline" onClick={onDemo}>
            Book Demo
          </Button>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-sm font-semibold">{c.title}</div>
            <ul className="mt-3 grid grid-cols-1 gap-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>© 2026 Annex HR. All rights reserved.</span>
          <span>Nairobi · Kigali · Kampala</span>
        </div>
      </div>
    </footer>
  )
}

function DemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [loading, setLoading] = useState(false)
  const [size, setSize] = useState('51–200')
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').split(' ')[0]
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      onOpenChange(false)
      toast.success(`Thanks${name ? `, ${name}` : ''}! Demo request received`, { description: 'Our team will reach out within one business day.' })
    }, 900)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a demo</DialogTitle>
          <DialogDescription>A 30-minute walkthrough tailored to your company, with a people-ops specialist.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="demo-name">Full name</Label>
              <Input id="demo-name" name="name" required placeholder="Achieng Odhiambo" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="demo-email">Work email</Label>
              <Input id="demo-email" name="email" type="email" required placeholder="you@company.co.ke" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="demo-company">Company</Label>
              <Input id="demo-company" name="company" required placeholder="Company name" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label>Company size</Label>
              <SimpleSelect value={size} onValueChange={setSize} options={['1–10', '11–50', '51–200', '201–500', '500+']} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <LoaderCircle className="animate-spin" />}
              {loading ? 'Sending…' : 'Request demo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Landing() {
  const [demo, setDemo] = useState(false)
  const openDemo = () => setDemo(true)
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <Nav onDemo={openDemo} />
      <main>
        <Hero onDemo={openDemo} />
        <Trusted />
        <Platform />
        <Workflow />
        <Why />
        <Testimonials />
        <CtaBand onDemo={openDemo} />
      </main>
      <Footer onDemo={openDemo} />
      <DemoDialog open={demo} onOpenChange={setDemo} />
    </div>
  )
}
