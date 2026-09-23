import { animate, useInView, useMotionValue, useTransform, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

/** Counts up to `value` once it scrolls into view. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('en-KE'), duration = 1 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, value, { duration, ease: [0.2, 0.8, 0.2, 1] })
    return () => controls.stop()
  }, [inView, value, duration, mv])
  return <motion.span ref={ref}>{text}</motion.span>
}
