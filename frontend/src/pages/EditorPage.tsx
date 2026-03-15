import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TableEditor } from '@/components/ui/TableEditor'
import { listTables, getTable, writeTable, getDiff, listConstants, writeConstant, deleteSession, getChecksumStatus, fixChecksums } from '@/lib/api'
import { useToast, apiError } from '@/components/ui/Toast'
import type { Session, DiffEntry } from '@/types'
import { FileQuestion, SlidersHorizontal, GitCompare, Search, ArrowUpDown, Check, X } from 'lucide-react'

interface EditorPageProps {
  session: Session
  onClose: () => void
}

export function EditorPage({ session, onClose }: EditorPageProps) {
  const [selectedTableId, setSelectedTableId]   = useState<string | null>(null)
  const [activeView, setActiveView]             = useState<'tables' | 'constants' | 'diff'>('tables')
  const [highlightCell, setHighlightCell]       = useState<[number, number] | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', session.file_id],
    queryFn:  () => listTables(session.file_id),
  })

  const { data: tableData, isLoading: tableLoading } = useQuery({
    queryKey: ['table', session.file_id, selectedTableId],
    queryFn:  () => getTable(session.file_id, selectedTableId!),
    enabled:  !!selectedTableId && activeView === 'tables',
  })

  const { data: constants = [] } = useQuery({
    queryKey: ['constants', session.file_id],
    queryFn:  () => listConstants(session.file_id),
    enabled:  activeView === 'constants',
  })

  const { data: diff = [] } = useQuery({
    queryKey: ['diff', session.file_id],
    queryFn:  () => getDiff(session.file_id),
  })

  const { data: checksumStatus } = useQuery({
    queryKey: ['checksum', session.file_id],
    queryFn:  () => getChecksumStatus(session.file_id),
  })

  const saveMutation = useMutation({
    mutationFn: (values: number[][]) => writeTable(session.file_id, selectedTableId!, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table', session.file_id, selectedTableId] })
      queryClient.invalidateQueries({ queryKey: ['diff', session.file_id] })
      queryClient.invalidateQueries({ queryKey: ['checksum', session.file_id] })
    },
    onError: (err) => toast({ message: `Erreur sauvegarde : ${apiError(err)}`, variant: 'error' }),
  })

  const fixMutation = useMutation({
    mutationFn: () => fixChecksums(session.file_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checksum', session.file_id] })
      toast({ message: 'Checksums corrigés', variant: 'success' })
    },
    onError: (err) => toast({ message: `Erreur checksums : ${apiError(err)}`, variant: 'error' }),
  })

  const handleClose = async () => {
    await deleteSession(session.file_id)
    onClose()
  }

  const handleDiffNavigate = (entry: DiffEntry) => {
    if (!entry.table_id) return
    setSelectedTableId(entry.table_id)
    setActiveView('tables')
    if (entry.row >= 0 && entry.col >= 0) {
      setHighlightCell([entry.row, entry.col])
    }
  }

  // Set of modified cell keys for current table
  const modifiedCells = useMemo(() => {
    if (!selectedTableId) return new Set<string>()
    return new Set(
      diff
        .filter((d: DiffEntry) => d.table_id === selectedTableId && d.row >= 0)
        .map((d: DiffEntry) => `${d.row}-${d.col}`)
    )
  }, [diff, selectedTableId])

  return (
    <div className="h-full flex flex-col">
      <Topbar
        session={session}
        onClose={handleClose}
        checksumStatus={checksumStatus}
        onFixChecksums={async () => {
          await fixChecksums(session.file_id)
          queryClient.invalidateQueries({ queryKey: ['checksum', session.file_id] })
        }}
        isFixing={fixMutation.isPending}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          tables={tables}
          selectedId={selectedTableId}
          onSelect={id => { setSelectedTableId(id); setActiveView('tables'); setHighlightCell(null) }}
          activeView={activeView}
          onViewChange={setActiveView}
          modifiedCount={diff.length}
        />
        <main className="flex-1 overflow-hidden p-6">
          {activeView === 'tables' && (
            <>
              {!selectedTableId && (
                <EmptyState icon={FileQuestion} title="Select a table" description="Choose a table from the sidebar to start editing" />
              )}
              {selectedTableId && tableLoading && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-text-muted text-sm animate-pulse">Loading…</span>
                </div>
              )}
              {selectedTableId && tableData && !tableLoading && (
                <TableEditor
                  table={tableData}
                  onSave={values => saveMutation.mutate(values)}
                  isSaving={saveMutation.isPending}
                  highlightCell={highlightCell}
                  modifiedCells={modifiedCells}
                />
              )}
            </>
          )}
          {activeView === 'constants' && (
            <ConstantsView
              constants={constants}
              fileId={session.file_id}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: ['constants', session.file_id] })
                queryClient.invalidateQueries({ queryKey: ['diff', session.file_id] })
              }}
            />
          )}
          {activeView === 'diff' && (
            <DiffView diff={diff} onNavigate={handleDiffNavigate} />
          )}
        </main>
      </div>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, description }: {
  icon: React.FC<{ size?: number; className?: string }>
  title: string; description: string
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Icon size={40} className="text-text-muted opacity-40" />
      <p className="text-text-secondary font-medium">{title}</p>
      <p className="text-text-muted text-sm">{description}</p>
    </div>
  )
}

