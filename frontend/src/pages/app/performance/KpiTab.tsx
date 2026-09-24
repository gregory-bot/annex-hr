import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { KPI } from '@/data/types'
import { api, errorMessage, USE_MOCK_API } from '@/lib/api'
import { isAdminLike } from '@/lib/rbac'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { Section } from '@/components/shared/Section'
import { ChartTooltip, SERIES } from '@/components/charts/ChartKit'
import { PERSPECTIVES, attainment, isLowerBetter, kpiOnTrack, weightedScore } from './data'
import { useRemote, type Kpi, type KpiPayload, type Scorecard } from './api'

const fmt = (v: number, unit: string) => (unit === '%' || unit.startsWith('/') ? `${v}${unit}` : unit ? `${v} ${unit}` : String(v))
const short = (p: string) => (p === 'Internal Process' ? 'Process' : p === 'Learning & Growth' ? 'Learning' : p)

function localScorecard(kpis: Kpi[]): Scorecard {
  return {
    overall: weightedScore(kpis),
    onTrack: kpis.filter(kpiOnTrack).length,
    total: kpis.length,
    perspectives: PERSPECTIVES.map((p) => {
      const items = kpis.filter((k) => k.perspective === p)
      return { perspective: p, score: weightedScore(items), weight: items.reduce((s, k) => s + k.weight, 0), count: items.length }
    }),
    kpis: kpis.map((k) => ({ id: k.id, attainment: attainment(k) * 100, onTrack: kpiOnTrack(k) })),
  }
}

type Draft = { id?: string; perspective: KPI['perspective']; name: string; target: string; actual: string; unit: string; weight: string; owner: string; lowerIsBetter: boolean }

const blank = (owner: string): Draft => ({ perspective: 'Financial', name: '', target: '', actual: '', unit: '%', weight: '10', owner, lowerIsBetter: false })

