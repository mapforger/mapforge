import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { TableEditor } from '@/components/ui/TableEditor'
import { listTables, getTable, writeTable, getDiff, listConstants, writeConstant, deleteSession, exportBin } from '@/lib/api'
import type { Session } from '@/types'
import { FileQuestion, SlidersHorizontal, GitCompare, Search, Check, X } from 'lucide-react'

interface EditorPageProps {
  session: Session
  onClose: () => void
}

export function EditorPage({ session, onClose }: EditorPageProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'tables' | 'constants' | 'diff'>('tables')
  const queryClient = useQueryClient()

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', session.file_id],
    queryFn: () => listTables(session.file_id),
  })

  const { data: tableData, isLoading: tableLoading } = useQuery({
    queryKey: ['table', session.file_id, selectedTableId],
    queryFn: () => getTable(session.file_id, selectedTableId!),
    enabled: !!selectedTableId && activeView === 'tables',
  })

  const { data: constants = [] } = useQuery({
    queryKey: ['constants', session.file_id],
    queryFn: () => listConstants(session.file_id),
    enabled: activeView === 'constants',
  })

  const { data: diff = [] } = useQuery({
    queryKey: ['diff', session.file_id],
    queryFn: () => getDiff(session.file_id),
    enabled: activeView === 'diff',
  })

  const saveMutation = useMutation({
    mutationFn: (values: number[][]) =>
      writeTable(session.file_id, selectedTableId!, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['table', session.file_id, selectedTableId] })
      queryClient.invalidateQueries({ queryKey: ['diff', session.file_id] })
    },
  })

  const handleClose = async () => {
    await deleteSession(session.file_id)
    onClose()
  }

  return (
    <div className="h-full flex flex-col">
      <Topbar session={session} onClose={handleClose} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          tables={tables}
          selectedId={selectedTableId}
          onSelect={id => { setSelectedTableId(id); setActiveView('tables') }}
          activeView={activeView}
          onViewChange={setActiveView}
          modifiedCount={diff.length}
        />

        {/* Main content */}
        <main className="flex-1 overflow-hidden p-6">
          {activeView === 'tables' && (
            <>
              {!selectedTableId && (
                <EmptyState
                  icon={FileQuestion}
                  title="Select a table"
                  description="Choose a table from the sidebar to start editing"
                />
              )}
              {selectedTableId && tableLoading && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-text-muted text-sm animate-pulse">Loading table…</span>
                </div>
              )}
              {selectedTableId && tableData && !tableLoading && (
                <TableEditor
                  table={tableData}
                  onSave={values => saveMutation.mutate(values)}
                  isSaving={saveMutation.isPending}
                />
              )}
            </>
          )}

          {activeView === 'constants' && (
            <ConstantsView
              constants={constants}
              fileId={session.file_id}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['constants', session.file_id] })}
            />
          )}

          {activeView === 'diff' && (
            <DiffView diff={diff} />
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: {
  icon: React.FC<{ size?: number; className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Icon size={40} className="text-text-muted opacity-40" />
      <p className="text-text-secondary font-medium">{title}</p>
      <p className="text-text-muted text-sm">{description}</p>
    </div>
  )
}

function ConstantsView({ constants, fileId, onChanged }: { constants: any[]; fileId: string; onChanged: () => void }) {
  if (!constants.length) return (
    <EmptyState icon={SlidersHorizontal} title="No constants" description="This XDF has no constants defined" />
  )
  return (
    <div className="space-y-2 max-w-2xl overflow-y-auto h-full pr-1">
      <h2 className="text-text-primary font-semibold mb-4">Constants</h2>
      {constants.map(c => (
        <ConstantRow key={c.id} constant={c} fileId={fileId} onChanged={onChanged} />
      ))}
    </div>
  )
}

function ConstantRow({ constant: c, fileId, onChanged }: { constant: any; fileId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setRaw(String(parseFloat(c.value.toPrecision(8))))
    setEditing(true)
  }

  const cancel = () => setEditing(false)

  const commit = async () => {
    const val = parseFloat(raw)
    if (isNaN(val)) { cancel(); return }
    setSaving(true)
    try {
      await writeConstant(fileId, c.id, val)
      onChanged()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') cancel()
  }

  return (
    <div className="panel px-4 py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-text-primary text-sm font-medium">{c.title}</p>
        {c.description && <p className="text-text-muted text-xs mt-0.5">{c.description}</p>}
      </div>
      {c.error ? (
        <span className="text-error text-xs font-mono">{c.error}</span>
      ) : editing ? (
        <div className="flex items-center gap-1.5">
          <input autoFocus
            className="input w-28 py-1 text-sm text-right"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={onKey}
          />
          <span className="text-text-muted text-xs font-mono">{c.units}</span>
          <button onClick={commit} disabled={saving}
            className="p-1 rounded text-success hover:bg-success/10 transition-colors">
            <Check size={14} />
          </button>
          <button onClick={cancel}
            className="p-1 rounded text-text-muted hover:bg-bg-elevated transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button onClick={startEdit}
          className="text-accent font-mono text-sm hover:text-accent-hover transition-colors cursor-pointer">
          {parseFloat(c.value.toPrecision(8))} <span className="text-text-muted">{c.units}</span>
        </button>
      )}
    </div>
  )
}

function DiffView({ diff }: { diff: any[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() =>
    diff.filter(d => d.description.toLowerCase().includes(search.toLowerCase())),
    [diff, search]
  )

  if (!diff.length) return (
    <EmptyState icon={GitCompare} title="No changes" description="Modify table values to see the diff here" />
  )
  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header + search */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <h2 className="text-text-primary font-semibold">
          {diff.length} modification{diff.length !== 1 ? 's' : ''}
        </h2>
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="input pl-8 py-1 text-xs w-48"
            placeholder="Filter…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
      {filtered.map((d, i) => (
        <div key={i} className="panel px-4 py-3">
          <p className="text-text-secondary text-xs mb-2">{d.description}</p>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-text-muted">{d.address}</span>
            <span className="text-error bg-error/10 px-2 py-0.5 rounded">{d.original}</span>
            <span className="text-text-muted">→</span>
            <span className="text-success bg-success/10 px-2 py-0.5 rounded">{d.modified}</span>
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}
