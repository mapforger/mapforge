import { Download, Trash2, Zap, ShieldCheck, ShieldAlert, Shield, X, Wrench } from 'lucide-react'
import type { Session, ChecksumStatus, ChecksumBlockResult } from '@/types'
import { exportBin } from '@/lib/api'
import { useState } from 'react'
import { useToast, apiError } from '@/components/ui/Toast'
import { useT, useLang } from '@/i18n'

interface TopbarProps {
  session: Session
  onClose: () => void
  checksumStatus?: ChecksumStatus
  onFixChecksums?: () => Promise<void>
  isFixing?: boolean
}

export function Topbar({ session, onClose, checksumStatus, onFixChecksums, isFixing }: TopbarProps) {
  const [exporting, setExporting] = useState(false)
  const [checksumOpen, setChecksumOpen] = useState(false)
  const [exportConfirm, setExportConfirm] = useState(false)
  const { toast } = useToast()
  const { lang, setLang } = useLang()
  const t = useT()
  const sizeKB = (session.bin_size / 1024).toFixed(1)
  const stem = session.bin_name.replace(/\.[^.]+$/, '')
  const suggestedName = `${stem}_modified.bin`

  const invalidChecksums = checksumStatus?.has_blocks
    ? checksumStatus.current.filter(r => !r.valid).length
    : 0

  const doExport = async () => {
    setExporting(true)
    try {
      const url = exportBin(session.file_id)

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{ description: 'ECU Binary', accept: { 'application/octet-stream': ['.bin', '.ori', '.mod'] } }],
          })
          const response = await fetch(url)
          const blob = await response.blob()
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          toast({ message: t.exported(suggestedName), variant: 'success' })
          return
        } catch (e: any) {
          if (e?.name === 'AbortError') return
        }
      }

      const response = await fetch(url)
      const blob = await response.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = suggestedName
      a.click()
      URL.revokeObjectURL(a.href)
      toast({ message: t.exported(suggestedName), variant: 'success' })
    } catch (err) {
      toast({ message: t.exportError(apiError(err)), variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const handleExport = () => {
    if (invalidChecksums > 0) {
      setExportConfirm(true)
    } else {
      doExport()
    }
  }

  const handleFixAndExport = async () => {
    setExportConfirm(false)
    if (onFixChecksums) await onFixChecksums()
    await doExport()
  }

  return (
    <header className="h-12 bg-bg-surface border-b border-bg-border flex items-center px-4 gap-4 flex-shrink-0 relative">
      <div className="flex items-center gap-2 mr-4">
        <Zap size={18} className="text-accent" fill="currentColor" />
        <span className="font-semibold text-text-primary tracking-tight">MapForge</span>
      </div>

      <div className="flex items-center gap-2 text-sm font-mono">
        <span className="text-text-secondary">{session.bin_name}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{sizeKB} KB</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{session.xdf_title || session.xdf_name}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Language toggle */}
        <div className="flex items-center gap-0.5 bg-bg-elevated rounded border border-bg-border p-0.5">
          {(['en', 'fr'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-2 py-0.5 text-xs rounded font-medium uppercase transition-colors
                ${lang === l ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Checksum badge */}
        {checksumStatus && (
          <ChecksumBadge
            status={checksumStatus}
            open={checksumOpen}
            onToggle={() => setChecksumOpen(o => !o)}
            t={t}
          />
        )}

        <button onClick={handleExport} disabled={exporting}
          className="btn-primary flex items-center gap-2 text-sm py-1.5 disabled:opacity-60">
          {exporting
            ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
            : <Download size={14} />}
          {t.exportBin}
        </button>
        <button onClick={onClose} className="btn-ghost flex items-center gap-1.5 text-sm py-1.5">
          <Trash2 size={14} />
          {t.close}
        </button>
      </div>

      {/* Click-outside overlay for checksum panel */}
      {checksumOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setChecksumOpen(false)} />
      )}

      {/* Checksum detail panel */}
      {checksumOpen && checksumStatus && (
        <ChecksumPanel
          status={checksumStatus}
          onClose={() => setChecksumOpen(false)}
          onFix={onFixChecksums}
          isFixing={!!isFixing}
          t={t}
        />
      )}

      {/* Export confirmation modal */}
      {exportConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setExportConfirm(false)}>
          <div className="bg-bg-surface border border-bg-border rounded-xl p-6 w-[420px] shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert size={28} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-text-primary font-semibold text-base">
                  {t.exportInvalidTitle(invalidChecksums)}
                </h3>
                <p className="text-text-muted text-sm mt-1">
                  {t.exportInvalidDesc}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {onFixChecksums && (
                <button onClick={handleFixAndExport} disabled={exporting}
                  className="btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-50">
                  <Wrench size={15} />
                  {t.fixAndExport}
                </button>
              )}
              <button onClick={() => { setExportConfirm(false); doExport() }} disabled={exporting}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded text-sm
                  text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-colors">
                {t.exportAnyway}
              </button>
              <button onClick={() => setExportConfirm(false)}
                className="btn-ghost py-2.5 text-sm">
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// ── Checksum badge ────────────────────────────────────────────────────────────

function checksumSummary(results: ChecksumBlockResult[]) {
  const invalid = results.filter(r => !r.valid).length
  return { invalid, total: results.length }
}

function ChecksumBadge({ status, open, onToggle, t }: {
  status: ChecksumStatus
  open: boolean
  onToggle: () => void
  t: ReturnType<typeof useT>
}) {
  if (!status.has_blocks) {
    return (
      <button onClick={onToggle}
        title="Checksums — no blocks defined in XDF"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-sm transition-colors
          ${open ? 'bg-bg-elevated text-text-secondary' : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'}`}>
        <Shield size={14} />
        <span className="text-xs font-mono">—</span>
      </button>
    )
  }

  const curr = checksumSummary(status.current)
  const allOk = curr.invalid === 0

  return (
    <button onClick={onToggle}
      title={allOk ? t.checksumBadgeValid : t.checksumBadgeInvalid(curr.invalid, curr.total)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium transition-colors
        ${open
          ? 'bg-bg-elevated'
          : allOk
            ? 'text-emerald-400 hover:bg-bg-elevated'
            : 'text-amber-400 hover:bg-bg-elevated'}`}>
      {allOk
        ? <ShieldCheck size={14} className="text-emerald-400" />
        : <ShieldAlert size={14} className="text-amber-400" />}
      <span className="text-xs font-mono">
        {allOk ? 'OK' : `${curr.invalid}/${curr.total}`}
      </span>
    </button>
  )
}

// ── Checksum detail panel ────────────────────────────────────────────────────

function ChecksumPanel({ status, onClose, onFix, isFixing, t }: {
  status: ChecksumStatus
  onClose: () => void
  onFix?: () => void
  isFixing: boolean
  t: ReturnType<typeof useT>
}) {
  const currentInvalid = status.current.filter(r => !r.valid).length
  const origInvalid = status.original.filter(r => !r.valid).length

  return (
    <div className="absolute top-full right-0 mt-1 w-96 bg-bg-surface border border-bg-border rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
        <span className="font-semibold text-text-primary text-sm">{t.checksumTitle}</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <X size={14} />
        </button>
      </div>

      {!status.has_blocks ? (
        <div className="px-4 py-6 text-center">
          <Shield size={32} className="text-text-muted/30 mx-auto mb-2" />
          <p className="text-text-secondary text-sm font-medium">{t.noBlocksDefined}</p>
          <p className="text-text-muted text-xs mt-1">{t.noBlocksDesc}</p>
        </div>
      ) : (
        <div className="divide-y divide-bg-border">
          {/* Original status */}
          <StatusSection
            label={t.originalFile}
            results={status.original}
            invalid={origInvalid}
            muted
            t={t}
          />

          {/* Current status */}
          <StatusSection
            label={t.currentState}
            results={status.current}
            invalid={currentInvalid}
            t={t}
          />

          {/* Fix button */}
          {currentInvalid > 0 && onFix && (
            <div className="px-4 py-3">
              <button
                onClick={onFix}
                disabled={isFixing}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2 disabled:opacity-50">
                {isFixing
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  : <Wrench size={14} />}
                {isFixing ? t.fixing : t.fixN(currentInvalid)}
              </button>
            </div>
          )}
          {currentInvalid === 0 && (
            <div className="px-4 py-3 text-center text-xs text-emerald-400 font-medium">
              {t.allValid}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusSection({ label, results, invalid, muted, t }: {
  label: string
  results: ChecksumBlockResult[]
  invalid: number
  muted?: boolean
  t: ReturnType<typeof useT>
}) {
  return (
    <div className={`px-4 py-3 space-y-2 ${muted ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</span>
        {invalid === 0
          ? <span className="text-xs text-emerald-400 font-medium">{t.checksumValid}</span>
          : <span className="text-xs text-amber-400 font-medium">{t.checksumInvalid(invalid)}</span>}
      </div>
      {results.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs font-mono">
          <span className={`mt-0.5 flex-shrink-0 ${r.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
            {r.valid ? '✓' : '✗'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary truncate">{r.label}</p>
            <p className="text-text-muted text-[10px]">
              {r.algorithm}
              {r.store_address && <span className="text-text-muted/60 ml-1">@ {r.store_address}</span>}
              {r.error && <span className="text-error ml-1">{r.error}</span>}
              {!r.error && !r.valid && r.stored && r.computed && (
                <span className="ml-1">
                  · {t.stored} <span className="text-amber-400">{r.stored}</span>
                  {' → '}{t.expected} <span className="text-emerald-400">{r.computed}</span>
                </span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
