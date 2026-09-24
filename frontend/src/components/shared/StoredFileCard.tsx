import { Button } from '@/components/ui/button'
import { fileDownloadUrl, formatBytes } from '@/lib/files'
import { cn, formatDate } from '@/lib/utils'

/** A stored file: name, size, who/when, a download link and optional actions (Replace, Delete…). */
export function StoredFileCard({
  file,
  children,
  className,
  sub,
}: {
  file: { id?: string; filename: string; sizeBytes?: number; size?: string; contentType?: string; createdAt?: string; uploadedByName?: string | null; category?: string }
  children?: React.ReactNode
  className?: string
  sub?: React.ReactNode
}) {
  const size = file.size ?? (file.sizeBytes ? formatBytes(file.sizeBytes) : '')
  const meta = [file.category, size, file.createdAt ? `Uploaded ${formatDate(file.createdAt.slice(0, 10))}` : null, file.uploadedByName ? `by ${file.uploadedByName}` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3', className)}>
      <div className="min-w-0 flex-1 basis-40">
        {file.id ? (
          <a href={fileDownloadUrl(file.id, true)} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-primary hover:underline">
            {file.filename}
          </a>
        ) : (
          <div className="truncate text-sm font-medium">{file.filename}</div>
        )}
        <div className="truncate text-xs text-muted-foreground">{sub ?? meta}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {file.id && (
          <Button size="sm" variant="outline" asChild>
            <a href={fileDownloadUrl(file.id)} download={file.filename}>
              Download
            </a>
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}
