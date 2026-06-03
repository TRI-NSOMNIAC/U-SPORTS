import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, GraduationCap } from 'lucide-react'
import { Button, Card, Skeleton } from '../../components/ui'
import api from '../../lib/api'

type CorPendingRow = {
  id: string
  full_name: string
  email: string
  student_id: string | null
  year_level: string | null
  department: string | null
  cor_document: { file_url: string } | null
}

export default function OrganizerReviews() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [corList, setCorList] = useState<CorPendingRow[]>([])
  const [verificationQueue, setVerificationQueue] = useState(0)
  const [medCertQueue, setMedCertQueue] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [corRes, verRes, medRes] = await Promise.all([
        api.get<CorPendingRow[]>('/students/pending-cor').catch(() => ({ data: [] as CorPendingRow[] })),
        api.get<unknown[]>('/athletes/pending').catch(() => ({ data: [] as unknown[] })),
        api
          .get<unknown[]>('/athletes', {
            params: { medical_clearance_queue: 'true', has_med_cert: 'true' },
          })
          .catch(() => ({ data: [] as unknown[] })),
      ])
      setCorList(Array.isArray(corRes.data) ? corRes.data : [])
      setVerificationQueue(Array.isArray(verRes.data) ? verRes.data.length : 0)
      setMedCertQueue(Array.isArray(medRes.data) ? medRes.data.length : 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const athleteWorkPending = verificationQueue + medCertQueue

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-[var(--text-muted)] text-sm mt-1 leading-relaxed max-w-2xl">
          Use Student intake for COR decisions and the Athletes page for roster verification and medical clearance. Counts below update
          when you return to this hub.
        </p>
      </div>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card className="p-6 flex flex-col gap-4 border-[var(--border-subtle)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0066FF]/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-[#0066FF]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-lg">School enrollment (COR)</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Pending enrollment uploads are reviewed on Student intake — search, onboard by email, and approve or decline COR there.
                </p>
                <p className="text-2xl font-bold mt-3 tabular-nums">{corList.length}</p>
                <p className="text-xs text-[var(--text-muted)]">pending COR reviews</p>
              </div>
            </div>

            <Button className="w-full sm:w-auto self-start" onClick={() => navigate('/organizer/students?tab=pending')}>
              Open student intake
            </Button>
          </Card>

          <Card className="p-6 flex flex-col gap-4 border-[var(--border-subtle)]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0066FF]/15 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-[#0066FF]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-lg">Athletes & medical clearance</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Roster verification and medical certificates are handled on the Athletes page (tabs for each queue).
                </p>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="font-semibold text-[var(--text-secondary)] tabular-nums">{verificationQueue}</span>{' '}
                    <span className="text-[var(--text-muted)]">roster or document verification</span>
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--text-secondary)] tabular-nums">{medCertQueue}</span>{' '}
                    <span className="text-[var(--text-muted)]">medical certificates to review</span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)] pt-1">
                    Combined items needing attention:{' '}
                    <span className="font-medium text-[var(--text-secondary)] tabular-nums">{athleteWorkPending}</span>
                  </p>
                </div>
              </div>
            </div>
            <Button className="w-full sm:w-auto self-start" onClick={() => navigate('/organizer/athletes?tab=med_cert_queue')}>
              Open athletes
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
