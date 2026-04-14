import React, { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { useAuth } from './hooks/useAuth'
import { useInstitutionStore } from './stores/institutionStore'
import { useNotificationStore } from './stores/notificationStore'
import { Spinner } from './components/ui'

export default function App() {
  const { session, profile, loading } = useAuth()
  const { fetchInstitution, institution } = useInstitutionStore()
  const { fetchNotifications } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    fetchInstitution()
  }, [])

  useEffect(() => {
    if (!loading && profile) {
      fetchNotifications(profile.id)
    }
  }, [profile, loading])

  useEffect(() => {
    if (loading) return

    const isPublicRoute =
      location.pathname.startsWith('/guest') ||
      location.pathname.startsWith('/auth') ||
      location.pathname.startsWith('/setup') ||
      location.pathname.startsWith('/jumbotron')

    // Redirect to setup if not configured (guest/jumbotron can still load before wizard finishes)
    const setupIncomplete = !institution || !institution.is_setup_complete
    const allowedBeforeSetup =
      location.pathname.startsWith('/setup') ||
      location.pathname.startsWith('/guest') ||
      location.pathname.startsWith('/jumbotron')
    if (setupIncomplete && !allowedBeforeSetup) {
      navigate('/setup')
      return
    }

    if (!session && !isPublicRoute) {
      navigate('/auth/login')
      return
    }

    if (session && profile && (location.pathname === '/' || location.pathname.startsWith('/auth'))) {
      const roleRoutes: Record<string, string> = {
        super_admin: '/super-admin',
        organizer: '/organizer',
        athlete: '/athlete',
      }
      navigate(roleRoutes[profile.role] ?? '/guest')
    }
  }, [session, profile, loading, location.pathname, institution])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-[var(--text-muted)] text-sm">Loading U-Sports...</p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
