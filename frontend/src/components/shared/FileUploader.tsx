import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, FileText, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface UploadItem {
  id: string
  name: string
  size: string
  progress: number
}

/** Drag-and-drop uploader with simulated upload progress. */
export function FileUploader({
  accept,
  multiple = true,
  label = 'Drop files here or click to browse',
  hint = 'PDF, PNG or JPG up to 10MB',
  onComplete,
  compact,
  className,
}: {
  accept?: string
  multiple?: boolean
  label?: string
  hint?: string
  onComplete?: (files: { name: string; size: string }[]) => void
  compact?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])

  const handle = (files: FileList | null) => {
    if (!files?.length) return
    const next = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1000))} KB`,
      progress: 0,
    }))
    setItems((prev) => [...prev, ...next])
    next.forEach((item) => {
      let p = 0
      const t = setInterval(() => {
        p = Math.min(100, p + 12 + Math.random() * 20)
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, progress: p } : x)))
        if (p >= 100) clearInterval(t)
      }, 140)
    })
    setTimeout(() => onComplete?.(next.map(({ name, size }) => ({ name, size }))), 1300)
  }

  return (
    <div className={className}>
      <button
        type="button"
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
          'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-subtle text-center transition-colors hover:border-primary/50 hover:bg-accent/30',
          compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-8',
          drag && 'border-primary bg-accent/50',
        )}
      >
        <motion.div animate={drag ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }} className="flex size-10 items-center justify-center rounded-full bg-accent text-primary">
          <UploadCloud className="size-5" />
        </motion.div>
        <div className="text-sm font-medium">{label}</div>
        {!compact && <div className="text-xs text-muted-foreground">{hint}</div>}
      </button>
      <input ref={inputRef} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => handle(e.target.files)} />
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card p-3">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.size}</span>
                </div>
                <Progress value={item.progress} className="mt-1.5 h-1" tone={item.progress >= 100 ? 'success' : 'primary'} />
              </div>
              {item.progress >= 100 ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
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
