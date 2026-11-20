import crypto from 'node:crypto';
import {
  AdminProviderConfig,
  DocumentValidationReport,
  EStampQuoteResult,
  EStampVerifyResult,
  PublicProviderStatus,
  ValidationCheckItem,
} from '../../src/karta/shared/types';

let inMemorySavedProviderConfig: Partial<StoredProviderConfig> | null = null;

const SHCIL_STATE_CODES: Record<string, string> = {
  AN: 'Andaman & Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CT: 'Chhattisgarh',
  CG: 'Chhattisgarh',
  DD: 'Dadra and Nagar Haveli and Daman and Diu',
  DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi (NCT)',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu & Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OR: 'Odisha',
  OD: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TS: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UK: 'Uttarakhand',
  UA: 'Uttarakhand',
  WB: 'West Bengal',
};

interface StoredProviderConfig {
  mainSiteUrl: string;
  deploymentMode: 'subdomain' | 'embedded';
  subdomainHost: string;
  allowedOrigins: string;
  dipWebhookUrl: string;
  validationProvider: {
    name: string;
    mode: 'built_in' | 'external_rest' | 'dip_desk';
    endpointUrl: string;
    authHeader: string;
    apiKey: string;
  };
  eStampProvider: {
    name: string;
    mode: 'reference_only' | 'external_api' | 'dip_desk';
    verifyEndpointUrl: string;
    quoteEndpointUrl: string;
    authHeader: string;
    apiKey: string;
  };
}

function defaultConfigFromEnv(): StoredProviderConfig {
  const valUrl = (process.env.DOC_VALIDATION_API_URL || '').trim();
  const estVerifyUrl = (process.env.ESTAMP_VERIFY_API_URL || '').trim();
  const estQuoteUrl = (process.env.ESTAMP_QUOTE_API_URL || '').trim();
  return {
    mainSiteUrl: (process.env.DIP_MAIN_SITE_URL || 'https://digitalindiaproject.com').trim(),
    deploymentMode: 'subdomain',
    subdomainHost: 'legal.digitalindiaproject.com',
    allowedOrigins: (
      process.env.DIP_ALLOWED_ORIGINS || 'https://digitalindiaproject.com,https://www.digitalindiaproject.com'
    ).trim(),
    dipWebhookUrl: '',
    validationProvider: {
      name: (
        process.env.DOC_VALIDATION_PROVIDER_NAME ||
        (valUrl ? 'Configured Validation API' : 'Digital India Legal Validator')
      ).trim(),
      mode: valUrl ? 'external_rest' : 'built_in',
      endpointUrl: valUrl,
      authHeader: 'Authorization',
      apiKey: (process.env.DOC_VALIDATION_API_KEY || '').trim(),
    },
    eStampProvider: {
      name: (
        process.env.ESTAMP_PROVIDER_NAME ||
        (estVerifyUrl || estQuoteUrl ? 'Configured e-Stamp API' : 'DIP-Desk e-Stamp Facilitation')
      ).trim(),
      mode: estVerifyUrl || estQuoteUrl ? 'external_api' : 'reference_only',
      verifyEndpointUrl: estVerifyUrl,
      quoteEndpointUrl: estQuoteUrl,
      authHeader: 'Authorization',
      apiKey: (process.env.ESTAMP_API_KEY || '').trim(),
    },
  };
}

function loadStoredConfig(): StoredProviderConfig {
  const defaults = defaultConfigFromEnv();
  const saved = inMemorySavedProviderConfig;
  if (!saved) return defaults;
  return {
    mainSiteUrl: saved.mainSiteUrl || defaults.mainSiteUrl,
    deploymentMode: saved.deploymentMode === 'embedded' ? 'embedded' : 'subdomain',
    subdomainHost: saved.subdomainHost || defaults.subdomainHost,
    allowedOrigins: saved.allowedOrigins ?? defaults.allowedOrigins,
    dipWebhookUrl: saved.dipWebhookUrl ?? defaults.dipWebhookUrl,
    validationProvider: {
      ...defaults.validationProvider,
      ...(saved.validationProvider || {}),
    },
    eStampProvider: {
      ...defaults.eStampProvider,
      ...(saved.eStampProvider || {}),
    },
  };
}

function maskSecret(secret: string): string {
  const trimmed = (secret || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 6) return '••••••';
  return `••••${trimmed.slice(-4)}`;
}

