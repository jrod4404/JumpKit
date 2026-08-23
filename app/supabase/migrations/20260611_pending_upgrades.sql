-- ============================================================
-- Migration: pending_upgrades table
-- Purpose: Stores paid Lemon Squeezy subscriptions where the user
--          purchased Unlimited BEFORE creating a JumpKit account.
--          The ls-webhook writes here when no profile row exists.
--          apply-pending-upgrade reads + deletes here on first login.
-- Run: Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_upgrades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,            -- one pending upgrade per email
  tier            TEXT NOT NULL DEFAULT 'core',
  ls_customer_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS; service role bypasses it so edge functions can read/write freely.
-- No user-facing policies needed — users never access this table directly.
ALTER TABLE pending_upgrades ENABLE ROW LEVEL SECURITY;
