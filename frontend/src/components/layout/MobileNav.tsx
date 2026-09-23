import { Bell, CalendarDays, Clock, LayoutDashboard, Menu } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useNotifications } from '@/context/notifications'
import { cn } from '@/lib/utils'

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { unread } = useNotifications()
  const items = [
    { href: '/app', label: 'Home', icon: LayoutDashboard, end: true },
    { href: '/app/leave', label: 'Leave', icon: CalendarDays },
    { href: '/app/attendance', label: 'Clock', icon: Clock },
    { href: '/app/notifications', label: 'Inbox', icon: Bell, badge: unread },
  ]
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5">
        {items.map((i) => (
          <NavLink
            key={i.href}
            to={i.href}
            end={i.end}
            className={({ isActive }) => cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground', isActive && 'text-primary')}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
                <span className="relative">
                  <i.icon className="size-5" />
                  {!!i.badge && <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-white">{i.badge}</span>}
                </span>
                {i.label}
              </>
            )}
          </NavLink>
        ))}
        <button onClick={onOpenMenu} className="flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground">
          <Menu className="size-5" />
          More
        </button>
      </div>
    </nav>
  )
}
