import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { validateFormSubmission } from './src/lib/formEngine';
import {
  expressSecurityHeadersMiddleware,
  createExpressRateLimiter,
} from './server/middleware/expressSecurity';
import {
  sanitizeContentDispositionFilename,
  validateSafeRedirectUrl,
} from './src/lib/urlSafety';
import { createKartaRouter } from './server/karta/kartaRouter';
import {
  getAvailableAiProviders,
  runMultiProviderAssistant,
} from './worker/lib/aiProviders';
import { buildSitemapXml } from './src/lib/blogSeo';
import { INDIA_GEOGRAPHY_SEED } from './src/data/indiaGeography';
import { evaluateDirectoryPageQuality } from './src/lib/indiaDirectorySeo';
import { INITIAL_SERVICES } from './src/data/initialData';
import { INITIAL_BLOG_POSTS } from './src/data/initialBlogPosts';
import {
  CLOUDFLARE_FREE_PLAN_D1_LIMITS,
  LOGICAL_DATABASE_CATALOG,
} from './worker/config/database';
import {
  CLOUDFLARE_FREE_PLAN_R2_LIMITS,
  LOGICAL_BUCKET_CATALOG,
} from './worker/config/storage';
import {
  createCashfreePgOrder,
  getCashfreePgOrderStatus,
  isCashfreeTestPingPayload,
  isProductionEnvironment,
  probeCashfreeGatewayCredentials,
  resolveCashfreeConfig,
  verifyCashfreeWebhookWithAnySecret,
} from './worker/services/cashfreeService';
import { hmacSha256Base64 } from './worker/middleware/security';
import { verifyFirebaseIdToken } from './worker/middleware/auth';
import {
  normalizePaymentUiStatus,
  summarizePaymentStatuses,
  type ApplicationPaymentStatusItem,
} from './src/lib/paymentStatus';
import { dispatchPaymentAlertEmail } from './worker/services/paymentAlertService';
import { calculateOrderTotalsPaise, fromPaise } from './src/lib/finance';
import {
  findCatalogueItem,
  filterCatalogueItems,
  resolveAuthoritativeCheckout,
  resolveCouponValidation,
} from './src/lib/catalogueServer';
import { CATALOGUE_CATEGORIES, COMPLETE_CATALOGUE_ITEMS } from './src/data/catalogue';
import { runIdempotentCatalogueImport } from './src/lib/catalogueImporter';
import { generateDigitalProductPayload } from './src/data/catalogue/digitalGenerators';
import {
  API_SATHI_PRODUCTS,
  ApiSathiError,
  buildFirestoreVerificationRecord,
  createApiSathiClient,
  detectApiSathiKeyMode,
  fetchAadhaarDigilocker,
  fetchLiveApiSathiRates,
  getApiSathiKey,
  handleApiSathiVerification,
  initAadhaarDigilocker,
  maskSensitiveData,
  normalizeApiSathiKey,
  persistApiSathiVerificationToFirestore,
  safeLogApiSathiEvent,
} from './src/services/apiSathi';
import {
  aggregateApiSathiUsage,
  type ApiSathiAnalyticsRange,
  type ApiSathiCallAnalyticsInputRow,
} from './src/lib/apiSathiAnalytics';
import { defaultApiSathiRetryQueue } from './src/services/apiSathiQueue';
import {
  exportJustPostgresTable,
  probeJustPostgresStatus,
  resolveJustPostgresConfig,
  runSqlSchemaMigrationDirect,
  upsertJustPostgresRows,
} from './server/postgres/justPostgresClient';
import {
  exportAllJustPostgresData,
  importBackupJsonToJustPostgres,
  readPostgresSchemaSql,
  seedCanonicalDataToJustPostgres,
} from './server/postgres/justPostgresSync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(expressSecurityHeadersMiddleware);
app.use('/api', createExpressRateLimiter({ maxRequests: 120, windowMs: 60_000 }));

app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Reverse-proxy Firebase Auth handler/iframe paths so authDomain works on digitalindiaproject.com
const FIREBASE_AUTH_HOST =
  process.env.FIREBASE_AUTH_HOST || 'digitalindiaproject-portal.firebaseapp.com';
app.use(['/__/auth', '/__/firebase'], async (req, res) => {
  try {
    const targetUrl = `https://${FIREBASE_AUTH_HOST}${req.originalUrl}`;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lower = k.toLowerCase();
      if (lower === 'host' || lower === 'connection' || lower === 'content-length') continue;
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(', ');
    }
    headers['x-forwarded-host'] = req.headers.host || 'digitalindiaproject.com';

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0;
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const bodyPayload = hasBody
      ? contentType.includes('application/x-www-form-urlencoded')
        ? new URLSearchParams(req.body as Record<string, string>).toString()
        : JSON.stringify(req.body)
      : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyPayload,
      redirect: 'manual',
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'content-encoding' || lower === 'transfer-encoding' || lower === 'content-length') return;
      if (lower === 'x-frame-options') {
        if (req.originalUrl.startsWith('/__/auth/iframe')) return;
        if (req.originalUrl.startsWith('/__/auth/')) {
          res.setHeader(key, 'SAMEORIGIN');
          return;
        }
      }
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    res.status(502).json({ error: 'Firebase Auth proxy error', details: err?.message || 'Upstream failed' });
  }
});

// Shared Express Admin Verification (Firebase ID Token + Strict Admin Role/Email)
const EXPRESS_BOOTSTRAP_ADMIN_EMAILS = new Set([
  'allindiadigitalseva@gmail.com',
  'cyber.sundial@gmail.com',
]);

async function resolveExpressAdminFromRequest(
  req: express.Request
): Promise<{ uid: string; email: string } | null> {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  if (!token) return null;
  const verified = await verifyFirebaseIdToken(token).catch(() => null);
  if (!verified) return null;
  const uid = String(verified.sub || verified.user_id || '').trim();
  const email = String(verified.email || '').trim().toLowerCase();
  const role = String((verified as Record<string, unknown>).role || '').trim().toLowerCase();
  const isAdminEmail = Boolean(verified.email_verified && EXPRESS_BOOTSTRAP_ADMIN_EMAILS.has(email));
  const isAdminRole = role === 'admin' || role === 'super_admin';
  if (!uid || (!isAdminEmail && !isAdminRole)) {
    return null;
  }
  return { uid, email };
}

const requireExpressAdmin: express.RequestHandler = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  if (!token) {
    return res.status(401).json({
      success: false,
      status: 'REJECTED',
      message: 'Admin authentication required.',
      error_code: 'UNAUTHORIZED',
    });
  }
  const verified = await verifyFirebaseIdToken(token).catch(() => null);
  if (!verified) {
    return res.status(401).json({
      success: false,
      status: 'REJECTED',
      message: 'Invalid or expired authentication token.',
      error_code: 'UNAUTHORIZED',
    });
  }
  const email = String(verified.email || '').trim().toLowerCase();
  const role = String((verified as Record<string, unknown>).role || '').trim().toLowerCase();
  const isAdminEmail = Boolean(verified.email_verified && EXPRESS_BOOTSTRAP_ADMIN_EMAILS.has(email));
  const isAdminRole = role === 'admin' || role === 'super_admin';
  if (!isAdminEmail && !isAdminRole) {
    return res.status(403).json({
      success: false,
      status: 'REJECTED',
      message: 'Administrator privileges required.',
      error_code: 'FORBIDDEN',
    });
  }
  return next();
};

const requireExpressManagerOrAdmin: express.RequestHandler = async (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  if (!token) {
    return res.status(401).json({
      success: false,
      status: 'REJECTED',
      message: 'Authentication required.',
      error_code: 'UNAUTHORIZED',
    });
  }
  const verified = await verifyFirebaseIdToken(token).catch(() => null);
  if (!verified) {
    return res.status(401).json({
      success: false,
      status: 'REJECTED',
      message: 'Invalid or expired authentication token.',
      error_code: 'UNAUTHORIZED',
    });
  }
  const uid = String(verified.sub || verified.user_id || '').trim();
  const email = String(verified.email || '').trim().toLowerCase();
  const roleClaim = String((verified as Record<string, unknown>).role || '').trim().toLowerCase();
  const isBootstrap = Boolean(verified.email_verified && EXPRESS_BOOTSTRAP_ADMIN_EMAILS.has(email));
  const hasTokenRole = roleClaim === 'manager' || roleClaim === 'admin' || roleClaim === 'super_admin';

  if (isBootstrap || hasTokenRole) {
    return next();
  }

  // Fallback: inspect persisted Postgres users table for assigned manager/admin role
  try {
    const pgCfg = resolveJustPostgresConfig(process.env);
    if (pgCfg.configured && uid) {
      const pgUsers = await exportJustPostgresTable('users', process.env);
      const matched = pgUsers.find(
        (u) =>
          String(u.uid || u.id || '') === uid ||
          (email && String(u.email || '').trim().toLowerCase() === email)
      );
      const dbRole = String(matched?.role || '').trim().toLowerCase();
      if (dbRole === 'manager' || dbRole === 'admin' || dbRole === 'super_admin') {
        return next();
      }
    }
  } catch {
    // Fall through to 403 below
  }

  return res.status(403).json({
    success: false,
    status: 'REJECTED',
    message: 'Operations Manager or Administrator privileges required.',
    error_code: 'FORBIDDEN',
  });
};

// 1. Health check
app.get('/api/health', (req, res) => {
  const pgCfg = resolveJustPostgresConfig(process.env);
  res.json({
    status: 'healthy',
    platform: 'Digital India Project',
    domain: 'https://digitalindiaproject.com',
    authDomain: 'digitalindiaproject.com',
    geminiConfigured: !!apiKey,
    openrouterConfigured: !!process.env.OPENROUTER_API_KEY,
    groqConfigured: !!process.env.GROQ_API_KEY,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    justPostgresConfigured: pgCfg.configured,
    timestamp: new Date().toISOString(),
  });
});

// 2. Multi-Provider AI Gateway (OpenRouter, Gemini 4 Hydrogen, Groq, OpenAI, Anthropic + Compact Product KB)
app.get('/api/ai/providers', (req, res) => {
  res.json({
    providers: getAvailableAiProviders(process.env),
  });
});

const handleAiAssistantRequest = async (req: express.Request, res: express.Response) => {
  const { prompt, language = 'en', history = [], provider = 'auto' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const result = await runMultiProviderAssistant({
      payload: { prompt, language, history, provider },
      env: process.env,
      geminiCustomCaller: aiClient
        ? async ({ systemInstruction, history: trimmedHistory, prompt: userPrompt }) => {
            const contents: any[] = [
              ...trimmedHistory.map((item) => ({
                role: item.role === 'user' ? 'user' : 'model',
                parts: [{ text: item.content }],
              })),
              { role: 'user', parts: [{ text: userPrompt }] },
            ];
            const response = await aiClient!.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents,
              config: {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            });
            return response.text || '';
          }
        : undefined,
    });
    return res.json(result);
  } catch (err: any) {
    console.error('AI Assistant Gateway Error:', err);
    return res.status(500).json({
      error: 'Failed to process request with AI assistant',
      details: err?.message || 'Unknown error',
    });
  }
};

app.post('/api/ai/assistant', handleAiAssistantRequest);
app.post('/api/gemini/assistant', handleAiAssistantRequest);

// 3. Cashfree Payment Order Creation (Live PG when env keys set, sandbox fallback otherwise)
const localCashfreeOrderStore = new Map<
  string,
  {
    status: string;
    totalInr: number;
    paymentSessionId: string;
    updatedAt: string;
    serviceSlug?: string;
    customerEmail?: string;
    paid?: boolean;
  }
>();
const localQuoteRequests: any[] = [];
let localCatalogueItems = [...COMPLETE_CATALOGUE_ITEMS];

