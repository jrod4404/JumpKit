-- Migration: Add seeded_at to profiles
-- Tracks whether a user's default data (columns/jumps) has been seeded.
-- Replaces the jk_seeded_<userId> localStorage flag — prevents re-seeding
-- across devices and after localStorage clears.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seeded_at TIMESTAMPTZ DEFAULT NULL;
