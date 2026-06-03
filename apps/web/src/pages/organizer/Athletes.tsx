import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CheckCircle, XCircle, Eye, FileText, Download, RefreshCw, Search, ArrowLeft } from 'lucide-react'
import { Button, Table, Badge, Modal, Textarea, Alert, TabBar, Input, Select } from '../../components/ui'
import api from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { VerificationDocumentPreviewModal } from '../../components/verification/VerificationDocumentPreviewModal'
import type { Athlete, Sport } from '../../types'
import { getSportLabel, getSportIcon, formatEnumLabel, cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'

type AthleteWithProfile = Athlete & {
  profile: { full_name: string; email: string }
  docs: { document_type: string; file_url: string }[]
}

const VERIFICATION_BADGE: Record<string, 'default' | 'warning' | 'success' | 'danger' | 'info'> = {
  pending: 'warning',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
}

type RosterTab = 'med_cert_queue' | 'awaiting_medical' | 'cleared'

const SPORT_FILTER_OPTIONS: { value: Sport | ''; label: string }[] = [
  { value: '', label: 'All sports' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'volleyball', label: 'Volleyball' },
  { value: 'table-tennis', label: 'Table tennis' },
]

function describeApiLoadError(err: unknown): string {
  const base =
    'Make sure the API is running from the repo root: `pnpm dev` or `pnpm dev:server` (default http://localhost:3001).'
  if (err && typeof err === 'object' && 'response' in err) {
    const r = err as { response?: { status?: number; data?: { error?: string } } }
    const status = r.response?.status
    const msg = r.response?.data?.error
    if (status && msg) return `${msg} (HTTP ${status}).`
    if (status) return `Request failed with HTTP ${status}. ${base}`
  }
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ECONNABORTED') {
    return `Request timed out. ${base}`
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = String((err as { message?: string }).message ?? '')
    if (/Network Error|ECONNREFUSED|Failed to fetch/i.test(m)) {
      return `Cannot reach the API (network). ${base} If you use a custom URL, set VITE_API_URL in apps/web.`
    }
  }
  return `Could not load this list. ${base}`
}

