-- Per-person read state for workspace-wide notifications, and HR-only notifications.

-- 'all' = everyone in the workspace; 'admins' = HR admins and executives only.
-- Only applies when recipient_id IS NULL (direct notifications always go to their recipient).
ALTER TABLE notifications
  ADD COLUMN audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'admins'));

CREATE TABLE notification_reads (
  notification_id text NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  employee_id     text NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, employee_id)
);
CREATE INDEX notification_reads_employee_idx ON notification_reads (employee_id);

-- Existing HR-only broadcasts.
UPDATE notifications SET audience = 'admins'
 WHERE recipient_id IS NULL
   AND (title LIKE '% joined the workspace' OR title LIKE 'Welcome to Annex HR — %' OR (type = 'approval' AND title LIKE '% requested % leave'));
