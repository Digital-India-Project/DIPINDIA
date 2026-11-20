import {
  buildKartaIndexFromData,
  getKartaTemplateByIdFromIndex,
  queryKartaTemplatesFromIndex,
  renderCompletedDocumentPure,
  validateFormInputPure,
  validateLegalDocumentContentPure,
  type KartaIndex,
} from '../../../server/karta/kartaIndexCore';
import type {
  DocumentValidationReport,
  EStampQuoteResult,
  EStampVerifyResult,
  GeneratedDocumentResult,
  LibraryAuditReport,
  PublicProviderStatus,
  TemplateDetail,
  TemplateSummary,
} from '../shared/types';

let cachedClientIndex: KartaIndex | null = null;

function getClientKartaIndex(): KartaIndex {
  if (!cachedClientIndex) {
    cachedClientIndex = buildKartaIndexFromData([], [], {
      geminiConfigured: false,
      adminAuthConfigured: true,
    });
  }
  return cachedClientIndex;
}

export function fallbackFetchAuditReport(): {
  report: LibraryAuditReport;
  job: {
    running: boolean;
    lastError: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    processedCount: number;
    totalCount: number;
  };
} {
  const idx = getClientKartaIndex();
  const report = idx.auditReport;
  return {
    report,
    job: {
      running: false,
      lastError: null,
      startedAt: report.lastIngestedAt,
      finishedAt: report.lastIngestedAt,
      processedCount: report.totalSuccessfullyProcessed,
      totalCount: report.totalFilesDiscovered,
    },
  };
}

export function fallbackFetchTemplates(params: {
  q?: string;
  categoryGroup?: string;
  rawCategory?: string;
  tag?: string;
  reviewStatus?: string;
  processingStatus?: string;
  page?: number;
  limit?: number;
}): {
  items: TemplateSummary[];
  total: number;
  page: number;
  totalPages: number;
} {
  return queryKartaTemplatesFromIndex(getClientKartaIndex(), {
    ...params,
    usableOnly: true,
  });
}

export function fallbackFetchTemplateDetail(id: string): TemplateDetail {
  const detail = getKartaTemplateByIdFromIndex(getClientKartaIndex(), id);
  if (!detail) {
    const err = new Error('Template not found.') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  return detail;
}

export function fallbackRenderDraft(payload: {
  templateId: string;
  formValues: Record<string, string>;
  repeatableValues?: Record<string, Array<Record<string, string>>>;
}): GeneratedDocumentResult {
  const template = fallbackFetchTemplateDetail(payload.templateId);
  const validation = validateFormInputPure(template.fields, payload.formValues);
  if (!validation.valid) {
    const err = new Error('Please correct highlighted form validation errors.') as Error & {
      status?: number;
      fieldErrors?: Record<string, string>;
    };
    err.status = 422;
    err.fieldErrors = validation.errors;
    throw err;
  }
  return renderCompletedDocumentPure(
    template,
    payload.formValues,
    payload.repeatableValues || {}
  );
}

export async function fallbackValidateDocument(payload: {
  content: string;
  title?: string;
  rawCategory?: string;
  jurisdictionState?: string;
  executionDate?: string;
  hasSignature?: boolean;
  eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
  eStampCertNumber?: string;
}): Promise<DocumentValidationReport> {
  const report = await validateLegalDocumentContentPure(payload);
  return {
    ...report,
    providerMeta: {
      providerName: 'Digital India Legal Validator (Offline Mode)',
      mode: 'built_in',
      externalCalled: false,
      externalSucceeded: false,
      note: 'Validated locally using deterministic Indian legal document checks.',
    },
  };
}

export function fallbackFetchProviderStatus(): PublicProviderStatus {
  return {
    mainSiteUrl: 'https://digitalindiaproject.com',
    deploymentMode: 'embedded',
    subdomainHost: 'digitalindiaproject.com',
    validationProvider: {
      name: 'Digital India Legal Validator',
      mode: 'built_in',
      externalConfigured: false,
    },
    eStampProvider: {
      name: 'DIP-Desk e-Stamp Facilitation',
      mode: 'reference_only',
      verifyConfigured: false,
      quoteConfigured: false,
    },
  };
}

export function fallbackVerifyEStamp(payload: {
  certificateNumber: string;
  state?: string;
  purchaseDate?: string;
}): EStampVerifyResult {
  const cert = (payload.certificateNumber || '').trim().toUpperCase();
  const match = cert.match(/^IN-([A-Z]{2})([A-Z0-9]{10,20})$/);
  return {
    validFormat: Boolean(match),
    verifiedByProvider: false,
    mode: 'format_check_only',
    providerName: 'SHCIL Format Pre-Check',
    certificateNumber: cert,
    stateCode: match ? match[1] : undefined,
    message: match
      ? 'SHCIL certificate syntax valid. Verify authenticity directly on shcilestamp.com.'
      : 'Certificate number does not match standard SHCIL format (e.g. IN-DL12345678901234W).',
    checkedAt: new Date().toISOString(),
  };
}

export function fallbackRequestEStampQuote(payload: {
  state: string;
  articleDescription: string;
  denominationInr: string;
  considerationPriceInr?: string;
  purchasedBy: string;
  secondParty?: string;
  documentTitle?: string;
}): EStampQuoteResult {
  const quoteId = `DIP-EST-${Date.now().toString(36).toUpperCase()}`;
  const cleanDuty = (payload.denominationInr || '100').replace(/[^\d.]/g, '') || '100';
  const sp = new URLSearchParams({
    service: 'estamp',
    ref: quoteId,
    state: payload.state || 'Delhi (NCT)',
    duty: cleanDuty,
    article: payload.articleDescription || 'Agreement / Affidavit',
    party1: payload.purchasedBy || '',
  });
  if (payload.secondParty) sp.set('party2', payload.secondParty);

  return {
    mode: 'dip_facilitation_handoff',
    providerName: 'digitalindiaproject.com Facilitation',
    quoteId,
    state: payload.state || 'Not Specified',
    estimatedDutyInr: cleanDuty,
    handoffUrl: `https://digitalindiaproject.com/?${sp.toString()}`,
    message: `Prepared e-Stamp facilitation reference ${quoteId} for Digital India Project.`,
    generatedAt: new Date().toISOString(),
  };
}
