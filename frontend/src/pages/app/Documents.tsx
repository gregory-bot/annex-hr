import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  Download,
  Eye,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Handshake,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Mail,
  RotateCcw,
  ScrollText,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { DocFile } from '@/data/types'
import { isSelfRole } from './onboarding/util'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { SimpleSelect } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from '@/components/shared/EmptyState'
import { FileUploader } from '@/components/shared/FileUploader'
import { PageHeader } from '@/components/shared/PageHeader'
import { PersonCell } from '@/components/shared/PersonCell'
import { SearchInput } from '@/components/shared/SearchInput'
import { cn, formatDate, TODAY } from '@/lib/utils'
import { DocPreview, previewText } from './documents/DocPreview'

const FOLDERS: { name: string; icon: LucideIcon }[] = [
  { name: 'Contracts', icon: FileSignature },
  { name: 'NDAs', icon: Handshake },
  { name: 'Offer Letters', icon: Mail },
  { name: 'Certificates', icon: Award },
  { name: 'Payslips', icon: Wallet },
  { name: 'Policies', icon: ScrollText },
]

const typeMeta: Record<DocFile['type'], { icon: LucideIcon; cls: string; label: string }> = {
  pdf: { icon: FileText, cls: 'bg-accent text-primary', label: 'PDF' },
  docx: { icon: FileText, cls: 'bg-info-soft text-info', label: 'DOCX' },
  xlsx: { icon: FileSpreadsheet, cls: 'bg-success-soft text-success', label: 'XLSX' },
  png: { icon: ImageIcon, cls: 'bg-muted text-muted-foreground', label: 'PNG' },
}

function sizeKB(s: string) {
  const n = parseFloat(s)
  return s.includes('MB') ? n * 1000 : n
}

function FileIcon({ type, className }: { type: DocFile['type']; className?: string }) {
  const m = typeMeta[type]
  const Icon = m.icon
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center rounded-lg', m.cls, className ?? 'size-10')}>
      <Icon className="size-1/2" />
      <span className="absolute -bottom-1 rounded bg-card px-1 text-[8px] font-bold leading-tight tracking-wide shadow-sm ring-1 ring-border">{m.label}</span>
    </span>
  )
}

export default function Documents() {
  const { workspace, user, role } = useWorkspace()
  return <DocumentsView key={`${workspace.id}-${user.id}-${role}`} />
}

