import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPLETE_CATALOGUE_ITEMS } from '../data/catalogue';
import { DEFAULT_ROLE_PERMISSIONS } from './rbac';
import { resolveSupabaseClient } from '../services/supabaseClient';
import { auth } from '../services/firebase';
import type { Application, BusinessSettings, Service, User } from '../types';

export const CORE_COLLECTION_NAMES = [
  'users',
  'services',
  'applications',
  'business_settings',
] as const;

export type CoreCollectionName = (typeof CORE_COLLECTION_NAMES)[number];

export interface PostgresColumnDefinition {
  name: string;
  pgType: string;
  nullable: boolean;
  defaultSql?: string;
  primaryKey?: boolean;
  unique?: boolean;
  description: string;
}

export interface PostgresCollectionSchema {
  table: CoreCollectionName | 'admins' | 'schema_migrations';
  entityName: 'User' | 'Service' | 'Application' | 'BusinessSettings' | 'AdminGrant' | 'SchemaMigration';
  description: string;
  primaryKey: string;
  rlsEnabled: boolean;
  anonPolicy: 'default_deny' | 'read_published_only';
  indexes: string[];
  columns: PostgresColumnDefinition[];
}

export const JUSTPOSTGRES_CORE_SCHEMA: Record<
  CoreCollectionName | 'admins' | 'schema_migrations',
  PostgresCollectionSchema
