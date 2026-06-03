import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import supabase from '../utils/supabase'
import { writeAuditLog } from '../utils/writeAuditLog'
import { advanceWinner } from '../services/bracketGenerator'
import { computeInsightsForMatch } from '../services/computeInsights'
import { getActiveSlots } from '../utils/sportConfig'

const router = Router()

/** Refresh player_season_stats for everyone who logged stats in this match; bump team W/L. */
async function aggregateOfficialSeasonStatsForMatch(matchId: string, winnerId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  const { data: event } = await supabase
    .from('events')
    .select('season_id')
    .eq('id', match.event_id)
    .single()

  if (!event?.season_id) return

  const seasonId = event.season_id

  const { data: gameStats } = await supabase.from('player_game_stats').select('athlete_id').eq('match_id', matchId)

  for (const gs of gameStats ?? []) {
    await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: gs.athlete_id,
      p_season_id: seasonId,
    })
  }

  const loserId =
    match.participant_a_id === winnerId ? match.participant_b_id : match.participant_a_id

  for (const entry of [
    { teamId: winnerId, isWin: true },
    { teamId: loserId, isWin: false },
  ]) {
    if (!entry.teamId) continue

    const { data: existing } = await supabase
      .from('team_season_stats')
      .select('id, wins, losses')
      .eq('team_id', entry.teamId)
      .eq('season_id', seasonId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('team_season_stats')
        .update({
          wins: existing.wins + (entry.isWin ? 1 : 0),
          losses: existing.losses + (entry.isWin ? 0 : 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('team_season_stats').insert({
        team_id: entry.teamId,
        season_id: seasonId,
        wins: entry.isWin ? 1 : 0,
        losses: entry.isWin ? 0 : 1,
      })
    }
  }
}

/** Rerun DB aggregation for all athletes on this match. */
async function recomputePlayerSeasonStatsForMatch(matchId: string): Promise<void> {
  const { data: match } = await supabase.from('matches').select('event_id').eq('id', matchId).single()

  if (!match) return

  const { data: event } = await supabase.from('events').select('season_id').eq('id', match.event_id).single()

  if (!event?.season_id) return

  const { data: gameStats } = await supabase.from('player_game_stats').select('athlete_id').eq('match_id', matchId)

  for (const gs of gameStats ?? []) {
    await supabase.rpc('recompute_player_season_stats', {
      p_athlete_id: gs.athlete_id,
      p_season_id: event.season_id,
    })
  }
}

// Start a match (set to live + acquire scoring lock)
router.post('/:matchId/start', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const { data: match } = await supabase
    .from('matches')
    .select('status, scoring_locked_by, participant_a_id, participant_b_id, event_id')
    .eq('id', req.params.matchId)
    .single()

  if (!match) return res.status(404).json({ error: 'Match not found' })

  if (!match.participant_a_id || !match.participant_b_id) {
    return res.status(400).json({ error: 'Assign both participants before starting this match' })
  }

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

  const { data: event } = await supabase.from('events').select('sport, table_tennis_format').eq('id', match.event_id).single()
  const sport = event?.sport ?? 'basketball'
  const ttFormat = (event as { table_tennis_format?: string | null } | null)?.table_tennis_format ?? null

  const scores = [match.participant_a_id, match.participant_b_id].filter(Boolean).map((pid) => ({
    match_id: req.params.matchId,
    participant_id: pid,
    sport,
  }))

  await supabase.from('match_scores').upsert(scores, { onConflict: 'match_id,participant_id' })

  // Seed active_lineup from team_members.lineup_slot if not already set
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('active_lineup')
    .eq('id', req.params.matchId)
    .single()

  let activeLineup = (existingMatch as { active_lineup?: unknown } | null)?.active_lineup as Record<string, string[]> | null
  if (!activeLineup) {
    const activeSlots = getActiveSlots(sport, ttFormat)
    const sides: Array<{ key: 'a' | 'b'; pid: string | null }> = [
      { key: 'a', pid: match.participant_a_id },
      { key: 'b', pid: match.participant_b_id },
    ]

    activeLineup = { a: [], b: [] }
    for (const { key, pid } of sides) {
      if (!pid) continue
      // Try to find a team with this participant as team id
      const { data: members } = await supabase
        .from('team_members')
        .select('athlete_id, lineup_slot')
        .eq('team_id', pid)
        .not('lineup_slot', 'is', null)
        .order('lineup_slot', { ascending: true })
        .limit(activeSlots)

      activeLineup[key] = ((members ?? []) as Array<{ athlete_id: string | null; lineup_slot: number | null }>)
        .filter((m) => m.athlete_id)
        .map((m) => m.athlete_id as string)
    }
  }

  await supabase
    .from('matches')
    .update({ status: 'live', scoring_locked_by: req.user!.id, scoring_locked_at: new Date().toISOString(), active_lineup: activeLineup })
    .eq('id', req.params.matchId)

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'match_started',
    entityType: 'match',
    entityId: req.params.matchId,
    details: { event_id: match.event_id },
  })

  res.json({ success: true, activeLineup })
})

