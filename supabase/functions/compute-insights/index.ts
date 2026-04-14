import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface PlayerGameStats {
  athlete_id: string
  sport: string
  stats: Record<string, number>
}

interface PlayerSeasonStats {
  athlete_id: string
  season_id: string
  sport: string
  games_played: number
  stats: Record<string, number>
}

const INSIGHT_THRESHOLD = 0.10 // 10% delta triggers an insight

// Key stats per sport to evaluate for insights
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

async function computePlayerInsights(matchId: string, seasonId: string) {
  // Get all athletes in this match
  const { data: gameStats } = await supabase
    .from('player_game_stats')
    .select('athlete_id, sport, stats')
    .eq('match_id', matchId)

  if (!gameStats || gameStats.length === 0) return

  for (const gs of gameStats as PlayerGameStats[]) {
    const { athlete_id, sport, stats } = gs

    // Get last 3 games for this athlete (including this one)
    const { data: last3 } = await supabase
      .from('player_game_stats')
      .select('stats')
      .eq('athlete_id', athlete_id)
      .eq('sport', sport)
      .order('created_at', { ascending: false })
      .limit(3)

    if (!last3 || last3.length < 2) continue

    // Get season averages
    const { data: seasonStats } = await supabase
      .from('player_season_stats')
      .select('stats, games_played')
      .eq('athlete_id', athlete_id)
      .eq('season_id', seasonId)
      .single()

    if (!seasonStats || seasonStats.games_played < 3) continue

    const keyStats = KEY_STATS[sport] ?? []

    for (const statKey of keyStats) {
      const seasonAvg = (seasonStats.stats[statKey] ?? 0) / seasonStats.games_played
      if (seasonAvg === 0) continue

      const rolling3Avg =
        last3.reduce((sum: number, g: { stats: Record<string, number> }) => sum + (g.stats[statKey] ?? 0), 0) / last3.length

      const delta = (rolling3Avg - seasonAvg) / seasonAvg

      if (Math.abs(delta) >= INSIGHT_THRESHOLD) {
        const direction = delta > 0 ? 'trending_up' : 'trending_down'
        const label = STAT_LABELS[statKey] ?? statKey
        const pct = Math.abs(Math.round(delta * 100))

        // Get athlete name
        const { data: athlete } = await supabase
          .from('athletes')
          .select('profile:profiles(full_name)')
          .eq('id', athlete_id)
          .single()

        const name = (athlete as { profile: { full_name: string } } | null)?.profile?.full_name ?? 'Athlete'
        const direction_text = delta > 0 ? 'trending +' : 'down '
        const insight_text = `${name} is ${direction_text}${pct}% in ${label} over the last 3 games`

        // Upsert insight (replace old insight for same athlete+stat)
        await supabase.from('insights').upsert(
          {
            entity_type: 'player',
            entity_id: athlete_id,
            sport,
            insight_text,
            insight_type: direction,
            data: { stat_key: statKey, season_avg: seasonAvg, rolling_avg: rolling3Avg, delta_pct: pct },
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'entity_id,sport' }
        )
      }
    }
  }
}

async function computeTeamInsights(matchId: string, seasonId: string) {
  // Get match to find teams
  const { data: match } = await supabase
    .from('matches')
    .select('participant_a_id, participant_b_id, event_id')
    .eq('id', matchId)
    .single()

  if (!match) return

  // Get event sport
  const { data: event } = await supabase
    .from('events')
    .select('sport')
    .eq('id', match.event_id)
    .single()

  if (!event || event.sport === 'table-tennis') return

  const teamIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[]

  for (const teamId of teamIds) {
    const { data: tss } = await supabase
      .from('team_season_stats')
      .select('wins, losses, stats')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .single()

    if (!tss) continue

    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single()

    const teamName = (team as { name: string } | null)?.name ?? 'Team'
    const insights: string[] = []

    // Win streak: check last 4 matches
    const { data: recentMatches } = await supabase
      .from('matches')
      .select('id, participant_a_id, participant_b_id')
      .eq('status', 'completed')
      .or(`participant_a_id.eq.${teamId},participant_b_id.eq.${teamId}`)
      .order('created_at', { ascending: false })
      .limit(5)

    // Count wins via brackets
    if (recentMatches && recentMatches.length >= 4) {
      const { data: winBrackets } = await supabase
        .from('brackets')
        .select('winner_id')
        .in('id', recentMatches.map((m: { id: string }) => m.id))
        .eq('winner_id', teamId)

      const streak = winBrackets?.length ?? 0
      if (streak >= 3) {
        insights.push(`${teamName} is on a ${streak}-game win streak`)
      }
    }

    for (const text of insights) {
      await supabase.from('insights').insert({
        entity_type: 'team',
        entity_id: teamId,
        sport: event.sport,
        insight_text: text,
        insight_type: 'streak',
        data: { wins: tss.wins, losses: tss.losses },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { matchId, seasonId } = await req.json()
    if (!matchId || !seasonId) {
      return new Response('Missing matchId or seasonId', { status: 400 })
    }

    await Promise.all([
      computePlayerInsights(matchId, seasonId),
      computeTeamInsights(matchId, seasonId),
    ])

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Insight computation error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