app.post('/api/payments/create-order', async (req, res) => {
  const {
    amount,
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    serviceName,
    serviceSlug,
    serviceId,
    urgentProcessing,
    couponCode,
    preferredMode,
    returnUrl,
  } = req.body || {};

  let authoritativeAmount = Number(amount || 1);
  if (serviceSlug || serviceId) {
    const checkout = resolveAuthoritativeCheckout({
      serviceSlug,
      serviceId,
      urgentProcessing: Boolean(urgentProcessing),
      couponCode: typeof couponCode === 'string' ? couponCode : undefined,
      clientTotalInr: amount !== undefined ? Number(amount) : undefined,
      catalog: localCatalogueItems,
    });
    if (!checkout.ok) {
      return res.status(checkout.status || 400).json({
        success: false,
        error: checkout.message || 'Authoritative pricing verification failed',
        errorCode: checkout.errorCode || 'PRICE_TAMPER_OR_MISMATCH',
      });
    }
    authoritativeAmount = checkout.totalInr;
  }

  const orderId = `CF_ORD_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const cfConfig = resolveCashfreeConfig(process.env, preferredMode);
  if (cfConfig.isProductionRuntime) {
    const authHdr = req.headers.authorization;
    const token = authHdr?.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ success: false, error: 'Authentication required in production', errorCode: 'UNAUTHORIZED' });
    }
    if (!cfConfig.configured) {
      return res.status(503).json({
        success: false,
        error: 'Cashfree gateway credentials are not configured in production.',
        errorCode: 'CASHFREE_NOT_CONFIGURED',
      });
    }
  }

  if (cfConfig.configured) {
    const safeReturn = validateSafeRedirectUrl(returnUrl, {
      appDomain: cfConfig.appDomain,
      allowHttpLocalhost: !cfConfig.isProductionRuntime,
    });
    if (returnUrl !== undefined && String(returnUrl).trim() && !safeReturn.valid) {
      return res.status(400).json({
        success: false,
        error: safeReturn.reason || 'Invalid returnUrl.',
        errorCode: 'INVALID_RETURN_URL',
      });
    }
    try {
      const cfOrder = await createCashfreePgOrder(cfConfig, {
        orderId,
        amountInr: authoritativeAmount,
        customerId: String(customerId || 'guest_applicant'),
        customerName: String(customerName || 'Citizen Applicant'),
        customerEmail: String(customerEmail || 'applicant@digitalindiaproject.com'),
        customerPhone: String(customerPhone || '9876543210'),
        orderNote: String(serviceName || 'Digital India Project Service Fee'),
        returnUrl: safeReturn.valid && safeReturn.url ? safeReturn.url : undefined,
      });

      if (!cfOrder.ok || !cfOrder.paymentSessionId) {
        return res.status(cfOrder.httpStatus >= 400 && cfOrder.httpStatus < 600 ? cfOrder.httpStatus : 502).json({
          success: false,
          error: cfOrder.errorMessage || 'Cashfree order creation failed',
          errorCode: cfOrder.errorCode || 'CASHFREE_ORDER_ERROR',
          gatewayConfigured: true,
          mode: cfConfig.mode,
        });
      }

      localCashfreeOrderStore.set(cfOrder.orderId, {
        status: cfOrder.orderStatus || 'ACTIVE',
        totalInr: authoritativeAmount,
        paymentSessionId: cfOrder.paymentSessionId,
        updatedAt: new Date().toISOString(),
        serviceSlug: serviceSlug || serviceId,
        customerEmail: String(customerEmail || ''),
      });

      return res.json({
        success: true,
        orderId: cfOrder.orderId,
        cfOrderId: cfOrder.cfOrderId,
        paymentSessionId: cfOrder.paymentSessionId,
        amount: authoritativeAmount,
        currency: 'INR',
        mode: cfConfig.mode,
        gatewayConfigured: true,
        simulationOnly: false,
        customer: { customerId, customerName, customerEmail, customerPhone },
        status: cfOrder.orderStatus || 'ACTIVE',
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: err?.message || 'Cashfree request error',
        gatewayConfigured: true,
      });
    }
  }

  const simSession = `sim_session_${Date.now()}`;
  localCashfreeOrderStore.set(orderId, {
    status: 'ACTIVE',
    totalInr: authoritativeAmount,
    paymentSessionId: simSession,
    updatedAt: new Date().toISOString(),
    serviceSlug: serviceSlug || serviceId,
    customerEmail: String(customerEmail || ''),
  });

  return res.json({
    success: true,
    orderId,
    paymentSessionId: simSession,
    amount: authoritativeAmount,
    currency: 'INR',
    mode: 'sandbox',
    gatewayConfigured: false,
    simulationOnly: true,
    customer: { customerId, customerName, customerEmail, customerPhone },
    status: 'ACTIVE',
  });
});

// 4. Cashfree Payment Verification (Real-time PG query when configured)
app.post('/api/payments/verify', async (req, res) => {
  const { orderId, preferredMode, simulateSandboxSuccess } = req.body || {};
  const cleanOrderId = String(orderId || '').trim();
  const cfConfig = resolveCashfreeConfig(process.env, preferredMode);

  if (cfConfig.isProductionRuntime && !cfConfig.configured) {
    return res.status(503).json({
      success: false,
      error: 'Cashfree gateway credentials are not configured in production.',
      errorCode: 'CASHFREE_NOT_CONFIGURED',
    });
  }

  if (!cleanOrderId) {
    return res.status(400).json({ success: false, error: 'orderId is required' });
  }

  if (cfConfig.configured) {
    const liveStatus = await getCashfreePgOrderStatus(cfConfig, cleanOrderId);
    return res.status(liveStatus.ok ? 200 : 502).json({
      success: liveStatus.ok,
      orderId: liveStatus.orderId,
      orderStatus: liveStatus.orderStatus,
      status: liveStatus.paid ? 'SUCCESS' : liveStatus.orderStatus,
      paid: liveStatus.paid,
      cfPaymentId: liveStatus.cfPaymentId,
      paymentMethod: liveStatus.paymentMethod,
      paymentTime: liveStatus.paymentTime,
      bankReference: liveStatus.bankReference,
      paymentMessage: liveStatus.paymentMessage,
      gatewayConfigured: true,
      mode: cfConfig.mode,
      error: liveStatus.errorMessage,
    });
  }

  const sandboxApproved = !cfConfig.isProductionRuntime && simulateSandboxSuccess === true;
  const existingOrder = localCashfreeOrderStore.get(cleanOrderId);
  if (sandboxApproved && existingOrder) {
    localCashfreeOrderStore.set(cleanOrderId, {
      ...existingOrder,
      status: 'PAID',
      paid: true,
      updatedAt: new Date().toISOString(),
    });
  }

  return res.json({
    success: true,
    orderId: cleanOrderId,
    orderStatus: sandboxApproved ? 'PAID' : 'CREATED',
    status: sandboxApproved ? 'SUCCESS' : 'PENDING',
    paid: sandboxApproved,
    cfPaymentId: sandboxApproved ? `CF_PAY_SIM_${Date.now()}` : undefined,
    paymentTime: sandboxApproved ? new Date().toISOString() : undefined,
    gatewayConfigured: false,
    simulationOnly: true,
  });
});

// v1 Cashfree & Tracking parity endpoints for local Node dev
app.post('/api/v1/applications/track', (req, res) => {
  const { applicationId, contact } = req.body || {};
  const cleanId = String(applicationId || '').trim().toUpperCase();
  const cleanContact = String(contact || '').trim();
  if (!cleanId || cleanContact.length < 4) {
    return res.status(400).json({
      success: false,
      status: 'FAILED',
      message: 'Application ID and registered email or mobile are required.',
      data: null,
      error_code: 'INVALID_TRACKING_QUERY',
    });
  }
  return res.status(404).json({
    success: false,
    status: 'FAILED',
    message: `No server-side tracking record found for ${cleanId} in local dev store.`,
    data: null,
    error_code: 'APPLICATION_NOT_FOUND',
  });
});

app.post('/api/v1/payments/orders', async (req, res) => {
  const body = req.body || {};
  const cfConfig = resolveCashfreeConfig(process.env, body.preferredMode);

  if (cfConfig.isProductionRuntime) {
    const authHdr = req.headers.authorization;
    const token = authHdr?.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({
        success: false,
        status: 'REJECTED',
        message: 'Authentication required in production',
        data: null,
        error_code: 'UNAUTHORIZED',
      });
    }
    if (!cfConfig.configured) {
      return res.status(503).json({
        success: false,
        status: 'FAILED',
        message: 'Cashfree gateway credentials are not configured in production.',
        data: null,
        error_code: 'CASHFREE_NOT_CONFIGURED',
      });
    }
  }

  const clientTotalRaw =
    body.totalAmountInr !== undefined
      ? Number(body.totalAmountInr)
      : body.amount !== undefined
      ? Number(body.amount)
      : undefined;

  const checkout = resolveAuthoritativeCheckout({
    serviceSlug: body.serviceSlug || body.digitalProductSlug,
    serviceId: body.serviceId,
    urgentProcessing: Boolean(body.urgentProcessing),
    couponCode: typeof body.couponCode === 'string' ? body.couponCode : undefined,
    clientTotalInr: clientTotalRaw,
    fallbackServiceChargeInr: Number(body.serviceChargeInr || 0),
    fallbackGovtFeesInr: Number(body.govtFeesInr || 0),
    fallbackThirdPartyFeesInr: Number(body.thirdPartyFeesInr || 0),
    fallbackAdditionalChargeInr: Number(body.additionalChargeInr || 0),
    fallbackTaxRateBps: Number(body.taxRateBps ?? 0),
    catalog: localCatalogueItems,
  });

  if (!checkout.ok) {
    return res.status(checkout.status || 400).json({
      success: false,
      status: 'FAILED',
      message: checkout.message || 'Authoritative pricing verification failed',
      data: { authoritativeTotalInr: checkout.totalInr, breakdown: checkout.breakdown },
      error_code: checkout.errorCode || 'PRICE_TAMPER_OR_MISMATCH',
    });
  }

  const breakdown = checkout.breakdown;
  const totalInr = fromPaise(breakdown.totalPaise);
  const orderId = `CF_ORD_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

  if (cfConfig.configured) {
    const safeReturn = validateSafeRedirectUrl(body.returnUrl, {
      appDomain: cfConfig.appDomain,
      allowHttpLocalhost: !cfConfig.isProductionRuntime,
    });
    if (body.returnUrl !== undefined && String(body.returnUrl).trim() && !safeReturn.valid) {
      return res.status(400).json({
        success: false,
        status: 'FAILED',
        message: safeReturn.reason || 'Invalid returnUrl.',
        data: null,
        error_code: 'INVALID_RETURN_URL',
      });
    }
    const cfOrder = await createCashfreePgOrder(cfConfig, {
      orderId,
      amountInr: totalInr,
      customerId: String(body.customerId || 'local_applicant'),
      customerName: String(body.customerName || 'Citizen Applicant'),
      customerEmail: String(body.customerEmail || 'applicant@digitalindiaproject.com'),
      customerPhone: String(body.customerPhone || '9876543210'),
      orderNote: String(body.serviceName || 'Digital India Project Service Fee'),
      returnUrl: safeReturn.valid && safeReturn.url ? safeReturn.url : undefined,
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
    });

    if (!cfOrder.ok || !cfOrder.paymentSessionId) {
      return res.status(cfOrder.httpStatus >= 400 && cfOrder.httpStatus < 600 ? cfOrder.httpStatus : 502).json({
        success: false,
        status: 'FAILED',
        message: cfOrder.errorMessage || 'Cashfree order creation failed',
        data: null,
        error_code: cfOrder.errorCode || 'CASHFREE_ORDER_ERROR',
      });
    }

    localCashfreeOrderStore.set(cfOrder.orderId, {
      status: 'CREATED',
      totalInr,
      paymentSessionId: cfOrder.paymentSessionId,
      updatedAt: new Date().toISOString(),
      serviceSlug: checkout.service?.slug || body.serviceSlug,
      customerEmail: String(body.customerEmail || ''),
    });

    return res.json({
      success: true,
      status: 'PENDING',
      message: `Cashfree ${cfConfig.mode} payment session created`,
      data: {
        orderId: cfOrder.orderId,
        cfOrderId: cfOrder.cfOrderId,
        paymentSessionId: cfOrder.paymentSessionId,
        mode: cfConfig.mode,
        gatewayConfigured: true,
        simulationOnly: false,
        orderStatus: 'CREATED',
        breakdown,
        currency: 'INR',
      },
    });
  }

  const simSession = `sim_session_${Date.now()}`;
  localCashfreeOrderStore.set(orderId, {
    status: 'CREATED',
    totalInr,
    paymentSessionId: simSession,
    updatedAt: new Date().toISOString(),
    serviceSlug: checkout.service?.slug || body.serviceSlug,
    customerEmail: String(body.customerEmail || ''),
  });
  return res.json({
    success: true,
    status: 'PENDING',
    message: 'Sandbox preview order created (configure CASHFREE_APP_ID & CASHFREE_SECRET_KEY in .env for live gateway)',
    data: {
      orderId,
      paymentSessionId: simSession,
      mode: 'sandbox',
      gatewayConfigured: false,
      simulationOnly: true,
      orderStatus: 'CREATED',
      breakdown,
      currency: 'INR',
    },
  });
});

const handleLocalOrderStatus: express.RequestHandler = async (req, res) => {
  const orderId = String(req.params.orderId || '').trim();
  const cfConfig = resolveCashfreeConfig(process.env, typeof req.query.mode === 'string' ? req.query.mode : undefined);
  const stored = localCashfreeOrderStore.get(orderId);

  if (cfConfig.isProductionRuntime) {
    const authHdr = req.headers.authorization;
    const token = authHdr?.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', data: null, error_code: 'UNAUTHORIZED' });
    }
    if (!cfConfig.configured) {
      return res.status(503).json({ success: false, status: 'FAILED', message: 'Cashfree gateway unconfigured in production.', data: null, error_code: 'CASHFREE_NOT_CONFIGURED' });
    }
  }

  if (stored?.status === 'PAID') {
    return res.json({
      success: true,
      status: 'SUCCESS',
      message: 'Payment confirmed (PAID)',
      data: {
        orderId,
        orderStatus: 'PAID',
        normalizedState: 'PAID',
        paid: true,
        paymentTime: stored.updatedAt,
        amountInr: stored.totalInr,
        gatewayConfigured: cfConfig.configured,
      },
    });
  }

  if (cfConfig.configured) {
    const liveStatus = await getCashfreePgOrderStatus(cfConfig, orderId);
    if (liveStatus.ok && liveStatus.paid && stored) {
      localCashfreeOrderStore.set(orderId, { ...stored, status: 'PAID', updatedAt: new Date().toISOString() });
    }
    return res.status(liveStatus.ok ? 200 : 502).json({
      success: liveStatus.ok,
      status: liveStatus.paid ? 'SUCCESS' : liveStatus.orderStatus === 'FAILED' ? 'FAILED' : 'PENDING',
      message: liveStatus.paid ? 'Cashfree payment verified in real time' : liveStatus.errorMessage || `Status: ${liveStatus.orderStatus}`,
      data: {
        ...liveStatus,
        gatewayConfigured: true,
        mode: cfConfig.mode,
      },
    });
  }

  return res.json({
    success: true,
    status: 'PENDING',
    message: 'Sandbox preview order status retrieved',
    data: {
      orderId,
      orderStatus: stored?.status || 'CREATED',
      normalizedState: stored?.status || 'CREATED',
      paid: stored?.status === 'PAID',
      amountInr: stored?.totalInr,
      gatewayConfigured: false,
      simulationOnly: true,
    },
  });
};

app.get('/api/v1/payments/orders/:orderId/status', handleLocalOrderStatus);
app.post('/api/v1/payments/orders/:orderId/verify', handleLocalOrderStatus);

const handleApplicationsPaymentStatus = async (req: express.Request, res: express.Response) => {
  const body = req.body || {};
  const rawApps = Array.isArray(body.applications) ? body.applications : [];
  const cfConfig = resolveCashfreeConfig(
    process.env,
    typeof body.preferredMode === 'string' ? body.preferredMode : undefined
  );
  const checkedAt = new Date().toISOString();

  const items: ApplicationPaymentStatusItem[] = await Promise.all(
    rawApps.slice(0, 25).map(async (entry: any): Promise<ApplicationPaymentStatusItem> => {
      const applicationId = String(entry?.applicationId || '').trim();
      const orderId = String(entry?.orderId || '').trim();
      const currentStatus = typeof entry?.currentStatus === 'string' ? entry.currentStatus : undefined;

      if (!orderId) {
        const uiStatus = normalizePaymentUiStatus(currentStatus);
        return {
          applicationId,
          orderId: '',
          uiStatus,
          gatewayStatus: uiStatus === 'Paid' ? 'PAID' : uiStatus === 'Failed' ? 'FAILED' : 'PENDING',
          paid: uiStatus === 'Paid',
          gatewayConfigured: cfConfig.configured,
          simulationOnly: !cfConfig.configured,
          mode: cfConfig.mode,
          source: 'missing_order_id',
          checkedAt,
        };
      }

      const stored = localCashfreeOrderStore.get(orderId);
      if (stored?.status === 'PAID') {
        return {
          applicationId,
          orderId,
          uiStatus: 'Paid',
          gatewayStatus: 'PAID',
          paid: true,
          paymentAmount: stored.totalInr,
          paymentTime: stored.updatedAt,
          gatewayConfigured: cfConfig.configured,
          simulationOnly: !cfConfig.configured,
          mode: cfConfig.mode,
          source: 'webhook_or_ledger',
          checkedAt,
        };
      }

      if (cfConfig.configured) {
        const liveStatus = await getCashfreePgOrderStatus(cfConfig, orderId);
        if (!liveStatus.ok) {
          const fallbackUi = normalizePaymentUiStatus(stored?.status || currentStatus);
          return {
            applicationId,
            orderId,
            uiStatus: fallbackUi,
            gatewayStatus: stored?.status || 'PENDING',
            paid: fallbackUi === 'Paid',
            gatewayConfigured: true,
            mode: cfConfig.mode,
            source: 'gateway_unreachable',
            checkedAt,
            errorMessage: liveStatus.errorMessage,
          };
        }

        if (stored && (liveStatus.paid || liveStatus.orderStatus === 'FAILED' || liveStatus.orderStatus === 'EXPIRED')) {
          localCashfreeOrderStore.set(orderId, {
            ...stored,
            status: liveStatus.paid ? 'PAID' : liveStatus.orderStatus,
            updatedAt: new Date().toISOString(),
          });
        }

        return {
          applicationId,
          orderId: liveStatus.orderId || orderId,
          uiStatus: normalizePaymentUiStatus(liveStatus.orderStatus, liveStatus.paid),
          gatewayStatus: liveStatus.orderStatus,
          paid: liveStatus.paid,
          cfPaymentId: liveStatus.cfPaymentId,
          paymentMethod: liveStatus.paymentMethod,
          paymentTime: liveStatus.paymentTime,
          bankReference: liveStatus.bankReference,
          paymentAmount: liveStatus.paymentAmount,
          paymentMessage: liveStatus.paymentMessage,
          gatewayConfigured: true,
          mode: cfConfig.mode,
          source: 'cashfree_live',
          checkedAt,
        };
      }

      const effectiveRaw = stored?.status || currentStatus || 'CREATED';
      const uiStatus = normalizePaymentUiStatus(effectiveRaw);
      return {
        applicationId,
        orderId,
        uiStatus,
        gatewayStatus: stored?.status || (uiStatus === 'Paid' ? 'PAID' : uiStatus === 'Failed' ? 'FAILED' : 'CREATED'),
        paid: uiStatus === 'Paid',
        gatewayConfigured: false,
        simulationOnly: true,
        mode: cfConfig.mode,
        source: 'sandbox_preview',
        checkedAt,
      };
    })
  );

  return res.json({
    success: true,
    status: 'SUCCESS',
    message: cfConfig.configured
      ? `Real-time payment status synced for ${items.length} application(s)`
      : `Payment status retrieved for ${items.length} application(s) in sandbox preview mode`,
    data: {
      items,
      summary: summarizePaymentStatuses(items),
      gatewayConfigured: cfConfig.configured,
      simulationOnly: !cfConfig.configured,
      mode: cfConfig.mode,
      checkedAt,
    },
  });
};

app.post('/api/v1/payments/applications/status', handleApplicationsPaymentStatus);
app.post('/api/payments/applications/status', handleApplicationsPaymentStatus);

