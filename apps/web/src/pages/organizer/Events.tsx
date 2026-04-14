import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Filter } from 'lucide-react'
import { Button, Card, Badge, Modal, Input, Select, TabBar, EmptyState, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Event, Season } from '../../types'
import { getSportIcon, getSportLabel, formatDate } from '../../lib/utils'

const STATUS_VARIANTS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'default', registration: 'info', in_progress: 'danger', completed: 'success', cancelled: 'default'
}

export default function OrganizerEvents() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<Event[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState('active')
  const [form, setForm] = useState({ name: '', sport: 'basketball', season_id: '', format: 'single_elim', category: '' })
  const [error, setError] = useState('')

  const fetchEvents = () => {
    api.get('/events').then(r => { setEvents(r.data); setLoading(false) })
  }

  useEffect(() => {
    fetchEvents()
    supabase.from('seasons').select('*').eq('status', 'active').then(r => setSeasons(r.data ?? []))
  }, [])

  const handleCreate = async () => {
    setCreating(true); setError('')
    try {
      const res = await api.post('/events', form)
      setShowCreate(false); fetchEvents()
      navigate(`/organizer/events/${res.data.id}`)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Create failed') }
    finally { setCreating(false) }
  }

  const filtered = events.filter(e => {
    if (tab === 'active') return ['in_progress', 'registration', 'draft'].includes(e.status)
    if (tab === 'completed') return e.status === 'completed'
    if (tab === 'cancelled') return e.status === 'cancelled'
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-[var(--text-muted)] text-sm">{events.length} total events</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>New Event</Button>
      </div>

      <TabBar
        tabs={[
          { id: 'active', label: 'Active' },
          { id: 'completed', label: 'Completed' },
          { id: 'cancelled', label: 'Cancelled' },
          { id: 'all', label: 'All' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🏆" title="No events found" description="Create your first event to get started" action={<Button onClick={() => setShowCreate(true)}>Create Event</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(e => (
            <Card key={e.id} className="cursor-pointer hover:border-white/20 transition-colors" onClick={() => navigate(`/organizer/events/${e.id}`)}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{getSportIcon(e.sport as any)}</span>
                <Badge variant={STATUS_VARIANTS[e.status]} size="sm">{e.status}</Badge>
              </div>
              <h3 className="font-bold mb-1">{e.name}</h3>
              <p className="text-xs text-[var(--text-muted)] capitalize">{e.format.replace('_', ' ')} · {getSportLabel(e.sport as any)}</p>
              {e.category && <p className="text-xs text-[var(--text-muted)] mt-1">{e.category}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Event" size="md">
        {error && <div className="text-[#FF3355] text-sm mb-4 bg-[#FF3355]/10 p-3 rounded-lg">{error}</div>}
        <div className="space-y-4">
          <Input label="Event Name" placeholder="Men's Basketball Tournament" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <Select label="Sport" value={form.sport} onChange={e => setForm(f => ({...f, sport: e.target.value}))}
            options={[
              { value: 'basketball', label: '🏀 Basketball' },
              { value: 'volleyball', label: '🏐 Volleyball' },
              { value: 'table-tennis', label: '🏓 Table Tennis' },
            ]}
          />
          <Select label="Format" value={form.format} onChange={e => setForm(f => ({...f, format: e.target.value}))}
            options={[
              { value: 'single_elim', label: 'Single Elimination' },
              { value: 'double_elim', label: 'Double Elimination' },
              { value: 'round_robin', label: 'Round Robin' },
            ]}
          />
          <Select label="Season" value={form.season_id} onChange={e => setForm(f => ({...f, season_id: e.target.value}))}
            options={[{ value: '', label: 'Select season...' }, ...seasons.map(s => ({ value: s.id, label: s.name }))]}
          />
          <Input label="Category (optional)" placeholder="Men's Open, Women's Open..." value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} />
          <Button className="w-full" loading={creating} onClick={handleCreate}>Create Event</Button>
        </div>
      </Modal>
    </div>
  )
}
