-- Illuminate PostgreSQL schema (no Prisma)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                 TEXT,
  email                TEXT UNIQUE,
  email_verified       TIMESTAMPTZ,
  image                TEXT,
  password_hash        TEXT,
  linkedin_id          TEXT UNIQUE,
  registration_name    TEXT,
  registration_email   TEXT,
  headline             TEXT,
  company              TEXT,
  location             TEXT,
  bio                  TEXT,
  skills               TEXT NOT NULL DEFAULT '',
  tech_stack           TEXT NOT NULL DEFAULT '',
  interests            TEXT NOT NULL DEFAULT '',
  seniority            TEXT,
  event_types          TEXT NOT NULL DEFAULT '',
  raw_source           TEXT NOT NULL DEFAULT '',
  writing_samples      TEXT NOT NULL DEFAULT '[]',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step      INTEGER NOT NULL DEFAULT 1,
  agent_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  agent_keywords       TEXT NOT NULL DEFAULT 'ai,hackathon,startup,web3',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  provider             TEXT NOT NULL,
  provider_account_id  TEXT NOT NULL,
  refresh_token        TEXT,
  access_token         TEXT,
  expires_at           INTEGER,
  token_type           TEXT,
  scope                TEXT,
  id_token             TEXT,
  session_state        TEXT,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_token  TEXT NOT NULL UNIQUE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires    TIMESTAMPTZ NOT NULL,
  UNIQUE (identifier, token)
);

CREATE TABLE IF NOT EXISTS login_sessions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_sessions_user_id_idx ON login_sessions(user_id);
CREATE INDEX IF NOT EXISTS login_sessions_created_at_idx ON login_sessions(created_at);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  provider      TEXT NOT NULL DEFAULT 'linkedin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS luma_connections (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id            TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  ics_url_encrypted  TEXT NOT NULL,
  ics_url_last_ok_at TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'active',
  preview_json       TEXT NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  event_title   TEXT NOT NULL,
  event_url     TEXT NOT NULL,
  event_date    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  message       TEXT,
  form_payload  TEXT,
  response_body TEXT,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at   TIMESTAMPTZ,
  UNIQUE (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);

CREATE TABLE IF NOT EXISTS events (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug               TEXT NOT NULL UNIQUE,
  luma_api_id        TEXT,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  luma_url           TEXT NOT NULL,
  cover_url          TEXT,
  location           TEXT,
  is_online          BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  guest_count        INTEGER NOT NULL DEFAULT 0,
  is_paid            BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval  BOOLEAN NOT NULL DEFAULT FALSE,
  source_feeds       TEXT NOT NULL DEFAULT '',
  discovered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(starts_at);
CREATE INDEX IF NOT EXISTS events_discovered_at_idx ON events(discovered_at);

-- Full page payload from GET https://luma.com/{slug} (slug = path id, e.g. tldraw-vp8y)
CREATE TABLE IF NOT EXISTS event_details (
  id                            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug                          TEXT NOT NULL UNIQUE REFERENCES events(slug) ON DELETE CASCADE,
  luma_api_id                   TEXT,
  title                         TEXT NOT NULL DEFAULT '',
  description_text              TEXT NOT NULL DEFAULT '',
  description_mirror_json       TEXT NOT NULL DEFAULT '{}',
  cover_url                     TEXT,
  social_image_url              TEXT,
  location                      TEXT,
  location_json                 TEXT NOT NULL DEFAULT '{}',
  is_online                     BOOLEAN NOT NULL DEFAULT FALSE,
  timezone                      TEXT,
  starts_at                     TIMESTAMPTZ,
  ends_at                       TIMESTAMPTZ,
  guest_count                   INTEGER NOT NULL DEFAULT 0,
  ticket_count                  INTEGER NOT NULL DEFAULT 0,
  is_free                       BOOLEAN NOT NULL DEFAULT TRUE,
  is_sold_out                   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval             BOOLEAN NOT NULL DEFAULT FALSE,
  registration_availability     TEXT,
  waitlist_enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  hosts_json                    TEXT NOT NULL DEFAULT '[]',
  ticket_types_json             TEXT NOT NULL DEFAULT '[]',
  ticket_info_json              TEXT NOT NULL DEFAULT '{}',
  registration_questions_json   TEXT NOT NULL DEFAULT '[]',
  categories_json               TEXT NOT NULL DEFAULT '[]',
  featured_guests_json          TEXT NOT NULL DEFAULT '[]',
  calendar_json                 TEXT NOT NULL DEFAULT '{}',
  faqs_json                     TEXT,
  payload_json                  TEXT NOT NULL DEFAULT '{}',
  scraped_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS event_details_starts_at_idx ON event_details(starts_at);
CREATE INDEX IF NOT EXISTS event_details_luma_api_id_idx ON event_details(luma_api_id);