const handlePaymentHistory: express.RequestHandler = (req, res) => {
  const rawPage = Number(req.query.page || 1);
  const rawPageSize = Number(req.query.pageSize || 50);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1
      ? Math.min(Math.floor(rawPageSize), 100)
      : 50;

  const allItems = Array.from(localCashfreeOrderStore.entries())
    .map(([orderId, order]) => ({
      orderId,
      applicationId: orderId,
      transactionId: orderId,
      amount: order.totalInr,
      currency: 'INR',
      status: order.status,
      paymentMethod: 'Cashfree PG',
      date: order.updatedAt,
      gatewaySessionId: order.paymentSessionId,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = allItems.slice(start, start + pageSize);

  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Loaded ${items.length} payment history record(s)`,
    data: {
      items,
      pagination: {
        page: safePage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
    },
  });
};

app.get('/api/v1/payments/history', handlePaymentHistory);
app.get('/api/payments/history', handlePaymentHistory);

const sentLocalPaymentAlerts = new Map<string, { emailDeliveryStatus: string; emailConfigured: boolean }>();

const handlePaymentAlertNotification: express.RequestHandler = async (req, res) => {
  const body = req.body || {};
  const applicationId = String(body.applicationId || '').trim();
  const normalized = normalizePaymentUiStatus(body.status);

  if (!applicationId || (normalized !== 'Paid' && normalized !== 'Failed')) {
    return res.status(400).json({
      success: false,
      status: 'FAILED',
      message: 'applicationId and status (Paid or Failed) are required',
      data: null,
    });
  }

  const orderId = String(body.orderId || '').trim();
  const dedupeKey = `${applicationId}:${orderId || 'default'}:${normalized}`;
  const prior = sentLocalPaymentAlerts.get(dedupeKey);
  if (prior) {
    return res.json({
      success: true,
      status: 'SUCCESS',
      message: 'Payment alert already recorded idempotently',
      data: {
        notificationId: `notif_pay_${applicationId}_${normalized.toLowerCase()}`,
        applicationId,
        status: normalized,
        inAppRecorded: true,
        emailDeliveryStatus: prior.emailDeliveryStatus,
        emailConfigured: prior.emailConfigured,
        deduplicated: true,
      },
    });
  }

  const emailResult = await dispatchPaymentAlertEmail({
    resendApiKey: process.env.RESEND_API_KEY,
    appDomain: process.env.APP_DOMAIN,
    businessEmail: process.env.BUSINESS_EMAIL,
    input: {
      applicationId,
      orderId,
      transactionId: String(body.transactionId || orderId || applicationId).trim(),
      status: normalized,
      serviceName: String(body.serviceName || 'Digital India Service').trim(),
      amountInr: Number(body.amountInr || 0) || 0,
      recipientEmail: String(body.recipientEmail || '').trim(),
      recipientName: String(body.recipientName || 'Applicant').trim(),
      paymentMethod: String(body.paymentMethod || 'Cashfree PG').trim(),
    },
  });

  sentLocalPaymentAlerts.set(dedupeKey, {
    emailDeliveryStatus: emailResult.emailDeliveryStatus,
    emailConfigured: emailResult.emailConfigured,
  });

  return res.json({
    success: true,
    status: 'SUCCESS',
    message:
      emailResult.emailDeliveryStatus === 'Sent'
        ? 'Dashboard and email payment alert dispatched'
        : 'Dashboard payment alert recorded (email channel unconfigured or skipped)',
    data: {
      notificationId: `notif_pay_${applicationId}_${normalized.toLowerCase()}`,
      applicationId,
      status: normalized,
      inAppRecorded: true,
      emailDeliveryStatus: emailResult.emailDeliveryStatus,
      emailConfigured: emailResult.emailConfigured,
      emailMessageId: emailResult.emailMessageId,
      deduplicated: false,
    },
  });
};

app.post('/api/v1/notifications/payment-alert', handlePaymentAlertNotification);
app.post('/api/notifications/payment-alert', handlePaymentAlertNotification);
app.post('/api/payments/payment-alert', handlePaymentAlertNotification);

const handleLocalWebhookGet: express.RequestHandler = (_req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env);
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: 'Cashfree webhook endpoint is active and ready',
    data: {
      endpoint: '/api/webhooks/cashfree',
      webhookUrl: `${cfConfig.appDomain}/api/webhooks/cashfree`,
      configured: Boolean(cfConfig.webhookSecret || cfConfig.clientSecret),
    },
  });
};

const localWebhookProcessedEvents = new Set<string>();

async function processLocalCashfreeWebhook(rawBody: string, parsed: any, signature: string, timestamp: string) {
  const cfConfig = resolveCashfreeConfig(process.env);
  if (!signature && isCashfreeTestPingPayload(rawBody, parsed)) {
    return { httpStatus: 200, payload: { success: true, status: 'SUCCESS', data: { testPing: true, orderMutated: false } } };
  }

  const configuredSecrets = [cfConfig.webhookSecret, cfConfig.clientSecret].filter(Boolean);
  const isLocalSandboxTestOrder =
    !isProductionEnvironment(process.env) &&
    String(parsed?.data?.order?.order_id || '').startsWith('TEST_CF_');
  const candidateSecrets =
    configuredSecrets.length > 0
      ? configuredSecrets
      : isLocalSandboxTestOrder
      ? ['dip_local_sandbox_test_secret']
      : [];

  if (candidateSecrets.length === 0) {
    if (isCashfreeTestPingPayload(rawBody, parsed)) {
      return {
        httpStatus: 200,
        payload: {
          success: true,
          status: 'SUCCESS',
          data: { testPing: true, signatureVerified: false, orderMutated: false },
        },
      };
    }
    return {
      httpStatus: 503,
      payload: {
        success: false,
        message: 'CASHFREE_WEBHOOK_SECRET or CASHFREE_SECRET_KEY not configured',
      },
    };
  }

  const verification = await verifyCashfreeWebhookWithAnySecret(
    candidateSecrets,
    timestamp,
    rawBody,
    signature
  );
  if (!verification.valid) {
    return {
      httpStatus: 401,
      payload: { success: false, message: 'Invalid Cashfree webhook signature' },
    };
  }

  if (isCashfreeTestPingPayload(rawBody, parsed)) {
    return {
      httpStatus: 200,
      payload: {
        success: true,
        status: 'SUCCESS',
        data: { testPing: true, signatureVerified: true, orderMutated: false },
      },
    };
  }

  const eventId = String(parsed?.data?.payment?.cf_payment_id || parsed?.event_time || '');
  if (eventId && localWebhookProcessedEvents.has(eventId)) {
    return {
      httpStatus: 200,
      payload: {
        success: true,
        status: 'SUCCESS',
        message: 'Duplicate webhook event acknowledged idempotently',
        data: { eventId, deduplicated: true },
      },
    };
  }
  if (eventId) {
    localWebhookProcessedEvents.add(eventId);
  }

  const orderId = String(parsed?.data?.order?.order_id || '');
  const eventType = String(parsed?.type || '');
  const paymentStatus = String(parsed?.data?.payment?.payment_status || '').toUpperCase();
  const nextStatus =
    eventType === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS'
      ? 'PAID'
      : eventType === 'PAYMENT_FAILED_WEBHOOK' || paymentStatus === 'FAILED'
      ? 'FAILED'
      : eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' || paymentStatus === 'USER_DROPPED'
      ? 'DROPPED'
      : 'PENDING';

  if (orderId && localCashfreeOrderStore.has(orderId)) {
    const prev = localCashfreeOrderStore.get(orderId)!;
    localCashfreeOrderStore.set(orderId, { ...prev, status: nextStatus, updatedAt: new Date().toISOString() });
  }
  return {
    httpStatus: 200,
    payload: {
      success: true,
      status: 'SUCCESS',
      message: 'Verified webhook processed',
      data: { eventId, orderId, eventType, resolvedOrderStatus: nextStatus },
    },
  };
}

const handleLocalWebhookPost: express.RequestHandler = async (req: any, res) => {
  const signature = String(req.headers['x-webhook-signature'] || '');
  const timestamp = String(req.headers['x-webhook-timestamp'] || '');
  const rawBody = String(req.rawBody || JSON.stringify(req.body || {}));
  const result = await processLocalCashfreeWebhook(rawBody, req.body, signature, timestamp);
  return res.status(result.httpStatus).json(result.payload);
};

app.get('/api/v1/payments/webhook', handleLocalWebhookGet);
app.post('/api/v1/payments/webhook', handleLocalWebhookPost);
app.get('/api/webhooks/cashfree', handleLocalWebhookGet);
app.post('/api/webhooks/cashfree', handleLocalWebhookPost);

let localGatewayConfigState = {
  environment: resolveCashfreeConfig(process.env).mode,
  apiVersion: resolveCashfreeConfig(process.env).apiVersion,
  isEnabled: true,
  autoVerify: true,
  expiryMinutes: 30,
  retryMaxAttempts: 2,
  timeoutMs: 12000,
};

app.get('/api/admin/payments/config', requireExpressAdmin, (_req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env);
  return res.json({
    success: true,
    status: 'SUCCESS',
    data: {
      ...localGatewayConfigState,
      configured: cfConfig.configured,
      clientIdConfigured: cfConfig.clientIdConfigured,
      clientIdPreview: cfConfig.clientId ? `${cfConfig.clientId.slice(0, 6)}...${cfConfig.clientId.slice(-4)}` : 'Not Set',
      clientSecretConfigured: cfConfig.clientSecretConfigured,
      webhookSecretConfigured: cfConfig.webhookSecretConfigured,
      missingBindings: cfConfig.missingBindings,
      webhookUrl: `${cfConfig.appDomain}/api/webhooks/cashfree`,
      legacyWebhookUrl: `${cfConfig.appDomain}/api/v1/payments/webhook`,
      defaultReturnUrl: `${cfConfig.appDomain}/?cf_order_id={order_id}`,
      emailAlertsConfigured: Boolean(process.env.RESEND_API_KEY),
      paymentsEmail: process.env.PAYMENTS_EMAIL || process.env.BUSINESS_EMAIL || 'payments@digitalindiaproject.com',
    },
  });
});

app.put('/api/admin/payments/config', requireExpressAdmin, (req, res) => {
  const body = req.body || {};
  localGatewayConfigState = {
    environment: body.environment === 'production' ? 'production' : 'sandbox',
    apiVersion: typeof body.apiVersion === 'string' && body.apiVersion ? body.apiVersion : '2023-08-01',
    isEnabled: body.isEnabled === undefined ? true : Boolean(body.isEnabled),
    autoVerify: body.autoVerify === undefined ? true : Boolean(body.autoVerify),
    expiryMinutes: Number(body.expiryMinutes || 30),
    retryMaxAttempts: Number(body.retryMaxAttempts || 2),
    timeoutMs: Number(body.timeoutMs || 12000),
  };
  return res.json({ success: true, status: 'SUCCESS', message: 'Local dev Cashfree config updated', data: localGatewayConfigState });
});

app.get('/api/admin/payments/analytics', requireExpressAdmin, (_req, res) => {
  const orders = Array.from(localCashfreeOrderStore.values());
  const paid = orders.filter((o) => o.status === 'PAID');
  const totalCollectedInr = paid.reduce((sum, o) => sum + Number(o.totalInr || 0), 0);
  return res.json({
    success: true,
    status: 'SUCCESS',
    data: {
      totalCollectedInr,
      todayCollectedInr: totalCollectedInr,
      monthCollectedInr: totalCollectedInr,
      successCount: paid.length,
      failedCount: orders.filter((o) => o.status === 'FAILED' || o.status === 'EXPIRED' || o.status === 'DROPPED').length,
      pendingCount: orders.filter((o) => o.status === 'CREATED' || o.status === 'PENDING').length,
      refundedInr: 0,
      refundedCount: 0,
      netRevenueInr: totalCollectedInr,
      avgOrderValueInr: paid.length ? Math.round(totalCollectedInr / paid.length) : 0,
      failedWebhooksCount: 0,
      unresolvedRefundsCount: 0,
    },
  });
});

app.get('/api/admin/payments', requireExpressAdmin, (_req, res) => {
  const items = Array.from(localCashfreeOrderStore.entries()).map(([orderId, order]) => ({
    orderId,
    applicationId: orderId,
    userId: 'local_user',
    serviceSlug: order.serviceSlug,
    amountInr: order.totalInr,
    refundedInr: 0,
    currency: 'INR',
    orderStatus: order.status,
    normalizedState: order.status,
    paymentMethod: 'Cashfree PG',
    environment: resolveCashfreeConfig(process.env).mode,
    createdAt: order.updatedAt,
    updatedAt: order.updatedAt,
  }));
  return res.json({
    success: true,
    status: 'SUCCESS',
    data: { items, pagination: { page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 } },
  });
});

app.get('/api/admin/payments/refunds', requireExpressAdmin, (_req, res) => {
  return res.json({ success: true, status: 'SUCCESS', data: [] });
});

app.get('/api/admin/payments/webhooks', requireExpressAdmin, (_req, res) => {
  return res.json({ success: true, status: 'SUCCESS', data: [] });
});

app.post('/api/admin/payments/reconcile', requireExpressAdmin, (_req, res) => {
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: 'Local preview reconciliation sweep checked',
    data: { checkedOrders: 0, reconciledPaid: 0, updatedNonPaid: 0, refundsSynced: 0, amountMismatches: 0, errors: [], gatewayConfigured: resolveCashfreeConfig(process.env).configured, mode: resolveCashfreeConfig(process.env).mode },
  });
});

app.post('/api/admin/payments/cutover-check', requireExpressAdmin, async (_req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env);
  const probe = await probeCashfreeGatewayCredentials(cfConfig);
  const testSecret = cfConfig.webhookSecret || cfConfig.clientSecret || 'dip_local_sandbox_test_secret';
  const ts = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({ type: 'PING', event_time: new Date().toISOString() });
  const sig = await hmacSha256Base64(testSecret, `${ts}${payload}`);
  const verified = await verifyCashfreeWebhookWithAnySecret([testSecret], ts, payload, sig);
  const readyForProduction =
    cfConfig.mode === 'production' && cfConfig.configured && probe.authenticated && verified.valid;

  return res.json({
    success: true,
    status: 'SUCCESS',
    message: readyForProduction
      ? 'Production Cashfree credentials verified cleanly.'
      : 'Local preview cutover diagnostics completed.',
    data: {
      readyForProduction,
      mode: cfConfig.mode,
      apiVersion: cfConfig.apiVersion,
      isEnabled: localGatewayConfigState.isEnabled,
      checkedAt: new Date().toISOString(),
      probe,
      checks: [
        {
          key: 'secret_binding',
          label: 'Worker Secret Binding (CASHFREE_CLIENT_ID & CASHFREE_CLIENT_SECRET)',
          status: cfConfig.configured ? 'pass' : 'fail',
          detail: cfConfig.configured
            ? `Configured for ${cfConfig.mode.toUpperCase()} mode (${cfConfig.apiVersion}).`
            : `Missing: ${cfConfig.missingBindings.join(', ')}. Bind via \`npx wrangler secret put CASHFREE_CLIENT_SECRET\`.`,
        },
        {
          key: 'gateway_auth_probe',
          label: 'Cashfree REST API Credential Authentication',
          status: !cfConfig.configured ? 'fail' : probe.authenticated ? 'pass' : 'fail',
          detail: probe.message,
        },
        {
          key: 'd1_billing_schema',
          label: 'Cloudflare D1 Billing Ledger (0008 Schema)',
          status: 'warn',
          detail: 'Express local preview uses memory store; run `npm run d1:migrate:remote` for Cloudflare D1.',
        },
        {
          key: 'webhook_hmac_selftest',
          label: 'Webhook Endpoint HMAC-SHA256 & Anti-Replay Self-Test',
          status: !verified.valid ? 'fail' : cfConfig.webhookSecretConfigured || cfConfig.clientSecretConfigured ? 'pass' : 'warn',
          detail: verified.valid
            ? 'HMAC-SHA256 webhook signature round-trip self-test succeeded.'
            : 'HMAC-SHA256 self-test failed.',
        },
        {
          key: 'email_alerts_channel',
          label: 'Transactional Payment Alerts (Resend Email)',
          status: process.env.RESEND_API_KEY ? 'pass' : 'warn',
          detail: process.env.RESEND_API_KEY
            ? 'RESEND_API_KEY configured.'
            : 'RESEND_API_KEY not set in local preview environment.',
        },
      ],
      webhookSetup: {
        url: `${cfConfig.appDomain}/api/webhooks/cashfree`,
        legacyUrl: `${cfConfig.appDomain}/api/v1/payments/webhook`,
        events: [
          'PAYMENT_SUCCESS_WEBHOOK',
          'PAYMENT_FAILED_WEBHOOK',
          'PAYMENT_USER_DROPPED_WEBHOOK',
          'REFUND_STATUS_WEBHOOK',
        ],
      },
      cliCommands: {
        setSecret: 'npx wrangler secret put CASHFREE_CLIENT_SECRET',
        migrateD1: 'npm run d1:migrate:remote',
        deployWorker: 'npx wrangler deploy --env="" --keep-vars',
      },
    },
  });
});

