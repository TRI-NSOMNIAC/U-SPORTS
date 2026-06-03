import { Router } from 'express'
import { z, type ZodIssue } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'

const router = Router()

/** HTML datetime-local uses `YYYY-MM-DDTHH:mm` without a timezone; Zod's default `.datetime()` expects a trailing `Z`. */
function localDatetimeStringToIso(input: string): string {
  const trimmed = input.trim()
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed
  const d = new Date(withSeconds)
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date and time')
  return d.toISOString()
}

const optionalTimestamptzFromPicker = z.preprocess(
  (val) => (val === '' || val === null ? undefined : val),
  z
    .string()
    .datetime({ local: true })
    .optional()
    .transform((s) => (s === undefined ? undefined : localDatetimeStringToIso(s)))
)

function formatAnnouncementValidationIssues(issues: ZodIssue[]): string {
  const messages: string[] = []
  const seen = new Set<string>()
  for (const issue of issues) {
    const pathKey = issue.path.length ? String(issue.path[0]) : ''
    let msg: string
    if (pathKey === 'body' && issue.code === 'too_small') {
      msg = 'Message body cannot be empty.'
    } else if (pathKey === 'title' && issue.code === 'too_small') {
      msg = 'Title cannot be empty.'
    } else if (pathKey === 'expires_at') {
      msg = 'Expiration date is invalid. Leave it empty for no expiry, or pick a valid date and time.'
    } else if (pathKey === 'new_scheduled_at') {
      msg =
        issue.code === z.ZodIssueCode.custom
          ? issue.message
          : 'New date and time is invalid. Choose a valid date and time for the reschedule.'
    } else if (pathKey) {
      msg = `${pathKey.replace(/_/g, ' ')}: ${issue.message}`
    } else {
      msg = issue.message
    }
    if (!seen.has(msg)) {
      seen.add(msg)
      messages.push(msg)
    }
  }
  return messages.join(' ')
}

type AnnouncementDisplayMode = 'banner' | 'notification_only' | 'hero_slider'

/** Older DBs (pre-migration 023) only allow banner + notification_only. Try requested mode first, then downgrade. */
function displayModeInsertAttempts(requested: AnnouncementDisplayMode): AnnouncementDisplayMode[] {
  const order: AnnouncementDisplayMode[] = [requested]
  if (requested === 'hero_slider') {
    order.push('banner', 'notification_only')
  } else if (requested === 'banner') {
    order.push('notification_only')
  }
  const seen = new Set<AnnouncementDisplayMode>()
  return order.filter((m) => {
    if (seen.has(m)) return false
    seen.add(m)
    return true
  })
}

