/**
 * Automated insights (player trends + team streaks).
 * Same logic as `supabase/functions/compute-insights`; runs in Node so Edge deploy/DNS is not required.
 */
import supabase from '../utils/supabase'

interface PlayerGameStats {
  athlete_id: string
  sport: string
  stats: Record<string, number>
}

const INSIGHT_THRESHOLD = 0.10

const KEY_STATS: Record<string, string[]> = {
  basketball: ['total_points', 'total_rebounds', 'total_assists', 'fg_made'],
  volleyball: ['kills', 'aces', 'digs', 'blocks'],
  'table-tennis': ['pts_scored', 'sets_won'],
}

const STAT_LABELS: Record<string, string> = {
  total_points: 'PPG',
  total_rebounds: 'RPG',
  total_assists: 'APG',
  kills: 'Kills',
  aces: 'Aces',
  digs: 'Digs',
  blocks: 'Blocks',
  pts_scored: 'Points Scored',
  sets_won: 'Sets Won',
}

function statBag(stats: unknown): Record<string, number> {
  if (!stats || typeof stats !== 'object') return {}
  const o = stats as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(o)) {
    const n = Number(v)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

async function computePlayerInsights(matchId: string, seasonId: string): Promise<void> {
  const { data: gameStats } = await supabase
    .from('player_game_stats')
    .select('athlete_id, sport, stats')
    .eq('match_id', matchId)

  if (!gameStats || gameStats.length === 0) return

  for (const gs of gameStats as PlayerGameStats[]) {
    const { athlete_id, sport } = gs

    const { data: last3 } = await supabase
      .from('player_game_stats')
      .select('stats')
      .eq('athlete_id', athlete_id)
      .eq('sport', sport)
      .order('created_at', { ascending: false })
      .limit(3)

    if (!last3 || last3.length < 2) continue

    const { data: seasonStats } = await supabase
      .from('player_season_stats')
      .select('stats, games_played')
      .eq('athlete_id', athlete_id)
      .eq('season_id', seasonId)
      .single()

    if (!seasonStats || seasonStats.games_played < 3) continue

    const agg = statBag(seasonStats.stats)
    const gp = seasonStats.games_played
    const keyStats = KEY_STATS[sport] ?? []

    for (const statKey of keyStats) {
      const seasonAvg = (agg[statKey] ?? 0) / gp
      if (seasonAvg === 0) continue

      const rolling3Avg =
        last3.reduce((sum: number, g: { stats: unknown }) => sum + statBag(g.stats)[statKey], 0) / last3.length

      const delta = (rolling3Avg - seasonAvg) / seasonAvg

      if (Math.abs(delta) >= INSIGHT_THRESHOLD) {
        const direction = delta > 0 ? 'trending_up' : 'trending_down'
        const label = STAT_LABELS[statKey] ?? statKey
        const pct = Math.abs(Math.round(delta * 100))

        const { data: athlete } = await supabase
          .from('athletes')
          .select('profile:profiles!athletes_profile_id_fkey(full_name)')
          .eq('id', athlete_id)
          .single()

        const prRaw = (athlete as { profile?: { full_name?: string } | { full_name?: string }[] } | null)?.profile
        const pr = Array.isArray(prRaw) ? prRaw[0] : prRaw
        const name = pr?.full_name ?? 'Athlete'
        const direction_text = delta > 0 ? 'trending +' : 'down '
        const insight_text = `${name} is ${direction_text}${pct}% in ${label} over the last 3 games`

        const { error: upErr } = await supabase.from('insights').upsert(
          {
            entity_type: 'player',
            entity_id: athlete_id,
            sport,
            season_id: seasonId,
            insight_text,
            insight_type: direction,
            data: { stat_key: statKey, season_avg: seasonAvg, rolling_avg: rolling3Avg, delta_pct: pct },
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'entity_type,entity_id,sport,season_id,insight_type' },
        )

        if (upErr) console.error('[computeInsights] player upsert:', upErr.message)
      }
    }
  }
}

async function computeTeamInsights(matchId: string, seasonId: string): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  const { data: event } = await supabase.from('events').select('sport').eq('id', match.event_id).single()

  if (!event || event.sport === 'table-tennis') return

  const teamIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[]

  const { data: seasonEvents } = await supabase.from('events').select('id').eq('season_id', seasonId)
  const eventIds = (seasonEvents ?? []).map((e: { id: string }) => e.id)
  if (eventIds.length === 0) return

  for (const teamId of teamIds) {
    const { data: tss } = await supabase
      .from('team_season_stats')
      .select('wins, losses, stats')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .single()

    if (!tss) continue

    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single()

    const teamName = (team as { name: string } | null)?.name ?? 'Team'

    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, bracket_id, created_at')
      .eq('status', 'completed')
      .in('event_id', eventIds)
      .not('bracket_id', 'is', null)
      .or(`participant_a_id.eq.${teamId},participant_b_id.eq.${teamId}`)
      .order('created_at', { ascending: false })
      .limit(16)

    const inSeason = (recentMatches ?? []).filter((r: { bracket_id: string | null }) => Boolean(r.bracket_id))
    const bracketIds = [...new Set(inSeason.map((r) => r.bracket_id).filter((id): id is string => Boolean(id)))]

    if (bracketIds.length < 3) continue

    const { data: brackets } = await supabase.from('brackets').select('id, winner_id').in('id', bracketIds)

    const winnerByBracket = new Map(
      (brackets ?? []).map((b: { id: string; winner_id: string | null }) => [b.id, b.winner_id]),
    )

    let streak = 0
    for (const m of inSeason) {
      const w = m.bracket_id ? winnerByBracket.get(m.bracket_id) : null
      if (w === teamId) streak++
      else break
    }

    if (streak >= 3) {
      const { error: upErr } = await supabase.from('insights').upsert(
        {
          entity_type: 'team',
          entity_id: teamId,
          sport: event.sport,
          season_id: seasonId,
          insight_text: `${teamName} is on a ${streak}-game win streak`,
          insight_type: 'streak',
          data: { wins: tss.wins, losses: tss.losses, streak },
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'entity_type,entity_id,sport,season_id,insight_type' },
      )

      if (upErr) console.error('[computeInsights] team upsert:', upErr.message)
    }
  }
}

/** Run after a match ends / finalize — writes `insights` rows using service-role DB client. */
export async function computeInsightsForMatch(matchId: string, seasonId: string): Promise<void> {
  await Promise.all([computePlayerInsights(matchId, seasonId), computeTeamInsights(matchId, seasonId)])
}
