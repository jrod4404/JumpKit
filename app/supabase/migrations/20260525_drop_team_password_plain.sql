-- Migration: drop team_password_plain column from teams table
-- Date: 2026-05-25
-- Reason: Plaintext team passwords no longer stored. Password verification
--         is now handled server-side via the verify-team-password Edge Function.
--         Team owners enter the password at invite time; it is verified against
--         team_password_hash and included in the invite email at that moment only.
--         No plaintext password is persisted at any point.

ALTER TABLE teams DROP COLUMN IF EXISTS team_password_plain;