function isSafeHttpUrl(urlStr: string): boolean {
  if (!urlStr) return true;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildAuthHeaders(authHeader: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'DigitalIndiaProject-LegalAddon/1.0',
  };
  const key = (apiKey || '').trim();
  if (!key) return headers;
  const headerName = (authHeader || 'Authorization').trim();
  if (headerName.toLowerCase() === 'authorization' && !/^bearer\s+/i.test(key)) {
    headers[headerName] = `Bearer ${key}`;
  } else {
    headers[headerName] = key;
  }
  return headers;
}

export function getPublicProviderStatus(): PublicProviderStatus {
  const cfg = loadStoredConfig();
  return {
    mainSiteUrl: cfg.mainSiteUrl,
    deploymentMode: cfg.deploymentMode,
    subdomainHost: cfg.subdomainHost,
    validationProvider: {
      name: cfg.validationProvider.name,
      mode: cfg.validationProvider.mode,
      externalConfigured:
        cfg.validationProvider.mode !== 'built_in' && Boolean(cfg.validationProvider.endpointUrl),
    },
    eStampProvider: {
      name: cfg.eStampProvider.name,
      mode: cfg.eStampProvider.mode,
      verifyConfigured:
        cfg.eStampProvider.mode !== 'reference_only' && Boolean(cfg.eStampProvider.verifyEndpointUrl),
      quoteConfigured:
        cfg.eStampProvider.mode !== 'reference_only' && Boolean(cfg.eStampProvider.quoteEndpointUrl),
    },
  };
}

export function getAdminProviderConfigMasked(): AdminProviderConfig {
  const cfg = loadStoredConfig();
  return {
    mainSiteUrl: cfg.mainSiteUrl,
    deploymentMode: cfg.deploymentMode,
    subdomainHost: cfg.subdomainHost,
    allowedOrigins: cfg.allowedOrigins,
    dipWebhookUrl: cfg.dipWebhookUrl,
    validationProvider: {
      name: cfg.validationProvider.name,
      mode: cfg.validationProvider.mode,
      endpointUrl: cfg.validationProvider.endpointUrl,
      authHeader: cfg.validationProvider.authHeader,
      hasApiKey: Boolean(cfg.validationProvider.apiKey),
      maskedApiKey: maskSecret(cfg.validationProvider.apiKey),
    },
    eStampProvider: {
      name: cfg.eStampProvider.name,
      mode: cfg.eStampProvider.mode,
      verifyEndpointUrl: cfg.eStampProvider.verifyEndpointUrl,
      quoteEndpointUrl: cfg.eStampProvider.quoteEndpointUrl,
      authHeader: cfg.eStampProvider.authHeader,
      hasApiKey: Boolean(cfg.eStampProvider.apiKey),
      maskedApiKey: maskSecret(cfg.eStampProvider.apiKey),
    },
  };
}

export function saveAdminProviderConfig(input: AdminProviderConfig): AdminProviderConfig {
  const existing = loadStoredConfig();
  const urlsToValidate = [
    input.mainSiteUrl,
    input.dipWebhookUrl,
    input.validationProvider.endpointUrl,
    input.eStampProvider.verifyEndpointUrl,
    input.eStampProvider.quoteEndpointUrl,
  ];
  for (const u of urlsToValidate) {
    if (u && !isSafeHttpUrl(u.trim())) {
      throw new Error(`Invalid URL "${u}". Only http:// or https:// URLs are supported.`);
    }
  }

  const nextValidationKey =
    input.validationProvider.apiKey === '__CLEAR__'
      ? ''
      : input.validationProvider.apiKey?.trim()
      ? input.validationProvider.apiKey.trim()
      : existing.validationProvider.apiKey;

  const nextEStampKey =
    input.eStampProvider.apiKey === '__CLEAR__'
      ? ''
      : input.eStampProvider.apiKey?.trim()
      ? input.eStampProvider.apiKey.trim()
      : existing.eStampProvider.apiKey;

  const next: StoredProviderConfig = {
    mainSiteUrl: (input.mainSiteUrl || 'https://digitalindiaproject.com').trim().replace(/\/+$/, ''),
    deploymentMode: input.deploymentMode === 'embedded' ? 'embedded' : 'subdomain',
    subdomainHost: (input.subdomainHost || 'legal.digitalindiaproject.com').trim(),
    allowedOrigins: (input.allowedOrigins || '').trim(),
    dipWebhookUrl: (input.dipWebhookUrl || '').trim(),
    validationProvider: {
      name: (input.validationProvider.name || 'Digital India Legal Validator').trim(),
      mode: input.validationProvider.mode,
      endpointUrl: (input.validationProvider.endpointUrl || '').trim(),
      authHeader: (input.validationProvider.authHeader || 'Authorization').trim(),
      apiKey: nextValidationKey,
    },
    eStampProvider: {
      name: (input.eStampProvider.name || 'DIP-Desk e-Stamp Facilitation').trim(),
      mode: input.eStampProvider.mode,
      verifyEndpointUrl: (input.eStampProvider.verifyEndpointUrl || '').trim(),
      quoteEndpointUrl: (input.eStampProvider.quoteEndpointUrl || '').trim(),
      authHeader: (input.eStampProvider.authHeader || 'Authorization').trim(),
      apiKey: nextEStampKey,
    },
  };

  inMemorySavedProviderConfig = next;

  return getAdminProviderConfigMasked();
}

