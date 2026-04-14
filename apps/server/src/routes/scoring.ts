import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { advanceWinner } from '../services/bracketGenerator'

const router = Router()

// Start a match (set to live + acquire scoring lock)
router.post('/:matchId/start', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const { data: match } = await supabase
    .from('matches')
    .select('status, scoring_locked_by, participant_a_id, participant_b_id, event_id')
    .eq('id', req.params.matchId)
    .single()

  if (!match) return res.status(404).json({ error: 'Match not found' })

  if (match.status === 'live' && match.scoring_locked_by && match.scoring_locked_by !== req.user!.id) {
    const { data: locker } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', match.scoring_locked_by)
      .single()
    return res.status(409).json({
      error: 'SCORING_LOCKED',
      lockedBy: (locker as { full_name: string } | null)?.full_name ?? 'Another organizer',
      lockedById: match.scoring_locked_by,
    })
  }

  // Initialize match scores
  const scoreInserts = []
  if (match.participant_a_id) {
    scoreInserts.push({
      match_id: req.params.matchId,
      participant_id: match.participant_a_id,
      sport: 'basketball',
    })
  }
  if (match.participant_b_id) {
    scoreInserts.push({
      match_id: req.params.matchId,
      participant_id: match.participant_b_id,
      sport: 'basketball',
    })
  }

  // Get sport from event
  const { data: event } = await supabase.from('events').select('sport').eq('id', match.event_id).single()
  const sport = event?.sport ?? 'basketball'

  const scores = [match.participant_a_id, match.participant_b_id].filter(Boolean).map((pid) => ({
    match_id: req.params.matchId,
    participant_id: pid,
    sport,
  }))

  await supabase.from('match_scores').upsert(scores, { onConflict: 'match_id,participant_id' })

  await supabase
    .from('matches')
    .update({ status: 'live', scoring_locked_by: req.user!.id, scoring_locked_at: new Date().toISOString() })
    .eq('id', req.params.matchId)

  res.json({ success: true })
})

// Record a scoring action
router.post('/:matchId/action', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    participantId: z.string().uuid(),
    athleteId: z.string().uuid().optional(),
    actionType: z.string(),
    value: z.number().default(1),
    quarterOrSet: z.number().optional(),
    sport: z.string(),
  })

  try {
    const body = schema.parse(req.body)
    const matchId = req.params.matchId as string

    // Verify match is live and locked by this organizer
    const { data: match } = await supabase
      .from('matches')
      .select('status, scoring_locked_by')
      .eq('id', matchId)
      .single()

    if (!match || match.status !== 'live') {
      return res.status(400).json({ error: 'Match is not live' })
    }
    if (match.scoring_locked_by !== req.user!.id) {
      return res.status(403).json({ error: 'You do not have scoring lock for this match' })
    }

    // Log the action
    await supabase.from('scoring_actions').insert({
      match_id: matchId,
      athlete_id: body.athleteId ?? null,
      action_type: body.actionType,
      value: body.value,
      quarter_or_set: body.quarterOrSet ?? null,
      recorded_by: req.user!.id,
    })

    // Update match score based on sport
    const scoreField = getScoreField(body.sport, body.quarterOrSet ?? 1)
    if (scoreField) {
      await supabase.rpc('increment_match_score', {
        p_match_id: matchId,
        p_participant_id: body.participantId,
        p_field: scoreField,
        p_value: body.value,
      })
    }

    // Update player game stats if athlete is specified
    if (body.athleteId) {
      await updatePlayerGameStats(matchId, body.athleteId, body.sport, body.actionType, body.value)
    }

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Action failed'
    res.status(400).json({ error: message })
  }
})

// Undo last action
router.post('/:matchId/undo', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const { data: lastAction } = await supabase
    .from('scoring_actions')
    .select('*')
    .eq('match_id', req.params.matchId)
    .eq('undone', false)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  if (!lastAction) return res.status(404).json({ error: 'No action to undo' })

  await supabase.from('scoring_actions').update({ undone: true }).eq('id', lastAction.id)

  // Reverse the score change
  const scoreField = getScoreField(lastAction.sport ?? 'basketball', lastAction.quarter_or_set ?? 1)
  if (scoreField && lastAction.athlete_id) {
    await supabase.rpc('increment_match_score', {
      p_match_id: req.params.matchId,
      p_participant_id: lastAction.participant_id,
      p_field: scoreField,
      p_value: -lastAction.value,
    })
  }

  res.json({ success: true })
})

