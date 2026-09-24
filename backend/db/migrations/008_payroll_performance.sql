-- ════════════════════════════════════════════════════════════════════
-- Payroll & performance: persisted payslip lines, consultant payouts,
-- final-dues approvals, the bonus engine, OKRs, review cycles and
-- succession plans. Additive only.
-- ════════════════════════════════════════════════════════════════════

-- ── Payroll lines (frozen at generation so approved runs never change) ──
CREATE TABLE payroll_lines (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  payroll_run_id text NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id    text REFERENCES employees(id) ON DELETE SET NULL,
  employee_name  text NOT NULL,
  employee_no    text NOT NULL,
  title          text NOT NULL DEFAULT '',
  department_id  text,
  kra_pin        text,
  basic          numeric(14, 2) NOT NULL DEFAULT 0,
  house          numeric(14, 2) NOT NULL DEFAULT 0,
  transport      numeric(14, 2) NOT NULL DEFAULT 0,
  airtime        numeric(14, 2) NOT NULL DEFAULT 0,
  bonus          numeric(14, 2) NOT NULL DEFAULT 0,
  gross          numeric(14, 2) NOT NULL DEFAULT 0,
  nssf_tier1     numeric(14, 2) NOT NULL DEFAULT 0,
  nssf_tier2     numeric(14, 2) NOT NULL DEFAULT 0,
  nssf           numeric(14, 2) NOT NULL DEFAULT 0,
  shif           numeric(14, 2) NOT NULL DEFAULT 0,
  housing_levy   numeric(14, 2) NOT NULL DEFAULT 0,
  taxable        numeric(14, 2) NOT NULL DEFAULT 0,
  paye           numeric(14, 2) NOT NULL DEFAULT 0,
  net            numeric(14, 2) NOT NULL DEFAULT 0,
  position       int NOT NULL DEFAULT 0,
  UNIQUE (payroll_run_id, employee_id)
);
CREATE INDEX payroll_lines_run_idx ON payroll_lines (payroll_run_id);

-- ── Consultant payouts (from approved timesheets) ───────────────────
CREATE TABLE consultant_payouts (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period       text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  status       text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Approved', 'Paid')),
  consultants  int NOT NULL DEFAULT 0,
  hours        numeric(10, 1) NOT NULL DEFAULT 0,
  gross        numeric(16, 2) NOT NULL DEFAULT 0,
  wht          numeric(16, 2) NOT NULL DEFAULT 0,
  net          numeric(16, 2) NOT NULL DEFAULT 0,
  -- [{step, role, name, status, at}] Finance → HR.
  approvals    jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_ref  text,
  paid_at      timestamptz,
  created_by   text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consultant_payouts_ws_idx ON consultant_payouts (workspace_id, period);

CREATE TABLE consultant_payout_lines (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payout_id     text NOT NULL REFERENCES consultant_payouts(id) ON DELETE CASCADE,
  employee_id   text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period        text NOT NULL,
  hours         numeric(10, 1) NOT NULL DEFAULT 0,
  rate          numeric(10, 2) NOT NULL DEFAULT 0,
  gross         numeric(14, 2) NOT NULL DEFAULT 0,
  wht           numeric(14, 2) NOT NULL DEFAULT 0,
  net           numeric(14, 2) NOT NULL DEFAULT 0,
  timesheet_ids text[] NOT NULL DEFAULT '{}',
  -- A consultant is paid at most once per period.
  UNIQUE (employee_id, period)
);
CREATE INDEX consultant_payout_lines_payout_idx ON consultant_payout_lines (payout_id);

-- ── Final dues sign-off (Finance → HR → CEO) ────────────────────────
CREATE TABLE final_dues_approvals (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  offboarding_id text NOT NULL REFERENCES offboardings(id) ON DELETE CASCADE,
  step           smallint NOT NULL CHECK (step BETWEEN 0 AND 2),
  role           text NOT NULL,
  name           text NOT NULL,
  decided_by     text REFERENCES employees(id) ON DELETE SET NULL,
  amount_kes     numeric(14, 2) NOT NULL DEFAULT 0,
  decided_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offboarding_id, step)
);

