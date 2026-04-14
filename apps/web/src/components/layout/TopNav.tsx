import React, { useEffect, useState } from 'react'
import { Bell, LogOut, Settings, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { getInitials, cn } from '../../lib/utils'
import { Badge } from '../ui'
import OnlineOrganizers from './OnlineOrganizers'

export default function TopNav() {
  const { profile, signOut } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth/login')
  }

  const getNotifRoute = () => {
    if (profile?.role === 'athlete') return '/athlete/notifications'
    if (profile?.role === 'organizer' || profile?.role === 'super_admin') return '/organizer/announcements'
    return '/'
  }

  return (
    <header className="h-14 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 z-30 sticky top-0">
      {/* Left - Logo */}
      <div className="flex items-center gap-3">
        {institution?.logo_url ? (
          <img src={institution.logo_url} alt="Logo" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: 'var(--school-primary)', color: 'var(--school-secondary)' }}
          >
            {institution?.abbreviation?.slice(0, 2) ?? 'US'}
          </div>
        )}
        <span className="font-bold text-sm hidden sm:block">
          {institution?.abbreviation ?? 'U-Sports'}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Online organizers (only for organizer/super admin) */}
        {(profile?.role === 'organizer' || profile?.role === 'super_admin') && (
          <OnlineOrganizers />
        )}

        {/* Notifications */}
        {profile && (
          <button
            onClick={() => navigate(getNotifRoute())}
            className="relative p-2 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-[#FF3355] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* User menu */}
        {profile && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-xs font-bold text-[var(--school-secondary)]">
                {getInitials(profile.full_name)}
              </div>
              <span className="text-sm text-[var(--text-secondary)] hidden sm:block">
                {profile.full_name.split(' ')[0]}
              </span>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xl py-1 z-50">
                <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                  <p className="text-sm font-medium">{profile.full_name}</p>
                  <p className="text-xs text-[var(--text-muted)] capitalize">{profile.role.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/organizer/settings') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FF3355] hover:bg-[#FF3355]/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
