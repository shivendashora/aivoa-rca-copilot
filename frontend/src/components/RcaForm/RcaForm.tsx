import { useCallback, useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { clearHighlights, resetForm, setDefinition, setField, setValues } from '../../features/rca/rcaSlice'
import {
  clearValuesRequest,
  formsRequest,
  formValuesRequest,
  type FormFieldDef,
  type FormsResponse,
  type FormValuesResponse,
} from '../../api/forms'
import { discardFieldSaves, onSaveStatus, queueFieldSave, type SaveStatus } from '../../api/formDraft'
import useAPICaller from '../common/hooks/useCallApi'
import CommonInput, { type FieldState } from '../common/common-input'
import FormSection from '../common/form-section'
import StatusBadge from '../common/status-badge'
import UserMenu from '../auth/UserMenu'
import { cn } from '../../lib/cn'

/** How long a field stays green after the AI changes it */
const HIGHLIGHT_MS = 2500

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

const saveLabels: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: "Couldn't save your last edit",
}

function FormField({ formId, field, value, state }: { formId: number; field: FormFieldDef; value: string; state: FieldState }) {
  const dispatch = useAppDispatch()
  const onChange = (e: { target: { value: string } }) => {
    dispatch(setField({ name: field.name, value: e.target.value }))
    queueFieldSave(formId, field.name, e.target.value) // saved to the database shortly after typing stops
  }
  const common = { label: field.name, value, onChange, state, placeholder: field.description }

  if (field.type === 'textarea') return <CommonInput {...common} multiline rows={3} fullWidth />
  // The AI writes "Not Provided" when a date is unknown, which a date picker can't show
  if (field.type === 'date') return <CommonInput {...common} type={!value || isIsoDate(value) ? 'date' : 'text'} />
  // Dropdowns have no option list in the database yet, so they are free text for now
  return <CommonInput {...common} />
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-3 w-28 animate-pulse rounded bg-line" />
          <div className="h-[34px] animate-pulse rounded-field bg-line-soft" />
        </div>
      ))}
    </div>
  )
}

export default function RcaForm() {
  const dispatch = useAppDispatch()
  const { definition, form, changedFields, status } = useAppSelector((s) => s.rca)
  const { callApi, loading, error } = useAPICaller<FormsResponse>()
  const valuesApi = useAPICaller<FormValuesResponse>()
  const loadValues = valuesApi.callApi
  const clearApi = useAPICaller<FormValuesResponse>()
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const ready = status === 'Ready to Commit'

  useEffect(() => onSaveStatus(setSaveStatus), [])

  // Load the form definition (fields come from the database), then this user's saved values
  const loadDefinition = useCallback(async () => {
    const res = await callApi(formsRequest())
    const def = res?.forms[0]
    if (!def) return
    dispatch(setDefinition(def))
    const saved = await loadValues(formValuesRequest(def.id))
    if (saved) dispatch(setValues(saved.values))
  }, [callApi, loadValues, dispatch])

  useEffect(() => {
    loadDefinition()
  }, [loadDefinition])

  // Fade the green "just changed" highlight after a moment
  useEffect(() => {
    if (!changedFields.length) return
    const t = setTimeout(() => dispatch(clearHighlights()), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [changedFields, dispatch])

  const clearForm = async () => {
    if (!definition) return
    if (!window.confirm('Clear every field to log a new complaint? This deletes the saved values.')) return
    discardFieldSaves()
    const res = await clearApi.callApi(clearValuesRequest(definition.id))
    if (res) {
      dispatch(resetForm())
      setSaveStatus('idle')
    }
  }

  const fieldState = (name: string): FieldState => {
    if (changedFields.includes(name)) return 'edited'
    return String(form[name] ?? '').trim() ? 'filled' : 'default'
  }

  const filledCount = definition?.fields.filter((f) => String(form[f.name] ?? '').trim()).length ?? 0
  const busy = loading || valuesApi.loading

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-start justify-between border-b border-line-soft pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">{definition?.name ?? 'Root Cause Analysis'}</h1>
          <p className="mt-1 text-xs text-muted">{definition?.description ?? 'API Manufacturing Quality Investigation'}</p>
        </div>
        <div className="flex items-center gap-4">
          <StatusBadge ready={ready} label={status} />
          <UserMenu />
        </div>
      </div>

      {busy && <FormSkeleton />}

      {(error || valuesApi.error) && !busy && (
        <div className="mb-4 rounded-field border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Could not load the form: {error ?? valuesApi.error}
          <button type="button" className="ml-2 font-medium underline" onClick={loadDefinition}>
            Retry
          </button>
        </div>
      )}

      {!busy && !error && !definition && (
        <p className="rounded-field border border-line bg-panel p-3 text-xs text-muted">No form is set up yet.</p>
      )}

      {definition && !busy && (
        <>
          <div className="mb-3 flex items-center justify-end gap-3 text-[11px]">
            <span className={cn(saveStatus === 'error' ? 'text-red-600' : 'text-muted')}>{saveLabels[saveStatus]}</span>
            {clearApi.error && <span className="text-red-600">Couldn't clear: {clearApi.error}</span>}
            <button
              type="button"
              onClick={clearForm}
              disabled={!filledCount || clearApi.loading}
              className="rounded-field border border-line px-2.5 py-1 font-medium text-ink-2 transition-colors hover:border-red-300 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
            >
              {clearApi.loading ? 'Clearing…' : 'Clear form'}
            </button>
          </div>
          <FormSection title={`Form fields · ${filledCount} of ${definition.fields.length} filled`}>
            {definition.fields.map((f) => (
              <FormField
                key={f.id}
                formId={definition.id}
                field={f}
                value={String(form[f.name] ?? '')}
                state={fieldState(f.name)}
              />
            ))}
          </FormSection>
        </>
      )}
    </div>
  )
}
