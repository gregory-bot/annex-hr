import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/context/auth'
import { apiAssetUrl } from '@/lib/branding'
import { cn } from '@/lib/utils'

export function WorkspaceBadge({ letter, slug, logoUrl, className }: { letter: string; slug?: string; logoUrl?: string | null; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  const src = apiAssetUrl(logoUrl)
  // An uploaded company logo wins; otherwise Annex's own workspace carries the Annex mark, everyone else a letter.
  if (src && broken !== src)
    return (
      <span className={cn('flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white', className)}>
        <img src={src} alt="" aria-hidden className="size-full object-contain" onError={() => setBroken(src)} />
      </span>
    )
  if (slug === 'annex') return <img src="/brand/annex-logo-96.png" alt="" aria-hidden className={cn('size-8 shrink-0 rounded-lg', className)} />
  return <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-sm font-bold text-white dark:bg-white dark:text-[#111827]', className)}>{letter}</div>
}

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspace, switchWorkspace, workspaces } = useAuth()
  const navigate = useNavigate()
  if (!workspace) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn('flex w-full items-center gap-2.5 rounded-lg border bg-card p-1.5 text-left transition hover:bg-muted', collapsed && 'justify-center border-transparent bg-transparent p-0')}>
          <WorkspaceBadge letter={workspace.logoText} slug={workspace.slug} logoUrl={workspace.logoUrl} />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight">{workspace.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{workspace.domain}</div>
              </div>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => {
              if (w.id === workspace.id) return
              const id = toast.loading(`Opening ${w.name}…`)
              switchWorkspace(w.id)
                .then(() => {
                  navigate('/app')
                  toast.success(`Switched to ${w.name}`, { id, description: w.domain })
                })
                .catch((err: Error) => toast.error(err.message, { id }))
            }}
          >
            <WorkspaceBadge letter={w.logoText} slug={w.slug} logoUrl={w.id === workspace.id ? workspace.logoUrl : w.logoUrl} className="size-7 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-foreground">{w.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{w.domain}</div>
            </div>
            {w.id === workspace.id && <Check className="!text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/signup')}>
          Create new workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
