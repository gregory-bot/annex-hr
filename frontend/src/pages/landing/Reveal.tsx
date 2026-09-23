import { motion } from 'framer-motion'

/** Fades + lifts its children into view once, as the page scrolls. */
export function Reveal({ children, delay = 0, className, y = 16 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({ eyebrow, title, description, center = true }: { eyebrow: string; title: string; description?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</div>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-balance text-base text-muted-foreground sm:text-lg">{description}</p>}
    </Reveal>
  )
}
