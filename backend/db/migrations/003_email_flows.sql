-- Email-verified sign-up and password resets.

-- A pending workspace registration awaiting its emailed 6-digit code.
-- `payload` holds the validated registration (with a bcrypt password hash — never the plain password).
CREATE TABLE email_verifications (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email        text NOT NULL,
  code_hash    text NOT NULL,
  payload      jsonb NOT NULL,
  attempts     smallint NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verifications_email_idx ON email_verifications (email);

-- Single-use password reset links; only a SHA-256 of the token is stored.
CREATE TABLE password_resets (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);
