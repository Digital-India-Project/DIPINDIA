# Contributing to DIPINDIA

DIPINDIA is the functional authority of the **Digital India Project** ecosystem. Contributions must preserve existing customer, partner, operator, manager, and administrator workflows while progressively strengthening stability, security, testability, and modular boundaries.

## Core Principles
1. **Preserve First**: Never break existing routes, Firestore document contracts, dynamic form schemas, or payment flows.
2. **Dual-Runtime Awareness**: Backend changes affecting payments, API Sathi, digital products, Karta, or SEO must remain consistent between **Cloudflare Workers (`worker/`)** and **Node/Express (`server.ts`)**.
3. **Ecosystem Alignment**: Do not duplicate capabilities assigned to planned ecosystem repositories (`dip-security`, `dip-core`, `dip-ui`, `dip-api`, `dip-sdk`, `dip-automation`, `dip-docs`, `dip-status`, `dip-infrastructure`). Build clean adapter interfaces inside DIPINDIA instead.
4. **Zero Secrets in Code or Client Bundles**: Never commit `.env` values, service-account keys, Cashfree secrets, or API keys. Never expose server secrets with the `VITE_` prefix.

## Local Development Workflow
```bash
npm install
cp .env.example .env
npm run dev
```

## Required Pre-PR Checks
Run all verification commands locally before opening a pull request:
```bash
npm run lint                  # TypeScript compilation check
npm test                      # Full automated test suite
npx eslint firestore.rules    # Firestore security rules validation
npm run build                 # Production Vite build verification
```

## Database & Rules Safety
- **Never** run destructive SQL operations (`DROP TABLE`, `TRUNCATE`) against D1 or JustPostgreSQL. Add additive, idempotent migrations under `/migrations/` or `/migrations/postgres/`.
- **Never** deploy `firestore.rules` or modify production Firebase/Cloudflare/DNS configuration directly from feature PRs.
- Keep `DataContext.tsx` and `worker/` RBAC role checks synchronized whenever adding new permissions or workflow stages.
