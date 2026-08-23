-- admin_analytics.sql
-- Adds personal launch tracking, paywall event logging, and admin RPC functions.

-- 1. Add columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personal_launches_total integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- 2. paywall_events table
CREATE TABLE IF NOT EXISTS paywall_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  paywall_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paywall_events_user_id ON paywall_events(user_id);
CREATE INDEX IF NOT EXISTS idx_paywall_events_type ON paywall_events(paywall_type);

ALTER TABLE paywall_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own paywall events" ON paywall_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all paywall events" ON paywall_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Admin summary RPC
CREATE OR REPLACE FUNCTION get_admin_summary()
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT jsonb_build_object(
    'total_users',     COUNT(*),
    'free_users',      COUNT(*) FILTER (WHERE NOT (subscription_tier = 'unlimited' AND subscription_status = 'active')),
    'unlimited_users', COUNT(*) FILTER (WHERE subscription_tier = 'unlimited' AND subscription_status = 'active'),
    'trial_users',     COUNT(*) FILTER (WHERE subscription_status = 'trial')
  ) INTO result FROM profiles;
  RETURN result;
END;
$$;

-- 4. Admin per-user stats RPC
CREATE OR REPLACE FUNCTION get_admin_user_stats()
RETURNS TABLE(
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  subscription_tier text,
  subscription_status text,
  personal_launches_total integer,
  last_active_at timestamptz,
  created_at timestamptz,
  teams_owned bigint,
  teams_joined bigint,
  total_paywall_hits bigint,
  paywall_breakdown jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.first_name,
    p.last_name,
    p.role,
    p.subscription_tier,
    p.subscription_status,
    COALESCE(p.personal_launches_total, 0),
    p.last_active_at,
    p.created_at,
    (SELECT COUNT(*) FROM teams WHERE owner_id = p.id),
    (SELECT COUNT(*) FROM team_members tm WHERE tm.user_id = p.id AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = tm.team_id AND t.owner_id = p.id)),
    (SELECT COUNT(*) FROM paywall_events pe WHERE pe.user_id = p.id),
    (SELECT COALESCE(jsonb_object_agg(pe2.paywall_type, pe2.cnt), '{}'::jsonb) FROM (
      SELECT pe2.paywall_type, COUNT(*) AS cnt FROM paywall_events pe2 WHERE pe2.user_id = p.id GROUP BY pe2.paywall_type
    ) pe2)
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
