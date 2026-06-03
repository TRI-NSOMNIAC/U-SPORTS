import React, { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { useAuth } from './hooks/useAuth'
import { useInstitutionStore } from './stores/institutionStore'
import { useNotificationStore } from './stores/notificationStore'
import { Spinner } from './components/ui'
import { defaultPostLoginPath, safeInternalPath } from './lib/navigation'
import { sessionScopedProfile } from './lib/sessionProfile'

export default function App() {
  const { session, profile, loading: authLoading } = useAuth()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { fetchInstitution, institution, loading: institutionLoading } = useInstitutionStore()
  const { fetchNotifications } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Block rendering until both auth AND institution have resolved so we never
  // flash a page only to immediately redirect away.
  const loading = authLoading || institutionLoading

  useEffect(() => {
    fetchInstitution()
  }, [])

  useEffect(() => {
    if (!authLoading && scopedProfile) {
      fetchNotifications(scopedProfile.id)
    }
  }, [scopedProfile, authLoading])

  useEffect(() => {
    const onSuperAdminChord = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'a') return
      e.preventDefault()
      const destination =
        session && scopedProfile?.role === 'super_admin' ? '/super-admin' : '/super-admin/login'
      navigate(destination, { replace: true })
    }
    window.addEventListener('keydown', onSuperAdminChord)
    return () => window.removeEventListener('keydown', onSuperAdminChord)
  }, [session, scopedProfile, navigate])

  useEffect(() => {
    if (loading) return

    const isPublicRoute =
      location.pathname === '/' ||
      location.pathname.startsWith('/guest') ||
      location.pathname === '/student' ||
      location.pathname.startsWith('/auth') ||
      location.pathname.startsWith('/setup') ||
      location.pathname.startsWith('/jumbotron') ||
      location.pathname === '/super-admin/login'

    // If setup is not finished, only /setup, /guest, /jumbotron and the super admin
    // login page are reachable. /auth/* is blocked so students/organizers must wait
    // for the super admin to finish setup first.
    // /super-admin/login is allowed here because the page handles its own setup
    // redirect internally.
    const setupIncomplete = !institution || !institution.is_setup_complete
    const allowedBeforeSetup =
      location.pathname.startsWith('/setup') ||
      location.pathname.startsWith('/guest') ||
      location.pathname.startsWith('/jumbotron') ||
      location.pathname === '/super-admin/login'
    if (setupIncomplete && !allowedBeforeSetup) {
      navigate('/setup', { replace: true })
      return
    }

    if (!session && !isPublicRoute) {
      const from = `${location.pathname}${location.search}`
      navigate('/auth/login', { state: { from }, replace: true })
      return
    }

    // Super admins are excluded from root/auth redirects — / always lands on
    // the guest hub for them. Other authenticated roles go to their dashboards.
    if (
      session &&
      scopedProfile &&
      scopedProfile.role !== 'super_admin' &&
      (location.pathname === '/' || location.pathname.startsWith('/auth'))
    ) {
      const returnTo = safeInternalPath((location.state as { from?: string } | null)?.from)
      navigate(returnTo ?? defaultPostLoginPath(scopedProfile.role), { replace: true })
      return
    }

    if (session && scopedProfile) {
      const wrongRolePath =
        (location.pathname.startsWith('/super-admin') &&
          location.pathname !== '/super-admin/login' &&
          scopedProfile.role !== 'super_admin') ||
        (location.pathname.startsWith('/organizer') &&
          scopedProfile.role !== 'organizer' &&
          scopedProfile.role !== 'super_admin') ||
        (location.pathname.startsWith('/athlete') && scopedProfile.role !== 'athlete') ||
        (location.pathname.startsWith('/student') && scopedProfile.role !== 'student')

      if (wrongRolePath) {
        navigate(defaultPostLoginPath(scopedProfile.role), { replace: true })
      }
    }
  }, [session, scopedProfile, loading, location.pathname, institution])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-[var(--text-muted)] text-sm">Loading U-Sports...</p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
