import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { NotificationsProvider } from '@/context/notifications'
import { Logo } from '@/components/shared/Logo'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Sidebar, SidebarNav } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileBottomNav } from './MobileNav'
import { CommandPalette } from './CommandPalette'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { BrandTheme } from './BrandTheme'

export function AppShell() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('annex-sidebar') === 'collapsed' || (typeof window !== 'undefined' && window.innerWidth < 1100)
    } catch {
      return false
    }
  })
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('annex-sidebar', collapsed ? 'collapsed' : 'open')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <NotificationsProvider>
      <BrandTheme />
      <div className="flex min-h-dvh bg-subtle">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent side="left" className="p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-16 items-center px-4">
              <Logo to="/app" />
            </div>
            <div className="px-3 pb-3">
              <WorkspaceSwitcher />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-8">
              <SidebarNav onNavigate={() => setDrawer(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMenu={() => setDrawer(true)} onOpenSearch={() => setSearch(true)} />
          <main className="flex-1 px-4 pb-28 pt-6 md:px-6 md:pb-10 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="mx-auto w-full max-w-[1440px]"
              >
                <ErrorBoundary key={location.pathname}>
                  <Outlet />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <MobileBottomNav onOpenMenu={() => setDrawer(true)} />
        <CommandPalette open={search} onOpenChange={setSearch} />
      </div>
    </NotificationsProvider>
  )
}
