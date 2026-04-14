import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Play, Users, Trophy, Shuffle, ArrowRight, Tv2, Calendar } from 'lucide-react'
import { Button, Card, Badge, Modal, Select, Alert, TabBar, Skeleton, Table } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Event, Match, Bracket } from '../../types'
import { getSportLabel, formatDateTime } from '../../lib/utils'
import BracketView from '../../components/brackets/BracketView'

const STATUS_VARIANTS: Record<string, any> = {
  draft: 'default', registration: 'info', in_progress: 'danger', completed: 'success', cancelled: 'default'
}

export default function OrganizerEventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event & { participants: any[] } | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('bracket')
  const [generatingBracket, setGeneratingBracket] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState('')
  const [error, setError] = useState('')

  const fetchAll = async () => {
    const [evRes, mRes, bRes] = await Promise.all([
      api.get(`/events/${id}`),
      api.get(`/events/${id}/matches`),
      api.get(`/brackets/${id}`),
    ])
    setEvent(evRes.data)
    setMatches(mRes.data)
    setBrackets(bRes.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    supabase.from('teams').select('*').then(r => setTeams(r.data ?? []))
  }, [id])

  const handleAddParticipant = async () => {
    if (!selectedTeam) return
    setAddingParticipant(true); setError('')
    try {
      await api.post(`/events/${id}/participants`, { participant_id: selectedTeam, participant_type: 'team' })
      fetchAll()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed to add participant') }
    finally { setAddingParticipant(false) }
  }

  const handleGenerateBracket = async () => {
    if (!event) return
    setGeneratingBracket(true); setError('')
    try {
      const participantIds = event.participants.map((p: any) => p.participant_id)
      await api.post(`/brackets/${id}/generate`, { participantIds })
      fetchAll()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Bracket generation failed') }
    finally { setGeneratingBracket(false) }
  }

  const handleStatusChange = async (newStatus: string) => {
    await api.patch(`/events/${id}/status`, { newStatus }); fetchAll()
  }

  if (loading) return <div className="space-y-4">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16" />)}</div>
  if (!event) return <div className="text-center py-12 text-[var(--text-muted)]">Event not found</div>

  const availableTeams = teams.filter(t => t.sport === event.sport && !event.participants?.some((p: any) => p.participant_id === t.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/organizer/events')} className="text-xs text-[var(--text-muted)] hover:text-white mb-2 flex items-center gap-1">← Back to Events</button>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <p className="text-[var(--text-muted)] text-sm">{getSportLabel(event.sport as any)} · {event.format.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANTS[event.status]}>{event.status}</Badge>
          {event.status === 'draft' && <Button size="sm" onClick={() => handleStatusChange('registration')}>Open Registration</Button>}
          {event.status === 'registration' && <Button size="sm" icon={<Play className="w-3 h-3" />} onClick={() => handleStatusChange('in_progress')}>Start Event</Button>}
        </div>
      </div>

      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <TabBar
        tabs={[
          { id: 'bracket', label: 'Bracket', icon: <Trophy className="w-3.5 h-3.5" /> },
          { id: 'matches', label: `Matches (${matches.length})`, icon: <Calendar className="w-3.5 h-3.5" /> },
          { id: 'participants', label: `Teams (${event.participants?.length ?? 0})`, icon: <Users className="w-3.5 h-3.5" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'bracket' && (
        <div>
          {brackets.length === 0 ? (
            <Card className="text-center py-12">
              <Trophy className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
              <p className="font-bold mb-2">No bracket generated yet</p>
              <p className="text-[var(--text-muted)] text-sm mb-4">Add participants first, then generate the bracket.</p>
              <Button icon={<Shuffle className="w-4 h-4" />} loading={generatingBracket} onClick={handleGenerateBracket} disabled={(event.participants?.length ?? 0) < 2}>
                Generate Bracket
              </Button>
            </Card>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-[var(--text-muted)]">{brackets.length} slots · {matches.length} matches</p>
                <Button size="sm" variant="secondary" icon={<Shuffle className="w-3.5 h-3.5" />} loading={generatingBracket} onClick={handleGenerateBracket}>
                  Regenerate
                </Button>
              </div>
              <BracketView brackets={brackets} matches={matches} onMatchClick={m => navigate(`/organizer/scoring/${m.id}`)} />
            </div>
          )}
        </div>
      )}

      {tab === 'matches' && (
        <Table
          columns={[
            { key: 'teams', label: 'Match' },
            { key: 'status', label: 'Status' },
            { key: 'scheduled', label: 'Scheduled' },
            { key: 'actions', label: '' },
          ]}
          data={matches.map(m => ({
            teams: <span className="text-sm font-medium">Match {m.id.slice(0, 8)}...</span>,
            status: <Badge variant={m.status === 'live' ? 'danger' : m.status === 'completed' ? 'success' : 'default'} size="sm">{m.status}</Badge>,
            scheduled: <span className="text-xs text-[var(--text-muted)]">{m.scheduled_at ? formatDateTime(m.scheduled_at) : '—'}</span>,
            actions: (
              <div className="flex gap-2">
                {m.status !== 'completed' && (
                  <Button size="sm" icon={<Play className="w-3 h-3" />} onClick={() => navigate(`/organizer/scoring/${m.id}`)}>
                    {m.status === 'live' ? 'Resume' : 'Score'}
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={<Tv2 className="w-3 h-3" />} onClick={() => window.open(`/jumbotron/${m.id}`, '_blank')}>
                  Jumbotron
                </Button>
              </div>
            ),
          }))}
          emptyMessage="No matches yet. Generate bracket to create matches."
        />
      )}

      {tab === 'participants' && (
        <div className="space-y-4">
          {/* Add participant */}
          <Card>
            <h3 className="font-semibold mb-3">Add Team</h3>
            <div className="flex gap-3">
              <Select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                options={[{ value: '', label: 'Select a team...' }, ...availableTeams.map(t => ({ value: t.id, label: t.name }))]}
                className="flex-1"
              />
              <Button loading={addingParticipant} onClick={handleAddParticipant} disabled={!selectedTeam}>
                Add
              </Button>
            </div>
          </Card>

          {(event.participants ?? []).length === 0 ? (
            <p className="text-center text-[var(--text-muted)] py-8">No participants yet</p>
          ) : (
            <div className="space-y-2">
              {event.participants.map((p: any, i: number) => {
                const team = teams.find(t => t.id === p.participant_id)
                return (
                  <Card key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                        {p.seed ?? i + 1}
                      </span>
                      <span className="font-medium">{team?.name ?? p.participant_id.slice(0, 8)}</span>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => api.delete(`/events/${id}/participants/${p.participant_id}`).then(() => fetchAll())}>
                      Remove
                    </Button>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
