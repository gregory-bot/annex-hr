import { useId } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a shared id breaks when the first instance is display:none.
  const gid = `annex-g-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E63946" />
          <stop offset="1" stopColor="#A10E1A" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      <path d="M9 23 16 8l7 15h-4l-1.2-3h-3.6L13 23H9Zm6.2-6h1.6L16 14.8 15.2 17Z" fill="#fff" />
    </svg>
  )
}

export function Logo({ className, to = '/', light }: { className?: string; to?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('text-[17px] font-bold tracking-tight', light ? 'text-white' : 'text-foreground')}>
        Annex<span className="text-primary"> HR</span>
      </span>
    </Link>
  )
}
