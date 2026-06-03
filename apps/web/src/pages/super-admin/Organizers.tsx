import React, { useEffect, useState } from 'react'
import { Plus, ToggleLeft, ToggleRight, Mail, Lock } from 'lucide-react'
import { Button, Modal, Input, Badge, Table, Alert, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import type { Organizer, Profile } from '../../types'
import { getSportLabel, getSportIcon } from '../../lib/utils'
import { createOrganizerFormSchema } from '../../lib/validation/forms'

type OrganizerWithProfile = Organizer & { profile: Profile }

export default function SuperAdminOrganizers() {
  const [organizers, setOrganizers] = useState<OrganizerWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addConfirmPassword, setAddConfirmPassword] = useState('')
  const [addSports, setAddSports] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [organizerListError, setOrganizerListError] = useState('')
  const [toggleConfirm, setToggleConfirm] = useState<OrganizerWithProfile | null>(null)
  const [toggleBusy, setToggleBusy] = useState(false)

  const fetchOrganizers = () => {
    api.get('/admin/organizers').then(r => { setOrganizers(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { fetchOrganizers() }, [])

  const handleAddOrganizer = async () => {
    setAdding(true)
    setError('')
    const parsed = createOrganizerFormSchema.safeParse({
      full_name: addName,
      email: addEmail,
      password: addPassword,
      confirmPassword: addConfirmPassword,
      assigned_sports: addSports,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the form')
      setAdding(false)
      return
    }
    try {
      await api.post('/admin/organizers', {
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        password: parsed.data.password,
        assigned_sports: parsed.data.assigned_sports,
      })
      setSuccess(
        `Account created for ${parsed.data.email}. Share the sign-in page and password with them securely.`,
      )
      setAddEmail('')
      setAddName('')
      setAddPassword('')
      setAddConfirmPassword('')
      setAddSports([])
      setShowAdd(false)
      fetchOrganizers()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not create organizer')
    } finally {
      setAdding(false)
    }
  }

  const confirmToggleActive = async () => {
    if (!toggleConfirm) return
    setToggleBusy(true)
    try {
      await api.patch(`/admin/organizers/${toggleConfirm.id}/toggle`)
      setToggleConfirm(null)
      setOrganizerListError('')
      fetchOrganizers()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setOrganizerListError(msg ?? 'Could not update organizer')
      setToggleConfirm(null)
    } finally {
      setToggleBusy(false)
    }
  }

  const SPORTS = ['basketball', 'volleyball', 'table-tennis']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizers</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">Manage platform staff and their sport assignments</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setError(''); setShowAdd(true) }}>
          Add organizer
        </Button>
      </div>

      {success && <Alert type="success" onDismiss={() => setSuccess('')}>{success}</Alert>}
      {organizerListError && <Alert type="danger" onDismiss={() => setOrganizerListError('')}>{organizerListError}</Alert>}

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
              <Button
                size="sm"
                variant="ghost"
                icon={o.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                onClick={() => setToggleConfirm(o)}
              >
                {o.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            ),
          }))}
          emptyMessage="No organizers yet. Add one to get started."
        />
      )}

      <Modal
        open={toggleConfirm !== null}
        onClose={() => {
          if (!toggleBusy) setToggleConfirm(null)
        }}
        title={toggleConfirm?.is_active ? 'Deactivate organizer?' : 'Activate organizer?'}
        size="md"
      >
        {toggleConfirm && (
          <div className="space-y-4">
            <Alert type={toggleConfirm.is_active ? 'warning' : 'info'}>
              {toggleConfirm.is_active ? (
                <>
                  <strong>{toggleConfirm.profile?.full_name}</strong> will be signed out on all devices and blocked from the organizer API until
                  activated again.
                </>
              ) : (
                <>
                  Restore access for <strong>{toggleConfirm.profile?.full_name}</strong>? They can sign in again as an organizer.
                </>
              )}
            </Alert>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setToggleConfirm(null)} disabled={toggleBusy}>
                Cancel
              </Button>
              <Button variant={toggleConfirm.is_active ? 'danger' : 'success'} loading={toggleBusy} onClick={() => void confirmToggleActive()}>
                {toggleConfirm.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError('') }} title="Add organizer">
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Creates their login immediately. No email is sent — give them the password yourself (e.g. in person or a trusted channel).
        </p>
        {error && <Alert type="danger" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Input label="Full name" value={addName} onChange={e => setAddName(e.target.value)} placeholder="Organizer name" />
          <Input
            label="Email"
            type="email"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            placeholder="organizer@staff.domain.edu"
            icon={<Mail className="w-4 h-4" />}
          />
          <Input
            label="Temporary password"
            type="password"
            value={addPassword}
            onChange={e => setAddPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            icon={<Lock className="w-4 h-4" />}
          />
          <Input
            label="Confirm password"
            type="password"
            value={addConfirmPassword}
            onChange={e => setAddConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            icon={<Lock className="w-4 h-4" />}
          />
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">Assign sports</label>
            <div className="space-y-2">
              {SPORTS.map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addSports.includes(s)}
                    onChange={e =>
                      setAddSports(prev => (e.target.checked ? [...prev, s] : prev.filter(x => x !== s)))
                    }
                    className="accent-[#0066FF]"
                  />
                  <span className="text-sm">{getSportIcon(s as any)} {getSportLabel(s as any)}</span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full" loading={adding} onClick={handleAddOrganizer}>
            Create account
          </Button>
        </div>
      </Modal>
    </div>
  )
}
