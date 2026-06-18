-- Deployments table: tracks each release cycle from testing through deployment
CREATE TABLE IF NOT EXISTS public.deployments (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at           timestamptz DEFAULT now() NOT NULL,

  -- Testing phase fields (populated when "Finalize Testing & Prepare Deployment" is clicked)
  version              text        NOT NULL,
  testing_account      text,
  testing_completed_at timestamptz,
  test_os              text,          -- 'mac' | 'windows' | 'both'
  tests_total          integer,
  tests_passed         integer,
  tests_failed         integer,
  tests_skipped        integer,
  deployment_folder    text,
  mac_results_file     text,
  win_results_file     text,

  -- Deployment phase fields (populated when "Finalize Deployment" is clicked)
  status               text DEFAULT 'testing_complete',  -- 'testing_complete' | 'deployed' | 'rolled_back'
  commit_id            text,
  deployed_at          timestamptz,
  deploy_account       text,
  mac_installer_path   text,
  win_installer_path   text,
  deploy_results_file  text,
  notes                text
);

ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage deployments"
  ON public.deployments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
