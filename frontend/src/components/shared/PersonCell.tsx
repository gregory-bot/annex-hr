import { PersonAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function PersonCell({ name, sub, className, size = 'md' }: { name: string; sub?: React.ReactNode; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <PersonAvatar name={name} className={size === 'sm' ? 'size-7 text-[10px]' : 'size-9'} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}
