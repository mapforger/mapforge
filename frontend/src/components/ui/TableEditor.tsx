import { useReducer, useState, useCallback, useEffect, useRef } from 'react'
import { BarChart2, Box, Undo2, Redo2, Save } from 'lucide-react'
import { Surface3D } from './Surface3D'
import type { TableData } from '@/types'

// ── History reducer ──────────────────────────────────────────────────────────
type HS = { stack: number[][][]; idx: number; savedIdx: number }
type HA =
  | { type: 'push'; v: number[][] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; v: number[][] }
  | { type: 'mark_saved' }

function reduce(s: HS, a: HA): HS {
  switch (a.type) {
    case 'push': return { ...s, stack: [...s.stack.slice(0, s.idx + 1), a.v], idx: s.idx + 1 }
    case 'undo': return { ...s, idx: Math.max(0, s.idx - 1) }
    case 'redo': return { ...s, idx: Math.min(s.stack.length - 1, s.idx + 1) }
    case 'reset': return { stack: [a.v], idx: 0, savedIdx: 0 }
    case 'mark_saved': return { ...s, savedIdx: s.idx }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function heat(val: number, min: number, max: number) {
  if (max === min) return 'rgba(255,107,53,0.15)'
  const t = (val - min) / (max - min)
  const s: [number, number, number][] = [[30,64,175],[22,163,74],[217,119,6],[220,38,38]]
  const seg = Math.min(Math.floor(t * 3), 2)
  const l = t * 3 - seg
  return `rgba(${Math.round(s[seg][0]+(s[seg+1][0]-s[seg][0])*l)},${Math.round(s[seg][1]+(s[seg+1][1]-s[seg][1])*l)},${Math.round(s[seg][2]+(s[seg+1][2]-s[seg][2])*l)},0.25)`
}

/** Strips float noise: 28.799999997 → "28.8" */
const fmtEdit = (v: number) => String(parseFloat(v.toPrecision(8)))

// ── Component ─────────────────────────────────────────────────────────────────
export function TableEditor({ table, onSave, isSaving, highlightCell, modifiedCells }: {
  table: TableData
  onSave: (v: number[][]) => void
  isSaving: boolean
  highlightCell?: [number, number] | null
  modifiedCells?: Set<string>
}) {
  const rows = table.z_values.length
  const cols = table.z_values[0]?.length ?? 0

  const [hist, dispatch] = useReducer(reduce, null, () => ({
    stack: [table.z_values.map(r => [...r])],
    idx: 0,
    savedIdx: 0,
  }))
  const values = hist.stack[hist.idx]
  const isDirty = hist.idx !== hist.savedIdx

  // Edit state
  const [editPos, setEditPos] = useState<[number, number] | null>(null)
  const [editRaw, setEditRaw] = useState('')
  const [view, setView] = useState<'2d' | '3d'>('2d')

  // Scroll to highlighted cell when navigating from diff
  useEffect(() => {
    if (!highlightCell) return
    const [r, c] = highlightCell
    const cell = document.querySelector(`[data-cell="${r}-${c}"]`)
    cell?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }, [highlightCell])

  // Refs for use in callbacks without stale closures
  const valuesRef   = useRef(values);   valuesRef.current = values
  const editPosRef  = useRef(editPos);  editPosRef.current = editPos
  const editRawRef  = useRef(editRaw);  editRawRef.current = editRaw
  const dispatchRef = useRef(dispatch); dispatchRef.current = dispatch

  // Reset when table changes
  useEffect(() => {
    dispatch({ type: 'reset', v: table.z_values.map(r => [...r]) })
    setEditPos(null)
  }, [table.id])

  const startEdit = useCallback((r: number, c: number) => {
    const raw = fmtEdit(valuesRef.current[r][c])
    setEditPos([r, c])
    setEditRaw(raw)
    editPosRef.current = [r, c]
    editRawRef.current = raw
  }, [])

  /** Commit current cell, optionally move focus to nextCell */
  const commitAndMove = useCallback((next?: [number, number]) => {
    const pos = editPosRef.current
    if (pos) {
      const parsed = parseFloat(editRawRef.current)
      const [r, c] = pos
      const cur = valuesRef.current[r][c]
      if (!isNaN(parsed) && Math.abs(parsed - cur) > 1e-9) {
        const nv = valuesRef.current.map(row => [...row])
        nv[r][c] = parsed
        dispatchRef.current({ type: 'push', v: nv })
      }
    }
    if (next) {
      const raw = fmtEdit(valuesRef.current[next[0]][next[1]])
      editPosRef.current = next
      editRawRef.current = raw
      setEditPos(next)
      setEditRaw(raw)
    } else {
      editPosRef.current = null
      setEditPos(null)
    }
  }, [])

  const save = useCallback(() => {
    // Flush any pending edit, push to history if it changed a value, then mark saved
    const pos = editPosRef.current
    let final = valuesRef.current
    if (pos) {
      const parsed = parseFloat(editRawRef.current)
      if (!isNaN(parsed) && Math.abs(parsed - final[pos[0]][pos[1]]) > 1e-9) {
        final = final.map(row => [...row])
        final[pos[0]][pos[1]] = parsed
        dispatchRef.current({ type: 'push', v: final })
      }
      editPosRef.current = null
      setEditPos(null)
    }
    onSave(final)
    dispatchRef.current({ type: 'mark_saved' })
  }, [onSave])

  // Global shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const inInput = (e.target as HTMLElement).tagName === 'INPUT'

      if (ctrl) {
        if (key === 's') { e.preventDefault(); save() }
        else if (!e.shiftKey && key === 'z') { e.preventDefault(); editPosRef.current = null; setEditPos(null); dispatchRef.current({ type: 'undo' }) }
        else if ((e.shiftKey && key === 'z') || key === 'y') { e.preventDefault(); dispatchRef.current({ type: 'redo' }) }
      } else if (!inInput && key === 'v') {
        e.preventDefault()
        setView(v => v === '2d' ? '3d' : '2d')
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [save])

  const onCellKey = (e: React.KeyboardEvent, r: number, c: number) => {
    switch (e.key) {
      case 'Enter':     e.preventDefault(); commitAndMove(r + 1 < rows ? [r + 1, c] : undefined); break
      case 'Tab':       e.preventDefault(); commitAndMove(c + 1 < cols ? [r, c + 1] : r + 1 < rows ? [r + 1, 0] : undefined); break
      case 'Escape':    editPosRef.current = null; setEditPos(null); break
      case 'ArrowUp':   if (r > 0)        { e.preventDefault(); commitAndMove([r-1, c]) } break
      case 'ArrowDown': if (r < rows - 1) { e.preventDefault(); commitAndMove([r+1, c]) } break
      case 'ArrowLeft': if (c > 0)        { e.preventDefault(); commitAndMove([r, c-1]) } break
      case 'ArrowRight':if (c < cols - 1) { e.preventDefault(); commitAndMove([r, c+1]) } break
    }
  }

  const flat = values.flat()
  const min  = Math.min(...flat)
  const max  = Math.max(...flat)
  const xVals = table.x_axis.values
  const yVals = table.y_axis?.values ?? []

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-shrink-0">
        <div>
          <h2 className="text-text-primary font-semibold text-lg">{table.title}</h2>
          {table.description && <p className="text-text-muted text-sm mt-0.5">{table.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-bg-elevated rounded border border-bg-border p-0.5">
            {(['2d', '3d'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} title={v === '2d' ? 'Grid' : '3D surface'}
                className={`p-1.5 rounded transition-colors ${view === v ? 'bg-bg-surface text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
                {v === '2d' ? <BarChart2 size={14} /> : <Box size={14} />}
              </button>
            ))}
          </div>
          <button onClick={() => { editPosRef.current = null; setEditPos(null); dispatch({ type: 'undo' }) }}
            disabled={hist.idx === 0} title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Undo2 size={14} />
          </button>
          <button onClick={() => dispatch({ type: 'redo' })}
            disabled={hist.idx >= hist.stack.length - 1} title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <Redo2 size={14} />
          </button>
          {isDirty && <span className="text-warning text-sm font-mono">unsaved</span>}
          <button onClick={save} disabled={!isDirty || isSaving} title="Save (Ctrl+S)"
            className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={13} />
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── 3D ── */}
      {view === '3d' && (
        <div className="flex-1 min-h-0">
          <Surface3D table={{ ...table, z_values: values }} />
        </div>
      )}

      {/* ── 2D grid ── */}
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
                  <th key={ci} className="sticky top-0 z-10 bg-bg-base px-3 py-1.5 text-right text-text-muted font-normal whitespace-nowrap border-b border-bg-border min-w-[64px]">
                    {x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {values.map((row, ri) => (
                <tr key={ri}>
                  <td className="sticky left-0 z-10 bg-bg-base px-2 py-0 text-right text-text-muted border-r border-bg-border whitespace-nowrap">
                    {yVals[ri] !== undefined ? (yVals[ri] % 1 === 0 ? yVals[ri].toFixed(0) : yVals[ri].toFixed(1)) : ''}
                  </td>
                  {row.map((val, ci) => {
                    const isEditing   = editPos?.[0] === ri && editPos?.[1] === ci
                    const isHighlight = highlightCell?.[0] === ri && highlightCell?.[1] === ci
                    const isModified  = modifiedCells?.has(`${ri}-${ci}`)
                    return (
                      <td key={ci}
                        data-cell={`${ri}-${ci}`}
                        style={{ backgroundColor: heat(val, min, max) }}
                        className={`border p-0 text-right transition-all
                          ${isHighlight ? 'border-accent ring-1 ring-accent' : isModified ? 'border-warning/60' : 'border-bg-border/40'}`}
                        onClick={() => startEdit(ri, ci)}>
                        {isEditing ? (
                          <input autoFocus
                            className="w-16 bg-bg-elevated text-text-primary text-xs font-mono px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-accent"
                            value={editRaw}
                            onChange={e => { setEditRaw(e.target.value); editRawRef.current = e.target.value }}
                            onBlur={() => commitAndMove()}
                            onKeyDown={e => onCellKey(e, ri, ci)}
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

      {/* ── Footer ── */}
      <div className="flex items-center gap-4 text-xs font-mono text-text-muted border-t border-bg-border pt-2 flex-shrink-0">
        <span>Z: <span className="text-text-secondary">{table.z_units}</span></span>
        <span>min <span className="text-heat-cold">{min.toFixed(2)}</span></span>
        <span>max <span className="text-heat-hot">{max.toFixed(2)}</span></span>
        <span>{rows} × {cols}</span>
        <span className="ml-auto">Ctrl+S · Ctrl+Z · Ctrl+Shift+Z · Arrows</span>
      </div>
    </div>
  )
}
