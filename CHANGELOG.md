# Changelog

All notable stabilization, security hardening, test coverage, and documentation updates to **DIPINDIA** are recorded here.

## [Unreleased] — Technical Modernization & Ecosystem Preparation

### Added
- **Shared URL & Header Safety Module (`src/lib/urlSafety.ts`)**: Added `validateSafeRedirectUrl`, `isSafeDeliverableUrl`, and `sanitizeContentDispositionFilename` usable identically across browser, Node/Express, and Cloudflare Worker runtimes.
- **Express Security & Rate-Limiting Middleware (`server/middleware/expressSecurity.ts`)**: Brought Express local/Node runtime into security parity with the Cloudflare Worker runtime (`X-Request-Id`, `X-Content-Type-Options`, `X-Frame-Options` preserving `/__/auth/iframe`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: no-store` on `/api/*`, and bounded sliding-window rate limiting on `/api/*` exempting `/api/health` and Cashfree webhooks).
- **Automated Regression Suite (`tests/securityAndModernization.test.ts` + `npm test`)**: Added unit and contract tests covering URL redirect safety, `Content-Disposition` sanitization, Express security middleware, RBAC isolation, workflow state-machine transitions, integer-paise financial calculations, dynamic form validation, and Cashfree HMAC-SHA256 webhook signature & timestamp anti-replay checks.
- **Validation-Only CI Workflows (`.github/workflows/`)**: Added `ci.yml`, `tests.yml`, `security.yml`, and `dependency-review.yml` for pull requests and pushes without automatic production deployments.
- **Complete Technical Documentation Suite (`/docs/`, `README.md`, `CONTRIBUTING.md`, `walkthrough.md`)**: Documented audited runtime architecture, data ownership across Firestore/D1/R2/JustPostgreSQL, payment & document flows, security posture, testing, technical debt, backlog, and gradual integration with the 9 modular Digital India Project repositories.

### Security & Stability Improvements
- Hardened Express `server.ts` `/api/v1/products/:slug/purchase` to enforce authentication and Cashfree gateway checkout in production instead of unconditionally marking simulated orders `PAID`.
- Guarded `simulateSandboxSuccess` verification shortcuts in both `server.ts` and `worker/index.ts` so they cannot run when `isProductionRuntime` is active.
- Validated Cashfree `returnUrl` and DigiLocker `redirectionUrl` across `server.ts`, `worker/routes/v1.ts`, and `worker/routes/apiSathiRoutes.ts` to prevent untrusted external redirects or unsafe URI schemes.
- Validated application `completionFileUrl` deliverables in `worker/routes/unifiedRoutes.ts` against `javascript:` / `data:` / protocol-relative URLs.
- Sanitized `Content-Disposition` filenames across `server.ts`, `worker/index.ts`, `worker/routes/v1.ts`, `worker/routes/adminRoutes.ts`, and `worker/routes/storageRoutes.ts`.
- Normalized workspace package manager lockfile to `npm` (removed redundant `bun.lock`) and documented environment template variables in `.env.example`.
