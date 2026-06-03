import React, { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Mail, Hash, GraduationCap, FileText, Eye, User, Upload } from 'lucide-react'
import { Card, Badge, Alert, Skeleton, Button, Modal } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { sessionScopedProfile } from '../../lib/sessionProfile'
import { VerificationDocumentPreviewModal } from '../../components/verification/VerificationDocumentPreviewModal'
import { uploadEnrollmentCor } from '../../lib/studentCorUpload'
import api from '../../lib/api'

type CorDoc = {
  file_url: string
  uploaded_at: string | null
}

function displayOrNotProvided(value: string | null | undefined): string {
  const t = value?.trim()
  return t ? t : 'Not provided'
}

export default function StudentProfile() {
  const { profile, session, fetchProfile } = useAuthStore()
  const scopedProfile = sessionScopedProfile(session, profile)
  const [corDoc, setCorDoc] = useState<CorDoc | null | undefined>(undefined)
  const [corError, setCorError] = useState('')
  const [corPreviewOpen, setCorPreviewOpen] = useState(false)
  const [corBusy, setCorBusy] = useState(false)
  const [corBanner, setCorBanner] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)
  const [pendingCorFile, setPendingCorFile] = useState<File | null>(null)

  useEffect(() => {
    if (!scopedProfile?.id || scopedProfile.role !== 'student') return
    let cancelled = false
    setCorError('')
    api
      .get<CorDoc | null>('/students/me/cor-document')
      .then((res) => {
        if (!cancelled) setCorDoc(res.data ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setCorDoc(null)
          setCorError('Could not load your COR record. Check that the API server is running.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [scopedProfile?.id, scopedProfile?.role])

  if (!scopedProfile || scopedProfile.role !== 'student') {
    return (
      <div className="max-w-lg mx-auto px-6 py-12 text-center text-[var(--text-muted)]">
        <p>Student profile only.</p>
        <Link to="/guest" className="text-[#0066FF] text-sm mt-4 inline-block">
          Back
        </Link>
      </div>
    )
  }

  const verified = scopedProfile.enrollment_status === 'verified'
  const unverified = scopedProfile.enrollment_status === 'unverified'
  const enrollmentRevokedByOrganizer = unverified && Boolean(scopedProfile.enrollment_verification_reset_at)

  const confirmCorUpload = async (file: File) => {
    setCorBusy(true)
    setCorBanner(null)
    const wasRevokedFlow = Boolean(scopedProfile.enrollment_verification_reset_at)
    try {
      const saved = await uploadEnrollmentCor(scopedProfile.id, file)
      setCorDoc(saved)
      setPendingCorFile(null)
      setCorBanner({
        kind: 'success',
        text: wasRevokedFlow
          ? 'New COR uploaded. Your school enrollment will stay unverified until an organizer reviews and approves it again.'
          : 'COR uploaded. An organizer will review it before you can register for tryouts.',
      })
      await fetchProfile(scopedProfile.id)
    } catch (e: unknown) {
      setCorBanner({ kind: 'danger', text: e instanceof Error ? e.message : 'Upload failed' })
    } finally {
      setCorBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My profile</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1">School enrollment and your uploaded Certificate of Registration.</p>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">Status</h2>
        {verified ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Enrollment</span>
            <Badge variant="success">Verified</Badge>
          </div>
        ) : unverified ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Enrollment</span>
              <Badge variant="warning">Unverified</Badge>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {enrollmentRevokedByOrganizer
                ? 'An organizer reset your school enrollment. Upload a fresh COR below so they can verify you again.'
                : 'Upload your COR below if you have not yet. An organizer will verify it before you can register for tryouts.'}
            </p>
          </div>
        ) : (
          <>
            <Badge variant="default">{scopedProfile.enrollment_status ?? 'Pending'}</Badge>
            <p className="text-xs text-[var(--text-muted)]">
              Your enrollment status will update after organizers process your account.
            </p>
          </>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">Information you submitted</h2>
        <div className="flex items-center gap-3 text-sm">
          <User className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <span>{scopedProfile.full_name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Mail className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <span>{scopedProfile.email}</span>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <Hash className="w-4 h-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Student ID</p>
            <p>{displayOrNotProvided(scopedProfile.student_id)}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <GraduationCap className="w-4 h-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Year level</p>
              <p>{displayOrNotProvided(scopedProfile.year_level)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Course</p>
              <p>{displayOrNotProvided(scopedProfile.department)}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          {verified ? 'Application status' : 'Pending application'}
        </h2>
        {corError && (
          <Alert type="danger" onDismiss={() => setCorError('')}>
            {corError}
          </Alert>
        )}
        {corBanner && (
          <Alert type={corBanner.kind === 'danger' ? 'danger' : 'success'} onDismiss={() => setCorBanner(null)}>
            {corBanner.text}
          </Alert>
        )}
        {corDoc === undefined ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-4 h-4 text-[#0066FF] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Certificate of Registration (COR)</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {verified
                      ? 'Approved — your enrollment COR is on file.'
                      : enrollmentRevokedByOrganizer
                        ? 'Renew your uploaded file so an organizer can verify your enrollment again.'
                        : corDoc?.file_url
                          ? 'Waiting for an organizer to review your upload.'
                          : 'No COR on file yet — upload a PDF or image (max 5MB).'}
                  </p>
                </div>
              </div>
              {corDoc?.file_url && (
                <button
                  type="button"
                  className="text-[#0066FF] text-sm inline-flex items-center gap-1 shrink-0 hover:underline"
                  onClick={() => setCorPreviewOpen(true)}
                  aria-label="View your COR"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View COR
                </button>
              )}
            </div>

            {unverified && !corError && (
              <>
                {enrollmentRevokedByOrganizer ? (
                  <Alert type="warning">
                    Your enrollment was reset by an organizer. Upload a new Certificate of Registration so they can approve your school
                    account again. Replacing the file updates what reviewers see.
                  </Alert>
                ) : !corDoc?.file_url ? (
                  <Alert type="info">
                    Upload your COR here if sign-up did not finish the document step, or if you still need to submit one. PDF or image, max 5MB.
                  </Alert>
                ) : null}

                <label className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-subtle)] cursor-pointer hover:border-[#0066FF]/50">
                  <Upload className="w-6 h-6 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-secondary)]">
                    {corBusy ? 'Uploading…' : corDoc?.file_url ? 'Choose file to replace COR…' : 'Upload COR (PDF or image)…'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    disabled={corBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setPendingCorFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              </>
            )}
          </>
        )}
      </Card>

      <Modal
        open={pendingCorFile !== null}
        onClose={() => !corBusy && setPendingCorFile(null)}
        title={corDoc?.file_url ? 'Replace Certificate of Registration?' : 'Upload Certificate of Registration?'}
        size="md"
      >
        {pendingCorFile && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {corDoc?.file_url
                ? 'This replaces your current COR on file. Organizers review the latest upload when your enrollment is unverified.'
                : 'Your file will be stored as your enrollment COR. PDF or image, max 5MB.'}
            </p>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Selected file</p>
              <p className="font-medium truncate">{pendingCorFile.name}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{(pendingCorFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button type="button" variant="secondary" disabled={corBusy} onClick={() => setPendingCorFile(null)}>
                Cancel
              </Button>
              <Button type="button" loading={corBusy} onClick={() => void confirmCorUpload(pendingCorFile)}>
                Confirm upload
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <VerificationDocumentPreviewModal
        open={corPreviewOpen}
        onClose={() => setCorPreviewOpen(false)}
        title="Certificate of Registration (COR)"
        fileUrl={corDoc?.file_url}
      />
    </div>
  )
}
