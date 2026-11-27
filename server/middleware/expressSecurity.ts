import crypto from 'node:crypto';
import type express from 'express';

const EXPRESS_RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_EXEMPT_PREFIXES = [
  '/api/health',
  '/api/webhooks/cashfree',
  '/api/v1/payments/webhook',
];

/**
 * Applies correlation request IDs and security headers aligned with Worker
 * `securityHeadersMiddleware` (`worker/middleware/security.ts`).
 */
export const expressSecurityHeadersMiddleware: express.RequestHandler = (req, res, next) => {
  const incomingReqId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
  const requestId =
    incomingReqId && /^[a-zA-Z0-9._:-]{6,64}$/.test(incomingReqId)
      ? incomingReqId
      : `req_${crypto.randomUUID()}`;

  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (req.path !== '/__/auth/iframe') {
    res.setHeader(
      'X-Frame-Options',
      req.path.startsWith('/__/auth/') ? 'SAMEORIGIN' : 'DENY'
    );
  }

  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  next();
};

/**
 * Lightweight bounded in-memory sliding bucket rate limiter for Express `/api/*` routes.
 * Mirrors Worker edge rate limiting while exempting health probes and Cashfree webhooks.
 */
export function createExpressRateLimiter(options?: {
  maxRequests?: number;
  windowMs?: number;
}): express.RequestHandler {
  const maxRequests = Math.max(10, options?.maxRequests ?? 120);
  const windowMs = Math.max(1_000, options?.windowMs ?? 60_000);

  return (req, res, next) => {
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    if (RATE_LIMIT_EXEMPT_PREFIXES.some((prefix) => fullPath.startsWith(prefix))) {
      return next();
    }

    const forwardedFor = typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : '';
    const ip =
      (typeof req.headers['cf-connecting-ip'] === 'string' ? req.headers['cf-connecting-ip'].trim() : '') ||
      forwardedFor ||
      req.ip ||
      'unknown';

    const routePrefix = fullPath.split('/').slice(0, 4).join('/');
    const key = `${ip}:${routePrefix}`;
    const now = Date.now();

    // Prevent unbounded growth under long-lived Node processes
    if (EXPRESS_RATE_BUCKETS.size > 5000) {
      for (const [bucketKey, bucketVal] of EXPRESS_RATE_BUCKETS.entries()) {
        if (now > bucketVal.resetAt) {
          EXPRESS_RATE_BUCKETS.delete(bucketKey);
        }
      }
    }

    const existing = EXPRESS_RATE_BUCKETS.get(key);
    if (!existing || now > existing.resetAt) {
      EXPRESS_RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      const requestId = String((req as any).requestId || `rl_${now}`);
      return res.status(429).json({
        success: false,
        status: 'REJECTED',
        message: 'Too many requests. Please wait a moment before retrying.',
        request_id: requestId,
        data: null,
        error_code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    return next();
  };
}