// End match
router.post('/:matchId/end', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  const schema = z.object({
    winnerId: z.string().uuid(),
  })

  try {
    const { winnerId } = schema.parse(req.body)

    await supabase
      .from('matches')
      .update({ status: 'completed', scoring_locked_by: null })
      .eq('id', req.params.matchId)

    await advanceWinner(req.params.matchId as string, winnerId)

    // Trigger insights computation
    const { data: match } = await supabase
      .from('matches')
      .select('event_id')
      .eq('id', req.params.matchId)
      .single()

    if (match) {
      const { data: event } = await supabase
        .from('events')
        .select('season_id')
        .eq('id', match.event_id)
        .single()

      if (event) {
        // Call Edge Function asynchronously (non-blocking)
        fetch(`${process.env.SUPABASE_URL}/functions/v1/compute-insights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ matchId: req.params.matchId, seasonId: event.season_id }),
        }).catch((e) => console.error('Insights trigger failed:', e))
      }
    }

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'End match failed'
    res.status(400).json({ error: message })
  }
})

// Get live match state
router.get('/:matchId/state', async (req, res) => {
  const [matchRes, scoresRes, actionsRes] = await Promise.all([
    supabase.from('matches').select('*').eq('id', req.params.matchId).single(),
    supabase.from('match_scores').select('*').eq('match_id', req.params.matchId),
    supabase
      .from('scoring_actions')
      .select('*')
      .eq('match_id', req.params.matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(20),
  ])

  res.json({
    match: matchRes.data,
    scores: scoresRes.data ?? [],
    recentActions: actionsRes.data ?? [],
  })
})

// Transfer scoring lock
router.post('/:matchId/transfer-lock', requireAuth, requireRole('organizer', 'super_admin'), async (req: AuthRequest, res) => {
  await supabase
    .from('matches')
    .update({ scoring_locked_by: req.user!.id, scoring_locked_at: new Date().toISOString() })
    .eq('id', req.params.matchId)

  res.json({ success: true })
})

function getScoreField(sport: string, period: number): string | null {
  if (sport === 'basketball') {
    const fields = ['q1', 'q2', 'q3', 'q4', 'ot']
    return fields[Math.min(period - 1, 4)] ?? null
  }
  if (sport === 'volleyball' || sport === 'table-tennis') {
    const fields = ['set1', 'set2', 'set3', 'set4', 'set5']
    return fields[Math.min(period - 1, 4)] ?? null
  }
  return null
}

async function updatePlayerGameStats(
  matchId: string,
  athleteId: string,
  sport: string,
  actionType: string,
  value: number
) {
  const { data: existing } = await supabase
    .from('player_game_stats')
    .select('stats')
    .eq('match_id', matchId)
    .eq('athlete_id', athleteId)
    .single()

  const currentStats = (existing?.stats as Record<string, number>) ?? {}
  const statKey = actionTypeToStatKey(sport, actionType)
  if (!statKey) return

  const updated = { ...currentStats, [statKey]: (currentStats[statKey] ?? 0) + value }

  await supabase.from('player_game_stats').upsert(
    { match_id: matchId, athlete_id: athleteId, sport, stats: updated },
    { onConflict: 'match_id,athlete_id' }
  )
}

function actionTypeToStatKey(sport: string, actionType: string): string | null {
  const map: Record<string, Record<string, string>> = {
    basketball: {
      point_1: 'ft_made',
      point_2: 'total_points',
      point_3: 'total_points',
      rebound: 'total_rebounds',
      assist: 'total_assists',
      steal: 'total_steals',
      block: 'total_blocks',
      foul: 'fouls',
    },
    volleyball: {
      kill: 'kills',
      ace: 'aces',
      dig: 'digs',
      block: 'blocks',
      assist: 'assists',
      error: 'errors',
      serve_error: 'serve_errors',
    },
    'table-tennis': {
      point: 'pts_scored',
    },
  }
  return map[sport]?.[actionType] ?? null
}

export default router
