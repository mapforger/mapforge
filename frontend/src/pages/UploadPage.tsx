import { useState, useCallback } from 'react'
import { Zap, Upload, FileCode, FileArchive, AlertCircle } from 'lucide-react'
import { createSession } from '@/lib/api'
import type { Session } from '@/types'
import { useT } from '@/i18n'

interface UploadPageProps {
  onSession: (session: Session) => void
}

export function UploadPage({ onSession }: UploadPageProps) {
  const [binFile, setBinFile] = useState<File | null>(null)
  const [xdfFile, setXdfFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<'bin' | 'xdf' | null>(null)
  const t = useT()

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
    <div className="min-h-full bg-bg-base flex flex-col items-center justify-center p-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-12">
        <Zap size={32} className="text-accent" fill="currentColor" />
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">MapForge</h1>
      </div>

      <div className="w-full max-w-xl">
        <p className="text-text-secondary text-center mb-8 text-sm">
          {t.uploadSubtitle}
        </p>

        <div className="flex flex-col gap-4">
          {/* BIN drop zone */}
          <DropZone
            label={t.binLabel}
            hint={t.binHint}
            icon={FileArchive}
            file={binFile}
            isDragging={dragTarget === 'bin'}
            clickOrDrop={t.clickOrDrop}
            onDragEnter={() => setDragTarget('bin')}
            onDragLeave={() => setDragTarget(null)}
            onDrop={e => handleDrop('bin', e)}
            onChange={e => setBinFile(e.target.files?.[0] ?? null)}
            accept=".bin,.ori,.mod,.hex"
          />

          {/* XDF drop zone */}
          <DropZone
            label={t.xdfLabel}
            hint={t.xdfHint}
            icon={FileCode}
            file={xdfFile}
            isDragging={dragTarget === 'xdf'}
            clickOrDrop={t.clickOrDrop}
            onDragEnter={() => setDragTarget('xdf')}
            onDragLeave={() => setDragTarget(null)}
            onDrop={e => handleDrop('xdf', e)}
            onChange={e => setXdfFile(e.target.files?.[0] ?? null)}
            accept=".xdf"
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-error text-sm bg-error/10
                          border border-error/20 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          className="btn-primary w-full mt-6 py-3 flex items-center justify-center gap-2
                     text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleSubmit}
          disabled={!binFile || !xdfFile || loading}
        >
          {loading ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              {t.loading}
            </>
          ) : (
            <>
              <Upload size={16} />
              {t.openInEditor}
            </>
          )}
        </button>

        <p className="text-text-muted text-xs text-center mt-6">
          {t.localProcessing}
        </p>
      </div>
    </div>
  )
}

interface DropZoneProps {
  label: string
  hint: string
  clickOrDrop: string
  icon: React.FC<{ size?: number; className?: string }>
  file: File | null
  isDragging: boolean
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  accept: string
}

function DropZone({
  label, hint, clickOrDrop, icon: Icon, file, isDragging,
  onDragEnter, onDragLeave, onDrop, onChange, accept
}: DropZoneProps) {
  return (
    <label
      className={`relative flex items-center gap-4 px-5 py-4 rounded-lg border-2 border-dashed
                  cursor-pointer transition-all duration-150 group
                  ${isDragging
                    ? 'border-accent bg-accent-muted'
                    : file
                      ? 'border-accent/40 bg-accent-muted'
                      : 'border-bg-border hover:border-accent/40 bg-bg-surface'}`}
      onDragOver={e => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input type="file" className="sr-only" accept={accept} onChange={onChange} />

      <Icon
        size={24}
        className={`flex-shrink-0 transition-colors ${file ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'}`}
      />

      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-medium">{label}</p>
        {file ? (
          <p className="text-accent text-xs font-mono truncate">{file.name}</p>
        ) : (
          <p className="text-text-muted text-xs">{hint}</p>
        )}
      </div>

      {!file && (
        <span className="text-text-muted text-xs hidden group-hover:block">{clickOrDrop}</span>
      )}
    </label>
  )
}
