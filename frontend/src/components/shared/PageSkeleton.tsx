import { Skeleton } from '@/components/ui/skeleton'
import { LogoMark } from './Logo'

export function PageSkeleton({ fullscreen }: { fullscreen?: boolean }) {
  if (fullscreen) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}
