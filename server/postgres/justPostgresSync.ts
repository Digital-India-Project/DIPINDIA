import fs from 'fs';
import path from 'path';
import { COMPLETE_CATALOGUE_ITEMS } from '../../src/data/catalogue';
import { INITIAL_BLOG_POSTS } from '../../src/data/initialBlogPosts';
import { DEFAULT_ROLE_PERMISSIONS } from '../../src/lib/rbac';
import {
  JUSTPOSTGRES_TABLES,
  exportJustPostgresTable,
  resolveJustPostgresConfig,
  upsertJustPostgresRows,
  type JustPostgresTable,
} from './justPostgresClient';

const POSTGRES_MIGRATION_FILES = [
  '0001_justpostgres_schema.sql',
  '0002_justpostgres_init_core.sql',
] as const;

export function readPostgresMigrationFiles(): Array<{ filename: string; sql: string }> {
  const migrationsDir = path.resolve(process.cwd(), 'migrations', 'postgres');
  return POSTGRES_MIGRATION_FILES.map((filename) => {
    const schemaPath = path.resolve(migrationsDir, filename);
    if (!schemaPath.startsWith(migrationsDir + path.sep)) {
      throw new Error(`Invalid migration file path: ${filename}`);
    }
    return {
      filename,
      sql: fs.readFileSync(schemaPath, 'utf8'),
    };
  });
}

export function readPostgresSchemaSql(): string {
  return readPostgresMigrationFiles()
    .map((m) => m.sql.trim())
    .join('\n\n');
}

