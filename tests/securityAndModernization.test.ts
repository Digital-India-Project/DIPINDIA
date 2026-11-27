import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  isSafeDeliverableUrl,
  sanitizeContentDispositionFilename,
  validateSafeRedirectUrl,
} from '../src/lib/urlSafety';
import {
  computeSlaHoursRemaining,
  getApplicationProgress,
  getKycVerificationProgress,
  validateStatusTransition,
} from '../src/lib/workflow';
import {
  canAccessApplication,
  getHomeRouteForRole,
  hasPermission,
  normalizeRole,
} from '../src/lib/rbac';
import {
  calculateOrderTotalsPaise,
  calculatePartnerCommission,
  fromPaise,
  toPaise,
  validateCouponCode,
} from '../src/lib/finance';
import { isFieldVisible, validateFormSubmission } from '../src/lib/formEngine';
import {
  isPaymentAmountMatching,
  normalizeCashfreeLifecycleState,
  validateWebhookTimestamp,
  verifyCashfreeWebhookWithAnySecret,
} from '../worker/services/cashfreeService';
import {
  createExpressRateLimiter,
  expressSecurityHeadersMiddleware,
} from '../server/middleware/expressSecurity';
import { hmacSha256Base64 } from '../worker/middleware/security';
import type { CouponRecord, ServiceFormField } from '../src/types';

describe('URL Safety & Download Header Sanitization', () => {
  it('blocks dangerous schemes, control chars, protocol-relative URLs, and untrusted external redirect hosts', () => {
    const jsScheme = validateSafeRedirectUrl('javascript:alert(1)', {
      appDomain: 'https://digitalindiaproject.com',
    });
    assert.equal(jsScheme.valid, false);

    const dataScheme = validateSafeRedirectUrl('data:text/html,<script>alert(1)</script>', {
      appDomain: 'https://digitalindiaproject.com',
    });
    assert.equal(dataScheme.valid, false);

    const protoRel = validateSafeRedirectUrl('//evil.example/phish', {
      appDomain: 'https://digitalindiaproject.com',
    });
    assert.equal(protoRel.valid, false);

    const evilHost = validateSafeRedirectUrl('https://evil-phish.example.com/callback', {
      appDomain: 'https://digitalindiaproject.com',
      fallbackUrl: 'https://digitalindiaproject.com/operator-enroll?digilocker=done',
    });
    assert.equal(evilHost.valid, false);
    assert.equal(evilHost.url, 'https://digitalindiaproject.com/operator-enroll?digilocker=done');
  });

  it('allows trusted digitalindiaproject.com, subdomain, and relative paths cleanly', () => {
    const prodRedirect = validateSafeRedirectUrl('https://portal.digitalindiaproject.com/checkout/return', {
      appDomain: 'https://digitalindiaproject.com',
      allowHttpLocalhost: false,
    });
    assert.equal(prodRedirect.valid, true);
    assert.equal(prodRedirect.url, 'https://portal.digitalindiaproject.com/checkout/return');

    const relRedirect = validateSafeRedirectUrl('/operator-enroll?digilocker=done', {
      appDomain: 'https://digitalindiaproject.com',
    });
    assert.equal(relRedirect.valid, true);
    assert.equal(relRedirect.url, 'https://digitalindiaproject.com/operator-enroll?digilocker=done');
  });

  it('validates completion deliverable URLs against XSS / data URIs', () => {
    assert.equal(isSafeDeliverableUrl('/api/v1/storage/doc_123/download'), true);
    assert.equal(isSafeDeliverableUrl('https://cdn.digitalindiaproject.com/certs/cert-1.pdf'), true);
    assert.equal(isSafeDeliverableUrl('javascript:alert(document.cookie)'), false);
    assert.equal(isSafeDeliverableUrl('data:application/pdf;base64,JVBERi0x'), false);
    assert.equal(isSafeDeliverableUrl('//malicious.host/payload.pdf'), false);
  });

  it('sanitizes Content-Disposition filenames to prevent CRLF header injection and path traversal', () => {
    assert.equal(
      sanitizeContentDispositionFilename('../../etc/passwd"\r\nX-Injected: true.pdf'),
      'passwdX-Injected__true.pdf'
    );
    assert.equal(sanitizeContentDispositionFilename('...'), 'download.bin');
    assert.equal(sanitizeContentDispositionFilename('certificate-2026_v1.pdf'), 'certificate-2026_v1.pdf');
  });
});

