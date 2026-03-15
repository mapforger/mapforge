import { useState, useCallback } from 'react'
import type { TableData } from '@/types'

interface TableEditorProps {
  table: TableData
  onSave: (values: number[][]) => void
  isSaving: boolean
}

// Map a value to a heatmap CSS color (blue → green → orange → red)
function heatColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgba(255,107,53,0.15)'
  const t = (value - min) / (max - min) // 0..1

  // 4-stop gradient: cold(0) → mid(0.33) → warm(0.66) → hot(1)
  const stops = [
    [30, 64, 175],    // blue
    [22, 163, 74],    // green
    [217, 119, 6],    // amber
    [220, 38, 38],    // red
  ]

  const seg = Math.min(Math.floor(t * 3), 2)
  const local = (t * 3) - seg
  const [r1, g1, b1] = stops[seg]
  const [r2, g2, b2] = stops[seg + 1]
  const r = Math.round(r1 + (r2 - r1) * local)
  const g = Math.round(g1 + (g2 - g1) * local)
  const b = Math.round(b1 + (b2 - b1) * local)

  return `rgba(${r},${g},${b},0.25)`
}

export function TableEditor({ table, onSave, isSaving }: TableEditorProps) {
  const [values, setValues] = useState<number[][]>(
    table.z_values.map(row => [...row])
  )
  const [editing, setEditing] = useState<[number, number] | null>(null)
  const [editRaw, setEditRaw] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const flat = values.flat()
  const min = Math.min(...flat)
  const max = Math.max(...flat)

  const startEdit = (row: number, col: number) => {
    setEditing([row, col])
    setEditRaw(String(values[row][col]))
  }

  const commitEdit = useCallback((row: number, col: number) => {
    const parsed = parseFloat(editRaw)
    if (!isNaN(parsed)) {
      setValues(prev => {
        const next = prev.map(r => [...r])
        next[row][col] = parsed
        return next
      })
      setIsDirty(true)
    }
    setEditing(null)
  }, [editRaw])

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEdit(row, col)
      // Move to next cell
      const nextCol = col + 1 < table.cols ? col + 1 : 0
      const nextRow = col + 1 < table.cols ? row : row + 1 < table.rows ? row + 1 : 0
      startEdit(nextRow, nextCol)
    }
    if (e.key === 'Escape') {
      setEditing(null)
    }
  }

  const xVals = table.x_axis.values
  const yVals = table.y_axis?.values ?? []

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-text-primary font-semibold text-base">{table.title}</h2>
          {table.description && (
            <p className="text-text-muted text-xs mt-0.5">{table.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-warning text-xs font-mono">unsaved changes</span>
          )}
          <button
            className="btn-primary text-sm py-1.5 px-3 disabled:opacity-40"
            onClick={() => { onSave(values); setIsDirty(false) }}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs font-mono select-none">
          <thead>
            <tr>
              {/* Corner cell */}
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
              <tr key={ri} className="group">
                {/* Y axis label */}
                <td className="sticky left-0 z-10 bg-bg-base px-2 py-0 text-right text-text-muted
                               border-r border-bg-border whitespace-nowrap">
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
                      className="border border-bg-border/50 p-0 text-right"
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
                        <span className="block px-3 py-1 text-text-primary cursor-pointer
                                         hover:text-white transition-colors">
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

      {/* Footer: units + range */}
      <div className="flex items-center gap-4 text-[11px] font-mono text-text-muted border-t border-bg-border pt-2">
        <span>Z: <span className="text-text-secondary">{table.z_units}</span></span>
        <span>min <span className="text-heat-cold">{min.toFixed(2)}</span></span>
        <span>max <span className="text-heat-hot">{max.toFixed(2)}</span></span>
        <span>{table.rows} × {table.cols}</span>
      </div>
    </div>
  )
}
