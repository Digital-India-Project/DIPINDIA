# DIPINDIA — Ecosystem Integration Architecture

DIPINDIA is Repository #2 and the **existing functional authority** in the 10-repository **Digital India Project** organization (`https://github.com/Digital-India-Project`).

**Core Rule:** DIPINDIA does NOT implement competing clones of the other nine repositories. Instead, DIPINDIA exposes stable internal boundaries and REST contracts so each specialized repository integrates cleanly as it matures.

## Integration Matrix Across All 10 Repositories

| # | Repository | Ecosystem Responsibility | Current Location Inside DIPINDIA | Integration Interface / Contract |
| --- | --- | --- | --- | --- |
| 1 | **`dip-infrastructure`** | Cloudflare Workers/D1/R2/DNS IaC, Wrangler environments, PostgreSQL provisioning | `wrangler.toml`, `migrations/`, `scripts/applyD1Migrations.sh`, `worker/config/{database,storage}.ts` | DIPINDIA consumes logical D1/R2 bindings (`DB`, `DOCUMENTS_BUCKET`, `dip_*`) and migration SQL via IaC outputs without hardcoding infra IDs. |
| 2 | **`DIPINDIA`** | **Authoritative platform runtime** (Portals, Catalog, Workflows, Payments, Karta, API Sathi) | This repository (`src/`, `worker/`, `server.ts`) | Functional anchor & host runtime during staged modularization. |
| 3 | **`dip-security`** | Centralized Firebase/JWT verification, RBAC policies, rate limiting, header & URL safety | `worker/middleware/{auth,security}.ts`, `server/middleware/expressSecurity.ts`, `src/lib/rbac.ts`, `src/lib/urlSafety.ts`, `firestore.rules` | Auth middleware & policy helpers adopt `@dip/security` interfaces preserving `RequestUser`, `PermissionCode`, and `X-Request-Id` contracts. |
| 4 | **`dip-core`** | Shared domain models, financial paise math, workflow state machine, form engine, catalog pricing | `src/types.ts`, `src/lib/{finance,workflow,formEngine,catalogueServer}.ts` | Pure TypeScript domain packages consumed identically by DIPINDIA frontend, Worker, Express, and `dip-api`. |
| 5 | **`dip-ui`** | Shared React + Tailwind v4 design system, layout shells, form widgets, status badges | `src/components/common/*`, `src/components/dashboard/*`, `src/components/tools/*` | DIPINDIA gradually swaps duplicated primitives (`Header`, `Footer`, badges, skeletons, wizard inputs) for `@dip/ui` exports while keeping route behavior identical. |
| 6 | **`dip-api`** | Public B2B API gateway, developer keys, verification endpoints, rate/quota metering | `worker/routes/apiSathiRoutes.ts`, B2B routes in `worker/routes/v1.ts` | B2B `/api/v1/verifications/*` and developer API key management route cleanly through `dip-api` using shared `@dip/core` & `@dip/security` contracts. |
| 7 | **`dip-sdk`** | Official TypeScript/JS client SDKs for external B2B partners & internal portals | `src/services/backendApi.ts` | `backendApi.ts` acts as DIPINDIA's internal client seam and aligns typed response envelopes (`buildApiResponse`) with `@dip/sdk`. |
| 8 | **`dip-automation`** | Asynchronous retry queues, scheduled reconciliation sweeps, notification dispatch, directory sync | `src/services/apiSathiQueue.ts`, `worker/services/paymentReconciliation.ts`, `paymentAlertService.ts`, `worker/index.ts` (`scheduled()`) | Cron triggers & background retry jobs emit idempotent job payloads (`Idempotency-Key`) ready to offload from Worker timers to `dip-automation` queues. |
| 9 | **`dip-docs`** | Central developer, architecture, API reference & compliance documentation portal | `/docs/*.md`, `README.md`, `CONTRIBUTING.md`, `security_spec.md` | `/docs/` files are structured in portable Markdown ready for direct ingestion/sync into `dip-docs`. |
| 10 | **`dip-status`** | Health monitoring, synthetic probes, gateway latency & incident status page | `/api/health`, `/api/integrations/status`, `/api/admin/infrastructure`, `PerformanceAnalyticsTab.tsx` | Standardized unauthenticated `/api/health` JSON contract (`status`, component boolean readiness, zero PII/secrets) feeds `dip-status` monitors cleanly. |
