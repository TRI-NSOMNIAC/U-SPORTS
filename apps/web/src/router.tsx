import React from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import App from './App'

// Layouts
import AppLayout from './components/layout/AppLayout'
import GuestLayout from './components/layout/GuestLayout'

// Setup
import SetupPage from './pages/setup/SetupPage'

// Auth
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Super Admin
import SuperAdminDashboard from './pages/super-admin/Dashboard'
import SuperAdminOrganizers from './pages/super-admin/Organizers'
import SuperAdminSeasons from './pages/super-admin/Seasons'
import SuperAdminSettings from './pages/super-admin/Settings'
import SuperAdminAudit from './pages/super-admin/AuditLogs'

// Organizer
import OrganizerDashboard from './pages/organizer/Dashboard'
import OrganizerEvents from './pages/organizer/Events'
import OrganizerEventDetail from './pages/organizer/EventDetail'
import OrganizerAthletes from './pages/organizer/Athletes'
import OrganizerTeams from './pages/organizer/Teams'
import OrganizerScoring from './pages/organizer/Scoring'
import OrganizerAnalytics from './pages/organizer/Analytics'
import OrganizerAnnouncements from './pages/organizer/Announcements'
import OrganizerSettings from './pages/organizer/Settings'

// Athlete
import AthleteDashboard from './pages/athlete/Dashboard'
import AthleteProfile from './pages/athlete/Profile'
import AthleteEvents from './pages/athlete/Events'
import AthleteNotifications from './pages/athlete/Notifications'

// Guest
import GuestHub from './pages/guest/Hub'
import GuestLeaderboards from './pages/guest/Leaderboards'
import GuestEvents from './pages/guest/Events'
import GuestEventDetail from './pages/guest/EventDetail'
import GuestAthleteProfile from './pages/guest/AthleteProfile'

// Jumbotron
import JumbotronPage from './pages/jumbotron/JumbotronPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },

      // Setup wizard
      { path: 'setup', element: <SetupPage /> },

      // Auth
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/register', element: <RegisterPage /> },

      // Jumbotron (no auth, no layout)
      { path: 'jumbotron/:matchId', element: <JumbotronPage /> },

      // Guest (public layout)
      {
        element: <GuestLayout />,
        children: [
          { path: 'guest', element: <GuestHub /> },
          { path: 'guest/leaderboards', element: <GuestLeaderboards /> },
          { path: 'guest/events', element: <GuestEvents /> },
          { path: 'guest/events/:id', element: <GuestEventDetail /> },
          { path: 'guest/athletes/:id', element: <GuestAthleteProfile /> },
        ],
      },

      // App layout (sidebar + topnav)
      {
        element: <AppLayout />,
        children: [
          // Super Admin
          { path: 'super-admin', element: <SuperAdminDashboard /> },
          { path: 'super-admin/organizers', element: <SuperAdminOrganizers /> },
          { path: 'super-admin/seasons', element: <SuperAdminSeasons /> },
          { path: 'super-admin/settings', element: <SuperAdminSettings /> },
          { path: 'super-admin/audit', element: <SuperAdminAudit /> },

          // Organizer
          { path: 'organizer', element: <OrganizerDashboard /> },
          { path: 'organizer/events', element: <OrganizerEvents /> },
          { path: 'organizer/events/:id', element: <OrganizerEventDetail /> },
          { path: 'organizer/athletes', element: <OrganizerAthletes /> },
          { path: 'organizer/teams', element: <OrganizerTeams /> },
          { path: 'organizer/scoring/:matchId', element: <OrganizerScoring /> },
          { path: 'organizer/analytics', element: <OrganizerAnalytics /> },
          { path: 'organizer/announcements', element: <OrganizerAnnouncements /> },
          { path: 'organizer/settings', element: <OrganizerSettings /> },

          // Athlete
          { path: 'athlete', element: <AthleteDashboard /> },
          { path: 'athlete/profile', element: <AthleteProfile /> },
          { path: 'athlete/events', element: <AthleteEvents /> },
          { path: 'athlete/notifications', element: <AthleteNotifications /> },
        ],
      },
    ],
  },
])

export default router
