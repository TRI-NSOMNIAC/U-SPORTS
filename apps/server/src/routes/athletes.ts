import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { respondIfSportForbidden } from '../utils/organizerSportAccess'
import supabase from '../utils/supabase'

const router = Router()

/** Bump marker when organizer sets medical_cleared false (including already-false declines). */
async function bumpMedicalClearanceRevokedMarker(athleteId: string): Promise<void> {
  const { error } = await supabase.rpc('organizer_mark_medical_clearance_revoked', {
    p_athlete_id: athleteId,
  })
  if (error) throw new Error(error.message)
}

// Get all athletes (with filters)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.query.medical_clearance_queue === 'true') {
    if (!['Organizer', 'Admin', 'Coach'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const { data: docRows, error: docErr } = await supabase
      .from('verification_documents')
      .select('athlete_id')
      .eq('document_type', 'medical_cert')
    if (docErr) return res.status(500).json({ error: docErr.message })
    const withMedicalUpload = new Set((docRows ?? []).map((r: { athlete_id: string }) => r.athlete_id))

    // has_med_cert=true: only athletes who actually uploaded a certificate (med cert review queue)
    const onlyWithCert = req.query.has_med_cert === 'true'

    let query = supabase
      .from('athletes')
      .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email, avatar_url), docs:verification_documents(*)')
      .eq('medical_cleared', false)
      .order('created_at', { ascending: false })

    if (req.query.sport) query = query.eq('sport', req.query.sport as string)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    const filtered = (data ?? []).filter(
      (a: { id: string; verification_status: string }) => {
        const hasCert = withMedicalUpload.has(a.id)
        if (onlyWithCert) return hasCert
        return a.verification_status === 'approved' || hasCert
      }
    )
    return res.json(filtered)
  }

  let query = supabase
    .from('athletes')
    .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email, avatar_url), docs:verification_documents(*)')
    .order('created_at', { ascending: false })

  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.verification_status) query = query.eq('verification_status', req.query.verification_status as string)
  if (req.query.season_status) query = query.eq('season_status', req.query.season_status as string)
  if (req.query.medical_cleared === 'true') query = query.eq('medical_cleared', true)
  if (req.query.medical_cleared === 'false') query = query.eq('medical_cleared', false)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

/** Bulk medical / season updates for organizers and super admins */
router.patch('/bulk', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const schema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    action: z.enum(['revoke_clearance', 'set_inactive', 'set_active']),
  })
  try {
    const body = schema.parse(req.body)
    const { data: rows, error } = await supabase.from('athletes').select('id, sport').in('id', body.ids)
    if (error) return res.status(500).json({ error: error.message })
    const found = new Set((rows ?? []).map((r: { id: string }) => r.id))
    for (const id of body.ids) {
      if (!found.has(id)) return res.status(400).json({ error: 'One or more athlete IDs are invalid' })
    }
    const sports = [...new Set((rows ?? []).map((r: { sport: string }) => r.sport))]
    for (const sport of sports) {
      if (await respondIfSportForbidden(req, res, sport)) return
    }

    if (body.action === 'revoke_clearance') {
      const { error: uErr } = await supabase.from('athletes').update({ medical_cleared: false }).in('id', body.ids)
      if (uErr) return res.status(500).json({ error: uErr.message })
      for (const aid of body.ids) {
        try {
          await bumpMedicalClearanceRevokedMarker(aid)
        } catch (e: unknown) {
          return res.status(500).json({ error: e instanceof Error ? e.message : 'Medical marker update failed' })
        }
      }
      await supabase.from('audit_logs').insert(
        body.ids.map((entity_id) => ({
          actor_id: req.user!.id,
          action: 'athlete_medical_revoked',
          entity_type: 'athlete',
          entity_id,
          details: { bulk: true },
        })),
      )
    } else if (body.action === 'set_inactive') {
      const { error: uErr } = await supabase.from('athletes').update({ season_status: 'inactive' }).in('id', body.ids)
      if (uErr) return res.status(500).json({ error: uErr.message })
      await supabase.from('audit_logs').insert(
        body.ids.map((entity_id) => ({
          actor_id: req.user!.id,
          action: 'athlete_season_status_inactive',
          entity_type: 'athlete',
          entity_id,
          details: { bulk: true },
        })),
      )
    } else {
      const { error: uErr } = await supabase.from('athletes').update({ season_status: 'active' }).in('id', body.ids)
      if (uErr) return res.status(500).json({ error: uErr.message })
      await supabase.from('audit_logs').insert(
        body.ids.map((entity_id) => ({
          actor_id: req.user!.id,
          action: 'athlete_season_status_active',
          entity_type: 'athlete',
          entity_id,
          details: { bulk: true },
        })),
      )
    }

    res.json({ success: true, updated: body.ids.length })
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Bulk update failed' })
  }
})

