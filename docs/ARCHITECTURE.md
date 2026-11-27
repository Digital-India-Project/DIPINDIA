# DIPINDIA — Current and Target Architecture

## 1. Architecture principles

- DIPINDIA is the existing product and migration anchor.
- Preserve user journeys and data ownership during extraction.
- Prefer modular monolith boundaries and versioned packages before creating network services.
- Use strangler-style routing only where it is observable and reversible.
- Avoid distributed transactions and dual writes.
- Keep authentication and authorization centralized and consistent.
- Treat infrastructure configuration as declaration, not proof of deployed resources.

## 2. Current inspected technology

| Layer | Observed technology | Verification note |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 8 | Confirmed in package and source |
| Server | Express in `server.ts` | Confirmed entrypoint |
| Edge runtime | Cloudflare Worker, `worker/index.ts` | Declared in Wrangler |
| Database | Cloudflare D1 bindings | Configured logical bindings; provisioned status must be verified |
| Object storage | Cloudflare R2 bindings | Configured logical bindings; provisioned status must be verified |
| Identity | Firebase Auth / Firestore rules | Source and rules present |
| Payments | Cashfree service modules | Source present; production behaviour must be separately verified |
| Provider integrations | API Sathi modules | Source present |
| PostgreSQL | JustPostgres client and sync utilities | Presence does not prove active DIPINDIA connection |
| PWA/offline | vite-plugin-pwa and offline queue modules | Source/config present |

## 3. Current conceptual topology

```text
Web / PWA clients
       |
       v
React + TypeScript application
       |
       +------------------------------+
       |                              |
       v                              v
Express application routes      Cloudflare Worker routes
       |                              |
       +---------------+--------------+
                       |
             Existing application logic
                       |
      +----------------+------------------+
      |                |                  |
      v                v                  v
 Firebase Auth/     Cloudflare D1      Cloudflare R2
 Firestore          configured stores  configured buckets
      |
      +---- external payment/provider services
```

The exact routing and runtime deployment arrangement must be verified from Worker entrypoints, Express route registrations, Wrangler configuration, build scripts and actual environment setup. Do not assume every route executes in both runtimes.

## 4. Target migration topology

```text
                         Users and staff
                               |
                               v
                     DIPINDIA application
                   (continuity + host shell)
                               |
                 Compatibility / module facade
                               |
      +------------------------+--------------------------+
      |             |            |            |           |
      v             v            v            v           v
  dip-security  dip-core      dip-ui       dip-api   dip-automation
  contracts     domain        components   adapters   jobs/events
      |             |            |            |           |
      +-------------+------------+------------+-----------+
                               |
                     Existing data ownership
                  Firebase / D1 / R2 as verified
                               |
                     Observability / status
                               |
                        dip-status
```

The first target should usually be a modular monolith using shared packages and adapters, not ten independently deployed microservices. Network service extraction should be justified by independent scaling, security, reliability or ownership requirements.

## 5. Module boundaries

### dip-security
Owns reusable auth/authorization contracts, policy helpers, token verification interfaces and security guidance. DIPINDIA retains its current identity provider and user lifecycle during initial extraction.

### dip-core
Owns stable domain types, schemas and pure business rules. It must not own UI rendering, direct database connections, payment credentials or provider-specific network clients.

### dip-ui
Owns design tokens, accessible components and shared presentation primitives. It must not own business workflow state or privileged authorization decisions.

### dip-api
Owns versioned API contracts, gateway conventions and provider adapters. It must preserve existing DIPINDIA API behaviour through compatibility facades during migration.

### dip-sdk
Consumes stable published API contracts. It does not own private internal APIs or privileged credentials.

### dip-automation
Owns job definitions, queue processing, retry policies, notification orchestration and idempotency contracts. Each job must have one authoritative executor at a time.

### dip-infrastructure
Owns configuration schema, CI standards and infrastructure documentation—not live provisioning during the current review-only phase.

### dip-docs
Publishes verified system, developer and operational documentation.

### dip-status
Owns health/incident presentation and monitoring contracts. Public status must not expose internal endpoints, customer data or secrets.

## 6. Data ownership and transition

Initial rule: existing data stores remain authoritative. For every entity, create a data ownership record with:
- Entity name and identifier.
- Current authoritative store and collection/table.
- Writers and readers.
- Access policy and data classification.
- Retention/deletion requirements.
- Existing indexes and uniqueness rules.
- Event triggers and side effects.
- Backup and restore process.
- Target owner (if any) and migration gate.

Do not infer that ten configured D1 bindings imply ten independently provisioned databases. Verify actual environment bindings and migrations. Do not infer that a JustPostgres project exists means the application uses it.

### No unapproved dual writes

If a future migration requires dual writes, it must have:
- A transactional outbox or equivalent durable change capture.
- Stable idempotency keys.
- Retry and dead-letter handling.
- Reconciliation reports.
- Conflict resolution.
- Monitoring and alerting.
- A defined rollback and write-authority switch.

Prefer read-only shadow validation before any write cutover.

## 7. API compatibility

- Inventory current endpoints and consumers.
- Record methods, paths, auth, roles, request/response schemas, status codes, errors, rate limits and idempotency.
- Introduce versioned OpenAPI contracts.
- Keep legacy routes as adapters until consumers migrate.
- Add contract tests for existing and new implementations.
- Do not change webhook signatures, payment callbacks or identity endpoints casually.
- Deprecation requires usage evidence, notice and approval.

## 8. Authentication and authorization

Firebase Auth remains the existing identity provider during the first migration stages unless a separate approved decision changes it.

Preserve:
- UID identity and account lifecycle.
- Email verification semantics.
- Role and account-type distinctions.
- Manager scope and partner/operator relationships.
- Server-side authorization checks.
- Firestore default-deny rules and document ownership.
- Session/token expiry and refresh behaviour.

A UI-hidden control is not authorization. Every protected operation must be enforced server-side or by verified database rules.

## 9. Payments and external integrations

Cashfree:
- Preserve order creation and authoritative server-side amount calculation.
- Preserve signature verification, webhook deduplication, idempotency and status reconciliation.
- Preserve refunds, invoice and alert behaviour where implemented.
- Never test using production credentials or create live transactions during migration.

API Sathi:
- Preserve key handling, masking, provider response normalization, retry queue and analytics semantics.
- Keep sandbox and production configuration separate.
- Do not expose provider keys to browser code.

All provider integrations require explicit ownership, timeouts, retry policy, idempotency, audit and privacy controls.

## 10. Deployment and cutover topology

Current stage:
- Review branches and local/test validation only.
- No deploy workflow or production traffic change.

Future, only after approval:
- Build and test candidate module.
- Run contract and parity tests.
- Shadow-read or shadow-compute where safe.
- Canary a limited, explicitly approved capability.
- Monitor correctness and latency.
- Keep rollback to old implementation available.
- Expand gradually.
- Retire old implementation only after stability and formal approval.

## 11. Architectural decision records required

- Modular monolith versus service extraction criteria.
- Package and workspace strategy.
- Canonical identity and authorization contract.
- Domain ownership and schema versioning.
- API versioning and compatibility.
- Background job and event architecture.
- Data migration approach (separate approval).
- Observability and public status boundaries.
- Karta Files / Tools-Tray product boundaries.
