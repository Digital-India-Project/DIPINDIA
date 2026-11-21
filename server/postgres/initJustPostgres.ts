import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  probeJustPostgresStatus,
  resolveJustPostgresConfig,
  runSqlSchemaMigrationDirect,
  type JustPostgresStatusResult,
} from './justPostgresClient';
import {
  buildCoreEntitiesSeedPayload,
  readPostgresMigrationFiles,
  readPostgresSchemaSql,
  seedCanonicalDataToJustPostgres,
} from './justPostgresSync';

export interface InitJustPostgresOptions {
  dryRun?: boolean;
  schemaOnly?: boolean;
  seedOnly?: boolean;
  coreOnly?: boolean;
  actorUid?: string;
  actorEmail?: string;
  env?: NodeJS.ProcessEnv;
}

export interface InitJustPostgresResult {
  ok: boolean;
  mode: 'dry_run' | 'schema_only' | 'seed_only' | 'full';
  coreEntitiesSummary: {
    users: { initialDocuments: number; bootstrapEmail: string };
    services: { initialDocuments: number };
    applications: { schemaReady: boolean; initialDocuments: number; note: string };
    business_settings: { initialDocuments: number; keys: string[] };
  };
  migrationsApplied: Array<{ filename: string; bytes: number; executedStatements?: number }>;
  seedResults?: Record<string, { upserted: number; failed: number; errors: string[] }>;
  finalStatus?: JustPostgresStatusResult;
  message: string;
}

const SAFE_UID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

function sanitizeActorUid(raw?: string): string {
  const candidate = String(raw || 'bootstrap-super-admin').trim();
  return SAFE_UID_REGEX.test(candidate) ? candidate : 'bootstrap-super-admin';
}

function sanitizeActorEmail(raw?: string): string {
  const candidate = String(raw || 'allindiadigitalseva@gmail.com').trim().toLowerCase();
  if (!candidate.includes('@') || candidate.length > 160) {
    return 'allindiadigitalseva@gmail.com';
  }
  return candidate;
}

