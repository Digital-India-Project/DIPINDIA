# DIPINDIA — Application Audit

## 1. Executive Summary
**DIPINDIA** (`https://github.com/Digital-India-Project/DIPINDIA`) is the existing functional authority and primary citizen/B2B/partner service platform for **Digital India Project** (`https://digitalindiaproject.com`). Rather than a single-tier SPA, the codebase operates a **hybrid triple-layer architecture**:
- **Frontend SPA (`src/`)**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + PWA manifest/service worker integration, using **Firebase Authentication** and **Cloud Firestore** (`digitalindiaproject-portal` / `digitalindiaproject-database`) as the primary real-time interactive client datastore alongside `localStorage` offline queues (`src/lib/offlineQueue.ts`).
- **Production Edge API (`worker/`, Hono on Cloudflare Workers)**: Configured in `wrangler.toml`, serving REST endpoints under `/api/v1/*`, `/api/admin/*`, `/api/storage/*`, `/api/karta/*`, `/api/integrations/*`, `/api/webhooks/cashfree`, and SSR programmatic SEO routes (`/sitemap.xml`, directory pages) across 10 logical **Cloudflare D1** databases and 10 logical **Cloudflare R2** buckets.
- **Node / Express Server (`server.ts`)**: Runs local development on port `3000` (with Vite middleware and HMR disabled) and Node production execution (`npm start`), providing local/Node parity for Cashfree, API Sathi, Karta legal templates, multi-provider AI assistant, SEO sitemaps, and optional **JustPostgreSQL** administration/sync endpoints.

## 2. Verified Runtime & Entrypoints
| Component | Entrypoint | Runtime | Verification Status |
| --- | --- | --- | --- |
| Frontend SPA | `index.html` -> `src/main.tsx` -> `src/App.tsx` | Browser / Vite 8 / React 19 | Verified via `npm run build` (`vite build`) and live HTTP `/` |
| Node/Express Server | `server.ts` (`npm run dev`, `npm start`) | Node `22.x` + Express 4 | Verified live on port `3000` (`/api/health`, `/robots.txt`) |
| Cloudflare Worker | `worker/index.ts` (`wrangler.toml`) | Cloudflare Workers + Hono 4 | Verified via `worker` Hono `app.request()` integration suites in `tests/platform.test.ts` |
| Legal Document Engine | `server/karta/kartaRouter.ts` & `worker/routes/kartaRoutes.ts` | Express + Hono | Code-inspected + TypeScript checked (`npm run lint`) |
| PostgreSQL Connector | `server/postgres/justPostgresClient.ts`, `justPostgresSync.ts` | `pg` / PostgREST HTTPS | Code-inspected + TypeScript checked (no live Oracle PG instance targeted) |

## 3. Dependency & Tooling Posture
- **Package Manager**: Standardized on **npm** (`package-lock.json`); stale duplicate `bun.lock` was removed during workspace normalization.
- **Build & Type-Checking**: `typescript` (`tsc --noEmit` via `npm run lint`) and `vite build` (`npm run build`) pass with zero errors.
- **Security Rules Linting**: `eslint.config.mjs` configures `@firebase/eslint-plugin-security-rules` for `firestore.rules`; `npx eslint firestore.rules` exits `0` with zero warnings.
- **Test Runner**: `npm test` executes `tsx --test tests/*.test.ts` using Node's built-in `node:test` runner without introducing third-party test framework bloat.
- **Repository Snapshot Note**: This workspace import does not contain `.git` history or a configured GitHub remote; CI workflows have been added under `.github/workflows/` ready for PR validation once synced to GitHub.

## 4. Key Runtime & Architectural Observations
1. **Dual Backend Maintenance**: Business routes for Cashfree, API Sathi, Karta, Digital Products, and SEO are implemented separately in both `worker/` and `server.ts` (with shared helpers in `src/lib/`). Keeping shared validation/calculation logic in `src/lib/*` prevents behavioral drift.
2. **Persistence Split**: Client UI state reads/writes Firestore directly via `DataContext.tsx`, while Worker API routes persist transactional ledgers (`payment_orders`, `payments`, `payment_webhook_events`, `file_registry`, `api_sathi_calls`) in Cloudflare D1/R2, and optional JustPostgreSQL mirrors canonical collections.
3. **Security Parity Closed**: Express `server.ts` lacked Worker security headers, `X-Request-Id` propagation, `/api/*` rate limiting, and strict production checkout/simulation guards. These gaps have been resolved via `server/middleware/expressSecurity.ts`, `src/lib/urlSafety.ts`, and `server.ts` hardening.
4. **Placeholder / Incomplete Edges**:
   - External SMS (`SMS_GATEWAY_KEY`) and WhatsApp (`WHATSAPP_API_TOKEN`) messaging adapters in Worker integration routes log/dispatch conditionally when external keys are supplied; live provider delivery was not executed in sandbox.
   - Cloudflare D1/R2 live bindings and Oracle/JustPostgreSQL external databases are not bound in the local sandbox environment and are verified through mocks, schema checks, and static validation.
