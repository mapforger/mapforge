import { useState, useRef } from 'react'
import { X, FileCode, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { contributeXdf } from '@/lib/api'
import { useT } from '@/i18n'


interface ContributeModalProps {
  onClose: () => void
  /** Pre-filled from the current session's XDF name */
  defaultXdfName?: string
}

type Step = 'form' | 'success'

interface FormState {
  car_manufacturer: string
  car_models: string
  year_from: string
  year_to: string
  engine: string
  power_hp: string
  ecu: string
  firmware_version: string
  contributor: string
  notes: string
}

const EMPTY: FormState = {
  car_manufacturer: '', car_models: '', year_from: '', year_to: '',
  engine: '', power_hp: '', ecu: '', firmware_version: '',
  contributor: '', notes: '',
}

export function ContributeModal({ onClose, defaultXdfName }: ContributeModalProps) {
  const [step, setStep]       = useState<Step>('form')
  const [form, setForm]       = useState<FormState>(EMPTY)
  const [xdfFile, setXdfFile] = useState<File | null>(null)
  const [xdfDrag, setXdfDrag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [warnings, setWarnings]     = useState<string[]>([])
  const [formError, setFormError]   = useState<string | null>(null)
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const canSubmit = xdfFile && form.car_manufacturer && form.car_models && form.ecu && form.firmware_version

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await contributeXdf(xdfFile!, form)
      setWarnings(result.warnings)
      setStep('success')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (detail?.errors) {
        setFormError(detail.errors.join(' · '))
      } else {
        setFormError(typeof detail === 'string' ? detail : 'Submission failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-bg-surface border border-bg-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border flex-shrink-0">
          <div>
            <h2 className="text-text-primary font-semibold">{t.contributeTitle}</h2>
            <p className="text-text-muted text-xs mt-0.5">{t.contributeDesc}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors ml-4">
            <X size={16} />
          </button>
        </div>

        {step === 'success' ? (
          <SuccessStep warnings={warnings} onClose={onClose} t={t} />
        ) : (
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* XDF file drop zone */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                XDF file <span className="text-error">*</span>
              </label>
              <label
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer
                  transition-all duration-150 group
                  ${xdfDrag ? 'border-accent bg-accent-muted'
                    : xdfFile ? 'border-accent/40 bg-accent-muted'
                    : 'border-bg-border hover:border-accent/40'}`}
                onDragOver={e => e.preventDefault()}
                onDragEnter={() => setXdfDrag(true)}
                onDragLeave={() => setXdfDrag(false)}
                onDrop={e => { e.preventDefault(); setXdfDrag(false); const f = e.dataTransfer.files[0]; if (f) setXdfFile(f) }}
              >
                <input ref={inputRef} type="file" className="sr-only" accept=".xdf"
                  onChange={e => setXdfFile(e.target.files?.[0] ?? null)} />
                <FileCode size={20} className={`flex-shrink-0 ${xdfFile ? 'text-accent' : 'text-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  {xdfFile
                    ? <p className="text-accent text-sm font-mono truncate">{xdfFile.name}</p>
                    : <p className="text-text-muted text-sm">{defaultXdfName ?? 'Drop or click to select your .xdf'}</p>}
                </div>
              </label>
            </div>

            {/* Required fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.fieldManufacturer} required value={form.car_manufacturer} onChange={set('car_manufacturer')} placeholder="Fiat" />
              <Field label={t.fieldEcu}          required value={form.ecu}              onChange={set('ecu')}              placeholder="Bosch EDC16C39" />
            </div>
            <Field label={t.fieldFirmware} required value={form.firmware_version} onChange={set('firmware_version')} placeholder="SW 2.31" />
            <Field label={t.fieldModels}   required value={form.car_models}       onChange={set('car_models')}       placeholder="Punto 199, Bravo 198" />

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.fieldEngine}   value={form.engine}   onChange={set('engine')}   placeholder="1.6 JTDm" />
              <Field label={t.fieldPower}    value={form.power_hp} onChange={set('power_hp')} placeholder="105" type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.fieldYearFrom} value={form.year_from} onChange={set('year_from')} placeholder="2007" type="number" />
              <Field label={t.fieldYearTo}   value={form.year_to}   onChange={set('year_to')}   placeholder="2012" type="number" />
            </div>
            <Field label={t.fieldContributor} value={form.contributor} onChange={set('contributor')} placeholder="anonymous" />

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {t.fieldNotes}
              </label>
              <textarea
                className="input w-full py-2 text-sm resize-none"
                rows={2}
                placeholder="e.g. Tested on Punto 2009, SW read via OBD"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2.5">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <p className="text-text-muted text-xs">
              Fields marked <span className="text-error">*</span> are required.
            </p>
          </div>
        )}

        {/* Footer */}
        {step === 'form' && (
          <div className="px-5 py-4 border-t border-bg-border flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {submitting
                ? <><Loader size={14} className="animate-spin" />{t.loading}</>
                : t.submitContribution}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({ label, required, value, onChange, placeholder, type = 'text' }: {
  label: string
  required?: boolean
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <input
        type={type}
        className="input w-full py-1.5 text-sm"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  )
}

// ── Success step ──────────────────────────────────────────────────────────────

function SuccessStep({ warnings, onClose, t }: {
  warnings: string[]
  onClose: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
      <CheckCircle size={48} className="text-emerald-400" />
      <p className="text-text-primary font-semibold text-base">{t.contributionSent}</p>
      {warnings.length > 0 && (
        <div className="w-full space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-amber-400 text-xs bg-amber-400/10 rounded px-3 py-1.5">{w}</p>
          ))}
        </div>
      )}
      <button onClick={onClose} className="btn-primary px-6 py-2 text-sm mt-2">{t.close}</button>
    </div>
  )
}
