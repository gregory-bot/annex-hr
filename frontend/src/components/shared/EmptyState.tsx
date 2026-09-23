import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center', className)}>
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </div>
      <div className="font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
