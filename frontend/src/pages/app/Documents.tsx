import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, List } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useWorkspace } from '@/context/auth'
import type { DocFile } from '@/data/types'
import { isAdminLike } from '@/lib/rbac'
import { errorMessage, USE_MOCK_API } from '@/lib/api'
import { fileDownloadUrl, formatBytes, listEmployeeFiles } from '@/lib/files'
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
import { DOC_ACCEPT, DOC_FOLDERS, documentApi, documentDownloadUrl, previewable, useDocuments, type DocItem } from './documents/api'

const MY_UPLOADS = 'My uploads'

const typeLabel: Record<DocFile['type'], string> = { pdf: 'PDF', docx: 'DOCX', xlsx: 'XLSX', png: 'IMG' }

function sizeKB(s: string) {
  const n = parseFloat(s)
  if (Number.isNaN(n)) return 0
  return s.includes('MB') ? n * 1000 : n
}

function FileType({ type, className }: { type: DocFile['type']; className?: string }) {
  return <span className={cn('shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground', className)}>{typeLabel[type]}</span>
}

function extType(name: string, contentType?: string): DocFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  if (contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext ?? '')) return 'png'
  return 'pdf'
}

export default function Documents() {
  const { workspace, user, role } = useWorkspace()
  return <DocumentsView key={`${workspace.id}-${user.id}-${role}`} />
}

