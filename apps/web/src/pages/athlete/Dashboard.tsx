import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Trophy, Calendar, User, Bell, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, Badge, Alert, StatCard, Button, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, formatDate } from '../../lib/utils'
import type { Insight } from '../../types'

export default function AthleteDashboard() {
  const { profile, athlete } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [stats, setStats] = useState<any>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const justRegistered = searchParams.get('registered') === '1'

  useEffect(() => {
    if (!athlete) return
    Promise.all([
      supabase.from('player_season_stats').select('*').eq('athlete_id', athlete.id).order('updated_at', { ascending: false }).limit(1).single(),
      supabase.from('insights').select('*').eq('entity_type', 'player').eq('entity_id', athlete.id).limit(3),
    ]).then(([statsRes, insightsRes]) => {
      setStats(statsRes.data)
      setInsights(insightsRes.data ?? [])
    }).finally(() => setLoading(false))
  }, [athlete])

  if (!athlete) {
    return (
      <div className="space-y-4">
        <Alert type="warning">Your athlete profile is not set up. Please contact support.</Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Welcome / status */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {profile?.full_name.split(' ')[0]}!</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)} · {athlete.position}
          </p>
        </div>
        <Badge variant={
          athlete.verification_status === 'approved' ? 'success' :
          athlete.verification_status === 'rejected' ? 'danger' :
          athlete.verification_status === 'under_review' ? 'info' : 'warning'
        }>
          {athlete.verification_status}
        </Badge>
      </div>

      {justRegistered && (
        <Alert type="info">
          🎉 Registration submitted! An organizer will review your documents. You'll receive a notification when approved.
        </Alert>
      )}

      {athlete.verification_status === 'pending' && !justRegistered && (
        <Alert type="warning">
          ⏳ Your verification is pending review. Check back soon!
        </Alert>
      )}

      {athlete.verification_status === 'rejected' && (
        <Alert type="danger">
          ❌ Your verification was rejected. Reason: {athlete.review_notes || 'No reason provided.'} Please <a href="/auth/register" className="underline">re-register</a> with correct documents.
        </Alert>
      )}

      {athlete.season_status === 'inactive' && (
        <Alert type="warning">
          You are currently <strong>inactive</strong> for this season. Contact your organizer to be reactivated.
        </Alert>
      )}

      {/* Stats */}
      {athlete.verification_status === 'approved' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : stats ? (
            <>
              <StatCard label="Games Played" value={stats.games_played} />
              {athlete.sport === 'basketball' && <>
                <StatCard label="PPG" value={stats.games_played > 0 ? ((stats.stats?.total_points ?? 0) / stats.games_played).toFixed(1) : '0.0'} />
                <StatCard label="RPG" value={stats.games_played > 0 ? ((stats.stats?.total_rebounds ?? 0) / stats.games_played).toFixed(1) : '0.0'} />
                <StatCard label="APG" value={stats.games_played > 0 ? ((stats.stats?.total_assists ?? 0) / stats.games_played).toFixed(1) : '0.0'} />
              </>}
              {athlete.sport === 'volleyball' && <>
                <StatCard label="Kills" value={stats.stats?.kills ?? 0} />
                <StatCard label="Aces" value={stats.stats?.aces ?? 0} />
                <StatCard label="Digs" value={stats.stats?.digs ?? 0} />
              </>}
              {athlete.sport === 'table-tennis' && <>
                <StatCard label="Matches Won" value={stats.stats?.mw ?? 0} />
                <StatCard label="Win %" value={`${stats.stats?.win_pct ?? 0}%`} />
                <StatCard label="Sets Won" value={stats.stats?.sets_won ?? 0} />
              </>}
            </>
          ) : (
            <div className="col-span-4 text-center text-[var(--text-muted)] py-8 text-sm">No stats recorded yet</div>
          )}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#0066FF]" />Performance Insights</h2>
          <div className="space-y-2">
            {insights.map(i => (
              <Card key={i.id} className="flex items-center gap-3">
                {i.insight_type === 'trending_up' ? <TrendingUp className="w-5 h-5 text-[#00FF88]" /> : <TrendingDown className="w-5 h-5 text-[#FF3355]" />}
                <p className="text-sm">{i.insight_text}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'My Profile', icon: User, path: '/athlete/profile' },
          { label: 'My Events', icon: Trophy, path: '/athlete/events' },
          { label: 'Schedule', icon: Calendar, path: '/athlete/events' },
          { label: 'Notifications', icon: Bell, path: '/athlete/notifications' },
        ].map(item => {
          const Icon = item.icon
          return (
            <button key={item.label} onClick={() => navigate(item.path)} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[#0066FF]/50 hover:bg-[#0066FF]/5 transition-all">
              <Icon className="w-6 h-6 text-[#0066FF]" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