> = {
  users: {
    table: 'users',
    entityName: 'User',
    description: 'User identities, RBAC roles, partner/business bindings, KYC status, and UI preferences.',
    primaryKey: 'id',
    rlsEnabled: true,
    anonPolicy: 'default_deny',
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_pg_users_email ON public.users (LOWER(email));',
      'CREATE INDEX IF NOT EXISTS idx_pg_users_role ON public.users (role);',
    ],
    columns: [
      { name: 'id', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Document / UID primary key' },
      { name: 'uid', pgType: 'TEXT', nullable: false, unique: true, description: 'Firebase / Auth UID' },
      { name: 'display_name', pgType: 'TEXT', nullable: false, defaultSql: "'Citizen User'", description: 'Full display name' },
      { name: 'email', pgType: 'TEXT', nullable: false, description: 'Primary email address' },
      { name: 'mobile', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Contact mobile number' },
      { name: 'role', pgType: 'TEXT', nullable: false, defaultSql: "'customer'", description: 'RBAC UserRole' },
      { name: 'account_type', pgType: 'TEXT', nullable: false, defaultSql: "'customer'", description: 'Portal account type' },
      { name: 'permissions_json', pgType: 'JSONB', nullable: false, defaultSql: "'[]'::jsonb", description: 'Explicit PermissionCode overrides' },
      { name: 'company_name', pgType: 'TEXT', nullable: true, description: 'Business / organization name' },
      { name: 'business_id', pgType: 'TEXT', nullable: true, description: 'Linked B2B tenant ID' },
      { name: 'partner_id', pgType: 'TEXT', nullable: true, description: 'Linked partner ID' },
      { name: 'referral_code', pgType: 'TEXT', nullable: true, description: 'Assigned partner referral code' },
      { name: 'referred_by_code', pgType: 'TEXT', nullable: true, description: 'Upstream referral code used at signup' },
      { name: 'kyc_status', pgType: 'TEXT', nullable: false, defaultSql: "'Not Submitted'", description: 'Operator KYC review status' },
      { name: 'operator_enrollment_id', pgType: 'TEXT', nullable: true, description: 'Linked operator enrollment ID' },
      { name: 'manager_scope', pgType: 'TEXT', nullable: true, description: 'Regional or functional manager scope' },
      { name: 'is_active', pgType: 'BOOLEAN', nullable: false, defaultSql: 'TRUE', description: 'Account active toggle' },
      { name: 'avatar_url', pgType: 'TEXT', nullable: true, description: 'Profile photo URL' },
      { name: 'preferred_lang', pgType: 'TEXT', nullable: true, defaultSql: "'en'", description: 'UI language preference' },
      { name: 'theme', pgType: 'TEXT', nullable: true, defaultSql: "'light'", description: 'light or dark theme preference' },
      { name: 'haptics_enabled', pgType: 'BOOLEAN', nullable: true, defaultSql: 'TRUE', description: 'Mobile tactile feedback setting' },
      { name: 'two_factor_enabled', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: '2FA active flag' },
      { name: 'biometric_enabled', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Passkey biometric flag' },
      { name: 'created_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Creation timestamp' },
      { name: 'updated_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Last update timestamp' },
    ],
  },
  services: {
    table: 'services',
    entityName: 'Service',
    description: 'Bilingual services catalogue, digital products, compliance packages, fees, SLA, SEO & dynamic form definitions.',
    primaryKey: 'id',
    rlsEnabled: true,
    anonPolicy: 'read_published_only',
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_pg_services_category ON public.services (category, published);',
      'CREATE INDEX IF NOT EXISTS idx_pg_services_slug ON public.services (slug);',
      'CREATE INDEX IF NOT EXISTS idx_pg_services_published_popular ON public.services (published, popular DESC, featured DESC);',
    ],
    columns: [
      { name: 'id', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Service ID' },
      { name: 'slug', pgType: 'TEXT', nullable: false, unique: true, description: 'URL-friendly unique slug' },
      { name: 'name', pgType: 'TEXT', nullable: false, description: 'Service title (English)' },
      { name: 'name_hi', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Service title (Hindi)' },
      { name: 'category', pgType: 'TEXT', nullable: false, description: 'Category slug' },
      { name: 'subcategory', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Subcategory label' },
      { name: 'product_type', pgType: 'TEXT', nullable: false, defaultSql: "'service'", description: 'service | digital_product | api_product | compliance_package' },
      { name: 'short_desc', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Short summary (EN)' },
      { name: 'short_desc_hi', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Short summary (HI)' },
      { name: 'full_desc', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Detailed description (EN)' },
      { name: 'full_desc_hi', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Detailed description (HI)' },
      { name: 'icon_name', pgType: 'TEXT', nullable: true, defaultSql: "'FileText'", description: 'Lucide icon name' },
      { name: 'cover_image_url', pgType: 'TEXT', nullable: true, description: 'Optional cover image URL' },
      { name: 'service_charge', pgType: 'NUMERIC(12,2)', nullable: false, defaultSql: '0', description: 'Professional fee in INR' },
      { name: 'govt_fees', pgType: 'NUMERIC(12,2)', nullable: false, defaultSql: '0', description: 'Statutory/govt fee estimate in INR' },
      { name: 'third_party_fees', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'Pass-through 3rd party fee estimate' },
      { name: 'additional_charge', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'Optional extra charge' },
      { name: 'urgent_fee', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'Priority processing fee' },
      { name: 'discount_inr', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'Catalogue discount INR' },
      { name: 'tax_rate_bps', pgType: 'INTEGER', nullable: true, defaultSql: '1800', description: 'GST rate in basis points' },
      { name: 'tax_inclusive', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Whether fee includes GST' },
      { name: 'partner_price_inr', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'B2B/partner net price' },
      { name: 'billing_unit', pgType: 'TEXT', nullable: true, defaultSql: "'application'", description: 'Billing unit' },
      { name: 'pricing_type', pgType: 'TEXT', nullable: true, defaultSql: "'fixed'", description: 'fixed | starting | custom | free | commission' },
      { name: 'delivery_type', pgType: 'TEXT', nullable: true, defaultSql: "'assisted'", description: 'online | assisted | digital_download | hybrid | api' },
      { name: 'estimated_time', pgType: 'TEXT', nullable: true, defaultSql: "'3 - 5 Working Days'", description: 'ETA display string' },
      { name: 'sla_hours', pgType: 'INTEGER', nullable: true, defaultSql: '72', description: 'SLA hours target' },
      { name: 'form_version', pgType: 'INTEGER', nullable: true, defaultSql: '1', description: 'Dynamic form schema version' },
      { name: 'published', pgType: 'BOOLEAN', nullable: false, defaultSql: 'TRUE', description: 'Public visibility flag' },
      { name: 'popular', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Popular highlight flag' },
      { name: 'featured', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Featured highlight flag' },
      { name: 'is_custom_quote', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Requires custom quote' },
      { name: 'b2b_supported', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Enabled for B2B tenants' },
      { name: 'integration_type', pgType: 'TEXT', nullable: true, defaultSql: "'manual_assistance'", description: 'api_setu | digilocker | other_api | manual_assistance | external_portal' },
      { name: 'availability', pgType: 'TEXT', nullable: true, defaultSql: "'Live'", description: 'Live | Coming Soon | Manual | Unavailable' },
      { name: 'govt_fee_note', pgType: 'TEXT', nullable: true, description: 'Statutory fee explanation note' },
      { name: 'commission_note', pgType: 'TEXT', nullable: true, description: 'Partner commission note' },
      { name: 'api_setu_ref', pgType: 'TEXT', nullable: true, description: 'API Setu endpoint reference' },
      { name: 'customer_consent_required', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Explicit customer consent flag' },
      { name: 'seo_title', pgType: 'TEXT', nullable: true, description: 'SEO meta title' },
      { name: 'seo_description', pgType: 'TEXT', nullable: true, description: 'SEO meta description' },
      { name: 'focus_keyword', pgType: 'TEXT', nullable: true, description: 'Primary SEO keyword' },
      { name: 'canonical_url', pgType: 'TEXT', nullable: true, description: 'Canonical page URL' },
      { name: 'metadata_json', pgType: 'JSONB', nullable: false, defaultSql: "'{}'::jsonb", description: 'Eligibility, requiredDocs, processSteps, faqs, formFields & digitalAsset JSON' },
      { name: 'created_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Creation timestamp' },
      { name: 'updated_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Last update timestamp' },
    ],
  },
  applications: {
    table: 'applications',
    entityName: 'Application',
    description: 'Citizen, assisted-operator, partner, and B2B service filing records with documents, payment state, and workflow history.',
    primaryKey: 'id',
    rlsEnabled: true,
    anonPolicy: 'default_deny',
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_pg_applications_user ON public.applications (user_id, created_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_pg_applications_status ON public.applications (status);',
      'CREATE INDEX IF NOT EXISTS idx_pg_applications_service ON public.applications (service_id, created_at DESC);',
      'CREATE INDEX IF NOT EXISTS idx_pg_applications_partner ON public.applications (partner_id) WHERE partner_id IS NOT NULL;',
      'CREATE INDEX IF NOT EXISTS idx_pg_applications_operator ON public.applications (assigned_operator_id) WHERE assigned_operator_id IS NOT NULL;',
    ],
    columns: [
      { name: 'id', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Application tracking ID (e.g., DIP-2026-...)' },
      { name: 'user_id', pgType: 'TEXT', nullable: false, description: 'Owner applicant UID' },
      { name: 'collected_by_uid', pgType: 'TEXT', nullable: true, description: 'Operator/Partner collector UID' },
      { name: 'partner_id', pgType: 'TEXT', nullable: true, description: 'Partner ID for assisted filings' },
      { name: 'partner_name', pgType: 'TEXT', nullable: true, description: 'Partner business name snapshot' },
      { name: 'referral_code_used', pgType: 'TEXT', nullable: true, description: 'Referral code attributed to filing' },
      { name: 'assisted_consent_recorded', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Customer consent capture flag' },
      { name: 'business_id', pgType: 'TEXT', nullable: true, description: 'B2B tenant business ID' },
      { name: 'filing_mode', pgType: 'TEXT', nullable: true, defaultSql: "'self'", description: 'self | assisted' },
      { name: 'assigned_operator_id', pgType: 'TEXT', nullable: true, description: 'Assigned operator UID' },
      { name: 'assigned_operator_name', pgType: 'TEXT', nullable: true, description: 'Assigned operator name' },
      { name: 'assigned_manager_id', pgType: 'TEXT', nullable: true, description: 'Escalation manager UID' },
      { name: 'source_channel', pgType: 'TEXT', nullable: true, defaultSql: "'web_b2c'", description: 'Intake source channel' },
      { name: 'user_name', pgType: 'TEXT', nullable: false, description: 'Applicant full name' },
      { name: 'user_email', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Applicant email' },
      { name: 'user_mobile', pgType: 'TEXT', nullable: true, defaultSql: "''", description: 'Applicant mobile' },
      { name: 'service_id', pgType: 'TEXT', nullable: false, description: 'Target Service ID' },
      { name: 'service_name', pgType: 'TEXT', nullable: false, description: 'Service name snapshot' },
      { name: 'service_slug', pgType: 'TEXT', nullable: false, description: 'Service slug snapshot' },
      { name: 'service_version', pgType: 'INTEGER', nullable: true, defaultSql: '1', description: 'Service version snapshot' },
      { name: 'form_version', pgType: 'INTEGER', nullable: true, defaultSql: '1', description: 'Form schema version snapshot' },
      { name: 'status', pgType: 'TEXT', nullable: false, defaultSql: "'Submitted'", description: 'Workflow ApplicationStatus' },
      { name: 'total_amount', pgType: 'NUMERIC(12,2)', nullable: true, defaultSql: '0', description: 'Total payable INR' },
      { name: 'payment_json', pgType: 'JSONB', nullable: false, defaultSql: "'{}'::jsonb", description: 'Cashfree order/payment breakdown JSON' },
      { name: 'form_data_json', pgType: 'JSONB', nullable: false, defaultSql: "'{}'::jsonb", description: 'Dynamic form submission payload' },
      { name: 'documents_json', pgType: 'JSONB', nullable: false, defaultSql: "'[]'::jsonb", description: 'Uploaded/DigiLocker documents array' },
      { name: 'status_history_json', pgType: 'JSONB', nullable: false, defaultSql: "'[]'::jsonb", description: 'Immutable workflow status history entries' },
      { name: 'customer_remarks', pgType: 'TEXT', nullable: true, description: 'Customer-visible remarks' },
      { name: 'internal_notes', pgType: 'TEXT', nullable: true, description: 'Internal operator/admin notes' },
      { name: 'completion_file_name', pgType: 'TEXT', nullable: true, description: 'Deliverable file name' },
      { name: 'completion_file_url', pgType: 'TEXT', nullable: true, description: 'Deliverable download URL' },
      { name: 'api_correlation_id', pgType: 'TEXT', nullable: true, description: 'API Setu correlation reference' },
      { name: 'consent_id', pgType: 'TEXT', nullable: true, description: 'Recorded consent ID' },
      { name: 'urgent_processing', pgType: 'BOOLEAN', nullable: true, defaultSql: 'FALSE', description: 'Urgent processing toggle' },
      { name: 'included_service_ids_json', pgType: 'JSONB', nullable: false, defaultSql: "'[]'::jsonb", description: 'Package child service IDs' },
      { name: 'sla_target_at', pgType: 'TIMESTAMPTZ', nullable: true, description: 'Target SLA completion timestamp' },
      { name: 'submission_date', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Submission timestamp' },
      { name: 'created_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Record creation timestamp' },
      { name: 'updated_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Record update timestamp' },
    ],
  },
  business_settings: {
    table: 'business_settings',
    entityName: 'BusinessSettings',
    description: 'Corporate GSTIN/UDYAM/DUNS configuration (default) and global RBAC permission matrix (rbac_matrix).',
    primaryKey: 'id',
    rlsEnabled: true,
    anonPolicy: 'default_deny',
    indexes: [],
    columns: [
      { name: 'id', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Settings document key (default | rbac_matrix)' },
      { name: 'payload_json', pgType: 'JSONB', nullable: false, defaultSql: "'{}'::jsonb", description: 'Full BusinessSettings or RBAC matrix payload' },
      { name: 'updated_by', pgType: 'TEXT', nullable: true, description: 'Admin email or UID who last updated settings' },
      { name: 'updated_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Last update timestamp' },
    ],
  },
  admins: {
    table: 'admins',
    entityName: 'AdminGrant',
    description: 'Explicit RBAC administrator UID grant registry.',
    primaryKey: 'id',
    rlsEnabled: true,
    anonPolicy: 'default_deny',
    indexes: [],
    columns: [
      { name: 'id', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Admin UID key' },
      { name: 'uid', pgType: 'TEXT', nullable: false, unique: true, description: 'Granted Firebase/Auth UID' },
      { name: 'granted_by', pgType: 'TEXT', nullable: false, description: 'Granting Super Admin UID' },
      { name: 'created_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Grant creation timestamp' },
    ],
  },
  schema_migrations: {
    table: 'schema_migrations',
    entityName: 'SchemaMigration',
    description: 'Version registry tracking applied JustPostgreSQL schema and seed migrations.',
    primaryKey: 'version',
    rlsEnabled: true,
    anonPolicy: 'default_deny',
    indexes: [],
    columns: [
      { name: 'version', pgType: 'TEXT', nullable: false, primaryKey: true, description: 'Migration version identifier' },
      { name: 'description', pgType: 'TEXT', nullable: false, description: 'Human-readable migration summary' },
      { name: 'applied_at', pgType: 'TIMESTAMPTZ', nullable: false, defaultSql: 'NOW()', description: 'Timestamp migration was applied' },
    ],
  },
};

export function toPostgresUserRow(u: Partial<User> & { uid?: string; displayName?: string; preferredLang?: string; theme?: string }) {
  const nowIso = new Date().toISOString();
  const id = String(u.id || u.uid || '').trim();
  return {
    id,
    uid: String(u.uid || id),
    display_name: String(u.name || u.displayName || 'Citizen User'),
    email: String(u.email || ''),
    mobile: String(u.mobile || ''),
    role: String(u.role || 'customer'),
    account_type: String(u.accountType || 'customer'),
    permissions_json: Array.isArray(u.permissions) ? u.permissions : [],
    company_name: u.companyName || null,
    business_id: u.businessId || null,
    partner_id: u.partnerId || null,
    referral_code: u.referralCode || null,
    referred_by_code: u.referredByCode || null,
    kyc_status: String(u.kycStatus || 'Not Submitted'),
    operator_enrollment_id: u.operatorEnrollmentId || null,
    manager_scope: u.managerScope || null,
    is_active: u.isActive !== false,
    avatar_url: u.avatarUrl || null,
    preferred_lang: u.preferredLang || 'en',
    theme: u.theme || 'light',
    created_at: u.createdAt || nowIso,
    updated_at: nowIso,
  };
}

export function toPostgresServiceRow(s: Service) {
  return {
    id: String(s.id || s.slug),
    slug: String(s.slug || s.id),
    name: String(s.name || 'Service'),
    name_hi: String(s.nameHi || ''),
    category: String(s.category || 'Citizen Services'),
    subcategory: String(s.subcategory || ''),
    product_type: String(s.productType || 'service'),
    short_desc: String(s.shortDesc || ''),
    short_desc_hi: String(s.shortDescHi || ''),
    full_desc: String(s.fullDesc || ''),
    full_desc_hi: String(s.fullDescHi || ''),
    icon_name: String(s.iconName || 'FileText'),
    cover_image_url: s.coverImageUrl ? String(s.coverImageUrl) : null,
    service_charge: Number(s.serviceCharge || 0),
    govt_fees: Number(s.govtFees || 0),
    third_party_fees: Number(s.thirdPartyFees || 0),
    additional_charge: Number(s.additionalCharge || 0),
    urgent_fee: Number(s.urgentFee || 0),
    discount_inr: Number(s.discountInr || 0),
    tax_rate_bps: Number(s.taxRateBps ?? 1800),
    tax_inclusive: Boolean(s.taxInclusive),
    partner_price_inr: Number(s.partnerPriceInr || 0),
    billing_unit: String(s.billingUnit || 'application'),
    pricing_type: String(s.pricingType || 'fixed'),
    delivery_type: String(s.deliveryType || 'assisted'),
    estimated_time: String(s.estimatedTime || '3 - 5 Working Days'),
    sla_hours: Number(s.slaHours || 72),
    form_version: Number(s.formVersion || 1),
    published: s.published !== false,
    popular: Boolean(s.popular),
    featured: Boolean(s.featured),
    is_custom_quote: Boolean(s.isCustomQuote),
    b2b_supported: Boolean(s.b2bSupported),
    integration_type: String(s.integrationType || 'manual_assistance'),
    availability: String(s.availability || 'Live'),
    govt_fee_note: s.govtFeeNote ? String(s.govtFeeNote) : null,
    commission_note: s.commissionNote ? String(s.commissionNote) : null,
    api_setu_ref: s.apiSetuRef ? String(s.apiSetuRef) : null,
    customer_consent_required: Boolean(s.customerConsentRequired),
    seo_title: s.seoTitle ? String(s.seoTitle) : null,
    seo_description: s.seoDescription ? String(s.seoDescription) : null,
    focus_keyword: s.focusKeyword ? String(s.focusKeyword) : null,
    canonical_url: s.canonicalUrl ? String(s.canonicalUrl) : null,
    metadata_json: {
      eligibility: s.eligibility || [],
      requiredDocs: s.requiredDocs || [],
      processSteps: s.processSteps || [],
      faqs: s.faqs || [],
      formFields: s.formFields || [],
      digitalAsset: s.digitalAsset || null,
      includedServiceIds: s.includedServiceIds || [],
      exclusions: s.exclusions || [],
      supportedFilingModes: s.supportedFilingModes || ['self', 'assisted'],
      autoAssignRule: s.autoAssignRule || 'round_robin',
      serviceDisclaimer: s.serviceDisclaimer || null,
      regulatedNotice: s.regulatedNotice || null,
      instructions: s.instructions || null,
      conditions: s.conditions || [],
      packageSavingsInr: s.packageSavingsInr ?? 0,
      providerApprovalStatus: s.providerApprovalStatus || null,
    },
    updated_at: new Date().toISOString(),
  };
}

export function toPostgresApplicationRow(app: Application) {
  const nowIso = new Date().toISOString();
  return {
    id: String(app.id),
    user_id: String(app.userId),
    collected_by_uid: app.collectedByUid || null,
    partner_id: app.partnerId || null,
    partner_name: app.partnerName || null,
    referral_code_used: app.referralCodeUsed || null,
    assisted_consent_recorded: Boolean(app.assistedConsentRecorded),
    business_id: app.businessId || null,
    filing_mode: String(app.filingMode || 'self'),
    assigned_operator_id: app.assignedOperatorId || null,
    assigned_operator_name: app.assignedOperatorName || null,
    assigned_manager_id: app.assignedManagerId || null,
    source_channel: String(app.sourceChannel || 'web_b2c'),
    user_name: String(app.userName || 'Applicant'),
    user_email: String(app.userEmail || ''),
    user_mobile: String(app.userMobile || ''),
    service_id: String(app.serviceId || ''),
    service_name: String(app.serviceName || ''),
    service_slug: String(app.serviceSlug || ''),
    service_version: Number(app.serviceVersion || 1),
    form_version: Number(app.formVersion || 1),
    status: String(app.status || 'Submitted'),
    total_amount: Number(app.payment?.totalAmount ?? 0),
    payment_json: app.payment || {},
    form_data_json: app.formData || {},
    documents_json: Array.isArray(app.documents) ? app.documents : [],
    status_history_json: Array.isArray(app.statusHistory) ? app.statusHistory : [],
    customer_remarks: app.customerRemarks || null,
    internal_notes: app.internalNotes || null,
    completion_file_name: app.completionFileName || null,
    completion_file_url: app.completionFileUrl || null,
    api_correlation_id: app.apiCorrelationId || null,
    consent_id: app.consentId || null,
    urgent_processing: Boolean(app.urgentProcessing),
    included_service_ids_json: Array.isArray(app.includedServiceIds) ? app.includedServiceIds : [],
    sla_target_at: app.slaTargetAt || null,
    submission_date: app.submissionDate || nowIso,
    updated_at: app.updatedAt || nowIso,
  };
}

export function toPostgresBusinessSettingsRow(
  settings: BusinessSettings,
  updatedBy = 'allindiadigitalseva@gmail.com'
) {
  const nowIso = new Date().toISOString();
  return {
    id: String(settings.id || 'default'),
    payload_json: {
      ...settings,
      id: String(settings.id || 'default'),
      updatedAt: settings.updatedAt || nowIso,
      updatedBy: settings.updatedBy || updatedBy,
    },
    updated_by: String(settings.updatedBy || updatedBy),
    updated_at: nowIso,
  };
}

export function buildCoreSchemaDdlSql(): string {
  const statements: string[] = [
    '-- Digital India Project (DIP-Desk) — Core JustPostgreSQL Schema DDL',
    '-- Collections: users, services, applications, business_settings (+ admins, schema_migrations)',
  ];

  for (const def of Object.values(JUSTPOSTGRES_CORE_SCHEMA)) {
    const colLines = def.columns.map((col) => {
      const parts = [col.name, col.pgType];
      if (col.primaryKey) parts.push('PRIMARY KEY');
      if (col.unique) parts.push('UNIQUE');
      if (!col.nullable && !col.primaryKey) parts.push('NOT NULL');
      if (col.defaultSql) parts.push(`DEFAULT ${col.defaultSql}`);
      return `  ${parts.join(' ')}`;
    });

    statements.push(
      `CREATE TABLE IF NOT EXISTS public.${def.table} (\n${colLines.join(',\n')}\n);`
    );
    for (const idx of def.indexes) {
      statements.push(idx);
    }
    if (def.rlsEnabled) {
      statements.push(`ALTER TABLE public.${def.table} ENABLE ROW LEVEL SECURITY;`);
    }
    if (def.table === 'services') {
      statements.push(
        `DROP POLICY IF EXISTS "public_read_published_services" ON public.services;\nCREATE POLICY "public_read_published_services" ON public.services FOR SELECT TO anon USING (published = TRUE);`
      );
    }
  }

  return statements.join('\n\n');
}

export function buildInitialJustPostgresDocuments(params?: {
  actorUid?: string;
  actorEmail?: string;
}) {
  const actorUid = String(params?.actorUid || 'bootstrap-super-admin').trim() || 'bootstrap-super-admin';
  const actorEmail =
    String(params?.actorEmail || 'allindiadigitalseva@gmail.com').trim().toLowerCase() ||
    'allindiadigitalseva@gmail.com';
  const nowIso = new Date().toISOString();

  const defaultSettings: BusinessSettings = {
    id: 'default',
    legalName: 'Digital India Project',
    tradeName: 'Digital India Project',
    gstin: '26EXIPK0151F1ZQ',
    pan: '',
    udyamNumber: 'UDYAM-DD-03-0009994',
    dunsNumber: '308198649',
    invoicePrefix: 'DIP/2026-27/',
    registeredAddress:
      'Sunflower Building, Nano City, Samarvani, Silvassa, Dadra and Nagar Haveli and Daman and Diu – 396230',
    supportEmail: 'support@digitalindiaproject.com',
    supportPhone: '+91 77779 41227',
    defaultTaxRateBps: 0,
    blogPublisherName: 'Suraj Singh',
    allowUserBlogPublishing: true,
    userBlogRequiresReview: false,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };

  return {
    users: [
      toPostgresUserRow({
        id: actorUid,
        uid: actorUid,
        name: 'Super Admin',
        email: actorEmail,
        mobile: '+91 77779 41227',
        role: 'super_admin',
        accountType: 'admin',
        permissions: DEFAULT_ROLE_PERMISSIONS.super_admin,
        kycStatus: 'Approved',
        isActive: true,
        createdAt: nowIso,
      }),
    ],
    admins: [
      {
        id: actorUid,
        uid: actorUid,
        granted_by: actorUid,
      },
    ],
    services: COMPLETE_CATALOGUE_ITEMS.map((item) => toPostgresServiceRow(item)),
    applications: [] as ReturnType<typeof toPostgresApplicationRow>[],
    business_settings: [
      toPostgresBusinessSettingsRow(defaultSettings, actorEmail),
      {
        id: 'rbac_matrix',
        payload_json: { matrix: DEFAULT_ROLE_PERMISSIONS },
        updated_by: actorEmail,
        updated_at: nowIso,
      },
    ],
  };
}

export interface CoreCollectionInitReport {
  table: CoreCollectionName;
  exists: boolean;
  rowCount: number;
  seededCount: number;
  note: string;
}

export interface InitializeJustPostgresResult {
  ok: boolean;
  configured: boolean;
  initialized: boolean;
  message: string;
  collections: Record<CoreCollectionName, CoreCollectionInitReport>;
}

/**
 * Inspects and initializes the core JustPostgreSQL collections (users, services,
 * applications, business_settings). Uses the browser-safe `supabase` client for
 * non-PII schema/count probing and delegates privileged DDL/seeding safely to
 * the authenticated Express server route (`/api/admin/postgres/ensure-migrated`)
 * when an admin session is active.
 */
export async function initializeJustPostgresDatabase(options?: {
  client?: SupabaseClient | null;
  triggerServerSeed?: boolean;
}): Promise<InitializeJustPostgresResult> {
  const emptyCollections: Record<CoreCollectionName, CoreCollectionInitReport> = {
    users: { table: 'users', exists: false, rowCount: 0, seededCount: 0, note: 'Not checked' },
    services: { table: 'services', exists: false, rowCount: 0, seededCount: 0, note: 'Not checked' },
    applications: { table: 'applications', exists: false, rowCount: 0, seededCount: 0, note: 'Not checked' },
    business_settings: {
      table: 'business_settings',
      exists: false,
      rowCount: 0,
      seededCount: 0,
      note: 'Not checked',
    },
  };

  const resolved = options?.client
    ? { client: options.client, config: { configured: true } }
    : await resolveSupabaseClient();

  if (!resolved.client) {
    return {
      ok: false,
      configured: false,
      initialized: false,
      message:
        'JustPostgreSQL client is not configured (set JUSTPOSTGRES_REST_URL and JUSTPOSTGRES_ANON_KEY).',
      collections: emptyCollections,
    };
  }

  // Probe public services catalog directly via Supabase/PostgREST client
  let anonServicesCount = 0;
  let servicesAccessible = false;
  try {
    const { count, error } = await resolved.client
      .from('services')
      .select('id', { count: 'exact', head: true });
    if (!error) {
      servicesAccessible = true;
      anonServicesCount = typeof count === 'number' ? count : 0;
    }
  } catch {
    servicesAccessible = false;
  }

  // When an authenticated admin session is present (or requested), trigger server-side
  // idempotent migration + seeding using server-side service_role / DATABASE_URL.
  if (options?.triggerServerSeed && typeof window !== 'undefined' && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/postgres/ensure-migrated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ coreOnly: false }),
      });
      const json = await res.json().catch(() => null);
      const data = json?.data ?? null;
      if (res.ok && data?.collections) {
        return {
          ok: true,
          configured: true,
          initialized: Boolean(data.initialized),
          message: json?.message || 'JustPostgreSQL core collections verified and initialized.',
          collections: data.collections,
        };
      }
      return {
        ok: false,
        configured: true,
        initialized: false,
        message: json?.message || 'Unable to run server-side JustPostgreSQL initialization.',
        collections: {
          ...emptyCollections,
          services: {
            table: 'services',
            exists: servicesAccessible,
            rowCount: anonServicesCount,
            seededCount: 0,
            note: json?.message || 'Server initialization pending',
          },
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        configured: true,
        initialized: false,
        message: err?.message || 'Failed to invoke server-side JustPostgreSQL initialization.',
        collections: emptyCollections,
      };
    }
  }

  return {
    ok: servicesAccessible,
    configured: true,
    initialized: servicesAccessible && anonServicesCount > 0,
    message: servicesAccessible
      ? `JustPostgreSQL REST endpoint reachable (${anonServicesCount} published service records).`
      : 'JustPostgreSQL REST endpoint unreachable or tables not created yet.',
    collections: {
      ...emptyCollections,
      services: {
        table: 'services',
        exists: servicesAccessible,
        rowCount: anonServicesCount,
        seededCount: 0,
        note: servicesAccessible ? 'Published catalog accessible' : 'Table missing or REST API disabled',
      },
    },
  };
}
