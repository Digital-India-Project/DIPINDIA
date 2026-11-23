-- ============================================================================
-- DIGITAL INDIA PROJECT (DIP-DESK) — CORE ENTITIES SCHEMA & INITIALIZATION
-- Migration: migrations/postgres/0002_justpostgres_init_core.sql
-- Covers Core Entities: Users, Services, Applications, and BusinessSettings
-- Execute AFTER 0001_justpostgres_schema.sql (idempotent, safe to re-run).
-- ============================================================================

-- 1. Align public.users with TypeScript User entity
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Align public.services with TypeScript Service entity
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS govt_fee_note TEXT,
  ADD COLUMN IF NOT EXISTS commission_note TEXT,
  ADD COLUMN IF NOT EXISTS api_setu_ref TEXT,
  ADD COLUMN IF NOT EXISTS customer_consent_required BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pg_services_published_popular
  ON public.services (published, popular DESC, featured DESC);

-- 3. Align public.applications with full TypeScript Application workflow entity
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS partner_name TEXT,
  ADD COLUMN IF NOT EXISTS referral_code_used TEXT,
  ADD COLUMN IF NOT EXISTS assisted_consent_recorded BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS business_id TEXT,
  ADD COLUMN IF NOT EXISTS service_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sla_target_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_manager_id TEXT,
  ADD COLUMN IF NOT EXISTS api_correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS consent_id TEXT,
  ADD COLUMN IF NOT EXISTS urgent_processing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS included_service_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pg_applications_service
  ON public.applications (service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_applications_partner
  ON public.applications (partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pg_applications_operator
  ON public.applications (assigned_operator_id) WHERE assigned_operator_id IS NOT NULL;

-- 4. Seed initial BusinessSettings documents (Corporate Identity & RBAC Matrix)
INSERT INTO public.business_settings (id, payload_json, updated_by, updated_at)
VALUES
  (
    'default',
    '{
      "id": "default",
      "legalName": "Digital India Project",
      "tradeName": "Digital India Project",
      "gstin": "26EXIPK0151F1ZQ",
      "pan": "",
      "udyamNumber": "UDYAM-DD-03-0009994",
      "dunsNumber": "308198649",
      "invoicePrefix": "DIP/2026-27/",
      "registeredAddress": "Sunflower Building, Nano City, Samarvani, Silvassa, Dadra and Nagar Haveli and Daman and Diu – 396230",
      "supportEmail": "support@digitalindiaproject.com",
      "supportPhone": "+91 77779 41227",
      "defaultTaxRateBps": 0,
      "blogPublisherName": "Suraj Singh",
      "allowUserBlogPublishing": true,
      "userBlogRequiresReview": false
    }'::jsonb,
    'allindiadigitalseva@gmail.com',
    NOW()
  ),
  (
    'rbac_matrix',
    '{
      "matrix": {
        "customer": ["applications.view", "applications.create", "applications.request_correction", "payments.view"],
        "business": ["applications.view", "applications.create", "payments.view", "reports.view"],
        "partner": ["applications.view", "applications.create", "applications.request_correction", "payments.view", "reports.view"],
        "operator": ["applications.view", "applications.create", "applications.process", "applications.verify_documents", "applications.request_correction", "applications.complete", "payments.view"],
        "manager": ["applications.view", "applications.create", "applications.assign", "applications.process", "applications.verify_documents", "applications.request_correction", "applications.complete", "operators.assign", "partners.manage", "payments.view", "reports.view"],
        "admin": ["applications.view", "applications.create", "applications.assign", "applications.process", "applications.verify_documents", "applications.request_correction", "applications.complete", "applications.cancel", "services.create", "services.edit", "services.publish", "users.manage", "operators.assign", "partners.manage", "payments.view", "payments.refund", "commissions.manage", "reports.view", "settings.manage", "audit_logs.view", "rbac.manage", "integrations.manage"],
        "super_admin": ["applications.view", "applications.create", "applications.assign", "applications.process", "applications.verify_documents", "applications.request_correction", "applications.complete", "applications.cancel", "services.create", "services.edit", "services.publish", "users.manage", "operators.assign", "partners.manage", "payments.view", "payments.refund", "commissions.manage", "reports.view", "settings.manage", "audit_logs.view", "rbac.manage", "integrations.manage"]
      }
    }'::jsonb,
    'allindiadigitalseva@gmail.com',
    NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  payload_json = EXCLUDED.payload_json,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

-- 5. Bootstrap Super Admin user & RBAC grant document
INSERT INTO public.users (
  id,
  uid,
  display_name,
  email,
  mobile,
  role,
  account_type,
  kyc_status,
  is_active,
  preferred_lang,
  theme
)
VALUES (
  'bootstrap-super-admin',
  'bootstrap-super-admin',
  'Super Admin',
  'allindiadigitalseva@gmail.com',
  '+91 77779 41227',
  'super_admin',
  'admin',
  'Approved',
  TRUE,
  'en',
  'light'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = 'super_admin',
  account_type = 'admin',
  kyc_status = 'Approved',
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO public.admins (id, uid, granted_by)
VALUES ('bootstrap-super-admin', 'bootstrap-super-admin', 'bootstrap-super-admin')
ON CONFLICT (id) DO NOTHING;

-- 6. Schema Migration Version Registry
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.schema_migrations (version, description)
VALUES
  ('0001_justpostgres_schema', 'Initial tables and RLS for core and operational collections'),
  ('0002_justpostgres_init_core', 'Extended core columns, indexes, BusinessSettings, and bootstrap Super Admin')
ON CONFLICT (version) DO NOTHING;

-- 7. Reload PostgREST schema cache (safe no-op if channel has no listeners)
NOTIFY pgrst, 'reload schema';