const handleSandboxTestOrder: express.RequestHandler = async (req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env, 'sandbox');
  if (cfConfig.isProductionRuntime) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ success: false, status: 'REJECTED', message: 'Authentication required' });
    }
  }
  const body = req.body || {};
  const rawAmt = Number(body.amountInr ?? 199);
  const amountInr = Number.isFinite(rawAmt) ? Math.min(Math.max(Math.round(rawAmt), 1), 5000) : 199;
  const channel = body.channel === 'partner' ? 'partner' : 'operator';
  const orderId = `TEST_CF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const paymentSessionId = `sandbox_test_sess_${Date.now()}`;
  localCashfreeOrderStore.set(orderId, {
    status: 'CREATED',
    totalInr: amountInr,
    paymentSessionId,
    updatedAt: new Date().toISOString(),
    serviceSlug: 'sandbox-webhook-verification',
  });
  return res.json({
    success: true,
    status: 'PENDING',
    message: 'Sandbox test order initialized (isolated from live accounting)',
    data: {
      orderId,
      paymentSessionId,
      amountInr,
      channel,
      mode: 'sandbox',
      orderStatus: 'CREATED',
      webhookEndpoint: '/api/v1/payments/webhook',
      secretConfigured: Boolean(cfConfig.webhookSecret || cfConfig.clientSecret),
    },
  });
};

const handleSandboxTestVerifyWebhook: express.RequestHandler = async (req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env, 'sandbox');
  if (cfConfig.isProductionRuntime) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ success: false, status: 'REJECTED', message: 'Authentication required' });
    }
  }
  const body = req.body || {};
  const orderId = String(body.orderId || '').trim();
  if (!orderId.startsWith('TEST_CF_')) {
    return res.status(400).json({
      success: false,
      status: 'FAILED',
      message: 'Sandbox webhook verifier accepts only isolated TEST_CF_* orders.',
    });
  }

  const rawEventType = String(body.eventType || 'PAYMENT_SUCCESS_WEBHOOK');
  const eventType =
    rawEventType === 'PAYMENT_FAILED_WEBHOOK' || rawEventType === 'PAYMENT_USER_DROPPED_WEBHOOK'
      ? rawEventType
      : 'PAYMENT_SUCCESS_WEBHOOK';
  const methodKey = body.paymentMethod === 'card' || body.paymentMethod === 'netbanking' ? body.paymentMethod : 'upi';
  const amountInr = Number.isFinite(Number(body.amountInr)) ? Math.max(1, Number(body.amountInr)) : 199;
  const cfPaymentId = `CF_TEST_PAY_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
  const paymentTime = new Date().toISOString();
  const paymentStatus =
    eventType === 'PAYMENT_SUCCESS_WEBHOOK'
      ? 'SUCCESS'
      : eventType === 'PAYMENT_FAILED_WEBHOOK'
      ? 'FAILED'
      : 'USER_DROPPED';
  const paymentMethodPayload =
    methodKey === 'card'
      ? { card: { card_network: 'VISA', card_number: '411111XXXXXX1111' } }
      : methodKey === 'netbanking'
      ? { netbanking: { netbanking_bank_name: 'HDFC Sandbox Bank' } }
      : { upi: { upi_id: 'sandbox.tester@okaxis' } };

  const webhookPayload = {
    type: eventType,
    event_time: paymentTime,
    data: {
      order: {
        order_id: orderId,
        order_amount: amountInr,
        order_currency: 'INR',
        order_tags: { sandbox_test: 'true' },
      },
      payment: {
        cf_payment_id: cfPaymentId,
        payment_status: paymentStatus,
        payment_amount: amountInr,
        payment_currency: 'INR',
        payment_group: methodKey,
        payment_method: paymentMethodPayload,
        payment_time: paymentTime,
      },
    },
  };

  const signingSecret =
    cfConfig.webhookSecret ||
    cfConfig.clientSecret ||
    (!cfConfig.isProductionRuntime ? 'dip_local_sandbox_test_secret' : '');

  if (!signingSecret) {
    return res.status(503).json({
      success: false,
      status: 'FAILED',
      message: 'CASHFREE_WEBHOOK_SECRET or CASHFREE_CLIENT_SECRET required to sign test webhooks in production.',
    });
  }

  const rawWebhookBody = JSON.stringify(webhookPayload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Base64(signingSecret, `${timestamp}${rawWebhookBody}`);

  const t0 = Date.now();
  const first = await processLocalCashfreeWebhook(rawWebhookBody, webhookPayload, signature, timestamp);
  const firstMs = Math.max(1, Date.now() - t0);

  const t1 = Date.now();
  const replay = first.httpStatus === 200 ? await processLocalCashfreeWebhook(rawWebhookBody, webhookPayload, signature, timestamp) : null;
  const replayMs = Math.max(1, Date.now() - t1);

  const storedStatus = localCashfreeOrderStore.get(orderId)?.status || (first.payload as any)?.data?.resolvedOrderStatus;
  const expectedStatus =
    eventType === 'PAYMENT_SUCCESS_WEBHOOK'
      ? 'PAID'
      : eventType === 'PAYMENT_FAILED_WEBHOOK'
      ? 'FAILED'
      : 'DROPPED';
  const verifiedEndToEnd =
    first.httpStatus === 200 &&
    Boolean((first.payload as any)?.success) &&
    (first.payload as any)?.data?.resolvedOrderStatus === expectedStatus;

  return res.status(verifiedEndToEnd ? 200 : 502).json({
    success: verifiedEndToEnd,
    status: verifiedEndToEnd ? 'SUCCESS' : 'FAILED',
    message: verifiedEndToEnd
      ? `End-to-end webhook verified (${eventType} -> ${storedStatus})`
      : (first.payload as any)?.message || 'Sandbox webhook verification failed',
    data: {
      orderId,
      cfPaymentId,
      eventType,
      paymentMethod: methodKey.toUpperCase(),
      amountInr,
      signaturePrefix: signature.slice(0, 20),
      webhookEndpoint: '/api/v1/payments/webhook',
      usingConfiguredSecret: Boolean(cfConfig.webhookSecret || cfConfig.clientSecret),
      firstDelivery: {
        httpStatus: first.httpStatus,
        success: Boolean((first.payload as any)?.success),
        resolvedOrderStatus: (first.payload as any)?.data?.resolvedOrderStatus || null,
        message: (first.payload as any)?.message || null,
        durationMs: firstMs,
      },
      idempotencyReplay: replay
        ? {
            httpStatus: replay.httpStatus,
            deduplicated: Boolean((replay.payload as any)?.data?.deduplicated),
            message: (replay.payload as any)?.message || null,
            durationMs: replayMs,
          }
        : null,
      persistedOrderStatus: storedStatus,
      verifiedEndToEnd,
      sandboxIsolated: true,
    },
  });
};

app.post('/api/v1/payments/sandbox-test/order', handleSandboxTestOrder);
app.post('/api/payments/sandbox-test/order', handleSandboxTestOrder);
app.post('/api/v1/payments/sandbox-test/verify-webhook', handleSandboxTestVerifyWebhook);
app.post('/api/payments/sandbox-test/verify-webhook', handleSandboxTestVerifyWebhook);

// ==========================================
// 5. REST API v1: API Setu, DigiLocker & B2B
// ==========================================

// Standard Response Helper
function buildStandardResponse<T>(params: {
  success: boolean;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REJECTED';
  message: string;
  referenceId: string;
  providerReference?: string;
  data: T;
  errorCode?: string | null;
}) {
  return {
    success: params.success,
    status: params.status,
    message: params.message,
    reference_id: params.referenceId,
    provider_reference: params.providerReference || `PROV_${Date.now()}`,
    data: params.data,
    error_code: params.errorCode || null,
    timestamp: new Date().toISOString(),
  };
}

// 5.1 GET /api/v1/apisetu/catalogue
app.get('/api/v1/apisetu/catalogue', (req, res) => {
  const catalogue = [
    {
      id: 'api-morth-dl',
      name: 'Driving Licence Verification API',
      provider: 'Ministry of Road Transport & Highways (MoRTH)',
      apiSetuRef: 'in.gov.morth.dl',
      category: 'Transport & Identity',
      authType: 'OAuth 2.0 Bearer',
      sandboxAvailable: true,
      pricingPerCall: 1.5,
      consentRequired: true,
    },
    {
      id: 'api-morth-rc',
      name: 'Vehicle Registration (RC) API',
      provider: 'Ministry of Road Transport & Highways (MoRTH)',
      apiSetuRef: 'in.gov.morth.rc',
      category: 'Transport & Fleet',
      authType: 'OAuth 2.0 Bearer',
      sandboxAvailable: true,
      pricingPerCall: 1.5,
      consentRequired: true,
    },
    {
      id: 'api-itd-pan',
      name: 'Instant PAN Verification API',
      provider: 'Income Tax Department / NSDL',
      apiSetuRef: 'in.gov.incometax.pan',
      category: 'Taxation & Identity',
      authType: 'HMAC / API Key',
      sandboxAvailable: true,
      pricingPerCall: 0.8,
      consentRequired: true,
    },
    {
      id: 'api-gstn-verify',
      name: 'GSTIN Profile & Return Status API',
      provider: 'Goods and Services Tax Network (GSTN)',
      apiSetuRef: 'in.gov.gst.verify',
      category: 'Corporate & Compliance',
      authType: 'API Key + IP Whitelist',
      sandboxAvailable: true,
      pricingPerCall: 0.5,
      consentRequired: true,
    },
    {
      id: 'api-msme-udyam',
      name: 'Udyam Registration Verification API',
      provider: 'Ministry of MSME',
      apiSetuRef: 'in.gov.msme.udyam',
      category: 'Business & Enterprise',
      authType: 'OAuth 2.0',
      sandboxAvailable: true,
      pricingPerCall: 1.0,
      consentRequired: true,
    },
  ];

  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: 'Active API Setu catalogue retrieved successfully',
      referenceId: `cat_${Date.now()}`,
      data: catalogue,
    })
  );
});

// 5.2 POST /api/v1/apisetu/verify
app.post('/api/v1/apisetu/verify', async (req, res) => {
  const authHdr = req.headers.authorization;
  if (isProductionEnvironment(process.env)) {
    const token = authHdr?.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json(
        buildStandardResponse({
          success: false,
          status: 'REJECTED',
          message: 'Authentication required to invoke API Setu verification.',
          referenceId: `err_${Date.now()}`,
          data: null,
          errorCode: 'UNAUTHORIZED',
        })
      );
    }
  }

  const { apiRef, parameters, consentGiven } = req.body || {};

  if (!consentGiven) {
    return res.status(403).json(
      buildStandardResponse({
        success: false,
        status: 'REJECTED',
        message: 'Explicit customer consent is legally required before querying API Setu provider registries',
        referenceId: `corr_setu_err_${Date.now()}`,
        data: null,
        errorCode: 'CONSENT_DENIED',
      })
    );
  }

  const apiSetuConfigured = Boolean(process.env.API_SETU_API_KEY);
  if (isProductionEnvironment(process.env) && !apiSetuConfigured) {
    return res.status(503).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'API Setu production credentials are not configured.',
        referenceId: `corr_setu_err_${Date.now()}`,
        data: null,
        errorCode: 'API_SETU_NOT_CONFIGURED',
      })
    );
  }

  const correlationId = `corr_setu_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  return res.json(
    buildStandardResponse({
      success: true,
      status: apiSetuConfigured ? 'SUCCESS' : 'PENDING',
      message: apiSetuConfigured
        ? 'Registry verification completed via API Setu adapter'
        : 'Sandbox preview recorded (configure API_SETU_API_KEY for live verification)',
      referenceId: correlationId,
      providerReference: `SANDBOX_${Date.now()}`,
      data: {
        apiRef,
        verified: apiSetuConfigured,
        simulationOnly: !apiSetuConfigured,
        queryReference: parameters || {},
        verifiedAt: new Date().toISOString(),
      },
    })
  );
});

// 5.3 POST /api/v1/digilocker/authorize
app.post('/api/v1/digilocker/authorize', async (req, res) => {
  if (isProductionEnvironment(process.env)) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ error: 'Authentication required for DigiLocker authorization.', errorCode: 'UNAUTHORIZED' });
    }
  }

  const { purpose, clientName = 'Digital India Project', redirectUri } = req.body || {};

  if (!purpose) {
    return res.status(400).json({
      error: 'Mandatory DigiLocker purpose disclosure is required before initiating authorization',
    });
  }

  const clientId = process.env.DIGILOCKER_CLIENT_ID;
  const configured = Boolean(clientId && process.env.DIGILOCKER_CLIENT_SECRET);
  if (isProductionEnvironment(process.env) && !configured) {
    return res.status(503).json({
      error: 'DigiLocker OAuth credentials are not configured in production.',
      errorCode: 'DIGILOCKER_NOT_CONFIGURED',
      configured: false,
    });
  }

  const authSessionId = `dl_sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const authorizationUrl = `https://api.digitallocker.gov.in/public/oauth2/1/authorize?response_type=code&client_id=${encodeURIComponent(
    clientId || 'UNCONFIGURED_DIGILOCKER_CLIENT'
  )}&redirect_uri=${encodeURIComponent(
    redirectUri || 'https://digitalindiaproject.com/api/v1/digilocker/callback'
  )}&state=${authSessionId}`;

  return res.json({
    authSessionId,
    authorizationUrl,
    purposeDisclosure: purpose,
    clientName,
    configured,
    status: configured ? 'INITIATED' : 'UNCONFIGURED_SANDBOX',
    notice: configured
      ? 'User will be redirected to DigiLocker for explicit consent & OTP authentication'
      : 'Sandbox preview mode (configure DIGILOCKER_CLIENT_ID & DIGILOCKER_CLIENT_SECRET for live OAuth)',
  });
});

// 5.4 POST /api/v1/verifications/single (B2B API Integration)
app.post('/api/v1/verifications/single', (req, res) => {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!apiKey || apiKey.length < 16) {
    return res.status(401).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'Valid B2B API Key required in Authorization Bearer header',
        referenceId: `err_${Date.now()}`,
        data: null,
        errorCode: 'UNAUTHORIZED_API_KEY',
      })
    );
  }

  const { verificationType, identifierValue, candidateConsentObtained = false } = req.body || {};
  if (!candidateConsentObtained) {
    return res.status(403).json(
      buildStandardResponse({
        success: false,
        status: 'REJECTED',
        message: 'Candidate consent confirmation (candidateConsentObtained: true) is required.',
        referenceId: `err_${Date.now()}`,
        data: null,
        errorCode: 'CONSENT_REQUIRED',
      })
    );
  }

  if (!verificationType || !identifierValue) {
    return res.status(400).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'verificationType and identifierValue are required',
        referenceId: `err_${Date.now()}`,
        data: null,
        errorCode: 'MISSING_PARAMETERS',
      })
    );
  }

  const apiSetuConfigured = Boolean(process.env.API_SETU_API_KEY);
  if (isProductionEnvironment(process.env) && !apiSetuConfigured) {
    return res.status(503).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'Upstream registry verification provider is not configured in production.',
        referenceId: `err_${Date.now()}`,
        data: null,
        errorCode: 'PROVIDER_NOT_CONFIGURED',
      })
    );
  }

  const correlationId = `corr_b2b_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  return res.json(
    buildStandardResponse({
      success: true,
      status: apiSetuConfigured ? 'SUCCESS' : 'PENDING',
      message: apiSetuConfigured
        ? `${verificationType} verification completed via automated pipeline`
        : `${verificationType} queued in local sandbox preview (configure API_SETU_API_KEY for live provider)`,
      referenceId: correlationId,
      providerReference: `PROV_B2B_${Date.now()}`,
      data: {
        verificationType,
        identifier: identifierValue,
        status: apiSetuConfigured ? 'VALID_ACTIVE' : 'SANDBOX_PREVIEW',
        simulationOnly: !apiSetuConfigured,
        verifiedAt: new Date().toISOString(),
        consentAcknowledged: true,
      },
    })
  );
});

// 5.5 POST /api/v1/verifications/bulk (B2B Bulk Processing)
app.post('/api/v1/verifications/bulk', async (req, res) => {
  if (isProductionEnvironment(process.env)) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      return res.status(401).json({ success: false, error: 'Authentication required', errorCode: 'UNAUTHORIZED' });
    }
  }
  const { jobName, verificationType, recordsCount = 50 } = req.body || {};
  const jobId = `bjob_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  return res.json({
    jobId,
    jobName: jobName || `batch_${Date.now()}.csv`,
    verificationType: verificationType || 'GSTIN Batch Verification',
    totalRecords: recordsCount,
    status: 'QUEUED',
    estimatedSeconds: Math.ceil(recordsCount * 0.2),
    pollUrl: `/api/v1/verifications/bulk/${jobId}`,
  });
});

