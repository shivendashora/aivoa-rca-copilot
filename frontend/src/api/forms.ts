import type { ApiRequest } from '../components/common/hooks/useCallApi'

// Backend: backend/app/api/routes/forms.py (prefix /api/forms)

export type FieldType = 'text' | 'textarea' | 'dropdown' | 'date'

export interface FormFieldDef {
  id: number
  /** Also the key of this field's value in the form data */
  name: string
  description: string
  type: FieldType | string
}

export interface FormDefinition {
  id: number
  name: string
  description: string
  fields: FormFieldDef[]
}

export interface FormsResponse {
  message: string
  forms: FormDefinition[]
}

/** GET /forms: every form definition with its fields */
export const formsRequest = (): ApiRequest => ({ url: '/forms' })

/** The logged-in user's saved values, keyed by field name */
export interface FormValuesResponse {
  message: string
  values: Record<string, string>
}

/** GET /forms/{id}/values: the saved draft, so the form survives a reload */
export const formValuesRequest = (formId: number): ApiRequest => ({ url: `/forms/${formId}/values` })

/** DELETE /forms/{id}/values: empty the draft to log a new complaint */
export const clearValuesRequest = (formId: number): ApiRequest => ({ url: `/forms/${formId}/values`, method: 'DELETE' })
