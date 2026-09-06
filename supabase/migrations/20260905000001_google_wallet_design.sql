-- Organization-wide, admin-controlled Wallet payload experiment.
'ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS google_wallet_design TEXT NOT NULL DEFAULT 'builder';

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_google_wallet_design_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_google_wallet_design_check
  CHECK (google_wallet_design IN ('builder', 'legacy'));'
