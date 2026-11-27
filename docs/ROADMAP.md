# DIPINDIA — Feature Inventory and Migration Roadmap

**Status:** Initial discovery checklist; not yet a complete verified inventory  
**Rule:** Existing feature remains available until parity and cutover approval.

## 1. Feature inventory status

Use the following status values:
- **Uninventoried:** not yet inspected.
- **Discovered:** code/route/config location identified.
- **Characterized:** current behaviour and acceptance criteria recorded.
- **Contracted:** target module interface defined.
- **Extracted:** code/package/service implemented with adapter retained.
- **Parity verified:** tests and evidence prove equivalent behaviour.
- **Cutover approved:** separate release authorization granted.
- **Retired:** old implementation removed only after approved stable operation.

Do not mark a feature complete based only on a README or code import.

## 2. Initial feature inventory register

| ID | Capability group | Current evidence / areas to inspect | Future owner candidate | Status |
|---|---|---|---|---|
| F-001 | Authentication and account lifecycle | AuthContext, Firebase services, auth pages, token middleware | dip-security | Discovered, incomplete |
| F-002 | Roles and permissions | Firestore rules, server middleware, role-gated portals | dip-security | Discovered, incomplete |
| F-003 | Customer portal | CustomerDashboard, dashboard routes | DIPINDIA + dip-ui | Discovered, incomplete |
| F-004 | Business/B2B portal | B2BPortal and associated API routes | DIPINDIA + dip-api | Discovered, incomplete |
| F-005 | Operator portal and enrollment | OperatorDashboard, OperatorEnrollmentPage | DIPINDIA + dip-core | Discovered, incomplete |
| F-006 | Manager portal | ManagerDashboard | DIPINDIA + dip-ui | Discovered, incomplete |
| F-007 | Partner portal and referrals | PartnerDashboard, BecomePartnerPage | DIPINDIA + dip-core | Discovered, incomplete |
| F-008 | Admin portal | AdminDashboard and admin services | DIPINDIA + dip-security | Discovered, incomplete |
| F-009 | Service catalogue and pricing | catalogue data, catalogueServer, importer | dip-core | Discovered, incomplete |
| F-010 | Dynamic forms and form builder | formEngine, validateFormSubmission, form UI | dip-core | Discovered, incomplete |
| F-011 | Application lifecycle/workflow | Application types, TrackPage, workflow APIs and data | dip-core + dip-automation | Discovered, incomplete |
| F-012 | Document upload and storage | D1/R2 bindings, document routes and access rules | dip-api + infrastructure | Uninventoried |
| F-013 | Generated documents and exports | PDF/DOCX/ZIP/CSV generation modules | dip-core + dip-api | Discovered, incomplete |
| F-014 | Cashfree payments | cashfreeService, payment status, alert service | dip-api | Discovered, incomplete |
| F-015 | Payment reconciliation/refunds/invoices | billing routes, webhook and reconciliation paths | dip-api + dip-automation | Uninventoried |
| F-016 | API Sathi verification | apiSathi services, queue and analytics | dip-api + dip-automation | Discovered, incomplete |
| F-017 | API Junction / B2B integrations | DB_API binding and API routes/config | dip-api + dip-sdk | Uninventoried |
| F-018 | Notifications and alerts | payment alert, notifications, event handlers | dip-automation | Uninventoried |
| F-019 | Offline queue and PWA | offlineQueue, network hooks, PWA config | dip-automation + dip-ui | Discovered, incomplete |
| F-020 | Blog/CMS and bilingual content | BlogPage, initialBlogPosts, blogSeo | DIPINDIA + dip-core | Discovered, incomplete |
| F-021 | Public SEO and sitemap | buildSitemapXml, route handling, sitemap paths | DIPINDIA + dip-infrastructure | Discovered, incomplete |
| F-022 | India directory/geography | indiaGeography, directory SEO and location pages | DIPINDIA + dip-core | Discovered, incomplete |
| F-023 | AI assistant | AssistantModal, AI provider abstraction | dip-api (provider interface) | Discovered, incomplete |
| F-024 | Digital tools tray | DigitalToolsTray, ToolTrayContext | DIPINDIA + dip-ui | Discovered, incomplete |
| F-025 | Audit and analytics | DB_AUDIT/DB_ANALYTICS bindings, analytics modules | dip-core + dip-status | Uninventoried |
| F-026 | Admin settings and system controls | Admin routes, configuration modules | DIPINDIA + dip-security | Uninventoried |
| F-027 | Database/PostgreSQL utilities | server/postgres, dbMigrations, sync utilities | infrastructure (standards only) | Discovered; usage unverified |
| F-028 | Karta integration boundary | createKartaRouter and related references | Separate product boundary | Discovered; scope unverified |
| F-029 | Accessibility, themes and language | ThemeContext, LanguageContext, UI components | dip-ui | Discovered, incomplete |
| F-030 | Error handling/performance | ErrorBoundary, perfMonitor, route loading | dip-ui + dip-status | Discovered, incomplete |