export function getAllowedOrigins(): string[] {
  const cfg = loadStoredConfig();
  const base = ['https://digitalindiaproject.com', 'https://www.digitalindiaproject.com'];
  if (cfg.mainSiteUrl) base.push(cfg.mainSiteUrl);
  const extra = cfg.allowedOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...base, ...extra]));
}

export async function runExternalDocumentValidation(
  params: {
    content: string;
    title?: string;
    rawCategory?: string;
    jurisdictionState?: string;
    executionDate?: string;
    hasSignature?: boolean;
    eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
    eStampCertNumber?: string;
  },
  localReport: DocumentValidationReport
): Promise<DocumentValidationReport> {
  const cfg = loadStoredConfig();
  const vp = cfg.validationProvider;

  if (vp.mode === 'built_in' || !vp.endpointUrl) {
    return {
      ...localReport,
      providerMeta: {
        providerName: vp.name || 'Digital India Legal Validator',
        mode: 'built_in',
        externalCalled: false,
        externalSucceeded: false,
        note: 'Using built-in deterministic Indian legal document validator.',
      },
    };
  }

  const start = Date.now();
  try {
    const response = await fetch(vp.endpointUrl, {
      method: 'POST',
      headers: buildAuthHeaders(vp.authHeader, vp.apiKey),
      body: JSON.stringify({
        title: params.title || 'Legal Document Draft',
        category: params.rawCategory || '',
        jurisdictionState: params.jurisdictionState || '',
        executionDate: params.executionDate || '',
        hasSignature: Boolean(params.hasSignature),
        eStampMode: params.eStampMode || 'none',
        eStampCertNumber: params.eStampCertNumber || '',
        sha256Digest: localReport.sha256Digest,
        wordCount: localReport.wordCount,
        content: params.content.slice(0, 120000),
        source: 'digital-india-legal-addon',
      }),
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;
    if (!response.ok) {
      throw new Error(`Provider returned HTTP ${response.status}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      referenceId?: string;
      status?: string;
      checks?: Array<{
        id?: string;
        category?: ValidationCheckItem['category'];
        title?: string;
        severity?: 'pass' | 'warning' | 'error';
        detail?: string;
        suggestion?: string;
      }>;
      warnings?: string[];
      errors?: string[];
      note?: string;
    };

    const extraChecks: ValidationCheckItem[] = [];
    if (Array.isArray(data.checks)) {
      for (let i = 0; i < data.checks.length; i++) {
        const c = data.checks[i];
        if (!c?.title) continue;
        extraChecks.push({
          id: c.id || `ext_check_${i}`,
          category: c.category || 'Statutory Currency',
          title: `[${vp.name}] ${c.title}`,
          severity: c.severity === 'error' || c.severity === 'warning' ? c.severity : 'pass',
          detail: c.detail || 'Returned by external validation API provider.',
          suggestion: c.suggestion,
        });
      }
    }
    for (const w of data.warnings || []) {
      if (w) {
        extraChecks.push({
          id: `ext_warn_${extraChecks.length}`,
          category: 'Statutory Currency',
          title: `[${vp.name}] Advisory`,
          severity: 'warning',
          detail: w,
        });
      }
    }
    for (const e of data.errors || []) {
      if (e) {
        extraChecks.push({
          id: `ext_err_${extraChecks.length}`,
          category: 'Completeness',
          title: `[${vp.name}] Issue Flagged`,
          severity: 'error',
          detail: e,
        });
      }
    }

    if (extraChecks.length === 0) {
      extraChecks.push({
        id: 'ext_provider_ack',
        category: 'Format Integrity',
        title: `Verified by ${vp.name}`,
        severity: 'pass',
        detail: data.note || `External API check completed in ${latencyMs}ms.`,
      });
    }

    const mergedChecks = [...localReport.checks, ...extraChecks];
    const passedCount = mergedChecks.filter((c) => c.severity === 'pass').length;
    const warningCount = mergedChecks.filter((c) => c.severity === 'warning').length;
    const errorCount = mergedChecks.filter((c) => c.severity === 'error').length;

    return {
      ...localReport,
      passedCount,
      warningCount,
      errorCount,
      overallStatus:
        errorCount > 0 ? 'incomplete' : warningCount > 0 ? 'needs_attention' : 'ready_for_advocate_review',
      checks: mergedChecks,
      providerMeta: {
        providerName: vp.name,
        mode: vp.mode,
        externalCalled: true,
        externalSucceeded: true,
        referenceId: data.referenceId || `VAL-${Date.now().toString(36).toUpperCase()}`,
        latencyMs,
        fallbackUsed: false,
        note: data.note || `External provider responded in ${latencyMs}ms.`,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      ...localReport,
      providerMeta: {
        providerName: vp.name,
        mode: vp.mode,
        externalCalled: true,
        externalSucceeded: false,
        latencyMs,
        fallbackUsed: true,
        note: `External API unavailable (${err instanceof Error ? err.message : 'network error'}); local validator results applied.`,
      },
    };
  }
}

export async function verifyEStampWithProvider(params: {
  certificateNumber: string;
  state?: string;
  purchaseDate?: string;
}): Promise<EStampVerifyResult> {
  const cfg = loadStoredConfig();
  const ep = cfg.eStampProvider;
  const cert = (params.certificateNumber || '').trim().toUpperCase();
  const checkedAt = new Date().toISOString();

  // Standard SHCIL pattern: IN-<2-letter-state><12-16 alphanumeric><check char>
  const match = cert.match(/^IN-([A-Z]{2})([A-Z0-9]{10,20})$/);
  const stateCode = match ? match[1] : undefined;
  const detectedState = stateCode ? SHCIL_STATE_CODES[stateCode] : undefined;
  const validFormat = Boolean(match);

  if (ep.mode !== 'reference_only' && ep.verifyEndpointUrl) {
    try {
      const response = await fetch(ep.verifyEndpointUrl, {
        method: 'POST',
        headers: buildAuthHeaders(ep.authHeader, ep.apiKey),
        body: JSON.stringify({
          certificateNumber: cert,
          state: params.state || detectedState || '',
          purchaseDate: params.purchaseDate || '',
          source: 'digital-india-legal-addon',
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Provider HTTP ${response.status}`);
      }
      const data = (await response.json().catch(() => ({}))) as {
        verified?: boolean;
        valid?: boolean;
        state?: string;
        denominationInr?: string | number;
        issuedDate?: string;
        purchasedBy?: string;
        referenceId?: string;
        message?: string;
      };
      const verified = Boolean(data.verified ?? data.valid);
      return {
        validFormat,
        verifiedByProvider: verified,
        mode: 'live_api',
        providerName: ep.name,
        certificateNumber: cert,
        stateCode,
        detectedState: data.state || detectedState,
        denominationInr: data.denominationInr ? String(data.denominationInr) : undefined,
        issuedDate: data.issuedDate,
        purchasedBy: data.purchasedBy,
        referenceId: data.referenceId || `EST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        message:
          data.message ||
          (verified
            ? `Certificate verified via ${ep.name}.`
            : `Certificate could not be verified by ${ep.name}.`),
        checkedAt,
      };
    } catch (err) {
      return {
        validFormat,
        verifiedByProvider: false,
        mode: 'format_check_only',
        providerName: ep.name,
        certificateNumber: cert,
        stateCode,
        detectedState,
        message: `Live e-Stamp API call failed (${err instanceof Error ? err.message : 'unreachable'}). Local SHCIL format check: ${validFormat ? 'Valid IN-prefix pattern' : 'Invalid SHCIL certificate pattern'}.`,
        checkedAt,
      };
    }
  }

  return {
    validFormat,
    verifiedByProvider: false,
    mode: 'format_check_only',
    providerName: ep.name || 'SHCIL Format Pre-Check',
    certificateNumber: cert,
    stateCode,
    detectedState,
    message: validFormat
      ? `SHCIL certificate syntax valid${detectedState ? ` (State prefix: ${detectedState})` : ''}. Connect an e-Stamp Verify API in Admin → API Providers for live registry verification.`
      : 'Certificate number does not match standard SHCIL format (e.g. IN-DL12345678901234W).',
    checkedAt,
  };
}

export async function requestEStampQuoteWithProvider(params: {
  state: string;
  articleDescription: string;
  denominationInr: string;
  considerationPriceInr?: string;
  purchasedBy: string;
  secondParty?: string;
  documentTitle?: string;
}): Promise<EStampQuoteResult> {
  const cfg = loadStoredConfig();
  const ep = cfg.eStampProvider;
  const quoteId = `DIP-EST-${Date.now().toString(36).toUpperCase()}`;
  const cleanDuty = (params.denominationInr || '100').replace(/[^\d.]/g, '') || '100';

  if (ep.mode !== 'reference_only' && ep.quoteEndpointUrl) {
    try {
      const response = await fetch(ep.quoteEndpointUrl, {
        method: 'POST',
        headers: buildAuthHeaders(ep.authHeader, ep.apiKey),
        body: JSON.stringify({
          quoteId,
          state: params.state,
          articleDescription: params.articleDescription,
          denominationInr: cleanDuty,
          considerationPriceInr: params.considerationPriceInr || '0',
          firstParty: params.purchasedBy,
          secondParty: params.secondParty || '',
          documentTitle: params.documentTitle || '',
          callbackUrl: cfg.dipWebhookUrl || undefined,
          source: 'digital-india-legal-addon',
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Provider HTTP ${response.status}`);
      }
      const data = (await response.json().catch(() => ({}))) as {
        quoteId?: string;
        estimatedDutyInr?: string | number;
        facilitationFeeInr?: string | number;
        checkoutUrl?: string;
        handoffUrl?: string;
        message?: string;
      };
      return {
        mode: 'live_api',
        providerName: ep.name,
        quoteId: data.quoteId || quoteId,
        state: params.state,
        estimatedDutyInr: String(data.estimatedDutyInr ?? cleanDuty),
        facilitationFeeInr: data.facilitationFeeInr ? String(data.facilitationFeeInr) : undefined,
        handoffUrl:
          data.checkoutUrl ||
          data.handoffUrl ||
          `${cfg.mainSiteUrl}/?service=estamp&ref=${encodeURIComponent(data.quoteId || quoteId)}`,
        message: data.message || `Live e-Stamp quote generated via ${ep.name}.`,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // Fall through cleanly to DIP-Desk main-site handoff URL
    }
  }

  const sp = new URLSearchParams({
    service: 'estamp',
    ref: quoteId,
    state: params.state || 'Delhi (NCT)',
    duty: cleanDuty,
    article: params.articleDescription || 'Agreement / Affidavit',
    party1: params.purchasedBy || '',
  });
  if (params.secondParty) sp.set('party2', params.secondParty);

  return {
    mode: 'dip_facilitation_handoff',
    providerName: `${cfg.mainSiteUrl.replace(/^https?:\/\//, '')} Facilitation`,
    quoteId,
    state: params.state || 'Not Specified',
    estimatedDutyInr: cleanDuty,
    handoffUrl: `${cfg.mainSiteUrl}/?${sp.toString()}`,
    message: `Prepared e-Stamp facilitation reference ${quoteId} for Digital India Project (${cfg.mainSiteUrl}).`,
    generatedAt: new Date().toISOString(),
  };
}

export async function testProviderEndpoint(
  target: 'validation' | 'estamp_verify' | 'estamp_quote'
): Promise<{ ok: boolean; statusCode: number | null; latencyMs: number; message: string }> {
  const cfg = loadStoredConfig();
  const url =
    target === 'validation'
      ? cfg.validationProvider.endpointUrl
      : target === 'estamp_verify'
      ? cfg.eStampProvider.verifyEndpointUrl
      : cfg.eStampProvider.quoteEndpointUrl;
  const authHeader =
    target === 'validation' ? cfg.validationProvider.authHeader : cfg.eStampProvider.authHeader;
  const apiKey =
    target === 'validation' ? cfg.validationProvider.apiKey : cfg.eStampProvider.apiKey;

  if (!url) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: 0,
      message: 'No endpoint URL configured for this provider yet.',
    };
  }

  const start = Date.now();
  try {
    const payload =
      target === 'validation'
        ? {
            ping: true,
            title: 'DIP Connection Probe',
            content: 'Sample test document content for API provider health verification.',
            jurisdictionState: 'Delhi (NCT)',
          }
        : target === 'estamp_verify'
        ? { ping: true, certificateNumber: 'IN-DL00000000000000T', state: 'Delhi (NCT)' }
        : {
            ping: true,
            state: 'Delhi (NCT)',
            denominationInr: '100',
            articleDescription: 'Article 4 Affidavit',
          };

    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(authHeader, apiKey),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000),
    });
    const latencyMs = Date.now() - start;
    return {
      ok: res.ok,
      statusCode: res.status,
      latencyMs,
      message: res.ok
        ? `Connected successfully (HTTP ${res.status} in ${latencyMs}ms).`
        : `Endpoint reachable but returned HTTP ${res.status} (${latencyMs}ms).`,
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - start,
      message: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