// Stat-only actions do NOT require the scoring lock — any organizer can record them.
// Only point-scoring actions (point_1 / point_2 / point_3) require the lock.
const POINT_ACTIONS = new Set(['point_1', 'point_2', 'point_3'])

// Record a scoring action
router.post('/:matchId/action', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
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

    // Verify match is live; only enforce lock for point-scoring actions
    const { data: match } = await supabase
      .from('matches')
      .select('status, scoring_locked_by, participant_a_id, participant_b_id')
      .eq('id', matchId)
      .single()

    if (!match || match.status !== 'live') {
      return res.status(400).json({ error: 'Match is not live' })
    }
    if (POINT_ACTIONS.has(body.actionType) && match.scoring_locked_by !== req.user!.id) {
      return res.status(403).json({ error: 'You do not have scoring lock for this match' })
    }

    // Log the action (all taps — points and team stats)
    const { error: insertError } = await supabase.from('scoring_actions').insert({
      match_id: matchId,
      participant_id: body.participantId,
      athlete_id: body.athleteId ?? null,
      sport: body.sport,
      action_type: body.actionType,
      value: body.value,
      quarter_or_set: body.quarterOrSet ?? null,
      recorded_by: req.user!.id,
    })
    if (insertError) throw new Error(`Failed to log action: ${insertError.message}`)

    // Only field goals / rally points update period scoreboards (not REB/AST/STL etc.)
    if (shouldIncrementPeriodScore(body.sport, body.actionType)) {
      const scoreField = getScoreField(body.sport, body.quarterOrSet ?? 1)
      if (scoreField) {
        await supabase.rpc('increment_match_score', {
          p_match_id: matchId,
          p_participant_id: body.participantId,
          p_field: scoreField,
          p_value: body.value,
        })
        // After updating a VB/TT period score, recompute sets/games won
        if (
          (body.sport === 'volleyball' || body.sport === 'table-tennis') &&
          match.participant_a_id &&
          match.participant_b_id
        ) {
          await recomputePeriodWins(matchId, body.sport, match.participant_a_id, match.participant_b_id)
        }
      }
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
router.post('/:matchId/undo', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const matchId = req.params.matchId as string

  const [{ data: lastAction }, { data: match }] = await Promise.all([
    supabase
      .from('scoring_actions')
      .select('*')
      .eq('match_id', matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('matches')
      .select('participant_a_id, participant_b_id')
      .eq('id', matchId)
      .single(),
  ])

  if (!lastAction) return res.status(404).json({ error: 'No action to undo' })

  await supabase.from('scoring_actions').update({ undone: true }).eq('id', lastAction.id)

  const sport = lastAction.sport ?? 'basketball'
  const reversalParticipant =
    typeof (lastAction as { participant_id?: string | null }).participant_id === 'string'
      ? (lastAction as { participant_id: string }).participant_id
      : null

  if (reversalParticipant && shouldIncrementPeriodScore(sport, lastAction.action_type)) {
    const scoreField = getScoreField(sport, lastAction.quarter_or_set ?? 1)
    if (scoreField) {
      await supabase.rpc('increment_match_score', {
        p_match_id: matchId,
        p_participant_id: reversalParticipant,
        p_field: scoreField,
        p_value: -Number(lastAction.value),
      })
      // Recompute sets/games won after reversing a VB/TT period point
      if (
        (sport === 'volleyball' || sport === 'table-tennis') &&
        match?.participant_a_id &&
        match?.participant_b_id
      ) {
        await recomputePeriodWins(matchId, sport, match.participant_a_id, match.participant_b_id)
      }
    }
  }

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'scoring_action_undone',
    entityType: 'match',
    entityId: matchId,
    details: {
      undone_action_id: lastAction.id,
      action_type: lastAction.action_type,
      sport,
    },
  })

  res.json({ success: true })
})

