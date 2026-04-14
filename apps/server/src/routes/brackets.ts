import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth'
import { generateBracket, advanceWinner } from '../services/bracketGenerator'
import supabase from '../utils/supabase'

const router = Router()

// Generate bracket for an event
router.post('/:eventId/generate', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const schema = z.object({
    participantIds: z.array(z.string().uuid()),
    seeds: z.record(z.string(), z.number()).optional(),
  })

  try {
    const { participantIds, seeds } = schema.parse(req.body)

    const { data: event } = await supabase.from('events').select('format').eq('id', req.params.eventId).single()
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const result = await generateBracket(req.params.eventId as string, participantIds, event.format as any, seeds)
    res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bracket generation failed'
    res.status(400).json({ error: message })
  }
})

// Get brackets for an event
router.get('/:eventId', async (req, res) => {
  const { data, error } = await supabase
    .from('brackets')
    .select('*')
    .eq('event_id', req.params.eventId)
    .order('round')
    .order('match_order')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Advance winner
router.post('/advance', requireAuth, requireRole('organizer', 'super_admin'), async (req, res) => {
  const schema = z.object({
    matchId: z.string().uuid(),
    winnerId: z.string().uuid(),
  })

  try {
    const { matchId, winnerId } = schema.parse(req.body)
    await advanceWinner(matchId, winnerId)
    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Advance failed'
    res.status(400).json({ error: message })
  }
})

export default router
