/** Workspace branding: API asset URLs and brand-colour maths (contrast-safe light/dark variants). */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export const DEFAULT_BRAND_PRIMARY = '#C1121F'
export const DEFAULT_BRAND_SECONDARY = '#E63946'

/** The API returns asset paths as /api/…; re-root them when VITE_API_URL points somewhere else. */
export function apiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (BASE !== '/api' && path.startsWith('/api/')) return BASE.replace(/\/$/, '') + path.slice(4)
  return path
}

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB) {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')
}

function luminance([r, g, b]: RGB) {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

export function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Moves `color` toward `toward` in small steps until it reaches `min` contrast against `bg`. */
function ensureContrast(color: RGB, bg: RGB, min: number, toward: RGB): RGB {
  let c = color
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(color, toward, (i + 1) / 20)
  return c
}

const WHITE: RGB = [255, 255, 255]
const INK: RGB = [17, 24, 39]
const LIGHT_BG: RGB = [255, 255, 255]
const DARK_BG: RGB = [11, 13, 18]
const DARK_CARD: RGB = [18, 21, 28]

/** CSS variable values for one theme, derived from the brand colours. */
export function brandVariables(primaryHex: string, secondaryHex: string, dark: boolean): Record<string, string> | null {
  const p = hexToRgb(primaryHex)
  const s = hexToRgb(secondaryHex) ?? p
  if (!p || !s) return null
  // Primary doubles as a text colour (links, icons), so keep it legible on the page background.
  const primary = dark ? ensureContrast(p, DARK_BG, 4.5, WHITE) : ensureContrast(p, LIGHT_BG, 4.5, INK)
  const secondary = dark ? ensureContrast(s, DARK_BG, 3, WHITE) : ensureContrast(s, LIGHT_BG, 3, INK)
  const onColor = (c: RGB) => rgbToHex(contrast(c, WHITE) >= contrast(c, INK) ? WHITE : INK)
  const accent = dark ? mix(DARK_CARD, p, 0.16) : mix(WHITE, p, 0.1)
  const accentFg = dark ? ensureContrast(mix(p, WHITE, 0.55), accent, 4.5, WHITE) : ensureContrast(mix(p, INK, 0.25), accent, 4.5, INK)
  return {
    '--primary': rgbToHex(primary),
    '--primary-foreground': onColor(primary),
    '--ring': rgbToHex(primary),
    '--secondary': rgbToHex(secondary),
    '--secondary-foreground': onColor(secondary),
    '--accent': rgbToHex(accent),
    '--accent-foreground': rgbToHex(accentFg),
  }
}

export function isDefaultBrand(primary?: string | null, secondary?: string | null) {
  return (primary ?? DEFAULT_BRAND_PRIMARY).toUpperCase() === DEFAULT_BRAND_PRIMARY && (secondary ?? DEFAULT_BRAND_SECONDARY).toUpperCase() === DEFAULT_BRAND_SECONDARY
}
