import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useWorkspace } from '@/context/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DatePicker } from '@/components/shared/DatePicker'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SurveyFull, SurveyInput } from './api'
import { surveyApi } from './api'
import { QUESTION_TYPES, blankQuestion, type Question, type QuestionType } from './data'
import { QuestionView, type Answer } from './QuestionView'

function toDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/** Survey builder: saves drafts and publishes through the API (local only in mock mode). */
export function Builder({
  open,
  onOpenChange,
  draft,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  draft?: SurveyFull | null
  onSaved: (s: SurveyFull, published: boolean) => void
}) {
  const { departments, employees } = useWorkspace()
  const [title, setTitle] = useState(draft?.title ?? 'October Pulse')
  const [audience, setAudience] = useState<string[]>(() => (draft?.departments.length ? draft.departments : departments.map((d) => d.id)))
  const [anonymous, setAnonymous] = useState(draft?.anonymous ?? true)
  const [closes, setCloses] = useState<Date | undefined>(draft ? toDate(draft.closes) : new Date(2026, 9, 9))
  const [questions, setQuestions] = useState<Question[]>(() =>
    draft?.questions.length ? draft.questions.map((q) => ({ ...q })) : [blankQuestion('emoji'), blankQuestion('nps'), blankQuestion('text')],
  )
  const [active, setActive] = useState(0)
  const [answer, setAnswer] = useState<Answer>(undefined)
  const [newType, setNewType] = useState<QuestionType>('emoji')
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null)

  const audienceCount = employees.filter((e) => audience.includes(e.departmentId) && e.status !== 'Exited').length
  const current = questions[Math.min(active, questions.length - 1)]

  const update = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= questions.length) return
    setQuestions((qs) => {
      const next = [...qs]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
    setActive(j)
  }
  const remove = (i: number) => {
    setQuestions((qs) => qs.filter((_, j) => j !== i))
    setActive((a) => Math.max(0, a >= i ? a - 1 : a))
  }
  const add = () => {
    setQuestions((qs) => [...qs, blankQuestion(newType)])
    setActive(questions.length)
    setAnswer(undefined)
  }

  const save = async (publish: boolean) => {
    if (title.trim().length < 3) return toast.error('Give your survey a title (at least 3 characters)')
    if (!audience.length) return toast.error('Pick at least one department')
    if (!questions.length) return toast.error('Add at least one question')
    const bad = questions.findIndex((q) => q.text.trim().length < 3 || (q.type === 'choice' && (q.options ?? []).filter((o) => o.trim()).length < 2))
    if (bad >= 0) {
      setActive(bad)
      return toast.error(`Question ${bad + 1} needs text${questions[bad]!.type === 'choice' ? ' and at least 2 options' : ''}`)
    }
    const input: SurveyInput = {
      title: title.trim(),
      anonymous,
      closes: closes ? format(closes, 'yyyy-MM-dd') : '2026-10-09',
      // All departments selected = the whole company (new joiners included).
      departments: audience.length === departments.length ? [] : audience,
      questions: questions.map((q) => ({ ...q, text: q.text.trim(), options: q.type === 'choice' ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
    }
    setBusy(publish ? 'publish' : 'draft')
    try {
      let saved: SurveyFull
      if (USE_MOCK_API) {
        saved = {
          id: draft?.id ?? `s-${Date.now().toString(36)}`,
          title: input.title,
          status: publish ? 'Live' : 'Draft',
          responses: 0,
          audience: audienceCount,
          engagement: 0,
          enps: 0,
          closes: input.closes,
          anonymous,
          questions: input.questions,
          departments: input.departments,
          respondedByMe: false,
        }
      } else if (draft) {
        saved = await surveyApi.update(draft.id, input)
        if (publish) saved = await surveyApi.publish(draft.id)
      } else {
        saved = await surveyApi.create(input, publish)
      }
      onSaved(saved, publish)
      toast.success(publish ? `“${saved.title}” is live` : 'Draft saved', publish ? { description: `Sent to ${saved.audience} people in the Annex HR app.` } : undefined)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-5xl" hideClose>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <SheetTitle>{draft ? 'Edit draft survey' : 'New pulse survey'}</SheetTitle>
            <SheetDescription className="truncate">Build, preview and publish in minutes</SheetDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void save(false)}>
              {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </Button>
            <Button size="sm" disabled={!!busy} onClick={() => void save(true)}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
              <X />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 flex-1 lg:grid-cols-[1.15fr_1fr]">
          {/* Form */}
          <div className="grid grid-cols-1 content-start gap-6 p-5 lg:border-r">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid grid-cols-1 gap-2 sm:col-span-2">
                <Label htmlFor="survey-title">Title</Label>
                <Input id="survey-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October Pulse" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>Closes</Label>
                <DatePicker value={closes} onChange={setCloses} />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Label>Reach</Label>
                <div className="flex h-10 items-center rounded-lg border bg-subtle px-3 text-sm tabular">{audienceCount} people</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between">
                <Label>Audience</Label>
                <button className="text-xs font-medium text-primary hover:underline" onClick={() => setAudience(audience.length === departments.length ? [] : departments.map((d) => d.id))}>
                  {audience.length === departments.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {departments.map((d) => {
                  const on = audience.includes(d.id)
                  return (
                    <label key={d.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors', on && 'border-primary/40 bg-accent/50')}>
                      <Checkbox checked={on} onCheckedChange={(c) => setAudience((a) => (c ? [...a, d.id] : a.filter((x) => x !== d.id)))} />
                      <span className="truncate">{d.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border bg-subtle p-4">
              <div>
                <div className="text-sm font-medium">Anonymous responses</div>
                <p className="mt-0.5 text-xs text-muted-foreground">Responses are anonymous — managers see aggregates only, minimum group size 5.</p>
              </div>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} aria-label="Anonymous responses" />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Label>Questions ({questions.length})</Label>
              <AnimatePresence initial={false}>
                {questions.map((q, i) => {
                  const isActive = i === active
                  return (
                    <motion.div
                      key={q.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => {
                        if (!isActive) setAnswer(undefined)
                        setActive(i)
                      }}
                      className={cn('rounded-xl border bg-card p-3 transition-shadow', isActive ? 'border-primary/50 shadow-md shadow-primary/5' : 'hover:border-foreground/20')}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Q{i + 1} · {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
                        </span>
                        <div className="ml-auto flex items-center">
                          <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, -1) }}>
                            <ArrowUp />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === questions.length - 1} onClick={(e) => { e.stopPropagation(); move(i, 1) }}>
                            <ArrowDown />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Remove question" onClick={(e) => { e.stopPropagation(); remove(i) }}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <Input className="mt-2" value={q.text} onChange={(e) => update(i, { text: e.target.value })} placeholder="Question text" />
                      {q.type === 'choice' && isActive && (
                        <div className="mt-2 grid grid-cols-1 gap-1.5">
                          {(q.options ?? []).map((o, k) => (
                            <div key={k} className="flex items-center gap-1.5">
                              <Input className="h-8 text-[13px]" value={o} onChange={(e) => update(i, { options: q.options!.map((x, m) => (m === k ? e.target.value : x)) })} />
                              <Button variant="ghost" size="icon-sm" aria-label="Remove option" onClick={() => update(i, { options: q.options!.filter((_, m) => m !== k) })}>
                                <X />
                              </Button>
                            </div>
                          ))}
                          <Button variant="link" size="sm" className="justify-start" onClick={() => update(i, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}>
                            Add option
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <div className="flex gap-2">
                <SimpleSelect value={newType} onValueChange={(v) => setNewType(v as QuestionType)} options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))} className="flex-1" />
                <Button variant="outline" onClick={add} className="h-10">
                  Add question
                </Button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="bg-subtle p-5">
            <div className="lg:sticky lg:top-24">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live preview</span>
                {anonymous && (
                  <Badge variant="muted">Anonymous</Badge>
                )}
              </div>
              <div className="mx-auto max-w-md rounded-3xl border bg-card p-5 shadow-xl shadow-black/5">
                <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{title || 'Untitled survey'}</span>
                  <span className="tabular">~{Math.max(1, Math.round(questions.length * 0.4))} min</span>
                </div>
                <div className="mb-5 h-1 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full bg-primary" animate={{ width: `${questions.length ? ((active + 1) / questions.length) * 100 : 0}%` }} />
                </div>
                <AnimatePresence mode="wait">
                  {current ? (
                    <motion.div key={current.id + current.type} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
                      <QuestionView q={current} value={answer} onChange={setAnswer} index={active} total={questions.length} />
                    </motion.div>
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">Add a question to see the preview.</p>
                  )}
                </AnimatePresence>
                <div className="mt-6 flex justify-between">
                  <Button variant="ghost" size="sm" disabled={active === 0} onClick={() => { setActive(active - 1); setAnswer(undefined) }}>
                    Back
                  </Button>
                  <Button size="sm" disabled={active >= questions.length - 1} onClick={() => { setActive(active + 1); setAnswer(undefined) }}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
