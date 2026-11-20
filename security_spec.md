# Security Specification — Unified DIP-Desk Platform

## 1. Data Invariants
1. **Identity Integrity**: Every user-owned document (`karta_files`, `infra_bindings`, `tools_configs`, `backups`) must set `ownerId == request.auth.uid` on creation and preserve `ownerId` immutably on update.
2. **Prevent Self-Assigned RBAC Roles**: Non-admin users creating `/users/{userId}` must start with `role == 'viewer'` and cannot change `role` on update. Only a verified admin (`cyber.sundial@gmail.com` with `email_verified == true` or an entry in `/admins/{uid}`) may assign elevated roles (`admin`, `operator`, `auditor`).
3. **PII Isolation**: Email addresses, encrypted TOTP secrets, recovery hashes, and WebAuthn credential IDs are isolated in `/users/{userId}/private/security`, readable and writable strictly by the owner or an admin.
4. **Temporal Integrity**: All `createdAt` fields must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on both create and update.
5. **Audit Log Immutability**: `/audit_logs/{logId}` is strictly append-only (`allow update: if false; allow delete: if false;`), and `actorId` must match `request.auth.uid`.
6. **Terminal State Locking**: Once a `CloudBackup` reaches `status == 'restored'` or an `InfraBinding` reaches `migrationStatus == 'conflict-resolved'`, non-admin updates cannot revert or mutate locked terminal outcomes.
7. **Zero Client Query Trust**: Every `allow list` block explicitly evaluates `resource.data.ownerId == request.auth.uid` (or `resource.data.actorId == request.auth.uid`) or `isBootstrappedAdmin()` without any `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Read/Write**: Read `/karta_files/doc1` with `request.auth == null`.
2. **Unverified Email Write**: Create `/karta_files/doc1` with `request.auth.token.email_verified == false`.
3. **Self-Assigned Admin Role**: Create `/users/attacker` with `{ "uid": "attacker", "role": "admin", ... }`.
4. **Role Escalation Update**: Non-admin updates `/users/attacker` with `affectedKeys` containing `role`.
5. **Shadow / Ghost Field Injection**: Create `/karta_files/doc1` with extra key `"isVerified": true` not in `hasOnly(...)`.
6. **Identity Spoofing on Create**: User A creates `/karta_files/doc1` with `"ownerId": "userB"`.
7. **Timestamp Forgery**: Create `/audit_logs/log1` with `"createdAt": "2020-01-01T00:00:00Z"` instead of `request.time`.
8. **Audit Log Tampering**: Update or delete `/audit_logs/log1` even as an admin.
9. **ID Poisoning**: Create `/karta_files/` with a 200-char ID or invalid characters (`../etc/passwd`).
10. **PII Blanket Read**: Non-owner User B calls `get` on `/users/userA/private/security`.
11. **Value Poisoning on Update**: Update `/karta_files/doc1` setting `encryptedPayload` to a boolean or >200KB string.
12. **Unfiltered List Scraping**: Non-admin executes `collection('karta_files')` without `where('ownerId', '==', uid)`.
