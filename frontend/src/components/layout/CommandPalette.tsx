import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { PersonAvatar } from '@/components/ui/avatar'
import { useAuth } from '@/context/auth'
import { useTheme } from '@/context/theme'
import { navFor } from '@/lib/rbac'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const { role, data } = useAuth()
  const { toggle } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (href: string) => {
    onOpenChange(false)
    navigate(href)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[18%]">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command>
          <CommandInput placeholder="Search people, pages and actions…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Quick actions">
              <CommandItem onSelect={() => go('/app/leave?apply=1')}>
                Apply for leave
              </CommandItem>
              <CommandItem onSelect={() => go('/app/tickets?new=1')}>
                Create ticket
              </CommandItem>
              <CommandItem onSelect={() => go('/app/people?invite=1')}>
                Invite employee
              </CommandItem>
              <CommandItem onSelect={() => go('/app/payroll')}>
                Run payroll
              </CommandItem>
              <CommandItem onSelect={() => go('/app/surveys?new=1')}>
                New pulse survey
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  toggle()
                  onOpenChange(false)
                }}
              >
                Toggle dark mode
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Navigate">
              {navFor(role).map((n) => (
                <CommandItem key={n.key} value={`go ${n.label}`} onSelect={() => go(n.href)}>
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {data && (
              <CommandGroup heading="People">
                {data.employees.slice(0, 60).map((e) => (
                  <CommandItem key={e.id} value={`${e.name} ${e.title}`} onSelect={() => go(`/app/people?id=${e.id}`)}>
                    <PersonAvatar name={e.name} className="size-6 text-[9px]" />
                    <span className="flex-1 truncate">{e.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{e.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