// End match
router.post('/:matchId/end', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
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

    await aggregateOfficialSeasonStatsForMatch(req.params.matchId as string, winnerId)

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

      if (event?.season_id) {
        void computeInsightsForMatch(req.params.matchId as string, event.season_id).catch((e) =>
          console.error('Insights computation failed:', e),
        )
      }
    }

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_ended',
      entityType: 'match',
      entityId: req.params.matchId,
      details: { winner_id: winnerId },
    })

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'End match failed'
    res.status(400).json({ error: message })
  }
})

// Get live match state
router.get('/:matchId/state', async (req, res) => {
  const matchId = req.params.matchId
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle()

  const [scoresRes, actionsRes, teamStats, nameA, nameB] = await Promise.all([
    supabase.from('match_scores').select('*').eq('match_id', matchId),
    supabase
      .from('scoring_actions')
      .select('*')
      .eq('match_id', matchId)
      .eq('undone', false)
      .order('timestamp', { ascending: false })
      .limit(20),
    aggregateTeamStatsByAction(matchId),
    resolveParticipantDisplayName(match?.participant_a_id ?? null),
    resolveParticipantDisplayName(match?.participant_b_id ?? null),
  ])

  res.json({
    match: match ?? null,
    scores: scoresRes.data ?? [],
    recentActions: actionsRes.data ?? [],
    teamStats,
    participantNames: { a: nameA, b: nameB },
  })
})

// Transfer scoring lock
router.post('/:matchId/transfer-lock', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const matchId = req.params.matchId as string
  await supabase
    .from('matches')
    .update({ scoring_locked_by: req.user!.id, scoring_locked_at: new Date().toISOString() })
    .eq('id', matchId)

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'scoring_lock_transferred',
    entityType: 'match',
    entityId: matchId,
    details: {},
  })

  res.json({ success: true })
})

function shouldIncrementPeriodScore(sport: string, actionType: string): boolean {
  if (sport === 'basketball') {
    return actionType === 'point_1' || actionType === 'point_2' || actionType === 'point_3'
  }
  if (sport === 'volleyball' || sport === 'table-tennis') {
    return actionType === 'point_1'
  }
  return false
}

function getScoreField(sport: string, period: number): string | null {
  const idx = Math.min(Math.max(period, 1), 5) - 1
  if (sport === 'basketball') {
    const fields = ['q1', 'q2', 'q3', 'q4', 'ot']
    return fields[idx] ?? null
  }
  if (sport === 'volleyball') {
    const fields = ['set1', 'set2', 'set3', 'set4', 'set5']
    return fields[idx] ?? null
  }
  if (sport === 'table-tennis') {
    const fields = ['game1', 'game2', 'game3', 'game4', 'game5']
    return fields[idx] ?? null
  }
  return null
}

async function aggregateTeamStatsByAction(
  matchId: string
): Promise<Record<string, Record<string, number>>> {
  const { data: rows } = await supabase
    .from('scoring_actions')
    .select('participant_id, action_type, value')
    .eq('match_id', matchId)
    .eq('undone', false)

  const out: Record<string, Record<string, number>> = {}
  for (const row of rows ?? []) {
    const pid = row.participant_id as string | null | undefined
    if (!pid) continue
    if (!out[pid]) out[pid] = {}
    const k = row.action_type as string
    out[pid][k] = (out[pid][k] ?? 0) + Number(row.value ?? 0)
  }
  return out
}

async function resolveParticipantDisplayName(participantId: string | null): Promise<string> {
  if (!participantId) return '—'
  const { data: team } = await supabase.from('teams').select('name').eq('id', participantId).maybeSingle()
  if (team?.name) return team.name

  const { data: ath } = await supabase.from('athletes').select('profile_id').eq('id', participantId).maybeSingle()
  if (ath?.profile_id) {
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', ath.profile_id).maybeSingle()
    if (prof?.full_name) return prof.full_name
  }
  return `Participant ${participantId.slice(0, 8)}…`
}

