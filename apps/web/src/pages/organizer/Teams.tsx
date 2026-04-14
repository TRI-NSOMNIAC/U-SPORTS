import React, { useEffect, useState } from 'react'
import { Plus, Users, Star } from 'lucide-react'
import { Button, Card, Modal, Input, Select, Badge, EmptyState, Alert, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Team, Season } from '../../types'
import { getSportIcon, getSportLabel, getInitials } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'

export default function OrganizerTeams() {
  const { organizer } = useAuthStore()
  const [teams, setTeams] = useState<(Team & { members: any[]; coaches: any[] })[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', sport: 'basketball', season_id: '' })
  const [error, setError] = useState('')

  const fetchTeams = () => api.get('/teams').then(r => { setTeams(r.data); setLoading(false) })
  useEffect(() => {
    fetchTeams()
    supabase.from('seasons').select('*').eq('status', 'active').then(r => setSeasons(r.data ?? []))
  }, [])

  const handleCreate = async () => {
    setCreating(true); setError('')
    try {
      await api.post('/teams', form); setShowCreate(false); fetchTeams()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Create failed') }
    finally { setCreating(false) }
  }

  const handleSelfCoach = async (teamId: string, isCoach: boolean) => {
    if (isCoach) {
      await api.delete(`/teams/${teamId}/coach`)
    } else {
      await api.post(`/teams/${teamId}/coach`, {})
    }
    fetchTeams()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-[var(--text-muted)] text-sm">{teams.length} teams</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>New Team</Button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : teams.length === 0 ? (
        <EmptyState icon="🏅" title="No teams yet" description="Create teams and assign athletes to them" action={<Button onClick={() => setShowCreate(true)}>Create Team</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => {
            const isCoach = team.coaches?.some((c: any) => c.profile_id === (organizer as any)?.profile_id)
            return (
              <Card key={team.id}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xl">{getSportIcon(team.sport as any)}</span>
                    <h3 className="font-bold mt-1">{team.name}</h3>
                    <p className="text-xs text-[var(--text-muted)]">{getSportLabel(team.sport as any)}</p>
                  </div>
                  <Button size="sm" variant={isCoach ? 'success' : 'secondary'} icon={<Star className="w-3 h-3" />} onClick={() => handleSelfCoach(team.id, isCoach)}>
                    {isCoach ? 'Coaching' : 'Coach'}
                  </Button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(team.members ?? []).slice(0, 5).map((m: any) => (
                    <div key={m.athlete?.id} className="w-7 h-7 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--school-secondary)]" title={m.athlete?.profile?.full_name}>
                      {getInitials(m.athlete?.profile?.full_name ?? '?')}
                    </div>
                  ))}
                  {(team.members?.length ?? 0) > 5 && (
                    <span className="text-xs text-[var(--text-muted)] ml-1">+{team.members.length - 5} more</span>
                  )}
                  {(team.members?.length ?? 0) === 0 && <span className="text-xs text-[var(--text-muted)]">No members yet</span>}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">{team.members?.length ?? 0} players</p>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Team">
        {error && <Alert type="danger" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Input label="Team Name" placeholder="NU Bulldogs" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <Select label="Sport" value={form.sport} onChange={e => setForm(f => ({...f, sport: e.target.value}))}
            options={[
              { value: 'basketball', label: '🏀 Basketball' },
              { value: 'volleyball', label: '🏐 Volleyball' },
              { value: 'table-tennis', label: '🏓 Table Tennis' },
            ]}
          />
          <Select label="Season" value={form.season_id} onChange={e => setForm(f => ({...f, season_id: e.target.value}))}
            options={[{ value: '', label: 'Select season...' }, ...seasons.map(s => ({ value: s.id, label: s.name }))]}
          />
          <Button className="w-full" loading={creating} onClick={handleCreate}>Create Team</Button>
        </div>
      </Modal>
    </div>
  )
}
