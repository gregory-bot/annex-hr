import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, User, UserCog } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tip } from '@/components/ui/tooltip'
import { useAuth } from '@/context/auth'
import { useNotifications } from '@/context/notifications'
import { useTheme } from '@/context/theme'
import { roleDescriptions, roleLabels } from '@/lib/rbac'
import type { Role } from '@/data/types'
import { cn } from '@/lib/utils'
import { notificationMeta } from './notificationMeta'
import { LogoMark } from '@/components/shared/Logo'

const roles: Role[] = ['company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo', 'super_admin']

export function Topbar({ onOpenMenu, onOpenSearch }: { onOpenMenu: () => void; onOpenSearch: () => void }) {
  const { user, role, switchRole, signOut, workspace, demoEnabled } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl sm:gap-3 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>
      <Link to="/app" className="md:hidden">
        <LogoMark className="size-7" />
      </Link>

      <button
        onClick={onOpenSearch}
        aria-label="Search"
        className="ml-auto flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground transition hover:bg-muted sm:ml-1 sm:flex-1 sm:justify-start sm:border sm:bg-muted/50 sm:px-3 sm:max-w-md md:ml-0"
      >
        <Search className="size-[18px] shrink-0 sm:size-4" />
        <span className="hidden truncate sm:inline">Search people, pages, actions…</span>
        <kbd className="ml-auto hidden rounded border bg-card px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline">⌘K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 sm:ml-auto sm:gap-1.5">
        {demoEnabled && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden h-9 items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-accent/40 px-2.5 text-xs font-medium text-accent-foreground transition hover:bg-accent lg:flex">
              <UserCog className="size-3.5" />
              View as: {roleLabels[role]}
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Preview role-based access</DropdownMenuLabel>
            {roles.map((r) => (
              <DropdownMenuItem
                key={r}
                onSelect={() => {
                  const id = toast.loading(`Switching to ${roleLabels[r]}…`)
                  switchRole(r)
                    .then(() => {
                      navigate('/app')
                      toast.success(`Now viewing as ${roleLabels[r]}`, { id })
                    })
                    .catch((err: Error) => toast.error(err.message, { id }))
                }}
                className={cn(r === role && 'bg-accent')}
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{roleLabels[r]}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{roleDescriptions[r]}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>}

        <Tip label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
              </motion.span>
            </AnimatePresence>
          </Button>
        </Tip>

        <NotificationsButton />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-muted sm:pr-2">
              <PersonAvatar name={user.name} className="size-8" />
              <div className="hidden text-left sm:block">
                <div className="max-w-32 truncate text-[13px] font-semibold leading-tight">{user.name}</div>
                <div className="max-w-32 truncate text-[11px] text-muted-foreground">{roleLabels[role]}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2.5 py-2">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{workspace?.domain}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(`/app/people?id=${user.id}`)}>
              <User /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem className="lg:hidden" onSelect={() => navigate('/app/settings?tab=roles')}>
              <UserCog /> Switch role (demo)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/app/settings')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                void signOut().then(() => navigate('/login'))
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function NotificationsButton() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-[18px]" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key={unread}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-background"
              >
                {unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">Notifications</div>
          <button onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
            Mark all read
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {items.slice(0, 7).map((n) => {
            const meta = notificationMeta[n.type]
            return (
              <button
                key={n.id}
                onClick={() => {
                  markRead(n.id)
                  navigate(n.href)
                }}
                className="flex w-full gap-3 border-b px-4 py-3 text-left transition last:border-0 hover:bg-muted/60"
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', meta.tone)}>
                  <meta.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[13px] leading-snug', !n.read && 'font-semibold')}>{n.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{n.time}</span>
                </span>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
        <Link to="/app/notifications" className="block border-t px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted/60">
          Open notification center
        </Link>
      </PopoverContent>
    </Popover>
  )
}
