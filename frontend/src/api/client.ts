import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { tokenStorage } from '../lib/tokenStorage'

const api = axios.create({ baseURL: '/api' })

interface RefreshResponse {
  message: string
  data: { access_token: string; token_type: string }
}

// One refresh at a time: if several requests get a 401 together, they all wait for the same refresh
let refreshInFlight: Promise<string> | null = null

/** Gets a new access token using the refresh-token cookie. Also used by the chat WebSocket. */
export const refreshAccessToken = (): Promise<string> => {
  if (!refreshInFlight) {
    // No body: the browser sends the httpOnly refresh-token cookie itself.
    // Plain axios, not `api`, so a failed refresh can't trigger another refresh.
    refreshInFlight = axios
      .post<RefreshResponse>('/api/auth/refresh', null, { withCredentials: true })
      .then(({ data }) => {
        tokenStorage.setAccessToken(data.data.access_token)
        return data.data.access_token
      })
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

const logoutAndRedirect = () => {
  tokenStorage.clear()
  window.location.assign('/')
}

// Send the access token with every request
api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Access token expired or invalid: refresh it once and retry the request.
// If the refresh fails too (refresh token expired), log out.
// Auth calls are skipped so a wrong password on the login page doesn't redirect.
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
  const isAuthCall = String(original?.url ?? '').startsWith('/auth/')

  if (error.response?.status !== 401 || !original || isAuthCall || original._retried || !tokenStorage.isLoggedIn()) {
    return Promise.reject(error)
  }

  original._retried = true
  try {
    const newToken = await refreshAccessToken()
    original.headers.Authorization = `Bearer ${newToken}`
    return api.request(original)
  } catch {
    logoutAndRedirect()
    return Promise.reject(error)
  }
})

/** RCA form values the AI fills in. Keys are field names, values are whatever the backend sends. */
export type RcaFormData = Record<string, unknown>

/** Shape returned by /chat and /chat/upload. */
export interface AiUpdateResponse {
  reply: string
  form: RcaFormData
  changed_fields?: string[]
}

export const sendChat = (message: string, currentForm: RcaFormData): Promise<AiUpdateResponse> =>
  api.post<AiUpdateResponse>('/chat', { message, current_form: currentForm }).then((r) => r.data)

export const uploadDocument = (file: File, message = ''): Promise<AiUpdateResponse> => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('message', message)
  return api.post<AiUpdateResponse>('/chat/upload', fd).then((r) => r.data)
}

export const saveInvestigation = <T = unknown>(payload: RcaFormData): Promise<T> =>
  api.post<T>('/investigations', payload).then((r) => r.data)

export default api
