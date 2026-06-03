import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import {
  INSTITUTION_LOGO_ALLOWED_MIMES,
  INSTITUTION_LOGO_MAX_BYTES,
  uploadInstitutionLogoBuffer,
} from '../utils/institutionLogoStorage'

const router = Router()

const institutionLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INSTITUTION_LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (INSTITUTION_LOGO_ALLOWED_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only JPEG, PNG, WebP, or SVG images are allowed'))
  },
})

// Get platform stats
router.get('/stats', requireAuth, requireRole('Admin', 'Organizer'), async (_req, res) => {
  const [athletes, events, seasons, rosterPending, medicalDocs] = await Promise.all([
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('verification_status', 'approved'),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('seasons').select('id').eq('status', 'active').single(),
    supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .in('verification_status', ['pending', 'under_review']),
    supabase.from('verification_documents').select('athlete_id').eq('document_type', 'medical_cert'),
  ])

  const certAthleteIds = [...new Set((medicalDocs.data ?? []).map((r: { athlete_id: string }) => r.athlete_id))]
  let medCertReviewQueue = 0
  if (certAthleteIds.length > 0) {
    const { count } = await supabase
      .from('athletes')
      .select('id', { count: 'exact', head: true })
      .eq('medical_cleared', false)
      .in('id', certAthleteIds)
    medCertReviewQueue = count ?? 0
  }

  const pendingVerifications = (rosterPending.count ?? 0) + medCertReviewQueue

  res.json({
    totalAthletes: athletes.count ?? 0,
    activeEvents: events.count ?? 0,
    currentSeason: seasons.data,
    pendingVerifications,
  })
})

// List organizers (super admin)
router.get('/organizers', requireAuth, requireRole('Admin'), async (_req, res) => {
  const { data, error } = await supabase
    .from('organizers')
    .select('*, profile:profiles!organizers_profile_id_fkey(id, full_name, email, avatar_url, role, department)')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

// Create organizer account (no email — super admin sets password and shares credentials)
router.post('/organizers', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    full_name: z.string().min(1),
    role: z.enum(['Organizer', 'Coach']),
    department: z.enum(['SBMA', 'SECA', 'SASE', 'SHS']),
    assigned_sports: z.array(z.string()).default([]),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  }).refine((v) => v.role === 'Coach' || v.assigned_sports.length > 0, {
    message: 'Assign at least one sport to organizers',
    path: ['assigned_sports'],
  })

  try {
    const parsed = schema.parse(req.body)
    const email = parsed.email.trim().toLowerCase()
    const full_name = parsed.full_name.trim()
    const role = parsed.role
    const department = parsed.department
    const assigned_sports = parsed.assigned_sports
    const password = parsed.password

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name, department },
    })

    if (authError || !authData?.user?.id) {
      const msg = authError?.message ?? 'Could not create staff account'
      if (/already registered|already exists/i.test(msg)) {
        return res.status(400).json({
          error: 'An account with this email already exists. Remove them in Supabase Auth or use another email.',
        })
      }
      throw new Error(msg)
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: authData.user.id,
      email,
      full_name,
      role,
      department,
    })
    if (profileError) throw new Error(profileError.message)

    const { error: organizerError } = await supabase.from('organizers').upsert({
      profile_id: authData.user.id,
      assigned_sports,
      is_active: true,
      invited_by: req.user!.id,
    })
    if (organizerError) throw new Error(organizerError.message)

    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'staff_created',
      entity_type: 'staff',
      entity_id: authData.user.id,
      details: { email, role, department, assigned_sports },
    })
    if (auditError) throw new Error(auditError.message)

    res.status(201).json({
      success: true,
      message: `${role} account created for ${email}. They can sign in with this email and the password you set.`,
    })
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' })
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create staff failed' })
  }
})