This register must be expanded by inspecting all routes, components, API handlers, schema/migrations, data stores, jobs, tests and runtime entrypoints. It is not a claim that all capabilities are currently complete or active.

## 3. Migration order

### Stage 0 — Complete discovery (P0)
- [ ] Full file and route inventory.
- [ ] Map all UI routes and role guards.
- [ ] Map every API endpoint and webhook.
- [ ] Map D1 tables, migrations, Firestore collections and R2 object categories.
- [ ] Map jobs, retries, notifications and scheduled work.
- [ ] Record provider dependencies and environment requirements.
- [ ] Classify features as production-active, test-only, experimental, dormant or unknown.
- [ ] Capture critical-path test baseline.

**Gate:** no feature extraction until the inventory is reviewed.

### Stage 1 — Contracts and regression tests (P0)
- [ ] Define stable entity and API contracts.
- [ ] Add characterization tests for critical user journeys.
- [ ] Add role/permission matrix tests.
- [ ] Add payment and webhook tests with synthetic fixtures.
- [ ] Add document authorization tests.
- [ ] Establish error and observability conventions.
- [ ] Record rollback per feature.

**Gate:** existing behaviour has automated evidence.

### Stage 2 — Low-risk shared modules (P1)
Candidate extraction:
- Pure validators and formatters.
- Payment status normalization helpers.
- Shared schema/type definitions.
- Domain calculations with no storage side effects.
- Design tokens and accessible UI primitives.

Keep adapters and original implementation until consumers pass parity tests.

### Stage 3 — Security and UI foundations (P1)
- Extract reusable security policy helpers.
- Keep Firebase Auth and existing user identity intact.
- Extract UI primitives and shared components.
- Compare visual, keyboard and screen-reader behaviour.
- Do not change roles or permissions as a side effect of component extraction.

### Stage 4 — API and provider adapters (P1/P2)
- Extract API contracts.
- Wrap existing Cashfree and API Sathi implementations.
- Preserve signatures, idempotency, retries and reconciliation.
- Use sandbox fixtures and provider mocks.
- Do not change live payment/provider configuration.

### Stage 5 — Automation and background jobs (P2)
- Extract notification and retry jobs.
- Establish one authoritative job executor per task.
- Add deduplication, retry, dead-letter and reconciliation.
- Preserve existing application status and user notification semantics.

### Stage 6 — Monitoring, SDK and documentation (P2)
- Add service health contracts.
- Build SDKs from stable API contracts.
- Document only verified behaviour.
- Keep public status separate from private operations.

### Stage 7 — Data architecture and service topology (P3; separate approval)
- Evaluate current data ownership and scale.
- Rehearse migration with synthetic or approved sanitized copies.
- Validate backup and restore.
- Establish cutover and rollback.
- No JustPostgres connection or migration without explicit approval.

## 4. Per-feature migration gate

Every feature must pass:
1. Existing behaviour documented.
2. Existing route and permissions identified.
3. Data ownership confirmed.
4. Target repository and contract agreed.
5. Unit, integration and regression tests pass.
6. Security and privacy review passes.
7. Performance and operational signals are adequate.
8. Shadow/parity validation passes where applicable.
9. Rollback path is tested.
10. Explicit approval is obtained before production cutover.

## 5. Priority rules

- P0: identity, access control, payments, applications, documents, data integrity, backups and regression safety.
- P1: shared domain logic, UI foundations, API contracts and integration boundaries.
- P2: SDK, automation expansion, monitoring and developer experience.
- P3: data store migration, service separation and legacy retirement.

## 6. Release rule

No date-based deadline overrides the migration gates. Do not remove a feature because a new repository is ready; retire only the old implementation of a specific capability after verified parity, stable operation and explicit approval.
