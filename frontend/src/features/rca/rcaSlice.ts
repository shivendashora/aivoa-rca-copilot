import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { AiUpdateResponse, RcaFormData } from '../../api/client'
import type { FormDefinition } from '../../api/forms'

export type RcaStatus = 'Pending Triage' | 'Ready to Commit'

interface RcaState {
  definition: FormDefinition | null // which fields the form has (from GET /forms)
  form: RcaFormData                 // field values, keyed by field name
  changedFields: string[]           // fields to flash green after an AI edit
  status: RcaStatus
}

const initialState: RcaState = {
  definition: null,
  form: {},
  changedFields: [],
  status: 'Pending Triage',
}

const statusOf = (form: RcaFormData): RcaStatus =>
  Object.values(form).some((v) => String(v ?? '').trim()) ? 'Ready to Commit' : 'Pending Triage'

const rcaSlice = createSlice({
  name: 'rca',
  initialState,
  reducers: {
    setDefinition(state, action: PayloadAction<FormDefinition>) {
      state.definition = action.payload
    },
    applyAiUpdate(state, action: PayloadAction<Pick<AiUpdateResponse, 'form' | 'changed_fields'>>) {
      const { form, changed_fields = [] } = action.payload
      state.form = form ?? state.form
      state.changedFields = changed_fields
      state.status = statusOf(state.form)
    },
    /** A manual edit by the user */
    setField(state, action: PayloadAction<{ name: string; value: string }>) {
      state.form[action.payload.name] = action.payload.value
      state.changedFields = state.changedFields.filter((f) => f !== action.payload.name)
      state.status = statusOf(state.form)
    },
    clearHighlights(state) {
      state.changedFields = []
    },
    resetForm(state) {
      // Keep the loaded definition; only the values are cleared
      return { ...initialState, definition: state.definition }
    },
  },
})

export const { setDefinition, applyAiUpdate, setField, clearHighlights, resetForm } = rcaSlice.actions
export default rcaSlice.reducer
