import React from 'react'
import { Card, Badge, StatCard } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, getInitials } from '../../lib/utils'

export default function AthleteProfile() {
  const { profile, athlete } = useAuthStore()

  if (!profile || !athlete) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>

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
          <div className="flex gap-2 mt-2">
            <Badge variant="info">{getSportIcon(athlete.sport as any)} {getSportLabel(athlete.sport as any)}</Badge>
            <Badge variant={athlete.season_status === 'active' ? 'success' : 'default'}>
              {athlete.season_status}
            </Badge>
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
        <h3 className="font-bold mb-2">Verification Status</h3>
        <Badge variant={
          athlete.verification_status === 'approved' ? 'success' :
          athlete.verification_status === 'rejected' ? 'danger' :
          athlete.verification_status === 'under_review' ? 'info' : 'warning'
        } className="text-sm px-3 py-1">
          {athlete.verification_status.replace('_', ' ').toUpperCase()}
        </Badge>
        {athlete.review_notes && (
          <p className="text-xs text-[var(--text-muted)] mt-2">Note: {athlete.review_notes}</p>
        )}
      </Card>
    </div>
  )
}
