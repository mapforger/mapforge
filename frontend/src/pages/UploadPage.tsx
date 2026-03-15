import { useState, useCallback } from 'react'
import { Zap, Upload, FileCode, FileArchive, AlertCircle, Library, FolderOpen } from 'lucide-react'
import { createSession, createSessionFromCatalog } from '@/lib/api'
import type { Session, CatalogEntry } from '@/types'
import { useT } from '@/i18n'
import { CatalogBrowser } from '@/components/ui/CatalogBrowser'

interface UploadPageProps {
  onSession: (session: Session) => void
}

type Tab = 'library' | 'local'

export function UploadPage({ onSession }: UploadPageProps) {
  const [tab, setTab] = useState<Tab>('library')
  const t = useT()

  return (
    <div className="min-h-full bg-bg-base flex flex-col items-center justify-center p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <Zap size={32} className="text-accent" fill="currentColor" />
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">MapForge</h1>
      </div>

      <div className="w-full max-w-xl">
        {/* Tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-lg border border-bg-border p-1 mb-6">
          <TabButton active={tab === 'library'} onClick={() => setTab('library')} icon={Library} label={t.tabLibrary} />
          <TabButton active={tab === 'local'}   onClick={() => setTab('local')}   icon={FolderOpen} label={t.tabLocal} />
        </div>

        {tab === 'library'
          ? <LibraryTab onSession={onSession} t={t} />
          : <LocalTab   onSession={onSession} t={t} />
        }
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: React.FC<{ size?: number; className?: string }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-colors
        ${active
          ? 'bg-bg-surface text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-secondary'}`}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

// ── Library tab ───────────────────────────────────────────────────────────────

function LibraryTab({ onSession, t }: { onSession: (s: Session) => void; t: ReturnType<typeof useT> }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleSelect = async (entry: CatalogEntry, binFile: File) => {
    setLoading(true)
    setError(null)
    try {
      const session = await createSessionFromCatalog(entry.id, binFile)
      onSession(session)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? t.uploadError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <CatalogBrowser onSelect={handleSelect} />
      )}

      {error && <ErrorBanner message={error} />}

      <div className="border-t border-bg-border pt-4 text-center">
        <p className="text-text-muted text-xs">{t.localProcessing}</p>
      </div>
    </div>
  )
}

// ── Local tab ─────────────────────────────────────────────────────────────────

function LocalTab({ onSession, t }: { onSession: (s: Session) => void; t: ReturnType<typeof useT> }) {
  const [binFile, setBinFile] = useState<File | null>(null)
  const [xdfFile, setXdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<'bin' | 'xdf' | null>(null)

  const handleDrop = useCallback((type: 'bin' | 'xdf', e: React.DragEvent) => {
    e.preventDefault()
    setDragTarget(null)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (type === 'bin') setBinFile(file)
    else setXdfFile(file)
  }, [])

  const handleSubmit = async () => {
    if (!binFile || !xdfFile) return
    setLoading(true)
    setError(null)
    try {
      const session = await createSession(binFile, xdfFile)
      onSession(session)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? t.uploadError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary text-center text-sm">{t.uploadSubtitle}</p>

      <DropZone
        label={t.binLabel} hint={t.binHint} icon={FileArchive} file={binFile}
        isDragging={dragTarget === 'bin'} clickOrDrop={t.clickOrDrop}
        onDragEnter={() => setDragTarget('bin')} onDragLeave={() => setDragTarget(null)}
        onDrop={e => handleDrop('bin', e)} onChange={e => setBinFile(e.target.files?.[0] ?? null)}
        accept=".bin,.ori,.mod,.hex"
      />
      <DropZone
        label={t.xdfLabel} hint={t.xdfHint} icon={FileCode} file={xdfFile}
        isDragging={dragTarget === 'xdf'} clickOrDrop={t.clickOrDrop}
        onDragEnter={() => setDragTarget('xdf')} onDragLeave={() => setDragTarget(null)}
        onDrop={e => handleDrop('xdf', e)} onChange={e => setXdfFile(e.target.files?.[0] ?? null)}
        accept=".xdf"
      />

      {error && <ErrorBanner message={error} />}

      <button
        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold
                   disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={handleSubmit}
        disabled={!binFile || !xdfFile || loading}
      >
        {loading
          ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />{t.loading}</>
          : <><Upload size={16} />{t.openInEditor}</>
        }
      </button>

      <p className="text-text-muted text-xs text-center">{t.localProcessing}</p>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-lg px-4 py-3">
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}

interface DropZoneProps {
  label: string; hint: string; clickOrDrop: string
  icon: React.FC<{ size?: number; className?: string }>
  file: File | null; isDragging: boolean
  onDragEnter: () => void; onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  accept: string
}

function DropZone({ label, hint, clickOrDrop, icon: Icon, file, isDragging,
  onDragEnter, onDragLeave, onDrop, onChange, accept }: DropZoneProps) {
  return (
    <label
      className={`relative flex items-center gap-4 px-5 py-4 rounded-lg border-2 border-dashed
        cursor-pointer transition-all duration-150 group
        ${isDragging ? 'border-accent bg-accent-muted'
          : file ? 'border-accent/40 bg-accent-muted'
          : 'border-bg-border hover:border-accent/40 bg-bg-surface'}`}
      onDragOver={e => e.preventDefault()} onDragEnter={onDragEnter}
      onDragLeave={onDragLeave} onDrop={onDrop}
    >
      <input type="file" className="sr-only" accept={accept} onChange={onChange} />
      <Icon size={24} className={`flex-shrink-0 transition-colors ${file ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-medium">{label}</p>
        {file
          ? <p className="text-accent text-xs font-mono truncate">{file.name}</p>
          : <p className="text-text-muted text-xs">{hint}</p>}
      </div>
      {!file && <span className="text-text-muted text-xs hidden group-hover:block">{clickOrDrop}</span>}
    </label>
  )
}
