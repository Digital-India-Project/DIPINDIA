# DIPINDIA — Database Migration Strategy

## 1. Guiding Safety Rules
1. **Additive-Only Evolution**: Every schema change across Cloudflare D1 (`/migrations/*.sql`), JustPostgreSQL (`/migrations/postgres/*.sql`), and Cloud Firestore must be non-destructive (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN` with safe defaults). Never issue `DROP TABLE`, `TRUNCATE`, or unguarded column drops.
2. **Idempotent Execution**: Track applied migrations in `schema_migrations` (`0004_central_platform_and_blog.sql` in D1; `public.schema_migrations` in PostgreSQL) and guard runtime DDL checks in `DatabaseRegistry.ensureMigrations()` cleanly.
3. **Zero Production Mutation Without Approval**: Never run live remote D1 migrations (`scripts/applyD1Migrations.sh`) or deploy `firestore.rules` without explicit operator approval and backup verification.

## 2. Current Migration Pipelines
### A. Cloudflare D1 (`/migrations/0001` – `0009`)
- `scripts/applyD1Migrations.sh` applies ordered SQL files sequentially via Wrangler CLI against configured D1 databases.
- `worker/config/database.ts` performs safe runtime schema capability probing across the 10 logical database slots (`dip_core` .. `dip_audit`).
- **Pre-migration checklist**:
  1. Trigger JSON backup snapshot via `BackupService` (`dip-backups` R2 bucket).
  2. Validate SQLite syntax locally before targeting staging/preview D1.
  3. Run post-migration read/write smoke probes via `/api/admin/infrastructure`.

### B. JustPostgreSQL (`/migrations/postgres/0001` – `0002`)
- `npm run db:init:postgres:dry` validates SQL migration scripts safely without mutating any remote database.
- `npm run db:init:postgres` executes `migrations/postgres/0001_justpostgres_schema.sql` and `0002_justpostgres_init_core.sql` idempotently when `JUSTPOSTGRES_URL` is configured.
- Startup non-blocking hook in `server.ts` ensures core tables exist only when PostgreSQL credentials are explicitly configured.

### C. Cloud Firestore (`firestore.rules`, `src/lib/firestoreRecreate.ts`)
- No destructive collection drops. Schema evolution relies on backward-compatible field readers in `src/lib/dbSchema.ts` and allowlisted field validators inside `firestore.rules`.
- Every `firestore.rules` change must pass `npx eslint firestore.rules` (`@firebase/eslint-plugin-security-rules`) before review.

## 3. Target Gradual Consolidation Plan
1. **Phase A (Current)**: Maintain D1 as authoritative transactional ledger for payments, R2 file metadata, and API Sathi calls; keep Firestore synchronized for reactive citizen/staff UI.
2. **Phase B**: Dual-write application workflow status changes from SPA via `unifiedRoutes.ts` so D1 `applications` and `workflow_transitions` mirror Firestore cleanly with audit trails.
3. **Phase C**: Decouple D1 logical slots onto dedicated physical D1 databases (`wrangler.toml`) as traffic grows, updating bindings only in `dip-infrastructure` without altering SQL queries.
4. **Phase D**: Use PostgreSQL replication or scheduled archival pipelines from `dip-automation` for BI reporting and long-term compliance warehousing.
