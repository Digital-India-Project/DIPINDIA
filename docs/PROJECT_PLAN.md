# DIPINDIA — Feature-Preserving Ecosystem Migration Plan

**Status:** Planning baseline; implementation and cutovers require separate approval  
**Base:** Existing DIPINDIA review branch  
**Migration pattern:** Strangler-style incremental modularization with DIPINDIA as the continuity anchor

## 1. Executive objective

Evolve the existing DIPINDIA application into the central platform of a modular Digital India Project ecosystem. New repositories will progressively take ownership of well-bounded capabilities. DIPINDIA continues serving users throughout the transition and remains the source of truth until each capability has been safely migrated.

This is not a greenfield rebuild. It is not a parallel replacement platform. It is not authorization to migrate production data or infrastructure.

## 2. Success outcomes

- All currently available features are inventoried and traceable.
- Existing user journeys and public URLs remain operational.
- Authentication, authorization, roles, permissions and audit semantics remain equivalent or improve.
- Existing records and files remain intact and accessible.
- Payment totals, webhook handling, refunds and reconciliation remain correct.
- New modules have explicit ownership, versioned contracts and automated compatibility tests.
- Every extraction has a fallback path.
- No user is forced to move to a new portal during development.
- Production cutover occurs only after a separate approval.

## 3. Current-state baseline and limits

Initial inspection of `review/phase-1-p0-fixes` confirmed:
- React 19, TypeScript, Vite 8 frontend.
- Express server in `server.ts`.
- Cloudflare Worker entrypoint configured in `wrangler.toml`.
- D1 and R2 logical bindings declared in Wrangler.
- Firebase/Firestore integration and Firestore security rules.
- Cashfree payment service modules.
- API Sathi integration, verification handling, queue and analytics.
- PostgreSQL/JustPostgres client and sync modules.
- PWA, offline queue, service catalogue, form engine, public content/SEO and role-specific portal components.

Important unknowns:
- Exact live route and request ownership between Express and Worker.
- Which D1 databases and R2 buckets are actually provisioned and bound in each environment.
- Which Firestore collections are actively used and their data volumes.
- Whether JustPostgres utilities are used in production, test-only, or dormant.
- Full inventory of UI routes, permissions, workflows, jobs, webhooks and provider dependencies.
- Existing automated test coverage and baseline pass/fail state.
- Exact status of each feature and which are production-enabled.

Do not infer operational status from configuration declarations or imports alone.

## 4. Scope

### In scope
- Full feature, route, role, workflow, integration and data inventory.
- Existing application stability and regression protection.
- Modular boundaries and contracts.
- Incremental extraction into the nine ecosystem repositories.
- Compatibility adapters and versioning.
- Observability, reconciliation and rollback design.
- Documentation and migration governance.

### Out of scope
- Big-bang rewrite or replacement frontend.
- Production deployments or DNS changes.
- Production database or storage migrations.
- Firebase project changes or user migration.
- Payment provider credential or webhook changes.
- JustPostgres adoption or connection changes without approval.
- Access to Wendoro.
- Removing Karta Files or Tools-Tray as independent products.
- Enabling new external APIs or provider products without authorization.

## 5. Workstreams

### WS0 — Product continuity and baseline capture
Tasks:
- Record current branch, commit, runtime entrypoints and package scripts.
- Inventory all routes, pages, role gates, forms, workflows, API endpoints and scheduled/background tasks.
- Record every external provider and callback/webhook.
- Map data entities to their authoritative storage.
- Record existing customer/staff journeys.
- Establish baseline tests and known defects.
- Identify deprecated, experimental, dormant and production-active features separately.

Deliverables:
- Feature inventory with stable IDs.
- Route and role matrix.
- Workflow state-transition map.
- API and provider inventory.
- Data ownership map.
- Baseline test report and known-issues register.

### WS1 — Stabilization and regression protection
Tasks:
- Review the current P0 fix branch and existing changes.
- Add characterization tests around critical flows before refactoring.
- Protect payment, authentication, document access and application transitions with regression tests.
- Add test fixtures with synthetic data only.
- Establish local test environment and safe mocks.
- Ensure build/type checks and lint/test commands are documented.
- No production DB initialization or sync scripts.

Deliverables:
- Critical-path regression suite.
- Local test data strategy.
- Test coverage map.
- Baseline quality report.

