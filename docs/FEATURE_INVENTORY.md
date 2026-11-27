# DIPINDIA — Verified Feature Inventory

Every capability listed below was verified directly in source files (`src/`, `worker/`, `server.ts`, `server/`, `migrations/`, `tests/`).

## 1. Portals & Role-Based Dashboards (`src/lib/rbac.ts`, `src/pages/*`)
| Feature | Key Modules | Verified Capabilities |
| --- | --- | --- |
| **Customer / Citizen Portal** | `src/pages/dashboard/CustomerDashboard.tsx`, `src/components/dashboard/*` | Application tracking, progress timelines, payment summary & trend charts, receipt downloads, document vault reuse, compliance reminders |
| **Business (B2B) Console** | `src/pages/b2b/*`, `worker/routes/v1.ts` | API playground, bulk CSV/batch verifications (`bulk_jobs`, `b2b_verification_items`), API key management, credit/billing audit |
| **Partner Desk & Onboarding** | `src/pages/partner/*`, `worker/routes/portalAndJunctionRoutes.ts` | Partner KYC & approval workflow, referral codes, customer linkage, assisted filings, commission rules/ledger (`calculatePartnerCommission`), TDS & settlement requests |
| **Operator Desk & Enrollment** | `src/pages/operator/*` | Assisted walk-in application intake, operator KYC verification (including Aadhaar DigiLocker step-1/2), verification & processing queues |
| **Operations Manager Portal** | `src/pages/manager/*` | SLA overdue monitoring (`computeSlaHoursRemaining`), team operator assignment/reassignment, partner oversight, operational reports |
| **Super Admin & Admin Console** | `src/pages/admin/AdminDashboard.tsx`, `src/components/admin/*`, `worker/routes/adminRoutes.ts` | Catalog & dynamic form CMS, SEO & directory manager, Cashfree payment/webhook/refund console, API Sathi usage/retry queue analytics, bilingual Blog CMS with revisions, Infrastructure D1/R2 inspector, JustPostgreSQL DB console, RBAC permission matrix, immutable backup & audit logs |

## 2. Service Catalog, Packages, Digital Products & Dynamic Forms
- **Catalog & Categories (`src/data/catalogue/*`, `src/lib/catalogueServer.ts`)**: Services, compliance packages (`evaluatePackageOverlap` duplicate-billing deduction), and instant digital downloads (`digitalGenerators.ts`), plus idempotent JSON/CSV catalog importer (`catalogueImporter.ts`).
- **Dynamic JSON Form Builder & Shared Engine (`src/lib/formEngine.ts`, `ApplicationWizard.tsx`)**: Versioned JSON schemas supporting conditional `showIf` visibility (`equals`, `not_equals`, `contains`, `in`, `is_truthy`), `heading`/`info`, `email`, `tel`, `address`, `repeater`, `checkbox`/`consent`, and regex format validation run identically on client and server (`POST /api/v1/forms/validate`).
- **Multi-Stage Workflow Engine (`src/lib/workflow.ts`)**: Enforces `ALLOWED_TRANSITIONS` across `Draft` -> `Submitted` -> `Payment Pending` -> `Payment Confirmed` -> `Under Review` -> `Assigned` -> `Document Verification` -> `Documents Required` / `Correction Required` / `Resubmitted` -> `Processing` -> `Awaiting External Authority` -> `Completed` / `Rejected` / `Cancelled` / `Refund Initiated` / `Refunded`, with mandatory customer-facing remarks and KYC progress calculations.

## 3. Payment Processing & Financial Ledger
- **Cashfree Payment Gateway (`worker/services/cashfreeService.ts`, `worker/routes/v1.ts`, `server.ts`)**:
  - Integer-paise fee engine (`src/lib/finance.ts`) keeping statutory govt fees GST-exempt while computing taxable professional fees, coupons, and TDS.
  - Server-authoritative order creation (`POST /api/v1/payments/orders`, `POST /api/payments/create-order`) preventing client price tampering.
  - Dual-secret HMAC-SHA256 webhook signature verification (`verifyCashfreeWebhookWithAnySecret`), anti-replay timestamp validation (`validateWebhookTimestamp`), idempotent webhook processing, manual/cron reconciliation sweeps (`worker/services/paymentReconciliation.ts`), Cashfree refunds API, and sandbox diagnostics (`SandboxWebhookTestModal.tsx`).

## 4. Document Management, Karta Workbench & Utility Tray
- **Document Vault & R2 Registry (`worker/services/fileService.ts`, `worker/routes/storageRoutes.ts`)**: Magic-byte + extension validation, logical 10-bucket routing (`dip-documents` .. `dip-export-reports`), HMAC-signed private download links, document versioning (`document_versions`), reusable vault items (`customer_vault_items`), and `document_access_logs`.
- **Karta Files Legal Workbench (`server/karta/*`, `worker/routes/kartaRoutes.ts`, `data/karta-source/*`)**: Curated Indian agreement/affidavit/notice templates with variable detection, preview rendering, DOCX/PDF binary generation, e-stamp quote/verification hooks, and optional Gemini legal assistant.
- **Digital Tools Tray (`src/components/tools/*`, `server.ts` `/api/v1/ai/process`)**: Document summarization, Q&A, translation, grammar/letter/resume helpers, PDF/image utilities, and pay-per-use / plan gating (`toolPlans.ts`).

## 5. Integrations, SEO & Communications
- **API Sathi & DigiLocker (`src/services/apiSathi.ts`, `worker/services/apiSathiService.ts`, `worker/routes/apiSathiRoutes.ts`)**: 13+ verification endpoints (PAN, GSTIN, Aadhaar DigiLocker init/fetch with step-1 `user_id` ownership check, Bank/IFSC, etc.), live/sandbox key mode detection, deep PII masking (`PAN`, `Aadhaar`, mobile, API keys), expenditure analytics (`apiSathiAnalytics.ts`), and exponential-backoff retry queue (`apiSathiQueue.ts`).
- **Multi-Provider AI Gateway (`worker/lib/aiProviders.ts`, `server.ts`)**: Server-side proxy routing across Gemini, OpenRouter, Groq, OpenAI, and Anthropic with compact knowledge-base fallback.
- **India Programmatic Directory & SEO (`migrations/0007_*`, `worker/lib/directorySsr.ts`, `src/lib/blogSeo.ts`)**: Bilingual blog posts, programmatic state/district/city SSR pages with thin-content quality scoring, and dynamic XML sitemap + `robots.txt` endpoints.
