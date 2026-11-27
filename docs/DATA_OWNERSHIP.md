# DIPINDIA — Data Ownership Matrix

Because DIPINDIA spans Cloud Firestore, Cloudflare D1, Cloudflare R2, Express in-memory development stores, and optional JustPostgreSQL, clear data ownership is critical to prevent split-brain bugs and prepare clean extraction into `dip-core` and `dip-infrastructure`.

## 1. Authoritative Source-of-Truth Table

| Domain / Entity | Current Interactive UI Authority | Current Backend / Financial Authority | Mirror / Cache Layer(s) | Target Ecosystem Owner (Future) |
| --- | --- | --- | --- | --- |
| **User Identity & Credentials** | Firebase Authentication | Firebase Auth JWKS + D1 `users` / `user_roles` | Firestore `users/{uid}`, `public.users` | **DIPINDIA / `dip-security`** |
| **RBAC Role Matrix & Permissions** | `src/lib/rbac.ts` | D1 `roles` / `role_permissions` (`worker/middleware/auth.ts`) | Firestore `users.role` | **`dip-security`** |
| **Service Catalog, Packages, Digital Products** | Firestore `services` + `src/data/catalogue/` | D1 `services` + `src/lib/catalogueServer.ts` (for checkout pricing) | `localCatalogueItems` (dev Express), `public.services` | **`dip-core`** |
| **Dynamic Form Schemas** | Firestore `services.formSchema` | D1 `service_forms` / `form_fields` + `src/lib/formEngine.ts` | Client draft `localStorage` | **`dip-core`** |
| **Applications & Workflow State** | Firestore `applications` (SPA reactive views) | D1 `applications` + `workflow_transitions` (unified API) | `public_tracking`, `public.applications` | **DIPINDIA -> `dip-core`** |
| **Public Tracking Records** | Firestore `public_tracking` | D1 masked `applications` lookup (`/api/v1/applications/track`) | `public.tracking_records` | **DIPINDIA / `dip-core`** |
| **Cashfree Orders, Payments, Webhooks & Refunds** | Payment components read API responses | **D1 `payment_orders`, `payments`, `payment_webhook_events`, `refunds`** (strictly backend authoritative) | `localCashfreeOrderStore` (local Node dev only) | **DIPINDIA Billing -> `dip-core` / `dip-automation`** |
| **Uploaded Documents & Issued Deliverables** | UI upload/download via `/api/v1/storage/*` | **Cloudflare R2 + D1 `file_registry`, `application_documents`, `document_versions`** | Firestore attachment metadata refs | **DIPINDIA Storage -> `dip-infrastructure`** |
| **Partner Commissions & Settlements** | Partner Desk UI | D1 `partners`, `commission_rules`, `commission_ledger`, `settlement_requests` | Firestore `commission_ledger`, `public.*` | **`dip-core`** |
| **API Sathi Calls, Retries & DigiLocker Sessions** | Workspace / Admin Dashboards | **D1 `api_sathi_calls`, `api_sathi_digilocker_sessions`** + Firestore `api_sathi_verifications` | Express in-memory arrays (dev only) | **`dip-api` / `dip-automation`** |
| **Bilingual Blog & India Directory SEO** | Admin CMS + Public Blog/Directory | D1 `blog_posts`, `india_locations`, `directory_translations` | `INITIAL_BLOG_POSTS`, `INDIA_GEOGRAPHY_SEED`, `public.blog_posts` | **DIPINDIA Content** |
| **Security & Infrastructure Audit Logs** | Admin Audit / Infra Tabs | D1 `audit_logs`, `audit_events`, `document_access_logs`, `infra_resource_events` | Firestore `audit_logs`, `public.audit_logs` | **`dip-security` / `dip-status`** |

## 2. Key Conflict & Sync Boundaries
1. **Checkout Pricing**: Client-submitted totals are NEVER authoritative; `resolveAuthoritativeCheckout()` (`src/lib/catalogueServer.ts`) recomputes totals from catalog pricing + coupons on the server.
2. **Payment State**: Client callbacks never mark an order `PAID` in production. Only Cashfree PG verification (`GET /pg/orders/:id`) or HMAC-verified webhooks transition `payment_orders` and `payments`.
3. **JustPostgreSQL Sync (`server/postgres/justPostgresSync.ts`)**: Strictly **one-way admin-triggered or startup-migration mirror** (`seedCanonicalDataToJustPostgres`, `importBackupJsonToJustPostgres`)—never allowed to overwrite D1 financial tables automatically.
4. **Offline Queue (`src/lib/offlineQueue.ts`)**: Client-side mutation buffer for intermittent connectivity; must never queue privileged admin RBAC mutations or payment confirmations.
