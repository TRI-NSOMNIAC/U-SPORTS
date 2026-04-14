-- Seasons
CREATE TYPE season_lifecycle AS ENUM ('draft', 'active', 'completed', 'archived');

CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status season_lifecycle DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  captain_id UUID REFERENCES athletes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (many-to-many: athletes <-> teams)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  UNIQUE(team_id, athlete_id),
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team coaches (organizer self-assigns as coach)
CREATE TABLE team_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE(organizer_id, team_id),
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_coaches ENABLE ROW LEVEL SECURITY;

-- Seasons: anyone can read; org/admin can write
CREATE POLICY "seasons_select_all" ON seasons FOR SELECT USING (TRUE);
CREATE POLICY "seasons_write_admin" ON seasons FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Teams: anyone can read; org/admin can write
CREATE POLICY "teams_select_all" ON teams FOR SELECT USING (TRUE);
CREATE POLICY "teams_write_admin" ON teams FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Team members: anyone can read; org/admin can write
CREATE POLICY "team_members_select_all" ON team_members FOR SELECT USING (TRUE);
CREATE POLICY "team_members_write_admin" ON team_members FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);

-- Team coaches: org/admin can manage
CREATE POLICY "team_coaches_select_all" ON team_coaches FOR SELECT USING (TRUE);
CREATE POLICY "team_coaches_write" ON team_coaches FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin'))
);
