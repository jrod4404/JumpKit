-- ============================================================
-- JumpKit Supabase Schema
-- Run this in your Supabase SQL Editor to initialize the DB.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── organizations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL,          -- references auth.users.id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── profiles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  first_name  TEXT DEFAULT '',
  last_name   TEXT DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'team-member'
                CHECK (role IN ('org-owner','team-owner','team-member','admin')),
  org_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
  seeded_at   TIMESTAMPTZ DEFAULT NULL,  -- set once when default data is seeded for new user
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── teams ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  team_password_hash  TEXT NOT NULL,  -- bcrypt hash stored server-side
  owner_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── team_members ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- ── team_invites ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  invited_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted'))
);

-- ── shared_columns ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_columns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── shared_jumps ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_jumps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_column_id  UUID NOT NULL REFERENCES shared_columns(id) ON DELETE CASCADE,
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL,
  description       TEXT,
  reason            TEXT,
  position          INTEGER NOT NULL DEFAULT 0,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- Enable Row-Level Security
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_jumps   ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- Helper functions
-- ══════════════════════════════════════════════════════════════════

-- Returns the current user's role (or 'anon' if not logged in)
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'anon'
  );
$$;

-- Returns the org_id of the current user
CREATE OR REPLACE FUNCTION current_user_org()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

-- Returns true if the current user is a member of a given team
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$$;

-- Returns true if the current user owns a given team
CREATE OR REPLACE FUNCTION is_team_owner(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  );
$$;

-- ══════════════════════════════════════════════════════════════════
-- RLS Policies
-- ══════════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────────────
-- Org-owners see all profiles in their org; others see only their own row.
-- Helper: returns true if current user shares any team with target_user_id
CREATE OR REPLACE FUNCTION is_teammate(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
    AND tm2.user_id = target_user_id
  ) OR EXISTS (
    SELECT 1 FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    WHERE tm.user_id = auth.uid()
    AND t.owner_id = target_user_id
  );
$$;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  auth.uid() = id
  OR current_user_role() = 'org-owner'
  OR is_teammate(id)
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── organizations ─────────────────────────────────────────────────
CREATE POLICY "orgs_select" ON organizations FOR SELECT USING (
  owner_id = auth.uid()
  OR id = current_user_org()
);
CREATE POLICY "orgs_insert" ON organizations FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs_update" ON organizations FOR UPDATE USING (owner_id = auth.uid());

-- ── teams ─────────────────────────────────────────────────────────
-- Org-owner sees all teams in their org; team-owner and members see their team.
CREATE POLICY "teams_select" ON teams FOR SELECT USING (
  (current_user_role() = 'org-owner' AND org_id = current_user_org())
  OR owner_id = auth.uid()
  OR is_team_member(id)
);
CREATE POLICY "teams_insert" ON teams FOR INSERT WITH CHECK (
  current_user_role() = 'org-owner'
);
CREATE POLICY "teams_update" ON teams FOR UPDATE USING (
  (current_user_role() = 'org-owner' AND org_id = current_user_org())
  OR owner_id = auth.uid()
);

-- ── team_members ──────────────────────────────────────────────────
CREATE POLICY "team_members_select" ON team_members FOR SELECT USING (
  (current_user_role() = 'org-owner' AND EXISTS (
    SELECT 1 FROM teams WHERE id = team_id AND org_id = current_user_org()
  ))
  OR is_team_owner(team_id)
  OR user_id = auth.uid()
);
CREATE POLICY "team_members_insert" ON team_members FOR INSERT WITH CHECK (
  is_team_owner(team_id)
  OR current_user_role() = 'org-owner'
  OR user_id = auth.uid()  -- self-join when accepting invite
);
CREATE POLICY "team_members_delete" ON team_members FOR DELETE USING (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);

-- ── team_invites ──────────────────────────────────────────────────
CREATE POLICY "team_invites_select" ON team_invites FOR SELECT USING (
  is_team_owner(team_id)
  OR current_user_role() = 'org-owner'
  OR email = (SELECT email FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "team_invites_insert" ON team_invites FOR INSERT WITH CHECK (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);
CREATE POLICY "team_invites_update" ON team_invites FOR UPDATE USING (
  invited_by = auth.uid()
  OR current_user_role() = 'org-owner'
  OR email = (SELECT email FROM profiles WHERE id = auth.uid())
);

-- ── shared_columns ────────────────────────────────────────────────
CREATE POLICY "shared_columns_select" ON shared_columns FOR SELECT USING (
  (current_user_role() = 'org-owner' AND EXISTS (
    SELECT 1 FROM teams WHERE id = team_id AND org_id = current_user_org()
  ))
  OR is_team_owner(team_id)
  OR is_team_member(team_id)
);
CREATE POLICY "shared_columns_insert" ON shared_columns FOR INSERT WITH CHECK (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);
CREATE POLICY "shared_columns_update" ON shared_columns FOR UPDATE USING (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);
CREATE POLICY "shared_columns_delete" ON shared_columns FOR DELETE USING (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);

-- ── shared_jumps ──────────────────────────────────────────────────
CREATE POLICY "shared_jumps_select" ON shared_jumps FOR SELECT USING (
  (current_user_role() = 'org-owner' AND EXISTS (
    SELECT 1 FROM teams WHERE id = team_id AND org_id = current_user_org()
  ))
  OR is_team_owner(team_id)
  OR is_team_member(team_id)
);
CREATE POLICY "shared_jumps_insert" ON shared_jumps FOR INSERT WITH CHECK (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);
CREATE POLICY "shared_jumps_update" ON shared_jumps FOR UPDATE USING (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);
CREATE POLICY "shared_jumps_delete" ON shared_jumps FOR DELETE USING (
  is_team_owner(team_id) OR current_user_role() = 'org-owner'
);

-- ══════════════════════════════════════════════════════════════════
-- Auto-update updated_at trigger
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER shared_jumps_updated_at
  BEFORE UPDATE ON shared_jumps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── member_stats ──────────────────────────────────────────────────────────────────
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

-- ── Migration: Fix teams_delete policy (allow org-owner to delete) ──
-- Run if teams delete is silently blocked for org-owners
DROP POLICY IF EXISTS "teams_delete" ON teams;
CREATE POLICY "teams_delete" ON teams FOR DELETE USING (
  owner_id = auth.uid()
  OR
  (SELECT org_id FROM teams t2 WHERE t2.id = teams.id) IN (
    SELECT id FROM organizations WHERE owner_id = auth.uid()
  )
);