### WS2 — Domain and data ownership
Tasks:
- Identify entities: users, roles, applications, services, forms, documents, orders, payments, partners, operators, verifications, audit events, content and settings.
- For each entity record authoritative store, ID format, ownership, retention, access policy, write paths and consumers.
- Identify duplicate/legacy representations and migration risks.
- Define stable domain contracts in coordination with dip-core.
- Define event and idempotency semantics.
- Keep current data stores unchanged until separately approved.

Deliverables:
- Domain model.
- Data ownership matrix.
- Entity lifecycle definitions.
- Data classification and retention map.
- Migration constraints register.

### WS3 — Security and identity modularization (dip-security)
Tasks:
- Inventory Firebase Auth usage, token verification, sessions, role claims, Firestore rules, server-side authorization and permission checks.
- Identify duplicated or inconsistent checks.
- Define a common authorization contract.
- Extract shared helpers only after tests prove parity.
- Maintain existing Firebase Auth as the current identity provider unless an approved decision changes it.
- Never weaken default-deny access rules.
- Preserve super_admin/admin, manager, operator, partner, customer/business and any additional verified roles.

Deliverables:
- AuthN/AuthZ flow diagrams.
- Role/permission matrix.
- Security contract and compatibility adapter.
- Authorization regression tests.
- Migration plan with rollback.

### WS4 — Shared domain logic (dip-core)
Tasks:
- Identify pure business rules and stable data contracts.
- Prioritize service catalogue, pricing, application state transitions, form validation, payment status normalization, and shared error/result types.
- Separate pure logic from storage, UI and provider SDKs.
- Publish versioned contracts.
- Keep existing DIPINDIA modules as adapters while consumers migrate.
- Avoid moving unstable or tightly coupled code prematurely.

Deliverables:
- Domain package boundaries.
- Versioned types/schemas.
- Contract tests.
- Compatibility adapters and adoption guide.

### WS5 — UI system extraction (dip-ui)
Tasks:
- Inventory shared components, tokens, layout patterns, accessibility behaviours, language and theme support.
- Establish visual baselines for customer, admin and operational portals.
- Extract only stable primitives and shared components.
- Preserve routes, labels, workflows, responsive layouts and bilingual support.
- Verify accessibility and visual parity before replacing any component.
- Keep DIPINDIA as the host application.

Deliverables:
- Component inventory.
- Design token contract.
- Shared component package.
- Visual regression tests.
- Adoption and rollback guide.

### WS6 — API and provider integration extraction (dip-api)
Tasks:
- Inventory all API routes, request/response contracts, authentication, rate limits, idempotency, webhook handlers and provider adapters.
- Start with non-breaking adapters around existing server/Worker handlers.
- Document Cashfree and API Sathi flows separately.
- Preserve payment verification, webhook signature checks, deduplication, retries, reconciliation and alerting.
- Mask sensitive values in logs and analytics.
- Do not enable new providers or change live credentials.

Deliverables:
- API catalogue and OpenAPI specs.
- Provider adapter contracts.
- Webhook and idempotency test suite.
- Compatibility facade.
- Cutover/rollback plan per integration.

### WS7 — SDK and external developer experience (dip-sdk)
Tasks:
- Derive SDKs only from stable, versioned API contracts.
- Define authentication and token lifecycle.
- Provide typed error handling, retries and idempotency behaviour.
- Add sandbox examples and contract tests.
- Do not expose internal or privileged APIs.
- No package publishing without separate approval.

Deliverables:
- SDK design.
- Versioning and support policy.
- Sample integrations.
- API compatibility test suite.

### WS8 — Automation extraction (dip-automation)
Tasks:
- Inventory offline queue, verification retry queue, scheduled tasks, notification flows, background processing and event triggers.
- Define job schemas, idempotency keys, retry/backoff, dead-letter handling and audit correlation.
- Preserve existing user-visible status and notification timing semantics.
- Introduce outbox/event patterns only after data ownership and transaction boundaries are understood.
- No duplicate jobs or uncontrolled parallel execution.

Deliverables:
- Job inventory.
- Event contract catalogue.
- Retry and dead-letter policy.
- Duplicate-prevention and reconciliation tests.
- Gradual worker adoption plan.

### WS9 — Infrastructure and observability (dip-infrastructure, dip-status)
Tasks:
- Document actual runtime configuration and ownership.
- Add review-only CI and environment validation.
- Define service health and operational signals.
- Separate public status from private diagnostics.
- Define alerts, SLO candidates, incident severity and recovery procedures.
- Do not add deployment jobs or production secrets.

