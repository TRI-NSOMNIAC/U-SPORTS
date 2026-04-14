import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  LayoutDashboard, Users, Calendar, BarChart3, Settings,
  Megaphone, Trophy, ChevronLeft, ChevronRight, Shield,
  UserCheck, ClipboardList, Mic2, User, Bell, Globe,
  Dumbbell
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useInstitutionStore } from '../../stores/institutionStore'
import { cn } from '../../lib/utils'

const superAdminNav = [
  { to: '/super-admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/super-admin/organizers', label: 'Organizers', icon: Users },
  { to: '/super-admin/seasons', label: 'Seasons', icon: Calendar },
  { to: '/super-admin/settings', label: 'School Profile', icon: Settings },
  { to: '/super-admin/audit', label: 'Audit Logs', icon: ClipboardList },
]

const organizerNav = [
  { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/organizer/events', label: 'Events', icon: Trophy },
  { to: '/organizer/teams', label: 'Teams', icon: Dumbbell },
  { to: '/organizer/athletes', label: 'Athletes', icon: UserCheck },
  { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/organizer/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/organizer/settings', label: 'Settings', icon: Settings },
]

const athleteNav = [
  { to: '/athlete', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/athlete/profile', label: 'My Profile', icon: User },
  { to: '/athlete/events', label: 'My Events', icon: Calendar },
  { to: '/athlete/notifications', label: 'Notifications', icon: Bell },
]

export default function Sidebar() {
  const { profile } = useAuthStore()
  const { institution } = useInstitutionStore()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const navItems =
    profile?.role === 'super_admin'
      ? superAdminNav
      : profile?.role === 'organizer'
      ? organizerNav
      : athleteNav

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 flex flex-col bg-[var(--surface-card)] border-r border-[var(--border-subtle)] transition-all duration-200 z-20',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Brand header */}
      <div
        className="h-14 flex items-center px-4 gap-3 border-b border-[var(--border-subtle)]"
        style={{ backgroundColor: 'var(--school-primary)' }}
      >
        {institution?.logo_url ? (
          <img src={institution.logo_url} alt="Logo" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--school-secondary)] flex items-center justify-center text-xs font-bold text-[var(--school-primary)] flex-shrink-0">
            {institution?.abbreviation?.slice(0, 2) ?? 'US'}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[var(--school-secondary)] font-bold text-sm truncate font-[Barlow_Condensed] leading-tight">
              {institution?.abbreviation ?? 'U-Sports'}
            </p>
            <p className="text-[var(--school-secondary)]/60 text-[10px] truncate">{institution?.tagline}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5',
                isActive
                  ? 'bg-[#0066FF]/15 text-[#4D94FF]'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--surface-elevated)]'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