// Get announcements
router.get('/', async (req, res) => {
  let query = supabase
    .from('announcements')
    .select('*, creator:profiles(full_name)')
    .order('published_at', { ascending: false })

  if (req.query.public === 'true') query = query.eq('is_public', true)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Create announcement
router.post('/', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const schema = z
    .object({
      type: z.enum(['emergency', 'reschedule', 'reminder', 'system']),
      title: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1)),
      body: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1)),
      urgency: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
      audience_type: z.enum(['all', 'sport', 'event', 'team']).default('all'),
      audience_id: z.string().uuid().optional(),
      is_public: z.boolean().default(false),
      linked_match_id: z.string().uuid().optional(),
      new_scheduled_at: optionalTimestamptzFromPicker,
      new_venue: z.string().optional(),
      expires_at: optionalTimestamptzFromPicker,
      display_mode: z.enum(['banner', 'notification_only', 'hero_slider']).default('notification_only'),
    })
    .superRefine((data, ctx) => {
      if (data.type === 'reschedule' && !data.new_scheduled_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'New date and time is required when the announcement type is Reschedule.',
          path: ['new_scheduled_at'],
        })
      }
    })

  try {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatAnnouncementValidationIssues(parsed.error.issues) })
    }
    const body = parsed.data

    const insertBase = {
      type: body.type,
      title: body.title,
      body: body.body,
      urgency: body.urgency,
      audience_type: body.audience_type,
      audience_id: body.audience_id ?? null,
      is_public: body.is_public,
      linked_match_id: body.linked_match_id ?? null,
      new_scheduled_at: body.new_scheduled_at ?? null,
      new_venue: body.new_venue ?? null,
      expires_at: body.expires_at ?? null,
      created_by: req.user!.id,
    }

    let announcement: { id: string } | null = null
    let lastInsertError: { message: string } | null = null

    for (const display_mode of displayModeInsertAttempts(body.display_mode)) {
      const { data, error } = await supabase
        .from('announcements')
        .insert({ ...insertBase, display_mode })
        .select()
        .single()

      if (!error && data) {
        announcement = data
        break
      }
      lastInsertError = error ?? { message: 'Insert failed' }
      const msg = lastInsertError.message ?? ''
      if (!msg.includes('announcements_display_mode_check')) {
        throw new Error(msg)
      }
    }

    if (!announcement) {
      throw new Error(lastInsertError?.message ?? 'Create failed')
    }

    // If reschedule, update the linked match
    if (body.type === 'reschedule' && body.linked_match_id && body.new_scheduled_at) {
      await supabase
        .from('matches')
        .update({
          scheduled_at: body.new_scheduled_at,
          ...(body.new_venue ? { venue: body.new_venue } : {}),
        })
        .eq('id', body.linked_match_id)
    }

    // Determine affected recipients and create notifications
    await broadcastNotification(body, announcement.id, req.user!.id)

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'announcement_created',
      entity_type: 'announcement',
      entity_id: announcement.id,
      details: { type: body.type, urgency: body.urgency, audience_type: body.audience_type },
    })

    res.status(201).json(announcement)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

// Delete announcement
router.delete('/:id', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const announcementId = req.params.id
  const { data: ann } = await supabase
    .from('announcements')
    .select('title, type')
    .eq('id', announcementId)
    .maybeSingle()

  await supabase.from('announcements').delete().eq('id', announcementId)

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'announcement_deleted',
    entityType: 'announcement',
    entityId: announcementId,
    details: ann ? { title: ann.title, type: ann.type } : {},
  })

  res.json({ success: true })
})

async function broadcastNotification(
  announcement: { type: string; title: string; body: string; audience_type: string; audience_id?: string; urgency: string },
  announcementId: string,
  actorId: string
) {
  let recipientIds: string[] = []

  if (announcement.audience_type === 'all') {
    const { data: athletes } = await supabase
      .from('athletes')
      .select('profile_id')
      .eq('verification_status', 'approved')
    recipientIds = (athletes ?? []).map((a: { profile_id: string }) => a.profile_id)
  } else if (announcement.audience_type === 'sport' && announcement.audience_id) {
    const { data: athletes } = await supabase
      .from('athletes')
      .select('profile_id')
      .eq('sport', announcement.audience_id)
      .eq('verification_status', 'approved')
    recipientIds = (athletes ?? []).map((a: { profile_id: string }) => a.profile_id)
  } else if (announcement.audience_type === 'team' && announcement.audience_id) {
    const { data: members } = await supabase
      .from('team_members')
      .select('athlete:athletes(profile_id)')
      .eq('team_id', announcement.audience_id)
    recipientIds = (members ?? []).map((m: any) => m.athlete?.profile_id).filter(Boolean)
  }

  if (recipientIds.length === 0) return

  const notifications = recipientIds.map((id) => ({
    recipient_id: id,
    type: `announcement_${announcement.type}`,
    title: announcement.title,
    body: announcement.body,
    data: { announcement_id: announcementId, urgency: announcement.urgency },
  }))

  // Insert in batches of 100
  for (let i = 0; i < notifications.length; i += 100) {
    await supabase.from('notifications').insert(notifications.slice(i, i + 100))
  }
}

export default router
