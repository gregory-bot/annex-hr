import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** Returns the sortable value; column is sortable when provided. */
  sortValue?: (row: T) => string | number
  className?: string
  headerClassName?: string
  /** Hide on the mobile card layout. */
  hideOnMobile?: boolean
}

/**
 * Enterprise table: sorting, pagination and an automatic mobile card
 * layout below the md breakpoint.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  pageSize = 10,
  mobileCard,
  empty,
  className,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  pageSize?: number
  /** Custom card for mobile; defaults to a stacked label/value list. */
  mobileCard?: (row: T) => React.ReactNode
  empty?: React.ReactNode
  className?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir
    })
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize)

  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" description="Records will appear here once they're created." />}</>

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {/* Desktop / tablet */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.headerClassName}>
                  {c.sortValue ? (
                    <button
                      className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}
                    >
                      {c.header}
                      <ArrowUpDown className={cn('size-3', sort?.key === c.key && 'text-primary')} />
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {visible.map((row, i) => (
                <motion.tr
                  key={rowKey(row)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.015 }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b transition-colors hover:bg-muted/50', onRowClick && 'cursor-pointer')}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y md:hidden">
        {visible.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('p-4', onRowClick && 'cursor-pointer active:bg-muted/60')}
          >
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((c, idx) => (
                    <div key={c.key} className={cn('min-w-0', idx === 0 && 'col-span-2')}>
                      {idx !== 0 && <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.header}</dt>}
                      <dd className="mt-0.5 min-w-0 text-sm">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="tabular">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular">
              {current + 1} / {pages}
            </span>
            <Button variant="outline" size="icon-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
