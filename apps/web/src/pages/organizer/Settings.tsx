import React from 'react'
import { Card, Badge } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { getSportLabel, getSportIcon, getInitials } from '../../lib/utils'

export default function OrganizerSettings() {
  const { profile, organizer } = useAuthStore()

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-sm">Your organizer account details</p>
      </div>

      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-[var(--school-primary)] flex items-center justify-center text-xl font-bold text-[var(--school-secondary)]">
            {getInitials(profile?.full_name ?? 'O')}
          </div>
          <div>
            <h2 className="font-bold text-lg">{profile?.full_name}</h2>
            <p className="text-sm text-[var(--text-muted)]">{profile?.email}</p>
            <Badge variant="info" size="sm" className="mt-1">
              {profile?.role === 'super_admin' ? 'Super Admin' : 'Organizer'}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase mb-2">Assigned Sports</p>
            <div className="flex gap-2 flex-wrap">
              {(organizer?.assigned_sports ?? []).map(s => (
                <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-sm">
                  <span>{getSportIcon(s as any)}</span>
                  <span>{getSportLabel(s as any)}</span>
                </div>
              ))}
              {(organizer?.assigned_sports ?? []).length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">No sports assigned</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase mb-2">Account Status</p>
            <Badge variant={organizer?.is_active ? 'success' : 'danger'}>
              {organizer?.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  )
}
