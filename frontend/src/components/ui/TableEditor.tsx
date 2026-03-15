import { useState, useCallback, useEffect, useRef } from 'react'
import { BarChart2, Box, Undo2, Save } from 'lucide-react'
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
  const r = Math.round(r1 + (r2 - r1) * local)
  const g = Math.round(g1 + (g2 - g1) * local)
  const b = Math.round(b1 + (b2 - b1) * local)
  return `rgba(${r},${g},${b},0.25)`
}

type View = '2d' | '3d'

export function TableEditor({ table, onSave, isSaving }: TableEditorProps) {
  const [history, setHistory] = useState<number[][][]>([
    table.z_values.map(row => [...row])
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const values = history[historyIndex]

  const [editing, setEditing] = useState<[number, number] | null>(null)
  const [editRaw, setEditRaw] = useState('')
  const [view, setView] = useState<View>('2d')
  const isDirty = historyIndex > 0

  const flat = values.flat()
  const min = Math.min(...flat)
  const max = Math.max(...flat)

  // Reset when table changes
  useEffect(() => {
    setHistory([table.z_values.map(row => [...row])])
    setHistoryIndex(0)
    setEditing(null)
  }, [table.id])

  const pushHistory = useCallback((newValues: number[][]) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1)
      return [...trimmed, newValues]
    })
    setHistoryIndex(i => i + 1)
  }, [historyIndex])

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setEditing(null)
      setHistoryIndex(i => i - 1)
    }
  }, [historyIndex])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(i => i + 1)
    }
  }, [historyIndex, history.length])

  const save = useCallback(() => {
    if (isDirty && !isSaving) {
      onSave(values)
      setHistory([values])
      setHistoryIndex(0)
    }
  }, [isDirty, isSaving, values, onSave])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in a cell input
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, undo, redo])

  const startEdit = (row: number, col: number) => {
    setEditing([row, col])
    setEditRaw(String(values[row][col]))
  }

  const commitEdit = useCallback((row: number, col: number) => {
    const parsed = parseFloat(editRaw)
    if (!isNaN(parsed) && parsed !== values[row][col]) {
      const next = values.map(r => [...r])
      next[row][col] = parsed
      pushHistory(next)
    }
    setEditing(null)
  }, [editRaw, values, pushHistory])

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEdit(row, col)
      const nextCol = col + 1 < table.cols ? col + 1 : 0
      const nextRow = col + 1 < table.cols ? row : Math.min(row + 1, table.rows - 1)
      setTimeout(() => startEdit(nextRow, nextCol), 0)
    }
    if (e.key === 'Escape') setEditing(null)
    if (e.key === 'ArrowUp' && row > 0) { e.preventDefault(); commitEdit(row, col); setTimeout(() => startEdit(row - 1, col), 0) }
    if (e.key === 'ArrowDown' && row < table.rows - 1) { e.preventDefault(); commitEdit(row, col); setTimeout(() => startEdit(row + 1, col), 0) }
    if (e.key === 'ArrowLeft' && col > 0) { e.preventDefault(); commitEdit(row, col); setTimeout(() => startEdit(row, col - 1), 0) }
    if (e.key === 'ArrowRight' && col < table.cols - 1) { e.preventDefault(); commitEdit(row, col); setTimeout(() => startEdit(row, col + 1), 0) }
  }

  // Merge current values into table for 3D view
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
          {/* View toggle */}
          <div className="flex items-center bg-bg-elevated rounded border border-bg-border p-0.5">
            <button
              onClick={() => setView('2d')}
              title="Grid view"
              className={`p-1.5 rounded transition-colors ${view === '2d' ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
            >
              <BarChart2 size={14} />
            </button>
            <button
              onClick={() => setView('3d')}
              title="3D surface view"
              className={`p-1.5 rounded transition-colors ${view === '3d' ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
            >
              <Box size={14} />
            </button>
          </div>

          {/* Undo */}
          <button
            onClick={undo}
            disabled={historyIndex === 0}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={14} />
          </button>

          {isDirty && (
            <span className="text-warning text-xs font-mono">unsaved</span>
          )}

          <button
            className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3
                       disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={save}
            disabled={!isDirty || isSaving}
            title="Save (Ctrl+S)"
          >
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
                    const isEditing = editing?.[0] === ri && editing?.[1] === ci
                    return (
                      <td
                        key={ci}
                        style={{ backgroundColor: heatColor(val, min, max) }}
                        className="border border-bg-border/40 p-0 text-right"
                        onClick={() => startEdit(ri, ci)}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            className="w-16 bg-bg-elevated text-text-primary text-xs font-mono
                                       px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-accent"
                            value={editRaw}
                            onChange={e => setEditRaw(e.target.value)}
                            onBlur={() => commitEdit(ri, ci)}
                            onKeyDown={e => handleKeyDown(e, ri, ci)}
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
        <span>{table.rows} × {table.cols}</span>
        <span className="ml-auto text-text-muted">
          Ctrl+S save · Ctrl+Z undo · Arrows navigate
        </span>
      </div>
    </div>
  )
}
