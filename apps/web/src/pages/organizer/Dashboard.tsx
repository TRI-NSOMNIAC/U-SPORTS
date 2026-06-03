import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Trophy, UserCheck, Play, Mic2 } from 'lucide-react'
import { StatCard, Card, Badge, Button, Skeleton } from '../../components/ui'
import { CreateEventModal } from '../../components/organizer/CreateEventModal'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatEnumLabel, getSportIcon, getSportLabel, organizerEventStatusLabel } from '../../lib/utils'
import { fetchParticipantLabels } from '../../lib/participantLabels'
import type { Event, Match } from '../../types'

export default function OrganizerDashboard() {
  const { organizer } = useAuthStore()
  const navigate = useNavigate()
  const [events, setEvents] = useState<Event[]>([])
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [liveMatchLabels, setLiveMatchLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('events').select('*').in('status', ['in_progress', 'draft', 'registration']).order('created_at', { ascending: false }).limit(5),
      supabase.from('matches').select('*').eq('status', 'live'),
      api.get<unknown[]>('/students/pending-cor').catch(() => ({ data: [] as unknown[] })),
      api.get<unknown[]>('/athletes/pending').catch(() => ({ data: [] as unknown[] })),
      api
        .get<unknown[]>('/athletes', {
          params: { medical_clearance_queue: 'true', has_med_cert: 'true' },
        })
        .catch(() => ({ data: [] as unknown[] })),
    ]).then(([evRes, mRes, corRes, verRes, medRes]) => {
      setEvents(evRes.data ?? [])
      setLiveMatches(mRes.data ?? [])
      const cor = Array.isArray(corRes.data) ? corRes.data.length : 0
      const ver = Array.isArray(verRes.data) ? verRes.data.length : 0
      const med = Array.isArray(medRes.data) ? medRes.data.length : 0
      setPendingCount(cor + ver + med)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const ids = [
      ...new Set(
        liveMatches.flatMap((m) => [m.participant_a_id, m.participant_b_id].filter((x): x is string => !!x)),
      ),
    ]
    if (ids.length === 0) {
      setLiveMatchLabels({})
      return
    }
    let cancelled = false
    void fetchParticipantLabels(ids).then((map) => {
      if (!cancelled) setLiveMatchLabels(map)
    })
    return () => {
      cancelled = true
    }
  }, [liveMatches])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">
          Managing: {(organizer?.assigned_sports ?? []).map(s => getSportLabel(s as any)).join(', ') || 'All sports'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Events" value={events.length} subValue="Active + Draft" />
        <StatCard label="Live Now" value={liveMatches.length} subValue="Matches in progress" />
        <StatCard label="Pending Verif." value={pendingCount} subValue="COR + roster + medical" />
        <StatCard label="Sports" value={organizer?.assigned_sports?.length ?? 0} subValue="Assigned" />
      </div>

      {/* Live matches alert */}
      {liveMatches.length > 0 && (
        <div className="bg-[#FF3355]/10 border border-[#FF3355]/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#FF3355] animate-pulse-live" />
            <span className="font-bold text-[#FF3355] text-sm">LIVE MATCHES</span>
          </div>
          <div className="space-y-2">
            {liveMatches.map((m) => {
              const la = m.participant_a_id
                ? liveMatchLabels[m.participant_a_id] ?? `Team ${m.participant_a_id.slice(0, 6)}`
                : 'TBD'
              const lb = m.participant_b_id
                ? liveMatchLabels[m.participant_b_id] ?? `Team ${m.participant_b_id.slice(0, 6)}`
                : 'TBD'
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm min-w-0">
                    {la}{' '}
                    <span className="text-[var(--text-muted)] font-normal">vs</span> {lb}
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => navigate(`/organizer/scoring/${m.id}`)}>
                      Score Now
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}>
                      Jumbotron
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Events */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Recent Events</h2>
            <Button size="sm" variant="ghost" onClick={() => navigate('/organizer/events')}>View all →</Button>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : events.length === 0 ? (
            <p className="text-[var(--text-muted)] text-sm">No events yet</p>
          ) : (
            <div className="space-y-2">
              {events.map(e => (
                <div key={e.id} className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer hover:bg-[var(--surface-elevated)] -mx-2 px-2 rounded-lg" onClick={() => navigate(`/organizer/events/${e.id}`)}>
                  <span className="text-lg">{getSportIcon(e.sport as any)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatEnumLabel(e.format)}</p>
                  </div>
                  <Badge variant={e.status === 'in_progress' ? 'danger' : e.status === 'completed' ? 'success' : 'default'} size="sm">
                    {organizerEventStatusLabel(e.status, !!e.is_tryout)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick actions */}
        <Card>
          <h2 className="font-bold text-lg mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'New Event', icon: Trophy, action: () => setShowCreateEvent(true) },
              { label: 'Review students', icon: UserCheck, action: () => navigate('/organizer/reviews') },
              { label: 'Announcements', icon: Mic2, action: () => navigate('/organizer/announcements') },
              { label: 'Live Score', icon: Play, action: () => navigate('/organizer/events') },
            ].map(a => {
              const Icon = a.icon
              return (
                <button key={a.label} onClick={a.action} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[#0066FF]/50 hover:bg-[#0066FF]/5 transition-all">
                  <Icon className="w-6 h-6 text-[#0066FF]" />
                  <span className="text-xs font-medium">{a.label}</span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <CreateEventModal open={showCreateEvent} onClose={() => setShowCreateEvent(false)} />
    </div>
  )
}
