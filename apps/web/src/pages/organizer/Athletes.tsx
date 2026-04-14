import React, { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Eye, FileText, Download, Filter } from 'lucide-react'
import { Button, Table, Badge, Modal, Textarea, Alert, TabBar, Skeleton } from '../../components/ui'
import api from '../../lib/api'
import type { Athlete } from '../../types'
import { getSportLabel, getSportIcon, formatDate } from '../../lib/utils'

type AthleteWithProfile = Athlete & { profile: { full_name: string; email: string }; docs: { document_type: string; file_url: string }[] }

const VERIFICATION_BADGE: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning', under_review: 'info' as any, approved: 'success', rejected: 'danger'
}

export default function OrganizerAthletes() {
  const [athletes, setAthletes] = useState<AthleteWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState<AthleteWithProfile | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const fetchAthletes = () => {
    setLoading(true)
    const endpoint = tab === 'pending' ? '/athletes/pending' : '/athletes'
    api.get(endpoint).then(r => { setAthletes(r.data); setLoading(false) })
  }

  useEffect(() => { fetchAthletes() }, [tab])

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selected) return
    setReviewing(true); setError('')
    try {
      await api.patch(`/athletes/${selected.id}/review`, { status, notes })
      setSelected(null); fetchAthletes()
    } catch (e: any) { setError(e.response?.data?.error ?? 'Review failed') }
    finally { setReviewing(false) }
  }

  const handleToggleSeason = async (id: string, current: string) => {
    await api.patch(`/athletes/${id}/season-status`, { season_status: current === 'active' ? 'inactive' : 'active' })
    fetchAthletes()
  }

  const handleExport = () => window.open('/api/athletes/export/csv', '_blank')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Athletes</h1>
          <p className="text-[var(--text-muted)] text-sm">{athletes.length} {tab === 'pending' ? 'pending verifications' : 'athletes'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExport}>Export CSV</Button>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'pending', label: '⏳ Pending Review' },
          { id: 'all', label: 'All Athletes' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <Table
        loading={loading}
        columns={[
          { key: 'name', label: 'Athlete' },
          { key: 'sport', label: 'Sport' },
          { key: 'student_id', label: 'Student ID' },
          { key: 'year', label: 'Year' },
          { key: 'verification', label: 'Verification' },
          { key: 'season', label: 'Season' },
          { key: 'actions', label: '' },
        ]}
        data={athletes.map(a => ({
          name: (
            <div>
              <p className="font-medium">{a.profile?.full_name}</p>
              <p className="text-xs text-[var(--text-muted)]">{a.profile?.email}</p>
            </div>
          ),
          sport: <span>{getSportIcon(a.sport as any)} {getSportLabel(a.sport as any)}</span>,
          student_id: <code className="text-xs">{a.student_id}</code>,
          year: <span className="text-sm">{a.year_level}</span>,
          verification: <Badge variant={VERIFICATION_BADGE[a.verification_status]}>{a.verification_status}</Badge>,
          season: <Badge variant={a.season_status === 'active' ? 'success' : 'default'} size="sm">{a.season_status}</Badge>,
          actions: (
            <div className="flex gap-1">
              {(a.verification_status === 'pending' || a.verification_status === 'under_review') && (
                <Button size="sm" variant="ghost" icon={<Eye className="w-3 h-3" />} onClick={() => setSelected(a)}>Review</Button>
              )}
              {a.verification_status === 'approved' && (
                <Button size="sm" variant="ghost" onClick={() => handleToggleSeason(a.id, a.season_status)}>
                  {a.season_status === 'active' ? 'Deactivate' : 'Reactivate'}
                </Button>
              )}
            </div>
          ),
        }))}
        emptyMessage={tab === 'pending' ? 'No pending verifications' : 'No athletes found'}
      />

      {/* Review modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Review Athlete Application" size="lg">
        {selected && (
          <div className="space-y-4">
            {error && <Alert type="danger">{error}</Alert>}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[var(--text-muted)] text-xs">Name</p>
                <p className="font-medium">{selected.profile?.full_name}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)] text-xs">Email</p>
                <p>{selected.profile?.email}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)] text-xs">Student ID</p>
                <p>{selected.student_id}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)] text-xs">Sport / Position</p>
                <p>{getSportLabel(selected.sport as any)} · {selected.position}</p>
              </div>
            </div>

            {/* Documents */}
            {selected.docs && selected.docs.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Verification Documents</p>
                <div className="flex gap-3">
                  {selected.docs.map(doc => (
                    <a key={doc.document_type} href={doc.file_url} target="_blank" rel="noopener"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[#0066FF] text-sm transition-colors">
                      <FileText className="w-4 h-4 text-[#0066FF]" />
                      {doc.document_type === 'cor' ? 'COR' : 'Medical Cert'}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <Textarea label="Review Notes (optional)" placeholder="Reason for rejection or additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />

            <div className="flex gap-3">
              <Button variant="danger" icon={<XCircle className="w-4 h-4" />} loading={reviewing} onClick={() => handleReview('rejected')}>Reject</Button>
              <div className="flex-1" />
              <Button variant="success" icon={<CheckCircle className="w-4 h-4" />} loading={reviewing} onClick={() => handleReview('approved')}>Approve</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
