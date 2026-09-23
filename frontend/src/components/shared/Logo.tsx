import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** The unified Annex mark (red tile, white A with dotted orbit). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/annex-logo-96.png"
      srcSet="/brand/annex-logo-96.png 1x, /brand/annex-logo-192.png 2x"
      alt=""
      aria-hidden
      width={32}
      height={32}
      className={cn('size-8 shrink-0 rounded-lg object-cover shadow-sm shadow-primary/20', className)}
      draggable={false}
    />
  )
}

/** "ANNEX" in brand red, "HR" in ink — the Annex HR wordmark. */
export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('text-[17px] font-extrabold tracking-tight', className)}>
      <span className={light ? 'text-white' : 'text-primary'}>ANNEX</span>
      <span className={light ? 'text-white/85' : 'text-foreground'}> HR</span>
    </span>
  )
}

export function Logo({ className, to = '/', light }: { className?: string; to?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)} aria-label="Annex HR home">
      <LogoMark />
      <Wordmark light={light} />
    </Link>
  )
}
