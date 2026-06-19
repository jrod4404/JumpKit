-- Alter deployments table for dual-platform (Mac + Windows) testing support
-- Replaces single-OS columns with separate mac_/win_ columns.
-- One record per release version; both runs write to the same row.

ALTER TABLE deployments
  DROP COLUMN IF EXISTS test_os,
  DROP COLUMN IF EXISTS tests_total,
  DROP COLUMN IF EXISTS tests_passed,
  DROP COLUMN IF EXISTS tests_failed,
  DROP COLUMN IF EXISTS tests_skipped,
  DROP COLUMN IF EXISTS testing_account,
  DROP COLUMN IF EXISTS win_results_file;

ALTER TABLE deployments RENAME COLUMN mac_results_file TO results_file;

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS mac_testing_account TEXT,
  ADD COLUMN IF NOT EXISTS mac_tests_total      INT,
  ADD COLUMN IF NOT EXISTS mac_tests_passed     INT,
  ADD COLUMN IF NOT EXISTS mac_tests_failed     INT,
  ADD COLUMN IF NOT EXISTS mac_tests_skipped    INT,
  ADD COLUMN IF NOT EXISTS mac_finalized_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS win_testing_account  TEXT,
  ADD COLUMN IF NOT EXISTS win_tests_total      INT,
  ADD COLUMN IF NOT EXISTS win_tests_passed     INT,
  ADD COLUMN IF NOT EXISTS win_tests_failed     INT,
  ADD COLUMN IF NOT EXISTS win_tests_skipped    INT,
  ADD COLUMN IF NOT EXISTS win_finalized_at     TIMESTAMPTZ;

-- Status values:
--   testing_in_progress  = at least one run finalized, not both
--   testing_complete     = both mac_finalized_at and win_finalized_at are set
--   deployed             = Finalize Deployment was clicked
