import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

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
router.post('/', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    type: z.enum(['emergency', 'reschedule', 'reminder', 'system']),
    title: z.string().min(1),
    body: z.string().min(1),
    urgency: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
    audience_type: z.enum(['all', 'sport', 'event', 'team']).default('all'),
    audience_id: z.string().uuid().optional(),
    is_public: z.boolean().default(false),
    linked_match_id: z.string().uuid().optional(),
    new_scheduled_at: z.string().datetime().optional(),
    new_venue: z.string().optional(),
    expires_at: z.string().datetime().optional(),
  })

  try {
    const body = schema.parse(req.body)

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert({ ...body, created_by: req.user!.id })
      .select()
      .single()

    if (error) throw new Error(error.message)

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
router.delete('/:id', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  await supabase.from('announcements').delete().eq('id', req.params.id)
  res.json({ success: true })
})

async function broadcastNotification(
  announcement: { type: string; title: string; body: string; audience_type: string; audience_id?: string; urgency: string },
  announcementId: string,
  actorId: string
) {
  let recipientIds: string[] = []

  if (announcement.audience_type === 'all') {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'athlete')
    recipientIds = (profiles ?? []).map((p: { id: string }) => p.id)
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