export default function OrganizerAthletes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [athletes, setAthletes] = useState<AthleteWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<RosterTab>('med_cert_queue')
  const [selected, setSelected] = useState<AthleteWithProfile | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'request_resubmit' | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const [detailModal, setDetailModal] = useState<'medical' | 'roster' | null>(null)
  const [sportPositions, setSportPositions] = useState<string[]>([])
  const [rosterPosition, setRosterPosition] = useState('')
  const [rosterJersey, setRosterJersey] = useState('')
  const [rosterSaving, setRosterSaving] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [rosterSaveSuccess, setRosterSaveSuccess] = useState(false)
  const [listSearch, setListSearch] = useState('')
  const [sportFilter, setSportFilter] = useState<Sport | ''>('')
  const [verificationPreview, setVerificationPreview] = useState<{ fileUrl: string } | null>(null)
  const { profile } = useAuthStore()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [resetSeasonOpen, setResetSeasonOpen] = useState(false)
  const [resetSeasonBusy, setResetSeasonBusy] = useState(false)
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'revoke_clearance' | 'set_inactive' | null>(null)
  const [seasonToggleConfirm, setSeasonToggleConfirm] = useState<{ id: string; name: string; nextInactive: boolean } | null>(
    null,
  )
  const [medicalRowConfirm, setMedicalRowConfirm] = useState<{ id: string; name: string; grant: boolean } | null>(null)
  const [medCertConfirmAction, setMedCertConfirmAction] = useState<'approve' | 'reject' | 'request_resubmit' | null>(null)

  const fetchAthletes = () => {
    setLoading(true)
    setLoadMessage('')
    // Med cert queue: approved athletes who uploaded a medical cert but are not yet cleared
    const chain =
      tab === 'med_cert_queue'
        ? api.get<AthleteWithProfile[]>('/athletes', {
            params: { medical_clearance_queue: 'true', has_med_cert: 'true' },
          })
        : tab === 'awaiting_medical'
          ? api.get<AthleteWithProfile[]>('/athletes', {
              params: { medical_clearance_queue: 'true' },
            })
          : api.get<AthleteWithProfile[]>('/athletes', {
              params: { verification_status: 'approved', medical_cleared: 'true' },
            })

    chain
      .then((r) => setAthletes(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        setAthletes([])
        setLoadMessage(describeApiLoadError(e))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAthletes()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when tab changes
  }, [tab])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [tab])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'med_cert_queue' || t === 'awaiting_medical' || t === 'cleared') setTab(t)
  }, [searchParams])

  useEffect(() => {
    if (!selected || !detailModal) return
    setRosterPosition(selected.position?.trim() ?? '')
    setRosterJersey(selected.jersey_number ?? '')
    setRosterError('')
    void supabase
      .from('sports_config')
      .select('positions')
      .eq('slug', selected.sport)
      .maybeSingle()
      .then(({ data }) => {
        const raw = data?.positions as unknown
        let opts: string[] = []
        if (Array.isArray(raw)) {
          opts = raw.filter((x): x is string => typeof x === 'string')
        } else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw) as unknown
            if (Array.isArray(parsed)) opts = parsed.filter((x): x is string => typeof x === 'string')
          } catch {
            /* ignore malformed JSON */
          }
        }
        setSportPositions(opts)
      })
  }, [selected, detailModal])

  useEffect(() => {
    if (!rosterSaveSuccess) return
    const t = window.setTimeout(() => setRosterSaveSuccess(false), 4000)
    return () => window.clearTimeout(t)
  }, [rosterSaveSuccess])

  const filteredAthletes = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    return athletes.filter((a) => {
      if (sportFilter && a.sport !== sportFilter) return false
      if (!q) return true
      const name = (a.profile?.full_name ?? '').toLowerCase()
      const email = (a.profile?.email ?? '').toLowerCase()
      const sid = (a.student_id ?? '').toLowerCase()
      const dept = (a.department ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || sid.includes(q) || dept.includes(q)
    })
  }, [athletes, listSearch, sportFilter])

  const listFiltersActive = listSearch.trim() !== '' || sportFilter !== ''

  const clearedFilteredIds = tab === 'cleared' ? filteredAthletes.map((a) => a.id) : []
  const allClearedVisibleSelected =
    clearedFilteredIds.length > 0 && clearedFilteredIds.every((id) => selectedIds.has(id))

  const toggleAthleteSelected = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleSelectAllCleared = () => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (allClearedVisibleSelected) {
        clearedFilteredIds.forEach((id) => n.delete(id))
      } else {
        clearedFilteredIds.forEach((id) => n.add(id))
      }
      return n
    })
  }

  const runBulkAthletes = async (action: 'revoke_clearance' | 'set_inactive' | 'set_active'): Promise<boolean> => {
    const ids = [...selectedIds]
    if (ids.length === 0) return false
    setBulkBusy(true)
    setLoadMessage('')
    try {
      await api.patch('/athletes/bulk', { ids, action })
      setSelectedIds(new Set())
      fetchAthletes()
      return true
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Bulk action failed')
      return false
    } finally {
      setBulkBusy(false)
    }
  }

  const confirmBulkAthletes = async () => {
    if (!bulkConfirmAction) return
    const ok = await runBulkAthletes(bulkConfirmAction)
    if (ok) setBulkConfirmAction(null)
  }

  const confirmSeasonToggle = async () => {
    if (!seasonToggleConfirm) return
    setLoadMessage('')
    try {
      await api.patch(`/athletes/${seasonToggleConfirm.id}/season-status`, {
        season_status: seasonToggleConfirm.nextInactive ? 'inactive' : 'active',
      })
      setSeasonToggleConfirm(null)
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Could not update season status')
    }
  }

  const confirmMedicalRow = async () => {
    if (!medicalRowConfirm) return
    await handleMedicalClear(medicalRowConfirm.id, medicalRowConfirm.grant)
    setMedicalRowConfirm(null)
  }

  const runResetSeasonClearance = async () => {
    setResetSeasonBusy(true)
    setLoadMessage('')
    try {
      await api.post('/athletes/reset-season-clearance', {})
      setResetSeasonOpen(false)
      setSelectedIds(new Set())
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Could not reset season clearance')
    } finally {
      setResetSeasonBusy(false)
    }
  }

  const saveRosterDetails = async () => {
    if (!selected) return
    setRosterSaving(true)
    setRosterError('')
    setRosterSaveSuccess(false)
    try {
      const hasPositionPicker = sportPositions.length > 0
      const payload: { position?: string; jersey_number?: string | null } = {
        jersey_number: rosterJersey.trim() ? rosterJersey.trim() : null,
      }
      if (hasPositionPicker) payload.position = rosterPosition.trim()

      await api.patch(`/athletes/${selected.id}/roster-details`, payload)
      setAthletes((prev) =>
        prev.map((x) =>
          x.id === selected.id
            ? {
                ...x,
                ...(hasPositionPicker ? { position: rosterPosition.trim() } : {}),
                jersey_number: rosterJersey.trim() || null,
              }
            : x
        )
      )
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              ...(hasPositionPicker ? { position: rosterPosition.trim() } : {}),
              jersey_number: rosterJersey.trim() || null,
            }
          : null
      )
      setRosterSaveSuccess(true)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setRosterError(msg ?? 'Could not save roster')
    } finally {
      setRosterSaving(false)
    }
  }

  const handleMedCertReview = async (action: 'approve' | 'reject' | 'request_resubmit') => {
    if (!selected) return
    setMedCertConfirmAction(null)
    setReviewing(true)
    setReviewAction(action)
    setError('')
    try {
      if (action === 'approve') {
        await api.patch(`/athletes/${selected.id}/medical-clearance`, { medical_cleared: true })
      } else if (action === 'reject') {
        // Mark not cleared and add review notes via the review endpoint
        await api.patch(`/athletes/${selected.id}/medical-clearance`, { medical_cleared: false })
        if (notes.trim()) {
          await api.patch(`/athletes/${selected.id}/review`, {
            status: selected.verification_status,
            notes: `Medical cert rejected: ${notes.trim()}`,
          })
        }
      } else {
        // Request resubmit: keep clearance false, notify via review notes
        await api.patch(`/athletes/${selected.id}/review`, {
          status: selected.verification_status,
          notes: `Medical certificate resubmission requested: ${notes.trim() || 'Please upload a valid medical certificate.'}`,
        })
      }
      setSelected(null)
      setDetailModal(null)
      setNotes('')
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Action failed')
    } finally {
      setReviewing(false)
      setReviewAction(null)
    }
  }

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selected) return
    setReviewing(true)
    setError('')
    try {
      await api.patch(`/athletes/${selected.id}/review`, { status, notes })
      setSelected(null)
      setDetailModal(null)
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Review failed')
    } finally {
      setReviewing(false)
    }
  }

  const handleMedicalClear = async (id: string, cleared: boolean) => {
    setLoadMessage('')
    try {
      await api.patch(`/athletes/${id}/medical-clearance`, { medical_cleared: cleared })
      fetchAthletes()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setLoadMessage(msg ?? 'Could not update medical clearance')
    }
  }

  const csvEscape = (value: string | number | boolean | null | undefined) => {
    const s = value == null ? '' : String(value)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const handleExport = () => {
    const includeSeason = tab !== 'document_queue'
    const rosterLabel =
      tab === 'cleared' ? 'Clears official competition' : tab === 'awaiting_medical' ? 'Tryout matches only until medical OK' : ''

    const headers = [
      'full_name',
      'email',
      'sport',
      'student_id',
      'year_level',
      'department',
      ...(tab === 'document_queue' ? (['verification_status'] as const) : (['competition_stage'] as const)),
      'medical_cleared',
      ...(includeSeason ? (['season_status'] as const) : []),
      'position',
      'jersey_number',
    ]
    const rows = filteredAthletes.map((a) =>
      [
        a.profile?.full_name ?? '',
        a.profile?.email ?? '',
        getSportLabel(a.sport as any),
        a.student_id,
        a.year_level,
        a.department,
        ...(tab === 'document_queue' ? [a.verification_status] : [rosterLabel]),
        a.medical_cleared ? 'yes' : 'no',
        ...(includeSeason ? [a.season_status] : []),
        a.position,
        a.jersey_number ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
    const csv = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `athletes-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const showMedical = tab !== 'med_cert_queue'
  const showSeason = tab !== 'med_cert_queue'

  const subtitle =
    tab === 'med_cert_queue'
      ? 'athletes with a medical certificate uploaded — awaiting your review'
      : tab === 'awaiting_medical'
        ? 'approved athletes pending medical clearance for official games'
        : 'medically cleared for official competition roster'

  const emptyMessage =
    tab === 'med_cert_queue'
      ? 'No medical certificates waiting for review. Athletes will appear here once they upload their certificate from their profile.'
      : tab === 'awaiting_medical'
        ? 'Nobody is waiting on medical clearance. Athletes appear here once approved for tryouts.'
        : 'No medically cleared athletes yet. Approve a certificate in the Medical certificate review tab.'

  const tableEmptyMessage =
    athletes.length > 0 && filteredAthletes.length === 0
      ? 'No athletes match your search or sport filter. Try different keywords or reset filters.'
      : emptyMessage

  const columns = [
    ...(tab === 'cleared'
      ? ([
          {
            key: 'select',
            label: (
              <span className="inline-flex items-center gap-2 normal-case tracking-normal font-medium text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
                  checked={allClearedVisibleSelected}
                  onChange={toggleSelectAllCleared}
                  aria-label="Select all visible athletes"
                />
              </span>
            ),
            width: '2.75rem',
          },
        ] as { key: string; label: React.ReactNode; width?: string }[])
      : []),
    { key: 'name', label: 'Athlete' },
    { key: 'sport', label: 'Sport' },
    { key: 'student_id', label: 'Student ID' },
    { key: 'year', label: 'Year' },
    {
      key: 'roster_stage',
      label: tab === 'med_cert_queue' ? 'Certificate' : 'Competition',
    },
    ...(showMedical ? ([{ key: 'medical' as const, label: 'Medical' }] as const) : []),
    ...(showSeason ? ([{ key: 'season' as const, label: 'Season' }] as const) : []),
    { key: 'actions', label: '' },
  ]

  return (
    <div className={cn('space-y-6', tab === 'cleared' && selectedIds.size > 0 && 'pb-24')}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/organizer/reviews')}
            className="text-[var(--text-muted)] hover:text-white p-1 rounded shrink-0 mt-1"
            aria-label="Back to Reviews"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Athletes</h1>
            <p className="text-[var(--text-muted)] text-sm">
              {listFiltersActive
                ? `${filteredAthletes.length} of ${athletes.length} athletes · ${subtitle}`
                : `${athletes.length} ${subtitle}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && tab === 'cleared' && (
            <Button size="sm" variant="secondary" onClick={() => setResetSeasonOpen(true)}>
              Reset season clearance
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
            Export CSV
          </Button>
        </div>
      </div>

      {loadMessage && (
        <Alert type="danger" onDismiss={() => setLoadMessage('')}>
          {loadMessage}
        </Alert>
      )}

      <TabBar
        tabs={[
          { id: 'med_cert_queue', label: 'Medical certificate review' },
          { id: 'awaiting_medical', label: 'Awaiting medical clearance' },
          { id: 'cleared', label: 'Cleared for competition' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as RosterTab)}
      />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            label="Search"
            placeholder="Name, email, student ID, or department"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-full sm:w-52 shrink-0">
          <Select
            label="Sport"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value as Sport | '')}
            options={SPORT_FILTER_OPTIONS}
          />
        </div>
      </div>

      <Table
        loading={loading}
        columns={columns}
        data={filteredAthletes.map((a) => {
          const row: Record<string, React.ReactNode> = {
            ...(tab === 'cleared'
              ? {
                  select: (
                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleAthleteSelected(a.id)}
                        aria-label={`Select ${a.profile?.full_name ?? 'athlete'}`}
                      />
                    </div>
                  ),
                }
              : {}),
            name: (
              <div>
                <p className="font-medium">{a.profile?.full_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{a.profile?.email}</p>
              </div>
            ),
            sport: (
              <span>
                {getSportIcon(a.sport as any)} {getSportLabel(a.sport as any)}
              </span>
            ),
            student_id: <code className="text-xs">{a.student_id}</code>,
            year: <span className="text-sm">{a.year_level}</span>,
            roster_stage:
              tab === 'med_cert_queue' ? (
                <div className="flex flex-col gap-1 items-start">
                  <Badge variant="info" size="sm">Certificate uploaded</Badge>
                  {a.docs?.find((d) => d.document_type === 'medical_cert') && (
                    <button
                      type="button"
                      className="text-[#0066FF] text-xs inline-flex items-center gap-1 hover:underline"
                      onClick={() => {
                        const doc = a.docs.find((d) => d.document_type === 'medical_cert')
                        if (!doc) return
                        setVerificationPreview({ fileUrl: doc.file_url })
                      }}
                    >
                      <FileText className="w-3 h-3" /> View certificate
                    </button>
                  )}
                </div>
              ) : tab === 'awaiting_medical' ? (
                <Badge variant="warning" size="sm">Clearance pending</Badge>
              ) : (
                <Badge variant="success" size="sm">Official roster OK</Badge>
              ),
            actions: (
              <div className="flex gap-1 flex-wrap">
                {tab === 'med_cert_queue' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye className="w-3 h-3" />}
                    onClick={() => {
                      setSelected(a)
                      setDetailModal('medical')
                      setNotes('')
                      setError('')
                    }}
                  >
                    Review
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelected(a)
                    setDetailModal('roster')
                    setNotes('')
                    setError('')
                  }}
                >
                  Roster
                </Button>
                {showSeason && a.verification_status === 'approved' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSeasonToggleConfirm({
                        id: a.id,
                        name: a.profile?.full_name ?? 'this athlete',
                        nextInactive: a.season_status === 'active',
                      })
                    }
                  >
                    {a.season_status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                )}
              </div>
            ),
          }

          if (showSeason) {
            row.season = (
              <Badge variant={a.season_status === 'active' ? 'success' : 'default'} size="sm">
                {formatEnumLabel(a.season_status)}
              </Badge>
            )
          }

          if (showMedical) {
            row.medical =
              a.verification_status === 'approved' ? (
                <div className="flex flex-col gap-1">
                  <Badge variant={a.medical_cleared ? 'success' : 'warning'} size="sm">
                    {a.medical_cleared ? 'Cleared for official play' : 'Needs organizer clearance'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    onClick={() =>
                      setMedicalRowConfirm({
                        id: a.id,
                        name: a.profile?.full_name ?? 'this athlete',
                        grant: !a.medical_cleared,
                      })
                    }
                  >
                    {a.medical_cleared ? 'Revoke clearance' : 'Mark cleared'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <Badge variant="info" size="sm">
                    Awaiting approval first
                  </Badge>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight max-w-[11rem]">
                    Uploaded certificate can be reviewed after athlete verification is approved.
                  </span>
                </div>
              )
          }

          return row
        })}
        emptyMessage={tableEmptyMessage}
      />

      {tab === 'cleared' && selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-medium tabular-nums text-[var(--text-secondary)]">{selectedIds.size} selected</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>
              Clear selection
            </Button>
            <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => setBulkConfirmAction('set_inactive')}>
              Set inactive
            </Button>
            <Button size="sm" disabled={bulkBusy} onClick={() => setBulkConfirmAction('revoke_clearance')}>
              Revoke clearance
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={bulkConfirmAction !== null}
        onClose={() => {
          if (!bulkBusy) setBulkConfirmAction(null)
        }}
        title="Confirm bulk action"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {bulkConfirmAction === 'revoke_clearance' ? (
              <>
                Revoke medical clearance for{' '}
                <span className="font-semibold text-white tabular-nums">{selectedIds.size}</span> selected athletes? They will need
                organizer clearance again before official competition.
              </>
            ) : bulkConfirmAction === 'set_inactive' ? (
              <>
                Set season status to inactive for{' '}
                <span className="font-semibold text-white tabular-nums">{selectedIds.size}</span> selected athletes?
              </>
            ) : null}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkConfirmAction(null)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button loading={bulkBusy} onClick={() => void confirmBulkAthletes()}>
              Continue
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={seasonToggleConfirm !== null}
        onClose={() => setSeasonToggleConfirm(null)}
        title={seasonToggleConfirm?.nextInactive ? 'Deactivate for season' : 'Reactivate for season'}
        size="md"
      >
        {seasonToggleConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {seasonToggleConfirm.nextInactive ? (
                <>
                  Deactivate <span className="font-semibold text-white">{seasonToggleConfirm.name}</span> for this season?
                  They should not appear as eligible for official roster play while inactive.
                </>
              ) : (
                <>
                  Reactivate <span className="font-semibold text-white">{seasonToggleConfirm.name}</span> for this season?
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSeasonToggleConfirm(null)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmSeasonToggle()}>Continue</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={medicalRowConfirm !== null}
        onClose={() => setMedicalRowConfirm(null)}
        title={medicalRowConfirm?.grant ? 'Grant clearance' : 'Revoke clearance'}
        size="md"
      >
        {medicalRowConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {medicalRowConfirm.grant ? (
                <>
                  Mark <span className="font-semibold text-white">{medicalRowConfirm.name}</span> medically cleared for official
                  competition?
                </>
              ) : (
                <>
                  Revoke medical clearance for{' '}
                  <span className="font-semibold text-white">{medicalRowConfirm.name}</span>? They may be restricted to tryouts only
                  until cleared again.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMedicalRowConfirm(null)}>
                Cancel
              </Button>
              <Button variant={medicalRowConfirm.grant ? 'success' : 'danger'} onClick={() => void confirmMedicalRow()}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={resetSeasonOpen}
        onClose={() => {
          if (!resetSeasonBusy) setResetSeasonOpen(false)
        }}
        title="Reset season clearance"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            This clears medical clearance and sets season status to inactive for every approved athlete account in the
            school. Use at season transitions; athletes will need clearance again before official competition.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetSeasonOpen(false)} disabled={resetSeasonBusy}>
              Cancel
            </Button>
            <Button loading={resetSeasonBusy} onClick={() => void runResetSeasonClearance()}>
              Confirm reset
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!selected && !!detailModal}
        onClose={() => {
          setSelected(null)
          setDetailModal(null)
          setNotes('')
          setError('')
          setRosterError('')
          setRosterSaveSuccess(false)
          setMedCertConfirmAction(null)
        }}
        title={detailModal === 'medical' ? 'Medical certificate review' : 'Athlete roster'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[var(--text-muted)] text-xs">Athlete</p>
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
                <p className="text-[var(--text-muted)] text-xs">Sport / position</p>
                <p>
                  {getSportLabel(selected.sport as any)} · {selected.position?.trim() ? selected.position : 'Not set'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
              <p className="text-sm font-semibold">Roster assignment</p>
              <p className="text-xs text-[var(--text-muted)]">
                {sportPositions.length > 0
                  ? 'Position and jersey number are set by the organizer and appear on the athlete profile.'
                  : 'Jersey number is set by the organizer and appears on the athlete profile. This sport has no fixed position list.'}
              </p>
              {rosterError && (
                <Alert type="danger" onDismiss={() => setRosterError('')}>
                  {rosterError}
                </Alert>
              )}
              {rosterSaveSuccess && (
                <Alert type="success" onDismiss={() => setRosterSaveSuccess(false)}>
                  Roster saved. The athlete will see the updates on their profile.
                </Alert>
              )}
              {sportPositions.length > 0 ? (
                <Select
                  label="Position"
                  value={rosterPosition}
                  onChange={(e) => setRosterPosition(e.target.value)}
                  options={[
                    { value: '', label: 'Not set' },
                    ...sportPositions.map((p) => ({ value: p, label: p })),
                    ...(rosterPosition &&
                    rosterPosition !== '' &&
                    !sportPositions.includes(rosterPosition)
                      ? [{ value: rosterPosition, label: rosterPosition }]
                      : []),
                  ]}
                />
              ) : null}
              <Input
                label="Jersey number"
                value={rosterJersey}
                onChange={(e) => setRosterJersey(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="e.g. 12"
                maxLength={3}
              />
              <Button loading={rosterSaving} onClick={() => void saveRosterDetails()}>
                Save roster
              </Button>
            </div>

            {detailModal === 'medical' && (
              <>
            {(() => {
              const medDoc = selected.docs?.find((d) => d.document_type === 'medical_cert')
              return medDoc ? (
                <div>
                  <p className="text-sm font-semibold mb-2">Uploaded certificate</p>
                  <button
                    type="button"
                    className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[#0066FF] text-sm transition-colors w-full text-left"
                    onClick={() => setVerificationPreview({ fileUrl: medDoc.file_url })}
                  >
                    <FileText className="w-5 h-5 text-[#0066FF] shrink-0" />
                    <span className="font-medium">Medical Certificate</span>
                    <span className="text-[var(--text-muted)] ml-auto text-xs">Click to view</span>
                  </button>
                </div>
              ) : (
                <Alert type="warning">No medical certificate file found for this athlete.</Alert>
              )
            })()}

            <Textarea
              label="Notes (shown to athlete on reject / resubmit request)"
              placeholder="e.g. Certificate is expired, please upload a valid one from this year."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />

            {medCertConfirmAction ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3">
                <p className="text-sm font-semibold text-white">Are you sure?</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {medCertConfirmAction === 'approve' &&
                    'This grants medical clearance so the athlete can compete officially once their season status allows.'}
                  {medCertConfirmAction === 'reject' &&
                    'This declines the certificate and clears medical clearance. Optional notes above are sent to the athlete.'}
                  {medCertConfirmAction === 'request_resubmit' &&
                    'This asks the athlete to upload a new certificate. Notes above explain what you need from them.'}
                </p>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="secondary" disabled={reviewing} onClick={() => setMedCertConfirmAction(null)}>
                    Back
                  </Button>
                  <Button
                    variant={medCertConfirmAction === 'approve' ? 'success' : medCertConfirmAction === 'reject' ? 'danger' : 'secondary'}
                    loading={
                      reviewing &&
                      reviewAction === medCertConfirmAction
                    }
                    disabled={reviewing}
                    onClick={() => void handleMedCertReview(medCertConfirmAction)}
                  >
                    Yes, proceed
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="danger"
                  icon={<XCircle className="w-4 h-4" />}
                  disabled={reviewing}
                  onClick={() => setMedCertConfirmAction('reject')}
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="w-4 h-4" />}
                  disabled={reviewing}
                  onClick={() => setMedCertConfirmAction('request_resubmit')}
                >
                  Request resubmit
                </Button>
                <div className="flex-1" />
                <Button
                  variant="success"
                  icon={<CheckCircle className="w-4 h-4" />}
                  disabled={reviewing}
                  onClick={() => setMedCertConfirmAction('approve')}
                >
                  Approve &amp; clear
                </Button>
              </div>
            )}
              </>
            )}
          </div>
        )}
      </Modal>

      <VerificationDocumentPreviewModal
        open={verificationPreview !== null}
        onClose={() => setVerificationPreview(null)}
        title="Medical certificate"
        fileUrl={verificationPreview?.fileUrl}
      />
    </div>
  )
}
