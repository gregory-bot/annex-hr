import { motion } from 'framer-motion'
import { ChevronsLeft } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Tip } from '@/components/ui/tooltip'
import { useAuth } from '@/context/auth'
import { navFor, type NavItem } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { LogoMark, Wordmark } from '@/components/shared/Logo'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

const sections: NavItem['section'][] = ['Workspace', 'People Ops', 'Money & Time', 'Growth', 'Governance']

export function useNavBadges(): Record<string, number> {
  const { data } = useAuth()
  if (!data) return {}
  return {
    leave: data.leaveRequests.filter((l) => l.status === 'Pending').length,
    payroll: data.payrollRuns.filter((p) => p.status === 'Pending Approval').length,
    compliance: data.complianceDocs.filter((d) => d.status === 'Expiring' || d.status === 'Expired').length,
    timesheets: data.timesheets.filter((t) => t.status === 'Pending').length,
  }
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { role } = useAuth()
  const items = navFor(role)
  const badges = useNavBadges()
  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section) => {
        const group = items.filter((i) => i.section === section)
        if (!group.length) return null
        return (
          <div key={section}>
            {!collapsed && <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{section}</div>}
            <div className="flex flex-col gap-0.5">
              {group.map((item) => {
                const link = (
                  <NavLink
                    key={item.key}
                    to={item.href}
                    end={item.href === '/app'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        isActive && 'text-primary hover:bg-accent hover:text-primary',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId={collapsed ? 'nav-active-c' : 'nav-active'} className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                        )}
                        <item.icon className="relative size-[18px] shrink-0" />
                        {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
                        {!!badges[item.key] && (
                          <span
                            className={cn(
                              'relative rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white tabular',
                              collapsed && 'absolute right-1 top-1 size-2 p-0 text-[0px]',
                            )}
                          >
                            {badges[item.key]}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                )
                return collapsed ? (
                  <Tip key={item.key} label={item.label} side="right">
                    {link}
                  </Tip>
                ) : (
                  link
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar md:flex"
    >
      <div className={cn('flex h-16 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
        <LogoMark />
        {!collapsed && <Wordmark />}
      </div>
      <div className={cn('px-3 pb-3', collapsed && 'px-2')}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>
      <div className={cn('flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin', collapsed && 'px-2')}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn('border-t p-3', collapsed && 'px-2')}>
        <button
          onClick={onToggle}
          className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronsLeft className={cn('size-[18px] transition-transform', collapsed && 'rotate-180')} />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </motion.aside>
  )
}
