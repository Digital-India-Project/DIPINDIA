# Digital India Project — DIPINDIA

**Role:** Existing primary business platform and migration anchor  
**Status:** Existing developed application; preserve all current functionality  
**Planning branch:** `review/ecosystem-migration-plan`

## 1. Mission

DIPINDIA is the existing Digital India Project application. It remains the customer-facing and operational platform while the wider multi-repository ecosystem is developed. The new repositories are intended to modularize, strengthen, and eventually take ownership of selected capabilities—not to compete with DIPINDIA or replace it through a big-bang rewrite.

The migration objective is:

> Preserve every currently available feature, user journey, record, integration, and operational capability while progressively extracting well-defined modules into shared packages or services. Cut over only after parity, security, compatibility, operational readiness, and rollback have been demonstrated.

## 2. Current inspected technology baseline

The inspected review branch contains:

- React 19 + TypeScript frontend, built with Vite 8.
- Express server entry point in `server.ts`.
- Cloudflare Worker entry point at `worker/index.ts`, configured by `wrangler.toml`.
- Cloudflare D1 logical database bindings and R2 bucket bindings declared in Wrangler configuration.
- Firebase client integration and Firestore security rules.
- Cashfree payment integration.
- API Sathi provider integration and verification queue/analytics modules.
- PostgreSQL/JustPostgres client and synchronization utilities in `server/postgres/`.
- PWA/service-worker support.
- Form engine, service catalogue, application workflows, blog/SEO, geography/directory content, offline queue, reporting and role-specific portals.

This is a partial repository inspection, not a complete feature audit or proof that all declared resources are deployed or actively used. Verify the entire source tree and runtime paths before making implementation or migration decisions.

## 3. Non-negotiable product continuity rules

1. DIPINDIA remains the primary product and system of record during migration.
2. No existing route, portal, role, form, workflow, integration, report, or customer capability may be removed merely because a new repository exists.
3. No competing customer portal or duplicate business application is to be built in the ecosystem repositories.
4. Do not change production infrastructure, DNS, secrets, payment configuration, Firebase, Cloudflare, or database resources as part of planning.
5. Do not migrate live data or change the active database architecture without a separately approved migration plan.
6. No dual writes to old and new systems without a designed consistency protocol, reconciliation, monitoring, and rollback.
7. Preserve current customer-facing URLs and API behaviour; use adapters or compatibility layers for changes.
8. Feature cutover requires documented parity evidence and explicit approval.
9. All work remains on review branches; never push to `main`, merge, or deploy.

## 4. Current architecture (to be fully verified)

```text
Customers / Business / Operators / Partners / Managers / Admins
                             |
                             v
                     DIPINDIA React UI
                             |
                  Express / Worker API paths
                             |
          +------------------+-------------------+
          |                  |                   |
          v                  v                   v
     Firebase Auth       Cloudflare D1       Cloudflare R2
     / Firestore          logical bindings    logical buckets
          |                  |                   |
          +------------------+-------------------+
                             |
              Payments / provider APIs / jobs
                             |
               Cashfree / API Sathi / others
```

The diagram is conceptual. Verify exact request routing, ownership, data stores, and deployment paths from source before treating it as a final runtime diagram.

## 5. Ecosystem repositories and intended relationship

| Repository | Intended future responsibility | DIPINDIA migration relationship |
|---|---|---|
| dip-infrastructure | Configuration governance, CI standards, infrastructure patterns | Supplies safe standards; does not deploy |
| dip-security | Shared security contracts and reusable security components | Extract security boundaries after parity |
| dip-core | Shared domain contracts and business rules | Extract stable domain modules gradually |
| dip-ui | Shared design system and reusable components | Replace selected UI components only after visual/accessibility parity |
| dip-api | API contracts, gateway patterns, provider adapters | Extract integration boundaries behind compatible adapters |
| dip-sdk | External developer SDKs | Consume stable, versioned API contracts |
| dip-automation | Jobs, queues, notifications and workflow automation | Extract background tasks without changing user-visible outcomes |
| dip-docs | Canonical technical and developer documentation | Documents verified behaviour and migration |
| dip-status | Service health and incident communication | Add monitoring without exposing private operational data |

## 6. Feature preservation

The feature inventory is a required deliverable before implementation planning is considered complete. Initial areas to inventory include:

- Authentication, account lifecycle, roles, permissions, sessions and user preferences.
- Customer, business, operator, manager, partner, admin and other role-specific experiences.
- Service catalogue, pricing, service details, conditional forms and document requirements.
- Application drafts, submission, assignment, stage transitions, resubmissions and tracking.
- Form builder and dynamic form engine.
- Document uploads, storage, generated files, access control and audit trails.
- Payments, orders, webhook processing, invoices, refunds, reconciliation and payment alerts.
- Provider integrations, API Sathi verification, retry queues, usage analytics and masking.
- Customer dashboard, B2B portal, partner and operator onboarding, manager and admin tools.
- Blog/CMS, bilingual content, SEO, sitemap, directory/geography and public information pages.
- Offline mode, PWA, network status, queued operations and recovery.
- Reporting, exports, analytics, audit logs, system settings and operational controls.
- AI assistant and digital tools tray integrations.
- Karta-related routes/integration boundaries, if still present and approved; do not merge the separate Karta Files product into DIPINDIA without an explicit product decision.

This list is a discovery checklist, not a statement that every listed feature is complete, active, or production-enabled.

## 7. Development

Use the scripts defined in the current `package.json` and inspect the lockfile before installing or changing dependencies.

Typical commands currently declared:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Database initialization and synchronization scripts are potentially stateful. Do not run them against live systems. Only use dry-run or isolated local test environments after inspecting their behaviour.

## 8. Planning documents

- [Project plan](docs/PROJECT_PLAN.md)
- [Architecture and migration design](docs/ARCHITECTURE.md)
- [Feature inventory and migration roadmap](docs/ROADMAP.md)
- [Security and data protection](docs/SECURITY.md)
- [Ecosystem integration contracts](docs/INTEGRATION.md)

## 9. Definition of success

The ecosystem is successful when DIPINDIA retains all existing customer and staff capabilities while selected modules become independently testable, versioned, secure, and maintainable. A migration is not successful if it reduces feature coverage, loses or duplicates data, breaks existing routes, changes payment outcomes, weakens authorization, or creates an unapproved operational dependency.
