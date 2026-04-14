import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth'
import supabase from '../utils/supabase'

const router = Router()

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['registration', 'cancelled'],
  registration: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

// Get all events (optionally filter by season/sport)
router.get('/', async (req, res) => {
  let query = supabase.from('events').select('*, season:seasons(*)').order('created_at', { ascending: false })
  if (req.query.seasonId) query = query.eq('season_id', req.query.seasonId as string)
  if (req.query.sport) query = query.eq('sport', req.query.sport as string)
  if (req.query.status) query = query.eq('status', req.query.status as string)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Get single event
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*, season:seasons(*), participants:event_participants(*)')
    .eq('id', req.params.id)
    .single()
  if (error) return res.status(404).json({ error: 'Event not found' })
  res.json(data)
})

// Create event
router.post('/', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
    season_id: z.string().uuid(),
    format: z.enum(['single_elim', 'double_elim', 'round_robin']),
    category: z.string().optional(),
  })
  try {
    const body = schema.parse(req.body)
    const { data, error } = await supabase
      .from('events')
      .insert({ ...body, created_by: (req as any).user.id })
      .select()
      .single()
    if (error) throw new Error(error.message)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Create failed' })
  }
})

// Update event status
router.patch('/:id/status', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const { newStatus } = req.body
  const { data: event } = await supabase.from('events').select('status').eq('id', req.params.id).single()
  if (!event) return res.status(404).json({ error: 'Event not found' })

  const allowed = VALID_TRANSITIONS[event.status] ?? []
  if (!allowed.includes(newStatus)) {
    return res.status(400).json({ error: `Cannot transition from ${event.status} to ${newStatus}` })
  }

  const { data, error } = await supabase
    .from('events')
    .update({ status: newStatus })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Add participant to event
router.post('/:id/participants', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const schema = z.object({
    participant_id: z.string().uuid(),
    participant_type: z.enum(['team', 'athlete', 'doubles_pair']),
    seed: z.number().optional(),
  })
  try {
    const body = schema.parse(req.body)
    const { data, error } = await supabase
      .from('event_participants')
      .insert({ event_id: req.params.id, ...body })
      .select()
      .single()
    if (error) throw new Error(error.message)
    res.status(201).json(data)
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Add participant failed' })
  }
})

// Remove participant
router.delete('/:id/participants/:participantId', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', req.params.id)
    .eq('participant_id', req.params.participantId)
  res.json({ success: true })
})

// Get matches for an event
router.get('/:id/matches', async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*, scores:match_scores(*)')
    .eq('event_id', req.params.id)
    .order('scheduled_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
