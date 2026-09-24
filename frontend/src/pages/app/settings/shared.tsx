import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A label + description on the left and a control on the right. */
export function SettingRow({ title, description, children, className }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-[13px] text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Editable list of chips with add / remove. */
export function ChipEditor({ items, onChange, placeholder, noun }: { items: string[]; onChange: (items: string[]) => void; placeholder: string; noun: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      toast.error(`${v} already exists`)
      return
    }
    onChange([...items, v])
    setDraft('')
    toast.success(`${noun} added`, { description: v })
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <Button type="submit" variant="outline" className="h-10 shrink-0">
          Add
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.span
              key={item}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-subtle py-1 pl-3 pr-1 text-[13px]"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <p className="text-xs text-muted-foreground">
        {items.length} {noun.toLowerCase()}
        {items.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}

/** Tiny deterministic PRNG for demo data. */
export function prng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