/** Normalize embedded `athletes.profile` from Supabase (PostgREST typing can vary). */
function normalizeRosterAthlete(
  row: unknown
): { id: string; profile: { full_name: string } | null } | null {
  if (!row || typeof row !== 'object') return null
  const r = row as { id?: string; profile?: unknown }
  if (!r.id) return null
  const pRaw = r.profile
  const pObj = Array.isArray(pRaw) ? pRaw[0] : pRaw
  if (pObj && typeof pObj === 'object' && 'full_name' in pObj) {
    const fn = (pObj as { full_name?: string }).full_name
    return { id: r.id, profile: { full_name: typeof fn === 'string' ? fn : String(fn ?? '') } }
  }
  return { id: r.id, profile: null }
}

/** All roster athletes for a match participant (team via team_members, else a single athlete id for individual entries). */
async function rosterAthletesForMatchParticipant(participantId: string | null): Promise<
  Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }>
> {
  if (!participantId) return []

  const { data: tmRows } = await supabase
    .from('team_members')
    .select(
      'athlete_id, lineup_slot, athlete:athletes(id, profile:profiles!athletes_profile_id_fkey(full_name))',
    )
    .eq('team_id', participantId)

  if (tmRows && tmRows.length > 0) {
    const sorted = [...tmRows].sort((a, b) => {
      const la = Number(a.lineup_slot ?? 999)
      const lb = Number(b.lineup_slot ?? 999)
      if (la !== lb) return la - lb
      const ra = normalizeRosterAthlete(a.athlete)
      const rb = normalizeRosterAthlete(b.athlete)
      return (ra?.profile?.full_name ?? '').localeCompare(rb?.profile?.full_name ?? '')
    })
    return sorted
      .filter((r) => r.athlete_id)
      .map((r) => ({
        athlete_id: r.athlete_id as string,
        athlete: normalizeRosterAthlete(r.athlete),
      }))
  }

  const { data: solo } = await supabase
    .from('athletes')
    .select('id, profile:profiles!athletes_profile_id_fkey(full_name)')
    .eq('id', participantId)
    .maybeSingle()

  if (solo?.id) {
    return [
      {
        athlete_id: solo.id,
        athlete: normalizeRosterAthlete(solo),
      },
    ]
  }

  return []
}

function ttSlotsPerSide(ttFormat: string | null | undefined): number {
  return ttFormat === 'doubles' ? 2 : 1
}

/**
 * Table tennis match review should list only active competitors (1/side singles, 2/side doubles),
 * not full squads. Prefer persisted `matches.active_lineup`; fallback to first roster slots by `lineup_slot`.
 */
function filterTableTennisRosterSide(
  roster: Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }>,
  side: 'a' | 'b',
  activeLineup: Record<string, unknown> | null | undefined,
  ttFormat: string | null | undefined,
): Array<{ athlete_id: string; athlete: { id: string; profile: { full_name: string } | null } | null }> {
  const max = ttSlotsPerSide(ttFormat)
  const key = side === 'a' ? 'a' : 'b'
  const raw = activeLineup?.[key]
  const lineupIds = Array.isArray(raw)
    ? (raw as unknown[])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, max)
    : []
  const byId = new Map(roster.map((r) => [r.athlete_id, r]))

  if (lineupIds.length > 0) {
    const picked = lineupIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row))
    if (picked.length === lineupIds.length && picked.length > 0) return picked
    if (picked.length > 0) return picked.slice(0, max)
  }

  return roster.slice(0, max)
}

type ReviewPlayerTeamMeta = {
  participant_side: 'a' | 'b'
  team_id: string | null
  team_name: string
}

