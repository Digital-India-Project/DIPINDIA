/**
 * Shared URL & HTTP header safety helpers usable across browser, Node/Express,
 * and Cloudflare Worker runtimes without Node-only built-ins.
 */

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  'digitalindiaproject.com',
  'digitalindiaproject-portal.web.app',
  'digitalindiaproject-portal.firebaseapp.com',
];

function parseUrlSafe(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function isAllowedHost(hostname: string, extraAllowedHosts: string[] = []): boolean {
  const cleanHost = hostname.toLowerCase().trim();
  if (!cleanHost) return false;

  for (const suffix of DEFAULT_ALLOWED_HOST_SUFFIXES) {
    if (cleanHost === suffix || cleanHost.endsWith(`.${suffix}`)) {
      return true;
    }
  }

  for (const extra of extraAllowedHosts) {
    const cleanExtra = extra.toLowerCase().trim();
    if (!cleanExtra) continue;
    if (cleanHost === cleanExtra || cleanHost.endsWith(`.${cleanExtra}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates redirect / return URLs passed to Cashfree checkout or DigiLocker init
 * to block `javascript:`, `data:`, protocol-relative `//`, and untrusted third-party origins.
 */
export function validateSafeRedirectUrl(
  rawUrl: unknown,
  options?: {
    appDomain?: string;
    fallbackUrl?: string;
    allowHttpLocalhost?: boolean;
  }
): { valid: boolean; url: string; reason?: string } {
  const fallback = options?.fallbackUrl || '';
  const allowLocal = options?.allowHttpLocalhost ?? true;

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fallback
      ? { valid: true, url: fallback }
      : { valid: false, url: '', reason: 'Redirect URL is empty.' };
  }

  const trimmed = rawUrl.trim();
  if (/[\r\n\0]/.test(trimmed)) {
    return { valid: false, url: fallback, reason: 'Control characters are not allowed in redirect URLs.' };
  }

  // Relative same-origin path (must start with single `/` and never `//`)
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
      return { valid: false, url: fallback, reason: 'Protocol-relative redirect paths are disallowed.' };
    }
    if (options?.appDomain) {
      const base = options.appDomain.replace(/\/+$/, '');
      return { valid: true, url: `${base}${trimmed}` };
    }
    return { valid: true, url: trimmed };
  }

  const parsed = parseUrlSafe(trimmed);
  if (!parsed) {
    return { valid: false, url: fallback, reason: 'Malformed redirect URL.' };
  }

  const extraHosts: string[] = [];
  if (options?.appDomain) {
    const appParsed = parseUrlSafe(options.appDomain);
    if (appParsed?.hostname) extraHosts.push(appParsed.hostname);
  }

  if (parsed.protocol === 'https:') {
    if (isAllowedHost(parsed.hostname, extraHosts) || (allowLocal && isLoopbackHost(parsed.hostname))) {
      return { valid: true, url: parsed.toString() };
    }
    return {
      valid: false,
      url: fallback,
      reason: `Redirect host "${parsed.hostname}" is not in the trusted application allowlist.`,
    };
  }

  if (parsed.protocol === 'http:' && allowLocal && isLoopbackHost(parsed.hostname)) {
    return { valid: true, url: parsed.toString() };
  }

  return {
    valid: false,
    url: fallback,
    reason: `Redirect protocol "${parsed.protocol}" is not permitted.`,
  };
}

/**
 * Validates deliverable / certificate URLs stored on applications (`completionFileUrl`).
 * Permits relative `/api/...` routes or `https://...` URLs (and `http://localhost` in dev);
 * rejects `javascript:`, `data:`, `vbscript:`, `file:`, and protocol-relative links.
 */
export function isSafeDeliverableUrl(rawUrl: unknown, allowHttpLocalhost = true): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed)) return false;

  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//') && !trimmed.startsWith('/\\');
  }

  const parsed = parseUrlSafe(trimmed);
  if (!parsed) return false;

  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:' && allowHttpLocalhost && isLoopbackHost(parsed.hostname)) {
    return true;
  }
  return false;
}

/**
 * Sanitizes filenames used in HTTP `Content-Disposition` headers to prevent
 * header injection, path traversal, or malformed quotes.
 */
export function sanitizeContentDispositionFilename(
  rawName: unknown,
  fallback = 'download.bin'
): string {
  const raw = String(rawName || '')
    .split(/[\\/]/)
    .pop() || '';
  const cleaned = raw
    .replace(/[\r\n\0"']/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 140);
  return cleaned || fallback;
}
