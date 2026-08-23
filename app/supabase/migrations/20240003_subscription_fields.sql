-- Migration 003: Add subscription fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'overdue', 'cancelled')),
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'core', 'teams_jet')),
  ADD COLUMN IF NOT EXISTS ls_customer_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_launches_used INTEGER NOT NULL DEFAULT 0;
