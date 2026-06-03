import React, { useEffect, useState } from 'react'
import { ExternalLink, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Modal, Button, Alert, Skeleton, Textarea } from '../ui'
import { getVerificationSignedUrl } from '../../lib/verificationDocumentView'
import api from '../../lib/api'

export type EnrollmentReviewActions = {
  profileId: string
  /** When false, Approve is disabled (no COR file on record). */
  canApprove: boolean
  onSuccess: () => void
}

export type VerificationDocumentPreviewModalProps = {
  open: boolean
  onClose: () => void
  title: string
  fileUrl: string | null | undefined
  /** Organizer COR intake: approve / decline / request a new upload (same modal as athlete document preview). */
  enrollmentReview?: EnrollmentReviewActions | null
}

function previewKind(url: string): 'pdf' | 'image' | 'unknown' {
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (path.endsWith('.pdf')) return 'pdf'
    if (/\.(jpe?g|png|gif|webp)$/.test(path)) return 'image'
  } catch {
    const lower = url.toLowerCase().split('?')[0] ?? ''
    if (lower.endsWith('.pdf')) return 'pdf'
    if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return 'image'
  }
  return 'unknown'
}

export function VerificationDocumentPreviewModal({
  open,
  onClose,
  title,
  fileUrl,
  enrollmentReview,
}: VerificationDocumentPreviewModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewBusy, setReviewBusy] = useState<'approve' | 'decline' | 'resubmit' | null>(null)
  const [confirmStep, setConfirmStep] = useState<'approve' | 'decline' | 'resubmit' | null>(null)

  const reviewProfileId = enrollmentReview?.profileId

  useEffect(() => {
    if (!open) {
      setSignedUrl(null)
      setError('')
      setLoading(false)
      setReviewNotes('')
      setReviewError('')
      setReviewBusy(null)
      setConfirmStep(null)
      return
    }

    const ref = typeof fileUrl === 'string' ? fileUrl.trim() : ''
    if (!ref) {
      setSignedUrl(null)
      setLoading(false)
      setError(reviewProfileId ? '' : 'No file on file')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setSignedUrl(null)
    void getVerificationSignedUrl(ref).then((r) => {
      if (cancelled) return
      setLoading(false)
      if (r.ok) setSignedUrl(r.url)
      else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [open, fileUrl, reviewProfileId])

  useEffect(() => {
    if (!open) return
    setReviewNotes('')
    setReviewError('')
    setReviewBusy(null)
    setConfirmStep(null)
  }, [open, reviewProfileId, fileUrl])

  const kind = signedUrl ? previewKind(signedUrl) : 'unknown'

  const patchEnrollment = async (status: 'verified' | 'unverified', notes: string | undefined) => {
    if (!enrollmentReview) return
    await api.patch(`/students/${enrollmentReview.profileId}/enrollment`, {
      enrollment_status: status,
      notes,
    })
    enrollmentReview.onSuccess()
    onClose()
  }

  const handleDecline = async () => {
    if (!enrollmentReview) return
    const n = reviewNotes.trim()
    if (n.length < 3) {
      setReviewError('Add a short note explaining why enrollment is declined.')
      return
    }
    setConfirmStep('decline')
  }

  const executeDecline = async () => {
    if (!enrollmentReview) return
    const n = reviewNotes.trim()
    setReviewError('')
    setReviewBusy('decline')
    try {
      await patchEnrollment('unverified', `Enrollment declined: ${n}`)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setReviewError(msg ?? 'Could not update enrollment.')
      setConfirmStep(null)
    } finally {
      setReviewBusy(null)
    }
  }

  const handleRequestNewCor = async () => {
    if (!enrollmentReview) return
    const n = reviewNotes.trim()
    if (n.length < 3) {
      setReviewError('Explain what is wrong or what you need (e.g. clearer scan, correct term).')
      return
    }
    setConfirmStep('resubmit')
  }

  const executeRequestNewCor = async () => {
    if (!enrollmentReview) return
    const n = reviewNotes.trim()
    setReviewError('')
    setReviewBusy('resubmit')
    try {
      await patchEnrollment('unverified', `New COR requested: ${n}`)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setReviewError(msg ?? 'Could not request a new document.')
      setConfirmStep(null)
    } finally {
      setReviewBusy(null)
    }
  }

  const handleApprove = async () => {
    if (!enrollmentReview?.canApprove) return
    setConfirmStep('approve')
  }

  const executeApprove = async () => {
    if (!enrollmentReview?.canApprove) return
    setReviewError('')
    setReviewBusy('approve')
    try {
      const n = reviewNotes.trim()
      await patchEnrollment('verified', n ? `Enrollment approved: ${n}` : undefined)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setReviewError(msg ?? 'Could not approve enrollment.')
      setConfirmStep(null)
    } finally {
      setReviewBusy(null)
    }
  }

  const showReviewPanel = Boolean(open && enrollmentReview)
  const previewBlocked = !loading && !signedUrl && !(fileUrl && String(fileUrl).trim())

  return (
    <Modal open={open} onClose={onClose} title={title} size="full">
      <div className="space-y-4">
        {loading && <Skeleton className="h-[min(65vh,560px)] w-full rounded-xl" />}
        {error && !loading && !signedUrl && <Alert type="danger">{error}</Alert>}
        {!loading && signedUrl && (
          <>
            {kind === 'image' && (
              <div className="flex justify-center rounded-xl border border-[var(--border-subtle)] bg-black/20 p-2 min-h-[200px]">
                <img src={signedUrl} alt="" className="max-h-[min(65vh,560px)] w-auto max-w-full object-contain" />
              </div>
            )}
            {kind === 'pdf' && (
              <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-black/20">
                <iframe title={title} src={signedUrl} className="w-full min-h-[min(65vh,560px)] border-0 bg-transparent" />
              </div>
            )}
            {kind === 'unknown' && (
              <p className="text-sm text-[var(--text-muted)]">
                Inline preview isn&apos;t available for this file. Open it in a new tab to view or download.
              </p>
            )}
          </>
        )}

        {showReviewPanel && previewBlocked && !loading && (
          <Alert type="warning">No COR file is uploaded yet. You can decline or request a correct upload; approve becomes available once a file is on file.</Alert>
        )}

        {showReviewPanel && (
          <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-3 bg-[var(--surface-elevated)]/40">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">Enrollment decision</p>
            <p className="text-xs text-[var(--text-muted)]">
              Notes are stored with the audit log. Ask the student to check email or in-app guidance if your school notifies them another way.
            </p>
            {reviewError && (
              <Alert type="danger" onDismiss={() => setReviewError('')}>
                {reviewError}
              </Alert>
            )}
            <Textarea
              label="Notes (optional for approve; required for decline or new COR request)"
              placeholder="e.g. Year or name on the COR does not match the student record."
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              disabled={confirmStep !== null}
            />
            {confirmStep === null ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="danger"
                type="button"
                icon={<XCircle className="w-4 h-4" />}
                disabled={reviewBusy !== null}
                onClick={() => void handleDecline()}
              >
                Decline enrollment
              </Button>
              <Button
                variant="secondary"
                type="button"
                icon={<RefreshCw className="w-4 h-4" />}
                disabled={reviewBusy !== null}
                onClick={() => void handleRequestNewCor()}
              >
                Request new COR
              </Button>
              <div className="flex-1 min-w-[1rem]" />
              <Button
                variant="success"
                type="button"
                icon={<CheckCircle className="w-4 h-4" />}
                disabled={reviewBusy !== null || !enrollmentReview.canApprove}
                onClick={() => void handleApprove()}
              >
                Approve enrollment
              </Button>
            </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] p-4 bg-[var(--surface-card)]">
                <Alert type="warning">
                  {confirmStep === 'decline' && 'Decline this enrollment? The student returns to pending verification and linked medical clearance may be revoked.'}
                  {confirmStep === 'resubmit' && 'Request a new COR? The student will need to upload again before you can approve.'}
                  {confirmStep === 'approve' && 'Approve this enrollment? They can proceed to tryouts and athlete onboarding per your school rules.'}
                </Alert>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button type="button" variant="secondary" disabled={reviewBusy !== null} onClick={() => setConfirmStep(null)}>
                    Go back
                  </Button>
                  {confirmStep === 'decline' && (
                    <Button type="button" variant="danger" loading={reviewBusy === 'decline'} disabled={reviewBusy !== null} onClick={() => void executeDecline()}>
                      Yes, decline enrollment
                    </Button>
                  )}
                  {confirmStep === 'resubmit' && (
                    <Button type="button" variant="secondary" loading={reviewBusy === 'resubmit'} disabled={reviewBusy !== null} onClick={() => void executeRequestNewCor()}>
                      Yes, request new COR
                    </Button>
                  )}
                  {confirmStep === 'approve' && (
                    <Button type="button" variant="success" loading={reviewBusy === 'approve'} disabled={reviewBusy !== null} onClick={() => void executeApprove()}>
                      Yes, approve enrollment
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-1 border-t border-[var(--border-subtle)]">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          {signedUrl && (
            <Button
              type="button"
              icon={<ExternalLink className="w-4 h-4" />}
              onClick={() => window.open(signedUrl, '_blank', 'noopener,noreferrer')}
            >
              Open in new tab
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