/** Map athletes to bracket side using match participant ids + team memberships. */
async function reviewTeamMetaByAthleteId(
  athleteIds: string[],
  participantAId: string | null,
  participantBId: string | null,
  nameA: string,
  nameB: string,
): Promise<Map<string, ReviewPlayerTeamMeta>> {
  const uniq = [...new Set(athleteIds.filter(Boolean))]
  const meta = new Map<string, ReviewPlayerTeamMeta>()
  if (uniq.length === 0) return meta

  for (const id of uniq) {
    if (participantAId && id === participantAId) {
      meta.set(id, {
        participant_side: 'a',
        team_id: participantAId,
        team_name: nameA,
      })
    }
    if (participantBId && id === participantBId) {
      meta.set(id, {
        participant_side: 'b',
        team_id: participantBId,
        team_name: nameB,
      })
    }
  }

  const teamParticipants = [participantAId, participantBId].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  const needTeamLookup = uniq.filter((id) => !meta.has(id))
  if (needTeamLookup.length === 0 || teamParticipants.length === 0) return meta

  const { data: memberships } = await supabase
    .from('team_members')
    .select('athlete_id, team_id')
    .in('athlete_id', needTeamLookup)
    .in('team_id', teamParticipants)

  for (const m of memberships ?? []) {
    const aid = m.athlete_id as string
    const tid = m.team_id as string
    if (participantAId && tid === participantAId) {
      meta.set(aid, { participant_side: 'a', team_id: participantAId, team_name: nameA })
    } else if (participantBId && tid === participantBId) {
      meta.set(aid, { participant_side: 'b', team_id: participantBId, team_name: nameB })
    }
  }

  return meta
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
      point_1: 'pts_scored',
      kill: 'kills',
      ace: 'aces',
      dig: 'digs',
      block: 'blocks',
      assist: 'assists',
      error: 'errors',
      serve_error: 'serve_errors',
    },
    'table-tennis': {
      point_1: 'pts_scored',
      tt_serve: 'serves',
      tt_attack: 'attacks',
      tt_error: 'errors',
    },
  }
  return map[sport]?.[actionType] ?? null
}

/** Determine which side won a set/game, given their scores.
 *  Returns 'a' | 'b' | null (null = set still in progress). */
function getSetWinner(
  sport: string,
  sA: number,
  sB: number,
  period: number
): 'a' | 'b' | null {
  if (sport === 'volleyball') {
    const target = period === 5 ? 15 : 25
    const maxS = Math.max(sA, sB)
    const diff = Math.abs(sA - sB)
    if (maxS >= target && diff >= 2) return sA > sB ? 'a' : 'b'
  } else if (sport === 'table-tennis') {
    const maxS = Math.max(sA, sB)
    const diff = Math.abs(sA - sB)
    if (maxS >= 11 && diff >= 2) return sA > sB ? 'a' : 'b'
  }
  return null
}

/** Recompute sets_won / games_won from current period scores and write them back. */
async function recomputePeriodWins(
  matchId: string,
  sport: string,
  participantAId: string,
  participantBId: string
) {
  const { data: scoresData } = await supabase
    .from('match_scores')
    .select('participant_id, set1, set2, set3, set4, set5, game1, game2, game3, game4, game5')
    .eq('match_id', matchId)

  if (!scoresData || scoresData.length < 2) return

  const sA = scoresData.find((s) => s.participant_id === participantAId)
  const sB = scoresData.find((s) => s.participant_id === participantBId)
  if (!sA || !sB) return

  const periods =
    sport === 'volleyball'
      ? (['set1', 'set2', 'set3', 'set4', 'set5'] as const)
      : (['game1', 'game2', 'game3', 'game4', 'game5'] as const)

  let winsA = 0
  let winsB = 0
  for (let i = 0; i < periods.length; i++) {
    const f = periods[i] as string
    const scoreA = Number((sA as Record<string, unknown>)[f] ?? 0)
    const scoreB = Number((sB as Record<string, unknown>)[f] ?? 0)
    const winner = getSetWinner(sport, scoreA, scoreB, i + 1)
    if (winner === 'a') winsA++
    else if (winner === 'b') winsB++
  }

  const wonField = sport === 'volleyball' ? 'sets_won' : 'games_won'
  await Promise.all([
    supabase
      .from('match_scores')
      .update({ [wonField]: winsA })
      .eq('match_id', matchId)
      .eq('participant_id', participantAId),
    supabase
      .from('match_scores')
      .update({ [wonField]: winsB })
      .eq('match_id', matchId)
      .eq('participant_id', participantBId),
  ])
}

