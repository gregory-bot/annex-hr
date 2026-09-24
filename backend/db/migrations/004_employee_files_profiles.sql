-- Employee files (stored in Postgres for now) and extended employee profiles.

CREATE TABLE employee_files (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category     text NOT NULL CHECK (category IN ('National ID', 'KRA PIN', 'SHIF', 'NSSF', 'Passport', 'NDA', 'Contract', 'Certificate', 'Other')),
  -- Onboarding task the file was uploaded for, if any.
  task_id      text,
  filename     text NOT NULL,
  content_type text NOT NULL,
  size_bytes   integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256       text NOT NULL,
  data         bytea NOT NULL,
  uploaded_by  text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_files_employee_idx ON employee_files (workspace_id, employee_id);

-- The file attached to a completed onboarding document task.
ALTER TABLE onboarding_task_completions ADD COLUMN file_id text REFERENCES employee_files(id) ON DELETE SET NULL;

-- Personal, emergency, bank and statutory details (KRA PIN and national ID live on employees).
CREATE TABLE employee_profiles (
  employee_id            text PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  workspace_id           text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  preferred_name         text,
  personal_email         text,
  address                text,
  city                   text,
  marital_status         text,
  nationality            text,
  emergency_name         text,
  emergency_relationship text,
  emergency_phone        text,
  bank_name              text,
  bank_branch            text,
  bank_account_name      text,
  bank_account_number    text,
  shif_number            text,
  nssf_number            text,
  passport_number        text,
  nda_signed_at          timestamptz,
  nda_signature          text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_profiles_workspace_idx ON employee_profiles (workspace_id);
