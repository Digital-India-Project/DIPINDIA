# DIPINDIA — Module Extraction Candidates

Modules inside DIPINDIA are ranked below by **extraction readiness**, **coupling risk**, and **target repository**.

## Tier 1 — Immediate Extraction Candidates (Pure TypeScript, Zero Runtime Coupling)
| Module(s) | Current Path | Target Repo | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| Domain Types & Enums | `src/types.ts` | `dip-core` | None | Canonical entity types across UI and backend. |
| Finance & Paise Engine | `src/lib/finance.ts` | `dip-core` | `src/types.ts` | Integer currency math, GST, coupon validation, partner commissions. |
| Workflow State Machine | `src/lib/workflow.ts` | `dip-core` | `src/types.ts`, `rbac.ts` | Transition rules, SLA calculation, KYC/application progress builders. |
| Dynamic Form Engine | `src/lib/formEngine.ts` | `dip-core` | `src/types.ts` | Safe declarative condition evaluation & schema validation. |
| URL & Header Safety | `src/lib/urlSafety.ts` | `dip-security` | None | Redirect allowlisting, deliverable URL safety, `Content-Disposition` sanitization. |
| RBAC Policy Matrix | `src/lib/rbac.ts` | `dip-security` | `src/types.ts` | Role normalization, permissions map, application isolation predicate. |
| API Response & HMAC Helpers | `worker/middleware/security.ts` (crypto/envelope parts) | `dip-security` | Web Crypto (`crypto.subtle`) | Portable across Cloudflare Workers and Node `20+`. |

## Tier 2 — Near-Term Extraction Candidates (Requires Light Adapter Wrapping)
| Module(s) | Current Path | Target Repo | Coupling to Resolve |
| --- | --- | --- | --- |
| Shared UI Primitives | `src/components/common/*`, `src/components/dashboard/ApplicationStatusBadge.tsx` | `dip-ui` | Decouple `LanguageContext` / `AuthContext` hooks into explicit component props. |
| Typed REST Client | `src/services/backendApi.ts` | `dip-sdk` | Extract Firebase token getter callback (`getAuthToken: () => Promise<string \| null>`) as an injected config dependency. |
| API Sathi Client & Analytics | `src/services/apiSathi.ts`, `src/lib/apiSathiAnalytics.ts` | `dip-api` | Separate pure HTTP client + PII masker from Firestore persistence callback. |
| Cashfree PG Core Client | `worker/services/cashfreeService.ts` | `dip-core` / `dip-automation` | Separate pure Cashfree REST/HMAC signature functions from D1 `DatabaseRegistry` reconciliation writes. |

## Tier 3 — Later Extraction Candidates (Stateful / Tightly Bound)
| Module(s) | Current Path | Target Repo | Why Keep in DIPINDIA For Now |
| --- | --- | --- | --- |
| `DataContext.tsx` & Portal Pages | `src/context/DataContext.tsx`, `src/pages/*` | Keep in DIPINDIA | Core interactive application authority; refactor internally before decomposing UI packages. |
| Karta Legal Workbench | `server/karta/*`, `worker/routes/kartaRoutes.ts` | Keep in DIPINDIA (or future vertical module) | Tightly coupled to curated legal templates (`data/karta-source/*`) and DOCX/PDF exporters. |
| Worker D1/R2 Registries & Migrations | `worker/config/*`, `migrations/*` | Co-owned with `dip-infrastructure` | Infra bindings move to `dip-infrastructure` IaC once multi-repo CI/CD is active. |
