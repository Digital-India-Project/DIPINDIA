# DIPINDIA — Security and Data Protection Plan

**Status:** Security planning baseline; not a security certification

## 1. Objectives

Preserve or improve the current platform's confidentiality, integrity, availability, authorization and auditability while modules are extracted. No migration may weaken existing protections or expose customer documents, identity data, payment information or provider credentials.

## 2. Identity and access

- Treat Firebase Auth as the current identity provider until an approved decision changes it.
- Inventory every client and server token verification path.
- Ensure privileged actions are enforced server-side or by database security rules.
- Preserve verified-email requirements where currently required.
- Preserve all existing role distinctions and scope checks.
- Test both allowed and denied access for every role.
- Prevent users from changing their own privileged role or scope.
- Keep admin bootstrap and super-admin assignment procedures tightly controlled.
- Do not rely on hidden UI buttons as access control.
- Preserve account recovery, session expiry and token refresh behaviour.

## 3. Data protection

Classify and map:
- Customer identity and contact information.
- Application and supporting documents.
- Business and partner records.
- Operator enrollment/KYC material.
- Payment and invoice records.
- Provider verification requests and responses.
- Audit and security events.
- Credentials, tokens and secrets.

Requirements:
- Synthetic test data by default.
- Least-privilege access.
- Data minimization in logs and analytics.
- Encryption in transit and approved at-rest controls.
- Defined retention and deletion rules.
- Document access audit trail.
- No production data copied to new repositories or test fixtures.
- No unapproved export or migration.

## 4. Payment security

Preserve and test:
- Server-side authoritative price calculation.
- Order-to-application linkage.
- Webhook signature verification.
- Raw-body handling where required by provider signature validation.
- Idempotent webhook processing and deduplication.
- Payment status normalization.
- Refund and reconciliation logic.
- Masked payment/provider logs.
- Alerting for inconsistent or failed transactions.

Do not create live transactions or alter production Cashfree settings during development.

## 5. Provider API security

- Keep provider credentials server-side.
- Separate sandbox and production configuration.
- Mask Aadhaar, PAN, identity and other sensitive fields in logs.
- Validate provider responses and normalize errors.
- Apply timeouts, retry limits and idempotency.
- Prevent retries from causing duplicate charges or duplicate applications.
- Audit privileged verification access.
- Do not expose provider API keys through browser bundles.

## 6. Storage and document security

- Confirm private/public bucket purpose and access rules.
- Ensure private documents are not served through public asset paths.
- Validate file type, size and content where appropriate.
- Use short-lived authorized access mechanisms where applicable.
- Prevent object-key guessing from granting access.
- Record upload, download, deletion and sharing events.
- Preserve retention and deletion policies.
- Test cross-user and cross-role access denial.

## 7. Database and migration safety

- Identify the authoritative store for each entity.
- No schema or data migration without reviewed migration scripts.
- Use backups and restore rehearsal before approved data operations.
- Do not run initialization/synchronization scripts against production.
- Do not add dual writes without outbox, idempotency, reconciliation and rollback.
- Do not assume JustPostgres is connected to DIPINDIA.
- Do not access Wendoro.
- Never put credentials or connection strings in source, docs, logs or client bundles.

## 8. Cross-repository security contract

- dip-security defines reusable security contracts; DIPINDIA remains the current enforcement point until extraction is proven.
- dip-core must not contain secrets or direct provider credentials.
- dip-ui must not implement authorization as presentation-only logic.
- dip-api must enforce authentication, authorization, rate limits and input validation.
- dip-sdk must never embed privileged credentials.
- dip-automation must use scoped service identities and idempotent jobs.
- dip-infrastructure CI must use least privilege and must not deploy.
- dip-status must not expose private diagnostics.
- dip-docs must not publish secrets or sensitive topology.

## 9. Threat scenarios

| Threat | Required control |
|---|---|
| Privilege escalation | Server-side authorization and role matrix tests |
| Cross-customer document access | Object-level authorization tests |
| Duplicate payment/webhook | Signature verification, idempotency and reconciliation |
| Provider data leakage | Masking, minimization and access audit |
| Migration data loss | Backup, rehearsal, counts and reconciliation |
| Dual-write divergence | Outbox, idempotency and repair process |
| CI credential compromise | Least privilege and untrusted PR isolation |
| Broken legacy access | Compatibility tests and rollback |
| Public endpoint abuse | Validation, rate limits and abuse monitoring |

## 10. Required security gates

Before extracting any capability:
- [ ] Data classification complete.
- [ ] Existing authorization behaviour captured.
- [ ] Threat model updated.
- [ ] New module permissions reviewed.
- [ ] Logs and error output sanitized.
- [ ] Secrets remain outside source and browser code.
- [ ] Negative access tests pass.
- [ ] Rollback path documented.

Before production cutover:
- [ ] Security review approved.
- [ ] Data handling and retention approved.
- [ ] Operational monitoring ready.
- [ ] Incident response owner identified.
- [ ] Explicit release approval obtained.

## 11. Incident response

If a suspected exposure or integrity issue occurs:
1. Stop the affected migration/cutover.
2. Preserve relevant audit evidence without copying sensitive data into issues.
3. Notify the authorized security and service owners.
4. Follow the approved credential rotation or containment process.
5. Assess affected users, records and systems.
6. Restore or roll back only under the approved incident procedure.
7. Document root cause and corrective actions.

This document does not authorize independent production credential changes or infrastructure actions.