function DocumentsView() {
  const { documents, employees, user, role } = useWorkspace()
  const self = isSelfRole(role)
  const admin = isAdminLike(role)
  const hrName = employees.find((e) => e.role === 'company_admin')?.name ?? 'HR'

  // Mock mode: the employee view is assembled from the demo seed.
  const seed = useMemo<DocFile[]>(() => {
    if (!USE_MOCK_API) return self ? [] : documents
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
      ...(has('Payslips') ? [] : ['Aug', 'Jul', 'Jun'].map((m, i) => mk(`my-pay-${m}`, `Payslip ${m} 2026 — ${user.name}`, 'Payslips', `2026-0${8 - i}-28`, 'pdf', `${118 + i * 3} KB`))),
    ]
    return [...mine, ...extra, ...documents.filter((d) => d.folder === 'Policies')]
  }, [self, documents, user, hrName])

  const { docs, upsert, drop } = useDocuments(seed)
  const [mine, setMine] = useState<DocItem[]>([])

  // Employees also see the files they uploaded to their own profile (ID, KRA PIN, certificates…).
  useEffect(() => {
    if (USE_MOCK_API || !self) return
    listEmployeeFiles('me')
      .then((fs) =>
        setMine(
          fs.map((f) => ({
            id: `ef-${f.id}`,
            employeeFileId: f.id,
            name: f.filename.replace(/\.[^.]+$/, ''),
            folder: MY_UPLOADS,
            size: formatBytes(f.sizeBytes),
            type: extType(f.filename, f.contentType),
            updated: f.createdAt.slice(0, 10),
            owner: f.uploadedByName ?? user.name,
            version: f.category,
            contentType: f.contentType,
            versions: [],
          })),
        ),
      )
      .catch(() => undefined)
  }, [self, user.name])

  const files = useMemo(() => [...mine, ...docs], [mine, docs])
  const folders = useMemo(() => {
    const base: string[] = self ? [...(mine.length ? [MY_UPLOADS] : []), ...DOC_FOLDERS.filter((f) => files.some((d) => d.folder === f))] : [...DOC_FOLDERS]
    for (const f of files) if (!base.includes(f.folder)) base.push(f.folder)
    return base
  }, [self, mine.length, files])

  const [folder, setFolder] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFolder, setUploadFolder] = useState<string>('Policies')
  const [uploaded, setUploaded] = useState(0)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const counts = useMemo(() => Object.fromEntries(folders.map((f) => [f, files.filter((d) => d.folder === f).length])), [files, folders])

  const visible = useMemo(() => {
    const list = files.filter((f) => (folder === 'all' || f.folder === folder) && (!q || f.name.toLowerCase().includes(q.toLowerCase())))
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'size') return sizeKB(b.size) - sizeKB(a.size)
      return b.updated.localeCompare(a.updated)
    })
  }, [files, folder, q, sort])

  const preview = files.find((f) => f.id === previewId) ?? null
  const usedMB = files.reduce((n, f) => n + sizeKB(f.size), 0) / 1000

  const uploadMock = (added: { name: string; size: string }[]) => {
    if (!USE_MOCK_API) return
    added.forEach((p, i) =>
      upsert({
        id: `up-${Date.now()}-${i}`,
        name: p.name.replace(/\.[^.]+$/, ''),
        folder: uploadFolder,
        size: p.size,
        type: extType(p.name),
        updated: TODAY,
        owner: user.name,
        version: 'v1.0',
        versions: [{ version: 'v1.0', date: TODAY, by: user.name }],
      }),
    )
    setUploaded((n) => n + added.length)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title={self ? 'My documents' : 'Documents'}
        description={self ? 'Your contract, payslips, uploaded documents and company policies — all in one place.' : 'Secure, versioned storage for policies, templates, contracts and certificates.'}
        actions={
          admin ? (
            <Button onClick={() => setUploadOpen(true)}>Upload</Button>
          ) : self ? (
            <Button asChild variant="outline">
              <Link to="/app/compliance?tab=documents">Upload a document</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {['all', ...folders].map((f) => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  folder === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'all' ? 'All files' : f}
                <span className="tabular opacity-70">{f === 'all' ? files.length : counts[f]}</span>
              </button>
            ))}
          </div>

          <div className="hidden gap-4 lg:grid">
            <Card>
              <CardContent className="p-2">
                <nav className="grid grid-cols-1 gap-0.5">
                  {['all', ...folders].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFolder(f)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        folder === f ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span className="flex-1">{f === 'all' ? 'All files' : f}</span>
                      <span className="text-xs tabular">{f === 'all' ? files.length : counts[f]}</span>
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
            <StorageCard usedMB={usedMB} count={files.length} />
          </div>
        </aside>

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
            <EmptyState title="No files found" description={q ? `Nothing matches “${q}”.` : admin ? 'Upload a file to get started.' : 'Nothing in this folder yet.'} />
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
                    onClick={() => setPreviewId(f.id)}
                    className="flex flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <FileType type={f.type} />
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
                        <FileType type={f.type} className="w-9" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{f.name}</span>
                          <span className="block text-xs text-muted-foreground md:hidden">
                            {f.version} · {f.size} · {formatDate(f.updated, 'short')}
                          </span>
                          <span className="hidden text-xs text-muted-foreground md:block">{f.folder}</span>
                        </span>
                      </span>
                      <span className="hidden truncate text-xs tabular md:block">{f.version}</span>
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
            <StorageCard usedMB={usedMB} count={files.length} />
          </div>
        </div>
      </div>

      {admin && (
        <Dialog
          open={uploadOpen}
          onOpenChange={(o) => {
            setUploadOpen(o)
            if (!o) setUploaded(0)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload company documents</DialogTitle>
              <DialogDescription>Policies, templates and contracts — versioned automatically. Employees upload their own documents from their profile.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-1.5">
                <Label>Folder</Label>
                <SimpleSelect value={uploadFolder} onValueChange={setUploadFolder} options={[...DOC_FOLDERS]} />
              </div>
              <FileUploader<DocItem>
                key={uploadFolder}
                accept={DOC_ACCEPT}
                hint="PDF, DOCX, XLSX, PNG or JPG up to 10MB"
                upload={USE_MOCK_API ? undefined : (file, onProgress) => documentApi.upload(file, uploadFolder, onProgress)}
                onUploaded={(res) => {
                  res.forEach(upsert)
                  setUploaded((n) => n + res.length)
                  toast.success(`${res.length} file${res.length === 1 ? '' : 's'} added to ${uploadFolder}`)
                }}
                onComplete={uploadMock}
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  if (uploaded) setFolder(uploadFolder)
                  setUploadOpen(false)
                  setUploaded(0)
                }}
              >
                {uploaded ? 'Done' : 'Close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Sheet open={!!preview} onOpenChange={(o) => !o && setPreviewId(null)}>
        <SheetContent className="sm:max-w-2xl">
          {preview && (
            <PreviewPanel
              key={`${preview.id}-${preview.version}`}
              doc={preview}
              admin={admin}
              hrName={hrName}
              onChanged={upsert}
              onDeleted={(id) => {
                drop(id)
                setPreviewId(null)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function PreviewPanel({ doc, admin, hrName, onChanged, onDeleted }: { doc: DocItem; admin: boolean; hrName: string; onChanged: (d: DocItem) => void; onDeleted: (id: string) => void }) {
  const { workspace, employees, user } = useWorkspace()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const stored = !USE_MOCK_API && (!!doc.fileId || !!doc.employeeFileId)
  const inlineUrl = doc.employeeFileId ? fileDownloadUrl(doc.employeeFileId, true) : documentDownloadUrl(doc.id, { inline: true })
  const downloadUrl = doc.employeeFileId ? fileDownloadUrl(doc.employeeFileId) : documentDownloadUrl(doc.id)
  const companyDoc = !doc.employeeFileId

  const downloadGenerated = () => {
    const blob = new Blob([previewText(doc as DocFile, workspace, employees)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const restore = async (version: string) => {
    setBusy(version)
    try {
      if (USE_MOCK_API) {
        const nv = `v${Math.max(...doc.versions.map((v) => parseInt(v.version.replace('v', ''), 10) || 1)) + 1}.0`
        onChanged({ ...doc, version: nv, updated: TODAY, versions: [{ version: nv, date: TODAY, by: user.name, note: `Restored ${version}` }, ...doc.versions] })
      } else {
        onChanged(await documentApi.restore(doc.id, version))
      }
      toast.success(`${version} restored as the current version`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const newVersion = async (file: File) => {
    if (USE_MOCK_API) return toast.info('Connect the API to upload new versions.')
    setProgress(0)
    try {
      const next = await documentApi.uploadVersion(doc.id, file, undefined, setProgress)
      onChanged(next)
      toast.success(`${next.version} uploaded`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setProgress(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      if (!USE_MOCK_API) await documentApi.remove(doc.id)
      onDeleted(doc.id)
      toast.success(`${doc.name} deleted`)
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="border-b p-5 pr-12">
        <FileType type={doc.type} className="mb-1 block" />
        <SheetTitle className="text-base leading-snug">{doc.name}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs">
          {doc.folder} · {doc.version} · {doc.size} · Updated {formatDate(doc.updated)}
        </SheetDescription>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5">
        <div className="flex flex-wrap gap-2">
          {stored ? (
            <>
              <Button asChild>
                <a href={downloadUrl} download>
                  Download
                </a>
              </Button>
              {previewable(doc.contentType) && (
                <Button asChild variant="outline">
                  <a href={inlineUrl} target="_blank" rel="noreferrer">
                    Open in new tab
                  </a>
                </Button>
              )}
            </>
          ) : (
            <Button onClick={downloadGenerated}>Download</Button>
          )}
          {admin && companyDoc && (
            <>
              <Button variant="outline" disabled={progress !== null} onClick={() => input.current?.click()}>
                {progress !== null ? `Uploading ${progress}%` : 'Upload new version'}
              </Button>
              <input
                ref={input}
                type="file"
                accept={DOC_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void newVersion(f)
                }}
              />
              <Button variant="ghost" disabled={busy === 'delete'} onClick={() => void remove()}>
                Delete
              </Button>
            </>
          )}
        </div>
        {progress !== null && <Progress value={progress} className="h-1.5" />}

        <div className="overflow-hidden rounded-xl bg-muted/60 p-2 sm:p-4">
          {stored && previewable(doc.contentType) ? (
            doc.contentType === 'application/pdf' ? (
              <iframe title={doc.name} src={inlineUrl} className="h-[70vh] w-full rounded-lg border bg-card" />
            ) : (
              <img src={inlineUrl} alt={doc.name} className="mx-auto max-h-[70vh] rounded-lg border bg-card object-contain" />
            )
          ) : stored ? (
            <EmptyState title="No inline preview" description="This file type can’t be previewed in the browser — download it to open." className="py-10" />
          ) : (
            <DocPreview file={doc as DocFile} ws={workspace} employees={employees} hrName={hrName} />
          )}
        </div>

        {companyDoc && doc.versions.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Version history</h4>
            <ul className="divide-y rounded-xl border">
              {doc.versions.map((v, i) => (
                <li key={`${v.version}-${i}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <PersonCell
                    size="sm"
                    name={v.by.replace(/ \(.*\)$/, '')}
                    sub={
                      <>
                        <span className="font-medium text-foreground">{v.version}</span> · {formatDate(v.date)}
                        {v.note && ` · ${v.note}`}
                      </>
                    }
                  />
                  <div className="flex items-center gap-1.5">
                    {!USE_MOCK_API && v.hasFile && i > 0 && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={documentDownloadUrl(doc.id, { version: v.version })} download>
                          Download
                        </a>
                      </Button>
                    )}
                    {i === 0 ? (
                      <Badge variant="success" dot>
                        Current
                      </Badge>
                    ) : (
                      admin && (
                        <Button size="sm" variant="outline" disabled={busy === v.version} onClick={() => void restore(v.version)}>
                          Restore
                        </Button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function StorageCard({ usedMB, count }: { usedMB: number; count: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm font-semibold">Storage</div>
        <div className="text-xs text-muted-foreground tabular">
          {count} file{count === 1 ? '' : 's'} · {usedMB < 1 ? `${Math.max(1, Math.round(usedMB * 1000))} KB` : `${usedMB.toFixed(1)} MB`}
        </div>
      </CardContent>
    </Card>
  )
}
