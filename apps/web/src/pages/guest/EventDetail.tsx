import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Tv2, Play } from 'lucide-react'
import { Card, Badge, Button, Skeleton, TabBar } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import api from '../../lib/api'
import { getSportLabel, getSportIcon, formatDateTime } from '../../lib/utils'
import BracketView from '../../components/brackets/BracketView'
import type { Event, Bracket, Match } from '../../types'

export default function GuestEventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event | null>(null)
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('bracket')

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get(`/events/${id}`),
      api.get(`/brackets/${id}`),
      api.get(`/events/${id}/matches`),
    ]).then(([ev, br, mt]) => {
      setEvent(ev.data)
      setBrackets(br.data)
      setMatches(mt.data)
    }).finally(() => setLoading(false))

    // Real-time updates
    const channel = supabase.channel(`event-detail-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'brackets', filter: `event_id=eq.${id}` }, () => api.get(`/brackets/${id}`).then(r => setBrackets(r.data)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_scores' }, () => api.get(`/events/${id}/matches`).then(r => setMatches(r.data)))
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [id])

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!event) return <div className="text-center py-12 text-[var(--text-muted)]">Event not found</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <button onClick={() => navigate('/guest/events')} className="text-xs text-[var(--text-muted)] hover:text-white">← Back to Events</button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{getSportIcon(event.sport as any)}</span>
            <h1 className="text-2xl font-bold">{event.name}</h1>
          </div>
          <p className="text-[var(--text-muted)] text-sm capitalize">{getSportLabel(event.sport as any)} · {event.format?.replace('_', ' ')}</p>
        </div>
        <Badge variant={event.status === 'in_progress' ? 'danger' : event.status === 'completed' ? 'success' : 'default'}>
          {event.status}
        </Badge>
      </div>

      <TabBar tabs={[{ id: 'bracket', label: 'Bracket' }, { id: 'matches', label: `Matches (${matches.length})` }]} active={tab} onChange={setTab} />

      {tab === 'bracket' && <BracketView brackets={brackets} matches={matches} readonly />}

      {tab === 'matches' && (
        <div className="space-y-3">
          {matches.map(m => (
            <Card key={m.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Match {m.id.slice(0, 8)}...</p>
                {m.scheduled_at && <p className="text-xs text-[var(--text-muted)]">{formatDateTime(m.scheduled_at)}{m.venue ? ` · ${m.venue}` : ''}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.status === 'live' ? 'danger' : m.status === 'completed' ? 'success' : 'default'} size="sm">
                  {m.status === 'live' ? '● LIVE' : m.status}
                </Badge>
                {m.status === 'live' && (
                  <Button size="sm" icon={<Tv2 className="w-3.5 h-3.5" />} onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}>
                    Watch
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {matches.length === 0 && <p className="text-center text-[var(--text-muted)] py-8">No matches yet</p>}
        </div>
      )}
    </div>
  )
}
