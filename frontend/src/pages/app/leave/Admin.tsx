/** HR admin tools on the Leave page: the holiday calendar (add / remove) and the leave policy editor. */
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { cn, daysUntil, formatDate } from '@/lib/utils'
import { Section } from '@/components/shared/Section'
import { DatePicker } from '@/components/shared/DatePicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { HolidayRow, LeavePolicy } from './api'
import { toISO } from './utils'

/** Public holidays per country from GET /holidays; HR admins can add and remove them. */
export function HolidayManager({ canEdit, defaultCountry }: { canEdit: boolean; defaultCountry: string }) {
  const [rows, setRows] = useState<HolidayRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState<Date | undefined>()
  const [name, setName] = useState('')
  const [country, setCountry] = useState(defaultCountry)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .get<HolidayRow[]>('/holidays')
      .then((r) => live && setRows(r))
      .catch((err) => live && setError(errorMessage(err)))
    return () => {
      live = false
    }
  }, [])

  const countries = useMemo(() => {
    const set = new Set((rows ?? []).map((h) => h.country))
    set.add(defaultCountry)
    return [...set].sort((a, b) => (a === defaultCountry ? -1 : b === defaultCountry ? 1 : a.localeCompare(b)))
  }, [rows, defaultCountry])

  const add = async () => {
    if (!date || name.trim().length < 2 || country.trim().length < 2) return
    setSaving(true)
    try {
      const saved = await api.post<HolidayRow>('/holidays', { date: toISO(date), name: name.trim(), country: country.trim() })
      setRows((prev) => [...(prev ?? []), saved].sort((a, b) => a.date.localeCompare(b.date)))
      setDate(undefined)
      setName('')
      toast.success(`${saved.name} added`, { description: `${saved.country} · ${formatDate(saved.date, 'long')} — excluded from leave days` })
    } catch (err) {
      toast.error('Holiday not added', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: HolidayRow) => {
    if (!h.id) return
    setRemoving(h.id)
    try {
      await api.delete(`/holidays/${h.id}`)
      setRows((prev) => (prev ?? []).filter((x) => x.id !== h.id))
      toast.success(`${h.name} removed`, { description: h.country })
    } catch (err) {
      toast.error('Holiday not removed', { description: errorMessage(err) })
    } finally {
      setRemoving(null)
    }
  }

  if (!rows) return <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">{error ?? 'Loading holidays…'}</div>

  return (
    <div className="grid grid-cols-1 gap-4">
      {canEdit && (
        <Section title="Add a public holiday" description="Holidays in your workspace country are excluded when leave days are counted">
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
          >
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hol-name">Name</Label>
              <Input id="hol-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mashujaa Day" maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hol-country">Country</Label>
              <Input id="hol-country" list="hol-countries" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
              <datalist id="hol-countries">
                {countries.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Button type="submit" disabled={saving || !date || name.trim().length < 2 || country.trim().length < 2}>
              {saving ? 'Adding…' : 'Add holiday'}
            </Button>
          </form>
        </Section>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {countries.map((c, ci) => {
          const list = rows.filter((h) => h.country === c).sort((a, b) => a.date.localeCompare(b.date))
          const next = list.find((h) => daysUntil(h.date) >= 0)
          const years = [...new Set(list.map((h) => h.date.slice(0, 4)))].join(', ')
          return (
            <motion.div key={c} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05 }}>
              <Section title={c} description={`${list.length} public holiday${list.length === 1 ? '' : 's'}${years ? ` · ${years}` : ''}`} action={next && <Badge variant="soft">Next in {daysUntil(next.date)} days</Badge>}>
                {list.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No holidays yet.</div>
                ) : (
                  <ul className="divide-y">
                    {list.map((h) => {
                      const d = daysUntil(h.date)
                      const isNext = h === next
                      return (
                        <li key={h.id ?? h.date + h.name} className={cn('flex items-center gap-3 py-2.5', d < 0 && 'opacity-50', isNext && '-mx-2 rounded-lg border-0 bg-accent/60 px-2')}>
                          <div className={cn('flex w-11 shrink-0 flex-col items-center rounded-lg py-1', isNext ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                            <span className="text-[10px] font-semibold uppercase">{formatDate(h.date, 'short').split(' ')[1]}</span>
                            <span className="text-base font-bold leading-none tabular">{formatDate(h.date, 'short').split(' ')[0]}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{h.name}</div>
                            <div className="text-xs text-muted-foreground">{new Date(`${h.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{d < 0 ? 'Passed' : d === 0 ? 'Today' : isNext ? 'Upcoming' : `in ${d}d`}</span>
                          {canEdit && h.id && (
                            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${h.name}`} disabled={removing === h.id} onClick={() => void remove(h)}>
                              <X />
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

type Draft = { type: LeavePolicy['type']; annualDays: string; accrual: LeavePolicy['accrual']; carryOverMax: string; expiresMonthDay: string }

const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/

/** HR editor for GET/PUT /leave/policies (entitlement, accrual, carry-over cap and expiry). */
export function PolicyEditor({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const adopt = (list: LeavePolicy[]) =>
    setRows(list.map((p) => ({ type: p.type, annualDays: String(p.annualDays), accrual: p.accrual, carryOverMax: String(p.carryOverMax), expiresMonthDay: p.expiresMonthDay ?? '' })))

  useEffect(() => {
    api
      .get<LeavePolicy[]>('/leave/policies')
      .then(adopt)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const patch = (i: number, p: Partial<Draft>) => setRows((prev) => (prev ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)))
  const invalid = (r: Draft) => {
    const n = Number(r.annualDays)
    const c = Number(r.carryOverMax)
    return r.annualDays === '' || !(n >= 0 && n <= 366) || !(c >= 0 && c <= 366) || (r.expiresMonthDay !== '' && !MD.test(r.expiresMonthDay))
  }

  const save = async () => {
    if (!rows || rows.some(invalid)) return
    setSaving(true)
    try {
      const saved = await api.put<LeavePolicy[]>('/leave/policies', {
        policies: rows.map((r) => ({
          type: r.type,
          annualDays: Number(r.annualDays),
          accrual: r.accrual,
          carryOverMax: Number(r.carryOverMax) || 0,
          expiresMonthDay: r.expiresMonthDay || null,
        })),
      })
      adopt(saved)
      onSaved()
      toast.success('Leave policy saved', { description: 'Balances are recalculated for everyone.' })
    } catch (err) {
      toast.error('Policy not saved', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title="Edit leave policy"
      description="Entitlements apply to every employee in this workspace. Carry-over expiry is a date (MM-DD) in the following leave year."
      action={
        <Button size="sm" disabled={!rows || saving || rows.some(invalid)} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save policy'}
        </Button>
      }
      contentClassName="p-0 sm:p-0"
    >
      {!rows ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{error ?? 'Loading policy…'}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Leave type</TableHead>
                  <TableHead>Days a year</TableHead>
                  <TableHead>Accrual</TableHead>
                  <TableHead>Carry-over cap</TableHead>
                  <TableHead>Carry-over expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.type} className={cn(invalid(r) && 'bg-danger-soft/40')}>
                    <TableCell className="px-4 font-medium">{r.type}</TableCell>
                    <TableCell>
                      <Input type="number" min={0} max={366} step={0.5} value={r.annualDays} onChange={(e) => patch(i, { annualDays: e.target.value })} className="h-9 w-24" aria-label={`${r.type} days a year`} />
                    </TableCell>
                    <TableCell>
                      <SimpleSelect value={r.accrual} onValueChange={(v) => patch(i, { accrual: v as Draft['accrual'] })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'upfront', label: 'Upfront' }]} className="h-9 w-32" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} max={366} step={0.5} value={r.carryOverMax} onChange={(e) => patch(i, { carryOverMax: e.target.value })} className="h-9 w-24" aria-label={`${r.type} carry-over cap`} />
                    </TableCell>
                    <TableCell>
                      <Input value={r.expiresMonthDay} onChange={(e) => patch(i, { expiresMonthDay: e.target.value.trim() })} placeholder="03-31" disabled={!Number(r.carryOverMax)} className="h-9 w-24" aria-label={`${r.type} carry-over expiry`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile cards */}
          <div className="grid gap-3 p-4 md:hidden">
            {rows.map((r, i) => (
              <div key={r.type} className={cn('rounded-lg border p-3', invalid(r) && 'border-danger/40')}>
                <div className="mb-2 text-sm font-semibold">{r.type}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Days a year</Label>
                    <Input type="number" min={0} max={366} step={0.5} value={r.annualDays} onChange={(e) => patch(i, { annualDays: e.target.value })} className="h-9" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Accrual</Label>
                    <SimpleSelect value={r.accrual} onValueChange={(v) => patch(i, { accrual: v as Draft['accrual'] })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'upfront', label: 'Upfront' }]} className="h-9" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Carry-over cap</Label>
                    <Input type="number" min={0} max={366} step={0.5} value={r.carryOverMax} onChange={(e) => patch(i, { carryOverMax: e.target.value })} className="h-9" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Expires (MM-DD)</Label>
                    <Input value={r.expiresMonthDay} onChange={(e) => patch(i, { expiresMonthDay: e.target.value.trim() })} placeholder="03-31" disabled={!Number(r.carryOverMax)} className="h-9" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}