describe('Express Security & Rate Limiting Middleware Parity', () => {
  it('sets correlation X-Request-Id, strict framing, nosniff, and no-store headers on API routes', () => {
    const headers = new Map<string, string>();
    const req: any = { headers: {}, path: '/api/v1/payments/orders' };
    const res: any = {
      setHeader: (k: string, v: string) => headers.set(k.toLowerCase(), String(v)),
    };
    let nextCalled = false;

    expressSecurityHeadersMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.ok(headers.get('x-request-id')?.startsWith('req_'));
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(headers.get('cache-control') || '', /no-store/);
  });

  it('exempts /__/auth/iframe from X-Frame-Options while enforcing SAMEORIGIN on /__/auth/*', () => {
    const iframeHeaders = new Map<string, string>();
    expressSecurityHeadersMiddleware(
      { headers: {}, path: '/__/auth/iframe' } as any,
      { setHeader: (k: string, v: string) => iframeHeaders.set(k.toLowerCase(), v) } as any,
      () => {}
    );
    assert.equal(iframeHeaders.has('x-frame-options'), false);

    const handlerHeaders = new Map<string, string>();
    expressSecurityHeadersMiddleware(
      { headers: {}, path: '/__/auth/handler' } as any,
      { setHeader: (k: string, v: string) => handlerHeaders.set(k.toLowerCase(), v) } as any,
      () => {}
    );
    assert.equal(handlerHeaders.get('x-frame-options'), 'SAMEORIGIN');
  });

  it('throttles abusive /api calls after threshold while exempting /api/health and Cashfree webhooks', () => {
    const limiter = createExpressRateLimiter({ maxRequests: 10, windowMs: 60_000 });
    const makeRes = () => {
      let statusCode = 200;
      let body: any = null;
      return {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: any) {
          body = payload;
          return this;
        },
        getStatus: () => statusCode,
        getBody: () => body,
      };
    };

    const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 10; i++) {
      let passed = false;
      limiter({ baseUrl: '/api', path: '/v1/quotes', headers: { 'cf-connecting-ip': testIp } } as any, makeRes() as any, () => {
        passed = true;
      });
      assert.equal(passed, true);
    }

    const blockedRes = makeRes();
    let blockedNext = false;
    limiter({ baseUrl: '/api', path: '/v1/quotes', headers: { 'cf-connecting-ip': testIp } } as any, blockedRes as any, () => {
      blockedNext = true;
    });
    assert.equal(blockedNext, false);
    assert.equal(blockedRes.getStatus(), 429);
    assert.equal(blockedRes.getBody()?.error_code, 'RATE_LIMIT_EXCEEDED');

    // Webhooks must never be dropped by general rate limiting
    let webhookPassed = false;
    limiter(
      { baseUrl: '/api', path: '/webhooks/cashfree', headers: { 'cf-connecting-ip': testIp } } as any,
      makeRes() as any,
      () => {
        webhookPassed = true;
      }
    );
    assert.equal(webhookPassed, true);
  });
});

