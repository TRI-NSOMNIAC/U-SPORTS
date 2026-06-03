import React, { useState, useEffect, useCallback } from 'react'
import { Card, Badge, Alert, Modal, Button } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { uploadEnrollmentCor } from '../../lib/studentCorUpload'
import { getSportLabel, getSportIcon, getInitials, formatEnumLabel } from '../../lib/utils'
import { Upload, Eye, Trophy, Users } from 'lucide-react'
import { VerificationDocumentPreviewModal } from '../../components/verification/VerificationDocumentPreviewModal'
import { deriveEliminationPodium, placementRankLabel } from '../../lib/eventPlacements'
import { useNavigate } from 'react-router'

type MedicalRow = { file_url: string; uploaded_at: string } | null

type CorDoc = { file_url: string; uploaded_at: string | null }

type DocPreviewTarget = { title: string; fileUrl: string }

type AthleteTeamSummary = {
  teamId: string
  name: string
  sport: string
  rosterContext: 'tryout' | 'official'
  coaches: { full_name: string; email: string }[]
}

type ProfileTeamEmbed = {
  id?: string
  name?: string
  sport?: string
  roster_context?: string | null
  coaches?: Array<{ organizer?: { profile?: { full_name?: string | null; email?: string | null } | null } | null }>
} | null

