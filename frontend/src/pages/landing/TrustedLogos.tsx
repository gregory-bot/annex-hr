import { motion } from 'framer-motion'

/**
 * Partner organisations shown in the "Trusted by" strip.
 * Logo files live in /public/partners. Only list organisations that have
 * agreed to be named as customers or partners.
 */
const partners: { name: string; logo: string; caption?: string; className?: string }[] = [
  { name: 'Google', logo: '/partners/google.svg', className: 'h-7' },
  { name: 'Microsoft', logo: '/partners/microsoft.svg', className: 'h-7' },
  { name: 'Microsoft for Startups', logo: '/partners/microsoft.svg', caption: 'for Startups', className: 'h-6' },
  { name: 'GitHub', logo: '/partners/github.svg', caption: 'GitHub', className: 'h-8' },
  { name: 'Pezesha', logo: '/partners/pezesha.png', className: 'h-8' },
  { name: 'USAID', logo: '/partners/usaid.png', className: 'h-10' },
  { name: 'Palladium', logo: '/partners/palladium.svg', className: 'h-10' },
  { name: 'Government of Kenya', logo: '/partners/kenya.png', caption: 'Government of Kenya', className: 'h-11' },
]

export function TrustedLogos() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {partners.map((p, i) => (
        <motion.div
          key={p.name}
          title={p.name}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05 }}
          // White tile in both themes so every brand renders in its own colours.
          className="flex h-24 items-center justify-center gap-2.5 rounded-xl border bg-white px-4"
        >
          <img src={p.logo} alt={p.caption ? '' : p.name} loading="lazy" className={`${p.className ?? 'h-8'} w-auto max-w-[70%] object-contain`} />
          {p.caption && <span className="text-sm font-semibold leading-tight text-[#24292f]">{p.caption}</span>}
        </motion.div>
      ))}
    </div>
  )
}
