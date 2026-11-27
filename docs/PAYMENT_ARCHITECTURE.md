# DIPINDIA — Payment Architecture

## 1. Design Goals
- Zero client-side trust for fees, taxes, discounts, or payment status.
- Integer minor-currency (`paise`) arithmetic (`src/lib/finance.ts`) eliminating floating-point rounding drift.
- Strict separation between sandbox preview behavior and production Cashfree Payment Gateway enforcement.

## 2. Authoritative Order Creation Flow
1. **Checkout Calculation (`src/lib/catalogueServer.ts`)**:
   - `resolveAuthoritativeCheckout()` looks up service pricing (`COMPLETE_CATALOGUE_ITEMS` / D1 `services`), evaluates `urgentProcessing` surcharge, validates active promo codes via `validateCouponCode()`, and invokes `calculateOrderTotalsPaise()`.
   - **Tax Rule**: Statutory `govtFeesInr` and verified `thirdPartyFeesInr` pass through at `0%` GST; only taxable service/urgent charges accrue configurable `taxRateBps`.
   - If the client-supplied total deviates from the server calculation (`> 100` paise tolerance), order creation fails with `PRICE_TAMPER_OR_MISMATCH`.
2. **Gateway Session Creation (`worker/services/cashfreeService.ts`, `worker/routes/v1.ts`, `server.ts`)**:
   - `resolveCashfreeConfig()` resolves `CASHFREE_CLIENT_ID` / `CASHFREE_CLIENT_SECRET` / `CASHFREE_WEBHOOK_SECRET` (or sandbox variants), enforces `isProductionRuntime`, and validates `returnUrl` via `validateSafeRedirectUrl()` to prevent open redirects.
   - Calls Cashfree PG `/pg/orders` with `x-idempotency-key` and order tags (`application_id`, `environment`), persisting `payment_orders` (`status = 'CREATED'`).
   - Production runtimes (`ENVIRONMENT=production` or `NODE_ENV=production`) reject unauthenticated order creation (`401`) and refuse simulated fallback if Cashfree credentials are missing (`503 CASHFREE_NOT_CONFIGURED`).

## 3. Webhook Security & Anti-Replay (`worker/services/cashfreeService.ts`, `worker/services/paymentReconciliation.ts`)
- **Endpoints**: `POST /api/webhooks/cashfree` and `POST /api/v1/payments/webhook` (exempt from general API rate limiting so gateway retries are never dropped).
- **Signature Verification**:
  - Reads raw UTF-8 request body before JSON parsing.
  - Computes `HMAC-SHA256` Base64 over `${x-webhook-timestamp}${rawBody}` and compares using constant-time equality (`constantTimeEqual`) across active and rotated secrets (`verifyCashfreeWebhookWithAnySecret`).
- **Timestamp Anti-Replay**: `validateWebhookTimestamp()` rejects missing, malformed, or skewed timestamps exceeding the replay window (`600s` default) when enforced.
- **Idempotency & Amount Guard**:
  - Events are logged in `payment_webhook_events` (`0008_cashfree_payment_ecosystem.sql`) with replay counters.
  - `isPaymentAmountMatching()` ensures paid gateway amount matches expected `total_paise` within `₹1` (`100` paise), flagging discrepancies as `PAYMENT_AMOUNT_MISMATCH` (`409`).
  - `normalizeCashfreeLifecycleState()` enforces monotonic progression (`CREATED` -> `PENDING` -> `PROCESSING` -> `PAID` -> `PARTIALLY_REFUNDED` -> `REFUNDED`).

## 4. Verification, Reconciliation & Refunds
- **Manual/Return Verification (`POST /api/payments/verify`, `GET /api/v1/payments/orders/:orderId/status`)**: Queries Cashfree PG order/payments endpoints directly and triggers `reconcilePaidOrder()`. `simulateSandboxSuccess` is strictly blocked when `isProductionRuntime` is true.
- **Background Reconciliation Sweep (`POST /api/admin/payments/reconcile`, `runCashfreeReconciliationSweep`)**: Polls stale `CREATED`/`PENDING` orders against Cashfree PG to recover missed webhooks.
- **Refunds (`createCashfreeRefund`, `reconcileRefundOutcome`)**: Restricted to `payments.refund` permission (`admin` / `super_admin`), tracks `cf_refund_id`, `refund_arn`, `refund_amount_paise`, and `STANDARD`/`INSTANT` speed.
- **Alerts & Testing (`paymentAlertService.ts`, `SandboxWebhookTestModal.tsx`)**: Dispatches payment alerts and provides admin-signed sandbox webhook simulation diagnostics without ever executing live transactions.
