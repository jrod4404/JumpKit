-- ── member_stats ──────────────────────────────────────────────────
-- Stores per-user aggregate launch stats per team (for Team ROI dashboard).
-- Only synced for unlimited (non-free) users. Team owners can read all members' rows.
CREATE TABLE IF NOT EXISTS member_stats (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id             UUID NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  total_launches      INTEGER NOT NULL DEFAULT 0,
  total_seconds_saved INTEGER NOT NULL DEFAULT 0,
  dollars_per_hour    DECIMAL(10,2) NOT NULL DEFAULT 100,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);
ALTER TABLE member_stats ENABLE ROW LEVEL SECURITY;

-- Each user can read/write their own stats
CREATE POLICY "member_stats_self"
  ON member_stats FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Team owners can read all member stats for their teams
CREATE POLICY "member_stats_owner_read"
  ON member_stats FOR SELECT
  USING (is_team_owner(team_id));
