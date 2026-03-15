import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, Users, ChevronRight, FileArchive, X, ShieldAlert, Shield } from 'lucide-react'
import { searchCatalog } from '@/lib/api'
import type { CatalogEntry } from '@/types'
import { useT } from '@/i18n'

interface CatalogBrowserProps {
  onSelect: (entry: CatalogEntry, binFile: File) => void
}

export function CatalogBrowser({ onSelect }: CatalogBrowserProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<CatalogEntry | null>(null)
  const [binFile, setBinFile] = useState<File | null>(null)
  const [binDragging, setBinDragging] = useState(false)
  const t = useT()

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['catalog', search],
    queryFn: () => searchCatalog({ q: search || undefined }),
    staleTime: 30_000,
  })

  const handleProceed = () => {
    if (selected && binFile) onSelect(selected, binFile)
  }

  if (selected) {
    return (
      <XdfSelected
        entry={selected}
        binFile={binFile}
        binDragging={binDragging}
        onBack={() => { setSelected(null); setBinFile(null) }}
        onBinDrop={e => {
          e.preventDefault()
          setBinDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) setBinFile(f)
        }}
        onBinChange={e => setBinFile(e.target.files?.[0] ?? null)}
        onBinDragEnter={() => setBinDragging(true)}
        onBinDragLeave={() => setBinDragging(false)}
        onProceed={handleProceed}
        t={t}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="input w-full pl-9 py-2 text-sm"
          placeholder={t.catalogSearch}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Results */}
      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {isLoading && (
          <p className="text-text-muted text-sm text-center py-6 animate-pulse">{t.catalogLoading}</p>
        )}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-text-secondary text-sm font-medium">{t.catalogEmpty}</p>
            <p className="text-text-muted text-xs mt-1">{t.catalogEmptyDesc}</p>
          </div>
        )}
        {entries.map(entry => (
          <CatalogCard key={entry.id} entry={entry} onSelect={() => setSelected(entry)} t={t} />
        ))}
      </div>
    </div>
  )
}

// ── Catalog card ──────────────────────────────────────────────────────────────

function TrustBadge({ level, t }: { level: string; t: ReturnType<typeof useT> }) {
  if (level === 'verified') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
      <ShieldCheck size={11} /> {t.trustVerified}
    </span>
  )
  if (level === 'community') return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400">
      <Shield size={11} /> {t.trustCommunity}
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-text-muted">
      <ShieldAlert size={11} /> {t.trustUnverified}
    </span>
  )
}

function CatalogCard({ entry, onSelect, t }: {
  entry: CatalogEntry
  onSelect: () => void
  t: ReturnType<typeof useT>
}) {
  const years = entry.year_from && entry.year_to
    ? `${entry.year_from}–${entry.year_to}`
    : entry.year_from ? `${entry.year_from}+` : null

  return (
    <button
      onClick={onSelect}
      className="panel px-4 py-3 text-left flex items-center gap-3 hover:border-accent/40 hover:bg-bg-elevated transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-text-primary text-sm font-semibold truncate">{entry.title}</p>
          <TrustBadge level={entry.trust_level} t={t} />
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs font-mono text-accent">{entry.ecu}</span>
          {entry.engine && <span className="text-xs text-text-muted">{entry.engine}</span>}
          {entry.power_hp && <span className="text-xs text-text-muted">{entry.power_hp} hp</span>}
          {years && <span className="text-xs text-text-muted">{years}</span>}
          {entry.car_models.length > 0 && (
            <span className="text-xs text-text-muted truncate max-w-[180px]">
              {entry.car_models.join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Users size={10} /> {t.usedBy(entry.use_count)}
          </span>
          {entry.bin_size && (
            <span className="text-[10px] text-text-muted font-mono">
              {(entry.bin_size / 1024).toFixed(0)} KB bin
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={14} className="text-text-muted/50 group-hover:text-accent flex-shrink-0 transition-colors" />
    </button>
  )
}

// ── XDF selected — drop bin ───────────────────────────────────────────────────

function XdfSelected({ entry, binFile, binDragging, onBack, onBinDrop, onBinChange,
  onBinDragEnter, onBinDragLeave, onProceed, t }: {
  entry: CatalogEntry
  binFile: File | null
  binDragging: boolean
  onBack: () => void
  onBinDrop: (e: React.DragEvent) => void
  onBinChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBinDragEnter: () => void
  onBinDragLeave: () => void
  onProceed: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Selected XDF info */}
      <div className="panel px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm font-semibold truncate">{entry.title}</p>
          <p className="text-accent text-xs font-mono mt-0.5">{entry.ecu} · {entry.firmware_version}</p>
        </div>
        <button onClick={onBack} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 mt-0.5">
          <X size={14} />
        </button>
      </div>

      {/* BIN drop zone */}
      <label
        className={`flex items-center gap-4 px-5 py-4 rounded-lg border-2 border-dashed cursor-pointer
          transition-all duration-150 group
          ${binDragging
            ? 'border-accent bg-accent-muted'
            : binFile
              ? 'border-accent/40 bg-accent-muted'
              : 'border-bg-border hover:border-accent/40 bg-bg-surface'}`}
        onDragOver={e => e.preventDefault()}
        onDragEnter={onBinDragEnter}
        onDragLeave={onBinDragLeave}
        onDrop={onBinDrop}
      >
        <input type="file" className="sr-only" accept=".bin,.ori,.mod,.hex" onChange={onBinChange} />
        <FileArchive size={24} className={`flex-shrink-0 transition-colors ${binFile ? 'text-accent' : 'text-text-muted'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm font-medium">
            {binFile ? binFile.name : t.binRequired}
          </p>
          {!binFile && <p className="text-text-muted text-xs">.bin · .ori · .mod · .hex</p>}
          {binFile && entry.bin_size && (
            <p className={`text-xs mt-0.5 ${
              Math.abs(binFile.size - entry.bin_size) < 512
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}>
              {binFile.size} B · expected {entry.bin_size} B
            </p>
          )}
        </div>
      </label>

      <button
        onClick={onProceed}
        disabled={!binFile}
        className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {t.openInEditor}
      </button>

      <button onClick={onBack} className="text-text-muted text-xs text-center hover:text-text-secondary transition-colors">
        {t.backToLibrary}
      </button>
    </div>
  )
}
