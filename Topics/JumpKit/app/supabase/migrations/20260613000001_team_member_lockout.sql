-- Team member lockout for downgrade from Unlimited to Free
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_notified_2day boolean NOT NULL DEFAULT false;
