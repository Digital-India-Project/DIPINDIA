# DIPINDIA — Development Backlog

Prioritized engineering backlog designed for safe, incremental execution without disrupting live citizen or staff workflows.

## P0 — Immediate Stability & Parity (Short-Term)
- [ ] **BP-001 (Auth Alignment)**: Reconcile `cyber.sundial@gmail.com` / bootstrap admin handling between `worker/middleware/auth.ts`, `server.ts`, and Firebase Custom Claims; remove hardcoded email fallbacks in favor of `BOOTSTRAP_ADMIN_EMAIL` + DB role tables.
- [ ] **BP-002 (Legacy Env Cleanup)**: Emit a startup warning if any `VITE_CASHFREE_*` secret key is detected in `process.env` / `c.env`, then schedule removal of `VITE_*` secret aliases from `cashfreeService.ts`.
- [ ] **BP-003 (Express Route Integration Tests)**: Add automated Express HTTP tests in `tests/` spinning up Express routes on an ephemeral port to verify `/api/payments/*`, `/api/v1/products/:slug/purchase`, `/api/v1/apisathi/*`, and `/api/karta/*`.

## P1 — Modularization & Route Decomposition (Near-Term)
- [ ] **BP-004 (Split `worker/routes/v1.ts`)**: Decompose `v1.ts` (3,652 lines) into domain sub-routers (`catalogRoutes.ts`, `paymentRoutes.ts`, `b2bVerificationRoutes.ts`, `digitalProductRoutes.ts`) mounted identically at `/api/v1`.
- [ ] **BP-005 (Split `server.ts`)**: Extract Express Cashfree, API Sathi, SEO, Digital Products, and Postgres route groups from `server.ts` into `server/routes/*.ts`.
- [ ] **BP-006 (Shared Workflow Transition Parity)**: Route Express and Firestore status transitions through a shared backend endpoint so D1 `workflow_transitions` and Firestore `applications` remain consistent.
- [ ] **BP-007 (DataContext Decomposition)**: Break `src/context/DataContext.tsx` into modular domain contexts/hooks (`CatalogProvider`, `ApplicationsProvider`, `BillingProvider`) without altering public hook signatures consumed by pages.

## P2 — Ecosystem Adapter Integration (Mid-Term)
- [ ] **BP-008 (`dip-core` Package Bridge)**: Prepare `src/lib/{rbac,workflow,finance,formEngine,catalogueServer}.ts` as clean workspace-importable interfaces consumed via `@dip/core` when published.
- [ ] **BP-009 (`dip-security` Auth Adapter)**: Define a pluggable JWT/RBAC verifier interface in `worker/middleware/auth.ts` and `server/middleware/` to delegate token/policy checks to `dip-security` safely.
- [ ] **BP-010 (`dip-automation` Webhook/Retry Offload)**: Extract `apiSathiQueue.ts` and Cashfree reconciliation sweeps behind job-dispatch contracts compatible with Cloudflare Queues / `dip-automation`.
- [ ] **BP-011 (`dip-status` Health Contract)**: Standardize `/api/health` and `/api/integrations/status` telemetry output (`status`, `latencyMs`, component checks without secrets) for `dip-status` uptime probes.

## P3 — Testing & Quality Automation (Ongoing)
- [ ] **BP-012 (Playwright Critical-Path E2E)**: Automate browser E2E smoke tests covering catalog browse -> dynamic form submit -> Cashfree sandbox checkout -> customer tracking -> operator completion.
- [ ] **BP-013 (Unused File Audit)**: Confirm zero active imports of `src/pages/AuthPages.tsx` and legacy helpers before archiving cleanly.
