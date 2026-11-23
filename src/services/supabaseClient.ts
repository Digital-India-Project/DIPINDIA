import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface JustPostgresClientConfig {
  configured: boolean;
  restUrl: string;
  anonKey: string;
  endpointHost: string;
  validationError?: string;
}

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

function validateRemoteHttpsUrl(rawUrl: string): URL {
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

function readEnvValue(key: 'JUSTPOSTGRES_REST_URL' | 'JUSTPOSTGRES_ANON_KEY'): string {
  const importMetaEnv =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? ((import.meta as any).env as Record<string, string | undefined>)
      : {};

  if (key === 'JUSTPOSTGRES_REST_URL') {
    const buildTimeVal =
      typeof process !== 'undefined' && process.env ? process.env.JUSTPOSTGRES_REST_URL : '';
    return String(
      importMetaEnv.VITE_JUSTPOSTGRES_REST_URL ||
        importMetaEnv.JUSTPOSTGRES_REST_URL ||
        buildTimeVal ||
        ''
    ).trim();
  }

  const buildTimeAnon =
    typeof process !== 'undefined' && process.env ? process.env.JUSTPOSTGRES_ANON_KEY : '';
  return String(
    importMetaEnv.VITE_JUSTPOSTGRES_ANON_KEY ||
      importMetaEnv.JUSTPOSTGRES_ANON_KEY ||
      buildTimeAnon ||
      ''
  ).trim();
}

export function resolveJustPostgresClientConfig(
  overrides?: { restUrl?: string; anonKey?: string }
): JustPostgresClientConfig {
  const rawRestUrl = String(overrides?.restUrl ?? readEnvValue('JUSTPOSTGRES_REST_URL'))
    .trim()
    .replace(/\/+$/, '');
  const anonKey = String(overrides?.anonKey ?? readEnvValue('JUSTPOSTGRES_ANON_KEY')).trim();

  if (!rawRestUrl) {
    return {
      configured: false,
      restUrl: '',
      anonKey: '',
      endpointHost: '',
      validationError:
        'JUSTPOSTGRES_REST_URL is not configured. Set JUSTPOSTGRES_REST_URL and JUSTPOSTGRES_ANON_KEY in environment secrets.',
    };
  }

  try {
    const parsed = validateRemoteHttpsUrl(rawRestUrl);
    if (!anonKey) {
      return {
        configured: false,
        restUrl: parsed.toString().replace(/\/+$/, ''),
        anonKey: '',
        endpointHost: parsed.host,
        validationError: 'JUSTPOSTGRES_ANON_KEY is not configured in environment secrets.',
      };
    }
    return {
      configured: true,
      restUrl: parsed.toString().replace(/\/+$/, ''),
      anonKey,
      endpointHost: parsed.host,
    };
  } catch (err: any) {
    return {
      configured: false,
      restUrl: '',
      anonKey: '',
      endpointHost: '',
      validationError: err?.message || 'Invalid JUSTPOSTGRES_REST_URL configuration.',
    };
  }
}

/**
 * Rewrites PostgREST paths emitted by @supabase/supabase-js (`/rest/v1/...`)
 * cleanly onto JustPostgreSQL scoped endpoints (e.g. `https://host/rest/<id>/...`)
 * while leaving standard root endpoints untouched.
 */
function createJustPostgresFetch(baseRestUrl: string): typeof fetch {
  const base = new URL(`${baseRestUrl}/`);
  const basePath = base.pathname.replace(/\/+$/, '');
  const isScopedJustPostgresRest = basePath.startsWith('/rest/') && basePath !== '/rest/v1';

  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isScopedJustPostgresRest) {
      return fetch(input, init);
    }
    try {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      const targetUrl = new URL(rawUrl);
      if (targetUrl.origin === base.origin) {
        const prefixWithV1 = `${basePath}/rest/v1`;
        if (targetUrl.pathname.startsWith(prefixWithV1)) {
          targetUrl.pathname = `${basePath}${targetUrl.pathname.slice(prefixWithV1.length)}`;
        }
      }
      if (typeof input === 'string' || input instanceof URL) {
        return fetch(targetUrl.toString(), init);
      }
      const nextRequest = new Request(targetUrl.toString(), input);
      return fetch(nextRequest, init);
    } catch {
      return fetch(input, init);
    }
  };
}

export function createJustPostgresSupabaseClient(
  restUrl: string,
  anonKey: string
): SupabaseClient {
  const normalizedUrl = `${restUrl.replace(/\/+$/, '')}/`;
  return createClient(normalizedUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: createJustPostgresFetch(normalizedUrl.replace(/\/+$/, '')),
    },
  });
}

const initialConfig = resolveJustPostgresClientConfig();

export const supabase: SupabaseClient | null = initialConfig.configured
  ? createJustPostgresSupabaseClient(initialConfig.restUrl, initialConfig.anonKey)
  : null;

let runtimeClientCache: SupabaseClient | null = supabase;
let runtimeConfigCache: JustPostgresClientConfig = initialConfig;
let runtimeResolvePromise: Promise<{
  client: SupabaseClient | null;
  config: JustPostgresClientConfig;
}> | null = null;

export function getJustPostgresClientConfig(): JustPostgresClientConfig {
  return runtimeConfigCache;
}

export function isJustPostgresClientConfigured(): boolean {
  return runtimeConfigCache.configured && runtimeClientCache !== null;
}

/**
 * Returns the initialized `supabase` client immediately when configured at build/env time,
 * or hydrates from the read-only `/api/postgres/client-config` server route (anon key only)
 * when environment secrets were set exclusively on the backend server.
 */
export async function resolveSupabaseClient(): Promise<{
  client: SupabaseClient | null;
  config: JustPostgresClientConfig;
}> {
  if (runtimeClientCache && runtimeConfigCache.configured) {
    return { client: runtimeClientCache, config: runtimeConfigCache };
  }
  if (typeof window === 'undefined') {
    return { client: runtimeClientCache, config: runtimeConfigCache };
  }
  if (runtimeResolvePromise) {
    return runtimeResolvePromise;
  }

  runtimeResolvePromise = (async () => {
    try {
      const res = await fetch('/api/postgres/client-config', { method: 'GET' });
      if (!res.ok) {
        return { client: runtimeClientCache, config: runtimeConfigCache };
      }
      const json = await res.json().catch(() => null);
      const data = json?.data ?? json;
      const cfg = resolveJustPostgresClientConfig({
        restUrl: data?.restUrl || '',
        anonKey: data?.anonKey || '',
      });
      if (cfg.configured) {
        runtimeConfigCache = cfg;
        runtimeClientCache = createJustPostgresSupabaseClient(cfg.restUrl, cfg.anonKey);
      }
      return { client: runtimeClientCache, config: runtimeConfigCache };
    } catch {
      return { client: runtimeClientCache, config: runtimeConfigCache };
    }
  })();

  return runtimeResolvePromise;
}
