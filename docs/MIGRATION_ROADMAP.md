# DIPINDIA — Gradual Ecosystem Migration Roadmap

**Golden Rule:** *Preserve first. Improve second. Modularize third. Migrate gradually.*  
Every phase keeps DIPINDIA 100% deployable and functionally intact with an explicit rollback path.

## Phase 1 — Baseline Stabilization & Security Parity (Completed / Active)
- **Objectives**: Lock package management (`npm`), document all runtime/data layers, enforce security headers & rate limiting parity on Express (`server.ts`), validate redirect/deliverable URLs and download filenames, enforce production checkout/simulation guards, establish automated test runner (`npm test`) and validation-only GitHub Actions CI.
- **Verification Gate**: `npm run lint`, `npm test` (100% pass), `npx eslint firestore.rules`, `npm run build`, live `/api/health` header check.
- **Rollback**: Revert isolated middleware/helper commits; zero database or Firestore rule mutations performed.

## Phase 2 — Internal Modularization Inside DIPINDIA
- **Objectives**: Split `worker/routes/v1.ts` and `server.ts` into domain-focused route modules; break up `src/context/DataContext.tsx` into domain hooks while keeping exported context shapes backward-compatible; unify Worker & Express shared handlers.
- **Verification Gate**: Full route-parity tests covering both Hono (`worker/`) and Express (`server.ts`) endpoints.
- **Rollback**: Route aliases keep all external URLs identical; individual sub-routers can be reverted per domain.

## Phase 3 — Extract Shared Packages (`dip-core`, `dip-security`, `dip-ui`, `dip-sdk`)
- **Objectives**:
  1. Publish `@dip/security` (from `rbac.ts`, `urlSafety.ts`, JWKS/HMAC verification) and adopt via adapter in DIPINDIA.
  2. Publish `@dip/core` (from `types.ts`, `finance.ts`, `workflow.ts`, `formEngine.ts`, `catalogueServer.ts`) and verify byte-for-byte test parity.
  3. Gradually adopt `@dip/ui` components and `@dip/sdk` typed client in `src/`.
- **Verification Gate**: Cross-repo CI verifying DIPINDIA build + test suite against published package versions.
- **Rollback**: Pin previous workspace helper files or lockfile version immediately.

## Phase 4 — Infrastructure, Automation & Gateway Federation (`dip-infrastructure`, `dip-api`, `dip-automation`, `dip-status`, `dip-docs`)
- **Objectives**:
  1. Shift `wrangler.toml` / D1 / R2 provisioning & migration orchestration to `dip-infrastructure` while keeping DIPINDIA SQL additive.
  2. Route high-throughput background retries (`apiSathiQueue.ts`) and scheduled Cashfree reconciliation sweeps to `dip-automation` via idempotent webhooks/queues.
  3. Expose B2B verification products through `dip-api`, feed `/api/health` metrics to `dip-status`, and mirror `/docs/` into `dip-docs`.
- **Verification Gate**: Canary shadow traffic + reconciliation balance check (`0` missing payment states or orphaned R2 objects).
- **Rollback**: Feature flags in `system_settings` / env vars switch traffic cleanly back to DIPINDIA's built-in Worker handlers.
