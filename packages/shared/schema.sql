-- ===== Supabase Schema for Company Bot =====
-- Run this in Supabase SQL Editor

-- 1. Companies (includes flattened share_breakdown)
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sheet_name TEXT NOT NULL UNIQUE,
  data_date TEXT NOT NULL DEFAULT '',
  company_name_th TEXT NOT NULL DEFAULT '',
  company_name_en TEXT NOT NULL DEFAULT '',
  registration_number TEXT NOT NULL DEFAULT '',
  director_count INT NOT NULL DEFAULT 0,
  authorized_signatory TEXT NOT NULL DEFAULT '',
  registered_capital NUMERIC NOT NULL DEFAULT 0,
  capital_text TEXT NOT NULL DEFAULT '',
  -- share_breakdown (flattened 1:1)
  total_shares NUMERIC NOT NULL DEFAULT 0,
  par_value NUMERIC NOT NULL DEFAULT 100,
  paid_up_shares NUMERIC NOT NULL DEFAULT 0,
  paid_up_amount NUMERIC NOT NULL DEFAULT 0,
  -- other fields
  head_office_address TEXT NOT NULL DEFAULT '',
  objectives TEXT NOT NULL DEFAULT '',
  seal_image_drive_id TEXT NOT NULL DEFAULT '',
  seal_image_url TEXT NOT NULL DEFAULT '',
  seal_storage_path TEXT NOT NULL DEFAULT '',
  seal_storage_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Directors
CREATE TABLE IF NOT EXISTS directors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_directors_company ON directors(company_id);

-- 3. Shareholders
CREATE TABLE IF NOT EXISTS shareholders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  shares NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_shareholders_company ON shareholders(company_id);

-- 4. Company Documents
CREATE TABLE IF NOT EXISTS company_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  drive_file_id TEXT NOT NULL DEFAULT '',
  type TEXT,
  drive_url TEXT,
  updated_date TEXT,
  expiry_date TEXT,
  storage_path TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON company_documents(company_id);

-- 5. User Permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  can_view_documents BOOLEAN NOT NULL DEFAULT true,
  can_download_documents BOOLEAN NOT NULL DEFAULT true,
  approved BOOLEAN NOT NULL DEFAULT false,
  picture_url TEXT,
  pending_companies TEXT
);

-- 6. User Company Access (mapping user <-> company)
CREATE TABLE IF NOT EXISTS user_company_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES user_permissions(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_access_user ON user_company_access(user_id);
CREATE INDEX IF NOT EXISTS idx_access_company ON user_company_access(company_id);

-- 7. Version History
CREATE TABLE IF NOT EXISTS version_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp TEXT NOT NULL,
  company_sheet TEXT NOT NULL,
  field_changed TEXT NOT NULL DEFAULT '',
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_version_company ON version_history(company_sheet);

-- 8. Chat Logs
CREATE TABLE IF NOT EXISTS chat_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL DEFAULT '',
  company_context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_logs(user_id);
