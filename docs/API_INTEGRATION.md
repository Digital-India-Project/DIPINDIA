# DIPINDIA — API & External Integration Architecture

## 1. Unified Envelope Format (`worker/middleware/security.ts`)
API responses follow a structured correlation envelope (`buildApiResponse`):
```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "...",
  "request_id": "req_...",
  "reference_id": "req_...",
  "provider_reference": "DIP_...",
  "data": {},
  "error_code": null,
  "timestamp": "2026-11-27T..."
}
```
Correlation IDs propagate via `X-Request-Id` in both Cloudflare Worker (`securityHeadersMiddleware`) and Node/Express (`expressSecurityHeadersMiddleware`).

## 2. Primary API Surface Groups
| Prefix / Group | Handler Location | Key Responsibilities |
| --- | --- | --- |
| `/api/health`, `/api/integrations/status` | `worker/index.ts`, `worker/routes/portalAndJunctionRoutes.ts`, `server.ts` | Health & sanitized gateway readiness (booleans only; zero secret values) |
| `/api/v1/catalogue`, `/api/v1/services`, `/api/v1/coupons/validate`, `/api/v1/quotes` | `worker/routes/v1.ts`, `server.ts` | Published service catalog, authoritative pricing, promo validation & quote inquiries |
| `/api/v1/applications/*`, `/api/v1/forms/validate` | `worker/routes/unifiedRoutes.ts`, `worker/routes/v1.ts` | Application intake, schema validation, transitions, operator assignment, completion deliverables, public tracking |
| `/api/v1/payments/*`, `/api/payments/*`, `/api/webhooks/cashfree` | `worker/routes/v1.ts`, `worker/routes/unifiedRoutes.ts`, `server.ts` | Cashfree order creation, verification, status sync, webhook verification & reconciliation |
| `/api/v1/products/:slug/purchase`, `/api/v1/products/:slug/download` | `worker/routes/v1.ts`, `worker/index.ts`, `server.ts` | Verified digital product checkout & gated R2/generated downloads |
| `/api/v1/storage/*`, `/api/storage/*` | `worker/routes/storageRoutes.ts` | R2 upload, magic-byte validation, signed private downloads & audit logs |
| `/api/v1/apisathi/*` | `worker/routes/apiSathiRoutes.ts`, `server.ts` | Verification catalogue, live/sandbox execution, DigiLocker step-1/2, expenditure analytics, retry queue |
| `/api/v1/verifications/*`, `/api/v1/digilocker/*`, `/api/v1/apisetu/*` | `worker/routes/v1.ts`, `server.ts` | B2B single/bulk KYC verification endpoints & consent tracking |
| `/api/karta/*` | `worker/routes/kartaRoutes.ts`, `server/karta/kartaRouter.ts` | Legal template search, preview rendering, DOCX/PDF export, AI legal help & e-stamp provider quotes |
| `/api/ai/providers`, `/api/ai/assistant`, `/api/v1/ai/process` | `worker/lib/aiProviders.ts`, `server.ts` | Server-side multi-provider AI proxy (Gemini, OpenRouter, Groq, OpenAI, Anthropic) |
| `/api/admin/*`, `/api/postgres/*`, `/api/admin/postgres/*` | `worker/routes/adminRoutes.ts`, `server.ts` | Payment console, refunds, webhooks, blog CMS, D1/R2 infrastructure, backups & JustPostgreSQL management |
| `/__/auth/*`, `/__/firebase/*` | `server.ts`, `worker/index.ts` | Reverse proxy enabling Firebase Authentication `authDomain` on `digitalindiaproject.com` |

## 3. API Sathi Integration Design (`src/services/apiSathi.ts`, `worker/services/apiSathiService.ts`)
- **Strict Server-Side Key Custody**: `API_SATHI_KEY` is read exclusively server-side (`process.env.API_SATHI_KEY` / `c.env.API_SATHI_KEY`). Client components call DIPINDIA backend routes and never import `src/services/apiSathi.ts` directly (verified by automated test in `tests/platform.test.ts`).
- **Resilience & Idempotency**: Enforces `>= 20s` upstream timeouts, sends `Idempotency-Key` headers, skips retries on `402` (`INSUFFICIENT_BALANCE`) or `422` input errors, honours `Retry-After` on `429`, and enqueues transient `429`/`5xx` failures onto `apiSathiQueue.ts` with exponential backoff.
- **PII Masking & Ownership**: Deep-masks PAN, Aadhaar, mobile numbers, and secret fields before audit persistence; DigiLocker step-2 fetch enforces `user_id` ownership parity against step-1 `api_sathi_digilocker_sessions`.