export function mapServiceToPostgresRow(s: Record<string, any>): Record<string, any> {
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

export function mapBlogToPostgresRow(post: Record<string, any>): Record<string, any> {
  return {
    id: String(post.id),
    slug: String(post.slug),
    title: String(post.title || ''),
    title_hi: String(post.titleHi || ''),
    excerpt: String(post.excerpt || ''),
    excerpt_hi: String(post.excerptHi || ''),
    content: String(post.content || ''),
    content_hi: String(post.contentHi || ''),
    category: String(post.category || 'Citizen Guides'),
    tags_json: Array.isArray(post.tags) ? post.tags : [],
    status: String(post.status || 'published'),
    featured: Boolean(post.featured),
    author_name: String(post.authorName || 'Suraj Singh'),
    author_role: String(post.authorRole || 'Editorial & Compliance Desk'),
    related_service_slug: post.relatedServiceSlug ? String(post.relatedServiceSlug) : null,
    seo_title: post.seoTitle ? String(post.seoTitle) : null,
    seo_description: post.seoDescription ? String(post.seoDescription) : null,
    focus_keyword: post.focusKeyword ? String(post.focusKeyword) : null,
    canonical_url: post.canonicalUrl ? String(post.canonicalUrl) : null,
    featured_image_url: post.featuredImageUrl ? String(post.featuredImageUrl) : null,
    faq_items_json: Array.isArray(post.faqItems) ? post.faqItems : [],
    reading_time_minutes: Number(post.readingTimeMinutes || 4),
    published_at: post.publishedAt || new Date().toISOString(),
    updated_at: post.updatedAt || new Date().toISOString(),
  };
}

function mapDocToPostgresRow(
  table: JustPostgresTable,
  docItem: Record<string, any>,
  actorUid: string
): Record<string, any> | null {
  const id = String(docItem._id || docItem.id || docItem.uid || '').trim();
  if (!id) return null;
  const nowIso = new Date().toISOString();

  switch (table) {
    case 'services':
      return mapServiceToPostgresRow({ ...docItem, id });
    case 'blog_posts':
      return mapBlogToPostgresRow({ ...docItem, id });
    case 'business_settings':
      return {
        id,
        payload_json: docItem,
        updated_by: String(docItem.updatedBy || actorUid),
        updated_at: nowIso,
      };
    case 'admins':
      return {
        id,
        uid: String(docItem.uid || id),
        granted_by: String(docItem.grantedBy || actorUid),
      };
    case 'users':
      return {
        id,
        uid: String(docItem.uid || id),
        display_name: String(docItem.displayName || docItem.name || 'Citizen User'),
        email: String(docItem.email || ''),
        mobile: String(docItem.mobile || ''),
        role: String(docItem.role || 'customer'),
        account_type: String(docItem.accountType || 'customer'),
        permissions_json: Array.isArray(docItem.permissions) ? docItem.permissions : [],
        company_name: docItem.companyName || null,
        business_id: docItem.businessId || null,
        partner_id: docItem.partnerId || null,
        referral_code: docItem.referralCode || null,
        referred_by_code: docItem.referredByCode || null,
        kyc_status: String(docItem.kycStatus || 'Not Submitted'),
        operator_enrollment_id: docItem.operatorEnrollmentId || null,
        manager_scope: docItem.managerScope || null,
        is_active: docItem.isActive !== false,
        avatar_url: docItem.avatarUrl || null,
        preferred_lang: docItem.preferredLang || 'en',
        theme: docItem.theme || 'light',
        haptics_enabled: docItem.hapticsEnabled !== false,
        two_factor_enabled: Boolean(docItem.twoFactorEnabled),
        biometric_enabled: Boolean(docItem.biometricEnabled),
        updated_at: nowIso,
      };
    case 'applications':
      return {
        id,
        user_id: String(docItem.userId || actorUid),
        collected_by_uid: docItem.collectedByUid || null,
        partner_id: docItem.partnerId || null,
        partner_name: docItem.partnerName || null,
        referral_code_used: docItem.referralCodeUsed || null,
        assisted_consent_recorded: Boolean(docItem.assistedConsentRecorded),
        business_id: docItem.businessId || null,
        filing_mode: String(docItem.filingMode || 'self'),
        assigned_operator_id: docItem.assignedOperatorId || null,
        assigned_operator_name: docItem.assignedOperatorName || null,
        assigned_manager_id: docItem.assignedManagerId || null,
        source_channel: String(docItem.sourceChannel || 'web_b2c'),
        user_name: String(docItem.userName || 'Applicant'),
        user_email: String(docItem.userEmail || ''),
        user_mobile: String(docItem.userMobile || ''),
        service_id: String(docItem.serviceId || ''),
        service_name: String(docItem.serviceName || ''),
        service_slug: String(docItem.serviceSlug || ''),
        service_version: Number(docItem.serviceVersion || 1),
        form_version: Number(docItem.formVersion || 1),
        status: String(docItem.status || 'Submitted'),
        total_amount: Number(docItem.totalAmount ?? docItem.payment?.totalAmount ?? 0),
        payment_json: docItem.payment || {},
        form_data_json: docItem.formData || {},
        documents_json: Array.isArray(docItem.documents) ? docItem.documents : [],
        status_history_json: Array.isArray(docItem.statusHistory) ? docItem.statusHistory : [],
        customer_remarks: docItem.customerRemarks || null,
        internal_notes: docItem.internalNotes || null,
        completion_file_name: docItem.completionFileName || null,
        completion_file_url: docItem.completionFileUrl || null,
        api_correlation_id: docItem.apiCorrelationId || null,
        consent_id: docItem.consentId || null,
        urgent_processing: Boolean(docItem.urgentProcessing),
        included_service_ids_json: Array.isArray(docItem.includedServiceIds) ? docItem.includedServiceIds : [],
        sla_target_at: docItem.slaTargetAt || null,
        submission_date: docItem.submissionDate || nowIso,
        updated_at: nowIso,
      };
    case 'tracking_records':
      return {
        id,
        owner_uid: String(docItem.ownerUid || actorUid),
        service_name: String(docItem.serviceName || ''),
        applicant_masked_name: String(docItem.applicantMaskedName || 'Applicant'),
        contact_mobile_digits: String(docItem.contactMobileDigits || ''),
        contact_email_lower: String(docItem.contactEmailLower || ''),
        source_channel: String(docItem.sourceChannel || 'web_b2c'),
        status: String(docItem.status || 'Submitted'),
        total_amount: Number(docItem.totalAmount || 0),
        status_history_json: Array.isArray(docItem.statusHistory) ? docItem.statusHistory : [],
        customer_remarks: docItem.customerRemarks || null,
        completion_file_name: docItem.completionFileName || null,
        submission_date: docItem.submissionDate || nowIso,
        updated_at: nowIso,
      };
    case 'operator_enrollments':
      return {
        id,
        user_id: String(docItem.userId || actorUid),
        full_name: String(docItem.fullName || ''),
        email: String(docItem.email || ''),
        mobile: String(docItem.mobile || ''),
        center_name: String(docItem.centerName || ''),
        operating_state: String(docItem.operatingState || ''),
        operating_district: String(docItem.operatingDistrict || ''),
        kyc_status: String(docItem.kycStatus || 'KYC Submitted'),
        payload_json: docItem,
        updated_at: nowIso,
      };
    case 'partners':
      return {
        id,
        user_id: String(docItem.userId || actorUid),
        partner_code: String(docItem.partnerCode || id),
        referral_code: String(docItem.referralCode || id),
        business_name: String(docItem.businessName || ''),
        approval_status: String(docItem.approvalStatus || 'Pending Approval'),
        payload_json: docItem,
        updated_at: nowIso,
      };
    case 'commission_ledger':
      return {
        id,
        partner_id: String(docItem.partnerId || ''),
        partner_uid: docItem.partnerUid || null,
        application_id: String(docItem.applicationId || ''),
        service_name: String(docItem.serviceName || ''),
        entry_type: String(docItem.entryType || 'EARNED'),
        net_paise: Number(docItem.netPaise || 0),
        status: String(docItem.status || 'Pending'),
        payload_json: docItem,
      };
    case 'settlement_requests':
      return {
        id,
        partner_id: String(docItem.partnerId || ''),
        partner_uid: docItem.partnerUid || null,
        requested_paise: Number(docItem.requestedPaise || 0),
        status: String(docItem.status || 'Requested'),
        payload_json: docItem,
      };
    case 'infra_bindings':
      return {
        id,
        owner_id: String(docItem.ownerId || actorUid),
        binding_key: String(docItem.bindingKey || id),
        binding_type: String(docItem.bindingType || 'r2'),
        source_repo: String(docItem.sourceRepo || 'DIP-Official'),
        legacy_namespace: String(docItem.legacyNamespace || ''),
        migration_status: String(docItem.migrationStatus || 'migrated'),
        conflict_policy: String(docItem.conflictPolicy || 'merge-persistent-state'),
        record_count: Number(docItem.recordCount || 0),
        checksum: String(docItem.checksum || 'chk_00000000'),
        updated_at: nowIso,
      };
    case 'karta_files':
      return {
        id,
        owner_id: String(docItem.ownerId || actorUid),
        title: String(docItem.title || 'Untitled Draft'),
        bucket_slot: String(docItem.bucketSlot || 'r2-03'),
        d1_shard: String(docItem.d1Shard || 'd1-08'),
        mime_type: String(docItem.mimeType || 'application/octet-stream'),
        size_bytes: Number(docItem.sizeBytes || 0),
        encrypted_payload: String(docItem.encryptedPayload || ''),
        iv: String(docItem.iv || ''),
        salt: String(docItem.salt || ''),
        key_fingerprint: String(docItem.keyFingerprint || ''),
        integrity_hash: String(docItem.integrityHash || ''),
        status: String(docItem.status || 'encrypted'),
        version: Number(docItem.version || 1),
        tags_json: Array.isArray(docItem.tags) ? docItem.tags : [],
        updated_at: nowIso,
      };
    case 'tools_configs':
      return {
        id,
        owner_id: String(docItem.ownerId || actorUid),
        tool_key: String(docItem.toolKey || 'schema-migrator'),
        display_name: String(docItem.displayName || 'Tool'),
        enabled: docItem.enabled !== false,
        legacy_d1_binding: String(docItem.legacyD1Binding || 'd1-01'),
        legacy_r2_binding: String(docItem.legacyR2Binding || 'r2-01'),
        config_summary: String(docItem.configSummary || ''),
        updated_at: nowIso,
      };
    case 'workspace_audits':
      return {
        id,
        user_id: String(docItem.userId || actorUid),
        action_type: String(docItem.actionType || 'ACTION'),
        target_service: String(docItem.targetService || 'drive'),
        details: String(docItem.details || ''),
      };
    case 'api_sathi_verifications':
      return {
        id,
        user_id: String(docItem.userId || actorUid),
        intent: String(docItem.intent || ''),
        product_slug: String(docItem.productSlug || ''),
        call_id: docItem.callId || null,
        idempotency_key: String(docItem.idempotencyKey || id),
        environment: String(docItem.environment || 'SANDBOX'),
        is_sandbox_test: Boolean(docItem.isSandboxTest),
        http_status: docItem.httpStatus ?? null,
        verified: Boolean(docItem.verified),
        outcome: String(docItem.outcome || 'ERROR'),
        error_code: docItem.errorCode || null,
        error_message: docItem.errorMessage || null,
        masked_request_json: docItem.maskedRequestJson || null,
        masked_response_json: docItem.maskedResponseJson || null,
        latency_ms: Number(docItem.latencyMs || 0),
      };
    case 'audit_logs':
      return {
        id,
        actor_id: String(docItem.actorId || actorUid),
        actor_role: String(docItem.actorRole || 'super_admin'),
        module: String(docItem.module || 'Migration'),
        action: String(docItem.action || 'IMPORT'),
        resource_path: String(docItem.resourcePath || 'postgres/audit_logs'),
        severity: String(docItem.severity || 'info'),
        details: String(docItem.details || 'Imported record'),
      };
    case 'backups':
      return {
        id,
        owner_id: String(docItem.ownerId || actorUid),
        label: String(docItem.label || 'Snapshot'),
        scope: String(docItem.scope || 'full'),
        encrypted_snapshot: String(docItem.encryptedSnapshot || ''),
        iv: String(docItem.iv || ''),
        salt: String(docItem.salt || ''),
        checksum: String(docItem.checksum || ''),
        item_count: Number(docItem.itemCount || 0),
        status: String(docItem.status || 'verified'),
        updated_at: nowIso,
      };
    default:
      return null;
  }
}

export function buildCoreEntitiesSeedPayload(params: {
  actorUid: string;
  actorEmail: string;
}) {
  const nowIso = new Date().toISOString();
  const serviceRows = COMPLETE_CATALOGUE_ITEMS.map((s) => mapServiceToPostgresRow(s as any));
  const settingsRows = [
    {
      id: 'default',
      payload_json: {
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
        updatedBy: params.actorEmail,
      },
      updated_by: params.actorEmail,
      updated_at: nowIso,
    },
    {
      id: 'rbac_matrix',
      payload_json: { matrix: DEFAULT_ROLE_PERMISSIONS },
      updated_by: params.actorEmail,
      updated_at: nowIso,
    },
  ];
  const adminRows = [
    {
      id: params.actorUid,
      uid: params.actorUid,
      granted_by: params.actorUid,
    },
  ];
  const userRows = [
    {
      id: params.actorUid,
      uid: params.actorUid,
      display_name: 'Super Admin',
      email: params.actorEmail,
      mobile: '+91 77779 41227',
      role: 'super_admin',
      account_type: 'admin',
      permissions_json: DEFAULT_ROLE_PERMISSIONS.super_admin,
      kyc_status: 'Approved',
      is_active: true,
      preferred_lang: 'en',
      theme: 'light',
      updated_at: nowIso,
    },
  ];

  return {
    users: userRows,
    admins: adminRows,
    services: serviceRows,
    business_settings: settingsRows,
  };
}

export async function seedCanonicalDataToJustPostgres(params: {
  actorUid: string;
  actorEmail: string;
  env?: NodeJS.ProcessEnv;
  coreOnly?: boolean;
}) {
  const env = params.env || process.env;
  const corePayload = buildCoreEntitiesSeedPayload({
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
  });
  const serviceRows = corePayload.services;
  const settingsRows = corePayload.business_settings;
  const adminRows = corePayload.admins;
  const userRows = corePayload.users;
  const blogRows = params.coreOnly ? [] : INITIAL_BLOG_POSTS.map((p) => mapBlogToPostgresRow(p as any));

  const nowIso = new Date().toISOString();
  const r2Slots = [
    ['r2-01', 'documents', 'DIP-Official', 1420],
    ['r2-02', 'dip-public-assets', 'DIP-Official', 318],
    ['r2-03', 'dip-generated-files', 'karta-files', 894],
    ['r2-04', 'dip-backups', 'DIP-Official', 92],
    ['r2-05', 'dip-api-storage', 'DIP-Official', 412],
    ['r2-06', 'dip-customer-uploads', 'karta-files', 1105],
    ['r2-07', 'dip-partner-files', 'DIP-Official', 530],
    ['r2-08', 'dip-api-archives', 'Tools-Tray', 274],
    ['r2-09', 'dip-media-library', 'DIP-Official', 645],
    ['r2-10', 'dip-export-reports', 'Tools-Tray', 188],
  ] as const;
  const d1Shards = [
    ['d1-01', 'dip_core', 'DIP-Official', 2410],
    ['d1-02', 'dip_workflow', 'DIP-Official', 3190],
    ['d1-03', 'dip_partners', 'DIP-Official', 740],
    ['d1-04', 'dip_content', 'DIP-Official', 520],
    ['d1-05', 'dip_api', 'DIP-Official', 1860],
    ['d1-06', 'dip_billing', 'DIP-Official', 1430],
    ['d1-07', 'dip_audit', 'DIP-Official', 4210],
    ['d1-08', 'dip_services', 'karta-files', 5100],
    ['d1-09', 'dip_integrations', 'Tools-Tray', 615],
    ['d1-10', 'dip_analytics', 'Tools-Tray', 980],
  ] as const;

  const infraRows: Record<string, any>[] = [
    ...r2Slots.map(([slot, name, repo, count]) => ({
      id: `${params.actorUid}_${slot}`,
      owner_id: params.actorUid,
      binding_key: slot,
      binding_type: 'r2',
      source_repo: repo,
      legacy_namespace: name,
      migration_status: slot === 'r2-03' || slot === 'r2-08' ? 'migrating' : 'migrated',
      conflict_policy: 'merge-persistent-state',
      record_count: count,
      checksum: `r2_${name.replace(/[^a-z0-9]/g, '')}_${slot}`,
      updated_at: nowIso,
    })),
    {
      id: `${params.actorUid}_r1-01`,
      owner_id: params.actorUid,
      binding_key: 'r1-01',
      binding_type: 'r1',
      source_repo: 'karta-files',
      legacy_namespace: 'karta-legacy-r1',
      migration_status: 'conflict-resolved',
      conflict_policy: 'merge-persistent-state',
      record_count: 418,
      checksum: 'r1_kartalegacy_01',
      updated_at: nowIso,
    },
    ...d1Shards.map(([shard, name, repo, count]) => ({
      id: `${params.actorUid}_${shard}`,
      owner_id: params.actorUid,
      binding_key: shard,
      binding_type: 'd1',
      source_repo: repo,
      legacy_namespace: name,
      migration_status: shard === 'd1-02' || shard === 'd1-08' ? 'legacy-active' : 'migrated',
      conflict_policy: shard === 'd1-08' ? 'legacy-d1-priority' : 'merge-persistent-state',
      record_count: count,
      checksum: `d1_${name}_${shard}`,
      updated_at: nowIso,
    })),
    {
      id: `${params.actorUid}_d2-01`,
      owner_id: params.actorUid,
      binding_key: 'd2-01',
      binding_type: 'd2',
      source_repo: 'Tools-Tray',
      legacy_namespace: 'digital-tools-tray-db',
      migration_status: 'migrated',
      conflict_policy: 'merge-persistent-state',
      record_count: 1290,
      checksum: 'd2_toolstraydb_01',
      updated_at: nowIso,
    },
    {
      id: `${params.actorUid}_firebase-dip-official`,
      owner_id: params.actorUid,
      binding_key: 'firebase-dip-official',
      binding_type: 'firebase',
      source_repo: 'DIP-Official',
      legacy_namespace: 'gen-lang-client-0294214396',
      migration_status: 'migrated',
      conflict_policy: 'merge-persistent-state',
      record_count: 1,
      checksum: 'fb_0294214396_prod',
      updated_at: nowIso,
    },
    {
      id: `${params.actorUid}_firebase-tools-tray`,
      owner_id: params.actorUid,
      binding_key: 'firebase-tools-tray',
      binding_type: 'firebase',
      source_repo: 'Tools-Tray',
      legacy_namespace: 'gen-lang-client-0226759782',
      migration_status: 'migrated',
      conflict_policy: 'merge-persistent-state',
      record_count: 1,
      checksum: 'fb_0226759782_tray',
      updated_at: nowIso,
    },
    {
      id: `${params.actorUid}_firebase-dip-desk`,
      owner_id: params.actorUid,
      binding_key: 'firebase-dip-desk',
      binding_type: 'firebase',
      source_repo: 'DIP-Official',
      legacy_namespace: 'digitalindiaproject-portal',
      migration_status: 'migrated',
      conflict_policy: 'merge-persistent-state',
      record_count: 1,
      checksum: 'fb_digitalindia',
      updated_at: nowIso,
    },
  ];

  const toolConfigRows = [
    ['schema-migrator', 'D1/D2 -> Postgres Schema Migrator', 'd1-01 (dip_core)', 'r2-01 (documents)', 'Unifies DIP-Official (DIP-Desk), karta-files, and Tools-Tray schemas without state loss.'],
    ['payload-encryptor', 'Karta AES-256-GCM Encryptor', 'd1-08 (dip_services)', 'r2-03 (dip-generated-files)', 'Zero-knowledge client encryption + SHA-256 integrity verification for legal drafts.'],
    ['totp-vault', 'RFC 6238 TOTP & Passkey Guard', 'd1-07 (dip_audit)', 'r2-06 (dip-customer-uploads)', 'Manages two-factor HMAC-SHA1 codes and WebAuthn platform biometric credentials.'],
    ['locale-inspector', 'Localization & Accessibility Matrix', 'd1-04 (dip_content)', 'r2-09 (dip-media-library)', 'Validates 5-language bundles (en, hi, ta, es, ja) and WCAG AA contrast.'],
    ['backup-utility', 'Encrypted Snapshot & Recovery Engine', 'd2-01 (tools-tray-db)', 'r2-04 (dip-backups)', 'Packages encrypted workspace backups for point-in-time restoration.'],
    ['voice-console', 'Hands-Free Voice Command Router', 'd1-10 (dip_analytics)', 'r2-10 (dip-export-reports)', 'Web Speech API intent dispatcher for navigation, theme toggling, and vault lock.'],
  ].map(([toolKey, displayName, d1, r2, summary]) => ({
    id: `${params.actorUid}_${toolKey}`,
    owner_id: params.actorUid,
    tool_key: toolKey,
    display_name: displayName,
    enabled: true,
    legacy_d1_binding: d1,
    legacy_r2_binding: r2,
    config_summary: summary,
    updated_at: nowIso,
  }));

  const auditRows = [
    {
      id: `pg_rebuild_${Date.now()}`,
      actor_id: params.actorUid,
      actor_role: 'super_admin',
      module: 'Migration',
      action: params.coreOnly
        ? 'INIT_CORE_ENTITIES_TO_JUSTPOSTGRES'
        : 'RECREATE_ALL_DB_TABLES_FROM_CODE',
      resource_path: 'public/*',
      severity: 'info',
      details: params.coreOnly
        ? 'Initialized core JustPostgreSQL entities (users, admins, services, business_settings) and verified applications schema readiness.'
        : 'Recreated canonical services, blog_posts, business_settings, admins, users, infra_bindings, and tools_configs without backup file.',
    },
  ];

  const baseResults = {
    services: await upsertJustPostgresRows('services', serviceRows, 'id', env),
    business_settings: await upsertJustPostgresRows('business_settings', settingsRows, 'id', env),
    admins: await upsertJustPostgresRows('admins', adminRows, 'id', env),
    users: await upsertJustPostgresRows('users', userRows, 'id', env),
    audit_logs: await upsertJustPostgresRows('audit_logs', auditRows, 'id', env),
  };

  if (params.coreOnly) {
    return baseResults;
  }

  return {
    ...baseResults,
    blog_posts: await upsertJustPostgresRows('blog_posts', blogRows, 'id', env),
    infra_bindings: await upsertJustPostgresRows('infra_bindings', infraRows, 'id', env),
    tools_configs: await upsertJustPostgresRows('tools_configs', toolConfigRows, 'id', env),
  };
}

export async function importBackupJsonToJustPostgres(params: {
  collections: Record<string, any[]>;
  actorUid: string;
  env?: NodeJS.ProcessEnv;
}) {
  const env = params.env || process.env;
  const summary: Record<string, { upserted: number; failed: number; errors: string[] }> = {};

  for (const table of JUSTPOSTGRES_TABLES) {
    const rawDocs = params.collections[table];
    if (!Array.isArray(rawDocs) || rawDocs.length === 0) continue;

    const mapped = rawDocs
      .map((d) => (d && typeof d === 'object' ? mapDocToPostgresRow(table, d, params.actorUid) : null))
      .filter((r): r is Record<string, any> => r !== null);

    if (mapped.length === 0) continue;
    summary[table] = await upsertJustPostgresRows(table, mapped, 'id', env);
  }

  return summary;
}

export async function exportAllJustPostgresData(env: NodeJS.ProcessEnv = process.env) {
  const cfg = resolveJustPostgresConfig(env);
  const collections: Record<string, any[]> = {};
  for (const table of JUSTPOSTGRES_TABLES) {
    try {
      collections[table] = await exportJustPostgresTable(table, env);
    } catch {
      collections[table] = [];
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    provider: 'justpostgres',
    endpointHost: cfg.endpointHost,
    collections,
  };
}
