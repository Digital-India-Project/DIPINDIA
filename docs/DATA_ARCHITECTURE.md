# DIPINDIA — Data Architecture

DIPINDIA currently persists data across four storage layers: **Cloud Firestore**, **Cloudflare D1 (SQLite)**, **Cloudflare R2 (Object Storage)**, and optional **JustPostgreSQL (PostgreSQL)**.

---

## 1. Cloud Firestore (`firestore.rules`, `firebase-blueprint.json`)
Configured on project `digitalindiaproject-portal` (database `digitalindiaproject-database`). Core collections governed by strict security rules:
- **Identity & RBAC**: `users/{userId}`, `admins/{adminId}`, `operators/{uid}`, `operator_enrollments/{id}`, `partners/{partnerId}`
- **Catalog & Content**: `services/{serviceId}`, `service_categories/{id}`, `blog_posts/{postId}`, `business_settings/{id}`, `coupons/{id}`, `commission_rules/{id}`
- **Applications & Tracking**: `applications/{applicationId}`, `public_tracking/{trackingCode}` (masked non-PII status records), `support_tickets/{id}`
- **Finance & Audit**: `commission_ledger/{id}`, `settlement_requests/{id}`, `api_sathi_verifications/{id}`, `workspace_audits/{id}`, `karta_files/{id}`, `audit_logs/{id}`, `backups/{id}`

---

## 2. Cloudflare D1 Relational Schema (`migrations/0001` – `0009`)
`DatabaseRegistry` (`worker/config/database.ts`) partitions tables logically across 10 slots (`dip_core`, `dip_workflow`, `dip_billing`, `dip_partners`, `dip_documents`, `dip_content`, `dip_support`, `dip_api`, `dip_analytics`, `dip_audit`) with automatic fallback to `env.DB` on Cloudflare Free Plan.

| Migration | Core Tables Added / Extended | Domain Purpose |
| --- | --- | --- |
| `0001_initial_schema.sql` | `users`, `roles`, `permissions`, `user_roles`, `service_categories`, `services`, `service_forms`, `form_fields`, `applications`, `application_documents`, `application_status_history`, `payments`, `invoices`, `notifications`, `notification_templates`, `support_tickets`, `support_messages`, `admin_activity_logs`, `website_settings`, `faqs`, `knowledge_base`, `coupons`, `refunds`, `user_sessions`, `audit_events` | Core platform entities, RBAC, forms, applications, payments & audit baseline |
| `0002_apisetu_and_b2b_schema.sql` | `businesses`, `business_members`, `api_providers`, `api_catalogue`, `user_consents`, `verification_requests`, `bulk_jobs`, `api_request_logs` | B2B accounts, consent ledger & bulk/single verification APIs |
| `0003_enterprise_platform_2_0.sql` | `role_permissions`, `application_assignments`, `application_notes`, `workflow_transitions`, `document_requirements`, `document_reviews`, `document_access_logs`, `partners`, `referral_codes`, `partner_customers`, `commission_rules`, `commission_ledger`, `settlement_requests`, `settlements`, `payment_orders`, `payment_webhook_events`, `business_settings`, `system_settings`, `api_integrations`, `audit_logs`, `idempotency_keys`, `background_jobs`, `scheduled_jobs` | Enterprise RBAC matrix, SLA assignments, partner commissions, Cashfree orders/webhooks & background jobs |
| `0004_central_platform_and_blog.sql` | `schema_migrations`, `file_registry`, `blog_posts`, `blog_post_revisions`, `operator_enrollments`, `backup_records`, `infra_resource_events` | R2 file registry, bilingual blog CMS + revisions, operator KYC & DB backups |
| `0005_catalogue_packages_products.sql` | Extends `services` + `digital_product_orders`, `custom_quote_requests`, `catalogue_import_logs` | Compliance packages, paid digital downloads, custom quotes & catalog imports |
| `0006_security_unification_and_growth.sql` | `document_versions`, `customer_vault_items`, `compliance_reminders`, `b2b_verification_items` | Reusable citizen doc vault, doc versioning, renewal reminders & B2B row tracking |
| `0007_india_directory_programmatic_seo.sql` | `india_locations`, `directory_translations`, `seo_import_batches` | Hierarchical India state/district/city programmatic SEO pages |
| `0008_cashfree_payment_ecosystem.sql` | Alters `payment_orders`, `payments`, `payment_webhook_events`, `refunds` + adds 7 performance indexes | Full Cashfree PG lifecycle, UTR tracking, replay telemetry & partial/full refunds |
| `0009_api_sathi_integration.sql` | `api_sathi_calls`, `api_sathi_digilocker_sessions` | Masked API Sathi call telemetry, cost analytics & DigiLocker 2-step session ownership |

---

## 3. Cloudflare R2 Object Storage (`worker/config/storage.ts`)
Logical 10-bucket topology resolving onto `DOCUMENTS_BUCKET` / `BACKUP_BUCKET` when single-bucket mode is used:
`dip-documents`, `dip-generated-files`, `dip-exports` / `dip-export-reports`, `dip-avatars`, `dip-public-assets`, `dip-media-library`, `dip-kyc-vault`, `dip-backups`, `dip-api-storage`, `dip-temp-uploads`.

---

## 4. JustPostgreSQL Optional Relational Store (`migrations/postgres/`)
- `0001_justpostgres_schema.sql`: Mirrors 19 canonical tables (`public.users`, `admins`, `services`, `blog_posts`, `business_settings`, `applications`, `tracking_records`, `operator_enrollments`, `partners`, `commission_ledger`, `settlement_requests`, `infra_bindings`, `karta_files`, `tools_configs`, `workspace_audits`, `api_sathi_verifications`, `audit_logs`, `backups`, `schema_migrations`).
- `0002_justpostgres_init_core.sql`: Idempotent startup bootstrap migration tracked in `public.schema_migrations`.
- Accessed strictly server-side via `server/postgres/justPostgresClient.ts` with table allowlisting (`assertAllowedPostgresTable`), column identifier regex validation (`assertSafeColumnName`), and SSRF blocking (`validateRemoteRestUrl`).
