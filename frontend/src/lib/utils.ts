import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function formatKES(amount: number, opts: { compact?: boolean } = {}) {
  if (opts.compact) {
    return 'KES ' + new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(amount)
  }
  return 'KES ' + new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(amount)
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-KE').format(n)
}

export function formatDate(d: string | Date, style: 'short' | 'medium' | 'long' = 'medium') {
  const date = typeof d === 'string' ? new Date(d) : d
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short' }
      : style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' }
  return date.toLocaleDateString('en-GB', opts)
}

export function daysUntil(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  const today = new Date(TODAY)
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000)
}

/** Fixed "today" so the demo data always looks current and consistent. */
export const TODAY = '2026-09-23'

/** Deterministic avatar color from a string. */
export function avatarTone(seed: string) {
  const tones = [
    'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
    'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100',
    'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100',
  ]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return tones[Math.abs(h) % tones.length]!
}
