import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Card with a title row and optional right-side action. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className={cn('flex-1', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
