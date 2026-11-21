import { URL } from 'url';
import { Pool, type PoolConfig } from 'pg';

export const JUSTPOSTGRES_TABLES = [
  'services',
  'blog_posts',
  'business_settings',
  'admins',
  'users',
  'applications',
  'tracking_records',
  'operator_enrollments',
  'partners',
  'commission_ledger',
  'settlement_requests',
  'infra_bindings',
  'karta_files',
  'tools_configs',
  'workspace_audits',
  'api_sathi_verifications',
  'audit_logs',
  'backups',
] as const;

export type JustPostgresTable = (typeof JUSTPOSTGRES_TABLES)[number];

const ALLOWED_TABLE_SET = new Set<string>(JUSTPOSTGRES_TABLES);
const SAFE_COLUMN_REGEX = /^[a-z][a-z0-9_]{0,62}$/;

const PRIVATE_OR_LOOPBACK_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
];

export interface JustPostgresConfig {
  configured: boolean;
  directPgConfigured: boolean;
  restConfigured: boolean;
  databaseUrl: string;
  restUrl: string;
  endpointHost: string;
  hasServiceRoleKey: boolean;
  hasAnonKey: boolean;
  serviceRoleKey: string;
  anonKey: string;
  validationError?: string;
}

export interface JustPostgresTableStat {
  table: JustPostgresTable;
  rowCount: number;
  exists: boolean;
  error?: string;
}

export interface JustPostgresStatusResult {
  configured: boolean;
  directPgConfigured: boolean;
  restConfigured: boolean;
  hasServiceRoleKey: boolean;
  hasAnonKey: boolean;
  endpointHost: string;
  restUrl: string;
  transportMode: 'direct_pg' | 'rest_api' | 'unconfigured';
  healthState: 'connected' | 'api_not_enabled' | 'tables_missing' | 'unconfigured' | 'unreachable';
  message: string;
  tableStats: JustPostgresTableStat[];
  checkedAt: string;
}

export function assertAllowedPostgresTable(table: string): JustPostgresTable {
  const clean = String(table || '').trim();
  if (!ALLOWED_TABLE_SET.has(clean)) {
    throw new Error(`Disallowed PostgreSQL table name: ${clean}`);
  }
  return clean as JustPostgresTable;
}

function assertSafeColumnName(col: string): string {
  const clean = String(col || '').trim();
  if (!SAFE_COLUMN_REGEX.test(clean)) {
    throw new Error(`Invalid SQL column identifier: ${clean}`);
  }
  return clean;
}

export function validateRemoteRestUrl(rawUrl: string): URL {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:') {
    throw new Error('JUSTPOSTGRES_REST_URL must use https://');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_OR_LOOPBACK_HOST_PATTERNS.some((rx) => rx.test(hostname))) {
    throw new Error('JUSTPOSTGRES_REST_URL cannot point to loopback or private network addresses');
  }
  return parsed;
}

export function validatePostgresDatabaseUrl(rawUrl: string): URL {
  const trimmed = String(rawUrl || '').trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_OR_LOOPBACK_HOST_PATTERNS.some((rx) => rx.test(hostname))) {
    throw new Error('DATABASE_URL cannot point to loopback or private network addresses');
  }
  return parsed;
}

