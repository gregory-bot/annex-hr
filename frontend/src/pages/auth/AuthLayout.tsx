import { motion } from 'framer-motion'
import { CalendarDays, Check, Moon, ShieldCheck, Star, Sun, Users, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/avatar'
import { Logo } from '@/components/shared/Logo'
import { useTheme } from '@/context/theme'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

/** Default brand panel: product glimpse + customer testimonial on a red gradient. */
function BrandPanel({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-secondary p-10 text-white xl:p-14">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-black/15 blur-3xl" aria-hidden />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium">
          <ShieldCheck className="size-3.5" /> Isolated, encrypted company workspaces
        </span>
      </div>

      <div className="relative">
        {children ?? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-10 grid max-w-sm grid-cols-3 gap-3"
            >
              {[
                { icon: Users, label: 'Employees', value: '248' },
                { icon: CalendarDays, label: 'On leave', value: '9' },
                { icon: Wallet, label: 'Payroll', value: 'Ready' },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
                  className="rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur"
                >
                  <s.icon className="size-4 opacity-80" />
                  <div className="mt-2 text-lg font-bold">{s.value}</div>
                  <div className="text-[11px] text-white/75">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
            <div className="flex gap-0.5" aria-label="Rated 5 out of 5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-4 fill-current" />
              ))}
            </div>
            <blockquote className="mt-4 max-w-md text-balance text-2xl font-semibold leading-snug tracking-tight">
              “Annex HR gave our people team back two days every payroll cycle. Leave, onboarding and compliance finally live in one place.”
            </blockquote>
            <div className="mt-6 flex items-center gap-3">
              <PersonAvatar name="Wanjiku Kamau" className="size-10 ring-2 ring-white/40" />
              <div>
                <div className="text-sm font-semibold">Wanjiku Kamau</div>
                <div className="text-xs text-white/75">Head of People, Umba</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="relative flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/80">
        {['PAYE, SHIF & NSSF built in', 'Data Protection Act 2019', 'SOC 2-aligned controls'].map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <Check className="size-3.5" /> {t}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Split-screen auth layout: form on the left, brand panel on the right (hidden below lg). */
export function AuthLayout({
  children,
  aside,
  topRight,
  wide,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
  topRight?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="grid grid-cols-1 min-h-dvh bg-background lg:grid-cols-[1fr_minmax(0,0.9fr)]">
      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between gap-2 px-4 sm:px-8">
          <Logo />
          <div className="flex items-center gap-1 text-sm">
            {topRight}
            <ThemeToggle />
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:px-8 sm:py-10">
          <div className={cn('w-full', wide ? 'max-w-xl' : 'max-w-md')}>{children}</div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-8 lg:text-left">© 2026 Annex HR · Privacy · Terms</footer>
      </div>
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <BrandPanel>{aside}</BrandPanel>
      </aside>
    </div>
  )
}

/** Direction-aware slide variants for multi-step flows (pass `custom={dir}`). */
export const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -32, transition: { duration: 0.18 } }),
}
