import { useCallback, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { clearHighlights, setDefinition, setField } from '../../features/rca/rcaSlice'
import { formsRequest, type FormFieldDef, type FormsResponse } from '../../api/forms'
import useAPICaller from '../common/hooks/useCallApi'
import CommonInput, { type FieldState } from '../common/common-input'
import FormSection from '../common/form-section'
import StatusBadge from '../common/status-badge'
import UserMenu from '../auth/UserMenu'

/** How long a field stays green after the AI changes it */
const HIGHLIGHT_MS = 2500

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

function FormField({ field, value, state }: { field: FormFieldDef; value: string; state: FieldState }) {
  const dispatch = useAppDispatch()
  const onChange = (e: { target: { value: string } }) => dispatch(setField({ name: field.name, value: e.target.value }))
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
  const ready = status === 'Ready to Commit'

  // Load the form definition (fields come from the database)
  const loadDefinition = useCallback(async () => {
    const res = await callApi(formsRequest())
    if (res?.forms[0]) dispatch(setDefinition(res.forms[0]))
  }, [callApi, dispatch])

  useEffect(() => {
    loadDefinition()
  }, [loadDefinition])

  // Fade the green "just changed" highlight after a moment
  useEffect(() => {
    if (!changedFields.length) return
    const t = setTimeout(() => dispatch(clearHighlights()), HIGHLIGHT_MS)
    return () => clearTimeout(t)
  }, [changedFields, dispatch])

  const fieldState = (name: string): FieldState => {
    if (changedFields.includes(name)) return 'edited'
    return String(form[name] ?? '').trim() ? 'filled' : 'default'
  }

  const filledCount = definition?.fields.filter((f) => String(form[f.name] ?? '').trim()).length ?? 0

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

      {loading && !definition && <FormSkeleton />}

      {error && !definition && (
        <div className="rounded-field border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          Could not load the form: {error}
          <button type="button" className="ml-2 font-medium underline" onClick={loadDefinition}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !definition && (
        <p className="rounded-field border border-line bg-panel p-3 text-xs text-muted">No form is set up yet.</p>
      )}

      {definition && (
        <FormSection title={`Form fields · ${filledCount} of ${definition.fields.length} filled`}>
          {definition.fields.map((f) => (
            <FormField key={f.id} field={f} value={String(form[f.name] ?? '')} state={fieldState(f.name)} />
          ))}
        </FormSection>
      )}
    </div>
  )
}
