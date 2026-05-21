-- Migration: Clear plaintext/SHA-256 team passwords
-- Date: 2026-05-10
-- Reason: team_password_hash was previously stored as plaintext (admin flow bug)
--         and SHA-256 (regular flow). Both replaced by PBKDF2 in teams.js.
--         Existing hashes invalidated with RESET_REQUIRED placeholder so team
--         owners must re-set passwords through the app (which now stores PBKDF2).
--
-- NOTE: Cannot NULL out due to NOT NULL constraint on team_password_hash column.
--       RESET_REQUIRED will never match a real PBKDF2 hash (64-char hex string).

UPDATE teams
SET team_password_hash = 'RESET_REQUIRED'
WHERE team_password_hash NOT LIKE '%$%'         -- not already a proper hash format
  AND team_password_hash != 'RESET_REQUIRED'    -- not already reset
  AND length(team_password_hash) != 64;         -- not a 64-char PBKDF2 hex hash
