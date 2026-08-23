-- Remove redundant 'notes' column from deployments — superseded by deploy_notes.
ALTER TABLE public.deployments
  DROP COLUMN IF EXISTS notes;
