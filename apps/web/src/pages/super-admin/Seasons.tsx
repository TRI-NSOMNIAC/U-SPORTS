import React, { useEffect, useState } from 'react'
import { Plus, Play, Check, Archive } from 'lucide-react'
import { Button, Card, Modal, Input, Badge, Alert, Skeleton } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import api from '../../lib/api'
import type { Season } from '../../types'
import { formatDate, formatEnumLabel } from '../../lib/utils'

const STATUS_BADGE: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  active: 'success',
  completed: 'info',
  archived: 'default',
}

export default function SuperAdminSeasons() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' })
  const [error, setError] = useState('')
  const [transitionConfirm, setTransitionConfirm] = useState<{ id: string; name: string; nextStatus: string } | null>(
    null,
  )
  const [transitionBusy, setTransitionBusy] = useState(false)

  const fetch = () => supabase.from('seasons').select('*').order('created_at', { ascending: false }).then(({ data }) => { setSeasons(data ?? []); setLoading(false) })
  useEffect(() => { fetch() }, [])

  const handleCreate = async () => {
    setCreating(true); setError('')
    try {
      await api.post('/admin/seasons', form)
      setShowCreate(false); fetch()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed') }
    finally { setCreating(false) }
  }

  const applyTransition = async () => {
    if (!transitionConfirm) return
    setTransitionBusy(true)
    try {
      await api.patch(`/admin/seasons/${transitionConfirm.id}/status`, { status: transitionConfirm.nextStatus })
      setTransitionConfirm(null)
      fetch()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not update season')
      setTransitionConfirm(null)
    } finally {
      setTransitionBusy(false)
    }
  }

  const transitionDescription = (next: string) => {
    if (next === 'active')
      return 'This sets the season to active. Depending on your setup, other seasons may be adjusted automatically. Continue?'
    if (next === 'completed') return 'Mark this season as completed? Plan carefully — this affects how the season is treated as closed.'
    if (next === 'archived') return 'Archive this season? Historical records remain; the season leaves the active lifecycle.'
    return 'Apply this change?'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seasons</h1>
          <p className="text-[var(--text-muted)] text-sm">Manage the sports season lifecycle</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>New Season</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : seasons.length === 0 ? (
        <Card className="text-center py-12"><p className="text-[var(--text-muted)]">No seasons yet</p></Card>
      ) : (
        <div className="space-y-3">
          {seasons.map(s => (
            <Card key={s.id} className="flex items-center justify-between">
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatDate(s.start_date)} — {formatDate(s.end_date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_BADGE[s.status]}>{formatEnumLabel(s.status)}</Badge>
                <div className="flex gap-2">
                  {s.status === 'draft' && (
                    <Button size="sm" icon={<Play className="w-3 h-3" />} onClick={() => setTransitionConfirm({ id: s.id, name: s.name, nextStatus: 'active' })}>
                      Activate
                    </Button>
                  )}
                  {s.status === 'active' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Check className="w-3 h-3" />}
                      onClick={() => setTransitionConfirm({ id: s.id, name: s.name, nextStatus: 'completed' })}
                    >
                      Complete
                    </Button>
                  )}
                  {s.status === 'completed' && (
                    <Button size="sm" variant="ghost" icon={<Archive className="w-3 h-3" />} onClick={() => setTransitionConfirm({ id: s.id, name: s.name, nextStatus: 'archived' })}>
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={transitionConfirm !== null}
        onClose={() => {
          if (!transitionBusy) setTransitionConfirm(null)
        }}
        title="Confirm season change"
        size="md"
      >
        {transitionConfirm && (
          <div className="space-y-4">
            <Alert type="warning">
              <span className="font-medium">{transitionConfirm.name}</span>
              <span className="block mt-2 text-sm">{transitionDescription(transitionConfirm.nextStatus)}</span>
            </Alert>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTransitionConfirm(null)} disabled={transitionBusy}>
                Cancel
              </Button>
              <Button loading={transitionBusy} onClick={() => void applyTransition()}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Season">
        {error && <Alert type="danger" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Input label="Season Name" placeholder="AY 2026-2027" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} />
            <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} />
          </div>
          <Button className="w-full" loading={creating} onClick={handleCreate}>Create Season</Button>
        </div>
      </Modal>
    </div>
  )
}
