# DIPINDIA — Feature Preservation Matrix

**Core Mandate:** *Preserve first. Improve second. Modularize third. Migrate gradually.*  
No existing citizen, partner, operator, manager, B2B, or administrator capability may be removed or silently broken while integrating DIPINDIA with the nine Digital India Project ecosystem repositories.

## 1. Non-Negotiable Functional Contracts

| Capability Area | Critical Files / Endpoints | Preservation Requirement | Regression Verification |
| --- | --- | --- | --- |
| **Firebase Auth & Reverse Proxy** | `src/services/firebase.ts`, `server.ts` (`/__/auth/*`), `worker/middleware/auth.ts` | Preserve custom `authDomain` proxy (`/__/auth/iframe`, `/__/auth/handler`) and strict RS256 JWKS verification. Never bypass `email_verified` checks on bootstrap admin lookup. | `expressSecurity.test`, Worker auth tests in `platform.test.ts` |
| **Role-Based Access & Portal Routing** | `src/lib/rbac.ts`, `src/lib/navigationController.ts` | Keep all 7 normalized roles (`super_admin`, `admin`, `manager`, `operator`, `partner`, `business`, `customer`) and deterministic `getHomeRouteForRole` / `canAccessApplication` rules intact. | `securityAndModernization.test.ts` |
| **Application Workflow & SLA Guardrails** | `src/lib/workflow.ts`, `worker/routes/unifiedRoutes.ts` | Maintain exact status progression graph, customer-vs-staff transition restrictions, mandatory remarks on rejections/corrections, and immutable terminal states (`Completed`, `Cancelled`). | `securityAndModernization.test.ts`, `platform.test.ts` |
| **Dynamic JSON Schema Forms** | `src/lib/formEngine.ts`, `ApplicationWizard.tsx`, `/api/v1/forms/validate` | Keep identical browser and server validation behavior, including `showIf` conditional exemptions, `repeater`, `address`, and custom regex handling. | `securityAndModernization.test.ts` |
| **Authoritative Paise Checkout & Cashfree Webhooks** | `src/lib/finance.ts`, `src/lib/catalogueServer.ts`, `worker/services/cashfreeService.ts`, `/api/v1/payments/*`, `/api/webhooks/cashfree` | Keep statutory govt fees tax-exempt (`0` GST), maintain server-side price recalculation, HMAC-SHA256 webhook verification, anti-replay timestamp enforcement, and idempotent payment reconciliation. | `platform.test.ts` (Suites 13–14), `securityAndModernization.test.ts` |
| **Protected Digital Product Downloads** | `/api/v1/products/:slug/purchase`, `/api/v1/products/:slug/download`, `/api/products/:slug/download` | Require verified payment or authorized admin before serving generated or R2-backed digital products; preserve sanitized `Content-Disposition` downloads. | `platform.test.ts`, `securityAndModernization.test.ts` |
| **API Sathi & DigiLocker 2-Step Ownership** | `src/services/apiSathi.ts`, `worker/routes/apiSathiRoutes.ts`, `server.ts` | Preserve server-only `API_SATHI_KEY` usage, `20s+` upstream timeout, deep PII masking before audit writes, exponential backoff retry queue, and `user_id` ownership verification on DigiLocker fetch. | `platform.test.ts` (Suites 16–19) |
| **Karta Legal Workbench** | `server/karta/*`, `worker/routes/kartaRoutes.ts`, `/api/karta/*` | Preserve curated legal template catalog, variable interpolation, DOCX/PDF export, and admin auth protection on provider configuration endpoints. | `compile_applet`, `lint_applet` |
| **Programmatic SEO & Dynamic Sitemaps** | `/sitemap.xml`, `/robots.txt`, `worker/lib/directorySsr.ts` | Preserve Sitemaps.org XML output, `Last-Modified` / `X-Sitemap-Generated-At` headers, draft/noindex exclusion, and `INDIA_GEOGRAPHY_SEED` directory routes. | `platform.test.ts` (Suite 15), live HTTP `/robots.txt` |

## 2. Backward-Compatibility Rules During Refactoring
1. **Alias Route Support**: Maintain legacy `/api/payments/*`, `/api/products/:slug/download`, and `/api/gemini/assistant` aliases alongside canonical `/api/v1/*` routes until all SPA clients and external webhooks confirm cutover.
2. **Firestore Schema Continuity**: Do not remove existing fields or tighten `firestore.rules` in ways that break active `DataContext.tsx` listeners without matching client updates.
3. **Graceful Unconfigured Degradation**: When optional third-party secrets (`GEMINI_API_KEY`, `API_SATHI_KEY`, `CASHFREE_CLIENT_SECRET`, `JUSTPOSTGRES_URL`) are absent in non-production dev environments, endpoints must degrade cleanly with clear diagnostic status codes (`503` or explicit sandbox indicators) rather than crashing startup.
