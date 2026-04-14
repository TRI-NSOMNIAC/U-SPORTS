import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

// Get platform stats
router.get('/stats', requireAuth, requireRole('super_admin', 'organizer'), async (_req, res) => {
  const [athletes, events, seasons, pending] = await Promise.all([
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('verification_status', 'approved'),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('seasons').select('id').eq('status', 'active').single(),
    supabase.from('athletes').select('id', { count: 'exact', head: true }).in('verification_status', ['pending', 'under_review']),
  ])

  res.json({
    totalAthletes: athletes.count ?? 0,
    activeEvents: events.count ?? 0,
    currentSeason: seasons.data,
    pendingVerifications: pending.count ?? 0,
  })
})

// Invite organizer
router.post('/organizers/invite', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    email: z.string().email(),
    full_name: z.string().min(1),
    assigned_sports: z.array(z.string()),
  })

  try {
    const { email, full_name, assigned_sports } = schema.parse(req.body)

    const { data: institution } = await supabase.from('institution').select('staff_email_domain').single()
    const staffDomain = institution?.staff_email_domain ?? 'nu-dasma.edu.ph'

    if (!email.endsWith(`@${staffDomain}`)) {
      return res.status(400).json({ error: `Email must be @${staffDomain}` })
    }

    // Create auth user and send invite
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: 'organizer' },
    })

    if (authError) throw new Error(authError.message)

    // Profile is auto-created by trigger; ensure organizer record
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email,
      full_name,
      role: 'organizer',
    })

    await supabase.from('organizers').upsert({
      profile_id: authData.user.id,
      assigned_sports,
      is_active: true,
      invited_by: req.user!.id,
    })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'organizer_invited',
      entity_type: 'organizer',
      entity_id: authData.user.id,
      details: { email, assigned_sports },
    })

    res.json({ success: true, message: `Invitation sent to ${email}` })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invite failed' })
  }
})

// Toggle organizer active status
router.patch('/organizers/:id/toggle', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const { data: organizer } = await supabase.from('organizers').select('is_active').eq('id', req.params.id).single()
  if (!organizer) return res.status(404).json({ error: 'Organizer not found' })

  const { data } = await supabase
    .from('organizers')
    .update({ is_active: !organizer.is_active })
    .eq('id', req.params.id)
    .select()
    .single()

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: organizer.is_active ? 'organizer_deactivated' : 'organizer_activated',
    entity_type: 'organizer',
    entity_id: req.params.id,
    details: {},
  })

  res.json(data)
})

// Season management
router.post('/seasons', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(1),
    start_date: z.string(),
    end_date: z.string(),
  })
  try {
    const body = schema.parse(req.body)
    const { data, error } = await supabase
      .from('seasons')
      .insert({ ...body, status: 'draft', created_by: req.user!.id })
      .select()
      .single()
    if (error) throw new Error(error.message)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create season failed' })
  }
})

router.patch('/seasons/:id/status', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.enum(['draft', 'active', 'completed', 'archived']) }).parse(req.body)

  // Only one season can be active
  if (status === 'active') {
    await supabase.from('seasons').update({ status: 'completed' }).eq('status', 'active')
  }

  const { data, error } = await supabase.from('seasons').update({ status }).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: `season_${status}`,
    entity_type: 'season',
    entity_id: req.params.id,
    details: {},
  })

  res.json(data)
})

// Update institution (school profile)
router.patch('/institution', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
  const { data, error } = await supabase.from('institution').update(req.body).neq('id', '00000000-0000-0000-0000-000000000000').select().single()
  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: 'institution_updated',
    entity_type: 'institution',
    entity_id: null,
    details: req.body,
  })

  res.json(data)
})

// Get audit logs
router.get('/audit', requireAuth, requireRole('super_admin'), async (req, res) => {
  const limit = Number(req.query.limit) || 50
  const offset = Number(req.query.offset) || 0

  const { data, error, count } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

export default router