function DocumentsView() {
  const { documents, employees, workspace, user, role } = useWorkspace()
  const self = isSelfRole(role)
  const hrName = employees.find((e) => e.role === 'company_admin')?.name ?? 'HR'

  const seed = useMemo<DocFile[]>(() => {
    if (!self) return documents
    const mk = (id: string, name: string, folder: string, updated: string, type: DocFile['type'] = 'pdf', size = '184 KB'): DocFile => ({
      id,
      name,
      folder,
      size,
      type,
      updated,
      owner: hrName,
      version: 'v1.0',
      versions: [{ version: 'v1.0', date: updated, by: hrName }],
    })
    const mine = documents.filter((d) => d.name.includes(user.name))
    const has = (f: string) => mine.some((d) => d.folder === f)
    const extra: DocFile[] = [
      ...(has('Contracts') ? [] : [mk('my-contract', `Employment Contract — ${user.name}`, 'Contracts', user.startDate, 'pdf', '312 KB')]),
      ...(has('NDAs') ? [] : [mk('my-nda', `NDA — ${user.name}`, 'NDAs', user.startDate, 'pdf', '146 KB')]),
      ...(has('Offer Letters') ? [] : [mk('my-offer', `Offer Letter — ${user.name}`, 'Offer Letters', user.startDate, 'docx', '98 KB')]),
      ...(has('Payslips')
        ? []
        : ['Aug', 'Jul', 'Jun'].map((m, i) => mk(`my-pay-${m}`, `Payslip ${m} 2026 — ${user.name}`, 'Payslips', `2026-0${8 - i}-28`, 'pdf', `${118 + i * 3} KB`))),
    ]
    const shared = documents.filter((d) => d.folder === 'Policies')
    return [...mine, ...extra, ...shared]
  }, [self, documents, user, hrName])

  const [files, setFiles] = useState<DocFile[]>(seed)
  const [folder, setFolder] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFolder, setUploadFolder] = useState('Contracts')
  const [pending, setPending] = useState<{ name: string; size: string }[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)

  const counts = useMemo(() => Object.fromEntries(FOLDERS.map((f) => [f.name, files.filter((d) => d.folder === f.name).length])), [files])

  const visible = useMemo(() => {
    const list = files.filter((f) => (folder === 'all' || f.folder === folder) && (!q || f.name.toLowerCase().includes(q.toLowerCase())))
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'size') return sizeKB(b.size) - sizeKB(a.size)
      return b.updated.localeCompare(a.updated)
    })
  }, [files, folder, q, sort])

  const preview = files.find((f) => f.id === previewId) ?? null

  const saveUpload = () => {
    const added: DocFile[] = pending.map((p, i) => {
      const ext = p.name.split('.').pop()?.toLowerCase()
      const type: DocFile['type'] = ext === 'docx' || ext === 'doc' ? 'docx' : ext === 'xlsx' || ext === 'xls' || ext === 'csv' ? 'xlsx' : ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? 'png' : 'pdf'
      return {
        id: `up-${Date.now()}-${i}`,
        name: p.name.replace(/\.[^.]+$/, ''),
        folder: uploadFolder,
        size: p.size,
        type,
        updated: TODAY,
        owner: user.name,
        version: 'v1.0',
        versions: [{ version: 'v1.0', date: TODAY, by: user.name }],
      }
    })
    setFiles((f) => [...added, ...f])
    setFolder(uploadFolder)
    toast.success(`${added.length} file${added.length === 1 ? '' : 's'} added to ${uploadFolder}`)
    setPending([])
    setUploadOpen(false)
  }

  const download = (f: DocFile) => {
    const blob = new Blob([previewText(f, workspace, employees)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${f.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
    toast.success(`Downloading ${f.name}`)
  }

  const restore = (f: DocFile, version: string) => {
    const nextMajor = Math.max(...f.versions.map((v) => parseInt(v.version.replace('v', ''), 10) || 1)) + 1
    const nv = `v${nextMajor}.0`
    setFiles((list) =>
      list.map((x) => (x.id === f.id ? { ...x, version: nv, updated: TODAY, versions: [{ version: nv, date: TODAY, by: `${user.name} (restored ${version})` }, ...x.versions] } : x)),
    )
    toast.success(`${version} restored as ${nv}`)
  }

  const usedGB = self ? 0.04 : 3.2

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title={self ? 'My documents' : 'Documents'}
        description={self ? 'Your contract, NDA, offer letter, payslips and company policies — all in one place.' : 'Secure, versioned storage for contracts, payslips, certificates and policies.'}
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload /> Upload
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Folder rail */}
        <aside className="min-w-0">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {[{ name: 'all', icon: FolderOpen }, ...FOLDERS].map((f) => (
              <button
                key={f.name}
                onClick={() => setFolder(f.name)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  folder === f.name ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <f.icon className="size-3.5" />
                {f.name === 'all' ? 'All files' : f.name}
                <span className="tabular opacity-70">{f.name === 'all' ? files.length : counts[f.name]}</span>
              </button>
            ))}
          </div>

          <div className="hidden gap-4 lg:grid">
            <Card>
              <CardContent className="p-2">
                <nav className="grid grid-cols-1 gap-0.5">
                  {[{ name: 'all', icon: FolderOpen }, ...FOLDERS].map((f) => (
                    <button
                      key={f.name}
                      onClick={() => setFolder(f.name)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        folder === f.name ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <f.icon className="size-4" />
                      <span className="flex-1">{f.name === 'all' ? 'All files' : f.name}</span>
                      <span className="text-xs tabular">{f.name === 'all' ? files.length : counts[f.name]}</span>
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
            <StorageCard used={usedGB} total={self ? 1 : 50} />
          </div>
        </aside>

        {/* Main */}
        <div className="grid grid-cols-1 min-w-0 content-start gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Search files…" className="sm:flex-1" />
            <div className="flex gap-2">
              <SimpleSelect
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: 'updated', label: 'Last updated' },
                  { value: 'name', label: 'Name (A–Z)' },
                  { value: 'size', label: 'Largest first' },
                ]}
                className="h-9 flex-1 sm:w-40"
              />
              <div className="flex rounded-lg border bg-card p-0.5">
                {(['grid', 'list'] as const).map((v) => {
                  const Icon = v === 'grid' ? LayoutGrid : List
                  return (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      aria-label={`${v} view`}
                      className={cn('flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors', view === v && 'bg-muted text-foreground')}
                    >
                      <Icon className="size-4" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No files found" description={q ? `Nothing matches “${q}”.` : 'Upload a file to get started.'} />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {visible.map((f, i) => (
                  <motion.button
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.02 }}
                    whileHover={{ y: -2 }}
                    onClick={() => setPreviewId(f.id)}
                    className="group flex flex-col rounded-xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-lg hover:shadow-black/[0.04]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <FileIcon type={f.type} />
                      <Badge variant="muted">{f.version}</Badge>
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm font-medium">{f.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {f.folder} · {f.size}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <span className="truncate">{f.owner}</span>
                      <span className="shrink-0">{formatDate(f.updated, 'short')}</span>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="hidden grid-cols-[minmax(0,1fr)_70px_80px_110px_160px] gap-3 border-b px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                <span>Name</span>
                <span>Version</span>
                <span>Size</span>
                <span>Updated</span>
                <span>Owner</span>
              </div>
              <ul className="divide-y">
                {visible.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => setPreviewId(f.id)} className="grid grid-cols-1 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_70px_80px_110px_160px]">
                      <span className="flex min-w-0 items-center gap-3">
                        <FileIcon type={f.type} className="size-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{f.name}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">
                            {f.version} · {f.size} · {formatDate(f.updated, 'short')}
                          </span>
                          <span className="hidden text-xs text-muted-foreground md:block">{f.folder}</span>
                        </span>
                      </span>
                      <span className="hidden text-xs tabular md:block">{f.version}</span>
                      <span className="hidden text-xs tabular text-muted-foreground md:block">{f.size}</span>
                      <span className="hidden text-xs text-muted-foreground md:block">{formatDate(f.updated)}</span>
                      <span className="hidden truncate text-xs text-muted-foreground md:block">{f.owner}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="lg:hidden">
            <StorageCard used={usedGB} total={self ? 1 : 50} />
          </div>
        </div>
      </div>

      {/* Upload */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => {
          setUploadOpen(o)
          if (!o) setPending([])
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>Files are encrypted at rest and versioned automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 gap-1.5">
              <Label>Folder</Label>
              <SimpleSelect value={uploadFolder} onValueChange={setUploadFolder} options={FOLDERS.map((f) => f.name)} />
            </div>
            <FileUploader hint="PDF, DOCX, XLSX or PNG up to 25MB" onComplete={(fs) => setPending((p) => [...p, ...fs])} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending.length === 0} onClick={saveUpload}>
              Add {pending.length || ''} file{pending.length === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Sheet open={!!preview} onOpenChange={(o) => !o && setPreviewId(null)}>
        <SheetContent className="sm:max-w-2xl">
          {preview && (
            <div className="flex flex-col">
              <div className="flex items-start gap-3 border-b p-5 pr-12">
                <FileIcon type={preview.type} />
                <div className="min-w-0">
                  <SheetTitle className="text-base leading-snug">{preview.name}</SheetTitle>
                  <SheetDescription className="mt-0.5 text-xs">
                    {preview.folder} · {preview.version} · {preview.size} · Updated {formatDate(preview.updated)}
                  </SheetDescription>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 p-5">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => download(preview)}>
                    <Download /> Download
                  </Button>
                  <Button variant="outline" onClick={() => toast.success('Secure share link copied — expires in 7 days')}>
                    <Eye /> Share view-only link
                  </Button>
                </div>
                <div className="rounded-xl bg-muted/60 p-2 sm:p-4">
                  <DocPreview file={preview} ws={workspace} employees={employees} hrName={hrName} />
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Version history</h4>
                  <ul className="divide-y rounded-xl border">
                    {preview.versions.map((v, i) => (
                      <li key={`${v.version}-${i}`} className="flex items-center justify-between gap-3 p-3">
                        <PersonCell
                          size="sm"
                          name={v.by.replace(/ \(.*\)$/, '')}
                          sub={
                            <>
                              <span className="font-medium text-foreground">{v.version}</span> · {formatDate(v.date)}
                              {v.by.includes('(') && ` · ${v.by.match(/\((.*)\)/)?.[1]}`}
                            </>
                          }
                        />
                        {i === 0 ? (
                          <Badge variant="success" dot>
                            Current
                          </Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => restore(preview, v.version)}>
                            <RotateCcw /> Restore
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function StorageCard({ used, total }: { used: number; total: number }) {
  const pct = (used / total) * 100
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <HardDrive className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Storage</div>
            <div className="text-xs text-muted-foreground tabular">
              {used < 1 ? `${Math.round(used * 1000)} MB` : `${used} GB`} of {total} GB used
            </div>
          </div>
        </div>
        <Progress value={Math.max(pct, 1.5)} className="mt-3 h-1.5" />
      </CardContent>
    </Card>
  )
}
