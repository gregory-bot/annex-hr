-- ════════════════════════════════════════════════════════════════════
-- Annex HR — initial schema
-- Runs with search_path set to the Annex HR schema (DB_SCHEMA), so all
-- objects below are created there and nowhere else.
-- Every tenant-owned table carries workspace_id for isolation.
-- ════════════════════════════════════════════════════════════════════

-- ── Tenancy & identity ──────────────────────────────────────────────
CREATE TABLE workspaces (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name         text NOT NULL,
  industry     text NOT NULL,
  country      text NOT NULL,
  size         text NOT NULL,
  domain       text NOT NULL UNIQUE,
  logo_text    text NOT NULL,
  plan         text NOT NULL DEFAULT 'Starter' CHECK (plan IN ('Starter', 'Growth', 'Enterprise')),
  founded      int,
  brand_primary   text NOT NULL DEFAULT '#C1121F',
  brand_secondary text NOT NULL DEFAULT '#E63946',
  email_verified_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offices (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  city         text NOT NULL,
  country      text NOT NULL,
  address      text NOT NULL,
  headcount    int NOT NULL DEFAULT 0
);
CREATE INDEX offices_workspace_idx ON offices (workspace_id);

CREATE TABLE departments (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  head_id      text,
  color        text NOT NULL DEFAULT '#C1121F',
  budget_kes   numeric(14, 2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE employees (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id        text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_no         text NOT NULL,
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text,
  photo               text,
  title               text NOT NULL,
  department_id       text REFERENCES departments(id) ON DELETE SET NULL,
  manager_id          text REFERENCES employees(id) ON DELETE SET NULL,
  role                text NOT NULL DEFAULT 'employee'
                        CHECK (role IN ('super_admin', 'company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo')),
  employment_type     text NOT NULL CHECK (employment_type IN ('Full-time', 'Contract', 'Consultant', 'Intern', 'Part-time')),
  status              text NOT NULL CHECK (status IN ('Active', 'Probation', 'On Leave', 'Onboarding', 'Notice Period', 'Exited')),
  gender              text CHECK (gender IN ('Female', 'Male')),
  location            text,
  start_date          date NOT NULL,
  birthday            date,
  salary_kes          numeric(14, 2) NOT NULL DEFAULT 0,
  probation_end       date,
  performance         numeric(3, 1) NOT NULL DEFAULT 3.0 CHECK (performance BETWEEN 0 AND 5),
  potential           smallint NOT NULL DEFAULT 2 CHECK (potential BETWEEN 1 AND 3),
  onboarding_progress smallint NOT NULL DEFAULT 0 CHECK (onboarding_progress BETWEEN 0 AND 100),
  kra_pin             text,
  national_id         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email),
  UNIQUE (workspace_id, employee_no)
);
CREATE INDEX employees_workspace_idx ON employees (workspace_id);
CREATE INDEX employees_department_idx ON employees (department_id);
CREATE INDEX employees_manager_idx ON employees (manager_id);

ALTER TABLE departments
  ADD CONSTRAINT departments_head_fk FOREIGN KEY (head_id) REFERENCES employees(id) ON DELETE SET NULL;

-- Login accounts. An account belongs to exactly one workspace:
-- employees can only sign in to their own organisation.
CREATE TABLE users (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id   text NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL
                  CHECK (role IN ('super_admin', 'company_admin', 'hr_officer', 'manager', 'employee', 'consultant', 'finance', 'ceo')),
  two_factor_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE invitations (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         text NOT NULL DEFAULT 'employee',
  department_id text REFERENCES departments(id) ON DELETE SET NULL,
  token        text NOT NULL UNIQUE,
  invited_by   text REFERENCES employees(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Revoked', 'Expired')),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_workspace_idx ON invitations (workspace_id);

-- ── Leave, holidays, attendance ─────────────────────────────────────
CREATE TABLE holidays (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date         date NOT NULL,
  name         text NOT NULL,
  country      text NOT NULL,
  UNIQUE (workspace_id, date, country)
);

CREATE TABLE leave_requests (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id    text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study')),
  start_date     date NOT NULL,
  end_date       date NOT NULL CHECK (end_date >= start_date),
  days           numeric(5, 1) NOT NULL CHECK (days > 0),
  reason         text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Draft', 'Escalated')),
  stage          text NOT NULL DEFAULT 'Manager' CHECK (stage IN ('Manager', 'HR', 'CEO', 'Complete')),
  submitted_at   date NOT NULL DEFAULT current_date,
  handover_to    text REFERENCES employees(id) ON DELETE SET NULL,
  handover_notes boolean NOT NULL DEFAULT false,
  decided_by     text REFERENCES employees(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leave_requests_workspace_idx ON leave_requests (workspace_id, status);
CREATE INDEX leave_requests_employee_idx ON leave_requests (employee_id);

CREATE TABLE attendance_records (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  clock_in     timestamptz NOT NULL,
  clock_out    timestamptz,
  method       text NOT NULL DEFAULT 'Web' CHECK (method IN ('Web', 'Mobile', 'Biometric')),
  latitude     numeric(9, 6),
  longitude    numeric(9, 6),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_employee_date_idx ON attendance_records (employee_id, work_date);

-- ── Consultant timesheets ───────────────────────────────────────────
CREATE TABLE timesheets (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  status       text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Draft', 'Escalated')),
  rate_kes     numeric(10, 2) NOT NULL DEFAULT 0,
  approved_by  text REFERENCES employees(id) ON DELETE SET NULL,
  approved_at  timestamptz,
  comment      text,
  UNIQUE (employee_id, week_start)
);

CREATE TABLE timesheet_entries (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  timesheet_id text NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  project      text NOT NULL,
  billable     boolean NOT NULL DEFAULT true,
  -- Hours Monday → Sunday.
  hours        numeric(4, 1)[] NOT NULL CHECK (array_length(hours, 1) = 7),
  position     smallint NOT NULL DEFAULT 0
);
CREATE INDEX timesheet_entries_sheet_idx ON timesheet_entries (timesheet_id);

-- ── Payroll ─────────────────────────────────────────────────────────
CREATE TABLE payroll_runs (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period       text NOT NULL,
  status       text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending Approval', 'Approved', 'Paid', 'Synced to Odoo')),
  employees    int NOT NULL DEFAULT 0,
  gross        numeric(16, 2) NOT NULL DEFAULT 0,
  net          numeric(16, 2) NOT NULL DEFAULT 0,
  paye         numeric(16, 2) NOT NULL DEFAULT 0,
  shif         numeric(16, 2) NOT NULL DEFAULT 0,
  nssf         numeric(16, 2) NOT NULL DEFAULT 0,
  housing_levy numeric(16, 2) NOT NULL DEFAULT 0,
  bonuses      numeric(16, 2) NOT NULL DEFAULT 0,
  prepared_by  text NOT NULL,
  position     smallint NOT NULL DEFAULT 0,
  odoo_synced_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period)
);

CREATE TABLE payroll_approvals (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payroll_run_id text NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  step           smallint NOT NULL,
  role           text NOT NULL,
  name           text NOT NULL,
  status         text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Draft', 'Escalated')),
  decided_at     date,
  UNIQUE (payroll_run_id, step)
);

-- ── Policies & acknowledgements ─────────────────────────────────────
CREATE TABLE policies (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  category     text NOT NULL,
  version      text NOT NULL,
  updated_on   date NOT NULL,
  owner        text NOT NULL,
  mandatory    boolean NOT NULL DEFAULT true,
  acknowledged smallint NOT NULL DEFAULT 0 CHECK (acknowledged BETWEEN 0 AND 100),
  summary      text NOT NULL DEFAULT '',
  UNIQUE (workspace_id, title)
);

CREATE TABLE policy_versions (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id  text NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version    text NOT NULL,
  date       date NOT NULL,
  note       text NOT NULL,
  position   smallint NOT NULL DEFAULT 0
);

CREATE TABLE policy_acknowledgements (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id    text NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  version      text NOT NULL,
  signature    text NOT NULL,
  ip_address   text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, employee_id, version)
);

-- ── Onboarding ──────────────────────────────────────────────────────
CREATE TABLE onboarding_tasks (
  id           text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL,
  category     text NOT NULL CHECK (category IN ('Documents', 'Policies', 'Profile', 'Finance')),
  required     boolean NOT NULL DEFAULT true,
  position     smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE onboarding_task_completions (
  workspace_id text NOT NULL,
  task_id      text NOT NULL,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (employee_id, task_id),
  FOREIGN KEY (workspace_id, task_id) REFERENCES onboarding_tasks(workspace_id, id) ON DELETE CASCADE
);

-- ── Compliance & documents ──────────────────────────────────────────
CREATE TABLE compliance_documents (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('Passport', 'Work Visa', 'Driving Licence', 'Contract', 'Academic Certificate', 'Certificate of Good Conduct', 'Professional License')),
  number       text NOT NULL,
  issued       date NOT NULL,
  expires      date,
  status       text NOT NULL CHECK (status IN ('Valid', 'Expiring', 'Expired', 'Missing')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_documents_workspace_idx ON compliance_documents (workspace_id, expires);

CREATE TABLE documents (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  folder       text NOT NULL,
  size         text NOT NULL,
  type         text NOT NULL CHECK (type IN ('pdf', 'docx', 'xlsx', 'png')),
  updated_on   date NOT NULL,
  owner        text NOT NULL,
  version      text NOT NULL,
  employee_id  text REFERENCES employees(id) ON DELETE SET NULL,
  storage_key  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_workspace_folder_idx ON documents (workspace_id, folder);

CREATE TABLE document_versions (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version     text NOT NULL,
  date        date NOT NULL,
  by_name     text NOT NULL,
  position    smallint NOT NULL DEFAULT 0
);

-- ── Disciplinary & grievance (confidential) ─────────────────────────
CREATE TABLE hr_cases (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ref          text NOT NULL,
  type         text NOT NULL CHECK (type IN ('Disciplinary', 'Grievance', 'Harassment', 'Misconduct', 'Performance')),
  subject_id   text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- 'Anonymous' or an employee id
  reported_by  text NOT NULL DEFAULT 'Anonymous',
  opened       date NOT NULL DEFAULT current_date,
  status       text NOT NULL DEFAULT 'Logged' CHECK (status IN ('Logged', 'Investigating', 'Hearing', 'Awaiting Approval', 'Closed')),
  severity     text NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  assigned_to  text REFERENCES employees(id) ON DELETE SET NULL,
  confidential boolean NOT NULL DEFAULT true,
  summary      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ref)
);

CREATE TABLE case_events (
  id       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id  text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  date     date NOT NULL,
  title    text NOT NULL,
  by_name  text NOT NULL,
  note     text NOT NULL,
  position smallint NOT NULL DEFAULT 0
);

CREATE TABLE case_evidence (
  id       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id  text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  name     text NOT NULL,
  size     text NOT NULL,
  uploaded date NOT NULL,
  storage_key text
);

CREATE TABLE case_access_log (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id    text NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Exit & offboarding ──────────────────────────────────────────────
CREATE TABLE offboardings (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id   text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  employee_id    text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reason         text NOT NULL CHECK (reason IN ('Resignation', 'Contract End', 'Termination', 'Retirement')),
  submitted      date NOT NULL,
  last_day       date NOT NULL,
  notice_days    int NOT NULL,
  progress       smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  handover       boolean NOT NULL DEFAULT false,
  exit_interview boolean NOT NULL DEFAULT false,
  final_dues_kes numeric(14, 2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offboarding_assets (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  offboarding_id text NOT NULL REFERENCES offboardings(id) ON DELETE CASCADE,
  name           text NOT NULL,
  returned       boolean NOT NULL DEFAULT false,
  position       smallint NOT NULL DEFAULT 0
);

-- ── Engagement, performance, notifications ──────────────────────────
CREATE TABLE surveys (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Live', 'Closed', 'Draft')),
  responses    int NOT NULL DEFAULT 0,
  audience     int NOT NULL DEFAULT 0,
  engagement   smallint NOT NULL DEFAULT 0,
  enps         smallint NOT NULL DEFAULT 0,
  closes       date NOT NULL,
  anonymous    boolean NOT NULL DEFAULT true,
  questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  position     smallint NOT NULL DEFAULT 0
);

-- Anonymous surveys store no employee id — only the department for aggregate views.
CREATE TABLE survey_responses (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  survey_id     text NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  employee_id   text REFERENCES employees(id) ON DELETE SET NULL,
  department_id text REFERENCES departments(id) ON DELETE SET NULL,
  answers       jsonb NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kpis (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  perspective  text NOT NULL CHECK (perspective IN ('Financial', 'Customer', 'Internal Process', 'Learning & Growth')),
  name         text NOT NULL,
  target       numeric(12, 2) NOT NULL,
  actual       numeric(12, 2) NOT NULL,
  unit         text NOT NULL DEFAULT '',
  weight       smallint NOT NULL,
  owner        text NOT NULL,
  position     smallint NOT NULL DEFAULT 0
);

CREATE TABLE notifications (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- NULL = visible to everyone in the workspace
  recipient_id text REFERENCES employees(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('approval', 'leave', 'payroll', 'performance', 'policy', 'probation', 'document', 'system')),
  title        text NOT NULL,
  body         text NOT NULL,
  href         text NOT NULL,
  time_label   text,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_workspace_idx ON notifications (workspace_id, created_at DESC);

-- Precomputed analytics series (headcount, leave, funnel, …) per workspace.
CREATE TABLE metric_series (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric       text NOT NULL,
  data         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, metric)
);

-- ── Audit ───────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      text REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  ip_address   text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_workspace_idx ON audit_logs (workspace_id, created_at DESC);
