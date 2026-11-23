import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CORE_COLLECTION_NAMES,
  JUSTPOSTGRES_CORE_SCHEMA,
  buildCoreSchemaDdlSql,
  buildInitialJustPostgresDocuments,
  initializeJustPostgresDatabase,
  type CoreCollectionInitReport,
  type CoreCollectionName,
} from './dbSchema';
import { auth } from '../services/firebase';
import {
  getJustPostgresClientConfig,
  resolveSupabaseClient,
  supabase as defaultSupabaseClient,
} from '../services/supabaseClient';

export interface DbMigrationDefinition {
  version: string;
  description: string;
  targetCollections: readonly (CoreCollectionName | 'admins' | 'schema_migrations')[];
  sqlPreview: () => string;
}

export const DB_MIGRATIONS: readonly DbMigrationDefinition[] = [
  {
    version: '0001_justpostgres_schema',
    description:
      'Create core JustPostgreSQL tables (users, services, applications, business_settings, admins, schema_migrations) with indexes and Row-Level Security.',
    targetCollections: [
      ...CORE_COLLECTION_NAMES,
      'admins',
      'schema_migrations',
    ],
    sqlPreview: () => buildCoreSchemaDdlSql(),
  },
  {
    version: '0002_justpostgres_init_core',
    description:
      'Ensure extended TypeScript entity columns, operational indexes, and published-service read policy exist across all core collections.',
    targetCollections: CORE_COLLECTION_NAMES,
    sqlPreview: () => buildCoreSchemaDdlSql(),
  },
  {
    version: '0003_initial_core_documents',
    description:
      'Verify and seed initial core records (bootstrap Super Admin, 149 canonical Services, BusinessSettings corporate profile, and RBAC matrix) if empty.',
    targetCollections: CORE_COLLECTION_NAMES,
    sqlPreview: () =>
      `-- Initial core records: ${buildInitialJustPostgresDocuments().services.length} services, ${
        buildInitialJustPostgresDocuments().business_settings.length
      } business_settings, ${buildInitialJustPostgresDocuments().users.length} admin user(s)`,
  },
] as const;

export type MigrationRunState =
  | 'up_to_date'
  | 'applied'
  | 'needs_migration'
  | 'unconfigured'
  | 'error';

export interface PostgresMigrationStatusReport {
  ok: boolean;
  status: MigrationRunState;
  configured: boolean;
  clientReady: boolean;
  initialized: boolean;
  needsMigration: boolean;
  endpointHost: string;
  servicesAnonCount: number;
  missingTables: CoreCollectionName[];
  unseededTables: CoreCollectionName[];
  schemaMigrationsReady: boolean;
  appliedVersionsCount: number;
  appliedInRun: string[];
  collections: Record<CoreCollectionName, CoreCollectionInitReport>;
  message: string;
  checkedAt: string;
}

function buildEmptyCollections(): Record<CoreCollectionName, CoreCollectionInitReport> {
  return {
    users: { table: 'users', exists: false, rowCount: 0, seededCount: 0, note: 'Not checked' },
    services: { table: 'services', exists: false, rowCount: 0, seededCount: 0, note: 'Not checked' },
    applications: {
      table: 'applications',
      exists: false,
      rowCount: 0,
      seededCount: 0,
      note: 'Not checked',
    },
    business_settings: {
      table: 'business_settings',
      exists: false,
      rowCount: 0,
      seededCount: 0,
      note: 'Not checked',
    },
  };
}

/**
 * Inspects JustPostgreSQL schema and core collections via both the initialized
 * `supabase` client (published catalog probe) and the non-PII server status endpoint.
 */
