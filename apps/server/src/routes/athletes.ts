import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

// Get all athletes (with filters)
router.get('/', requireAuth, async (req, res) => {
  let query = supabase
    .from('athletes')
    .select('*, profile:profiles(full_name, email, avatar_url)')
    .order('created_at', { ascending: false })

  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.verification_status) query = query.eq('verification_status', req.query.verification_status as string)
  if (req.query.season_status) query = query.eq('season_status', req.query.season_status as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Get pending verification queue
router.get('/pending', requireAuth, requireRole('organizer', 'super_admin'), async (_req, res) => {
  const { data, error } = await supabase
    .from('athletes')
    .select('*, profile:profiles(full_name, email), docs:verification_documents(*)')
    .in('verification_status', ['pending', 'under_review'])
    .order('created_at')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Review athlete (approve/reject)
router.patch('/:id/review', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
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
router.patch('/:id/season-status', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
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
router.get('/export/csv', requireAuth, requireRole('organizer', 'super_admin'), async (_req, res) => {
  const { data } = await supabase
    .from('athletes')
    .select('*, profile:profiles(full_name, email)')
    .eq('verification_status', 'approved')

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
