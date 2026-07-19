-- Add subscription_plan to profiles (monthly | annual | null for free)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_plan text
  CHECK (subscription_plan IN ('monthly', 'annual'));

-- Add plan to pending_upgrades so it carries through to first login
ALTER TABLE pending_upgrades
  ADD COLUMN IF NOT EXISTS plan text
  CHECK (plan IN ('monthly', 'annual'));