// Toggle organizer active status
router.patch('/organizers/:id/toggle', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { data: organizer } = await supabase
    .from('organizers')
    .select('is_active, profile_id')
    .eq('id', req.params.id)
    .single()
  if (!organizer) return res.status(404).json({ error: 'Organizer not found' })

  const nextActive = !organizer.is_active

  const { data, error: updErr } = await supabase
    .from('organizers')
    .update({ is_active: nextActive })
    .eq('id', req.params.id)
    .select()
    .single()
  if (updErr) return res.status(500).json({ error: updErr.message })

  // Revoke Auth refresh tokens / sessions when deactivating (admin signOut requires their JWT; ban pulse invalidates sessions).
  if (organizer.is_active && !nextActive && organizer.profile_id) {
    const { error: banErr } = await supabase.auth.admin.updateUserById(organizer.profile_id, { ban_duration: '10s' })
    if (banErr) console.warn('[admin] organizer deactivate ban:', banErr.message)
    const { error: unbanErr } = await supabase.auth.admin.updateUserById(organizer.profile_id, { ban_duration: 'none' })
    if (unbanErr) console.warn('[admin] organizer deactivate unban:', unbanErr.message)
  }

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: organizer.is_active ? 'organizer_deactivated' : 'organizer_activated',
    entity_type: 'staff',
    entity_id: req.params.id,
    details: {},
  })

  res.json(data)
})

// Season management
router.post('/seasons', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
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
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'season_created',
      entityType: 'season',
      entityId: data.id,
      details: { name: body.name },
    })
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create season failed' })
  }
})

router.patch('/seasons/:id/status', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
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

router.post(
  '/institution/logo',
  requireAuth,
  requireRole('Admin'),
  (req, res, next) => {
    institutionLogoUpload.single('file')(req, res, (err: unknown) => {
      if (err instanceof Error) return res.status(400).json({ error: err.message })
      if (err) return res.status(400).json({ error: 'Upload failed' })
      next()
    })
  },
  async (req: AuthRequest, res) => {
    try {
      const file = req.file
      if (!file?.buffer) return res.status(400).json({ error: 'No file uploaded' })

      const { publicUrl } = await uploadInstitutionLogoBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        folder: 'school',
      })

      const { data, error } = await supabase
        .from('institution')
        .update({ logo_url: publicUrl })
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
        .single()

      if (error) return res.status(500).json({ error: error.message })

      await supabase.from('audit_logs').insert({
        actor_id: req.user!.id,
        action: 'institution_logo_updated',
        entity_type: 'institution',
        entity_id: null,
        details: { logo_url: publicUrl },
      })

      res.json(data)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      res.status(400).json({ error: message })
    }
  },
)

// Update institution (school profile)
router.patch('/institution', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
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
router.get('/audit', requireAuth, requireRole('Admin'), async (req, res) => {
  const limit = Number(req.query.limit) || 50
  const offset = Number(req.query.offset) || 0

  const { data, error, count } = await supabase
    .from('audit_logs')
    .select('*, actor:profiles(full_name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ data, total: count })
})

// Repair stale player_season_stats row (games_played / JSON aggregates) from player_game_stats via DB RPC
router.post('/recompute-player-season-stats', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    athlete_id: z.string().uuid(),
    season_id: z.string().uuid(),
  })

  try {
    const { athlete_id, season_id } = schema.parse(req.body)

    const { error } = await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: athlete_id,
      p_season_id: season_id,
    })

    if (error) return res.status(400).json({ error: error.message })

    const { data: row, error: selErr } = await supabase
      .from('player_season_stats')
      .select('*')
      .eq('athlete_id', athlete_id)
      .eq('season_id', season_id)
      .maybeSingle()

    if (selErr) return res.status(500).json({ error: selErr.message })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'player_season_stats_recomputed',
      entity_type: 'athlete',
      entity_id: athlete_id,
      details: { season_id },
    })

    res.json({ ok: true, player_season_stats: row })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }
})

export default router
