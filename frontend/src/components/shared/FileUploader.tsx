import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface UploadItem {
  id: string
  name: string
  size: string
  progress: number
  error?: string
}

const MAX_BYTES = 10 * 1024 * 1024

const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

/**
 * Drag-and-drop uploader.
 * With `upload`, each file is sent through it (real progress, errors shown per file) and `onUploaded`
 * receives the results; without it, progress is simulated (demo screens).
 */
export function FileUploader<T = unknown>({
  accept,
  multiple = true,
  label = 'Drop files here or click to browse',
  hint = 'PDF, PNG or JPG up to 10MB',
  onComplete,
  upload,
  onUploaded,
  disabled,
  compact,
  className,
}: {
  accept?: string
  multiple?: boolean
  label?: string
  hint?: string
  onComplete?: (files: { name: string; size: string }[]) => void
  upload?: (file: File, onProgress: (pct: number) => void) => Promise<T>
  onUploaded?: (results: T[]) => void
  disabled?: boolean
  compact?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])

  const patch = (id: string, p: Partial<UploadItem>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const handle = (list: FileList | null) => {
    if (!list?.length || disabled) return
    const files = Array.from(list).slice(0, multiple ? undefined : 1)
    const next = files.map((f) => ({ id: Math.random().toString(36).slice(2), name: f.name, size: fmtSize(f.size), progress: 0 }))
    setItems((prev) => [...(multiple ? prev : prev.filter((x) => x.progress < 100 && !x.error)), ...next])

    if (upload) {
      void Promise.all(
        files.map(async (file, i) => {
          const item = next[i]!
          if (file.size > MAX_BYTES) {
            patch(item.id, { error: 'Larger than 10 MB' })
            return null
          }
          try {
            const result = await upload(file, (pct) => patch(item.id, { progress: pct }))
            patch(item.id, { progress: 100 })
            return { result, meta: { name: item.name, size: item.size } }
          } catch (err) {
            patch(item.id, { error: err instanceof Error ? err.message : 'Upload failed' })
            return null
          }
        }),
      ).then((done) => {
        const ok = done.filter((d): d is { result: Awaited<T>; meta: { name: string; size: string } } => d !== null)
        if (!ok.length) return
        onUploaded?.(ok.map((d) => d.result as T))
        onComplete?.(ok.map((d) => d.meta))
      })
      return
    }

    next.forEach((item) => {
      let p = 0
      const t = setInterval(() => {
        p = Math.min(100, p + 12 + Math.random() * 20)
        patch(item.id, { progress: p })
        if (p >= 100) clearInterval(t)
      }, 140)
    })
    setTimeout(() => onComplete?.(next.map(({ name, size }) => ({ name, size }))), 1300)
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          handle(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-subtle text-center transition-colors hover:border-primary/50 hover:bg-accent/30 disabled:pointer-events-none disabled:opacity-60',
          compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-8',
          drag && 'border-primary bg-accent/50',
        )}
      >
        <motion.div animate={drag ? { y: -2 } : { y: 0 }} className="text-sm font-medium">
          {label}
        </motion.div>
        {!compact && <div className="text-xs text-muted-foreground">{hint}</div>}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div key={item.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={cn('mt-2 flex items-center gap-3 rounded-lg border bg-card p-3', item.error && 'border-danger/30')}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.size}</span>
                </div>
                {item.error ? (
                  <div className="mt-1 text-xs text-danger">{item.error}</div>
                ) : (
                  <Progress value={item.progress} className="mt-1.5 h-1" tone={item.progress >= 100 ? 'success' : 'primary'} />
                )}
              </div>
              {item.error ? (
                <button onClick={() => setItems((p) => p.filter((x) => x.id !== item.id))} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
                  <X className="size-4" />
                </button>
              ) : item.progress >= 100 ? (
                <span className="shrink-0 text-xs font-medium text-success">Uploaded</span>
              ) : upload ? null : (
                <button onClick={() => setItems((p) => p.filter((x) => x.id !== item.id))} className="text-muted-foreground hover:text-foreground" aria-label="Cancel upload">
                  <X className="size-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