/** One-time season transition: clear medical clearance and deactivate season for all approved athletes */
router.post('/reset-season-clearance', requireAuth, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { data: updated, error } = await supabase
    .from('athletes')
    .update({ medical_cleared: false, season_status: 'inactive' })
    .eq('verification_status', 'approved')
    .select('id')
  if (error) return res.status(500).json({ error: error.message })

  const ids = (updated ?? []).map((r: { id: string }) => r.id)
  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: 'athlete_reset_season_clearance_bulk',
    entity_type: 'bulk_operation',
    entity_id: null,
    details: { athlete_count: ids.length, athlete_ids: ids.slice(0, 2000) },
  })

  res.json({ success: true, updated: ids.length })
})

// Legacy: athlete-submitted COR (deprecated — enrollment COR is on student signup; athletes use medical clearance)
router.post('/me/submit-cor', requireAuth, async (req: AuthRequest, res) => {
  if (req.user!.role !== 'Athlete') {
    return res.status(403).json({ error: 'Athletes only' })
  }

  const schema = z.object({
    file_url: z.string().url(),
    document_type: z.enum(['cor']).optional().default('cor'),
  })

  try {
    const body = schema.parse(req.body)

    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id, verification_status')
      .eq('profile_id', req.user!.id)
      .maybeSingle()

    if (athErr || !athlete) {
      return res.status(404).json({ error: 'Athlete roster profile not found' })
    }

    const { error: docErr } = await supabase.from('verification_documents').insert({
      athlete_id: athlete.id,
      document_type: body.document_type,
      file_url: body.file_url,
    })

    if (docErr) return res.status(400).json({ error: docErr.message })

    const { data: updated, error: updErr } = await supabase
      .from('athletes')
      .update({
        verification_status: 'under_review',
        review_notes: null,
        reviewer_id: null,
        reviewed_at: null,
      })
      .eq('id', athlete.id)
      .select()
      .single()

    if (updErr) return res.status(500).json({ error: updErr.message })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'athlete_submit_cor',
      entity_type: 'athlete',
      entity_id: athlete.id,
      details: {},
    })

    res.json(updated)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Submit failed' })
  }
})

// Get pending verification queue
router.get('/pending', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (_req, res) => {
  const { data, error } = await supabase
    .from('athletes')
    .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email), docs:verification_documents(*)')
    .in('verification_status', ['pending', 'under_review'])
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Review athlete (approve/reject)
router.patch('/:id/review', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const schema = z.object({
    status: z.enum(['approved', 'rejected', 'under_review']),
    notes: z.string().optional(),
  })

  try {
    const { status, notes } = schema.parse(req.body)
    const { data, error } = await supabase
      .from('athletes')
      .update({
        verification_status: status,
        review_notes: notes ?? null,
        reviewer_id: req.user!.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Create notification for athlete
    if (status === 'approved' || status === 'rejected') {
      const { data: athlete } = await supabase
        .from('athletes')
        .select('profile_id')
        .eq('id', req.params.id)
        .single()

      if (athlete) {
        await supabase.from('notifications').insert({
          recipient_id: athlete.profile_id,
          type: `verification_${status}`,
          title: status === 'approved' ? '✅ Verification Approved' : '❌ Verification Rejected',
          body:
            status === 'approved'
              ? 'Your athlete profile has been approved. Welcome to U-Sports!'
              : `Your verification was rejected. Reason: ${notes ?? 'Please resubmit your documents.'}`,
          data: { athleteId: req.params.id },
        })
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: `athlete_verification_${status}`,
      entity_type: 'athlete',
      entity_id: req.params.id,
      details: { status, notes },
    })

    res.json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Review failed' })
  }
})

// Toggle season status (active/inactive)
router.patch('/:id/season-status', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const { season_status } = z.object({ season_status: z.enum(['active', 'inactive']) }).parse(req.body)

  const { data, error } = await supabase
    .from('athletes')
    .update({ season_status })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await supabase.from('audit_logs').insert({
    actor_id: req.user!.id,
    action: `athlete_season_status_${season_status}`,
    entity_type: 'athlete',
    entity_id: req.params.id,
    details: { season_status },
  })

  res.json(data)
})

router.patch('/:id/medical-clearance', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const schema = z.object({ medical_cleared: z.boolean() })
  try {
    const { medical_cleared } = schema.parse(req.body)
    const rawId = req.params.id
    const athleteId = z.string().uuid().parse(Array.isArray(rawId) ? rawId[0] : rawId)

    const { data: ath, error: athErr } = await supabase
      .from('athletes')
      .select('verification_status')
      .eq('id', athleteId)
      .single()
    if (athErr || !ath) return res.status(404).json({ error: 'Athlete not found' })
    if (medical_cleared && ath.verification_status !== 'approved') {
      return res.status(400).json({
        error:
          'Athlete verification must be approved before medical clearance for official competition. They can still upload their certificate in advance.',
      })
    }

    const { data, error } = await supabase
      .from('athletes')
      .update({ medical_cleared })
      .eq('id', athleteId)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })

    if (!medical_cleared) {
      try {
        await bumpMedicalClearanceRevokedMarker(athleteId)
      } catch (e: unknown) {
        return res.status(500).json({ error: e instanceof Error ? e.message : 'Medical marker update failed' })
      }
    }

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: medical_cleared ? 'athlete_medical_cleared' : 'athlete_medical_revoked',
      entity_type: 'athlete',
      entity_id: athleteId,
      details: {},
    })
    res.json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
  }
})

