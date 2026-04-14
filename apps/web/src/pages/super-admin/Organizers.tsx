import React, { useEffect, useState } from 'react'
import { Plus, ToggleLeft, ToggleRight, Mail } from 'lucide-react'
import { Button, Card, Modal, Input, Badge, Table, Alert, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import type { Organizer, Profile } from '../../types'
import { getSportLabel, getSportIcon } from '../../lib/utils'

type OrganizerWithProfile = Organizer & { profile: Profile }

export default function SuperAdminOrganizers() {
  const [organizers, setOrganizers] = useState<OrganizerWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteSports, setInviteSports] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchOrganizers = () => {
    api.get('/admin/organizers').then(r => { setOrganizers(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchOrganizers() }, [])

  const handleInvite = async () => {
    setInviting(true); setError('')
    try {
      await api.post('/admin/organizers/invite', { email: inviteEmail, full_name: inviteName, assigned_sports: inviteSports })
      setSuccess(`Invitation sent to ${inviteEmail}`)
      setShowInvite(false)
      fetchOrganizers()
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Invite failed')
    } finally { setInviting(false) }
  }

  const toggleActive = async (id: string) => {
    await api.patch(`/admin/organizers/${id}/toggle`)
    fetchOrganizers()
  }

  const SPORTS = ['basketball', 'volleyball', 'table-tennis']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizers</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Manage platform staff and their sport assignments</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowInvite(true)}>Invite Organizer</Button>
      </div>

      {success && <Alert type="success" onDismiss={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <div className="space-y-2">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'sports', label: 'Sports' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: '' },
          ]}
          data={organizers.map(o => ({
            name: <span className="font-medium">{o.profile?.full_name}</span>,
            email: <span className="text-[var(--text-muted)] text-xs">{o.profile?.email}</span>,
            sports: (
              <div className="flex gap-1 flex-wrap">
                {(o.assigned_sports ?? []).map(s => (
                  <Badge key={s} variant="info" size="sm">{getSportIcon(s as any)} {getSportLabel(s as any)}</Badge>
                ))}
              </div>
            ),
            status: <Badge variant={o.is_active ? 'success' : 'default'}>{o.is_active ? 'Active' : 'Inactive'}</Badge>,
            actions: (
              <Button size="sm" variant="ghost" icon={o.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />} onClick={() => toggleActive(o.id)}>
                {o.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            ),
          }))}
          emptyMessage="No organizers yet. Invite one to get started."
        />
      )}

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Organizer">
        {error && <Alert type="danger" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Input label="Full Name" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Juan dela Cruz" />
          <Input label="Email" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="admin@nu-dasma.edu.ph" icon={<Mail className="w-4 h-4" />} />
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">Assign Sports</label>
            <div className="space-y-2">
              {SPORTS.map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={inviteSports.includes(s)} onChange={e => setInviteSports(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))} className="accent-[#0066FF]" />
                  <span className="text-sm">{getSportIcon(s as any)} {getSportLabel(s as any)}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full" loading={inviting} onClick={handleInvite}>Send Invitation</Button>
        </div>
      </Modal>
    </div>
  )
}
