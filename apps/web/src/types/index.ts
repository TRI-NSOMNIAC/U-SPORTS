export type Role = 'super_admin' | 'organizer' | 'athlete'

export type Sport = 'basketball' | 'volleyball' | 'table-tennis'

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

export type SeasonStatus = 'active' | 'inactive'

export type SeasonLifecycle = 'draft' | 'active' | 'completed' | 'archived'

export type EventFormat = 'single_elim' | 'double_elim' | 'round_robin'

export type EventStatus = 'draft' | 'registration' | 'in_progress' | 'completed' | 'cancelled'

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export type AnnouncementType = 'emergency' | 'reschedule' | 'reminder' | 'system'

export type AnnouncementUrgency = 'critical' | 'high' | 'normal' | 'low'

export type AudienceType = 'all' | 'sport' | 'event' | 'team'

export type InsightType = 'trending_up' | 'trending_down' | 'streak' | 'milestone'

export type ParticipantType = 'team' | 'athlete' | 'doubles_pair'

export interface Institution {
  id: string
  name: string
  abbreviation: string
  tagline: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  banner_url: string | null
  address: string
  region: string
  staff_email_domain: string
  student_email_domain: string
  is_setup_complete: boolean
  created_at: string
}

export interface SportConfig {
  id: string
  slug: Sport
  display_name: string
  icon: string
  is_active: boolean
  stat_definitions: Record<string, StatDefinition>
  positions: string[]
}

export interface StatDefinition {
  label: string
  type: 'count' | 'percentage' | 'decimal' | 'integer'
  derived?: boolean
  description?: string
}

export interface Profile {
  id: string
  role: Role
  full_name: string
  avatar_url: string | null
  email: string
  created_at: string
}

export interface Organizer {
  id: string
  profile_id: string
  assigned_sports: Sport[]
  permissions: Record<string, boolean>
  is_active: boolean
  profile?: Profile
}

export interface Athlete {
  id: string
  profile_id: string
  student_id: string
  sport: Sport
  position: string
  jersey_number: string | null
  year_level: string
  department: string
  verification_status: VerificationStatus
  season_status: SeasonStatus
  reviewer_id: string | null
  review_notes: string | null
  reviewed_at: string | null
  profile?: Profile
}

export interface VerificationDocument {
  id: string
  athlete_id: string
  document_type: 'cor' | 'medical_cert'
  file_url: string
  uploaded_at: string
}

export interface Team {
  id: string
  name: string
  sport: Sport
  season_id: string
  captain_id: string | null
  members?: Athlete[]
  coaches?: Organizer[]
}

export interface Season {
  id: string
  name: string
  status: SeasonLifecycle
  start_date: string
  end_date: string
  created_at: string
}

export interface Event {
  id: string
  name: string
  sport: Sport
  season_id: string
  format: EventFormat
  status: EventStatus
  category: string | null
  created_by: string
  created_at: string
  season?: Season
}

export interface EventParticipant {
  id: string
  event_id: string
  participant_id: string
  participant_type: ParticipantType
  seed: number | null
}

export interface Bracket {
  id: string
  event_id: string
  round: number
  match_order: number
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  next_bracket_id: string | null
  is_bye: boolean
  /** 'winners' | 'losers' | 'grand_final' from DB */
  bracket_type?: string | null
}

export interface Match {
  id: string
  event_id: string
  bracket_id: string | null
  participant_a_id: string | null
  participant_b_id: string | null
  status: MatchStatus
  scheduled_at: string | null
  venue: string | null
  scored_by: string | null
  scoring_locked_by: string | null
}

export interface MatchScore {
  id: string
  match_id: string
  participant_id: string
  sport: Sport
  q1?: number
  q2?: number
  q3?: number
  q4?: number
  ot?: number
  total?: number
  set1?: number
  set2?: number
  set3?: number
  set4?: number
  set5?: number
  sets_won?: number
  game1?: number
  game2?: number
  game3?: number
  game4?: number
  game5?: number
  games_won?: number
}

export interface ScoringAction {
  id: string
  match_id: string
  athlete_id: string | null
  action_type: string
  value: number
  quarter_or_set: number | null
  timestamp: string
  undone: boolean
}

export interface PlayerGameStats {
  id: string
  match_id: string
  athlete_id: string
  sport: Sport
  stats: Record<string, number>
}

export interface PlayerSeasonStats {
  id: string
  athlete_id: string
  season_id: string
  sport: Sport
  games_played: number
  stats: Record<string, number>
  updated_at: string
  athlete?: Athlete
}

export interface TeamSeasonStats {
  id: string
  team_id: string
  season_id: string
  wins: number
  losses: number
  stats: Record<string, number>
  updated_at: string
  team?: Team
}

export interface LeaderboardVisibility {
  id: string
  athlete_id: string
  season_id: string
  is_visible: boolean
}

export interface Insight {
  id: string
  entity_type: 'player' | 'team'
  entity_id: string
  sport: Sport
  insight_text: string
  insight_type: InsightType
  data: Record<string, unknown>
  created_at: string
  expires_at: string
}

export interface Announcement {
  id: string
  created_by: string
  type: AnnouncementType
  title: string
  body: string
  urgency: AnnouncementUrgency
  audience_type: AudienceType
  audience_id: string | null
  is_public: boolean
  linked_match_id: string | null
  new_scheduled_at: string | null
  new_venue: string | null
  published_at: string
  expires_at: string | null
  creator?: Profile
}

export interface Notification {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
  actor?: Profile
}

export interface TeamCoach {
  id: string
  organizer_id: string
  team_id: string
  assigned_at: string
  organizer?: Organizer
  team?: Team
}
