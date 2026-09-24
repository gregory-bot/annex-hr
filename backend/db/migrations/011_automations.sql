-- Scheduled reminders & alerts ("automations").

-- Per-workspace rule settings. A missing row means the rule runs with its defaults (enabled).
CREATE TABLE automation_settings (
  workspace_id     text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule             text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by       text REFERENCES employees(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  last_run_at      timestamptz,
  last_run_summary jsonb,
  PRIMARY KEY (workspace_id, rule)
);

-- One row per reminder sent — the unique key makes each reminder fire once per milestone.
CREATE TABLE automation_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule         text NOT NULL,
  subject_key  text NOT NULL,
  summary      text NOT NULL DEFAULT '',
  recipients   text[] NOT NULL DEFAULT '{}',
  emails_sent  smallint NOT NULL DEFAULT 0,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, rule, subject_key)
);
CREATE INDEX automation_log_recent_idx ON automation_log (workspace_id, sent_at DESC);

-- Workspaces that already exist (other than the seeded demo tenants) start with every rule
-- switched off, so a deployment never surprises a live customer with a burst of reminders.
-- HR turns them on under Settings → Automations. New workspaces use the defaults (on).
INSERT INTO automation_settings (workspace_id, rule, enabled)
SELECT w.id, r.rule, false
  FROM workspaces w
 CROSS JOIN (VALUES ('probation'), ('document_expiry'), ('onboarding_nudges'), ('timesheet_approvals'), ('leave_approvals'), ('policy_acknowledgements')) AS r(rule)
 WHERE w.id NOT IN ('ws-annex', 'ws-demo', 'ws-chqi')
ON CONFLICT DO NOTHING;
