import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface KanbanColumn<T> {
  id: string
  title: string
  tone?: 'default' | 'warning' | 'success' | 'danger' | 'info'
  items: T[]
}

const toneDot = {
  default: 'bg-muted-foreground',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
  info: 'bg-info',
}

/** Approval board. Cards animate between columns via shared layout. */
export function Kanban<T>({
  columns,
  itemKey,
  renderCard,
  className,
}: {
  columns: KanbanColumn<T>[]
  itemKey: (item: T) => string
  renderCard: (item: T, columnId: string) => React.ReactNode
  className?: string
}) {
  return (
    <LayoutGroup>
      <div className={cn('-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-thin md:mx-0 md:px-0 2xl:grid 2xl:overflow-visible', className)} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => (
          <div key={col.id} className="flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border bg-subtle p-3 md:w-[272px] 2xl:w-auto 2xl:max-w-none">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={cn('size-2 rounded-full', toneDot[col.tone ?? 'default'])} />
                {col.title}
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular">{col.items.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2.5">
              <AnimatePresence mode="popLayout">
                {col.items.map((item) => (
                  <motion.div
                    key={itemKey(item)}
                    layout
                    layoutId={itemKey(item)}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  >
                    {renderCard(item, col.id)}
                  </motion.div>
                ))}
              </AnimatePresence>
              {col.items.length === 0 && <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">No items</div>}
            </div>
          </div>
        ))}
      </div>
    </LayoutGroup>
  )
}
