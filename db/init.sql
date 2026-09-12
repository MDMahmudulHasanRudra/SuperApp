-- SuperApp PostgreSQL Schema
-- Auto-executed on first container start (docker-entrypoint-initdb.d)
--
-- Two kinds of tables:
--   1. "blob" tables  -> (session_id UNIQUE, data JSONB). One row per browser session,
--                        driven by the generic /api/db/:table routes + useDbStorage().
--   2. structured tables -> data_sessions, network_checks, isp_validations. These have
--                        dedicated handlers in backend/server.js.

-- ---------------------------------------------------------------------------
-- 1. Blob tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS templates (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracted_data (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ping_history (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS http_profiles (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subdomain_history (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS port_scans (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdf_conversions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved API request collections (HTTP Requester)
CREATE TABLE IF NOT EXISTS api_collections (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recon campaigns (Scan Campaigns)
CREATE TABLE IF NOT EXISTS scan_campaigns (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watched certificates (SSL Monitor)
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitored targets (Network Dashboard)
CREATE TABLE IF NOT EXISTS dashboard_targets (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Structured tables
-- ---------------------------------------------------------------------------

-- Fill-from-Sample / Smart Fill working session (one row per browser session)
CREATE TABLE IF NOT EXISTS data_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  step TEXT DEFAULT 'upload-demo',
  demo_file_name TEXT DEFAULT '',
  demo_headers JSONB DEFAULT '[]'::jsonb,
  demo_rows JSONB DEFAULT '[]'::jsonb,
  source_file_name TEXT DEFAULT '',
  source_headers JSONB DEFAULT '[]'::jsonb,
  source_rows JSONB DEFAULT '[]'::jsonb,
  col_map JSONB DEFAULT '{}'::jsonb,
  filled_data JSONB DEFAULT '[]'::jsonb,
  unique_rules JSONB DEFAULT '{"clientCode":true,"mobile":true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Append-only uptime log written by the Network Dashboard poller
CREATE TABLE IF NOT EXISTS network_checks (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default',
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'ping', 'ssl')),
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'unknown')),
  latency_ms NUMERIC,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_network_checks_session ON network_checks(session_id);
CREATE INDEX IF NOT EXISTS idx_network_checks_checked ON network_checks(checked_at DESC);

-- One row per ISP Excel validation run (history list)
CREATE TABLE IF NOT EXISTS isp_validations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL DEFAULT 'default',
  template_type TEXT NOT NULL CHECK (template_type IN ('admin', 'mac')),
  file_name TEXT NOT NULL DEFAULT '',
  file_url TEXT DEFAULT '',
  total_rows INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  valid_count INTEGER DEFAULT 0,
  auto_fix_count INTEGER DEFAULT 0,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_isp_validations_session ON isp_validations(session_id);
CREATE INDEX IF NOT EXISTS idx_isp_validations_created ON isp_validations(created_at DESC);
