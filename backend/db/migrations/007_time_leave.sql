-- Time, attendance & leave: shift settings, breaks, leave policies (accruals), handover files,
-- HR alerts on leave requests and timesheet submission / reminder tracking.

-- Workspace shift used for late arrivals, overtime and the local work date.
CREATE TABLE attendance_settings (
  workspace_id  text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  shift_start   time NOT NULL DEFAULT '08:30',
  shift_end     time NOT NULL DEFAULT '17:30',
  grace_min     smallint NOT NULL DEFAULT 10 CHECK (grace_min BETWEEN 0 AND 120),
  hours_per_day numeric(4, 1) NOT NULL DEFAULT 8 CHECK (hours_per_day BETWEEN 1 AND 24),
  timezone      text NOT NULL DEFAULT 'Africa/Nairobi',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- At most one open attendance record per person.
CREATE UNIQUE INDEX attendance_one_open_idx ON attendance_records (employee_id) WHERE clock_out IS NULL;
CREATE INDEX attendance_workspace_date_idx ON attendance_records (workspace_id, work_date);

CREATE TABLE attendance_breaks (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  record_id    text NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  employee_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX attendance_breaks_record_idx ON attendance_breaks (record_id);
CREATE UNIQUE INDEX attendance_breaks_one_open_idx ON attendance_breaks (employee_id) WHERE ended_at IS NULL;

-- Leave entitlements per workspace and type (defaults apply when a workspace has no row).
CREATE TABLE leave_policies (
  workspace_id      text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study')),
  annual_days       numeric(5, 1) NOT NULL CHECK (annual_days BETWEEN 0 AND 366),
  accrual           text NOT NULL DEFAULT 'upfront' CHECK (accrual IN ('monthly', 'upfront')),
  carry_over_max    numeric(5, 1) NOT NULL DEFAULT 0 CHECK (carry_over_max BETWEEN 0 AND 366),
  -- 'MM-DD' in the following leave year when carried-over days lapse (NULL = never).
  expires_month_day text CHECK (expires_month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, type)
);

-- Handover document (uploaded through the files API) and HR alerts raised when the request was made.
ALTER TABLE employee_files DROP CONSTRAINT IF EXISTS employee_files_category_check;
ALTER TABLE employee_files ADD CONSTRAINT employee_files_category_check
  CHECK (category IN ('National ID', 'KRA PIN', 'SHIF', 'NSSF', 'Passport', 'NDA', 'Contract', 'Certificate', 'Other', 'Handover'));

ALTER TABLE leave_requests
  ADD COLUMN handover_file_id text REFERENCES employee_files(id) ON DELETE SET NULL,
  ADD COLUMN alerts           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN balance_warning  boolean NOT NULL DEFAULT false;

ALTER TABLE timesheets
  ADD COLUMN submitted_at     timestamptz,
  ADD COLUMN last_reminded_at timestamptz;
