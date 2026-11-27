# DIPINDIA — Ecosystem Integration Contract

## 1. Core relationship

DIPINDIA is the existing developed platform and remains the product continuity anchor. The other repositories exist to support its gradual modularization and evolution. They must not build a competing customer-facing platform or assume ownership of current features before an approved extraction.

## 2. Integration principles

- DIPINDIA remains the host application during initial migration.
- One authoritative implementation and data owner per capability at a time.
- Stable versioned interfaces between repositories.
- Backward compatibility for routes and API contracts.
- No hidden coupling to another repository's internal source files.
- No secrets or customer data shared through Git.
- No production dependency introduced without review.
- Every extracted module retains a DIPINDIA adapter until cutover approval.
- No simultaneous independent writers to the same business entity without a consistency design.

## 3. Repository contract matrix

| Repository | Provides to DIPINDIA | Must not do |
|---|---|---|
| dip-infrastructure | Schema, config standards, CI patterns, infrastructure docs | Deploy or mutate production |
| dip-security | AuthN/AuthZ contracts, security helpers, policy tests | Force identity-provider migration |
| dip-core | Shared domain types, schemas and pure business rules | Own DIPINDIA database or UI |
| dip-ui | Tokens, accessible shared components | Rebuild the whole portal or move business logic |
| dip-api | API contracts, gateway conventions, provider adapters | Break existing endpoints or change live provider config |
| dip-sdk | Typed client libraries for approved public APIs | Expose privileged internal APIs or secrets |
| dip-automation | Job, queue, retry and notification modules | Run duplicate authoritative jobs |
| dip-docs | Verified architecture and developer documentation | Claim unimplemented features |
| dip-status | Health, metrics and incident contracts | Expose private diagnostics or customer data |

## 4. Contracts by capability

Each contract must include:
- Stable name and semantic version.
- Owner and consumers.
- Type/schema definition.
- Error model.
- Authentication and authorization requirements.
- Idempotency and retry semantics if relevant.
- Compatibility and deprecation policy.
- Test fixtures and consumer contract tests.
- Migration and rollback notes.

## 5. Compatibility requirements

For existing public routes and APIs:
- Preserve method/path and response semantics unless a versioned migration is approved.
- Preserve auth requirements and error status behaviour.
- Preserve redirects and canonical URLs.
- Preserve webhook callback expectations.
- Maintain old adapters while clients are migrated.
- Track usage before deprecation.
- Publish deprecation notices and migration examples.

For UI:
- Preserve user journeys, language, accessibility, responsive behaviour and role-specific navigation.
- Shared component replacement requires visual and interaction parity.

For jobs:
- Preserve scheduling, status transitions, retry limits and notification semantics.
- Ensure a single active authoritative executor for each job type.

## 6. Data ownership

DIPINDIA remains authoritative for existing entities until a separate data ownership decision is approved. Repositories may define types and schemas, but that does not grant permission to read or write production records.

Every entity transfer requires:
- Current and target owner.
- Read/write matrix.
- ID and schema compatibility.
- Migration plan.
- Backup/restore and reconciliation.
- Cutover and rollback.
- Explicit approval.

## 7. Dependency order

1. dip-infrastructure — review-only engineering standards.
2. DIPINDIA — complete inventory, baseline and migration contracts.
3. dip-security — security contract and parity.
4. dip-core — stable domain contracts.
5. dip-ui — shared visual system.
6. dip-api — API/provider boundaries.
7. dip-sdk — client SDKs based on stable API.
8. dip-automation — jobs and orchestration.
9. dip-docs — canonical documentation and release process.
10. dip-status — service-health and incident contracts.

This order is a planning dependency, not a requirement to block documentation or independent research.

## 8. Change process

For each proposed integration:
1. Identify capability and business owner.
2. Link it to the feature inventory ID.
3. Inspect current DIPINDIA behaviour.
4. Define the target contract and repository owner.
5. Add compatibility and regression tests.
6. Implement behind an adapter or feature gate.
7. Verify parity in isolated environments.
8. Document rollback.
9. Obtain explicit approval for production cutover.
10. Retire legacy code only after stable operation and separate approval.

## 9. Versioning and deprecation

- Use semantic versioning for reusable packages and public APIs.
- Additive changes should remain backward-compatible.
- Breaking changes require a major version, migration guide and consumer readiness.
- Do not delete a contract based solely on a new package release.
- Keep compatibility adapters for the agreed transition period.

## 10. Current platform boundaries

- Cloudflare Workers, D1, R2 and Firebase are part of the known current DIPINDIA architecture; verify exact runtime bindings and usage before changing them.
- JustPostgres utilities exist in the repository, but this does not establish an approved production database migration or connection.
- Karta Files and Tools-Tray remain separate products unless an explicit product decision changes this.
- Wendoro is unrelated and must not be accessed.
- No production data, credentials or configuration may be copied into ecosystem repositories.
