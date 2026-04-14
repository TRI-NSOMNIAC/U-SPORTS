import React, { useEffect, useState } from 'react'
import { Plus, Bell, AlertTriangle, Calendar, Info, Trash2 } from 'lucide-react'
import { Button, Card, Modal, Input, Textarea, Select, Badge, Alert, EmptyState } from '../../components/ui'
import api from '../../lib/api'
import type { Announcement } from '../../types'
import { formatDateTime } from '../../lib/utils'

const TYPE_ICONS: Record<string, any> = {
  emergency: AlertTriangle, reschedule: Calendar, reminder: Bell, system: Info
}

const URGENCY_VARIANTS: Record<string, any> = {
  critical: 'danger', high: 'warning', normal: 'default', low: 'default'
}

export default function OrganizerAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: 'reminder',
    title: '',
    body: '',
    urgency: 'normal',
    audience_type: 'all',
    audience_id: '',
    is_public: false,
    new_scheduled_at: '',
    new_venue: '',
    expires_at: '',
  })

  const fetchAnnouncements = () => api.get('/announcements').then(r => { setAnnouncements(r.data); setLoading(false) })
  useEffect(() => { fetchAnnouncements() }, [])

  const handleCreate = async () => {
    setCreating(true); setError('')
    try {
      await api.post('/announcements', {
        ...form,
        new_scheduled_at: form.new_scheduled_at || undefined,
        expires_at: form.expires_at || undefined,
        audience_id: form.audience_id || undefined,
      })
      setShowCreate(false)
      fetchAnnouncements()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Create failed') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/announcements/${id}`)
    fetchAnnouncements()
  }

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-[var(--text-muted)] text-sm">Broadcast messages to athletes and the public</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>New Announcement</Button>
      </div>

      {loading ? null : announcements.length === 0 ? (
        <EmptyState icon="📢" title="No announcements yet" description="Create your first announcement" action={<Button onClick={() => setShowCreate(true)}>Create Announcement</Button>} />
      ) : (
        <div className="space-y-3">
          {announcements.map(a => {
            const Icon = TYPE_ICONS[a.type] ?? Bell
            return (
              <Card key={a.id} className="flex gap-4">
                <div className={`p-2 rounded-lg flex-shrink-0 ${a.urgency === 'critical' ? 'bg-[#FF3355]/15' : a.urgency === 'high' ? 'bg-[#FFB800]/15' : 'bg-[var(--surface-elevated)]'}`}>
                  <Icon className={`w-5 h-5 ${a.urgency === 'critical' ? 'text-[#FF3355]' : a.urgency === 'high' ? 'text-[#FFB800]' : 'text-[var(--text-muted)]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{a.title}</span>
                    <Badge variant={URGENCY_VARIANTS[a.urgency]} size="sm">{a.urgency}</Badge>
                    <Badge size="sm">{a.type}</Badge>
                    {a.is_public && <Badge variant="info" size="sm">public</Badge>}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] line-clamp-2">{a.body}</p>
                  {a.new_scheduled_at && (
                    <p className="text-xs text-[#FFB800] mt-1">New time: {formatDateTime(a.new_scheduled_at)}{a.new_venue ? ` · ${a.new_venue}` : ''}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">{formatDateTime(a.published_at)} · {a.audience_type} audience</p>
                </div>
                <button onClick={() => handleDelete(a.id)} className="text-[var(--text-muted)] hover:text-[#FF3355] transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Announcement" size="lg">
        {error && <Alert type="danger" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" value={form.type} onChange={e => update('type', e.target.value)} options={[
              { value: 'emergency', label: '🚨 Emergency' },
              { value: 'reschedule', label: '📅 Reschedule' },
              { value: 'reminder', label: '🔔 Reminder' },
              { value: 'system', label: 'ℹ️ System' },
            ]} />
            <Select label="Urgency" value={form.urgency} onChange={e => update('urgency', e.target.value)} options={[
              { value: 'critical', label: '🔴 Critical' },
              { value: 'high', label: '🟡 High' },
              { value: 'normal', label: '🟢 Normal' },
              { value: 'low', label: '⚪ Low' },
            ]} />
          </div>
          <Input label="Title" value={form.title} onChange={e => update('title', e.target.value)} placeholder="Match postponed" />
          <Textarea label="Message Body" value={form.body} onChange={e => update('body', e.target.value)} placeholder="Due to weather conditions..." rows={3} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Audience" value={form.audience_type} onChange={e => update('audience_type', e.target.value)} options={[
              { value: 'all', label: 'All Athletes' },
              { value: 'sport', label: 'By Sport' },
              { value: 'event', label: 'By Event' },
              { value: 'team', label: 'By Team' },
            ]} />
            <Input label="Expires" type="datetime-local" value={form.expires_at} onChange={e => update('expires_at', e.target.value)} hint="Leave empty for permanent" />
          </div>
          {form.type === 'reschedule' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="New Date/Time" type="datetime-local" value={form.new_scheduled_at} onChange={e => update('new_scheduled_at', e.target.value)} />
              <Input label="New Venue" value={form.new_venue} onChange={e => update('new_venue', e.target.value)} placeholder="Court 2, Gym B..." />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_public} onChange={e => update('is_public', e.target.checked)} className="accent-[#0066FF]" />
            <span className="text-sm">Visible to guests (public)</span>
          </label>
          <Button className="w-full" loading={creating} onClick={handleCreate}>Publish Announcement</Button>
        </div>
      </Modal>
    </div>
  )
}