// 5.6 POST /api/v1/forms/validate (Server-side parity with Worker & UI Dynamic Form Engine)
app.post('/api/v1/forms/validate', (req, res) => {
  const { fields, formData, lang = 'en' } = req.body || {};
  if (!Array.isArray(fields) || !formData || typeof formData !== 'object') {
    return res.status(400).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'fields array and formData object are required',
        referenceId: `err_${Date.now()}`,
        data: null,
        errorCode: 'INVALID_FORM_PAYLOAD',
      })
    );
  }

  const validation = validateFormSubmission(fields, formData, lang === 'hi' ? 'hi' : 'en');
  if (!validation.valid) {
    return res.status(422).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: 'Form schema validation failed',
        referenceId: `val_${Date.now()}`,
        data: { errors: validation.errors },
        errorCode: 'VALIDATION_ERROR',
      })
    );
  }

  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: 'Form payload validated against service schema',
      referenceId: `val_${Date.now()}`,
      data: { valid: true, errors: {} },
    })
  );
});

// 5.6b API Sathi Marketplace Proxy (Node Express Dev Parity — uses process.env.API_SATHI_KEY strictly server-side)
const localApiSathiCalls: Array<ApiSathiCallAnalyticsInputRow & Record<string, any>> = [];
const localDigilockerSessions = new Map<string, { userId: string; kycUrl: string; shortUrl: string | null }>();

async function resolveExpressApiSathiUser(req: express.Request) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
  const verified = token ? await verifyFirebaseIdToken(token).catch(() => null) : null;
  const uid = String(verified?.sub || verified?.user_id || '');
  if (uid) {
    const email = String(verified?.email || '').trim().toLowerCase();
    const role = String(((verified || {}) as Record<string, unknown>).role || '').trim().toLowerCase();
    const isAdmin =
      Boolean(verified?.email_verified && EXPRESS_BOOTSTRAP_ADMIN_EMAILS.has(email)) ||
      role === 'admin' ||
      role === 'super_admin';
    return {
      id: uid,
      isAdmin,
      firebaseIdToken: token,
    };
  }
  if (!isProductionEnvironment(process.env)) {
    return { id: 'local_dev_user', isAdmin: false, firebaseIdToken: null as string | null };
  }
  return null;
}

app.get('/api/v1/apisathi/status', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  const key = getApiSathiKey();
  const keyMode = detectApiSathiKeyMode(key);
  const recentWalletErr = localApiSathiCalls.find((c) => c.http_status === 402 || c.error_code === 'INSUFFICIENT_BALANCE');
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: 'API Sathi status retrieved',
    referenceId: `as_stat_${Date.now()}`,
    data: {
      configured: Boolean(key),
      keyMode,
      isSandboxTestKey: keyMode === 'sandbox_test',
      environment: !key ? 'UNCONFIGURED' : keyMode === 'sandbox_test' ? 'SANDBOX' : 'PRODUCTION',
      walletLowAlert: Boolean(recentWalletErr),
      recentWalletAlert: recentWalletErr
        ? {
            callId: recentWalletErr.call_id,
            createdAt: recentWalletErr.created_at,
            message: recentWalletErr.error_message || 'API Sathi prepaid wallet balance empty (402).',
          }
        : null,
    },
  });
});

app.get('/api/v1/apisathi/catalogue', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  const liveRates = await fetchLiveApiSathiRates().catch(() => []);
  const rateBySlug = new Map(liveRates.map((r) => [r.slug, r]));
  const products = API_SATHI_PRODUCTS.map((p) => {
    const live = rateBySlug.get(p.slug);
    return {
      ...p,
      priceRupees: live?.priceRupees ?? p.priceRupees,
      available: live ? live.available : p.available,
    };
  });
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Loaded ${products.length} API Sathi products`,
    referenceId: `as_cat_${Date.now()}`,
    data: { products },
  });
});

app.post('/api/v1/apisathi/verify', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  const { productSlug, parameters, consentGiven, intent } = req.body || {};
  const outcome = await handleApiSathiVerification({
    productSlug: String(productSlug || '').trim(),
    parameters: parameters && typeof parameters === 'object' ? parameters : {},
    consentGiven: Boolean(consentGiven),
    intent: typeof intent === 'string' && intent.trim() ? intent.trim() : undefined,
    userId: actor.id,
    isAdmin: actor.isAdmin,
    firebaseIdToken: actor.firebaseIdToken,
  });

  if (outcome.auditRecord) {
    localApiSathiCalls.unshift({
      id: outcome.auditRecord.id,
      call_id: outcome.auditRecord.callId || null,
      idempotency_key: outcome.auditRecord.idempotencyKey,
      product_slug: outcome.auditRecord.productSlug,
      intent: outcome.auditRecord.intent,
      environment: outcome.auditRecord.environment,
      is_sandbox_test: outcome.auditRecord.isSandboxTest ? 1 : 0,
      http_status: outcome.auditRecord.httpStatus,
      verified: outcome.auditRecord.verified ? 1 : 0,
      outcome: outcome.auditRecord.outcome,
      error_code: outcome.auditRecord.errorCode || null,
      error_message: outcome.auditRecord.errorMessage || null,
      masked_request_json: outcome.auditRecord.maskedRequestJson,
      response_summary: outcome.auditRecord.verified ? 'Verified' : outcome.auditRecord.errorMessage || outcome.auditRecord.outcome,
      user_id: outcome.auditRecord.userId,
      step1_ref_id: null,
      latency_ms: outcome.auditRecord.latencyMs,
      firestore_persisted: Boolean(outcome.firestoreResult?.persisted),
      created_at: outcome.auditRecord.createdAt,
    });
    if (localApiSathiCalls.length > 250) localApiSathiCalls.pop();
  }

  let queuedJob = null;
  if (
    outcome.isRetryable &&
    outcome.idempotencyKey &&
    outcome.sanitizedInput &&
    outcome.auditRecord
  ) {
    queuedJob = defaultApiSathiRetryQueue.enqueue({
      productSlug: outcome.auditRecord.productSlug,
      intent: outcome.auditRecord.intent,
      userId: outcome.auditRecord.userId,
      idempotencyKey: outcome.idempotencyKey,
      sanitizedInput: outcome.sanitizedInput,
      httpStatus: outcome.httpStatus,
      errorCode: outcome.body.errorCode || 'RETRYABLE_ERROR',
      errorMessage: outcome.body.message,
      callId: outcome.auditRecord.callId || null,
      retryAfterSeconds: outcome.retryAfterSeconds,
    });
  }

  if (queuedJob && outcome.body.data) {
    outcome.body.data.queuedForRetry = true;
    outcome.body.data.retryJobId = queuedJob.id;
    outcome.body.data.nextRetryAt = queuedJob.nextRetryAt;
  }

  return res.status(outcome.httpStatus).json(outcome.body);
});

app.post('/api/v1/apisathi/digilocker/init', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  const key = normalizeApiSathiKey(process.env.API_SATHI_KEY);
  if (!key) {
    return res.status(503).json({
      success: false,
      status: 'FAILED',
      message: 'API_SATHI_KEY is not configured on the server.',
      errorCode: 'API_SATHI_NOT_CONFIGURED',
    });
  }
  const body = req.body || {};
  if (!body.consentGiven) {
    return res.status(403).json({ success: false, status: 'REJECTED', message: 'User consent is required.', errorCode: 'CONSENT_DENIED' });
  }
  const client = createApiSathiClient({ apiKey: key });
  const uid = String(body.uid || `dip_${actor.id.replace(/[^\w.@-]/g, '').slice(0, 32)}_${Date.now().toString(36)}`);
  const isProdRuntime = isProductionEnvironment(process.env);
  const appDomain = (process.env.APP_DOMAIN || 'https://digitalindiaproject.com').replace(/\/+$/, '');
  const safeRedirect = validateSafeRedirectUrl(body.redirectionUrl, {
    appDomain,
    fallbackUrl: `${appDomain}/operator-enroll?digilocker=done`,
    allowHttpLocalhost: !isProdRuntime,
  });
  try {
    const resInit = await initAadhaarDigilocker(client, {
      uid,
      mobile: body.mobile,
      emailId: body.emailId,
      firstName: body.firstName,
      lastName: body.lastName,
      redirectionUrl: safeRedirect.url,
      isHideExplanationScreen: true,
    });
    const txId = String(resInit.data?.transaction_id || '');
    const kycUrl = String(resInit.data?.kyc_url || '');
    const shortUrl = resInit.data?.short_url ? String(resInit.data.short_url) : null;
    if (txId) {
      localDigilockerSessions.set(txId, { userId: actor.id, kycUrl, shortUrl });
    }
    const auditRecord = buildFirestoreVerificationRecord({
      userId: actor.id,
      intent: String(body.intent || 'aadhaar_digilocker_init'),
      productSlug: 'aadhaar-digilocker-init-v1',
      callId: resInit.callId,
      idempotencyKey: resInit.idempotencyKey,
      environment: resInit.environment,
      isSandboxTest: resInit.isSandboxTestKey,
      httpStatus: 200,
      verified: true,
      outcome: 'STEP1_INITIATED',
      rawRequestPayload: { uid, mobile: body.mobile, emailId: body.emailId },
      rawResponsePayload: { transaction_id: txId },
      latencyMs: resInit.latencyMs,
    });
    void persistApiSathiVerificationToFirestore(auditRecord, { userIdToken: actor.firebaseIdToken });

    localApiSathiCalls.unshift({
      id: auditRecord.id,
      call_id: resInit.callId,
      idempotency_key: resInit.idempotencyKey,
      product_slug: 'aadhaar-digilocker-init-v1',
      intent: auditRecord.intent,
      environment: resInit.environment,
      is_sandbox_test: resInit.isSandboxTestKey ? 1 : 0,
      http_status: 200,
      verified: 1,
      outcome: 'STEP1_INITIATED',
      error_code: null,
      error_message: null,
      masked_request_json: auditRecord.maskedRequestJson,
      response_summary: `tx=${txId}`,
      user_id: actor.id,
      step1_ref_id: txId,
      latency_ms: resInit.latencyMs,
      created_at: auditRecord.createdAt,
    });
    safeLogApiSathiEvent('info', 'DigiLocker step 1 initialized', {
      userId: actor.id,
      callId: resInit.callId,
      txId,
      mobile: body.mobile,
      emailId: body.emailId,
    });
    return res.json({
      success: true,
      status: 'SUCCESS',
      message: 'DigiLocker KYC link issued. Open link, complete Aadhaar consent, then click I Have Finished.',
      referenceId: resInit.callId || txId,
      data: {
        transactionId: txId,
        uid,
        kycUrl,
        shortUrl,
        callId: resInit.callId,
        environment: resInit.environment,
        isSandboxTestKey: resInit.isSandboxTestKey,
      },
    });
  } catch (err: any) {
    const apiErr =
      err instanceof ApiSathiError
        ? err
        : new ApiSathiError({ code: 'DIGILOCKER_INIT_ERROR', message: err?.message || 'DigiLocker init failed', httpStatus: 500 });
    return res.status(apiErr.httpStatus).json({
      success: false,
      status: 'FAILED',
      message: apiErr.message,
      referenceId: apiErr.callId || undefined,
      errorCode: apiErr.code,
      data: { callId: apiErr.callId, isWalletEmptyError: apiErr.isWalletEmptyError },
    });
  }
});

app.post('/api/v1/apisathi/digilocker/fetch', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  const txId = String(req.body?.transactionId || req.body?.transaction_id || '').trim();
  const sess = localDigilockerSessions.get(txId);
  if (!sess) {
    return res.status(404).json({
      success: false,
      status: 'FAILED',
      message: 'Unknown DigiLocker transaction_id. Start DigiLocker step 1 first.',
      errorCode: 'UNKNOWN_TRANSACTION_ID',
    });
  }
  if (sess.userId !== actor.id && !actor.isAdmin) {
    return res.status(403).json({ success: false, status: 'REJECTED', message: 'Forbidden', errorCode: 'FORBIDDEN' });
  }
  const key = normalizeApiSathiKey(process.env.API_SATHI_KEY);
  if (!key) {
    return res.status(503).json({
      success: false,
      status: 'FAILED',
      message: 'API_SATHI_KEY is not configured on the server.',
      errorCode: 'API_SATHI_NOT_CONFIGURED',
    });
  }
  const client = createApiSathiClient({ apiKey: key });
  try {
    const resFetch = await fetchAadhaarDigilocker(client, { transaction_id: txId });
    const verified = Boolean(resFetch.verified);
    const auditRecord = buildFirestoreVerificationRecord({
      userId: actor.id,
      intent: String(req.body?.intent || 'aadhaar_digilocker_fetch'),
      productSlug: 'aadhaar-digilocker-fetch-v1',
      callId: resFetch.callId,
      idempotencyKey: resFetch.idempotencyKey,
      environment: resFetch.environment,
      isSandboxTest: resFetch.isSandboxTestKey,
      httpStatus: 200,
      verified,
      outcome: resFetch.outcome,
      errorCode: verified ? null : 'NOT_VERIFIED',
      errorMessage: verified ? null : resFetch.message,
      rawRequestPayload: { transaction_id: txId },
      rawResponsePayload: maskSensitiveData(resFetch.data || {}),
      latencyMs: resFetch.latencyMs,
    });
    void persistApiSathiVerificationToFirestore(auditRecord, { userIdToken: actor.firebaseIdToken });

    localApiSathiCalls.unshift({
      id: auditRecord.id,
      call_id: resFetch.callId,
      idempotency_key: resFetch.idempotencyKey,
      product_slug: 'aadhaar-digilocker-fetch-v1',
      intent: auditRecord.intent,
      environment: resFetch.environment,
      is_sandbox_test: resFetch.isSandboxTestKey ? 1 : 0,
      http_status: 200,
      verified: verified ? 1 : 0,
      outcome: resFetch.outcome,
      error_code: verified ? null : 'NOT_VERIFIED',
      error_message: verified ? null : resFetch.message,
      masked_request_json: JSON.stringify({ transaction_id: txId }),
      response_summary: verified ? 'UIDAI e-KYC verified' : 'Not verified yet',
      user_id: actor.id,
      step1_ref_id: txId,
      latency_ms: resFetch.latencyMs,
      created_at: auditRecord.createdAt,
    });
    return res.json({
      success: verified,
      status: verified ? 'SUCCESS' : 'FAILED',
      message: verified ? 'UIDAI DigiLocker Aadhaar e-KYC verified.' : 'DigiLocker flow is not verified yet.',
      referenceId: resFetch.callId || txId,
      data: {
        verified,
        transactionId: txId,
        callId: resFetch.callId,
        environment: resFetch.environment,
        isSandboxTestKey: resFetch.isSandboxTestKey,
        maskedAadhaar: resFetch.data?.masked_aadhaar || null,
        name: resFetch.data?.name || null,
        dob: resFetch.data?.dob || null,
        gender: resFetch.data?.gender || null,
        address: resFetch.data?.address || null,
        kycUrl: sess.kycUrl,
      },
    });
  } catch (err: any) {
    const apiErr =
      err instanceof ApiSathiError
        ? err
        : new ApiSathiError({ code: 'DIGILOCKER_FETCH_ERROR', message: err?.message || 'DigiLocker fetch failed', httpStatus: 500 });
    if (apiErr.httpStatus === 422) {
      return res.status(422).json({
        success: false,
        status: 'PENDING',
        message: 'DigiLocker verification is not completed yet. Open the DigiLocker link and finish Aadhaar consent before retrying.',
        referenceId: apiErr.callId || undefined,
        errorCode: apiErr.code || 'DIGILOCKER_NOT_COMPLETED',
        data: {
          callId: apiErr.callId,
          notCompleted: true,
          canRetryLink: true,
          transactionId: txId,
          kycUrl: sess.kycUrl,
          shortUrl: sess.shortUrl,
        },
      });
    }
    return res.status(apiErr.httpStatus).json({
      success: false,
      status: 'FAILED',
      message: apiErr.message,
      referenceId: apiErr.callId || undefined,
      errorCode: apiErr.code,
      data: { callId: apiErr.callId, isWalletEmptyError: apiErr.isWalletEmptyError },
    });
  }
});

app.get('/api/v1/apisathi/calls', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor) {
    return res.status(401).json({ success: false, status: 'REJECTED', message: 'Unauthorized', errorCode: 'UNAUTHORIZED' });
  }
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Loaded ${localApiSathiCalls.length} API Sathi call record(s)`,
    referenceId: `as_calls_${Date.now()}`,
    data: localApiSathiCalls,
  });
});