export async function checkPostgresMigrationStatus(options?: {
  force?: boolean;
  client?: SupabaseClient | null;
}): Promise<PostgresMigrationStatusReport> {
  const checkedAt = new Date().toISOString();
  const collections = buildEmptyCollections();

  const resolved = options?.client
    ? { client: options.client, config: getJustPostgresClientConfig() }
    : await resolveSupabaseClient();
  const client = resolved.client ?? defaultSupabaseClient;

  let servicesAnonCount = 0;
  let servicesAnonReachable = false;

  if (client) {
    try {
      const { count, error } = await client
        .from('services')
        .select('id', { count: 'exact', head: true });
      if (!error) {
        servicesAnonReachable = true;
        servicesAnonCount = typeof count === 'number' ? count : 0;
        collections.services = {
          table: 'services',
          exists: true,
          rowCount: servicesAnonCount,
          seededCount: 0,
          note:
            servicesAnonCount > 0
              ? `Ready (${servicesAnonCount} published services via Supabase client)`
              : 'Services table exists (0 rows)',
        };
      }
    } catch {
      servicesAnonReachable = false;
    }
  }

  // Query server non-PII migration status when running in browser/HTTP context
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    try {
      const qs = options?.force ? '?force=1' : '';
      const res = await fetch(`/api/postgres/migration-status${qs}`, { method: 'GET' });
      const json = await res.json().catch(() => null);
      const data = json?.data ?? null;

      if (res.ok && data) {
        const mergedCollections = data.collections || collections;
        const missingTables: CoreCollectionName[] = Array.isArray(data.missingTables)
          ? data.missingTables
          : [];
        const unseededTables: CoreCollectionName[] = Array.isArray(data.unseededTables)
          ? data.unseededTables
          : [];
        const configured = Boolean(data.configured || resolved.config.configured || client);
        const initialized = Boolean(data.initialized);
        const needsMigration = Boolean(
          configured && (data.needsMigration || missingTables.length > 0 || unseededTables.length > 0)
        );

        return {
          ok: configured,
          status: !configured
            ? 'unconfigured'
            : needsMigration
            ? 'needs_migration'
            : 'up_to_date',
          configured,
          clientReady: Boolean(client),
          initialized,
          needsMigration,
          endpointHost: String(data.endpointHost || resolved.config.endpointHost || ''),
          servicesAnonCount:
            servicesAnonReachable && servicesAnonCount > 0
              ? servicesAnonCount
              : Number(mergedCollections?.services?.rowCount || 0),
          missingTables,
          unseededTables,
          schemaMigrationsReady: Boolean(data.schemaMigrationsReady),
          appliedVersionsCount: Number(data.appliedVersionsCount || 0),
          appliedInRun: [],
          collections: mergedCollections,
          message: String(
            data.message ||
              (initialized
                ? 'JustPostgreSQL core schema and documents are up to date.'
                : 'JustPostgreSQL core schema requires initialization.')
          ),
          checkedAt: String(data.checkedAt || checkedAt),
        };
      }
    } catch {
      // Fall back to direct Supabase client status below if Express status route is unavailable
    }
  }

  const configured = Boolean(client || resolved.config.configured);
  if (!configured) {
    return {
      ok: false,
      status: 'unconfigured',
      configured: false,
      clientReady: false,
      initialized: false,
      needsMigration: false,
      endpointHost: resolved.config.endpointHost || '',
      servicesAnonCount: 0,
      missingTables: [...CORE_COLLECTION_NAMES],
      unseededTables: ['users', 'services', 'business_settings'],
      schemaMigrationsReady: false,
      appliedVersionsCount: 0,
      appliedInRun: [],
      collections,
      message:
        resolved.config.validationError ||
        'JustPostgreSQL is not configured (set JUSTPOSTGRES_REST_URL and JUSTPOSTGRES_ANON_KEY).',
      checkedAt,
    };
  }

  const missingTables: CoreCollectionName[] = servicesAnonReachable
    ? []
    : ['services'];
  const unseededTables: CoreCollectionName[] =
    servicesAnonReachable && servicesAnonCount === 0 ? ['services'] : [];
  const initialized = servicesAnonReachable && servicesAnonCount > 0;

  return {
    ok: servicesAnonReachable,
    status: initialized ? 'up_to_date' : 'needs_migration',
    configured: true,
    clientReady: Boolean(client),
    initialized,
    needsMigration: !initialized,
    endpointHost: resolved.config.endpointHost || '',
    servicesAnonCount,
    missingTables,
    unseededTables,
    schemaMigrationsReady: false,
    appliedVersionsCount: 0,
    appliedInRun: [],
    collections,
    message: initialized
      ? `JustPostgreSQL core schema reachable (${servicesAnonCount} services ready).`
      : 'JustPostgreSQL schema or initial core documents missing.',
    checkedAt,
  };
}

/**
 * Checks whether the `dbSchema.ts` definitions are applied to JustPostgreSQL and,
 * when missing or unseeded, triggers server-side migration & core seeding if
 * an authenticated admin session is available.
 */
