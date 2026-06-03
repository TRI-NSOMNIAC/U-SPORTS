import React from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useInstitutionStore } from '../stores/institutionStore'
import { defaultPostLoginPath } from '../lib/navigation'
import { sessionScopedProfile } from '../lib/sessionProfile'

export default function RootRedirect() {
  const { session, profile } = useAuth()
  const scopedProfile = sessionScopedProfile(session, profile)
  const { institution } = useInstitutionStore()

  // Super admins are not redirected to their panel from /  — they use
  // Ctrl+Shift+A or the direct /super-admin URL.
  if (session && scopedProfile && scopedProfile.role !== 'super_admin') {
    return <Navigate to={defaultPostLoginPath(scopedProfile.role)} replace />
  }

  const setupIncomplete = !institution || !institution.is_setup_complete
  if (setupIncomplete) {
    return <Navigate to="/setup" replace />
  }

  return <Navigate to="/guest" replace />
}
