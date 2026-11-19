import api from './client'
import { tokenStorage } from '../lib/tokenStorage'
import type { ApiRequest } from '../components/common/hooks/useCallApi'

// Backend: backend/app/api/routes/auth.py (prefix /api/auth)

/** Login and refresh both return only the access token; the refresh token is set as an httpOnly cookie. */
export interface TokenResponse {
  message: string
  data: { access_token: string; token_type: string }
}

export type LoginResponse = TokenResponse

export interface SignUpBody {
  username: string
  email: string
  password: string
}

export interface SignUpResponse {
  message: string
  data: { id: number; username: string; email: string }
}

/** POST /auth/login. The backend uses OAuth2PasswordRequestForm, so this must be form-encoded, not JSON. */
export const loginRequest = (username: string, password: string): ApiRequest<URLSearchParams> => ({
  url: '/auth/login',
  method: 'POST',
  body: new URLSearchParams({ username, password }),
})

/** POST /auth/sign-up (JSON body) */
export const signUpRequest = (body: SignUpBody): ApiRequest<SignUpBody> => ({
  url: '/auth/sign-up',
  method: 'POST',
  body,
})

export interface CurrentUser {
  id: number
  username: string
  email: string
  role: string
}

export interface MeResponse {
  message: string
  data: CurrentUser
}

/** GET /auth/me: the logged-in user (needs the access token, which the client adds) */
export const meRequest = (): ApiRequest => ({ url: '/auth/me' })

/** POST /auth/logout. The backend revokes both tokens and clears the refresh-token cookie; here the access token is cleared. */
export const logout = async () => {
  try {
    await api.post('/auth/logout')
  } finally {
    tokenStorage.clear()
  }
}
