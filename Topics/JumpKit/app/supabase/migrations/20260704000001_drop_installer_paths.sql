-- Remove installer path and deploy results file columns from deployments.
-- These are managed locally/in release docs; no need to store in Supabase.

ALTER TABLE public.deployments
  DROP COLUMN IF EXISTS mac_installer_path,
  DROP COLUMN IF EXISTS win_installer_path,
  DROP COLUMN IF EXISTS deploy_results_file;