Deliverables:
- Infrastructure baseline.
- Service dependency map.
- Health check contract.
- Observability and incident plan.

### WS10 — Documentation and release governance (dip-docs)
Tasks:
- Document verified current behaviour.
- Publish architecture, API, role, workflow and integration docs.
- Maintain migration status and compatibility matrix.
- Add release notes and deprecation notices.
- Ensure docs do not claim unimplemented capabilities.

Deliverables:
- Technical documentation baseline.
- Runbooks and support guides.
- Release/migration notes.
- Cross-repository documentation index.

## 6. Migration phases and gates

### Phase A — Discover and freeze the baseline
No functional migration. Inventory, test and document. Exit only when critical routes, roles, data stores and workflows are mapped.

### Phase B — Establish contracts
Create versioned contracts and adapters while DIPINDIA remains unchanged at runtime. Exit when contract tests and ownership decisions are reviewed.

### Phase C — Extract low-risk pure modules
Move isolated, deterministic utilities first (for example shared validation, status normalization or formatters) after characterization tests. Keep a DIPINDIA adapter and pin package versions.

### Phase D — Extract shared UI and security helpers
Only after visual, accessibility and authorization parity. Authentication provider and user records remain unchanged unless explicitly approved.

### Phase E — Extract API/provider boundaries
Introduce compatible facades and contract tests. Payment and identity flows receive heightened review. No live cutover until sandbox and reconciliation evidence is accepted.

### Phase F — Extract background jobs
Use idempotency, observability and reconciliation. Ensure a single authoritative executor for each job type during each stage.

### Phase G — Data architecture evolution (separate approval)
Only after entity ownership, backup/restore, migration rehearsal, reconciliation and rollback plans are approved. Existing D1/R2/Firebase arrangements remain unchanged until then. JustPostgres is not presumed to be connected.

### Phase H — Controlled production adoption (separate approval)
Per capability: staged rollout, health monitoring, support readiness, rollback criteria and explicit release authorization. This plan itself grants no production permission.

## 7. Migration control framework

Each capability receives a migration record containing:
- Feature ID and business owner.
- Existing implementation location.
- Routes, roles and data entities affected.
- Existing behaviour and acceptance tests.
- Target repository and module.
- API/schema compatibility requirements.
- Data ownership and migration implications.
- Security and privacy review.
- Observability and support plan.
- Rollback path.
- Status: discovered, characterized, contract-defined, extracted, shadow-tested, parity-approved, rollout-approved, retired.

No feature advances on status alone; evidence is required.

## 8. Prioritization

### P0 — Continuity and safety
- Complete feature inventory.
- Route/role/workflow/API/data maps.
- Baseline test suite.
- Authentication/payment/document/application regression coverage.
- Cross-repository ownership and contract rules.
- No production changes.

### P1 — Low-risk modularization
- Pure domain helpers.
- Shared schema/types.
- UI primitives.
- Security helpers behind compatibility adapters.
- API documentation and provider interfaces.

### P2 — Service and operational extraction
- Background job execution.
- API gateway/provider runtime separation.
- Monitoring and developer SDKs.
- Optional infrastructure automation (review-only initially).

### P3 — Data and deployment evolution
- Database ownership changes.
- Service deployment topology changes.
- Production traffic cutovers.
- Legacy retirement.

P3 requires separate architecture, security, backup, rollback and operational approvals.

## 9. Acceptance criteria

- 100% of discovered current features are represented in the inventory, with unknowns explicitly marked.
- Critical customer and staff journeys have characterization tests.
- Existing route and API compatibility is preserved.
- Role and permission behaviour is tested for both allowed and denied actions.
- Payment order, webhook, refund and reconciliation behaviour is covered by tests.
- Document access and storage permissions are covered.
- New packages have versioned contracts and consumer tests.
- No duplicate source of truth or uncoordinated dual writes.
- Every extracted module has a compatibility adapter and rollback instructions.
- No feature is removed without parity evidence and approval.
- No production action occurs without separate approval.

## 10. Governance

- Work only on review branches.
- No push to `main`; no merge; no deployment.
- Inspect before modifying; small, reviewable batches.
- Run relevant tests and report actual results.
- Never copy secrets, customer data or production documents into tests.
- Do not run stateful database scripts against live environments.
- Keep Karta Files and Tools-Tray as separate products unless a product-level decision explicitly changes that boundary.
- Never access Wendoro.
