-- Disciplinary & grievance: evidence files, notes and sign-off chain.
-- Exit & offboarding: checklist, richer assets, handover, files, settlement and exit interview.

-- Evidence bytes live with the case (never in employee_files) so only the case team can reach them.
CREATE TABLE case_files (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  case_id      text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  content_type text NOT NULL,
  size_bytes   integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256       text NOT NULL,
  data         bytea NOT NULL,
  uploaded_by  text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_files_case_idx ON case_files (case_id);

CREATE TABLE case_notes (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id    text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  author_id  text REFERENCES employees(id) ON DELETE SET NULL,
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  visibility text NOT NULL DEFAULT 'hr_only' CHECK (visibility IN ('hr_only', 'case_team')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_notes_case_idx ON case_notes (case_id, created_at);

-- Investigator recommendation → HR Head review → CEO sign-off.
CREATE TABLE case_approvals (
  case_id    text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  step       text NOT NULL CHECK (step IN ('investigator', 'hr', 'ceo')),
  position   smallint NOT NULL,
  status     text NOT NULL DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'Pending', 'Approved', 'Rejected')),
  decided_by text REFERENCES employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  comment    text,
  PRIMARY KEY (case_id, step)
);

-- ── Offboarding ─────────────────────────────────────────────────────
ALTER TABLE offboardings
  ADD COLUMN handover_notes  text NOT NULL DEFAULT '',
  ADD COLUMN successor_id    text REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN manager_ack_by  text REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN manager_ack_at  timestamptz,
  ADD COLUMN hr_approved_by  text REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN hr_approved_at  timestamptz,
  ADD COLUMN stage           smallint NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 6);

ALTER TABLE offboarding_assets
  ADD COLUMN serial      text,
  ADD COLUMN condition   text NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Fair', 'Damaged', 'Lost')),
  ADD COLUMN value_kes   numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN returned_at timestamptz;

CREATE TABLE offboarding_checklist (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  offboarding_id text NOT NULL REFERENCES offboardings(id) ON DELETE CASCADE,
  item_key       text NOT NULL,
  grp            text NOT NULL CHECK (grp IN ('HR', 'IT', 'Finance', 'Manager')),
  label          text NOT NULL,
  done           boolean NOT NULL DEFAULT false,
  done_by        text REFERENCES employees(id) ON DELETE SET NULL,
  done_at        timestamptz,
  position       smallint NOT NULL DEFAULT 0,
  UNIQUE (offboarding_id, item_key)
);

-- Resignation letters and knowledge-transfer documents (kept with the exit, not the employee file).
CREATE TABLE offboarding_files (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  offboarding_id text NOT NULL REFERENCES offboardings(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('resignation_letter', 'knowledge_transfer')),
  filename       text NOT NULL,
  content_type   text NOT NULL,
  size_bytes     integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256         text NOT NULL,
  data           bytea NOT NULL,
  uploaded_by    text REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offboarding_files_off_idx ON offboarding_files (offboarding_id);

CREATE TABLE offboarding_settlements (
  offboarding_id       text PRIMARY KEY REFERENCES offboardings(id) ON DELETE CASCADE,
  monthly_salary_kes   numeric(14, 2) NOT NULL,
  unpaid_days          numeric(5, 1) NOT NULL DEFAULT 0 CHECK (unpaid_days BETWEEN 0 AND 31),
  leave_days           numeric(5, 1) NOT NULL DEFAULT 0 CHECK (leave_days BETWEEN 0 AND 120),
  notice_pay_kes       numeric(14, 2) NOT NULL DEFAULT 0,
  asset_deduction_kes  numeric(14, 2) NOT NULL DEFAULT 0,
  loan_kes             numeric(14, 2) NOT NULL DEFAULT 0,
  other_deduction_kes  numeric(14, 2) NOT NULL DEFAULT 0,
  gross_kes            numeric(14, 2) NOT NULL DEFAULT 0,
  paye_kes             numeric(14, 2) NOT NULL DEFAULT 0,
  nssf_kes             numeric(14, 2) NOT NULL DEFAULT 0,
  shif_kes             numeric(14, 2) NOT NULL DEFAULT 0,
  housing_levy_kes     numeric(14, 2) NOT NULL DEFAULT 0,
  net_kes              numeric(14, 2) NOT NULL DEFAULT 0,
  finance_by           text REFERENCES employees(id) ON DELETE SET NULL,
  finance_at           timestamptz,
  hr_by                text REFERENCES employees(id) ON DELETE SET NULL,
  hr_at                timestamptz,
  ceo_by               text REFERENCES employees(id) ON DELETE SET NULL,
  ceo_at               timestamptz,
  updated_by           text REFERENCES employees(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Filled in by the leaving employee; readable by HR admins only.
CREATE TABLE exit_interviews (
  offboarding_id  text PRIMARY KEY REFERENCES offboardings(id) ON DELETE CASCADE,
  employee_id     text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  nps             smallint NOT NULL CHECK (nps BETWEEN 0 AND 10),
  would_recommend boolean NOT NULL,
  improvements    text NOT NULL DEFAULT '',
  manager_rating  smallint NOT NULL CHECK (manager_rating BETWEEN 1 AND 5),
  would_return    boolean NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now()
);
