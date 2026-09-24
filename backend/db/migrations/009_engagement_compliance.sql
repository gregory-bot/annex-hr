-- Engagement & compliance: survey drafts/audiences/participation, compliance files and requests,
-- company document storage with versions, and probation reviews.

-- ── Pulse surveys ───────────────────────────────────────────────────
-- audience_departments: empty = everyone in the workspace.
ALTER TABLE surveys
  ADD COLUMN audience_departments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN created_by   text REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN closed_at    timestamptz;

-- Who has answered (one response per person per survey). Deliberately not linked to
-- survey_responses so anonymous answers can't be traced back; only the day is kept.
CREATE TABLE survey_participants (
  survey_id    text NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  responded_on date NOT NULL DEFAULT current_date,
  PRIMARY KEY (survey_id, employee_id)
);
CREATE INDEX survey_responses_survey_idx ON survey_responses (survey_id);

-- ── Compliance documents ────────────────────────────────────────────
ALTER TABLE compliance_documents
  ADD COLUMN file_id      text REFERENCES employee_files(id) ON DELETE SET NULL,
  ADD COLUMN requested_at timestamptz,
  ADD COLUMN requested_by text REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN reminded_at  timestamptz,
  ADD COLUMN updated_at   timestamptz NOT NULL DEFAULT now();

-- ── Company documents (bytes stored in Postgres for now) ────────────
CREATE TABLE company_files (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  content_type text NOT NULL,
  size_bytes   integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
  sha256       text NOT NULL,
  data         bytea NOT NULL,
  uploaded_by  text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_files_workspace_idx ON company_files (workspace_id);

ALTER TABLE documents ADD COLUMN file_id text REFERENCES company_files(id) ON DELETE SET NULL;
ALTER TABLE document_versions
  ADD COLUMN file_id    text REFERENCES company_files(id) ON DELETE SET NULL,
  ADD COLUMN note       text,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX document_versions_document_idx ON document_versions (document_id, position);

-- ── Probation ───────────────────────────────────────────────────────
CREATE TABLE probation_events (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('confirmed', 'extended', 'review_scheduled')),
  -- extended: the new end date; review_scheduled: the review date; confirmed: the confirmation date.
  date         date NOT NULL,
  days         smallint,
  reason       text,
  by_id        text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX probation_events_employee_idx ON probation_events (workspace_id, employee_id, created_at DESC);
