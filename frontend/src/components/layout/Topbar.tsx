import { Download, Trash2, Zap } from 'lucide-react'
import type { Session } from '@/types'
import { exportBin } from '@/lib/api'

interface TopbarProps {
  session: Session
  onClose: () => void
}

export function Topbar({ session, onClose }: TopbarProps) {
  const handleExport = () => {
    window.open(exportBin(session.file_id), '_blank')
  }

  const sizeKB = (session.bin_size / 1024).toFixed(1)

  return (
    <header className="h-12 bg-bg-surface border-b border-bg-border flex items-center px-4 gap-4 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <Zap size={18} className="text-accent" fill="currentColor" />
        <span className="font-semibold text-text-primary tracking-tight">MapForge</span>
      </div>

      {/* File info */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-text-secondary">{session.bin_name}</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{sizeKB} KB</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{session.xdf_title || session.xdf_name}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={handleExport} className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Download size={14} />
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
