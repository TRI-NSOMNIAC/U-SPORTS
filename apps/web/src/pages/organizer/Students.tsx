import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Mail, User, Eye, UserPlus, ArrowLeft } from 'lucide-react'
import { Button, Badge, Table, Alert, Skeleton, TabBar, Input, Modal } from '../../components/ui'
import api from '../../lib/api'
import { matchesEnrollmentSearch, cn } from '../../lib/utils'
import { VerificationDocumentPreviewModal } from '../../components/verification/VerificationDocumentPreviewModal'

type PendingStudent = {
  id: string
  full_name: string
  email: string
  student_id: string | null
  year_level: string | null
  department: string | null
  enrollment_status: string | null
  cor_document: { file_url: string } | null
}

type ModuleTab = 'pending' | 'verified'

export default function OrganizerStudents() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [moduleTab, setModuleTab] = useState<ModuleTab>('pending')
  const [enrollmentPending, setEnrollmentPending] = useState<PendingStudent[]>([])
  const [verifiedStudents, setVerifiedStudents] = useState<PendingStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [listSearch, setListSearch] = useState('')

  // Onboard by email
  const [showOnboard, setShowOnboard] = useState(false)
  const [onboardForm, setOnboardForm] = useState({ email: '', full_name: '', student_id: '', year_level: '', department: '' })
  const [onboardLoading, setOnboardLoading] = useState(false)
  const [onboardSuccess, setOnboardSuccess] = useState('')
  const [onboardError, setOnboardError] = useState('')
  const [corPreview, setCorPreview] = useState<{
    profileId: string
    fileUrl: string | null
    enrollmentActions: boolean
  } | null>(null)

  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmBulkResetOpen, setConfirmBulkResetOpen] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const loadPending = async () => {
    const enRes = await api.get<PendingStudent[]>('/students/pending-cor').catch(() => ({ data: [] as PendingStudent[] }))
    setEnrollmentPending(Array.isArray(enRes.data) ? enRes.data : [])
  }

  const loadVerified = async () => {
    const v = await api
      .get<PendingStudent[]>('/students/verified-enrollment')
      .catch(() => ({ data: [] as PendingStudent[] }))
    setVerifiedStudents(Array.isArray(v.data) ? v.data : [])
  }

  const load = () => {
    setLoading(true)
    const chain = moduleTab === 'pending' ? loadPending().then(() => {}) : loadVerified().then(() => {})
    chain.finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [moduleTab])

  useEffect(() => {
    setSelectedProfileIds(new Set())
  }, [moduleTab])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'verified' || t === 'pending') setModuleTab(t)
  }, [searchParams])

  useEffect(() => {
    const corId = searchParams.get('cor')
    if (!corId || moduleTab !== 'pending' || loading) return

    const match = enrollmentPending.find((s) => s.id === corId)
    if (!match) {
      navigate('/organizer/students?tab=pending', { replace: true })
      return
    }

    setCorPreview({
      profileId: match.id,
      fileUrl: match.cor_document?.file_url ?? null,
      enrollmentActions: true,
    })
    navigate('/organizer/students?tab=pending', { replace: true })
  }, [searchParams, moduleTab, loading, enrollmentPending, navigate])

  const filteredPending = enrollmentPending.filter((s) => matchesEnrollmentSearch(s, listSearch))
  const filteredVerified = verifiedStudents.filter((s) => matchesEnrollmentSearch(s, listSearch))

  const verifiedVisibleIds = moduleTab === 'verified' ? filteredVerified.map((s) => s.id) : []
  const allVerifiedVisibleSelected =
    verifiedVisibleIds.length > 0 && verifiedVisibleIds.every((id) => selectedProfileIds.has(id))

  const toggleStudentSelected = (id: string) => {
    setSelectedProfileIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleSelectAllVerified = () => {
    setSelectedProfileIds((prev) => {
      const n = new Set(prev)
      if (allVerifiedVisibleSelected) {
        verifiedVisibleIds.forEach((id) => n.delete(id))
      } else {
        verifiedVisibleIds.forEach((id) => n.add(id))
      }
      return n
    })
  }

  const submitBulkEnrollmentReset = async () => {
    const profileIds = [...selectedProfileIds]
    if (profileIds.length === 0) return
    setBulkBusy(true)
    setBulkError('')
    try {
      await api.patch('/students/bulk-enrollment', {
        profileIds,
        enrollment_status: 'unverified',
      })
      setConfirmBulkResetOpen(false)
      setSelectedProfileIds(new Set())
      await loadVerified()
      if (moduleTab === 'pending') await loadPending()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setBulkError(msg ?? 'Bulk reset failed. Check that the API server is running.')
    } finally {
      setBulkBusy(false)
    }
  }

  const handleOnboard = async () => {
    setOnboardError('')
    setOnboardSuccess('')
    if (!onboardForm.email.trim()) {
      setOnboardError('Email is required.')
      return
    }
    setOnboardLoading(true)
    try {
      await api.post('/students/onboard-by-email', {
        email: onboardForm.email.trim(),
        full_name: onboardForm.full_name.trim() || undefined,
        student_id: onboardForm.student_id.trim() || undefined,
        year_level: onboardForm.year_level.trim() || undefined,
        department: onboardForm.department.trim() || undefined,
      })
      setOnboardSuccess(
        `${onboardForm.email} has been registered as a student (pending enrollment). They will now appear under Pending review so you can verify their COR.`
      )
      setOnboardForm({ email: '', full_name: '', student_id: '', year_level: '', department: '' })
      // Reload pending list if we're on that tab, or switch to it
      if (moduleTab === 'pending') load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setOnboardError(msg ?? 'Onboard failed. Make sure the API server is running and the email exists in Supabase Auth.')
    } finally {
      setOnboardLoading(false)
    }
  }

  return (
    <div className={cn('space-y-6', moduleTab === 'verified' && selectedProfileIds.size > 0 && 'pb-24')}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/organizer/reviews')}
            className="text-[var(--text-muted)] hover:text-white p-1 rounded shrink-0 mt-0.5"
            aria-label="Back to Reviews"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Students</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1 leading-relaxed">
            <strong className="text-[var(--text-secondary)]">School enrollment</strong>: review the Certificate of Registration (COR) uploaded at sign-up.
            Verified accounts can register for tryouts and appear under <strong className="text-[var(--text-secondary)]">Verified students</strong>.
            After tryout selection, athletes move off this list — use{' '}
            <Link to="/organizer/reviews" className="text-[#0066FF] hover:underline font-medium">
              Reviews
            </Link>{' '}
            hub or{' '}
            <Link to="/organizer/athletes" className="text-[#0066FF] hover:underline font-medium">
              Athletes
            </Link>{' '}
            for medical clearance and competition roster. For tryout lineups only, add people under{' '}
            <strong className="text-[var(--text-secondary)]">Teams → Edit → Verified students (tryout)</strong>.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<UserPlus className="w-4 h-4" />}
          onClick={() => { setShowOnboard(true); setOnboardSuccess(''); setOnboardError('') }}
        >
          Onboard by email
        </Button>
      </div>

      <TabBar
        tabs={[
          { id: 'pending', label: 'Pending review' },
          { id: 'verified', label: 'Verified students' },
        ]}
        active={moduleTab}
        onChange={(id) => {
          setModuleTab(id as ModuleTab)
          setListSearch('')
        }}
      />

      <div className="max-w-md">
        <Input
          label="Search"
          placeholder="Name, email, student ID, year, department"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : moduleTab === 'verified' ? (
        <Table
          columns={[
            {
              key: 'select',
              label: (
                <span className="inline-flex items-center gap-2 normal-case tracking-normal font-medium text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
                    checked={allVerifiedVisibleSelected}
                    onChange={toggleSelectAllVerified}
                    aria-label="Select all visible students"
                  />
                </span>
              ),
              width: '2.75rem',
            },
            { key: 'student', label: 'Student' },
            { key: 'cor', label: 'Enrollment COR' },
          ]}
          data={filteredVerified.map((s) => ({
            select: (
              <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="rounded border-[var(--border-subtle)] accent-[#0066FF]"
                  checked={selectedProfileIds.has(s.id)}
                  onChange={() => toggleStudentSelected(s.id)}
                  aria-label={`Select ${s.full_name}`}
                />
              </div>
            ),
            student: (
              <div>
                <p className="font-medium flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  {s.full_name}
                </p>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />
                  {s.email}
                </p>
                {s.student_id && <p className="text-xs text-[var(--text-muted)] mt-1">ID: {s.student_id}</p>}
              </div>
            ),
            cor: s.cor_document?.file_url ? (
              <button
                type="button"
                className="text-[#0066FF] text-sm inline-flex items-center gap-1 hover:underline text-left"
                onClick={() =>
                  setCorPreview({
                    profileId: s.id,
                    fileUrl: s.cor_document!.file_url,
                    enrollmentActions: false,
                  })
                }
              >
                <Eye className="w-3.5 h-3.5" /> View COR
              </button>
            ) : (
              <Badge size="sm" variant="default">
                On file
              </Badge>
            ),
          }))}
          emptyMessage={
            verifiedStudents.length > 0 && filteredVerified.length === 0
              ? 'No students match your search. Try different keywords.'
              : 'No enrolled student accounts on this tab yet. Approve COR under Pending review. Accounts promoted to athlete no longer appear here.'
          }
        />
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Enrollment — school COR</h2>
          <p className="text-xs text-[var(--text-muted)]">
            New student accounts. Approve here before they can register for tryouts or join tryout roster lineups as verified students.
          </p>
          <Table
            columns={[
              { key: 'student', label: 'Student' },
              { key: 'cor', label: 'Enrollment COR' },
              { key: 'actions', label: '' },
            ]}
            data={filteredPending.map((s) => ({
              student: (
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    {s.full_name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3" />
                    {s.email}
                  </p>
                  {s.student_id && <p className="text-xs text-[var(--text-muted)] mt-1">ID: {s.student_id}</p>}
                </div>
              ),
              cor: s.cor_document?.file_url ? (
                <Badge size="sm" variant="info">
                  Uploaded
                </Badge>
              ) : (
                <Badge size="sm" variant="warning">
                  Missing
                </Badge>
              ),
              actions: (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Eye className="w-3.5 h-3.5" />}
                  onClick={() =>
                    setCorPreview({
                      profileId: s.id,
                      fileUrl: s.cor_document?.file_url ?? null,
                      enrollmentActions: true,
                    })
                  }
                >
                  Review COR
                </Button>
              ),
            }))}
            emptyMessage={
              enrollmentPending.length > 0 && filteredPending.length === 0
                ? 'No students match your search. Try different keywords.'
                : 'No enrollment applications waiting for COR review. If someone signed up via Supabase Auth dashboard instead of the app, use Onboard by email above.'
            }
          />
        </section>
      )}

      {moduleTab === 'verified' && selectedProfileIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          <p className="text-sm font-medium tabular-nums text-[var(--text-secondary)]">{selectedProfileIds.size} selected</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProfileIds(new Set())} disabled={bulkBusy}>
              Clear selection
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setBulkError('')
                setConfirmBulkResetOpen(true)
              }}
              disabled={bulkBusy}
            >
              Reset enrollment
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={confirmBulkResetOpen}
        onClose={() => {
          if (!bulkBusy) setConfirmBulkResetOpen(false)
        }}
        title="Reset enrollment"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="warning">
            This sets {selectedProfileIds.size} student account{selectedProfileIds.size === 1 ? '' : 's'} back to pending
            enrollment. Medical clearance on any linked athlete roster rows will be revoked automatically.
          </Alert>
          {bulkError ? (
            <Alert type="danger" onDismiss={() => setBulkError('')}>
              {bulkError}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmBulkResetOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button loading={bulkBusy} onClick={() => void submitBulkEnrollmentReset()}>
              Confirm reset
            </Button>
          </div>
        </div>
      </Modal>

      {/* Onboard by email modal */}
      <Modal
        open={showOnboard}
        onClose={() => setShowOnboard(false)}
        title="Onboard student by email"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="info">
            Use this when a student account was created directly in the Supabase Auth dashboard instead of going through the app's sign-up flow.
            Enter their email and we'll repair their profile so they appear under Pending review.
          </Alert>

          {onboardSuccess && (
            <Alert type="success" onDismiss={() => setOnboardSuccess('')}>
              {onboardSuccess}
            </Alert>
          )}
          {onboardError && (
            <Alert type="danger" onDismiss={() => setOnboardError('')}>
              {onboardError}
            </Alert>
          )}

          <Input
            label="Email (required)"
            type="email"
            placeholder="student@students.nu-dasma.edu.ph"
            value={onboardForm.email}
            onChange={(e) => setOnboardForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="Full name (optional — uses Auth display name if blank)"
            placeholder="Juan dela Cruz"
            value={onboardForm.full_name}
            onChange={(e) => setOnboardForm((f) => ({ ...f, full_name: e.target.value }))}
          />
          <Input
            label="Student ID (optional)"
            placeholder="2021-00000"
            value={onboardForm.student_id}
            onChange={(e) => setOnboardForm((f) => ({ ...f, student_id: e.target.value }))}
          />
          <Input
            label="Year level (optional)"
            placeholder="2nd Year"
            value={onboardForm.year_level}
            onChange={(e) => setOnboardForm((f) => ({ ...f, year_level: e.target.value }))}
          />
          <Input
            label="Department / course (optional)"
            placeholder="BS Computer Science"
            value={onboardForm.department}
            onChange={(e) => setOnboardForm((f) => ({ ...f, department: e.target.value }))}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowOnboard(false)}>
              Close
            </Button>
            <Button loading={onboardLoading} onClick={() => void handleOnboard()}>
              Register as student
            </Button>
          </div>
        </div>
      </Modal>

      <VerificationDocumentPreviewModal
        open={corPreview !== null}
        onClose={() => setCorPreview(null)}
        title="Certificate of Registration (COR)"
        fileUrl={corPreview?.fileUrl}
        enrollmentReview={
          corPreview?.enrollmentActions
            ? {
                profileId: corPreview.profileId,
                canApprove: Boolean(corPreview.fileUrl?.trim()),
                onSuccess: () => load(),
              }
            : null
        }
      />
    </div>
  )
}
