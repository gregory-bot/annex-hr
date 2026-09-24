-- ════════════════════════════════════════════════════════════════════
-- Annex HR — ticketing (Linear-style requests to internal teams)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE ticket_teams (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#C1121F',
  position     smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key),
  UNIQUE (workspace_id, name)
);
CREATE INDEX ticket_teams_workspace_idx ON ticket_teams (workspace_id, position);

CREATE TABLE tickets (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id      text NOT NULL REFERENCES ticket_teams(id) ON DELETE CASCADE,
  -- Per-team sequence: allocated as max(number) + 1 while holding a lock on the team row.
  number       int NOT NULL CHECK (number > 0),
  identifier   text NOT NULL,
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description  text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'Todo'
                 CHECK (status IN ('Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled')),
  priority     text NOT NULL DEFAULT 'None'
                 CHECK (priority IN ('Urgent', 'High', 'Medium', 'Low', 'None')),
  reporter_id  text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignee_id  text REFERENCES employees(id) ON DELETE SET NULL,
  labels       text[] NOT NULL DEFAULT '{}',
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, identifier),
  UNIQUE (team_id, number)
);
CREATE INDEX tickets_workspace_updated_idx ON tickets (workspace_id, updated_at DESC);
CREATE INDEX tickets_workspace_status_idx ON tickets (workspace_id, status);
CREATE INDEX tickets_assignee_idx ON tickets (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX tickets_reporter_idx ON tickets (reporter_id);

CREATE TABLE ticket_comments (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ticket_id    text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id    text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_comments_ticket_idx ON ticket_comments (ticket_id, created_at);
