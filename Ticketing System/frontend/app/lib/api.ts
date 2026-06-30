import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Wipe ALL auth state (Zustand store + raw localStorage keys) and redirect to login.
// Calling the Zustand store directly avoids the partial-clear bug where
// auth-storage still holds stale user data after tokens are removed.
function forceLogout() {
  try {
    // Dynamically access the store singleton without a React hook
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('./store')
    useAuthStore.getState().clearAuth()
  } catch {
    // Fallback if the store isn't available yet
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('auth-storage')
  }
  window.location.href = '/login'
}

// Ensure only one token refresh is in flight at a time.
let refreshPromise: Promise<string> | null = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        forceLogout()
        return Promise.reject(error)
      }

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/auth/token/refresh/`,
              { refresh }
            )
            .then((res) => {
              localStorage.setItem('access_token', res.data.access)
              if (res.data.refresh) {
                localStorage.setItem('refresh_token', res.data.refresh)
              }
              return res.data.access as string
            })
            .finally(() => {
              refreshPromise = null
            })
        }

        const newAccess = await refreshPromise
        original.headers.Authorization = `Bearer ${newAccess}`
        return api(original)
      } catch {
        forceLogout()
      }
    }
    return Promise.reject(error)
  }
)

export default api