export default function AthleteProfile() {
  const { profile, athlete, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)
  const [latestMedical, setLatestMedical] = useState<MedicalRow | undefined>(undefined)
  const [corDoc, setCorDoc] = useState<CorDoc | null | undefined>(undefined)
  const [docPreview, setDocPreview] = useState<DocPreviewTarget | null>(null)
  const [pendingMedicalFile, setPendingMedicalFile] = useState<File | null>(null)
  const [pendingCorFile, setPendingCorFile] = useState<File | null>(null)
  const [corBusy, setCorBusy] = useState(false)

  type EventFinish = { eventId: string; eventName: string; sport: string; rank: 1 | 2 }
  const [eventFinishes, setEventFinishes] = useState<EventFinish[]>([])
  const [finishesLoading, setFinishesLoading] = useState(false)

  const [myTeamsSummary, setMyTeamsSummary] = useState<AthleteTeamSummary[]>([])
  const [teamsSummaryLoading, setTeamsSummaryLoading] = useState(false)

  const refreshMedicalDoc = useCallback(async () => {
    if (!athlete?.id) return
    const { data } = await supabase
      .from('verification_documents')
      .select('file_url, uploaded_at')
      .eq('athlete_id', athlete.id)
      .eq('document_type', 'medical_cert')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLatestMedical(data ?? null)
  }, [athlete?.id])

  useEffect(() => {
    void refreshMedicalDoc()
  }, [refreshMedicalDoc])

  const refreshCorDoc = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await supabase
      .from('student_documents')
      .select('file_url, uploaded_at')
      .eq('profile_id', profile.id)
      .eq('document_type', 'cor')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCorDoc(data ?? null)
  }, [profile?.id])

  useEffect(() => {
    void refreshCorDoc()
  }, [refreshCorDoc])

  useEffect(() => {
    if (!athlete?.id) {
      setEventFinishes([])
      return
    }
    let cancelled = false
    setFinishesLoading(true)
    ;(async () => {
      try {
        const { data: tm } = await supabase.from('team_members').select('team_id').eq('athlete_id', athlete.id)
        const teamIds = [...new Set((tm ?? []).map((t: { team_id: string }) => t.team_id))]
        if (teamIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: eps } = await supabase
          .from('event_participants')
          .select('event_id, participant_id')
          .in('participant_id', teamIds)
        const evIds = [...new Set((eps ?? []).map((e: { event_id: string }) => e.event_id))]
        if (evIds.length === 0) {
          if (!cancelled) setEventFinishes([])
          return
        }
        const { data: evs } = await supabase
          .from('events')
          .select('id,name,sport,is_tryout')
          .in('id', evIds)
          .eq('status', 'completed')
          .eq('is_tryout', false)

        const out: EventFinish[] = []
        for (const ev of evs ?? []) {
          const myParticipants = new Set(
            (eps ?? []).filter((e: { event_id: string }) => e.event_id === ev.id).map((e: { participant_id: string }) => e.participant_id)
          )
          const { data: br } = await supabase
            .from('brackets')
            .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
            .eq('event_id', ev.id)
          const podium = deriveEliminationPodium(br ?? [])
          if (!podium) continue
          const mine = podium.find((p) => myParticipants.has(p.participantId))
          if (!mine) continue
          out.push({
            eventId: ev.id as string,
            eventName: ev.name as string,
            sport: ev.sport as string,
            rank: mine.rank,
          })
        }
        out.sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank
          return a.eventName.localeCompare(b.eventName)
        })
        if (!cancelled) setEventFinishes(out)
      } finally {
        if (!cancelled) setFinishesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [athlete?.id])

  useEffect(() => {
    if (!athlete?.id) {
      setMyTeamsSummary([])
      return
    }
    let cancelled = false
    setTeamsSummaryLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select(
          `
          team_id,
          team:teams(
            id,
            name,
            sport,
            roster_context,
            coaches:team_coaches(
              organizer:organizers(profile:profiles!organizers_profile_id_fkey(full_name, email))
            )
          )
        `,
        )
        .eq('athlete_id', athlete.id)
      if (cancelled) return
      setTeamsSummaryLoading(false)
      if (error) {
        console.error(error)
        setMyTeamsSummary([])
        return
      }
      const seen = new Set<string>()
      const list: AthleteTeamSummary[] = []
      for (const row of data ?? []) {
        const t = row.team as ProfileTeamEmbed
        const tid = (t?.id ?? row.team_id) as string
        if (!tid || seen.has(tid)) continue
        seen.add(tid)
        const rosterContext = t?.roster_context === 'tryout' ? 'tryout' : 'official'
        const coaches: AthleteTeamSummary['coaches'] = []
        for (const c of t?.coaches ?? []) {
          const p = c.organizer?.profile
          const full_name = p?.full_name?.trim()
          if (!full_name) continue
          coaches.push({ full_name, email: String(p?.email ?? '').trim() })
        }
        list.push({
          teamId: tid,
          name: t?.name ?? 'Team',
          sport: (t?.sport as string) ?? athlete.sport,
          rosterContext,
          coaches,
        })
      }
      setMyTeamsSummary(list)
    })()
    return () => {
      cancelled = true
    }
  }, [athlete?.id, athlete?.sport])

  if (!profile || !athlete) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>

  const uploadMedical = async (file: File) => {
    setBusy(true)
    setBanner(null)
    try {
      const max = 5 * 1024 * 1024
      if (file.size > max) throw new Error('File must be 5MB or less')
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/medical_cert.${ext}`
      const { error: delErr } = await supabase
        .from('verification_documents')
        .delete()
        .eq('athlete_id', athlete.id)
        .eq('document_type', 'medical_cert')
      if (delErr) throw new Error(delErr.message)
      const { error: upErr } = await supabase.storage.from('verification-documents').upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from('verification-documents').getPublicUrl(path)
      const { error: insErr } = await supabase.from('verification_documents').insert({
        athlete_id: athlete.id,
        document_type: 'medical_cert',
        file_url: urlData.publicUrl,
      })
      if (insErr) throw new Error(insErr.message)
      setPendingMedicalFile(null)
      const wasMedicalRevokedFlow = Boolean(athlete.medical_clearance_revoked_at) && !athlete.medical_cleared
      setBanner({
        kind: 'success',
        text:
          athlete.verification_status === 'approved'
            ? wasMedicalRevokedFlow
              ? 'Medical certificate uploaded. An organizer must grant clearance again before official games.'
              : 'Medical certificate saved. Your organizer can clear you under Athletes → Awaiting medical clearance.'
            : wasMedicalRevokedFlow
              ? 'Medical certificate uploaded. After verification is approved, an organizer can grant clearance again for official games.'
              : 'Medical certificate saved. After your athlete verification is approved, your organizer can mark medical clearance for official games.',
      })
      await fetchProfile(profile.id)
      await refreshMedicalDoc()
    } catch (e: unknown) {
      setBanner({ kind: 'danger', text: e instanceof Error ? e.message : 'Upload failed' })
    } finally {
      setBusy(false)
    }
  }

  const confirmCorUpload = async (file: File) => {
    setCorBusy(true)
    setBanner(null)
    try {
      await uploadEnrollmentCor(profile.id, file)
      setPendingCorFile(null)
      setBanner({
        kind: 'success',
        text: profile.enrollment_verification_reset_at
          ? 'New COR uploaded. An organizer needs to verify your school enrollment again before tryout registration opens for you.'
          : 'COR saved. Keep it up to date if organizers ask for a new upload.',
      })
      await fetchProfile(profile.id)
      await refreshCorDoc()
    } catch (e: unknown) {
      setBanner({ kind: 'danger', text: e instanceof Error ? e.message : 'COR upload failed' })
    } finally {
      setCorBusy(false)
    }
  }

  const statusBadgeVariant =
    athlete.verification_status === 'approved'
      ? 'success'
      : athlete.verification_status === 'rejected'
        ? 'danger'
        : athlete.verification_status === 'under_review'
          ? 'info'
          : ('warning' as const)

  const enrollmentRevokedOnProfile = Boolean(profile.enrollment_verification_reset_at)

  const medicalRevokedByOrganizer = Boolean(athlete.medical_clearance_revoked_at) && !athlete.medical_cleared

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <Card className="flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-2xl font-bold text-[var(--school-secondary)] flex-shrink-0">
          {getInitials(profile.full_name)}
        </div>
        <div>
          <h2 className="font-bold text-xl">{profile.full_name}</h2>
          <p className="text-[var(--text-muted)] text-sm">{profile.email}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="info">
              {getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)}
            </Badge>
            <Badge variant={athlete.season_status === 'active' ? 'success' : 'default'}>{athlete.season_status}</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-4">Athlete Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Student ID</p>
            <p className="font-mono">{athlete.student_id}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Position</p>
            <p>{athlete.position || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Jersey #</p>
            <p>{athlete.jersey_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Year Level</p>
            <p>{athlete.year_level}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[var(--text-muted)] mb-1">Department</p>
            <p>{athlete.department}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#0066FF]" />
          Your teams
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Official teams list your coach here (email link). Tryout squads do not use the coach role until you join competition rosters.
        </p>
        {teamsSummaryLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : myTeamsSummary.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">You are not on a team roster yet.</p>
        ) : (
          <ul className="space-y-3">
            {myTeamsSummary.map((t) => (
              <li key={t.teamId} className="border-b border-[var(--border-subtle)] pb-3 last:border-0">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{getSportLabel(t.sport as any)}</p>
                {t.rosterContext === 'tryout' ? (
                  <p className="text-xs text-[var(--text-muted)] mt-1">Tryout squad</p>
                ) : t.coaches.length > 0 ? (
                  <p className="text-xs mt-1 text-[var(--text-secondary)]">
                    Coach:{' '}
                    {t.coaches.map((c, i) => (
                      <React.Fragment key={`${t.teamId}-${c.email}-${i}`}>
                        {i > 0 ? ', ' : null}
                        {c.email ? (
                          <a href={`mailto:${encodeURIComponent(c.email)}`} className="text-[#0066FF] hover:underline">
                            {c.full_name}
                          </a>
                        ) : (
                          <span>{c.full_name}</span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] mt-1">No coach assigned yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(finishesLoading || eventFinishes.length > 0) && (
        <Card>
          <h3 className="font-bold mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#FFB800]" />
            Competition placements
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Knockout finishes from completed events where your team reached the final (official events only).
          </p>
          {finishesLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : eventFinishes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No recorded final placements yet.</p>
          ) : (
            <ul className="space-y-1">
              {eventFinishes.map((f) => (
                <li
                  key={f.eventId}
                  className="flex flex-wrap items-center gap-2 justify-between py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{f.eventName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{getSportLabel(f.sport as any)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={f.rank === 1 ? 'success' : 'info'} size="sm">
                      {placementRankLabel(f.rank)}
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => navigate(`/athlete/events/${f.eventId}`)}>
                      Event
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <h3 className="font-bold mb-2">Tryout & competition status</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={statusBadgeVariant} className="text-sm px-3 py-1">
            {formatEnumLabel(athlete.verification_status)}
          </Badge>
          {latestMedical && (
            <Badge variant="info" size="sm" className="text-xs">
              Medical certificate on file
            </Badge>
          )}
          {athlete.verification_status === 'approved' && (
            <Badge variant={athlete.medical_cleared ? 'success' : 'warning'} className="text-sm px-3 py-1">
              {athlete.medical_cleared
                ? 'Cleared for official games'
                : medicalRevokedByOrganizer
                  ? 'Medical clearance revoked — resubmit required'
                  : 'Tryout matches only until medical OK'}
            </Badge>
          )}
        </div>
        {medicalRevokedByOrganizer && athlete.verification_status === 'approved' ? (
          <Alert type="warning" className="mt-3">
            An organizer revoked your medical clearance. Upload a renewed certificate below and wait for them to clear you again for official
            games.
          </Alert>
        ) : null}
        {athlete.review_notes && <p className="text-xs text-[var(--text-muted)] mt-2">Note: {athlete.review_notes}</p>}
        <p className="text-sm text-[var(--text-muted)] mt-3">
          School enrollment (COR) is separate. You can upload your medical certificate anytime below. Official competition roster still requires
          athlete verification to be approved, then an organizer marks medical clearance.
        </p>
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Certificate of Registration (COR)</h3>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Enrollment document from student sign-up. Organizers verify this separately from athlete verification and medical clearance.
        </p>
        {corDoc === undefined ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : (
          <>
            {enrollmentRevokedOnProfile && corDoc?.file_url ? (
              <Alert type="warning" className="mb-3">
                Your school enrollment was reset. Upload a fresh COR so organizers can verify you again — for example if your account was moved
                back to student status or your enrollment needs renewal.
              </Alert>
            ) : null}
            {corDoc?.file_url ? (
              <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
                {corDoc.uploaded_at && (
                  <span className="text-[var(--text-muted)]">Uploaded: {new Date(corDoc.uploaded_at).toLocaleString()}</span>
                )}
                <button
                  type="button"
                  className="text-[#0066FF] inline-flex items-center gap-1 hover:underline"
                  onClick={() => setDocPreview({ title: 'Certificate of Registration (COR)', fileUrl: corDoc.file_url })}
                >
                  <Eye className="w-3.5 h-3.5" /> View COR
                </button>
              </div>
            ) : (
              <Alert type="info" className="mb-3">
                No COR on file. Upload your Certificate of Registration (PDF or image, max 5MB).
              </Alert>
            )}
            {(!corDoc?.file_url || enrollmentRevokedOnProfile) ? (
              <label className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-subtle)] cursor-pointer hover:border-[#0066FF]/50">
                <Upload className="w-6 h-6 text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-secondary)]">
                  {corBusy ? 'Uploading…' : corDoc?.file_url ? 'Choose file to replace COR…' : 'Upload COR…'}
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
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <h3 className="font-bold mb-2">Medical certificate</h3>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          PDF or image, max 5MB. Uploading replaces your previous file. Organizers see you under Athletes → Awaiting medical clearance once you
          have a certificate on file or you are approved for tryouts.
        </p>
        {medicalRevokedByOrganizer ? (
          <Alert type="warning" className="mb-3">
            Your medical clearance was revoked. Replace your certificate here so an organizer can review and grant clearance again.
          </Alert>
        ) : null}
        {athlete.verification_status === 'approved' ? (
          <Badge variant={athlete.medical_cleared ? 'success' : 'warning'} className="mb-3">
            {athlete.medical_cleared
              ? 'Cleared to play — official roster'
              : medicalRevokedByOrganizer
                ? 'Awaiting new certificate review'
                : 'Upload if needed, then organizer marks cleared'}
          </Badge>
        ) : (
          <Badge variant="warning" className="mb-3">
            Verification {formatEnumLabel(athlete.verification_status)} — you can still upload; clearance awaits approval
          </Badge>
        )}
        {latestMedical === undefined ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : latestMedical ? (
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
            <span className="text-[var(--text-muted)]">Last upload: {new Date(latestMedical.uploaded_at).toLocaleString()}</span>
            <button
              type="button"
              className="text-[#0066FF] inline-flex items-center gap-1 hover:underline"
              onClick={() => setDocPreview({ title: 'Medical certificate', fileUrl: latestMedical.file_url })}
            >
              <Eye className="w-3.5 h-3.5" /> View current file
            </button>
          </div>
        ) : null}
        <label className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-[var(--border-subtle)] cursor-pointer hover:border-[#0066FF]/50">
          <Upload className="w-6 h-6 text-[var(--text-muted)]" />
          <span className="text-sm text-[var(--text-secondary)]">
            {busy
              ? 'Uploading…'
              : medicalRevokedByOrganizer
                ? 'Choose file to renew medical certificate…'
                : latestMedical
                  ? 'Choose file to replace certificate…'
                  : 'Choose medical certificate file…'}
          </span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPendingMedicalFile(f)
              e.target.value = ''
            }}
          />
        </label>
      </Card>

      <Modal
        open={pendingMedicalFile !== null}
        onClose={() => !busy && setPendingMedicalFile(null)}
        title={
          medicalRevokedByOrganizer
            ? 'Renew medical certificate?'
            : latestMedical
              ? 'Replace medical certificate?'
              : 'Upload medical certificate?'
        }
        size="md"
      >
        {pendingMedicalFile && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {medicalRevokedByOrganizer
                ? 'Your clearance was revoked. Uploading replaces your file so an organizer can review and grant clearance again.'
                : latestMedical
                  ? 'This removes your current file from your profile and uploads the new one. Organizers always see your latest certificate.'
                  : 'Your file will be stored as your medical certificate. PDF or image, max 5MB.'}
            </p>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Selected file</p>
              <p className="font-medium truncate">{pendingMedicalFile.name}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{(pendingMedicalFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setPendingMedicalFile(null)}>
                Cancel
              </Button>
              <Button type="button" loading={busy} onClick={() => void uploadMedical(pendingMedicalFile)}>
                Confirm upload
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
                ? 'This replaces your COR on file. Organizers review the latest upload while your enrollment is being reset or renewed.'
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
        open={docPreview !== null}
        onClose={() => setDocPreview(null)}
        title={docPreview?.title ?? ''}
        fileUrl={docPreview?.fileUrl}
      />

      {athlete.verification_status === 'pending' || athlete.verification_status === 'under_review' ? (
        <Alert type="info">
          Upload your medical certificate above whenever it is ready. If verification stays on pending after tryout selection, contact your
          organizer (Organizer → Athletes).
        </Alert>
      ) : null}

      {athlete.verification_status === 'rejected' && (
        <Alert type="danger">Your athlete verification was rejected. Reason: {athlete.review_notes || 'No reason provided.'} Contact your organizer.</Alert>
      )}

      {banner && (
        <Alert type={banner.kind === 'danger' ? 'danger' : 'success'} className="mb-0">
          {banner.text}
        </Alert>
      )}
    </div>
  )
}
