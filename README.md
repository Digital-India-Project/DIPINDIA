# DIPINDIA — Digital India Project Platform

**DIPINDIA** is the authoritative citizen-service, compliance, B2B verification, partner operations, legal-document workbench, and payment orchestration platform of the **Digital India Project** ecosystem.

> **Modernization & Ecosystem Role:** Preserve first. Improve second. Modularize third. Migrate gradually.  
> DIPINDIA serves as the existing functional authority while integrating cleanly over time with the other nine modular repositories in the Digital India Project organization (`dip-infrastructure`, `dip-security`, `dip-core`, `dip-ui`, `dip-api`, `dip-sdk`, `dip-automation`, `dip-docs`, `dip-status`).

---

## Core Capabilities

- **Multi-Role Portals**: Citizen / Customer Dashboard, Business (B2B) Console, Partner Desk, Operator Desk, Operations Manager Portal, and Super Admin Governance Console (`src/lib/rbac.ts`, `src/pages/*`).
- **Dynamic Service Catalog & Schema-Driven Forms**: Bilingual English/Hindi catalog, compliance packages, digital products, and versioned JSON schema form builder + validation shared between React and backend runtimes (`src/lib/formEngine.ts`).
- **Multi-Stage Application Workflows & SLA Tracking**: Enforced role-gated transitions, document verification queues, correction loops, completion deliverables, and public status tracking (`src/lib/workflow.ts`).
- **Document Vault & R2 Storage**: Signed download links, file-signature/magic-byte verification, version history, and audit access logging (`worker/services/fileService.ts`, `worker/routes/storageRoutes.ts`).
- **Cashfree Payment Lifecycle**: Server-authoritative paise checkout calculation, HMAC-SHA256 webhook signature & anti-replay timestamp checks, reconciliation sweeps, refunds, and sandbox diagnostics (`worker/services/cashfreeService.ts`, `worker/services/paymentReconciliation.ts`).
- **API Sathi & DigiLocker KYC**: Live/sandbox verification APIs (PAN, GSTIN, Aadhaar DigiLocker 2-step flow, Bank IFSC, etc.), PII masking, expenditure analytics, and exponential-backoff retry queue (`src/services/apiSathi.ts`, `worker/services/apiSathiService.ts`).
- **Karta Legal Document Workbench**: Curated & structured Indian legal agreement templates with variable detection, DOCX/PDF export, e-stamp quote hooks, and AI drafting assistance (`server/karta/*`, `worker/routes/kartaRoutes.ts`).
- **India Programmatic Directory & SEO**: Hierarchical state/district/city pages with quality scoring and dynamic XML sitemaps (`migrations/0007_india_directory_programmatic_seo.sql`, `worker/lib/directorySsr.ts`).

---

## Architecture Overview

DIPINDIA currently operates across a hybrid runtime & persistence topology:

1. **Frontend SPA (`src/`)**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4, backed interactively by Firebase Authentication & Cloud Firestore (`src/services/firebase.ts`, `src/context/DataContext.tsx`, `firestore.rules`).
2. **Production Edge API (`worker/`, Hono on Cloudflare Workers)**: Serves `/api/v1/*`, `/api/admin/*`, `/api/storage/*`, `/api/karta/*`, `/api/integrations/*`, `/api/webhooks/cashfree`, and SSR SEO routes across 10 logical Cloudflare D1 database slots and 10 logical Cloudflare R2 buckets (`worker/config/database.ts`, `worker/config/storage.ts`, `wrangler.toml`).
3. **Node / Express Server (`server.ts`)**: Powers local development (port `3000` with Vite middleware, HMR disabled) and Node deployments, exposing Cashfree, API Sathi, Karta (`/api/karta/*`), multi-provider AI gateway, SEO, and optional **JustPostgreSQL** admin/sync endpoints (`server/postgres/*`).

---

## Quick Start (Local Development)

### Prerequisites
- Node.js `>= 20` (tested on Node `22.x`) and `npm`

### Setup & Run
```bash
# 1. Install dependencies
npm install

# 2. Configure local environment (never commit secrets)
cp .env.example .env

# 3. Start Express + Vite dev server on port 3000
npm run dev
```

### Verification Commands
```bash
npm run lint                  # TypeScript strict type-check (tsc --noEmit)
npm test                      # Full automated test suite (node:test via tsx)
npx eslint firestore.rules    # Validate Firestore security rules syntax & safety
npm run build                 # Production Vite SPA build (dist/)
```

---

## Documentation Index

Comprehensive architecture, data ownership, security, testing, and ecosystem migration documentation lives in `/docs/`:

| Document | Scope |
| --- | --- |
| [`docs/APPLICATION_AUDIT.md`](./docs/APPLICATION_AUDIT.md) | Runtime topology, entrypoints, dependencies, and health check |
| [`docs/FEATURE_INVENTORY.md`](./docs/FEATURE_INVENTORY.md) | Complete verified inventory of portals, workflows, tools, and integrations |
| [`docs/FEATURE_PRESERVATION.md`](./docs/FEATURE_PRESERVATION.md) | Critical behaviors & contracts that must remain intact during modularization |
| [`docs/ARCHITECTURE_ASSESSMENT.md`](./docs/ARCHITECTURE_ASSESSMENT.md) | Structural analysis of dual runtimes, contexts, and boundaries |
| [`docs/DATA_ARCHITECTURE.md`](./docs/DATA_ARCHITECTURE.md) | Firestore, D1 (`0001`–`0009`), R2, and JustPostgreSQL schemas |
| [`docs/DATA_OWNERSHIP.md`](./docs/DATA_OWNERSHIP.md) | Authoritative source-of-truth matrix & sync boundaries |
| [`docs/DATABASE_MIGRATION_STRATEGY.md`](./docs/DATABASE_MIGRATION_STRATEGY.md) | Safe zero-downtime D1 & PostgreSQL evolution plan |
| [`docs/PAYMENT_ARCHITECTURE.md`](./docs/PAYMENT_ARCHITECTURE.md) | Cashfree PG checkout, HMAC webhook verification, refunds & reconciliation |
| [`docs/DOCUMENT_MANAGEMENT.md`](./docs/DOCUMENT_MANAGEMENT.md) | Vault storage, signed URLs, magic-byte validation & deliverable issuance |
| [`docs/API_INTEGRATION.md`](./docs/API_INTEGRATION.md) | REST endpoints, API Sathi, DigiLocker, multi-provider AI, and Karta routes |
| [`docs/SECURITY_REVIEW.md`](./docs/SECURITY_REVIEW.md) | Auth, RBAC, Firestore rules, URL/header hardening & residual risk register |
| [`docs/TESTING.md`](./docs/TESTING.md) | Automated test coverage, execution commands & CI validation strategy |
| [`docs/TECHNICAL_DEBT.md`](./docs/TECHNICAL_DEBT.md) | Prioritized catalog of architectural drift, duplication & gaps |
| [`docs/DEVELOPMENT_BACKLOG.md`](./docs/DEVELOPMENT_BACKLOG.md) | Actionable engineering backlog grouped by priority & risk |
| [`docs/ECOSYSTEM_INTEGRATION.md`](./docs/ECOSYSTEM_INTEGRATION.md) | Integration contracts between DIPINDIA and the 9 modular repositories |
| [`docs/MODULE_EXTRACTION_CANDIDATES.md`](./docs/MODULE_EXTRACTION_CANDIDATES.md) | Readiness & boundary assessment for extracting modules safely |
| [`docs/MIGRATION_ROADMAP.md`](./docs/MIGRATION_ROADMAP.md) | Phased gradual migration & rollback strategy |
