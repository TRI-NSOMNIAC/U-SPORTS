import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { getSportIcon, getSportLabel } from '../../lib/utils'
import type { Event } from '../../types'

export default function GuestEvents() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('events').select('*, season:seasons(name)').order('created_at', { ascending: false }).then(r => {
      setEvents(r.data ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Events</h1>
        <p className="text-[var(--text-muted)] text-sm">{events.length} events this season</p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon="🏆" title="No events yet" description="Events will appear here once the season starts" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(e => (
            <Card key={e.id} className="cursor-pointer hover:border-white/20 transition-colors" onClick={() => navigate(`/guest/events/${e.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{getSportIcon(e.sport as any)}</span>
                <Badge variant={e.status === 'in_progress' ? 'danger' : e.status === 'completed' ? 'success' : 'default'} size="sm">{e.status}</Badge>
              </div>
              <h3 className="font-bold">{e.name}</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1 capitalize">{getSportLabel(e.sport as any)} · {e.format?.replace('_', ' ')}</p>
              {(e as any).season && <p className="text-xs text-[var(--text-muted)] mt-1">{(e as any).season.name}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
