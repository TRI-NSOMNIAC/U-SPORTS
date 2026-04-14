import React, { useEffect, useState } from 'react'
import { AlertTriangle, X, Info, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Announcement } from '../../types'
import { cn, formatDateTime } from '../../lib/utils'

interface Props {
  publicOnly?: boolean
}

export default function AnnouncementBanner({ publicOnly }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let query = supabase
      .from('announcements')
      .select('*')
      .in('urgency', ['critical', 'high'])
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('published_at', { ascending: false })

    if (publicOnly) {
      query = query.eq('is_public', true)
    }

    query.then(({ data }) => {
      setAnnouncements(data ?? [])
    })

    const channel = supabase
      .channel('announcements-banner')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (payload) => {
        const a = payload.new as Announcement
        if (a.urgency === 'critical' || a.urgency === 'high') {
          if (!publicOnly || a.is_public) {
            setAnnouncements((prev) => [a, ...prev])
          }
        }
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [publicOnly])

  const visible = announcements.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="z-20">
      {visible.map((a) => (
        <div
          key={a.id}
          className={cn(
            'flex items-start gap-3 px-6 py-3 text-sm animate-slide-down',
            a.urgency === 'critical'
              ? 'bg-[#FF3355]/15 border-b border-[#FF3355]/30'
              : 'bg-[#FFB800]/10 border-b border-[#FFB800]/30'
          )}
        >
          {a.urgency === 'critical' ? (
            <AlertTriangle className="w-4 h-4 text-[#FF3355] flex-shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-4 h-4 text-[#FFB800] flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <span className={cn('font-semibold mr-2', a.urgency === 'critical' ? 'text-[#FF3355]' : 'text-[#FFB800]')}>
              {a.type === 'emergency' ? '⚠ EMERGENCY' : a.type === 'reschedule' ? '📅 RESCHEDULED' : a.title}
            </span>
            <span className="text-[var(--text-secondary)]">{a.body}</span>
            {a.new_scheduled_at && (
              <span className="ml-2 text-[var(--text-muted)] text-xs">
                New time: {formatDateTime(a.new_scheduled_at)}
                {a.new_venue && ` · ${a.new_venue}`}
              </span>
            )}
          </div>
          <button
            onClick={() => setDismissed((prev) => new Set([...prev, a.id]))}
            className="text-[var(--text-muted)] hover:text-white transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