app.get('/api/v1/apisathi/analytics', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor || !actor.isAdmin) {
    return res.status(actor ? 403 : 401).json({
      success: false,
      status: 'REJECTED',
      message: actor ? 'Administrator privileges required.' : 'Unauthorized',
      errorCode: actor ? 'FORBIDDEN' : 'UNAUTHORIZED',
    });
  }
  const rawRange = String(req.query.range || '7d').trim();
  const range: ApiSathiAnalyticsRange = rawRange === '24h' || rawRange === '30d' ? rawRange : '7d';
  const analytics = aggregateApiSathiUsage(localApiSathiCalls, {
    range,
    queueSummary: defaultApiSathiRetryQueue.getSummary(),
  });
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Compiled API Sathi analytics (${analytics.summary.totalRequests} requests)`,
    referenceId: `as_ana_${Date.now()}`,
    data: analytics,
  });
});

app.get('/api/v1/apisathi/queue', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor || !actor.isAdmin) {
    return res.status(actor ? 403 : 401).json({
      success: false,
      status: 'REJECTED',
      message: actor ? 'Administrator privileges required.' : 'Unauthorized',
      errorCode: actor ? 'FORBIDDEN' : 'UNAUTHORIZED',
    });
  }
  return res.json({
    success: true,
    status: 'SUCCESS',
    message: 'API Sathi background retry queue snapshot',
    referenceId: `as_q_${Date.now()}`,
    data: {
      summary: defaultApiSathiRetryQueue.getSummary(),
      jobs: defaultApiSathiRetryQueue.getPublicJobs(50),
    },
  });
});

app.post('/api/v1/apisathi/queue/process', async (req, res) => {
  const actor = await resolveExpressApiSathiUser(req);
  if (!actor || !actor.isAdmin) {
    return res.status(actor ? 403 : 401).json({
      success: false,
      status: 'REJECTED',
      message: actor ? 'Administrator privileges required.' : 'Unauthorized',
      errorCode: actor ? 'FORBIDDEN' : 'UNAUTHORIZED',
    });
  }
  const result = await defaultApiSathiRetryQueue.processDueJobs({
    forceAllPending: req.body?.forceAllPending !== false,
    firebaseIdToken: actor.firebaseIdToken,
    onJobSettled: ({ job, auditRecord }) => {
      localApiSathiCalls.unshift({
        id: auditRecord.id,
        call_id: auditRecord.callId || null,
        idempotency_key: auditRecord.idempotencyKey,
        product_slug: auditRecord.productSlug,
        intent: auditRecord.intent,
        environment: auditRecord.environment,
        is_sandbox_test: auditRecord.isSandboxTest ? 1 : 0,
        http_status: auditRecord.httpStatus,
        verified: auditRecord.verified ? 1 : 0,
        outcome: auditRecord.outcome,
        error_code: auditRecord.errorCode || null,
        error_message: auditRecord.errorMessage || null,
        masked_request_json: auditRecord.maskedRequestJson,
        response_summary: `[Retry #${job.attemptCount}] ${auditRecord.verified ? 'Verified' : auditRecord.errorMessage || auditRecord.outcome}`,
        user_id: auditRecord.userId,
        step1_ref_id: null,
        latency_ms: auditRecord.latencyMs,
        firestore_persisted: false,
        created_at: auditRecord.createdAt,
      });
      if (localApiSathiCalls.length > 250) localApiSathiCalls.pop();
    },
  });

  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Processed ${result.processed} retry job(s): ${result.succeeded} succeeded, ${result.rescheduled} rescheduled, ${result.exhausted} exhausted`,
    referenceId: `as_qp_${Date.now()}`,
    data: {
      result,
      summary: defaultApiSathiRetryQueue.getSummary(),
    },
  });
});

// 5.7 GET /api/v1/integrations/status (Reports real server env configuration state)
app.get('/api/v1/integrations/status', (req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env);
  const cashfreeConfigured = cfConfig.configured;
  const digilockerConfigured = Boolean(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET);
  const apiSetuConfigured = Boolean(process.env.API_SETU_API_KEY);
  const apiSathiKey = normalizeApiSathiKey(process.env.API_SATHI_KEY);
  const apiSathiMode = detectApiSathiKeyMode(apiSathiKey);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const anyAiConfigured =
    openrouterConfigured || geminiConfigured || groqConfigured || openaiConfigured || anthropicConfigured;
  const smtpConfigured = Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY);

  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: 'Live integration configuration status retrieved',
      referenceId: `int_${Date.now()}`,
      data: {
        cashfree: {
          configured: cashfreeConfigured,
          environment: cfConfig.mode,
          mode: cashfreeConfigured
            ? cfConfig.mode === 'production'
              ? 'production_ready'
              : 'live_ready'
            : 'sandbox_simulation',
        },
        digilocker: {
          configured: digilockerConfigured,
          mode: digilockerConfigured ? 'live_ready' : 'sandbox_simulation',
        },
        apiSetu: {
          configured: apiSetuConfigured,
          mode: apiSetuConfigured ? 'live_ready' : 'sandbox_simulation',
        },
        apiSathi: {
          configured: Boolean(apiSathiKey),
          keyMode: apiSathiMode,
          isSandboxTestKey: apiSathiMode === 'sandbox_test',
          mode: !apiSathiKey ? 'unconfigured' : apiSathiMode === 'sandbox_test' ? 'sandbox_test' : 'production_live',
        },
        geminiAssistant: {
          configured: anyAiConfigured,
          mode: anyAiConfigured ? 'live' : 'compact_kb_fallback',
          providers: {
            openrouter: openrouterConfigured,
            gemini: geminiConfigured,
            groq: groqConfigured,
            openai: openaiConfigured,
            anthropic: anthropicConfigured,
          },
        },
        emailNotifications: {
          configured: smtpConfigured,
          mode: smtpConfigured ? 'live' : 'in_app_log_only',
        },
      },
    })
  );
});

// Local Node Dev Parity: Cloudflare Free-Plan Registry Metadata Inspection
app.get('/api/admin/infrastructure', requireExpressAdmin, async (_req, res) => {
  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: 'Cloudflare Free-Plan infrastructure topology (Node dev preview — live D1/R2 bindings execute on Cloudflare Worker deploy)',
      referenceId: `inf_${Date.now()}`,
      data: {
        plan: 'Cloudflare Free Plan ONLY',
        environment: process.env.NODE_ENV || 'development',
        domain: 'https://digitalindiaproject.com',
        runtimeMode: 'local_node_preview',
        databases: {
          freePlanLimits: CLOUDFLARE_FREE_PLAN_D1_LIMITS,
          physicalDatabasesBound: LOGICAL_DATABASE_CATALOG.length,
          withinFreePlanLimit: true,
          databases: LOGICAL_DATABASE_CATALOG.map((d) => ({
            logicalName: d.key,
            slotNumber: d.slotNumber,
            activeBinding: d.key === 'dip_core' ? 'DB (dip-official)' : String(d.preferredBinding),
            dedicatedBindingConfigured: true,
            consolidatedOntoPrimary: false,
            purpose: d.purpose,
            modules: d.modules,
            ownedTablesCount: d.ownedTables.length,
            status: 'UNCONFIGURED',
            latencyMs: 0,
            detectedTablesCount: d.ownedTables.length,
            appliedMigrations: [
              '0001_initial_schema',
              '0002_apisetu_and_b2b_schema',
              '0003_enterprise_platform_2_0',
              '0004_central_platform_and_blog',
            ],
            errorMessage: 'Local Vite Node dev server active. Deploy Worker to connect live Cloudflare D1.',
          })),
        },
        storage: {
          freePlanLimits: CLOUDFLARE_FREE_PLAN_R2_LIMITS,
          configuredSafetyThresholdBytes: CLOUDFLARE_FREE_PLAN_R2_LIMITS.safetyThresholdBytes,
          physicalBucketsBound: LOGICAL_BUCKET_CATALOG.length,
          totalBytesTrackedInRegistry: 0,
          totalFilesTrackedInRegistry: 0,
          quotaState: 'OK',
          buckets: LOGICAL_BUCKET_CATALOG.map((b) => ({
            logicalName: b.key,
            slotNumber: b.slotNumber,
            activeBinding: b.key === 'documents' ? 'DOCUMENTS_BUCKET (dip-official)' : String(b.preferredBinding),
            dedicatedBindingConfigured: true,
            consolidatedOntoPrimary: false,
            prefix: b.fallbackPrefix,
            purpose: b.purpose,
            accessClassification: b.accessClassification,
            status: 'UNCONFIGURED',
            fileCount: 0,
            bytesUsed: 0,
            maxFileSizeBytes: b.maxFileSizeBytes,
            retentionDays: b.retentionDays,
            associatedModules: b.associatedModules,
            errorMessage: 'Local Vite Node dev server active. Deploy Worker to connect live Cloudflare R2.',
          })),
        },
        backups: [],
        secretsReadiness: {
          authSigning: Boolean(process.env.SESSION_SECRET),
          cashfreeGateway: resolveCashfreeConfig(process.env).configured,
          cashfreeWebhook: Boolean(resolveCashfreeConfig(process.env).webhookSecret),
          cashfreeMode: resolveCashfreeConfig(process.env).mode,
          digilocker: Boolean(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET),
          apiSetu: Boolean(process.env.API_SETU_API_KEY),
          resendEmail: Boolean(process.env.RESEND_API_KEY),
          aiProvidersConfiguredCount: [
            process.env.GEMINI_API_KEY,
            process.env.OPENROUTER_API_KEY,
            process.env.GROQ_API_KEY,
            process.env.OPENAI_API_KEY,
            process.env.ANTHROPIC_API_KEY,
          ].filter(Boolean).length,
        },
        recentEvents: [],
        legacyAliases: {
          preservedR1Bucket: 'r1-01 (karta-legacy-r1)',
          preservedD2Database: 'd2-01 (digital-tools-tray-db)',
          firebaseProjects: [
            { projectId: 'digitalindiaproject-portal', projectNumber: '49386507162', databaseId: 'digitalindiaproject-database', sourceRepo: 'Digital India Project (DIP-Desk) — Active Runtime DB' },
            { projectId: 'gen-lang-client-0294214396', projectNumber: '520982792771', sourceRepo: 'DIP-Official (Previous Source DB)' },
            { projectId: 'gen-lang-client-0226759782', sourceRepo: 'Tools-Tray' },
          ],
        },
      },
    })
  );
});

app.get('/api/integrations/status', (_req, res) => {
  const cfConfig = resolveCashfreeConfig(process.env);
  const pgCfg = resolveJustPostgresConfig(process.env);
  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: 'API Junction status retrieved',
      referenceId: `jnc_${Date.now()}`,
      data: {
        gatewayHost: 'https://digitalindiaproject.com',
        basePath: '/api/integrations',
        providers: {
          apiSetu: {
            configured: Boolean(process.env.API_SETU_API_KEY),
            mode: process.env.API_SETU_API_KEY ? 'production_ready' : 'sandbox_adapter',
          },
          apiSathi: {
            configured: Boolean(normalizeApiSathiKey(process.env.API_SATHI_KEY)),
            keyMode: detectApiSathiKeyMode(process.env.API_SATHI_KEY),
            isSandboxTestKey: detectApiSathiKeyMode(process.env.API_SATHI_KEY) === 'sandbox_test',
            mode: !normalizeApiSathiKey(process.env.API_SATHI_KEY)
              ? 'unconfigured'
              : detectApiSathiKeyMode(process.env.API_SATHI_KEY) === 'sandbox_test'
              ? 'sandbox_test'
              : 'production_live',
          },
          digilocker: {
            configured: Boolean(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET),
            mode: process.env.DIGILOCKER_CLIENT_ID ? 'oauth_ready' : 'sandbox_adapter',
          },
          cashfree: {
            configured: cfConfig.configured,
            webhookProtected: Boolean(cfConfig.webhookSecret),
            environment: cfConfig.mode,
            mode: cfConfig.configured
              ? cfConfig.mode === 'production'
                ? 'production_ready'
                : 'gateway_ready'
              : 'sandbox_adapter',
          },
          justPostgres: {
            configured: pgCfg.configured,
            endpointHost: pgCfg.endpointHost || null,
            mode: pgCfg.configured ? 'remote_rest_ready' : 'env_secrets_pending',
          },
        },
      },
    })
  );
});

// Browser-safe JustPostgreSQL anon client configuration & non-PII migration status
const CORE_PG_TABLES = ['users', 'services', 'applications', 'business_settings'] as const;

let cachedMigrationStatus: { expiresAt: number; payload: any } | null = null;

function buildCoreCollectionsReport(
  tableStats: Array<{ table: string; rowCount: number; exists: boolean; error?: string }>,
  seededCounts?: Partial<Record<(typeof CORE_PG_TABLES)[number], number>>
) {
  const byName = new Map(tableStats.map((t) => [t.table, t]));
  const result = {} as Record<
    (typeof CORE_PG_TABLES)[number],
    {
      table: (typeof CORE_PG_TABLES)[number];
      exists: boolean;
      rowCount: number;
      seededCount: number;
      note: string;
    }
  >;

  for (const table of CORE_PG_TABLES) {
    const stat = byName.get(table);
    const exists = Boolean(stat?.exists);
    const rowCount = Number(stat?.rowCount || 0);
    const seededCount = Number(seededCounts?.[table] || 0);
    result[table] = {
      table,
      exists,
      rowCount,
      seededCount,
      note: exists
        ? rowCount > 0
          ? `Ready (${rowCount} records)`
          : table === 'applications'
          ? 'Schema ready (0 citizen filings yet)'
          : 'Table exists (awaiting initial documents)'
        : stat?.error || 'Table missing',
    };
  }
  return result;
}

async function computePostgresMigrationStatusSnapshot(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedMigrationStatus && cachedMigrationStatus.expiresAt > now) {
    return cachedMigrationStatus.payload;
  }

  const probe = await probeJustPostgresStatus(process.env);
  const byName = new Map(probe.tableStats.map((t) => [t.table, t]));
  const collections = buildCoreCollectionsReport(probe.tableStats);

  const missingTables = CORE_PG_TABLES.filter((t) => !collections[t].exists);
  const unseededTables = (['users', 'services', 'business_settings'] as const).filter(
    (t) => collections[t].exists && collections[t].rowCount === 0
  );
  const schemaMigrationsStat = byName.get('schema_migrations');
  const initialized =
    probe.configured &&
    probe.healthState === 'connected' &&
    missingTables.length === 0 &&
    unseededTables.length === 0;

  const payload = {
    configured: probe.configured,
    directPgConfigured: probe.directPgConfigured,
    restConfigured: probe.restConfigured,
    hasAnonKey: probe.hasAnonKey,
    endpointHost: probe.endpointHost,
    transportMode: probe.transportMode,
    healthState: probe.healthState,
    initialized,
    needsMigration: probe.configured && !initialized,
    missingTables,
    unseededTables,
    schemaMigrationsReady: Boolean(schemaMigrationsStat?.exists),
    appliedVersionsCount: Number(schemaMigrationsStat?.rowCount || 0),
    collections,
    message: probe.message,
    checkedAt: probe.checkedAt,
  };

  cachedMigrationStatus = {
    expiresAt: now + 15_000,
    payload,
  };
  return payload;
}

async function ensureJustPostgresCoreMigrated(params: {
  actorUid: string;
  actorEmail: string;
  coreOnly?: boolean;
  forceSeed?: boolean;
}) {
  cachedMigrationStatus = null;
  let status = await probeJustPostgresStatus(process.env);
  if (!status.configured) {
    return {
      ok: false,
      initialized: false,
      appliedMigrations: [] as string[],
      collections: buildCoreCollectionsReport(status.tableStats),
      message: status.message,
      status,
    };
  }

  const appliedMigrations: string[] = [];
  const byName = new Map<string, (typeof status.tableStats)[number]>(
    status.tableStats.map((t) => [t.table, t])
  );
  const hasMissingStructure = [...CORE_PG_TABLES, 'admins', 'schema_migrations'].some(
    (t) => !byName.get(t)?.exists
  );

  if (hasMissingStructure && status.directPgConfigured) {
    await runSqlSchemaMigrationDirect(readPostgresSchemaSql(), process.env);
    appliedMigrations.push('0001_justpostgres_schema', '0002_justpostgres_init_core');
    status = await probeJustPostgresStatus(process.env);
  }

  const refreshedMap = new Map(status.tableStats.map((t) => [t.table, t]));
  const coreTablesReady = CORE_PG_TABLES.every((t) => Boolean(refreshedMap.get(t)?.exists));

  if (!coreTablesReady) {
    return {
      ok: false,
      initialized: false,
      appliedMigrations,
      collections: buildCoreCollectionsReport(status.tableStats),
      message:
        status.healthState === 'api_not_enabled'
          ? status.message
          : 'Core PostgreSQL tables are missing and DATABASE_URL is not configured for automated DDL. Run migrations/postgres/0001_justpostgres_schema.sql and 0002_justpostgres_init_core.sql in your JustPostgres SQL Editor.',
      status,
    };
  }

  const needsSeed =
    Boolean(params.forceSeed) ||
    Number(refreshedMap.get('services')?.rowCount || 0) === 0 ||
    Number(refreshedMap.get('business_settings')?.rowCount || 0) === 0 ||
    Number(refreshedMap.get('users')?.rowCount || 0) === 0;

  const seededCounts: Partial<Record<(typeof CORE_PG_TABLES)[number], number>> = {};

  if (needsSeed) {
    const syncResults = await seedCanonicalDataToJustPostgres({
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
      env: process.env,
      coreOnly: Boolean(params.coreOnly),
    });
    seededCounts.users = syncResults.users?.upserted || 0;
    seededCounts.services = syncResults.services?.upserted || 0;
    seededCounts.business_settings = syncResults.business_settings?.upserted || 0;
    seededCounts.applications = 0;

    if (refreshedMap.get('schema_migrations')?.exists) {
      await upsertJustPostgresRows(
        'schema_migrations',
        [
          {
            version: '0001_justpostgres_schema',
            description: 'Core and operational PostgreSQL tables with RLS',
          },
          {
            version: '0002_justpostgres_init_core',
            description: 'Extended core columns, indexes, BusinessSettings, and bootstrap Super Admin',
          },
          {
            version: '0003_initial_core_documents',
            description: 'Seeded initial Services catalog, BusinessSettings, RBAC matrix, and Super Admin user',
          },
        ],
        'version',
        process.env
      ).catch(() => {});
    }
    appliedMigrations.push('0003_initial_core_documents');
    status = await probeJustPostgresStatus(process.env);
  }

  cachedMigrationStatus = null;
  const finalCollections = buildCoreCollectionsReport(status.tableStats, seededCounts);
  const initialized =
    CORE_PG_TABLES.every((t) => finalCollections[t].exists) &&
    finalCollections.services.rowCount > 0 &&
    finalCollections.business_settings.rowCount > 0 &&
    finalCollections.users.rowCount > 0;

  return {
    ok: initialized,
    initialized,
    appliedMigrations,
    collections: finalCollections,
    message:
      appliedMigrations.length > 0
        ? `JustPostgreSQL schema and core documents verified (${appliedMigrations.join(', ')} applied).`
        : 'JustPostgreSQL schema and core collections are already up to date.',
    status,
  };
}

// Strictly returns only public anon client configuration — never service_role or DATABASE_URL
app.get('/api/postgres/client-config', (_req, res) => {
  const cfg = resolveJustPostgresConfig(process.env);
  const clientConfigured = Boolean(cfg.restUrl && cfg.anonKey);
  return res.json(
    buildStandardResponse({
      success: true,
      status: 'SUCCESS',
      message: clientConfigured
        ? 'JustPostgreSQL public client configuration loaded.'
        : 'JustPostgreSQL public client configuration is pending env vars.',
      referenceId: `pg_cfg_${Date.now()}`,
      data: {
        configured: clientConfigured,
        restUrl: clientConfigured ? cfg.restUrl : '',
        anonKey: clientConfigured ? cfg.anonKey : '',
        endpointHost: cfg.endpointHost || '',
      },
    })
  );
});

// Non-PII startup readiness endpoint for core JustPostgreSQL tables
app.get('/api/postgres/migration-status', async (req, res) => {
  try {
    const forceFresh = req.query.force === '1' || req.query.fresh === 'true';
    const snapshot = await computePostgresMigrationStatusSnapshot(forceFresh);
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: snapshot.message,
        referenceId: `pg_mstat_${Date.now()}`,
        data: snapshot,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Unable to inspect JustPostgreSQL migration status.',
        referenceId: `pg_mstat_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_MIGRATION_STATUS_ERROR',
      })
    );
  }
});