// ── ConstantsView ─────────────────────────────────────────────────────────────
function ConstantsView({ constants, fileId, onChanged }: {
  constants: any[]; fileId: string; onChanged: () => void
}) {
  if (!constants.length) return (
    <EmptyState icon={SlidersHorizontal} title="No constants" description="This XDF has no constants defined" />
  )
  return (
    <div className="flex flex-col h-full gap-3">
      <h2 className="text-text-primary font-semibold flex-shrink-0">Constants</h2>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {constants.map(c => (
          <ConstantRow key={c.id} constant={c} fileId={fileId} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

function ConstantRow({ constant: c, fileId, onChanged }: { constant: any; fileId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw]         = useState('')
  const [saving, setSaving]   = useState(false)
  const { toast } = useToast()

  const startEdit = () => { setRaw(String(parseFloat(c.value.toPrecision(8)))); setEditing(true) }
  const cancel    = () => setEditing(false)
  const commit    = async () => {
    const val = parseFloat(raw)
    if (isNaN(val)) { cancel(); return }
    setSaving(true)
    try {
      await writeConstant(fileId, c.id, val)
      onChanged()
      setEditing(false)
      toast({ message: `${c.title} mis à jour`, variant: 'success' })
    } catch (err) {
      toast({ message: `Erreur : ${apiError(err)}`, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-text-primary text-base font-semibold truncate">{c.title}</p>
        {c.description && <p className="text-text-muted text-xs mt-0.5 truncate">{c.description}</p>}
      </div>
      {c.error ? (
        <span className="text-error text-sm font-mono flex-shrink-0">{c.error}</span>
      ) : editing ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <input autoFocus className="input w-28 py-1.5 text-sm text-right font-mono" value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }} />
          <span className="text-text-muted text-sm font-mono">{c.units}</span>
          <button onClick={commit} disabled={saving}
            className="p-1.5 rounded text-success hover:bg-success/10 transition-colors"><Check size={15} /></button>
          <button onClick={cancel}
            className="p-1.5 rounded text-text-muted hover:bg-bg-elevated transition-colors"><X size={15} /></button>
        </div>
      ) : (
        <button onClick={startEdit}
          className="flex items-baseline gap-2 flex-shrink-0 group transition-colors">
          <span className="font-mono font-bold text-lg text-accent group-hover:text-accent-hover">
            {parseFloat(c.value.toPrecision(8))}
          </span>
          <span className="text-text-muted text-sm font-mono group-hover:text-text-secondary">{c.units}</span>
        </button>
      )}
    </div>
  )
}

// ── DiffView ──────────────────────────────────────────────────────────────────
type SortKey = 'order' | 'table' | 'delta'

function DiffView({ diff, onNavigate }: { diff: DiffEntry[]; onNavigate: (d: DiffEntry) => void }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('order')

  const processed = useMemo(() => {
    let items = diff.filter((d: DiffEntry) =>
      d.description.toLowerCase().includes(search.toLowerCase()) ||
      d.table_title?.toLowerCase().includes(search.toLowerCase())
    )
    if (sortKey === 'table') items = [...items].sort((a, b) => (a.table_title ?? '').localeCompare(b.table_title ?? ''))
    if (sortKey === 'delta') items = [...items].sort((a, b) => {
      const da = Math.abs((b.new_phys ?? 0) - (b.original_phys ?? 0))
      const db = Math.abs((a.new_phys ?? 0) - (a.original_phys ?? 0))
      return da - db
    })
    return items
  }, [diff, search, sortKey])

  if (!diff.length) return (
    <EmptyState icon={GitCompare} title="No changes" description="Modify table values to see the diff here" />
  )

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-text-primary font-semibold text-sm">
          {diff.length} modification{diff.length !== 1 ? 's' : ''}
        </span>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="input pl-8 py-1 text-sm w-48" placeholder="Filtrer…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {/* Sort */}
        <div className="flex items-center gap-1 bg-bg-elevated rounded border border-bg-border p-0.5">
          {([['order', 'Time'], ['table', 'Table'], ['delta', 'Δ']] as [SortKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSortKey(k)}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${sortKey === k ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {processed.map((d: DiffEntry) => {
          const delta = d.new_phys !== null && d.original_phys !== null
            ? d.new_phys - d.original_phys : null
          const isUp = delta !== null && delta > 0
          const canNav = !!d.table_id

          return (
            <div key={d.address}
              onClick={() => canNav && onNavigate(d)}
              className={`panel px-3 py-2.5 flex items-center gap-3 transition-colors
                ${canNav ? 'cursor-pointer hover:border-accent/40 hover:bg-bg-elevated' : ''}`}>

              {/* Left: table name + cell position */}
              <div className="flex-1 min-w-0">
                <p className="text-text-primary text-sm font-semibold truncate leading-snug">
                  {d.table_title || d.description}
                </p>
                {d.row >= 0 && (
                  <p className="text-xs font-mono text-text-muted mt-0.5">
                    ligne&nbsp;<span className="text-text-secondary">{d.row}</span>
                    &nbsp;·&nbsp;col&nbsp;<span className="text-text-secondary">{d.col}</span>
                  </p>
                )}
              </div>

              {/* Right: value change */}
              {d.original_phys !== null && d.new_phys !== null ? (
                <div className="flex items-center gap-2 font-mono flex-shrink-0">
                  <span className="text-text-secondary text-sm bg-bg-elevated px-1.5 py-0.5 rounded">
                    {parseFloat(d.original_phys.toPrecision(5))}
                  </span>
                  <span className="text-text-muted text-xs">→</span>
                  <span className={`font-bold text-sm ${isUp ? 'text-red-400' : 'text-blue-400'}`}>
                    {parseFloat(d.new_phys.toPrecision(5))}
                  </span>
                  <span className="text-text-muted text-xs">{d.units}</span>
                  {delta !== null && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded
                      ${isUp ? 'bg-red-400/10 text-red-400' : 'bg-blue-400/10 text-blue-400'}`}>
                      {isUp ? '+' : ''}{parseFloat(delta.toPrecision(3))}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-mono text-xs flex-shrink-0">
                  <span className="text-error bg-error/10 px-1.5 py-0.5 rounded">{d.original_hex}</span>
                  <span className="text-text-muted">→</span>
                  <span className="text-success bg-success/10 px-1.5 py-0.5 rounded">{d.modified_hex}</span>
                </div>
              )}
              {canNav && <span className="text-accent/50 text-xs">↗</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
