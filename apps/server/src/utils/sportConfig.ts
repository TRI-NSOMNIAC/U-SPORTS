export const SPORT_POSITIONS: Record<string, string[]> = {
  basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
  volleyball: ['S', 'L', 'OH', 'OPP', 'MB', 'DS'],
  'table-tennis': ['Singles Men', 'Singles Women', 'Doubles Men', 'Doubles Women', 'Mixed Doubles'],
}

export const SPORT_KEY_STATS: Record<string, string[]> = {
  basketball: ['total_points', 'total_rebounds', 'total_assists', 'total_steals', 'total_blocks'],
  volleyball: ['kills', 'aces', 'digs', 'blocks', 'assists'],
  'table-tennis': ['pts_scored', 'sets_won', 'mw'],
}

export const TT_CATEGORIES = [
  'singles_men',
  'singles_women',
  'doubles_men',
  'doubles_women',
  'mixed_doubles',
]

export const TT_CATEGORY_LABELS: Record<string, string> = {
  singles_men: 'Singles Men',
  singles_women: 'Singles Women',
  doubles_men: 'Doubles Men',
  doubles_women: 'Doubles Women',
  mixed_doubles: 'Mixed Doubles',
}

export function isTeamSport(sport: string): boolean {
  return sport === 'basketball' || sport === 'volleyball'
}

export function getParticipantType(sport: string): 'team' | 'athlete' | 'doubles_pair' {
  if (isTeamSport(sport)) return 'team'
  return 'athlete'
}