describe('RBAC, Application Isolation & Workflow Transitions', () => {
  it('enforces strict role normalization and customer self-escalation limits', () => {
    assert.equal(normalizeRole('SuperAdmin'), 'super_admin');
    assert.equal(normalizeRole('agent'), 'partner');
    assert.equal(normalizeRole('b2b'), 'business');
    assert.equal(normalizeRole('unknown-role'), 'customer');

    assert.equal(hasPermission({ role: 'customer', permissions: [] }, 'applications.complete'), false);
    assert.equal(hasPermission({ role: 'operator', permissions: [] }, 'applications.complete'), true);
    assert.equal(hasPermission({ role: 'manager', permissions: [] }, 'payments.refund'), false);
    assert.equal(hasPermission({ role: 'super_admin', permissions: [] }, 'rbac.manage'), true);

    assert.equal(getHomeRouteForRole('manager'), 'manager');
    assert.equal(getHomeRouteForRole('operator'), 'operator');
    assert.equal(getHomeRouteForRole('partner'), 'partner');
    assert.equal(getHomeRouteForRole('business'), 'b2b');
    assert.equal(getHomeRouteForRole('customer'), 'dashboard');
  });

  it('isolates application visibility per role and ownership bindings', () => {
    const app = {
      userId: 'cust_1',
      userEmail: 'citizen@example.com',
      assignedOperatorId: 'op_1',
      collectedByUid: 'partner_user_1',
      partnerId: 'pt_1',
      businessId: 'biz_1',
    };

    assert.equal(canAccessApplication({ id: 'cust_1', email: 'citizen@example.com', role: 'customer' }, app), true);
    assert.equal(canAccessApplication({ id: 'cust_2', email: 'other@example.com', role: 'customer' }, app), false);
    assert.equal(canAccessApplication({ id: 'op_1', email: 'op1@dip.in', role: 'operator' }, app), true);
    assert.equal(canAccessApplication({ id: 'op_2', email: 'op2@dip.in', role: 'operator' }, app), false);
    assert.equal(canAccessApplication({ id: 'pt_u', email: 'p@dip.in', role: 'partner', partnerId: 'pt_1' }, app), true);
    assert.equal(canAccessApplication({ id: 'mgr_1', email: 'm@dip.in', role: 'manager' }, app), true);
  });

  it('blocks illegal workflow transitions, missing rejection remarks, and terminal mutations', () => {
    const customerApprove = validateStatusTransition({
      fromStatus: 'Under Review',
      toStatus: 'Completed',
      actorRole: 'customer',
    });
    assert.equal(customerApprove.valid, false);

    const operatorNoReasonReject = validateStatusTransition({
      fromStatus: 'Under Review',
      toStatus: 'Rejected',
      actorRole: 'operator',
      reason: 'no',
    });
    assert.equal(operatorNoReasonReject.valid, false);

    const terminalChange = validateStatusTransition({
      fromStatus: 'Completed',
      toStatus: 'Cancelled',
      actorRole: 'operator',
      reason: 'Attempting rollback',
    });
    assert.equal(terminalChange.valid, false);

    const validAdvance = validateStatusTransition({
      fromStatus: 'Processing',
      toStatus: 'Completed',
      actorRole: 'operator',
    });
    assert.equal(validAdvance.valid, true);

    assert.equal(getApplicationProgress('Completed').percent, 100);
    assert.equal(getKycVerificationProgress({ role: 'partner', partnerStatus: 'Approved' }).percent, 100);
    assert.equal(computeSlaHoursRemaining(new Date(Date.now() - 80 * 3600_000).toISOString(), 72).isOverdue, true);
  });
});

