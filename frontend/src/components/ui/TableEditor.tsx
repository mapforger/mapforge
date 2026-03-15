import { useState, useCallback, useEffect, useRef } from 'react'
import { BarChart2, Box, Undo2, Redo2, Save } from 'lucide-react'
import { Surface3D } from './Surface3D'
import type { TableData } from '@/types'

interface TableEditorProps {
  table: TableData
  onSave: (values: number[][]) => void
  isSaving: boolean
}

function heatColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgba(255,107,53,0.15)'
  const t = (value - min) / (max - min)
  const stops: [number, number, number][] = [
    [30, 64, 175], [22, 163, 74], [217, 119, 6], [220, 38, 38],
  ]
  const seg = Math.min(Math.floor(t * 3), 2)
  const local = t * 3 - seg
  const [r1, g1, b1] = stops[seg]
  const [r2, g2, b2] = stops[seg + 1]
  return `rgba(${Math.round(r1+(r2-r1)*local)},${Math.round(g1+(g2-g1)*local)},${Math.round(b1+(b2-b1)*local)},0.25)`
}

type View = '2d' | '3d'

export function TableEditor({ table, onSave, isSaving }: TableEditorProps) {
  // Derive dimensions from data — never from table.rows/cols (those are in TableMeta, not TableData)
  const rows = table.z_values.length
  const cols = table.z_values[0]?.length ?? 0

  const [history, setHistory] = useState<number[][][]>(() => [
    table.z_values.map(row => [...row])
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const values = history[historyIndex]

  // Use refs so keyboard handlers always read current values without stale closures
  const editingRef = useRef<[number, number] | null>(null)
  const editRawRef = useRef('')
  const valuesRef = useRef(values)
  valuesRef.current = values

  const [editingState, setEditingState] = useState<[number, number] | null>(null)
  const [editRaw, setEditRaw] = useState('')
  const [view, setView] = useState<View>('2d')
  const isDirty = historyIndex > 0

  const flat = values.flat()
  const min = Math.min(...flat)
  const max = Math.max(...flat)

  // Reset when table changes
  useEffect(() => {
    const initial = table.z_values.map(row => [...row])
    setHistory([initial])
    setHistoryIndex(0)
    setEditingState(null)
    editingRef.current = null
  }, [table.id])

  const pushHistory = useCallback((newValues: number[][], currentIndex: number) => {
    setHistory(prev => [...prev.slice(0, currentIndex + 1), newValues])
    setHistoryIndex(currentIndex + 1)
  }, [])

  const undo = useCallback(() => {
    setHistoryIndex(i => {
      if (i > 0) { setEditingState(null); return i - 1 }
      return i
    })
  }, [])

  const redo = useCallback(() => {
    setHistory(h => {
      setHistoryIndex(i => (i < h.length - 1 ? i + 1 : i))
      return h
    })
  }, [])

  // Commit current edit, optionally move to another cell
  const commitAndMove = useCallback((nextCell?: [number, number]) => {
    const pos = editingRef.current
    if (pos) {
      const parsed = parseFloat(editRawRef.current)
      const [r, c] = pos
      const current = valuesRef.current[r][c]
      if (!isNaN(parsed) && Math.abs(parsed - current) > 1e-10) {
        const next = valuesRef.current.map(row => [...row])
        next[r][c] = parsed
        // Read historyIndex from ref to avoid stale closure
        setHistoryIndex(idx => {
          setHistory(prev => [...prev.slice(0, idx + 1), next])
          return idx + 1
        })
      }
    }
    if (nextCell) {
      editingRef.current = nextCell
      setEditingState(nextCell)
      setEditRaw(String(valuesRef.current[nextCell[0]][nextCell[1]]))
      editRawRef.current = String(valuesRef.current[nextCell[0]][nextCell[1]])
    } else {
      editingRef.current = null
      setEditingState(null)
    }
  }, [])

  const startEdit = useCallback((r: number, c: number) => {
    const raw = String(valuesRef.current[r][c])
    editingRef.current = [r, c]
    editRawRef.current = raw
    setEditingState([r, c])
    setEditRaw(raw)
  }, [])

  const save = useCallback(() => {
    commitAndMove()
    setHistory(h => {
      const current = h[historyIndex] ?? h[h.length - 1]
      onSave(current)
      setHistory([current])
      setHistoryIndex(0)
      return [current]
    })
  }, [commitAndMove, historyIndex, onSave])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA'
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
        return
      }
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (ctrl && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        redo()
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, undo, redo])

  const handleCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    switch (e.key) {
      case 'Enter':
      case 'Tab': {
        e.preventDefault()
        const nextR = e.key === 'Enter' || c + 1 >= cols ? Math.min(r + 1, rows - 1) : r
        const nextC = e.key === 'Enter' ? c : (c + 1 < cols ? c + 1 : 0)
        commitAndMove([nextR, nextC])
        break
      }
      case 'Escape':
        editingRef.current = null
        setEditingState(null)
        break
      case 'ArrowUp':
        if (r > 0) { e.preventDefault(); commitAndMove([r - 1, c]) }
        break
      case 'ArrowDown':
        if (r < rows - 1) { e.preventDefault(); commitAndMove([r + 1, c]) }
        break
      case 'ArrowLeft':
        if (c > 0) { e.preventDefault(); commitAndMove([r, c - 1]) }
        break
      case 'ArrowRight':
        if (c < cols - 1) { e.preventDefault(); commitAndMove([r, c + 1]) }
        break
    }
  }

  const tableWith3D = { ...table, z_values: values }
  const xVals = table.x_axis.values
  const yVals = table.y_axis?.values ?? []

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-start justify-between flex-shrink-0">
        <div>
          <h2 className="text-text-primary font-semibold text-base">{table.title}</h2>
          {table.description && (
            <p className="text-text-muted text-xs mt-0.5">{table.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 2D / 3D toggle */}
          <div className="flex items-center bg-bg-elevated rounded border border-bg-border p-0.5">
            <button onClick={() => setView('2d')} title="Grid view"
              className={`p-1.5 rounded transition-colors ${view === '2d' ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              <BarChart2 size={14} />
            </button>
            <button onClick={() => setView('3d')} title="3D surface"
              className={`p-1.5 rounded transition-colors ${view === '3d' ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
              <Box size={14} />
            </button>
          </div>

          {/* Undo / Redo */}
          <button onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={14} />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={14} />
          </button>

          {isDirty && <span className="text-warning text-xs font-mono">unsaved</span>}

          <button onClick={save} disabled={!isDirty || isSaving} title="Save (Ctrl+S)"
            className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={13} />
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* 3D view */}
      {view === '3d' && (
        <div className="flex-1 min-h-0">
          <Surface3D table={tableWith3D} />
        </div>
      )}

      {/* 2D grid */}
      {view === '2d' && (
        <div className="flex-1 overflow-auto min-h-0">
          <table className="border-collapse text-xs font-mono select-none">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-bg-base px-2 py-1.5 text-right min-w-[72px]">
                  <span className="text-text-muted text-[10px]">
                    {table.y_axis?.units ?? ''} ↓ / {table.x_axis.units} →
                  </span>
                </th>
                {xVals.map((x, ci) => (
                  <th key={ci}
                    className="sticky top-0 z-10 bg-bg-base px-3 py-1.5 text-right text-text-muted
                               font-normal whitespace-nowrap border-b border-bg-border min-w-[64px]">
                    {x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {values.map((row, ri) => (
                <tr key={ri}>
                  <td className="sticky left-0 z-10 bg-bg-base px-2 py-0 text-right
                                 text-text-muted border-r border-bg-border whitespace-nowrap">
                    {yVals[ri] !== undefined
                      ? (yVals[ri] % 1 === 0 ? yVals[ri].toFixed(0) : yVals[ri].toFixed(1))
                      : ''}
                  </td>
                  {row.map((val, ci) => {
                    const isEditing = editingState?.[0] === ri && editingState?.[1] === ci
                    return (
                      <td key={ci}
                        style={{ backgroundColor: heatColor(val, min, max) }}
                        className="border border-bg-border/40 p-0 text-right"
                        onClick={() => startEdit(ri, ci)}>
                        {isEditing ? (
                          <input
                            autoFocus
                            className="w-16 bg-bg-elevated text-text-primary text-xs font-mono
                                       px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-accent"
                            value={editRaw}
                            onChange={e => {
                              setEditRaw(e.target.value)
                              editRawRef.current = e.target.value
                            }}
                            onBlur={() => commitAndMove()}
                            onKeyDown={e => handleCellKeyDown(e, ri, ci)}
                          />
                        ) : (
                          <span className="block px-3 py-1 text-text-primary cursor-pointer hover:text-white transition-colors">
                            {val % 1 === 0 ? val.toFixed(0) : val.toFixed(2)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 text-[11px] font-mono text-text-muted border-t border-bg-border pt-2 flex-shrink-0">
        <span>Z: <span className="text-text-secondary">{table.z_units}</span></span>
        <span>min <span className="text-heat-cold">{min.toFixed(2)}</span></span>
        <span>max <span className="text-heat-hot">{max.toFixed(2)}</span></span>
        <span>{rows} × {cols}</span>
        <span className="ml-auto">Ctrl+S · Ctrl+Z/Y · Arrows</span>
      </div>
    </div>
  )
}