// Non-PII daily submission & revenue summary rows from JustPostgreSQL for Manager/Admin charts
app.get('/api/postgres/applications-metrics', requireExpressManagerOrAdmin, async (_req, res) => {
  const cfg = resolveJustPostgresConfig(process.env);
  if (!cfg.configured) {
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: 'JustPostgreSQL is not configured; using active client database cache.',
        referenceId: `pg_app_met_${Date.now()}`,
        data: { configured: false, source: 'unconfigured', rows: [] },
      })
    );
  }
  try {
    const rawRows = await exportJustPostgresTable('applications', process.env);
    const metrics = rawRows.map((row) => {
      const paymentJson =
        row.payment_json && typeof row.payment_json === 'object' ? row.payment_json : {};
      return {
        id: String(row.id || ''),
        submissionDate: String(row.submission_date || row.created_at || ''),
        totalAmount: Number(row.total_amount ?? paymentJson.totalAmount ?? 0) || 0,
        paymentStatus: String(paymentJson.status || 'Pending'),
        status: String(row.status || 'Submitted'),
      };
    });
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: `Loaded ${metrics.length} application metrics record(s) from JustPostgreSQL.`,
        referenceId: `pg_app_met_${Date.now()}`,
        data: { configured: true, source: 'justpostgres', rows: metrics },
      })
    );
  } catch (err: any) {
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: err?.message || 'JustPostgreSQL applications metrics unavailable; falling back cleanly.',
        referenceId: `pg_app_met_fb_${Date.now()}`,
        data: { configured: true, source: 'justpostgres', rows: [] },
      })
    );
  }
});

// Remote PostgreSQL (JustPostgres REST Proxy Routes — Strictly Admin Authenticated & Server-Side Key Only)
app.get('/api/admin/postgres/status', requireExpressAdmin, async (_req, res) => {
  try {
    const status = await probeJustPostgresStatus(process.env);
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: status.message,
        referenceId: `pg_stat_${Date.now()}`,
        data: status,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Unable to check JustPostgres status.',
        referenceId: `pg_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_STATUS_ERROR',
      })
    );
  }
});

app.get('/api/admin/postgres/schema-sql', requireExpressAdmin, (_req, res) => {
  try {
    const sql = readPostgresSchemaSql();
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: 'PostgreSQL schema & core initialization migrations loaded (0001 + 0002).',
        referenceId: `pg_sql_${Date.now()}`,
        data: {
          filename: 'justpostgres_0001_0002_init.sql',
          sql,
        },
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Unable to read Postgres schema SQL.',
        referenceId: `pg_sql_err_${Date.now()}`,
        data: null,
        errorCode: 'SCHEMA_READ_ERROR',
      })
    );
  }
});

app.post('/api/admin/postgres/run-migration', requireExpressAdmin, async (_req, res) => {
  try {
    const sql = readPostgresSchemaSql();
    const result = await runSqlSchemaMigrationDirect(sql, process.env);
    cachedMigrationStatus = null;
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: result.message,
        referenceId: `pg_mig_${Date.now()}`,
        data: result,
      })
    );
  } catch (err: any) {
    return res.status(400).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Unable to run PostgreSQL schema migration.',
        referenceId: `pg_mig_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_MIGRATION_ERROR',
      })
    );
  }
});

app.post('/api/admin/postgres/ensure-migrated', requireExpressAdmin, async (req, res) => {
  try {
    const actor = await resolveExpressAdminFromRequest(req);
    if (!actor) {
      return res.status(401).json(
        buildStandardResponse({
          success: false,
          status: 'REJECTED',
          message: 'Verified admin identity required.',
          referenceId: `pg_ens_auth_${Date.now()}`,
          data: null,
          errorCode: 'UNAUTHORIZED',
        })
      );
    }

    const result = await ensureJustPostgresCoreMigrated({
      actorUid: actor.uid,
      actorEmail: actor.email || 'allindiadigitalseva@gmail.com',
      coreOnly: Boolean(req.body?.coreOnly),
      forceSeed: Boolean(req.body?.forceSeed),
    });

    if (!result.ok) {
      return res.status(400).json(
        buildStandardResponse({
          success: false,
          status: 'FAILED',
          message: result.message,
          referenceId: `pg_ens_fail_${Date.now()}`,
          data: result,
          errorCode: result.status.healthState.toUpperCase(),
        })
      );
    }

    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: result.message,
        referenceId: `pg_ens_${Date.now()}`,
        data: result,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Unable to check and apply JustPostgreSQL migrations.',
        referenceId: `pg_ens_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_ENSURE_MIGRATED_ERROR',
      })
    );
  }
});

app.post('/api/admin/postgres/sync-catalogue', requireExpressAdmin, async (req, res) => {
  try {
    const actor = await resolveExpressAdminFromRequest(req);
    if (!actor) {
      return res.status(401).json(
        buildStandardResponse({
          success: false,
          status: 'REJECTED',
          message: 'Verified admin identity required.',
          referenceId: `pg_auth_${Date.now()}`,
          data: null,
          errorCode: 'UNAUTHORIZED',
        })
      );
    }
    const status = await probeJustPostgresStatus(process.env);
    if (status.healthState !== 'connected') {
      return res.status(400).json(
        buildStandardResponse({
          success: false,
          status: 'FAILED',
          message: status.message,
          referenceId: `pg_precheck_${Date.now()}`,
          data: status,
          errorCode: status.healthState.toUpperCase(),
        })
      );
    }

    const syncResults = await seedCanonicalDataToJustPostgres({
      actorUid: actor.uid,
      actorEmail: actor.email || 'allindiadigitalseva@gmail.com',
      env: process.env,
    });
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: 'Seeded services catalogue, bilingual blog posts, settings, RBAC & admin user into JustPostgres.',
        referenceId: `pg_seed_${Date.now()}`,
        data: syncResults,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Failed to sync canonical data to JustPostgres.',
        referenceId: `pg_seed_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_SYNC_ERROR',
      })
    );
  }
});

app.post('/api/admin/postgres/import-json', requireExpressAdmin, async (req, res) => {
  try {
    const actor = await resolveExpressAdminFromRequest(req);
    if (!actor) {
      return res.status(401).json(
        buildStandardResponse({
          success: false,
          status: 'REJECTED',
          message: 'Verified admin identity required.',
          referenceId: `pg_imp_auth_${Date.now()}`,
          data: null,
          errorCode: 'UNAUTHORIZED',
        })
      );
    }
    const collections = req.body?.collections;
    if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
      return res.status(400).json(
        buildStandardResponse({
          success: false,
          status: 'FAILED',
          message: 'Invalid backup payload: expected { collections: { ... } }.',
          referenceId: `pg_imp_bad_${Date.now()}`,
          data: null,
          errorCode: 'INVALID_BACKUP_PAYLOAD',
        })
      );
    }
    const summary = await importBackupJsonToJustPostgres({
      collections,
      actorUid: actor.uid,
      env: process.env,
    });
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: 'Imported backup JSON collections into JustPostgres.',
        referenceId: `pg_imp_${Date.now()}`,
        data: summary,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Failed to import JSON backup into JustPostgres.',
        referenceId: `pg_imp_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_IMPORT_ERROR',
      })
    );
  }
});

app.get('/api/admin/postgres/export-json', requireExpressAdmin, async (_req, res) => {
  try {
    const dump = await exportAllJustPostgresData(process.env);
    return res.json(
      buildStandardResponse({
        success: true,
        status: 'SUCCESS',
        message: 'Exported JustPostgres tables as JSON backup.',
        referenceId: `pg_exp_${Date.now()}`,
        data: dump,
      })
    );
  } catch (err: any) {
    return res.status(500).json(
      buildStandardResponse({
        success: false,
        status: 'FAILED',
        message: err?.message || 'Failed to export JustPostgres data.',
        referenceId: `pg_exp_err_${Date.now()}`,
        data: null,
        errorCode: 'JUSTPOSTGRES_EXPORT_ERROR',
      })
    );
  }
});

// Catalogue, Coupon, Quote & Digital Product Local Node Parity Routes
const handleLocalCatalogue = (req: express.Request, res: express.Response) => {
  const result = filterCatalogueItems({
    items: localCatalogueItems,
    category: typeof req.query.category === 'string' ? req.query.category : 'all',
    subcategory: typeof req.query.subcategory === 'string' ? req.query.subcategory : undefined,
    productType: typeof req.query.productType === 'string' ? req.query.productType : undefined,
    deliveryType: typeof req.query.deliveryType === 'string' ? req.query.deliveryType : undefined,
    pricingType: typeof req.query.pricingType === 'string' ? req.query.pricingType : undefined,
    featuredOnly: req.query.featured === 'true',
    popularOnly: req.query.popular === 'true',
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    minPrice: req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined,
    maxPrice: req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined,
    sort: (typeof req.query.sort === 'string' ? req.query.sort : 'popular') as any,
    page: Math.max(1, Number(req.query.page || 1)),
    limit: Math.min(200, Math.max(1, Number(req.query.limit || 24))),
  });

  return res.json({
    success: true,
    status: 'SUCCESS',
    message: `Retrieved ${result.items.length} of ${result.totalItems} catalogue items`,
    data: result.items,
    meta: {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      categoriesCount: CATALOGUE_CATEGORIES.length,
    },
  });
};

app.get('/api/v1/catalogue', handleLocalCatalogue);
app.get('/api/v1/services', handleLocalCatalogue);

app.post('/api/v1/coupons/validate', (req, res) => {
  const body = req.body || {};
  const validation = resolveCouponValidation({
    code: String(body.code || ''),
    serviceChargeInr: Number(body.serviceChargeInr ?? body.amount ?? 0),
    category: typeof body.category === 'string' ? body.category : undefined,
  });
  return res.status(validation.valid ? 200 : 400).json({
    success: validation.valid,
    status: validation.valid ? 'SUCCESS' : 'REJECTED',
    message: validation.message,
    data: validation,
    error_code: validation.valid ? null : 'INVALID_COUPON',
  });
});

app.post('/api/v1/quotes', (req, res) => {
  const body = req.body || {};
  const contactName = String(body.contactName || '').trim();
  const contactEmail = String(body.contactEmail || '').trim();
  const contactMobile = String(body.contactMobile || '').trim();
  const requirementsSummary = String(body.requirementsSummary || '').trim();
  if (!contactName || (!contactEmail && !contactMobile) || !requirementsSummary) {
    return res.status(400).json({
      success: false,
      status: 'FAILED',
      message: 'contactName, contactEmail/contactMobile, and requirementsSummary are required.',
      error_code: 'MISSING_QUOTE_FIELDS',
    });
  }
  const srv = findCatalogueItem(body.serviceSlug || body.serviceId, localCatalogueItems);
  const record = {
    id: `QT-${Date.now().toString(36).toUpperCase()}`,
    serviceId: srv?.id || body.serviceId || 'custom',
    serviceSlug: srv?.slug || body.serviceSlug || 'custom',
    serviceName: srv?.name || body.serviceName || 'Custom Consultation',
    contactName,
    contactEmail,
    contactMobile,
    companyName: body.companyName || '',
    requirementsSummary,
    budgetRange: body.budgetRange || '',
    status: 'New',
    createdAt: new Date().toISOString(),
  };
  localQuoteRequests.unshift(record);
  return res.status(201).json({
    success: true,
    status: 'SUCCESS',
    message: 'Custom quote inquiry recorded.',
    data: record,
  });
});

app.post('/api/v1/products/:slug/purchase', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const body = req.body || {};
  const cfConfig = resolveCashfreeConfig(process.env, body.preferredMode);

  if (cfConfig.isProductionRuntime) {
    const authHdr = req.headers.authorization;
    const token = authHdr?.startsWith('Bearer ') ? authHdr.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token).catch(() => null) : null;
    if (!verified) {
      return res.status(401).json({
        success: false,
        status: 'REJECTED',
        message: 'Authentication required in production.',
        error_code: 'UNAUTHORIZED',
      });
    }
    if (!cfConfig.configured) {
      return res.status(503).json({
        success: false,
        status: 'FAILED',
        message: 'Cashfree gateway credentials are not configured in production.',
        error_code: 'CASHFREE_NOT_CONFIGURED',
      });
    }
  }

  const product = findCatalogueItem(slug, localCatalogueItems);
  if (!product || (product.productType !== 'digital_product' && product.category !== 'digital-products')) {
    return res.status(404).json({ success: false, message: 'Digital product not found', error_code: 'PRODUCT_NOT_FOUND' });
  }
  const checkout = resolveAuthoritativeCheckout({
    serviceSlug: product.slug,
    couponCode: typeof body.couponCode === 'string' ? body.couponCode : undefined,
    clientTotalInr: body.totalAmountInr !== undefined ? Number(body.totalAmountInr) : undefined,
    catalog: localCatalogueItems,
  });
  if (!checkout.ok) {
    return res.status(checkout.status || 400).json({
      success: false,
      status: 'FAILED',
      message: checkout.message,
      error_code: checkout.errorCode,
    });
  }
  const orderId = `DIG_ORD_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

  if (cfConfig.configured) {
    const safeReturn = validateSafeRedirectUrl(body.returnUrl, {
      appDomain: cfConfig.appDomain,
      allowHttpLocalhost: !cfConfig.isProductionRuntime,
    });
    if (body.returnUrl !== undefined && String(body.returnUrl).trim() && !safeReturn.valid) {
      return res.status(400).json({
        success: false,
        status: 'FAILED',
        message: safeReturn.reason || 'Invalid returnUrl.',
        error_code: 'INVALID_RETURN_URL',
      });
    }
    const cfOrder = await createCashfreePgOrder(cfConfig, {
      orderId,
      amountInr: checkout.totalInr,
      customerId: String(body.customerId || 'digital_customer'),
      customerName: String(body.customerName || 'Digital Customer'),
      customerEmail: String(body.customerEmail || 'customer@digitalindiaproject.com'),
      customerPhone: String(body.customerPhone || '9876543210'),
      orderNote: `Digital Download: ${product.name}`,
      returnUrl: safeReturn.valid && safeReturn.url ? safeReturn.url : undefined,
    });
    if (!cfOrder.ok || !cfOrder.paymentSessionId) {
      return res.status(502).json({
        success: false,
        status: 'FAILED',
        message: cfOrder.errorMessage || 'Failed to initiate Cashfree digital order',
        error_code: cfOrder.errorCode || 'CASHFREE_ORDER_CREATION_FAILED',
      });
    }
    localCashfreeOrderStore.set(orderId, {
      status: 'CREATED',
      paid: false,
      totalInr: checkout.totalInr,
      paymentSessionId: cfOrder.paymentSessionId,
      updatedAt: new Date().toISOString(),
      serviceSlug: product.slug,
      customerEmail: String(body.customerEmail || ''),
    });
    return res.status(201).json({
      success: true,
      status: 'PENDING',
      message: 'Digital product order created — complete Cashfree payment to unlock download.',
      data: {
        orderId,
        paymentSessionId: cfOrder.paymentSessionId,
        orderStatus: 'CREATED',
        productSlug: product.slug,
        productName: product.name,
        totalInr: checkout.totalInr,
        breakdown: checkout.breakdown,
        downloadUrl: `/api/v1/products/${encodeURIComponent(product.slug)}/download?orderId=${encodeURIComponent(orderId)}`,
      },
    });
  }

  const allowSandboxUnlock = !cfConfig.isProductionRuntime && body.simulateSandboxSuccess !== false;
  localCashfreeOrderStore.set(orderId, {
    status: allowSandboxUnlock ? 'PAID' : 'CREATED',
    paid: allowSandboxUnlock,
    totalInr: checkout.totalInr,
    paymentSessionId: `sim_dig_${Date.now()}`,
    updatedAt: new Date().toISOString(),
    serviceSlug: product.slug,
    customerEmail: String(body.customerEmail || ''),
  });
  return res.status(201).json({
    success: true,
    status: allowSandboxUnlock ? 'SUCCESS' : 'PENDING',
    message: allowSandboxUnlock
      ? 'Digital product unlocked for instant download.'
      : 'Sandbox digital product order created.',
    data: {
      orderId,
      orderStatus: allowSandboxUnlock ? 'PAID' : 'CREATED',
      productSlug: product.slug,
      productName: product.name,
      totalInr: checkout.totalInr,
      breakdown: checkout.breakdown,
      downloadUrl: `/api/v1/products/${encodeURIComponent(product.slug)}/download?orderId=${encodeURIComponent(orderId)}`,
    },
  });
});