router.patch('/:id/roster-details', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (req: AuthRequest, res) => {
  const schema = z.object({
    position: z.string().trim().max(120).optional(),
    jersey_number: z.union([z.string().regex(/^\d{1,3}$/), z.literal(''), z.null()]).optional(),
  })

  try {
    const body = schema.parse(req.body)
    const patch: Record<string, unknown> = {}
    if (body.position !== undefined) patch.position = body.position
    if (body.jersey_number !== undefined) {
      patch.jersey_number =
        body.jersey_number === '' || body.jersey_number === null ? null : body.jersey_number
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No roster fields to update' })
    }

    const { data, error } = await supabase.from('athletes').update(patch).eq('id', req.params.id).select().single()

    if (error) return res.status(500).json({ error: error.message })

    await supabase.from('audit_logs').insert({
      actor_id: req.user!.id,
      action: 'athlete_roster_details_updated',
      entity_type: 'athlete',
      entity_id: req.params.id,
      details: patch,
    })

    res.json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' })
  }
})

// Get athlete stats
router.get('/:id/stats', async (req, res) => {
  const { data, error } = await supabase
    .from('player_season_stats')
    .select('*')
    .eq('athlete_id', req.params.id)
    .order('updated_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Export roster as CSV
router.get('/export/csv', requireAuth, requireRole('Organizer', 'Admin', 'Coach'), async (_req, res) => {
  const { data } = await supabase
    .from('athletes')
    .select('*, profile:profiles!athletes_profile_id_fkey(full_name, email)')
    .eq('verification_status', 'approved')
    .eq('medical_cleared', true)

  const rows = (data ?? []).map((a: any) => ({
    student_id: a.student_id,
    full_name: a.profile?.full_name ?? '',
    email: a.profile?.email ?? '',
    sport: a.sport,
    position: a.position,
    jersey_number: a.jersey_number ?? '',
    year_level: a.year_level,
    department: a.department,
    season_status: a.season_status,
  }))

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: 'student_id', title: 'Student ID' },
      { id: 'full_name', title: 'Full Name' },
      { id: 'email', title: 'Email' },
      { id: 'sport', title: 'Sport' },
      { id: 'position', title: 'Position' },
      { id: 'jersey_number', title: 'Jersey #' },
      { id: 'year_level', title: 'Year Level' },
      { id: 'department', title: 'Department' },
      { id: 'season_status', title: 'Season Status' },
    ],
  })

  const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="athletes.csv"')
  res.send(csv)
})

export default router

// Helper for sync stringify
function createObjectCsvStringifier(opts: any) {
  const headers = opts.header as { id: string; title: string }[]
  return {
    getHeaderString: () => headers.map((h) => `"${h.title}"`).join(',') + '\n',
    stringifyRecords: (rows: any[]) =>
      rows.map((r) => headers.map((h) => `"${r[h.id] ?? ''}"`).join(',')).join('\n'),
  }
}
