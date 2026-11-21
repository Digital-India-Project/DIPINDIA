-- ============================================================================
-- DIGITAL INDIA PROJECT (DIP-DESK) — REMOTE POSTGRESQL / JUSTPOSTGRES SCHEMA
-- Migration: migrations/postgres/0001_justpostgres_schema.sql
-- Execute in JustPostgres SQL Editor before enabling PostgREST API access.
-- ============================================================================

-- 1. Users & RBAC Admin Registry
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Citizen User',
  email TEXT NOT NULL,
  mobile TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer',
  account_type TEXT NOT NULL DEFAULT 'customer',
  company_name TEXT,
  business_id TEXT,
  partner_id TEXT,
  referral_code TEXT,
  referred_by_code TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'Not Submitted',
  operator_enrollment_id TEXT,
  manager_scope TEXT,
  preferred_lang TEXT DEFAULT 'en',
  theme TEXT DEFAULT 'light',
  haptics_enabled BOOLEAN DEFAULT TRUE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  biometric_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pg_users_email ON public.users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_pg_users_role ON public.users (role);

CREATE TABLE IF NOT EXISTS public.admins (
  id TEXT PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Services Catalogue & Digital Products
CREATE TABLE IF NOT EXISTS public.services (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT DEFAULT '',
  category TEXT NOT NULL,
  subcategory TEXT DEFAULT '',
  product_type TEXT NOT NULL DEFAULT 'service',
  short_desc TEXT DEFAULT '',
  short_desc_hi TEXT DEFAULT '',
  full_desc TEXT DEFAULT '',
  full_desc_hi TEXT DEFAULT '',
  icon_name TEXT DEFAULT 'FileText',
  cover_image_url TEXT,
  service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  govt_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
  third_party_fees NUMERIC(12,2) DEFAULT 0,
  additional_charge NUMERIC(12,2) DEFAULT 0,
  urgent_fee NUMERIC(12,2) DEFAULT 0,
  discount_inr NUMERIC(12,2) DEFAULT 0,
  tax_rate_bps INTEGER DEFAULT 1800,
  tax_inclusive BOOLEAN DEFAULT FALSE,
  partner_price_inr NUMERIC(12,2) DEFAULT 0,
  billing_unit TEXT DEFAULT 'application',
  pricing_type TEXT DEFAULT 'fixed',
  delivery_type TEXT DEFAULT 'assisted',
  estimated_time TEXT DEFAULT '3 - 5 Working Days',
  sla_hours INTEGER DEFAULT 72,
  form_version INTEGER DEFAULT 1,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  popular BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  is_custom_quote BOOLEAN DEFAULT FALSE,
  b2b_supported BOOLEAN DEFAULT FALSE,
  integration_type TEXT DEFAULT 'manual_assistance',
  availability TEXT DEFAULT 'Live',
  seo_title TEXT,
  seo_description TEXT,
  focus_keyword TEXT,
  canonical_url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pg_services_category ON public.services (category, published);
CREATE INDEX IF NOT EXISTS idx_pg_services_slug ON public.services (slug);

-- 3. Bilingual Blog CMS (EN/HI)
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_hi TEXT DEFAULT '',
  excerpt TEXT NOT NULL,
  excerpt_hi TEXT DEFAULT '',
  content TEXT NOT NULL,
  content_hi TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Citizen Guides',
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'published',
  featured BOOLEAN DEFAULT FALSE,
  author_name TEXT NOT NULL DEFAULT 'Suraj Singh',
  author_role TEXT DEFAULT 'Editorial & Compliance Desk',
  related_service_slug TEXT,
  seo_title TEXT,
  seo_description TEXT,
  focus_keyword TEXT,
  canonical_url TEXT,
  featured_image_url TEXT,
  faq_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reading_time_minutes INTEGER NOT NULL DEFAULT 4,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pg_blog_status ON public.blog_posts (status, published_at DESC);

-- 4. Platform Settings & RBAC Matrix
CREATE TABLE IF NOT EXISTS public.business_settings (
  id TEXT PRIMARY KEY,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Applications & PII-Isolated Tracking Records
CREATE TABLE IF NOT EXISTS public.applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  collected_by_uid TEXT,
  partner_id TEXT,
  filing_mode TEXT DEFAULT 'self',
  assigned_operator_id TEXT,
  assigned_operator_name TEXT,
  source_channel TEXT DEFAULT 'web_b2c',
  user_name TEXT NOT NULL,
  user_email TEXT DEFAULT '',
  user_mobile TEXT DEFAULT '',
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  form_version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'Submitted',
  total_amount NUMERIC(12,2) DEFAULT 0,
  payment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  documents_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_remarks TEXT,
  internal_notes TEXT,
  completion_file_name TEXT,
  completion_file_url TEXT,
  submission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pg_applications_user ON public.applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_applications_status ON public.applications (status);

CREATE TABLE IF NOT EXISTS public.tracking_records (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  service_name TEXT NOT NULL,
  applicant_masked_name TEXT NOT NULL,
  contact_mobile_digits TEXT DEFAULT '',
  contact_email_lower TEXT DEFAULT '',
  source_channel TEXT DEFAULT 'web_b2c',
  status TEXT NOT NULL,
  total_amount NUMERIC(12,2) DEFAULT 0,
  status_history_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_remarks TEXT,
  completion_file_name TEXT,
  submission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Operator KYC, Partners, Commissions & Settlements
CREATE TABLE IF NOT EXISTS public.operator_enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  center_name TEXT DEFAULT '',
  operating_state TEXT DEFAULT '',
  operating_district TEXT DEFAULT '',
  kyc_status TEXT NOT NULL DEFAULT 'KYC Submitted',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.partners (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  partner_code TEXT UNIQUE NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'Pending Approval',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  partner_uid TEXT,
  application_id TEXT NOT NULL,
  service_name TEXT DEFAULT '',
  entry_type TEXT NOT NULL DEFAULT 'EARNED',
  net_paise BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.settlement_requests (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  partner_uid TEXT,
  requested_paise BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Requested',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 7. Workspace, Karta Files, API Sathi, Audit Logs & Backups
CREATE TABLE IF NOT EXISTS public.infra_bindings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  binding_key TEXT NOT NULL,
  binding_type TEXT NOT NULL,
  source_repo TEXT NOT NULL,
  legacy_namespace TEXT NOT NULL,
  migration_status TEXT NOT NULL,
  conflict_policy TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.karta_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  bucket_slot TEXT NOT NULL,
  d1_shard TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  integrity_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'encrypted',
  version INTEGER NOT NULL DEFAULT 1,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tools_configs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  legacy_d1_binding TEXT NOT NULL,
  legacy_r2_binding TEXT NOT NULL,
  config_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_audits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_service TEXT NOT NULL,
  details TEXT DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.api_sathi_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  call_id TEXT,
  idempotency_key TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  is_sandbox_test BOOLEAN DEFAULT TRUE,
  http_status INTEGER,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  outcome TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  masked_request_json TEXT,
  masked_response_json TEXT,
  latency_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_path TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.backups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL,
  encrypted_snapshot TEXT NOT NULL,
  iv TEXT NOT NULL,
  salt TEXT NOT NULL,
  checksum TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'verified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Row-Level Security (RLS): Default-Deny for anon on PII/admin tables; service_role bypasses RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karta_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_sathi_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Public read-only access ONLY for published catalogue services & published blog guides
DROP POLICY IF EXISTS "public_read_published_services" ON public.services;
CREATE POLICY "public_read_published_services"
  ON public.services FOR SELECT
  TO anon
  USING (published = TRUE);

DROP POLICY IF EXISTS "public_read_published_blog_posts" ON public.blog_posts;
CREATE POLICY "public_read_published_blog_posts"
  ON public.blog_posts FOR SELECT
  TO anon
  USING (status = 'published');
