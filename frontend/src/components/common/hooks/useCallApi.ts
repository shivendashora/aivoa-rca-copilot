import { useCallback, useEffect, useRef, useState } from 'react'
import axios, { type AxiosRequestConfig, type Method } from 'axios'
import api from '../../../api/client'

export interface ApiRequest<TBody = unknown> {
  url: string
  method?: Method
  body?: TBody
  params?: Record<string, unknown>
  headers?: Record<string, string>
  /** Any extra axios options (timeout, responseType, onUploadProgress, ...) */
  config?: AxiosRequestConfig
}

export interface UseAPICallerResult<TData, TBody> {
  data: TData | null
  loading: boolean
  error: string | null
  /** Runs the request. Resolves to the response data, or null if it failed or was cancelled. */
  callApi: (request: ApiRequest<TBody>) => Promise<TData | null>
  /** Cancels the request in flight, if any. */
  cancel: () => void
  /** Clears data and error. */
  reset: () => void
}

/** Pulls a readable message out of an axios / FastAPI error. */
const getErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors (422): [{ loc: [...], msg: '...' }]
    if (Array.isArray(detail)) {
      return detail.map((d: { msg?: string; loc?: unknown[] }) => `${d.loc?.at(-1) ?? 'field'}: ${d.msg ?? 'invalid'}`).join(', ')
    }
    if (detail) return JSON.stringify(detail)
    return err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}

/**
 * Common API caller. Uses the shared axios instance (baseURL '/api').
 *
 * const { data, loading, error, callApi } = useAPICaller<Investigation[]>()
 * useEffect(() => { callApi({ url: '/investigations' }) }, [callApi])
 *
 * const login = useAPICaller<LoginResponse, LoginBody>()
 * await login.callApi({ url: '/auth/login', method: 'POST', body: { email, password } })
 *
 * Starting a new call cancels the previous one, and the request is cancelled on unmount.
 */
export function useAPICaller<TData = unknown, TBody = unknown>(): UseAPICallerResult<TData, TBody> {
  const [data, setData] = useState<TData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const callApi = useCallback(
    async ({ url, method = 'GET', body, params, headers, config }: ApiRequest<TBody>) => {
      cancel()
      const controller = new AbortController()
      controllerRef.current = controller

      setLoading(true)
      setError(null)
      try {
        const res = await api.request<TData>({
          ...config,
          url,
          method,
          data: body,
          params,
          headers: { ...config?.headers, ...headers },
          signal: controller.signal,
        })
        setData(res.data)
        return res.data
      } catch (err) {
        if (axios.isCancel(err)) return null
        setError(getErrorMessage(err))
        return null
      } finally {
        // Only the latest call may clear the loading flag
        if (controllerRef.current === controller) {
          controllerRef.current = null
          setLoading(false)
        }
      }
    },
    [cancel],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  // Cancel any request still running when the component unmounts
  useEffect(() => cancel, [cancel])

  return { data, loading, error, callApi, cancel, reset }
}

export default useAPICaller