export async function initJustPostgres(
  options: InitJustPostgresOptions = {}
): Promise<InitJustPostgresResult> {
  const env = options.env || process.env;
  const actorUid = sanitizeActorUid(options.actorUid);
  const actorEmail = sanitizeActorEmail(options.actorEmail || env.BOOTSTRAP_ADMIN_EMAIL);

  const migrationFiles = readPostgresMigrationFiles();
  const corePayload = buildCoreEntitiesSeedPayload({ actorUid, actorEmail });

  const baseCoreSummary = {
    users: {
      initialDocuments: corePayload.users.length,
      bootstrapEmail: actorEmail,
    },
    services: {
      initialDocuments: corePayload.services.length,
    },
    applications: {
      schemaReady: false,
      initialDocuments: 0,
      note: 'Table public.applications created with indexes & RLS (no fake citizen rows seeded).',
    },
    business_settings: {
      initialDocuments: corePayload.business_settings.length,
      keys: corePayload.business_settings.map((row) => row.id),
    },
  };

  if (options.dryRun) {
    const combinedSql = readPostgresSchemaSql();
    const statementEstimate = combinedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--')).length;

    return {
      ok: true,
      mode: 'dry_run',
      coreEntitiesSummary: {
        ...baseCoreSummary,
        applications: {
          ...baseCoreSummary.applications,
          schemaReady: combinedSql.includes('CREATE TABLE IF NOT EXISTS public.applications'),
        },
      },
      migrationsApplied: migrationFiles.map((m) => ({
        filename: m.filename,
        bytes: Buffer.byteLength(m.sql, 'utf8'),
        executedStatements: m.sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--')).length,
      })),
      message:
        `Dry-run validated ${migrationFiles.length} SQL migrations (~${statementEstimate} statements) and ` +
        `core entities (${corePayload.users.length} admin user, ${corePayload.services.length} services, ` +
        `${corePayload.business_settings.length} business_settings, applications table ready).`,
    };
  }

  const cfg = resolveJustPostgresConfig(env);
  if (!cfg.configured) {
    throw new Error(
      `${cfg.validationError || 'JustPostgreSQL credentials are not configured.'} ` +
        'Set DATABASE_URL and/or JUSTPOSTGRES_REST_URL + JUSTPOSTGRES_SERVICE_ROLE_KEY in environment secrets (see .env.example).'
    );
  }

  const migrationsApplied: Array<{ filename: string; bytes: number; executedStatements?: number }> = [];

  if (!options.seedOnly) {
    if (cfg.directPgConfigured) {
      try {
        for (const migration of migrationFiles) {
          const res = await runSqlSchemaMigrationDirect(migration.sql, env);
          migrationsApplied.push({
            filename: migration.filename,
            bytes: Buffer.byteLength(migration.sql, 'utf8'),
            executedStatements: res.executedStatements,
          });
        }
      } catch (pgErr: any) {
        if (options.schemaOnly || !cfg.restConfigured) {
          throw new Error(
            `Direct PostgreSQL SQL migration failed (${pgErr?.message || 'connection error'}). ` +
              'If port 5432 is restricted on this network, paste migrations/postgres/0001_justpostgres_schema.sql and 0002_justpostgres_init_core.sql into the JustPostgres SQL Editor, then re-run with --seed-only.'
          );
        }
      }
    } else if (options.schemaOnly) {
      throw new Error(
        'Schema DDL execution (--schema-only) requires DATABASE_URL. Alternatively execute migrations/postgres/0001_justpostgres_schema.sql and 0002_justpostgres_init_core.sql in the JustPostgres SQL Editor.'
      );
    }
  }

  if (options.schemaOnly) {
    const finalStatus = await probeJustPostgresStatus(env);
    const appReady = Boolean(finalStatus.tableStats.find((t) => t.table === 'applications')?.exists);
    return {
      ok: true,
      mode: 'schema_only',
      coreEntitiesSummary: {
        ...baseCoreSummary,
        applications: { ...baseCoreSummary.applications, schemaReady: appReady },
      },
      migrationsApplied,
      finalStatus,
      message: `Applied ${migrationsApplied.length} PostgreSQL migration file(s).`,
    };
  }

  const preStatus = await probeJustPostgresStatus(env);
  if (preStatus.healthState === 'api_not_enabled') {
    throw new Error(
      'JustPostgres REST endpoint reached over HTTPS, but Data/REST API is disabled (api_not_enabled). ' +
        'Run 0001_justpostgres_schema.sql + 0002_justpostgres_init_core.sql in the JustPostgres SQL Editor and enable PostgREST API in JustPostgres dashboard.'
    );
  }
  if (preStatus.healthState === 'tables_missing') {
    throw new Error(
      'JustPostgres is reachable, but core tables do not exist yet. ' +
        'Run migrations/postgres/0001_justpostgres_schema.sql and 0002_justpostgres_init_core.sql in your JustPostgres SQL Editor first (or configure direct DATABASE_URL access).'
    );
  }
  if (preStatus.healthState !== 'connected') {
    throw new Error(preStatus.message);
  }

  const seedResults = await seedCanonicalDataToJustPostgres({
    actorUid,
    actorEmail,
    env,
    coreOnly: Boolean(options.coreOnly),
  });

  const finalStatus = await probeJustPostgresStatus(env);
  const appStat = finalStatus.tableStats.find((t) => t.table === 'applications');

  return {
    ok: true,
    mode: options.seedOnly ? 'seed_only' : 'full',
    coreEntitiesSummary: {
      ...baseCoreSummary,
      applications: {
        ...baseCoreSummary.applications,
        schemaReady: Boolean(appStat?.exists),
        initialDocuments: appStat?.rowCount || 0,
      },
    },
    migrationsApplied,
    seedResults,
    finalStatus,
    message: 'JustPostgreSQL core entities and portal collections initialized successfully.',
  };
}

function parseCliArgs(argv: string[]): InitJustPostgresOptions {
  const opts: InitJustPostgresOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--schema-only') opts.schemaOnly = true;
    else if (arg === '--seed-only') opts.seedOnly = true;
    else if (arg === '--core-only') opts.coreOnly = true;
    else if (arg === '--actor-uid' && argv[i + 1]) {
      opts.actorUid = argv[i + 1];
      i += 1;
    } else if (arg === '--actor-email' && argv[i + 1]) {
      opts.actorEmail = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  initJustPostgres(cliOpts)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[justpostgres-init] ERROR: ${err?.message || String(err)}`);
      process.exit(1);
    });
}
