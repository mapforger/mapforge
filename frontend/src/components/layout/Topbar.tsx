import { Download, Trash2, Zap } from 'lucide-react'
import type { Session } from '@/types'
import { exportBin } from '@/lib/api'
import { useState } from 'react'

interface TopbarProps {
  session: Session
  onClose: () => void
}

export function Topbar({ session, onClose }: TopbarProps) {
  const [exporting, setExporting] = useState(false)
  const sizeKB = (session.bin_size / 1024).toFixed(1)
  const stem = session.bin_name.replace(/\.[^.]+$/, '')
  const suggestedName = `${stem}_modified.bin`

  const handleExport = async () => {
    setExporting(true)
    try {
      const url = exportBin(session.file_id)

      // Use File System Access API if available (Chrome/Edge) — lets user choose destination
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
          return
        } catch (e: any) {
          // User cancelled the picker — don't fallback
          if (e?.name === 'AbortError') return
          // API not supported or other error — fall through to classic download
        }
      }

      // Classic download fallback (Firefox, Safari)
      const response = await fetch(url)
      const blob = await response.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = suggestedName
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(false)
    }
  }

  return (
    <header className="h-12 bg-bg-surface border-b border-bg-border flex items-center px-4 gap-4 flex-shrink-0">
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
        <button onClick={handleExport} disabled={exporting}
          className="btn-primary flex items-center gap-2 text-sm py-1.5 disabled:opacity-60">
          {exporting
            ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
            : <Download size={14} />}
          Export .bin
        </button>
        <button onClick={onClose} className="btn-ghost flex items-center gap-1.5 text-sm py-1.5">
          <Trash2 size={14} />
          Close
        </button>
      </div>
    </header>
  )
}
