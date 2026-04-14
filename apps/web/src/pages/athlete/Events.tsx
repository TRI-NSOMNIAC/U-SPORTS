import React, { useEffect, useState } from 'react'
import { Card, Badge, Skeleton, EmptyState } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, formatDate } from '../../lib/utils'

export default function AthleteEvents() {
  const { athlete } = useAuthStore()
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!athlete) return
    // Find team_members for this athlete, then matches for their teams
    supabase
      .from('team_members')
      .select('team_id, team:teams(id, name, sport, events:event_participants(event:events(*)))')
      .eq('athlete_id', athlete.id)
      .then(({ data }) => {
        const allMatches: any[] = []
        ;(data ?? []).forEach((tm: any) => {
          tm.team?.events?.forEach((ep: any) => {
            if (ep.event) allMatches.push({ ...ep.event, teamName: tm.team?.name })
          })
        })
        setMatches(allMatches)
        setLoading(false)
      })
  }, [athlete])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Events</h1>
        <p className="text-[var(--text-muted)] text-sm">Events you're participating in</p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : matches.length === 0 ? (
        <EmptyState icon="📅" title="No events yet" description="You haven't been added to any events. Check with your organizer." />
      ) : (
        <div className="space-y-3">
          {matches.map(e => (
            <Card key={e.id} className="flex items-center gap-4">
              <span className="text-3xl">{getSportIcon(e.sport as any)}</span>
              <div className="flex-1">
                <h3 className="font-bold">{e.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">{getSportLabel(e.sport as any)} · {e.teamName}</p>
              </div>
              <Badge variant={e.status === 'in_progress' ? 'danger' : e.status === 'completed' ? 'success' : 'default'}>
                {e.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