describe('Finance Precision, Dynamic Forms & Cashfree Crypto Integrity', () => {
  it('computes integer paise breakdowns cleanly without GST on statutory govt fees', () => {
    assert.equal(toPaise(149.99), 14999);
    assert.equal(fromPaise(14999), 149.99);

    const totals = calculateOrderTotalsPaise({
      serviceChargeInr: 1000,
      govtFeesInr: 500,
      urgentFeeInr: 200,
      discountInr: 200,
      taxRateBps: 1800,
      taxInclusive: false,
    });
    // Taxable = (1000 + 200) - 200 = 1000 INR -> 18% GST = 180 INR; Total = 1000 + 180 + 500 = 1680 INR
    assert.equal(totals.taxPaise, 18000);
    assert.equal(totals.totalPaise, 168000);

    const couponList: CouponRecord[] = [
      {
        id: 'cpn_1',
        code: 'DIGITAL10',
        description: '10% off up to ₹150',
        discountType: 'percentage',
        discountPercentBps: 1000,
        discountAmountInr: 0,
        minOrderAmountInr: 500,
        maxDiscountInr: 150,
        applicableCategories: [],
        usedCount: 0,
        usageLimit: 100,
        isActive: true,
      },
    ];
    const validCoupon = validateCouponCode({ code: 'digital10', subtotalInr: 2000, coupons: couponList });
    assert.equal(validCoupon.valid, true);
    assert.equal(validCoupon.discountInr, 150);

    const comm = calculatePartnerCommission({
      partnerId: 'pt_1',
      serviceId: 'srv_1',
      serviceFeePaise: 100000,
      tdsBps: 500,
      rules: [
        {
          id: 'rule_exact',
          name: 'Exact Match',
          partnerId: 'pt_1',
          serviceId: 'srv_1',
          commissionType: 'percentage',
          percentageBps: 2000,
          fixedAmountPaise: 0,
          minOrderPaise: 0,
          isActive: true,
        },
      ],
    });
    assert.equal(comm.matchedRuleId, 'rule_exact');
    assert.equal(comm.commissionPaise, 20000);
    assert.equal(comm.tdsPaise, 1000);
    assert.equal(comm.netPayablePaise, 19000);
  });

  it('validates conditional dynamic form schemas accurately across visible and hidden fields', () => {
    const fields: ServiceFormField[] = [
      { id: 'hasGst', label: 'Registered under GST?', type: 'select', required: true, options: ['yes', 'no'] },
      {
        id: 'gstin',
        label: 'GSTIN',
        type: 'text',
        required: true,
        validationRegex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
        showIf: { fieldId: 'hasGst', operator: 'equals', value: 'yes' },
      },
      { id: 'email', label: 'Email', type: 'email', required: true },
    ];

    assert.equal(isFieldVisible(fields[1], { hasGst: 'no' }), false);
    const noGstResult = validateFormSubmission(fields, { hasGst: 'no', email: 'citizen@example.com' });
    assert.equal(noGstResult.valid, true);

    const invalidGstResult = validateFormSubmission(fields, {
      hasGst: 'yes',
      gstin: 'BADGST',
      email: 'citizen@example.com',
    });
    assert.equal(invalidGstResult.valid, false);
    assert.ok(invalidGstResult.errors.gstin);
  });

  it('verifies Cashfree HMAC-SHA256 webhook signatures, rejects tampering, and enforces anti-replay windows', async () => {
    const secret = `whsec_${crypto.randomBytes(12).toString('hex')}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: 'CF_ORD_1001', order_amount: 499 } },
    });
    const validSig = await hmacSha256Base64(secret, `${timestamp}${rawBody}`);

    const verified = await verifyCashfreeWebhookWithAnySecret([secret], timestamp, rawBody, validSig);
    assert.equal(verified.valid, true);

    const tampered = await verifyCashfreeWebhookWithAnySecret(
      [secret],
      timestamp,
      rawBody.replace('499', '1'),
      validSig
    );
    assert.equal(tampered.valid, false);

    const staleTs = String(Math.floor((Date.now() - 2 * 3600_000) / 1000));
    assert.equal(validateWebhookTimestamp(staleTs, { enforce: true, maxSkewSeconds: 600 }).valid, false);
    assert.equal(validateWebhookTimestamp(timestamp, { enforce: true, maxSkewSeconds: 600 }).valid, true);

    assert.equal(isPaymentAmountMatching(49900, 499), true);
    assert.equal(isPaymentAmountMatching(49900, 1), false);
    assert.equal(normalizeCashfreeLifecycleState('PAID', 'SUCCESS'), 'PAID');
    assert.equal(normalizeCashfreeLifecycleState('USER_DROPPED', 'USER_DROPPED'), 'CANCELLED');
  });
});