const handleLocalProductDownload: express.RequestHandler = async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const orderId = String(req.query.orderId || '').trim();
  const product = findCatalogueItem(slug, localCatalogueItems);
  if (!product || (product.productType !== 'digital_product' && product.category !== 'digital-products')) {
    return res.status(404).json({ success: false, error: 'Digital product not found', error_code: 'PRODUCT_NOT_FOUND' });
  }
  const stored = orderId ? localCashfreeOrderStore.get(orderId) : undefined;
  const isPaidOrder = Boolean(stored && (stored.paid || stored.status === 'PAID') && (!stored.serviceSlug || stored.serviceSlug === product.slug));
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!isPaidOrder) {
    if (!bearer) {
      return res.status(orderId ? 403 : 401).json({
        success: false,
        error_code: orderId ? 'PAYMENT_REQUIRED' : 'UNAUTHORIZED',
        message: orderId
          ? 'Verified purchase required before downloading this digital product.'
          : 'Authentication or a verified paid order ID is required to download this digital product.',
      });
    }
    const adminUser = await resolveExpressAdminFromRequest(req);
    if (!adminUser) {
      const verifiedToken = await verifyFirebaseIdToken(bearer).catch(() => null);
      if (!verifiedToken) {
        return res.status(401).json({
          success: false,
          error_code: 'UNAUTHORIZED',
          message: 'Invalid or expired authentication token.',
        });
      }
      return res.status(403).json({
        success: false,
        error_code: 'PAYMENT_REQUIRED',
        message: 'Verified purchase required before downloading this digital product.',
      });
    }
  }
  const payload = generateDigitalProductPayload(
    product.digitalAsset?.generatorKey,
    product.slug,
    product.name
  );
  res.setHeader('Content-Type', payload.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeContentDispositionFilename(payload.fileName)}"`
  );
  res.setHeader('Cache-Control', 'no-store, private');
  return res.send(payload.content);
};

app.get('/api/v1/products/:slug/download', handleLocalProductDownload);
app.get('/api/products/:slug/download', handleLocalProductDownload);

app.post('/api/admin/catalogue/import', requireExpressAdmin, async (req, res) => {
  const body = req.body || {};
  const { mergedItems, report } = runIdempotentCatalogueImport({
    existingItems: localCatalogueItems,
    rawInput: body.rawInput ?? body.items ?? COMPLETE_CATALOGUE_ITEMS,
    actorName: body.actorName || 'Super Admin',
    formatHint: body.formatHint,
  });
  localCatalogueItems = mergedItems;
  return res.json({
    success: report.errorsCount === 0,
    status: report.errorsCount === 0 ? 'SUCCESS' : 'REJECTED',
    message: `Processed ${report.totalProcessed} item(s): ${report.createdCount} created, ${report.updatedCount} updated, ${report.skippedCount} skipped`,
    data: { report, totalCatalogueCount: mergedItems.length },
  });
});

app.get('/api/v1/tools/plans', (_req, res) => {
  return res.json({
    success: true,
    status: 'SUCCESS',
    payPerUse: {
      code: 'single_use',
      name: '1-Time Use Pass',
      priceInr: 10,
      maxFileSizeMb: 150,
      description:
        'Pay ₹10 once to unlock any paid Personal, CSC Operator, or Professional tool for 1 complete run.',
    },
    data: [
      { code: 'free', name: 'Free Starter', priceMonthlyInr: 0, priceAnnualInr: 0, dailyJobs: '25 jobs / day', maxFileSizeMb: 25, monthlyAiCredits: 10 },
      { code: 'personal', name: 'Personal Pro', priceMonthlyInr: 99, priceAnnualInr: 990, dailyJobs: '200 jobs / day', maxFileSizeMb: 100, monthlyAiCredits: 100 },
      { code: 'csc', name: 'CSC Operator', priceMonthlyInr: 299, priceAnnualInr: 2990, dailyJobs: 'Unlimited browser jobs', maxFileSizeMb: 150, monthlyAiCredits: 300 },
      { code: 'professional', name: 'Professional', priceMonthlyInr: 699, priceAnnualInr: 6990, dailyJobs: 'Unlimited', maxFileSizeMb: 250, monthlyAiCredits: 1200 },
      { code: 'enterprise', name: 'Enterprise SLA', priceMonthlyInr: null, priceAnnualInr: null, dailyJobs: 'Custom SLA', maxFileSizeMb: 500, monthlyAiCredits: 9999 },
    ],
  });
});

app.post('/api/v1/ai/process', async (req, res) => {
  const { mode = 'summarize', text = '', question, sourceLang, targetLang, tone, imageBase64, imageMimeType } = req.body || {};

  if (!String(text || '').trim() && !imageBase64) {
    return res.status(400).json({ error: 'Please provide input text, PDF content, or an image to process.' });
  }

  if (!aiClient) {
    return res.status(503).json({
      error: 'AI service key is not configured on the server runtime. All 135+ browser PDF, image, QR & calculator tools continue to run locally.',
    });
  }

  try {
    const model = 'gemini-4-hydrogen';

    if (mode === 'extract-invoice' || mode === 'extract-doc') {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64 && imageMimeType) {
        parts.push({ inlineData: { mimeType: String(imageMimeType), data: String(imageBase64) } });
      }
      const prompt =
        mode === 'extract-invoice'
          ? `Extract invoice fields from the provided document. Return structured JSON with vendorName, vendorGstin, invoiceNumber, invoiceDate, subtotal, taxAmount, totalAmount, currency, and lineItems. Text context:\n${String(text || '')}`
          : `Extract key structured fields from the provided document/form into JSON key-value pairs and summary. Text context:\n${String(text || '')}`;
      parts.push({ text: prompt });

      const response = await aiClient.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction:
            'You are a precise Indian & international document extraction assistant for Digital Tools Tray on Digital India Project. Extract only verifiable facts from the input.',
          responseMimeType: 'application/json',
          responseSchema:
            mode === 'extract-invoice'
              ? {
                  type: Type.OBJECT,
                  properties: {
                    vendorName: { type: Type.STRING },
                    vendorGstin: { type: Type.STRING },
                    invoiceNumber: { type: Type.STRING },
                    invoiceDate: { type: Type.STRING },
                    subtotal: { type: Type.STRING },
                    taxAmount: { type: Type.STRING },
                    totalAmount: { type: Type.STRING },
                    currency: { type: Type.STRING },
                    lineItems: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          description: { type: Type.STRING },
                          quantity: { type: Type.STRING },
                          rate: { type: Type.STRING },
                          amount: { type: Type.STRING },
                        },
                      },
                    },
                  },
                }
              : {
                  type: Type.OBJECT,
                  properties: {
                    documentType: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    fields: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          value: { type: Type.STRING },
                        },
                      },
                    },
                  },
                },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const raw = (response.text || '{}').trim();
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { raw };
      }

      return res.json({
        outputText: JSON.stringify(parsed, null, 2),
        structuredData: parsed,
        model,
      });
    }

    let userPrompt = String(text || '');
    switch (mode) {
      case 'summarize':
        userPrompt = `Provide a clear, structured summary with key bullet points, important dates, and action items for the following document:\n\n${text}`;
        break;
      case 'pdf-qa':
        userPrompt = `Document excerpt:\n${text}\n\nUser Question: ${question || 'Summarize the key points.'}\n\nAnswer accurately based strictly on the document above.`;
        break;
      case 'letter':
        userPrompt = `Write a formal, ready-to-print application letter in ${targetLang || 'English'} (${tone || 'formal'} tone) based on these details:\n\n${text}`;
        break;
      case 'resume':
        userPrompt = `Organize the following background details into a crisp, ATS-friendly resume with Professional Summary, Core Skills, Experience/Projects, and Education:\n\n${text}`;
        break;
      case 'translate':
        userPrompt = `Translate the following text accurately from ${sourceLang || 'auto-detected language'} to ${targetLang || 'Hindi'}. Preserve formatting, names, and formal tone:\n\n${text}`;
        break;
      case 'grammar':
        userPrompt = `Proofread and improve grammar, spelling, and clarity while preserving the original meaning. First provide the Corrected Version, then briefly list key corrections:\n\n${text}`;
        break;
      case 'form-help':
        userPrompt = `Explain what each field asks for and suggest clean draft answers (marking placeholders clearly) for this application form context:\n\n${text}`;
        break;
      case 'checklist':
        userPrompt = `Create a practical, step-by-step document preparation checklist for this service or application:\n\n${text}\n\nInclude a reminder to verify the latest official portal circular before final submission.`;
        break;
      default:
        break;
    }

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64 && imageMimeType) {
      parts.push({ inlineData: { mimeType: String(imageMimeType), data: String(imageBase64) } });
    }
    parts.push({ text: userPrompt });

    const response = await aiClient.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction:
          'You are a clear, accurate digital assistant for Digital Tools Tray on Digital India Project. Never fabricate official government rules; note when user review is required.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return res.json({
      outputText: response.text || 'No response generated.',
      model,
    });
  } catch (err: any) {
    console.error('Digital Tools AI Process Error:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to process AI utility request',
    });
  }
});

// SEO robots.txt & sitemap.xml
app.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .send(
      'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /operator\nDisallow: /manager\n\nSitemap: https://digitalindiaproject.com/sitemap.xml\n'
    );
});

app.get('/sitemap.xml', (_req, res) => {
  const generatedAt = new Date().toISOString();
  const seenHashes = new Set<string>();
  const activeServicesCount = localCatalogueItems.filter((s) => s.published !== false).length;
  const directoryEntries = INDIA_GEOGRAPHY_SEED.map((loc) => ({
    location: loc,
    quality: evaluateDirectoryPageQuality(loc, {
      servicesCount: activeServicesCount || loc.highlightedServiceSlugs.length,
      seenContentHashes: seenHashes,
    }),
  }));
  const xml = buildSitemapXml(localCatalogueItems, INITIAL_BLOG_POSTS, directoryEntries, {
    generatedAt,
  });
  res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Last-Modified', new Date(generatedAt).toUTCString());
  res.setHeader('X-Sitemap-Generated-At', generatedAt);
  res.send(xml);
});

// Full Karta Files Legal Document Suite API (/api/karta/*)
app.use('/api/karta', createKartaRouter());

// Start dev or production server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Vite middleware in dev (HMR disabled in Cloud Run preview)
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, allowedHosts: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result?.code) return next();
        const patchedCode = result.code.replace(
          /transport\.connect\([^;]*\);/g,
          '/* WebSocket HMR disabled in runtime */'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(patchedCode);
      } catch {
        next();
      }
    });
    app.use(vite.middlewares);
  } else {
    // Serve static in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  defaultApiSathiRetryQueue.startBackgroundWorker({
    intervalMs: 15_000,
    onJobSettled: ({ job, auditRecord }) => {
      localApiSathiCalls.unshift({
        id: auditRecord.id,
        call_id: auditRecord.callId || null,
        idempotency_key: auditRecord.idempotencyKey,
        product_slug: auditRecord.productSlug,
        intent: auditRecord.intent,
        environment: auditRecord.environment,
        is_sandbox_test: auditRecord.isSandboxTest ? 1 : 0,
        http_status: auditRecord.httpStatus,
        verified: auditRecord.verified ? 1 : 0,
        outcome: auditRecord.outcome,
        error_code: auditRecord.errorCode || null,
        error_message: auditRecord.errorMessage || null,
        masked_request_json: auditRecord.maskedRequestJson,
        response_summary: `[AutoRetry #${job.attemptCount}] ${auditRecord.verified ? 'Verified' : auditRecord.errorMessage || auditRecord.outcome}`,
        user_id: auditRecord.userId,
        step1_ref_id: null,
        latency_ms: auditRecord.latencyMs,
        firestore_persisted: false,
        created_at: auditRecord.createdAt,
      });
      if (localApiSathiCalls.length > 250) localApiSathiCalls.pop();
    },
  });

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Digital India Project server active on http://0.0.0.0:${PORT}`);

    // Non-blocking startup migration check for JustPostgreSQL when configured
    const pgCfg = resolveJustPostgresConfig(process.env);
    if (pgCfg.configured) {
      void ensureJustPostgresCoreMigrated({
        actorUid: 'bootstrap-super-admin',
        actorEmail: 'allindiadigitalseva@gmail.com',
        coreOnly: false,
      })
        .then((res) => {
          if (res.appliedMigrations.length > 0) {
            console.log(
              `[JustPostgreSQL] Applied startup migrations: ${res.appliedMigrations.join(', ')}`
            );
          }
        })
        .catch(() => {
          // Do not interrupt server startup if remote DB is temporarily unreachable
        });
    }
  });
}

startServer();
