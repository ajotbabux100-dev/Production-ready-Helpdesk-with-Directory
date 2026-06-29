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

// Ensure only one token refresh is in flight at a time. If a second 401
// arrives while a refresh is already running, it waits for the same promise
// instead of firing a second refresh (which would use the already-rotated
// refresh token and cause an erroneous logout).
let refreshPromise: Promise<string> | null = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) {
        window.location.href = '/login'
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
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api