// Get match review data (player game stats + scores) for the post-game review screen
router.get('/:matchId/review', requireAuth, requireRole('Organizer', 'Admin'), async (req, res) => {
  const matchId = req.params.matchId as string

  const { data: match } = await supabase
    .from('matches')
    .select('*, event:events(sport, season_id, table_tennis_format)')
    .eq('id', matchId)
    .single()
  if (!match) return res.status(404).json({ error: 'Match not found' })

  const [scoresRes, playerStatsRes, rosterA, rosterB, nameA, nameB] = await Promise.all([
    supabase.from('match_scores').select('*').eq('match_id', matchId),
    supabase
      .from('player_game_stats')
      .select('*, athlete:athletes(id, profile:profiles!athletes_profile_id_fkey(full_name))')
      .eq('match_id', matchId),
    rosterAthletesForMatchParticipant(match.participant_a_id),
    rosterAthletesForMatchParticipant(match.participant_b_id),
    resolveParticipantDisplayName(match.participant_a_id),
    resolveParticipantDisplayName(match.participant_b_id),
  ])

  const sport = (match as { event?: { sport?: string } }).event?.sport ?? 'basketball'
  const ttFormatRaw =
    sport === 'table-tennis'
      ? ((match as { event?: { table_tennis_format?: string | null } }).event?.table_tennis_format ?? 'singles')
      : null
  const activeLineupRaw = (match as { active_lineup?: Record<string, unknown> | null }).active_lineup

  let rosterForA = rosterA
  let rosterForB = rosterB
  let ttAllowedAthleteIds: Set<string> | null = null
  if (sport === 'table-tennis') {
    rosterForA = filterTableTennisRosterSide(rosterA, 'a', activeLineupRaw, ttFormatRaw)
    rosterForB = filterTableTennisRosterSide(rosterB, 'b', activeLineupRaw, ttFormatRaw)
    ttAllowedAthleteIds = new Set([
      ...rosterForA.map((r) => r.athlete_id),
      ...rosterForB.map((r) => r.athlete_id),
    ])
  }

  const statsByAthlete = new Map(
    (playerStatsRes.data ?? []).map((ps) => [(ps as { athlete_id: string }).athlete_id, ps]),
  )

  const mergedPlayerStats: unknown[] = []
  const pushFromRoster = (
    roster: Awaited<ReturnType<typeof rosterAthletesForMatchParticipant>>,
    side: 'a' | 'b',
    participantIdForSide: string | null,
    teamName: string,
  ) => {
    const tm: ReviewPlayerTeamMeta = {
      participant_side: side,
      team_id: participantIdForSide,
      team_name: teamName,
    }
    for (const row of roster) {
      const existing = statsByAthlete.get(row.athlete_id)
      if (existing) {
        mergedPlayerStats.push({
          ...(existing as object),
          ...tm,
        })
        statsByAthlete.delete(row.athlete_id)
      } else {
        mergedPlayerStats.push({
          match_id: matchId,
          athlete_id: row.athlete_id,
          sport,
          stats: {},
          athlete: row.athlete,
          ...tm,
        })
      }
    }
  }
  const pidA = (match as { participant_a_id?: string | null }).participant_a_id ?? null
  const pidB = (match as { participant_b_id?: string | null }).participant_b_id ?? null

  pushFromRoster(rosterForA, 'a', pidA, nameA)
  pushFromRoster(rosterForB, 'b', pidB, nameB)

  const remainderRows = [...statsByAthlete.values()]
  const remainderIds = remainderRows.map((r) => (r as { athlete_id: string }).athlete_id)
  const remainderMeta = await reviewTeamMetaByAthleteId(remainderIds, pidA, pidB, nameA, nameB)
  for (const remainder of remainderRows) {
    const athleteId = (remainder as { athlete_id: string }).athlete_id
    if (sport === 'table-tennis' && ttAllowedAthleteIds && !ttAllowedAthleteIds.has(athleteId)) {
      continue
    }
    const sideInfo = remainderMeta.get(athleteId)
    mergedPlayerStats.push({
      ...(remainder as object),
      participant_side: sideInfo?.participant_side ?? null,
      team_id: sideInfo?.team_id ?? null,
      team_name: sideInfo?.team_name ?? 'Team',
    })
  }

  res.json({
    match,
    scores: scoresRes.data ?? [],
    playerStats: mergedPlayerStats,
    participantNames: { a: nameA, b: nameB },
  })
})

