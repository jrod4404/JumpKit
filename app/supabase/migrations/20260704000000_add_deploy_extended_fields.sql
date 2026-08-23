-- Add extended deployment fields to track all items surfaced in the release docs Summary tab.
-- Includes deployment check counts, Vercel commit, backup path, and deploy notes.

ALTER TABLE public.deployments
  ADD COLUMN IF NOT EXISTS vercel_commit_id     TEXT,
  ADD COLUMN IF NOT EXISTS backup_path          TEXT,
  ADD COLUMN IF NOT EXISTS deploy_notes         TEXT,
  ADD COLUMN IF NOT EXISTS deploy_checks_passed INTEGER,
  ADD COLUMN IF NOT EXISTS deploy_checks_skipped INTEGER,
  ADD COLUMN IF NOT EXISTS deploy_checks_todo   INTEGER,
  ADD COLUMN IF NOT EXISTS deploy_checks_total  INTEGER;

COMMENT ON COLUMN public.deployments.vercel_commit_id     IS 'Git commit hash deployed to Vercel (landing page)';
COMMENT ON COLUMN public.deployments.backup_path          IS 'Local path to the pre-deployment backup archive';
COMMENT ON COLUMN public.deployments.deploy_notes         IS 'Free-form notes recorded at deployment time';
COMMENT ON COLUMN public.deployments.deploy_checks_passed IS 'Number of deployment checklist steps marked Done';
COMMENT ON COLUMN public.deployments.deploy_checks_skipped IS 'Number of deployment checklist steps marked Skipped';
COMMENT ON COLUMN public.deployments.deploy_checks_todo   IS 'Number of deployment checklist steps still To Do at save time';
COMMENT ON COLUMN public.deployments.deploy_checks_total  IS 'Total deployment checklist steps';
