import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: Variant
}

interface ToastContextValue {
  toast: (opts: { message: string; variant?: Variant; duration?: number }) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback(({ message, variant = 'info', duration = 4000 }: {
    message: string
    variant?: Variant
    duration?: number
  }) => {
    const id = ++counter.current
    setToasts(t => [...t, { id, message, variant }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[200] pointer-events-none">
        {toasts.map(t => (
          <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a readable message from an Axios error or plain Error. */
export function apiError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as any
    if (e?.response?.data?.detail) return String(e.response.data.detail)
    if (e?.message) return String(e.message)
  }
  return 'Une erreur est survenue'
}

// ── Toast component ───────────────────────────────────────────────────────────

const ICONS: Record<Variant, React.ReactNode> = {
  success: <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />,
  error:   <AlertCircle  size={15} className="text-error flex-shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />,
  info:    <Info          size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />,
}

const BORDER: Record<Variant, string> = {
  success: 'border-emerald-400/30',
  error:   'border-error/30',
  warning: 'border-amber-400/30',
  info:    'border-blue-400/30',
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div className={`toast-in pointer-events-auto flex items-start gap-3
                     bg-bg-surface border ${BORDER[item.variant]}
                     rounded-lg px-4 py-3 shadow-2xl min-w-[300px] max-w-sm`}>
      {ICONS[item.variant]}
      <p className="flex-1 text-sm text-text-primary leading-snug">{item.message}</p>
      <button onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors ml-1">
        <X size={13} />
      </button>
    </div>
  )
}
