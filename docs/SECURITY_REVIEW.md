# DIPINDIA — Security Review

## 1. Authentication & Authorization Controls
- **Worker JWKS Verification (`worker/middleware/auth.ts`)**: Validates Firebase ID Tokens using RS256 and live Google JWKS (`securetoken@system.gserviceaccount.com`), strictly checking `alg === 'RS256'`, `kid`, `aud === 'digitalindiaproject-portal'`, `iss`, `exp`, `iat`, `auth_time`, and `sub`. Rejects unsigned/`alg=none`/HS256 tokens.
- **Express Admin & Manager Guards (`server.ts`)**: Verifies Firebase ID tokens with the same `verifyFirebaseIdToken()` helper, requiring `email_verified && bootstrapEmail` or verified admin/manager role claims (and Postgres role lookup for manager routes).
- **RBAC Enforcement (`src/lib/rbac.ts`, `worker/middleware/auth.ts`)**: `requirePermission()` enforces 22 granular permission codes across 7 normalized roles; `canAccessApplication()` enforces per-role tenant/assignment isolation (`customer`, `business`, `partner`, `operator`, `manager`, `admin`/`super_admin`).
- **Firestore Security Rules (`firestore.rules`)**: Passes `npx eslint firestore.rules` with zero warnings/errors. Restricts anonymous access on user/application/audit collections and limits public tracking reads to masked `public_tracking` records.

## 2. Hardening Implemented During Modernization
1. **Express Security Headers & Rate Limiting (`server/middleware/expressSecurity.ts`)**: Closed parity gap with Cloudflare Workers by enforcing `X-Request-Id`, `X-Content-Type-Options: nosniff`, `X-Frame-Options` (respecting `/__/auth/iframe`), `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` on `/api/*`, and sliding-window rate limiting on `/api/*` (exempting `/api/health` and Cashfree webhooks).
2. **Production Checkout & Sandbox Flag Protection (`server.ts`, `worker/index.ts`)**:
   - Hardened Express `POST /api/v1/products/:slug/purchase` to require authentication and live Cashfree checkout in production rather than unconditionally marking simulated purchases `PAID`.
   - Guarded `simulateSandboxSuccess` verification flags with `!cfConfig.isProductionRuntime` in both `server.ts` and `worker/index.ts`.
3. **Open Redirect & Unsafe URI Scheme Prevention (`src/lib/urlSafety.ts`)**:
   - Validated Cashfree `returnUrl` and DigiLocker `redirectionUrl` across `server.ts`, `worker/routes/v1.ts`, and `worker/routes/apiSathiRoutes.ts` (`validateSafeRedirectUrl`).
   - Validated `completionFileUrl` deliverables in `worker/routes/unifiedRoutes.ts` (`isSafeDeliverableUrl`) to block `javascript:`, `data:`, `vbscript:`, and protocol-relative URIs.
4. **Attachment Filename Sanitization (`src/lib/urlSafety.ts`)**:
   - Applied `sanitizeContentDispositionFilename()` across Express and Worker download endpoints (`adminRoutes.ts`, `storageRoutes.ts`, `v1.ts`, `worker/index.ts`, `server.ts`) to strip path traversal (`../`) and CRLF header injection characters.

## 3. Static Security Verification Results
- **Firestore Rules Linter**: `npx eslint firestore.rules` -> **0 errors, 0 warnings**.
- **Unsafe Sink Scan (`dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function(`, `child_process`, wildcard CORS)**: **0 matches** across `src/`, `server/`, `server.ts`, `worker/`.
- **Secret Scan**: Only env-var lookup key names (e.g., `'CF_SECRET_KEY'`, `process.env.GEMINI_API_KEY`) matched; zero live API keys or private certificates found in tracked files.

## 4. Residual Risks & Action Items
1. **`VITE_CASHFREE_*` Lookup Aliases (`worker/services/cashfreeService.ts`)**: Lines 107–108 and 125–126 include legacy `VITE_CASHFREE_*` alias keys in server fallback lists. Operators must NEVER set Cashfree secret keys with `VITE_` prefix in `.env` or Vite builds because Vite bundles `VITE_*` variables into client JS.
2. **Bootstrap Admin Email Consistency**: `cyber.sundial@gmail.com` appears in `src/services/firebase.ts`, `server.ts`, `server/karta/kartaRouter.ts`, and `security_spec.md`, while `worker/middleware/auth.ts` checks only `allindiadigitalseva@gmail.com`. Align via explicit role assignment in D1/Firebase custom claims and remove hardcoded fallback emails long-term (`dip-security`).
3. **Express In-Memory Rate Limiter Scope**: Single-instance memory map (`EXPRESS_RATE_BUCKETS`) resets on process restart; multi-instance Node deployments should back rate limiting with shared Redis/Cloudflare edge rules (`dip-security`).
