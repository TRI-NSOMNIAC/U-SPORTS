-- Events
CREATE TYPE event_format AS ENUM ('single_elim', 'double_elim', 'round_robin');
CREATE TYPE event_status AS ENUM ('draft', 'registration', 'in_progress', 'completed', 'cancelled');
CREATE TYPE match_status AS ENUM ('scheduled', 'live', 'completed', 'cancelled');
CREATE TYPE participant_type AS ENUM ('team', 'athlete', 'doubles_pair');

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  format event_format NOT NULL DEFAULT 'single_elim',
  status event_status DEFAULT 'draft',
  category TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event participants (teams or individual athletes for TT)
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  participant_type participant_type NOT NULL,
  seed INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, participant_id)
);

-- Brackets
CREATE TABLE brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_order INTEGER NOT NULL,
  participant_a_id UUID,
  participant_b_id UUID,
  winner_id UUID,
  next_bracket_id UUID REFERENCES brackets(id),
  is_bye BOOLEAN DEFAULT FALSE,
  bracket_type TEXT DEFAULT 'winners',  -- 'winners', 'losers', 'grand_final'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bracket_id UUID REFERENCES brackets(id),
  participant_a_id UUID,
  participant_b_id UUID,
  status match_status DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  venue TEXT,
  scored_by UUID REFERENCES profiles(id),
  scoring_locked_by UUID REFERENCES profiles(id),
  scoring_locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match scores (per participant per match)
CREATE TABLE match_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  sport TEXT NOT NULL,
  -- Basketball
  q1 INTEGER DEFAULT 0,
  q2 INTEGER DEFAULT 0,
  q3 INTEGER DEFAULT 0,
  q4 INTEGER DEFAULT 0,
  ot INTEGER DEFAULT 0,
  -- Volleyball
  set1 INTEGER DEFAULT 0,
  set2 INTEGER DEFAULT 0,
  set3 INTEGER DEFAULT 0,
  set4 INTEGER DEFAULT 0,
  set5 INTEGER DEFAULT 0,
  sets_won INTEGER DEFAULT 0,
  -- Table Tennis
  game1 INTEGER DEFAULT 0,
  game2 INTEGER DEFAULT 0,
  game3 INTEGER DEFAULT 0,
  game4 INTEGER DEFAULT 0,
  game5 INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  -- Computed total (basketball)
  total INTEGER GENERATED ALWAYS AS (q1 + q2 + q3 + q4 + ot) STORED,
  UNIQUE(match_id, participant_id)
);

-- Scoring actions (granular log for undo support)
CREATE TABLE scoring_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES athletes(id),
  action_type TEXT NOT NULL,
  value NUMERIC DEFAULT 1,
  quarter_or_set INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  undone BOOLEAN DEFAULT FALSE,
  recorded_by UUID REFERENCES profiles(id)
);

-- RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_actions ENABLE ROW LEVEL SECURITY;

-- All public reads; org/admin writes
CREATE POLICY "events_select_all" ON events FOR SELECT USING (TRUE);
CREATE POLICY "events_write_admin" ON events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

CREATE POLICY "event_participants_select_all" ON event_participants FOR SELECT USING (TRUE);
CREATE POLICY "event_participants_write_admin" ON event_participants FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

CREATE POLICY "brackets_select_all" ON brackets FOR SELECT USING (TRUE);
CREATE POLICY "brackets_write_admin" ON brackets FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

CREATE POLICY "matches_select_all" ON matches FOR SELECT USING (TRUE);
CREATE POLICY "matches_write_admin" ON matches FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

CREATE POLICY "match_scores_select_all" ON match_scores FOR SELECT USING (TRUE);
CREATE POLICY "match_scores_write_admin" ON match_scores FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

CREATE POLICY "scoring_actions_select_admin" ON scoring_actions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);
CREATE POLICY "scoring_actions_write_admin" ON scoring_actions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Enable realtime on match_scores and matches for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE match_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE brackets;