// Update a player's game stats (for post-game editing)
router.patch('/:matchId/player-stats/:athleteId', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const { matchId, athleteId } = req.params
  const schema = z.object({ stats: z.record(z.string(), z.number()) })

  try {
    const { stats } = schema.parse(req.body)

    const { data: mrow } = await supabase.from('matches').select('event_id').eq('id', matchId).maybeSingle()
    if (!mrow?.event_id) return res.status(404).json({ error: 'Match not found' })

    const { data: evt } = await supabase.from('events').select('sport').eq('id', mrow.event_id).maybeSingle()
    if (!evt?.sport) return res.status(404).json({ error: 'Event not found' })

    const { error } = await supabase.from('player_game_stats').upsert(
      {
        match_id: matchId,
        athlete_id: athleteId,
        sport: evt.sport,
        stats,
      },
      { onConflict: 'match_id,athlete_id' },
    )

    if (error) return res.status(400).json({ error: error.message })
    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_player_stats_updated',
      entityType: 'match',
      entityId: matchId,
      details: {
        athlete_id: athleteId,
        stat_keys: Object.keys(stats),
      },
    })
    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Update failed'
    res.status(400).json({ error: message })
  }
})

// Finalize match — refresh player season totals after post-game stat edits (team standings were applied when the match ended)
router.post('/:matchId/finalize', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const matchId = req.params.matchId as string
  const schema = z.object({ winnerId: z.string().uuid() })

  try {
    const { winnerId } = schema.parse(req.body)

    const { data: match } = await supabase
      .from('matches')
      .select('participant_a_id, participant_b_id, event_id')
      .eq('id', matchId)
      .single()
    if (!match) return res.status(404).json({ error: 'Match not found' })

    const { data: event } = await supabase
      .from('events')
      .select('season_id, sport')
      .eq('id', match.event_id)
      .single()
    if (!event) return res.status(404).json({ error: 'Event not found' })

    const seasonId = event.season_id

    await recomputePlayerSeasonStatsForMatch(matchId)

    void computeInsightsForMatch(matchId, seasonId).catch((e) => console.error('Insights computation failed:', e))

    await writeAuditLog({
      actorId: req.user!.id,
      action: 'match_stats_finalized',
      entityType: 'match',
      entityId: matchId,
      details: { winner_id: winnerId, event_id: match.event_id },
    })

    res.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Finalize failed'
    res.status(400).json({ error: message })
  }
})

// Sub/swap a player in the active lineup during a live match
// Body: { side: 'a' | 'b', outAthleteId: uuid, inAthleteId: uuid }
router.patch('/:matchId/lineup', requireAuth, requireRole('Organizer', 'Admin'), async (req: AuthRequest, res) => {
  const matchId = req.params.matchId as string

  const bodyParse = z.object({
    side: z.enum(['a', 'b']),
    outAthleteId: z.string().uuid(),
    inAthleteId: z.string().uuid(),
  }).safeParse(req.body)

  if (!bodyParse.success) return res.status(400).json({ error: 'Invalid body' })

  const { side, outAthleteId, inAthleteId } = bodyParse.data

  const { data: match } = await supabase
    .from('matches')
    .select('status, active_lineup, participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return res.status(404).json({ error: 'Match not found' })
  if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' })

  const teamId = side === 'a' ? match.participant_a_id : match.participant_b_id
  if (!teamId) return res.status(400).json({ error: 'Participant not set' })

  // Validate both athletes are on the team's roster
  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id')
    .eq('team_id', teamId)
    .in('athlete_id', [outAthleteId, inAthleteId])

  const memberIds = new Set(((members ?? []) as Array<{ athlete_id: string | null }>).map((m) => m.athlete_id))
  if (!memberIds.has(outAthleteId)) return res.status(400).json({ error: 'outAthleteId is not on this team' })
  if (!memberIds.has(inAthleteId)) return res.status(400).json({ error: 'inAthleteId is not on this team' })

  const currentLineup = (match.active_lineup as Record<string, string[]> | null) ?? { a: [], b: [] }
  const sideList = [...(currentLineup[side] ?? [])]

  const idx = sideList.indexOf(outAthleteId)
  if (idx === -1) return res.status(400).json({ error: 'outAthleteId is not currently active on this side' })
  if (sideList.includes(inAthleteId)) return res.status(400).json({ error: 'inAthleteId is already active' })

  sideList[idx] = inAthleteId
  const newLineup = { ...currentLineup, [side]: sideList }

  await supabase.from('matches').update({ active_lineup: newLineup }).eq('id', matchId)

  await writeAuditLog({
    actorId: req.user!.id,
    action: 'match_live_lineup_swapped',
    entityType: 'match',
    entityId: matchId,
    details: {
      event_id: match.event_id,
      side,
      out_athlete_id: outAthleteId,
      in_athlete_id: inAthleteId,
    },
  })

  res.json({ success: true, activeLineup: newLineup })
})

export default router
