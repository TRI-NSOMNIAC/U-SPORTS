import axios from 'axios'
import { supabase } from './supabase'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const raw = error.response?.data?.error
      const msg = typeof raw === 'string' ? raw : ''
      const deactivated = msg.toLowerCase().includes('deactivated')
      void supabase.auth.signOut().then(() => {
        const onSuperAdmin =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/super-admin')
        let dest = onSuperAdmin ? '/super-admin/login' : '/auth/login'
        if (deactivated && !onSuperAdmin) dest += '?reason=deactivated'
        window.location.href = dest
      })
    }
    return Promise.reject(error)
  }
)

export default api
