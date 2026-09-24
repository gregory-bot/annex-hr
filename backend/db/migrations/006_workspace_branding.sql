-- Workspace branding: an uploaded logo (bytes stored in Postgres for now) and an optional custom domain.

ALTER TABLE workspaces
  ADD COLUMN logo_data                bytea,
  ADD COLUMN logo_content_type        text,
  ADD COLUMN logo_updated_at          timestamptz,
  ADD COLUMN custom_domain            text UNIQUE,
  ADD COLUMN custom_domain_verified_at timestamptz;