export async function runPostgresMigrations(options?: {
  forceSeed?: boolean;
  coreOnly?: boolean;
  client?: SupabaseClient | null;
}): Promise<PostgresMigrationStatusReport> {
  const checkedAt = new Date().toISOString();
  const initialCheck = await checkPostgresMigrationStatus({
    force: true,
    client: options?.client,
  });

  if (!initialCheck.configured) {
    return initialCheck;
  }

  if (initialCheck.initialized && !options?.forceSeed) {
    return {
      ...initialCheck,
      status: 'up_to_date',
      needsMigration: false,
      appliedInRun: [],
    };
  }

  // Ensure dbSchema.ts structures and initial documents are evaluated for parity
  const schemaTablesCount = Object.keys(JUSTPOSTGRES_CORE_SCHEMA).length;
  const initialDocs = buildInitialJustPostgresDocuments();

  if (typeof window !== 'undefined' && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/postgres/ensure-migrated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          coreOnly: Boolean(options?.coreOnly),
          forceSeed: Boolean(options?.forceSeed),
        }),
      });
      const json = await res.json().catch(() => null);
      const data = json?.data ?? null;

      if (res.ok && data) {
        const applied: string[] = Array.isArray(data.appliedMigrations)
          ? data.appliedMigrations
          : [];
        return {
          ok: true,
          status: applied.length > 0 ? 'applied' : 'up_to_date',
          configured: true,
          clientReady: initialCheck.clientReady,
          initialized: Boolean(data.initialized),
          needsMigration: !Boolean(data.initialized),
          endpointHost: initialCheck.endpointHost,
          servicesAnonCount: Number(data.collections?.services?.rowCount || initialCheck.servicesAnonCount),
          missingTables: [],
          unseededTables: [],
          schemaMigrationsReady: true,
          appliedVersionsCount: Math.max(
            initialCheck.appliedVersionsCount,
            applied.length || DB_MIGRATIONS.length
          ),
          appliedInRun: applied,
          collections: data.collections || initialCheck.collections,
          message:
            json?.message ||
            data.message ||
            `Applied dbSchema.ts (${schemaTablesCount} tables, ${initialDocs.services.length} services).`,
          checkedAt,
        };
      }

      // Fall back to initializeJustPostgresDatabase check report if admin endpoint declined
      const fallbackInit = await initializeJustPostgresDatabase({
        client: options?.client,
        triggerServerSeed: false,
      });

      return {
        ...initialCheck,
        ok: false,
        status: 'error',
        collections: fallbackInit.collections,
        message: json?.message || data?.message || 'Unable to apply JustPostgreSQL migrations.',
        checkedAt,
      };
    } catch (err: any) {
      return {
        ...initialCheck,
        ok: false,
        status: 'error',
        message: err?.message || 'Network error while running JustPostgreSQL migrations.',
        checkedAt,
      };
    }
  }

  return {
    ...initialCheck,
    ok: false,
    status: 'needs_migration',
    needsMigration: true,
    message: `JustPostgreSQL requires migration (${schemaTablesCount} tables / ${initialDocs.services.length} canonical services queued). Sign in as Super Admin to apply automatically.`,
    checkedAt,
  };
}

let activeStartupMigrationPromise: Promise<PostgresMigrationStatusReport> | null = null;
let lastStartupReport: PostgresMigrationStatusReport | null = null;
let lastCheckedWithAdmin = false;

/**
 * Startup entry point called from `App.tsx`.
 * Single-flight and idempotent:
 * - Resolves the `supabase` client and verifies core schema existence on startup.
 * - If structures or canonical core rows are missing and a verified admin session
 *   is active, automatically runs `runPostgresMigrations()` to apply `dbSchema.ts`.
 */
export async function checkAndRunPostgresMigrationsOnStartup(options?: {
  force?: boolean;
  isAdminSession?: boolean;
}): Promise<PostgresMigrationStatusReport> {
  const isAdminSession = Boolean(options?.isAdminSession);
  const upgradedToAdmin =
    isAdminSession && !lastCheckedWithAdmin && Boolean(lastStartupReport?.needsMigration);

  if (!options?.force && !upgradedToAdmin && lastStartupReport) {
    return lastStartupReport;
  }

  if (activeStartupMigrationPromise && !options?.force && !upgradedToAdmin) {
    return activeStartupMigrationPromise;
  }

  const run = (async () => {
    try {
      const status = await checkPostgresMigrationStatus({ force: Boolean(options?.force) });
      lastCheckedWithAdmin = isAdminSession;

      if (!status.configured) {
        lastStartupReport = status;
        return status;
      }

      if (status.needsMigration && isAdminSession) {
        const applied = await runPostgresMigrations();
        lastStartupReport = applied;
        return applied;
      }

      lastStartupReport = status;
      return status;
    } catch (err: any) {
      const fallback: PostgresMigrationStatusReport = {
        ok: false,
        status: 'error',
        configured: false,
        clientReady: false,
        initialized: false,
        needsMigration: false,
        endpointHost: '',
        servicesAnonCount: 0,
        missingTables: [...CORE_COLLECTION_NAMES],
        unseededTables: ['users', 'services', 'business_settings'],
        schemaMigrationsReady: false,
        appliedVersionsCount: 0,
        appliedInRun: [],
        collections: buildEmptyCollections(),
        message: err?.message || 'JustPostgreSQL startup migration check failed.',
        checkedAt: new Date().toISOString(),
      };
      lastStartupReport = fallback;
      return fallback;
    } finally {
      activeStartupMigrationPromise = null;
    }
  })();

  activeStartupMigrationPromise = run;
  return run;
}

export function getLastPostgresStartupMigrationReport(): PostgresMigrationStatusReport | null {
  return lastStartupReport;
}
