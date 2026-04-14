import React, { useEffect } from 'react'
import { Bell, Check } from 'lucide-react'
import { Button, Card, EmptyState, Badge } from '../../components/ui'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAuthStore } from '../../stores/authStore'
import { formatDateTime } from '../../lib/utils'

export default function AthleteNotifications() {
  const { profile } = useAuthStore()
  const { notifications, fetchNotifications, markRead, markAllRead } = useNotificationStore()

  useEffect(() => {
    if (profile) fetchNotifications(profile.id)
  }, [profile])

  const unread = notifications.filter(n => !n.read)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-[var(--text-muted)] text-sm">{unread.length} unread</p>
        </div>
        {unread.length > 0 && (
          <Button size="sm" variant="secondary" icon={<Check className="w-3.5 h-3.5" />} onClick={() => profile && markAllRead(profile.id)}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="w-10 h-10" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={`cursor-pointer ${!n.read ? 'border-[#0066FF]/30 bg-[#0066FF]/5' : ''}`}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className="flex items-start gap-3">
                {!n.read && <div className="w-2 h-2 rounded-full bg-[#0066FF] mt-1 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{n.title}</p>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{n.body}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