export function KpiTab() {
  const { kpis: seeded, role, user } = useWorkspace()
  const canEdit = isAdminLike(role)
  const canUpdateActual = canEdit || role === 'manager'
  const remote = useRemote<KpiPayload>('/performance/kpis')
  const [mockKpis, setMockKpis] = useState<Kpi[]>(seeded)
  const kpis = USE_MOCK_API ? mockKpis : remote.data?.kpis ?? []
  const card = useMemo(() => (USE_MOCK_API || !remote.data ? localScorecard(kpis) : remote.data.scorecard), [kpis, remote.data])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const overall = card.overall
  const radar = card.perspectives.map((p) => ({ perspective: short(p.perspective), score: Math.round(p.score) }))

  const open = (k?: Kpi) =>
    setDraft(
      k
        ? { id: k.id, perspective: k.perspective, name: k.name, target: String(k.target), actual: String(k.actual), unit: k.unit, weight: String(k.weight), owner: k.owner, lowerIsBetter: isLowerBetter(k) }
        : blank(user.name),
    )

  const save = async () => {
    if (!draft) return
    const body = {
      perspective: draft.perspective,
      name: draft.name.trim(),
      target: Number(draft.target),
      actual: Number(draft.actual || 0),
      unit: draft.unit.trim(),
      weight: Math.round(Number(draft.weight)),
      owner: draft.owner.trim(),
      lowerIsBetter: draft.lowerIsBetter,
    }
    if (canEdit && (!body.name || !body.owner || !Number.isFinite(body.target) || !(body.weight >= 1 && body.weight <= 100))) {
      toast.error('Check the KPI', { description: 'Name, owner, a numeric target and a weight of 1–100 are required.' })
      return
    }
    setSaving(true)
    try {
      if (USE_MOCK_API) {
        setMockKpis((ks) => (draft.id ? ks.map((k) => (k.id === draft.id ? { ...k, ...(canEdit ? body : { actual: body.actual }) } : k)) : [...ks, { id: `kpi-${Date.now()}`, ...body }]))
      } else {
        const payload = canEdit ? body : { actual: body.actual }
        const res = draft.id ? await api.patch<KpiPayload>(`/performance/kpis/${draft.id}`, payload) : await api.post<KpiPayload>('/performance/kpis', payload)
        remote.setData({ kpis: res.kpis, scorecard: res.scorecard })
      }
      toast.success(draft.id ? 'KPI updated' : 'KPI added')
      setDraft(null)
    } catch (err) {
      toast.error('KPI not saved', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    setSaving(true)
    try {
      if (USE_MOCK_API) setMockKpis((ks) => ks.filter((k) => k.id !== draft.id))
      else remote.setData(await api.delete<KpiPayload>(`/performance/kpis/${draft.id}`))
      toast.success('KPI removed')
      setDraft(null)
    } catch (err) {
      toast.error('KPI not removed', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  if (!USE_MOCK_API && remote.loading && !remote.data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading scorecard…</p>

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:flex-row sm:text-left">
          <ProgressRing value={overall} size={132} stroke={12} tone={overall >= 90 ? 'success' : overall >= 75 ? 'primary' : 'warning'} label={<span className="text-2xl">{Math.round(overall)}%</span>} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Balanced scorecard</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">Overall weighted score</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {card.onTrack} of {card.total} KPIs on track. Attainment is capped at 100% per KPI and weighted by importance.
            </p>
            {canEdit && (
              <Button size="sm" className="mt-3" onClick={() => open()}>
                Add KPI
              </Button>
            )}
          </div>
        </Card>
        <Section title="Perspective scores" description="Weighted attainment per scorecard perspective">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="perspective" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v}%`} />} />
              <Radar dataKey="score" name="Score" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.18} />
            </RadarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PERSPECTIVES.map((p, pi) => {
          const items = kpis.filter((k) => k.perspective === p)
          const ps = card.perspectives.find((x) => x.perspective === p)
          return (
            <motion.div key={p} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: pi * 0.06 }}>
              <Card className="h-full p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{p}</div>
                    <div className="text-xs text-muted-foreground">Weight {ps?.weight ?? 0}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold tabular">{Math.round(ps?.score ?? 0)}%</div>
                    <div className="text-[11px] text-muted-foreground">attainment</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  {items.map((k) => {
                    const a = attainment(k)
                    const ok = kpiOnTrack(k)
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{k.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {k.owner} · weight {k.weight}%{isLowerBetter(k) ? ' · lower is better' : ''}
                            </div>
                          </div>
                          <Badge variant={ok ? 'success' : 'warning'} dot>
                            {ok ? 'On track' : 'At risk'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Progress value={Math.min(100, a * 100)} tone={ok ? 'primary' : 'warning'} className="flex-1" />
                          <span className="w-28 shrink-0 text-right text-xs tabular">
                            <span className="font-semibold">{fmt(k.actual, k.unit)}</span>
                            <span className="text-muted-foreground"> / {fmt(k.target, k.unit)}</span>
                          </span>
                        </div>
                      </>
                    )
                    return canUpdateActual ? (
                      <button key={k.id} type="button" onClick={() => open(k)} className="-m-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/50">
                        {body}
                      </button>
                    ) : (
                      <div key={k.id}>{body}</div>
                    )
                  })}
                  {!items.length && <p className="text-sm text-muted-foreground">No KPIs in this perspective yet.</p>}
                </div>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? (canEdit ? 'Edit KPI' : 'Update actual') : 'Add KPI'}</DialogTitle>
            <DialogDescription>{canEdit ? 'Targets, weights and owners shape the company scorecard.' : 'Record the latest actual for this KPI.'}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4 sm:grid-cols-2">
              {canEdit && (
                <>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="kpi-name">Name</Label>
                    <Input id="kpi-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Net revenue retention" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Perspective</Label>
                    <SimpleSelect value={draft.perspective} onValueChange={(v) => setDraft({ ...draft, perspective: v as KPI['perspective'] })} options={PERSPECTIVES} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kpi-owner">Owner</Label>
                    <Input id="kpi-owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kpi-target">Target</Label>
                    <Input id="kpi-target" type="number" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} className="tabular" />
                  </div>
                </>
              )}
              <div className="grid gap-2">
                <Label htmlFor="kpi-actual">Actual</Label>
                <Input id="kpi-actual" type="number" value={draft.actual} onChange={(e) => setDraft({ ...draft, actual: e.target.value })} className="tabular" />
              </div>
              {canEdit && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="kpi-unit">Unit</Label>
                    <Input id="kpi-unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="%, days, /5" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kpi-weight">Weight (%)</Label>
                    <Input id="kpi-weight" type="number" min={1} max={100} value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} className="tabular" />
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm sm:col-span-2">
                    Lower is better
                    <Switch checked={draft.lowerIsBetter} onCheckedChange={(v) => setDraft({ ...draft, lowerIsBetter: v })} />
                  </label>
                </>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {canEdit && draft?.id && (
              <Button variant="outline" onClick={remove} disabled={saving} className="sm:mr-auto">
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
