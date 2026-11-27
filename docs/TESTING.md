# DIPINDIA — Testing Strategy & Coverage

## 1. Test Stack & Execution
DIPINDIA runs automated tests using Node's native `node:test` runner and `node:assert/strict` executed through `tsx` (`npm test` -> `tsx --test tests/*.test.ts`), requiring zero heavy external test frameworks.

### Commands
```bash
npm test                      # Execute all test files under tests/*.test.ts
npm run lint                  # Strict TypeScript compilation check (tsc --noEmit)
npx eslint firestore.rules    # Firestore security rules validation
npm run build                 # Production Vite SPA bundle verification
```

## 2. Automated Test Inventory
### A. `tests/platform.test.ts` (86 tests across 19 suites)
Covers Worker (`Hono` `app.request()`) HTTP routes with mocked D1/R2/Cashfree/API Sathi adapters:
- **Suites 1–12**: Platform API v1 workflows, RBAC & JWT verification, D1/R2 registry resolution, storage signed downloads & magic-byte validation, CMS/blog/SEO routing, and B2B/partner portals.
- **Suites 13–14**: Cashfree payment ecosystem (authoritative checkout pricing, anti-replay timestamp enforcement, monotonic lifecycle state guard, refunds, admin cutover probe, and reconciliation).
- **Suite 15**: Dynamic Sitemap XML generation (`Last-Modified`, `X-Sitemap-Generated-At`, `canonicalUrl`, noindex exclusion).
- **Suites 16–19**: API Sathi integration (`>=20s` timeout, `Idempotency-Key` reuse, `Retry-After` on `429`, `402`/`422` non-retry, DigiLocker step-1 `user_id` ownership, server-only isolation, expenditure analytics, retry queue backoff, and 13 instant verification retail services).

### B. `tests/securityAndModernization.test.ts` (Modernization & Hardening Regression Suite)
- **URL Safety & Header Sanitization**: Redirect allowlist blocking `javascript:`, `data:`, `//` protocol-relative URLs, and phishing origins; deliverable URL validation; `Content-Disposition` CRLF & traversal stripping.
- **Express Security Middleware**: `X-Request-Id`, `nosniff`, `X-Frame-Options` (`/__/auth/iframe` exemption), API `no-store` caching, and `429` rate-limit threshold enforcement with webhook exemptions.
- **RBAC, Application Isolation & Workflow Transitions**: Role normalization, permission checks, per-role ownership isolation (`canAccessApplication`), blocked status jumps, and overdue SLA math.
- **Finance, Dynamic Forms & Cashfree Crypto**: Integer-paise GST separation, coupon/commission rules, conditional `showIf` schema validation, real HMAC-SHA256 signature verification, tamper rejection, and timestamp anti-replay checks.

## 3. Continuous Integration (`/.github/workflows/`)
Validation-only GitHub Actions workflows run automatically on PRs and pushes to `main` (never auto-deploying):
- `ci.yml`: `npm ci`, `npm run lint`, `npm run build`
- `tests.yml`: `npm ci`, `npm test`
- `security.yml`: `npx eslint firestore.rules`, `npm audit --omit=dev --audit-level=high`
- `dependency-review.yml`: PR dependency vulnerability check

## 4. Known Testing Gaps (Tracked in Backlog)
- Full browser E2E flows (Playwright/headless) against Firebase Auth Emulator + live UI forms are not yet automated.
- Express `server.ts` HTTP route integration tests using `supertest` / ephemeral server startup should be added to mirror `worker/` `app.request()` coverage.
- Live Cloudflare Wrangler local (`miniflare`) D1/R2 binding tests are deferred until D1/R2 staging fixtures are added to CI.
