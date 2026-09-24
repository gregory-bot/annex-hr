import { useEffect, useState } from 'react'
import { useAuth } from '@/context/auth'
import { brandVariables, DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_SECONDARY, isDefaultBrand } from '@/lib/branding'

const isDark = () => document.documentElement.classList.contains('dark')

function useDarkMode() {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDark()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/** Applies the workspace's brand colours to the app shell (CSS variables on <html>); default brands keep the stylesheet tokens. */
export function useBrandTheme() {
  const { workspace } = useAuth()
  const dark = useDarkMode()
  const primary = workspace?.brandPrimary ?? DEFAULT_BRAND_PRIMARY
  const secondary = workspace?.brandSecondary ?? DEFAULT_BRAND_SECONDARY

  useEffect(() => {
    if (isDefaultBrand(primary, secondary)) return
    const vars = brandVariables(primary, secondary, dark)
    if (!vars) return
    const style = document.documentElement.style
    for (const [k, v] of Object.entries(vars)) style.setProperty(k, v)
    return () => {
      for (const k of Object.keys(vars)) style.removeProperty(k)
    }
  }, [primary, secondary, dark])
}

export function BrandTheme() {
  useBrandTheme()
  return null
}