-- ── Bonus engine ────────────────────────────────────────────────────
CREATE TABLE bonus_rules (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  threshold    numeric(3, 1) NOT NULL DEFAULT 3.5 CHECK (threshold BETWEEN 0 AND 5),
  -- [{min, max, pct}] — % of one month's salary per rating band.
  bands        jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_cap   numeric(16, 2) NOT NULL DEFAULT 0,
  updated_by   text REFERENCES employees(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bonus_cycles (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id       text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  quarter            text NOT NULL CHECK (quarter ~ '^\d{4}-Q[1-4]$'),
  status             text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Paid')),
  threshold          numeric(3, 1) NOT NULL,
  bands              jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_cap         numeric(16, 2) NOT NULL DEFAULT 0,
  headcount          int NOT NULL DEFAULT 0,
  eligible           int NOT NULL DEFAULT 0,
  total              numeric(16, 2) NOT NULL DEFAULT 0,
  -- [{step, role, name, status, at}] HR → Finance → CEO.
  approvals          jsonb NOT NULL DEFAULT '[]'::jsonb,
  queued_for_payroll boolean NOT NULL DEFAULT false,
  payroll_run_id     text REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_by         text REFERENCES employees(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, quarter)
);

CREATE TABLE bonus_lines (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cycle_id       text NOT NULL REFERENCES bonus_cycles(id) ON DELETE CASCADE,
  employee_id    text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rating         numeric(3, 1) NOT NULL,
  band_pct       numeric(6, 2) NOT NULL DEFAULT 0,
  monthly_salary numeric(14, 2) NOT NULL DEFAULT 0,
  bonus          numeric(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (cycle_id, employee_id)
);

-- ── KPIs: direction of the measure ──────────────────────────────────
ALTER TABLE kpis ADD COLUMN IF NOT EXISTS lower_is_better boolean NOT NULL DEFAULT false;
UPDATE kpis SET lower_is_better = true WHERE name IN ('Operating cost ratio', 'First response time');

-- ── OKRs ────────────────────────────────────────────────────────────
CREATE TABLE objectives (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  quarter      text NOT NULL DEFAULT '2026-Q3',
  title        text NOT NULL,
  owner_id     text REFERENCES employees(id) ON DELETE SET NULL,
  confidence   text NOT NULL DEFAULT 'Medium' CHECK (confidence IN ('High', 'Medium', 'Low')),
  position     int NOT NULL DEFAULT 0,
  created_by   text REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX objectives_ws_idx ON objectives (workspace_id, quarter);

CREATE TABLE key_results (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  objective_id text NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  title        text NOT NULL,
  current      text NOT NULL DEFAULT '',
  target       text NOT NULL DEFAULT '',
  progress     smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  position     int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX key_results_objective_idx ON key_results (objective_id);

CREATE TABLE key_result_updates (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  key_result_id text NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  progress      smallint NOT NULL CHECK (progress BETWEEN 0 AND 100),
  current       text NOT NULL DEFAULT '',
  note          text,
  author_id     text REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX key_result_updates_kr_idx ON key_result_updates (key_result_id, created_at DESC);

-- ── Review cycles ───────────────────────────────────────────────────
CREATE TABLE review_cycles (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  quarter      text NOT NULL CHECK (quarter ~ '^\d{4}-Q[1-4]$'),
  period_start date NOT NULL,
  period_end   date NOT NULL,
  closes_on    date NOT NULL,
  -- 0 Self review · 1 Manager review · 2 Peer feedback · 3 Calibration · 4 Released
  stage        smallint NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 4),
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, quarter)
);

-- One row per reviewee per cycle; carries the calibrated final rating.
CREATE TABLE review_participants (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cycle_id      text NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id   text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  final_rating  numeric(3, 1) CHECK (final_rating BETWEEN 1 AND 5),
  calibrated_by text REFERENCES employees(id) ON DELETE SET NULL,
  UNIQUE (cycle_id, employee_id)
);

CREATE TABLE reviews (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cycle_id     text NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('self', 'manager', 'peer')),
  status       text NOT NULL DEFAULT 'In Progress' CHECK (status IN ('Not started', 'In Progress', 'Submitted')),
  -- {competencyKey: 1..5}
  ratings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall      numeric(3, 1),
  strengths    text NOT NULL DEFAULT '',
  improvements text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, kind, reviewer_id)
);
CREATE INDEX reviews_cycle_employee_idx ON reviews (cycle_id, employee_id);

-- ── Succession planning ─────────────────────────────────────────────
CREATE TABLE succession_plans (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role_title    text NOT NULL,
  department_id text REFERENCES departments(id) ON DELETE SET NULL,
  incumbent_id  text REFERENCES employees(id) ON DELETE SET NULL,
  -- [{employeeId, readiness: 'Ready now'|'1–2 years'|'3+ years', flightRisk: 'Low'|'Medium'|'High'}]
  successors    jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes         text NOT NULL DEFAULT '',
  position      int NOT NULL DEFAULT 0,
  updated_by    text REFERENCES employees(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX succession_plans_ws_idx ON succession_plans (workspace_id);