export function resolveJustPostgresConfig(env: NodeJS.ProcessEnv = process.env): JustPostgresConfig {
  const rawDbUrl = String(env.DATABASE_URL || '').trim();
  const rawRestUrl = String(env.JUSTPOSTGRES_REST_URL || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = String(env.JUSTPOSTGRES_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(env.JUSTPOSTGRES_ANON_KEY || '').trim();

  let directPgConfigured = false;
  let validDbUrl = '';
  let dbHost = '';
  let dbValidationError: string | undefined;

  if (rawDbUrl) {
    try {
      const parsedDb = validatePostgresDatabaseUrl(rawDbUrl);
      directPgConfigured = true;
      validDbUrl = rawDbUrl;
      dbHost = parsedDb.host;
    } catch (err: any) {
      dbValidationError = err?.message || 'Invalid DATABASE_URL.';
    }
  }

  let restConfigured = false;
  let validRestUrl = '';
  let restHost = '';
  let restValidationError: string | undefined;

  if (rawRestUrl) {
    try {
      const parsedRest = validateRemoteRestUrl(rawRestUrl);
      validRestUrl = parsedRest.toString().replace(/\/+$/, '');
      restHost = parsedRest.host;
      restConfigured = Boolean(serviceRoleKey);
      if (!serviceRoleKey) {
        restValidationError = 'JUSTPOSTGRES_SERVICE_ROLE_KEY is missing in server environment secrets.';
      }
    } catch (err: any) {
      restValidationError = err?.message || 'Invalid JUSTPOSTGRES_REST_URL.';
    }
  }

  const configured = directPgConfigured || restConfigured;
  return {
    configured,
    directPgConfigured,
    restConfigured,
    databaseUrl: validDbUrl,
    restUrl: validRestUrl,
    endpointHost: dbHost || restHost || '',
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasAnonKey: Boolean(anonKey),
    serviceRoleKey,
    anonKey,
    validationError: configured
      ? undefined
      : dbValidationError ||
        restValidationError ||
        'Configure DATABASE_URL or JUSTPOSTGRES_REST_URL + JUSTPOSTGRES_SERVICE_ROLE_KEY in server environment secrets.',
  };
}

let cachedPool: { url: string; pool: Pool } | null = null;

async function getPgPool(databaseUrl: string): Promise<Pool> {
  if (cachedPool && cachedPool.url === databaseUrl) {
    return cachedPool.pool;
  }
  if (cachedPool) {
    await cachedPool.pool.end().catch(() => {});
    cachedPool = null;
  }

  const baseConfig: PoolConfig = {
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false },
  };
  const pool = new Pool(baseConfig);
  try {
    await pool.query('SELECT 1');
    cachedPool = { url: databaseUrl, pool };
    return pool;
  } catch (sslErr: any) {
    await pool.end().catch(() => {});
    const msg = String(sslErr?.message || '').toLowerCase();
    if (msg.includes('does not support ssl') || msg.includes('ssl')) {
      const nonSslPool = new Pool({ ...baseConfig, ssl: false });
      try {
        await nonSslPool.query('SELECT 1');
        cachedPool = { url: databaseUrl, pool: nonSslPool };
        return nonSslPool;
      } catch (plainErr) {
        await nonSslPool.end().catch(() => {});
        throw plainErr;
      }
    }
    throw sslErr;
  }
}

function buildRestHeaders(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

async function fetchJustPostgresRest(
  cfg: JustPostgresConfig,
  relativePath: string,
  init: RequestInit = {}
): Promise<Response> {
  if (!cfg.restConfigured || !cfg.serviceRoleKey || !cfg.restUrl) {
    throw new Error(cfg.validationError || 'JustPostgres REST credentials are not configured.');
  }
  const target = `${cfg.restUrl}${relativePath.startsWith('/') ? relativePath : `/${relativePath}`}`;
  return fetch(target, {
    ...init,
    headers: {
      ...buildRestHeaders(cfg.serviceRoleKey),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function parseContentRangeTotal(contentRange: string | null): number {
  if (!contentRange) return 0;
  const slashIdx = contentRange.lastIndexOf('/');
  if (slashIdx === -1) return 0;
  const rawTotal = contentRange.slice(slashIdx + 1).trim();
  const parsed = Number(rawTotal);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function probeJustPostgresStatus(
  env: NodeJS.ProcessEnv = process.env
): Promise<JustPostgresStatusResult> {
  const cfg = resolveJustPostgresConfig(env);
  const checkedAt = new Date().toISOString();

  if (!cfg.configured) {
    return {
      configured: false,
      directPgConfigured: cfg.directPgConfigured,
      restConfigured: cfg.restConfigured,
      hasServiceRoleKey: cfg.hasServiceRoleKey,
      hasAnonKey: cfg.hasAnonKey,
      endpointHost: cfg.endpointHost,
      restUrl: cfg.restUrl,
      transportMode: 'unconfigured',
      healthState: 'unconfigured',
      message:
        cfg.validationError ||
        'Configure DATABASE_URL or JUSTPOSTGRES_REST_URL + JUSTPOSTGRES_SERVICE_ROLE_KEY in server environment secrets.',
      tableStats: [],
      checkedAt,
    };
  }

  let directError: string | null = null;
  if (cfg.directPgConfigured) {
    try {
      const pool = await getPgPool(cfg.databaseUrl);
      const tableCheck = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      const existingNames = new Set(tableCheck.rows.map((r) => r.table_name));
      const tableStats: JustPostgresTableStat[] = [];

      for (const table of JUSTPOSTGRES_TABLES) {
        if (!existingNames.has(table)) {
          tableStats.push({ table, rowCount: 0, exists: false, error: 'Table not created yet' });
          continue;
        }
        try {
          const cnt = await pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM public."${table}"`);
          tableStats.push({
            table,
            rowCount: Number(cnt.rows[0]?.c || 0),
            exists: true,
          });
        } catch (err: any) {
          tableStats.push({
            table,
            rowCount: 0,
            exists: false,
            error: err?.message || 'Count query failed',
          });
        }
      }

      const activeTables = tableStats.filter((t) => t.exists).length;
      return {
        configured: true,
        directPgConfigured: cfg.directPgConfigured,
        restConfigured: cfg.restConfigured,
        hasServiceRoleKey: cfg.hasServiceRoleKey,
        hasAnonKey: cfg.hasAnonKey,
        endpointHost: cfg.endpointHost,
        restUrl: cfg.restUrl,
        transportMode: 'direct_pg',
        healthState: activeTables === 0 ? 'tables_missing' : 'connected',
        message:
          activeTables === 0
            ? 'Connected to PostgreSQL session pool, but schema tables are missing. Click "Run Schema Migration" to create all 18 tables.'
            : `Connected to remote PostgreSQL session pool (${activeTables}/${JUSTPOSTGRES_TABLES.length} tables active).`,
        tableStats,
        checkedAt,
      };
    } catch (err: any) {
      directError = err?.message || 'Direct PostgreSQL TCP connection timed out or failed';
    }
  }

  if (cfg.restConfigured) {
    try {
      const probeRes = await fetchJustPostgresRest(cfg, '/services?select=id&limit=1', {
        method: 'GET',
        headers: { Prefer: 'count=exact', Range: '0-0' },
      });
      const probeText = await probeRes.text();
      let probeJson: any = null;
      try {
        probeJson = probeText ? JSON.parse(probeText) : null;
      } catch {
        probeJson = null;
      }

      if (probeRes.status === 404 && probeJson?.code === 'api_not_enabled') {
        return {
          configured: true,
          directPgConfigured: cfg.directPgConfigured,
          restConfigured: cfg.restConfigured,
          hasServiceRoleKey: cfg.hasServiceRoleKey,
          hasAnonKey: cfg.hasAnonKey,
          endpointHost: cfg.endpointHost,
          restUrl: cfg.restUrl,
          transportMode: 'rest_api',
          healthState: 'api_not_enabled',
          message:
            (directError ? `Direct TCP 5432 unavailable (${directError}); ` : '') +
            'JustPostgres REST endpoint reached over HTTPS, but Data/REST API is not enabled yet at this address (code: api_not_enabled). Enable REST API in your JustPostgres dashboard.',
          tableStats: [],
          checkedAt,
        };
      }

      const tableStats: JustPostgresTableStat[] = [];
      for (const table of JUSTPOSTGRES_TABLES) {
        try {
          const res = await fetchJustPostgresRest(cfg, `/${table}?select=id&limit=1`, {
            method: 'GET',
            headers: { Prefer: 'count=exact', Range: '0-0' },
          });
          if (res.ok) {
            tableStats.push({
              table,
              rowCount: parseContentRangeTotal(res.headers.get('content-range')),
              exists: true,
            });
          } else {
            const errText = await res.text().catch(() => '');
            tableStats.push({
              table,
              rowCount: 0,
              exists: false,
              error: `HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`,
            });
          }
        } catch (err: any) {
          tableStats.push({
            table,
            rowCount: 0,
            exists: false,
            error: err?.message || 'Probe failed',
          });
        }
      }

      const existingCount = tableStats.filter((t) => t.exists).length;
      if (existingCount === 0) {
        return {
          configured: true,
          directPgConfigured: cfg.directPgConfigured,
          restConfigured: cfg.restConfigured,
          hasServiceRoleKey: cfg.hasServiceRoleKey,
          hasAnonKey: cfg.hasAnonKey,
          endpointHost: cfg.endpointHost,
          restUrl: cfg.restUrl,
          transportMode: 'rest_api',
          healthState: 'tables_missing',
          message:
            'Connected to JustPostgres REST API, but platform tables were not found. Run migrations/postgres/0001_justpostgres_schema.sql in your JustPostgres SQL Editor.',
          tableStats,
          checkedAt,
        };
      }

      return {
        configured: true,
        directPgConfigured: cfg.directPgConfigured,
        restConfigured: cfg.restConfigured,
        hasServiceRoleKey: cfg.hasServiceRoleKey,
        hasAnonKey: cfg.hasAnonKey,
        endpointHost: cfg.endpointHost,
        restUrl: cfg.restUrl,
        transportMode: 'rest_api',
        healthState: 'connected',
        message: `Connected to remote JustPostgres REST API (${existingCount}/${JUSTPOSTGRES_TABLES.length} tables active).`,
        tableStats,
        checkedAt,
      };
    } catch (err: any) {
      return {
        configured: true,
        directPgConfigured: cfg.directPgConfigured,
        restConfigured: cfg.restConfigured,
        hasServiceRoleKey: cfg.hasServiceRoleKey,
        hasAnonKey: cfg.hasAnonKey,
        endpointHost: cfg.endpointHost,
        restUrl: cfg.restUrl,
        transportMode: 'rest_api',
        healthState: 'unreachable',
        message: err?.message || 'Unable to reach remote JustPostgres endpoint.',
        tableStats: [],
        checkedAt,
      };
    }
  }

  return {
    configured: true,
    directPgConfigured: cfg.directPgConfigured,
    restConfigured: cfg.restConfigured,
    hasServiceRoleKey: cfg.hasServiceRoleKey,
    hasAnonKey: cfg.hasAnonKey,
    endpointHost: cfg.endpointHost,
    restUrl: cfg.restUrl,
    transportMode: 'direct_pg',
    healthState: 'unreachable',
    message:
      directError
        ? `${directError}. Note: If TCP port 5432 is blocked or behind Cloudflare proxy, enable the HTTPS Data/REST API in JustPostgres and set JUSTPOSTGRES_REST_URL + JUSTPOSTGRES_SERVICE_ROLE_KEY.`
        : 'Unable to connect to remote PostgreSQL.',
    tableStats: [],
    checkedAt,
  };
}

export async function runSqlSchemaMigrationDirect(
  sqlText: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ executedStatements: number; message: string }> {
  const cfg = resolveJustPostgresConfig(env);
  if (!cfg.directPgConfigured) {
    throw new Error(
      'Direct PostgreSQL session URL (DATABASE_URL) is not configured. Copy 0001_justpostgres_schema.sql and run it in your JustPostgres SQL Editor.'
    );
  }
  const pool = await getPgPool(cfg.databaseUrl);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sqlText);
    await client.query('COMMIT');
    const stmtCount = sqlText
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--')).length;
    return {
      executedStatements: stmtCount,
      message: `Executed PostgreSQL schema migration (${stmtCount} statements applied).`,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertJustPostgresRows(
  tableInput: string,
  rows: Record<string, any>[],
  onConflict = 'id',
  env: NodeJS.ProcessEnv = process.env
): Promise<{ upserted: number; failed: number; errors: string[] }> {
  const table = assertAllowedPostgresTable(tableInput);
  const conflictCol = assertSafeColumnName(onConflict);
  const cfg = resolveJustPostgresConfig(env);
  if (!cfg.configured) {
    throw new Error(cfg.validationError || 'JustPostgres is not configured.');
  }

  if (cfg.directPgConfigured) {
    try {
      const pool = await getPgPool(cfg.databaseUrl);
      let upserted = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const cols = Object.keys(row).map(assertSafeColumnName);
        if (cols.length === 0) continue;
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        const updates = cols
          .filter((c) => c !== conflictCol)
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        const values = cols.map((c) => {
          const val = row[c];
          if (val !== null && typeof val === 'object') {
            return JSON.stringify(val);
          }
          return val;
        });

        const sql = updates
          ? `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`
          : `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO NOTHING`;

        try {
          await pool.query(sql, values);
          upserted += 1;
        } catch (err: any) {
          failed += 1;
          if (errors.length < 5) {
            errors.push(`${table} row error: ${err?.message || 'Unknown SQL error'}`);
          }
        }
      }
      return { upserted, failed, errors };
    } catch (directErr: any) {
      if (!cfg.restConfigured) {
        throw directErr;
      }
    }
  }

  let upserted = 0;
  let failed = 0;
  const errors: string[] = [];
  const CHUNK_SIZE = 50;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const params = new URLSearchParams({ on_conflict: conflictCol });
    const res = await fetchJustPostgresRest(cfg, `/${table}?${params.toString()}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });

    if (res.ok) {
      upserted += chunk.length;
    } else {
      failed += chunk.length;
      const errBody = await res.text().catch(() => '');
      errors.push(`${table} batch ${Math.floor(i / CHUNK_SIZE) + 1}: HTTP ${res.status} ${errBody.slice(0, 180)}`);
    }
  }

  return { upserted, failed, errors };
}

export async function exportJustPostgresTable(
  tableInput: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<Record<string, any>[]> {
  const table = assertAllowedPostgresTable(tableInput);
  const cfg = resolveJustPostgresConfig(env);
  if (!cfg.configured) {
    throw new Error(cfg.validationError || 'JustPostgres is not configured.');
  }

  if (cfg.directPgConfigured) {
    try {
      const pool = await getPgPool(cfg.databaseUrl);
      const res = await pool.query(`SELECT * FROM public."${table}" LIMIT 2000`);
      return res.rows || [];
    } catch (directErr: any) {
      if (!cfg.restConfigured) {
        throw directErr;
      }
    }
  }

  const params = new URLSearchParams({ select: '*', limit: '2000' });
  const res = await fetchJustPostgresRest(cfg, `/${table}?${params.toString()}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Export ${table} failed: HTTP ${res.status} ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
