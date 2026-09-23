import { motion } from 'framer-motion'

/* Simple typographic wordmarks. Brand hues only show on hover (grayscale by default). */

function Umba() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <circle cx="14" cy="14" r="14" fill="#6C2BD9" />
        <path d="M8 9v6a6 6 0 0 0 12 0V9h-3.2v6a2.8 2.8 0 0 1-5.6 0V9Z" fill="#fff" />
      </svg>
      <span className="text-xl font-black lowercase tracking-tight">umba</span>
    </div>
  )
}

function AnnexTech() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="7" fill="#C1121F" />
        <path d="M7 21 14 7l7 14h-3.4L14 13.6 10.4 21Z" fill="#fff" />
      </svg>
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">Annex</span>
        <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] opacity-70">Technologies</span>
      </span>
    </div>
  )
}

function Chqi() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <path d="M14 2 25 8v12l-11 6L3 20V8Z" fill="#0E7C66" />
        <path d="M14 8.5a5.5 5.5 0 1 0 4.4 8.8l-2.3-1.7a2.7 2.7 0 1 1 0-3.2l2.3-1.7A5.5 5.5 0 0 0 14 8.5Z" fill="#fff" />
      </svg>
      <span className="text-lg font-extrabold tracking-[0.18em]">CHQI</span>
    </div>
  )
}

function AckChurch() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="14" fill="#1E3A8A" />
        <path d="M12.6 5h2.8v5h5v2.8h-5V23h-2.8V12.8h-5V10h5Z" fill="#F5C518" />
      </svg>
      <span className="leading-none">
        <span className="block font-serif text-[15px] font-bold">ACK Christ Church</span>
        <span className="block text-[9px] uppercase tracking-[0.2em] opacity-70">Anglican Church of Kenya</span>
      </span>
    </div>
  )
}

function DemoMfg() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="4" fill="#EA580C" />
        <path d="M5 22V12l5 3v-3l5 3v-3l5 3V7h3v15Z" fill="#fff" />
      </svg>
      <span className="leading-none">
        <span className="block text-[15px] font-extrabold uppercase tracking-tight">Demo</span>
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">Manufacturing Ltd</span>
      </span>
    </div>
  )
}

const logos = [
  { name: 'Umba', el: <Umba /> },
  { name: 'Annex Technologies', el: <AnnexTech /> },
  { name: 'CHQI', el: <Chqi /> },
  { name: 'ACK Christ Church', el: <AckChurch /> },
  { name: 'Demo Manufacturing Ltd', el: <DemoMfg /> },
]

export function TrustedLogos() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {logos.map((l, i) => (
        <motion.div
          key={l.name}
          title={l.name}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.07 }}
          className="group flex h-20 items-center justify-center rounded-xl border bg-card/60 px-3 text-muted-foreground grayscale opacity-75 transition hover:text-foreground hover:opacity-100 hover:grayscale-0 hover:shadow-md last:col-span-2 sm:last:col-span-1"
        >
          {l.el}
        </motion.div>
      ))}
    </div>
  )
}
