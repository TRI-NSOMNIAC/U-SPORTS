import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

// Get all teams
router.get('/', async (req, res) => {
  let query = supabase.from('teams').select('*, members:team_members(athlete:athletes(*, profile:profiles(full_name, avatar_url)))').order('name')
  if (req.query.seasonId) query = query.eq('season_id', req.query.seasonId as string)
  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Create team
router.post('/', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
    season_id: z.string().uuid(),
    captain_id: z.string().uuid().optional(),
  })
  try {
    const body = schema.parse(req.body)
    const { data, error } = await supabase.from('teams').insert(body).select().single()
    if (error) throw new Error(error.message)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

// Update team
router.patch('/:id', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('teams')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Add athlete to team
router.post('/:id/members', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const { athlete_id } = z.object({ athlete_id: z.string().uuid() }).parse(req.body)
  const { data, error } = await supabase
    .from('team_members')
    .insert({ team_id: req.params.id, athlete_id })
    .select()
    .single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Remove athlete from team
router.delete('/:id/members/:athleteId', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  await supabase.from('team_members').delete().eq('team_id', req.params.id).eq('athlete_id', req.params.athleteId)
  res.json({ success: true })
})

// Self-assign as coach
router.post('/:id/coach', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  // Get organizer record for this user
  const { data: organizer } = await supabase
    .from('organizers')
    .select('id')
    .eq('profile_id', req.user!.id)
    .single()

  if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' })

  const { data, error } = await supabase
    .from('team_coaches')
    .insert({ organizer_id: organizer.id, team_id: req.params.id })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
})

// Remove self as coach
router.delete('/:id/coach', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const { data: organizer } = await supabase
    .from('organizers')
    .select('id')
    .eq('profile_id', req.user!.id)
    .single()

  if (!organizer) return res.status(404).json({ error: 'Organizer profile not found' })

  await supabase.from('team_coaches').delete().eq('organizer_id', organizer.id).eq('team_id', req.params.id)
  res.json({ success: true })
})

// Get teams coached by current organizer
router.get('/my-teams', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const { data: organizer } = await supabase
    .from('organizers')
    .select('id')
    .eq('profile_id', req.user!.id)
    .single()

  if (!organizer) return res.json([])

  const { data } = await supabase
    .from('team_coaches')
    .select('team:teams(*, members:team_members(athlete:athletes(*, profile:profiles(full_name))))')
    .eq('organizer_id', organizer.id)

  res.json((data ?? []).map((tc: any) => tc.team))
})

export default router
