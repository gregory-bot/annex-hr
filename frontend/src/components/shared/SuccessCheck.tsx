import { motion } from 'framer-motion'

/** Animated success checkmark for confirmations. */
export function SuccessCheck({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="relative mx-auto flex items-center justify-center rounded-full bg-success-soft"
      style={{ width: size, height: size }}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-success"
        initial={{ scale: 1, opacity: 0.6 }}
        animate={{ scale: 1.35, opacity: 0 }}
        transition={{ duration: 1.1, repeat: 1 }}
      />
      <svg viewBox="0 0 52 52" width={size * 0.55} height={size * 0.55}>
        <motion.path
          d="M14 27 l8 8 l16 -18"
          fill="none"
          stroke="var(--success)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  )
}
