-- RPC function: increment a match score field atomically
CREATE OR REPLACE FUNCTION increment_match_score(
  p_match_id UUID,
  p_participant_id UUID,
  p_field TEXT,
  p_value NUMERIC
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format(
    'UPDATE match_scores SET %I = GREATEST(0, %I + $1) WHERE match_id = $2 AND participant_id = $3',
    p_field, p_field
  ) USING p_value, p_match_id, p_participant_id;
END;
$$;

-- RPC function: recompute player season stats from all game stats
CREATE OR REPLACE FUNCTION recompute_player_season_stats(
  p_athlete_id UUID,
  p_season_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sport TEXT;
  v_games_played INTEGER;
  v_aggregated_stats JSONB;
BEGIN
  -- Get sport from athlete
  SELECT sport INTO v_sport FROM athletes WHERE id = p_athlete_id;

  -- Get all game stats for this player in this season's matches
  SELECT
    COUNT(DISTINCT pgs.match_id),
    (
      SELECT jsonb_object_agg(key, sum_value)
      FROM (
        SELECT key, SUM((value::TEXT)::NUMERIC) AS sum_value
        FROM player_game_stats pgs2
        JOIN matches m ON pgs2.match_id = m.id
        JOIN events e ON m.event_id = e.id
        CROSS JOIN jsonb_each(pgs2.stats)
        WHERE pgs2.athlete_id = p_athlete_id
          AND e.season_id = p_season_id
        GROUP BY key
      ) agg
    )
  INTO v_games_played, v_aggregated_stats
  FROM player_game_stats pgs
  JOIN matches m ON pgs.match_id = m.id
  JOIN events e ON m.event_id = e.id
  WHERE pgs.athlete_id = p_athlete_id
    AND e.season_id = p_season_id;

  -- Upsert season stats
  INSERT INTO player_season_stats (athlete_id, season_id, sport, games_played, stats, updated_at)
  VALUES (p_athlete_id, p_season_id, v_sport, COALESCE(v_games_played, 0), COALESCE(v_aggregated_stats, '{}'), NOW())
  ON CONFLICT (athlete_id, season_id) DO UPDATE SET
    games_played = EXCLUDED.games_played,
    stats = EXCLUDED.stats,
    updated_at = NOW();
END;
$$;

-- Storage buckets (run in Supabase dashboard or CLI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('verification-documents', 'verification-documents', FALSE);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('institution-assets', 'institution-assets', TRUE);

-- Storage RLS: athletes can upload their own docs
-- CREATE POLICY "Athletes can upload their docs" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'verification-documents' AND auth.uid()::TEXT = (storage.foldername(name))[1]);
-- CREATE POLICY "Organizers can view docs" ON storage.objects
--   FOR SELECT USING (bucket_id = 'verification-documents' AND EXISTS (
--     SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('organizer', 'super_admin')
--   ));
-- CREATE POLICY "Public institution assets" ON storage.objects
--   FOR SELECT USING (bucket_id = 'institution-assets');
