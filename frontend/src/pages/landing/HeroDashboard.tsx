import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { CalendarDays, Check, CircleCheck, RefreshCw, Rocket, Users, Wallet } from 'lucide-react'
import { PersonAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { ChartTooltip, SERIES, axisProps } from '@/components/charts/ChartKit'
import { cn } from '@/lib/utils'

const headcount = [
  { m: 'Apr', v: 196 },
  { m: 'May', v: 204 },
  { m: 'Jun', v: 211 },
  { m: 'Jul', v: 223 },
  { m: 'Aug', v: 236 },
  { m: 'Sep', v: 248 },
]

const onboarding = [
  { name: 'Brian Otieno', role: 'Data Engineer', pct: 82 },
  { name: 'Amina Hassan', role: 'Product Designer', pct: 56 },
  { name: 'Kevin Mwangi', role: 'Support Lead', pct: 31 },
]

const stats = [
  { label: 'Employees', value: '248', icon: Users },
  { label: 'Onboarding', value: '12', icon: Rocket },
  { label: 'Leave requests', value: '7', icon: CalendarDays },
  { label: 'Payroll', value: 'Pending', icon: Wallet },
]

function Float({ children, className, delay = 0, amp = 8 }: { children: React.ReactNode; className?: string; delay?: number; amp?: number }) {
  return (
    <motion.div
      className={cn('absolute z-20', className)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, y: [0, -amp, 0] }}
      transition={{
        opacity: { duration: 0.5, delay: 0.6 + delay },
        scale: { duration: 0.5, delay: 0.6 + delay },
        y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay },
      }}
    >
      {children}
    </motion.div>
  )
}

/** Hand-built product illustration for the landing hero (pure JSX, no images). */
export function HeroDashboard() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] px-2 py-8 sm:px-6">
      {/* glow */}
      <div className="pointer-events-none absolute inset-6 -z-0 rounded-[2rem] bg-primary/20 blur-3xl" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-10 overflow-hidden rounded-2xl border bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur"
        aria-label="Annex HR dashboard preview"
        role="img"
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b bg-subtle px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <div className="ml-2 flex-1 truncate rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">annex.annexhr.com/app</div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Good morning, Faith</div>
              <div className="text-sm font-semibold">People overview</div>
            </div>
            <Badge variant="success" dot>
              All systems synced
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="rounded-xl border bg-subtle p-2.5"
              >
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <s.icon className="size-3 text-primary" />
                  <span className="truncate">{s.label}</span>
                </div>
                <div className={cn('mt-1 font-bold tabular', s.value === 'Pending' ? 'text-sm text-warning' : 'text-lg')}>{s.value}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border p-3 sm:col-span-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">Headcount growth</span>
                <span className="text-success">+26.5%</span>
              </div>
              <div className="mt-1 h-[92px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={headcount} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={SERIES[0]} stopOpacity={0.25} />
                        <stop offset="1" stopColor={SERIES[0]} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="m" {...axisProps} fontSize={9} tickMargin={4} height={16} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="v" name="Employees" stroke={SERIES[0]} strokeWidth={2} fill="url(#hero-area)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border p-3 sm:col-span-2 sm:flex-col sm:justify-center sm:text-center">
              <ProgressRing value={87} size={64} stroke={6} />
              <div>
                <div className="text-[11px] font-semibold">Review completion</div>
                <div className="text-[10px] text-muted-foreground">Q3 performance cycle</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="mb-2 text-[11px] font-semibold">Onboarding progress</div>
              <div className="grid grid-cols-1 gap-2">
                {onboarding.map((o) => (
                  <div key={o.name} className="flex items-center gap-2">
                    <PersonAvatar name={o.name} className="size-6 text-[9px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="truncate font-medium">{o.name}</span>
                        <span className="tabular text-muted-foreground">{o.pct}%</span>
                      </div>
                      <Progress value={o.pct} className="mt-1 h-1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-xl border p-3">
                <div className="mb-2 text-[11px] font-semibold">Leave request</div>
                <div className="flex items-center gap-2">
                  <PersonAvatar name="Faith Njoroge" className="size-7 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">Faith Njoroge</div>
                    <div className="truncate text-[10px] text-muted-foreground">Annual · 14–18 Oct</div>
                  </div>
                  <Button size="sm" className="h-6 px-2 text-[10px]" tabIndex={-1}>
                    Approve
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <div className="text-[11px] font-semibold">September payroll</div>
                  <div className="text-[10px] text-muted-foreground">KES 18.4M · 248 staff</div>
                </div>
                <Badge variant="warning" dot>
                  Awaiting CFO
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <Float className="-top-1 right-0 sm:-right-4" delay={0}>
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xl">
          <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <div>
            <div className="text-[11px] font-semibold">Leave approved</div>
            <div className="text-[10px] text-muted-foreground">Faith · 5 days</div>
          </div>
        </div>
      </Float>

      <Float className="bottom-0 left-0 sm:-left-6" delay={1.2} amp={10}>
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xl">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-primary">
            <RefreshCw className="size-3.5" />
          </span>
          <div>
            <div className="text-[11px] font-semibold">Payroll synced to Odoo</div>
            <div className="text-[10px] text-muted-foreground">PAYE · SHIF · NSSF · Housing</div>
          </div>
        </div>
      </Float>

      <Float className="top-1/3 -right-2 hidden lg:block xl:-right-10" delay={2.2} amp={6}>
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xl">
          <CircleCheck className="size-4 text-success" />
          <div className="text-[11px] font-semibold">Contract signed</div>
        </div>
      </Float>
    </div>
  )
}
