// The access token lives in sessionStorage: cleared when the tab closes, not shared between tabs.
// The refresh token is NOT stored here: the backend keeps it in an httpOnly cookie that
// page scripts can't read, and the browser sends it to /api/auth/* on its own.
// Every access is wrapped because storage can throw (private mode, blocked site data).

const ACCESS_KEY = 'aivoa.access_token'

const read = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export const tokenStorage = {
  getAccessToken: () => read(ACCESS_KEY),

  setAccessToken(accessToken: string) {
    try {
      sessionStorage.setItem(ACCESS_KEY, accessToken)
    } catch {
      /* storage unavailable: user stays logged in only until reload */
    }
  },

  clear() {
    try {
      sessionStorage.removeItem(ACCESS_KEY)
    } catch {
      /* nothing to clear */
    }
  },

  isLoggedIn: () => Boolean(read(ACCESS_KEY)),
}
