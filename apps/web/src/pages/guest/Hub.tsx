import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Play, Trophy, Users, TrendingUp, BarChart3 } from 'lucide-react'
import { Card, Badge, Button, StatCard, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useInstitutionStore } from '../../stores/institutionStore'
import { getSportLabel, getSportIcon, formatDateTime } from '../../lib/utils'

export default function GuestHub() {
  const { institution } = useInstitutionStore()
  const navigate = useNavigate()
  const [liveMatches, setLiveMatches] = useState<any[]>([])
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('matches').select('*, scores:match_scores(*)').eq('status', 'live').limit(5),
      supabase.from('events').select('*').in('status', ['in_progress', 'completed']).order('created_at', { ascending: false }).limit(6),
    ]).then(([mRes, eRes]) => {
      setLiveMatches(mRes.data ?? [])
      setRecentEvents(eRes.data ?? [])
    }).finally(() => setLoading(false))

    // Subscribe to live match changes
    const channel = supabase.channel('hub-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        supabase.from('matches').select('*, scores:match_scores(*)').eq('status', 'live').limit(5).then(r => setLiveMatches(r.data ?? []))
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden py-16 px-8 text-center"
        style={{ background: `linear-gradient(135deg, var(--school-primary) 0%, #001833 100%)` }}
      >
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #FFD700 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        <div className="relative">
          <p className="text-[var(--school-secondary)] font-bold text-sm uppercase tracking-widest mb-2">Live Sports Platform</p>
          <h1 className="text-5xl font-black font-[Barlow_Condensed] tracking-wide text-white mb-2">
            {institution?.abbreviation ?? 'U-Sports'}
          </h1>
          <p className="text-white/60 text-lg">{institution?.name}</p>
          <p className="text-white/40 italic mt-1">{institution?.tagline}</p>
          <div className="flex justify-center gap-3 mt-6">
            <Button onClick={() => navigate('/guest/leaderboards')} icon={<Trophy className="w-4 h-4" />}>
              Standings
            </Button>
            <Button variant="secondary" onClick={() => navigate('/guest/events')} icon={<BarChart3 className="w-4 h-4" />}>
              Events
            </Button>
          </div>
        </div>
      </div>

      {/* Live now */}
      {liveMatches.length > 0 && (
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-[#FF3355] animate-pulse-live" />
            Live Now
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {liveMatches.map(m => (
              <Card key={m.id} className="cursor-pointer hover:border-[#FF3355]/50" onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="danger">LIVE</Badge>
                  <Button size="sm" variant="ghost" icon={<Play className="w-3.5 h-3.5" />}>Watch</Button>
                </div>
                <div className="flex items-center justify-between text-xl font-black font-[Barlow_Condensed]">
                  <span>{m.participant_a_id?.slice(0, 8) ?? 'TBD'}</span>
                  <span className="text-[var(--text-muted)] text-sm">vs</span>
                  <span>{m.participant_b_id?.slice(0, 8) ?? 'TBD'}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Events</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/guest/events')}>View all →</Button>
        </div>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentEvents.map(e => (
              <Card key={e.id} className="cursor-pointer hover:border-white/20" onClick={() => navigate(`/guest/events/${e.id}`)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{getSportIcon(e.sport as any)}</span>
                  <Badge variant={e.status === 'in_progress' ? 'danger' : 'success'} size="sm">{e.status}</Badge>
                </div>
                <h3 className="font-bold text-sm">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1 capitalize">{e.format?.replace('_', ' ')}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sports quick links */}
      <div>
        <h2 className="text-xl font-bold mb-4">Browse by Sport</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { sport: 'basketball', label: 'Basketball', icon: '🏀' },
            { sport: 'volleyball', label: 'Volleyball', icon: '🏐' },
            { sport: 'table-tennis', label: 'Table Tennis', icon: '🏓' },
          ].map(s => (
            <button key={s.sport} onClick={() => navigate(`/guest/leaderboards?sport=${s.sport}`)} className="flex flex-col items-center gap-3 p-6 rounded-xl border border-[var(--border-subtle)] hover:border-white/20 transition-all">
              <span className="text-4xl">{s.icon}</span>
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
