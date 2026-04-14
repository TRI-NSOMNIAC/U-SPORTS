import React from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router'
import { Trophy, BarChart3, Calendar, LogIn, Globe } from 'lucide-react'
import { useInstitutionStore } from '../../stores/institutionStore'
import { Button } from '../ui'
import AnnouncementBanner from '../announcements/AnnouncementBanner'

export default function GuestLayout() {
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Top bar */}
      <header className="h-14 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {institution?.logo_url ? (
            <img src={institution.logo_url} alt="Logo" className="w-8 h-8 rounded-full" />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: 'var(--school-primary)', color: 'var(--school-secondary)' }}
            >
              {institution?.abbreviation?.slice(0, 2) ?? 'US'}
            </div>
          )}
          <div>
            <p className="font-bold text-sm leading-tight">{institution?.abbreviation ?? 'U-Sports'}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{institution?.tagline}</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/guest" end className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-white bg-[var(--surface-elevated)]' : 'text-[var(--text-muted)] hover:text-white'}`}>
            <Globe className="w-3.5 h-3.5" />Hub
          </NavLink>
          <NavLink to="/guest/leaderboards" className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-white bg-[var(--surface-elevated)]' : 'text-[var(--text-muted)] hover:text-white'}`}>
            <Trophy className="w-3.5 h-3.5" />Standings
          </NavLink>
          <NavLink to="/guest/events" className={({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-white bg-[var(--surface-elevated)]' : 'text-[var(--text-muted)] hover:text-white'}`}>
            <Calendar className="w-3.5 h-3.5" />Events
          </NavLink>
        </nav>

        <Button size="sm" onClick={() => navigate('/auth/login')} icon={<LogIn className="w-3.5 h-3.5" />}>
          Sign In
        </Button>
      </header>

      <AnnouncementBanner publicOnly />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
