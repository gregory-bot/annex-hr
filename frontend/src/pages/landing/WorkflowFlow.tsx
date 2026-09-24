import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const nodes: { label: string; sub: string }[] = [
  { label: 'Company', sub: 'Registered & verified' },
  { label: 'Workspace', sub: 'annex.annexhr.com' },
  { label: 'Departments', sub: 'Structure & budgets' },
  { label: 'Managers', sub: 'Approvals & reviews' },
  { label: 'Employees', sub: 'Self-service portal' },
  { label: 'Automation', sub: 'Leave, payroll, alerts' },
  { label: 'Reports', sub: 'Live people analytics' },
]

function Connector({ index }: { index: number }) {
  const delay = 0.25 + index * 0.18
  return (
    <>
      {/* horizontal (lg+) */}
      <motion.div
        className="relative hidden h-12 min-w-6 flex-1 items-center lg:flex"
        initial={{ opacity: 0, scaleX: 0 }}
        whileInView={{ opacity: 1, scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.4 }}
        style={{ originX: 0 }}
        aria-hidden
      >
        <svg className="h-2 w-full overflow-visible">
          <line x1="0" y1="4" x2="100%" y2="4" stroke="var(--primary)" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="6 6" style={{ animation: 'dash 1.2s linear infinite' }} />
        </svg>
        <motion.span
          className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
          animate={{ left: ['0%', '100%'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay }}
        />
      </motion.div>
      {/* vertical (< lg) */}
      <motion.div
        className="relative ml-6 flex h-8 w-2 justify-center lg:hidden"
        initial={{ opacity: 0, scaleY: 0 }}
        whileInView={{ opacity: 1, scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1, duration: 0.35 }}
        style={{ originY: 0 }}
        aria-hidden
      >
        <svg className="h-full w-2 overflow-visible">
          <line x1="4" y1="0" x2="4" y2="100%" stroke="var(--primary)" strokeOpacity={0.45} strokeWidth={2} strokeDasharray="5 5" style={{ animation: 'dash 1.2s linear infinite' }} />
        </svg>
        <motion.span
          className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary"
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </>
  )
}

/** Company → Reports flow with animated connectors. Horizontal on desktop, vertical on mobile. */
export function WorkflowFlow() {
  return (
    <div className="flex flex-col lg:flex-row lg:items-start">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1
        return (
          <div key={n.label} className={cn('flex flex-col lg:flex-row lg:items-start', !last && 'lg:flex-1')}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.18, duration: 0.45 }}
              className="flex items-center gap-3 lg:w-28 lg:flex-col lg:text-center"
            >
              <div
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular shadow-sm transition-transform hover:-translate-y-0.5',
                  i === 5 ? 'border-transparent bg-gradient-to-br from-primary to-secondary text-white shadow-primary/30' : 'bg-card text-primary',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div>
                <div className="text-sm font-semibold">{n.label}</div>
                <div className="text-xs text-muted-foreground">{n.sub}</div>
              </div>
            </motion.div>
            {!last && <Connector index={i} />}
          </div>
        )
      })}
    </div>
  )
}
