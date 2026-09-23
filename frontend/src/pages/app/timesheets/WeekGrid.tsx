import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { ChevronDown, Trash2 } from 'lucide-react'
import type { Timesheet } from '@/data/types'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DAYS, dayDate, dayTotal, fmtH, rowTotal, sheetTotal } from './utils'

/** Weekly grid — editable table on desktop, day-by-day accordion on mobile. */
export function WeekGrid({
  sheet,
  editable = false,
  onHours,
  onBillable,
  onRemove,
}: {
  sheet: Timesheet
  editable?: boolean
  onHours?: (row: number, day: number, value: number) => void
  onBillable?: (row: number, value: boolean) => void
  onRemove?: (row: number) => void
}) {
  const [openDay, setOpenDay] = useState<number | null>(0)
  const total = sheetTotal(sheet)

  const hourInput = (ri: number, di: number, v: number, className?: string) =>
    editable ? (
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={24}
        step={0.5}
        value={v === 0 ? '' : v}
        placeholder="0"
        aria-label={`${sheet.entries[ri]!.project} ${DAYS[di]}`}
        onChange={(e) => onHours?.(ri, di, Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
        className={cn(
          'h-9 w-full rounded-md border border-input bg-card text-center text-sm tabular [appearance:textfield] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none',
          di > 4 && 'bg-subtle',
          className,
        )}
      />
    ) : (
      <span className={cn('tabular', v === 0 && 'text-muted-foreground/60')}>{v === 0 ? '—' : fmtH(v)}</span>
    )

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 text-left">Project</th>
              {DAYS.map((d, i) => (
                <th key={d} className="w-16 px-1 py-2 text-center">
                  {d}
                  <div className="font-normal normal-case tracking-normal">{format(dayDate(sheet.week, i), 'd')}</div>
                </th>
              ))}
              <th className="w-16 px-2 py-2 text-right">Total</th>
              <th className="w-24 px-2 py-2 text-center">Billable</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {sheet.entries.map((e, ri) => (
                <motion.tr key={e.project} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-b">
                  <td className="py-2 pr-3 font-medium">{e.project}</td>
                  {e.hours.map((h, di) => (
                    <td key={di} className="px-1 py-2 text-center">
                      {hourInput(ri, di, h)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-semibold tabular">{fmtH(rowTotal(e))}</td>
                  <td className="px-2 py-2 text-center">
                    {editable ? (
                      <Switch checked={e.billable} onCheckedChange={(v) => onBillable?.(ri, v)} aria-label={`${e.project} billable`} />
                    ) : (
                      <Badge variant={e.billable ? 'soft' : 'muted'}>{e.billable ? 'Billable' : 'Internal'}</Badge>
                    )}
                  </td>
                  {editable && (
                    <td className="py-2 text-center">
                      <button onClick={() => onRemove?.(ri)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${e.project}`}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
          <tfoot>
            <tr className="text-xs text-muted-foreground">
              <td className="py-2.5 pr-3 font-semibold uppercase tracking-wider">Day total</td>
              {DAYS.map((_, di) => {
                const t = dayTotal(sheet, di)
                return (
                  <td key={di} className={cn('px-1 py-2.5 text-center font-semibold tabular', t > 10 ? 'text-warning' : 'text-foreground')}>
                    {fmtH(t)}
                  </td>
                )
              })}
              <td className="px-2 py-2.5 text-right text-sm font-bold text-foreground tabular">{fmtH(total)}</td>
              <td colSpan={editable ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile accordion */}
      <div className="grid grid-cols-1 gap-2 md:hidden">
        {DAYS.map((d, di) => {
          const open = openDay === di
          const t = dayTotal(sheet, di)
          return (
            <div key={d} className={cn('overflow-hidden rounded-xl border', open ? 'bg-card' : 'bg-subtle')}>
              <button className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left" onClick={() => setOpenDay(open ? null : di)} aria-expanded={open}>
                <span className="text-sm font-medium">
                  {d} <span className="text-muted-foreground">{format(dayDate(sheet.week, di), 'd MMM')}</span>
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold tabular">
                  {fmtH(t)} h
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-1 gap-2.5 border-t px-3.5 py-3">
                      {sheet.entries.map((e, ri) => (
                        <div key={e.project} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm">{e.project}</div>
                            <div className="text-[11px] text-muted-foreground">{e.billable ? 'Billable' : 'Internal'}</div>
                          </div>
                          <div className="w-20 shrink-0 text-right">{hourInput(ri, di, e.hours[di] ?? 0)}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        <div className="flex items-center justify-between rounded-xl bg-accent px-3.5 py-3 text-sm font-semibold text-accent-foreground">
          <span>Week total</span>
          <span className="tabular">{fmtH(total)} h</span>
        </div>
        {editable && (
          <div className="grid grid-cols-1 gap-2 rounded-xl border p-3">
            <div className="text-xs font-medium text-muted-foreground">Billable projects</div>
            {sheet.entries.map((e, ri) => (
              <div key={e.project} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{e.project}</span>
                <span className="flex items-center gap-2">
                  <Switch checked={e.billable} onCheckedChange={(v) => onBillable?.(ri, v)} aria-label={`${e.project} billable`} />
                  <button onClick={() => onRemove?.(ri)} className="rounded p-1 text-muted-foreground" aria-label={`Remove ${e.project}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
