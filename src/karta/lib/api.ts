import { auth } from '../../services/firebase';
import type {
  AdminProviderConfig,
  DocumentValidationReport,
  EStampConfig,
  EStampQuoteResult,
  EStampVerifyResult,
  GeneratedDocumentResult,
  LibraryAuditReport,
  PublicProviderStatus,
  SignatureConfig,
  TemplateDetail,
  TemplateSummary,
} from '../shared/types';

export interface TemplateQueryResponse {
  items: TemplateSummary[];
  total: number;
  page: number;
  totalPages: number;
}

export interface IngestionJobState {
  running: boolean;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  processedCount: number;
  totalCount: number;
}

async function getAdminHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const key = sessionStorage.getItem('di_admin_key') || '';
  if (key) {
    headers['x-admin-key'] = key;
  }
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Fallback to x-admin-key if token retrieval fails
    }
  }
  return headers;
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    ) as Error & {
      status?: number;
      fieldErrors?: Record<string, string>;
      adminAuthRequired?: boolean;
    };
    err.status = res.status;
    err.fieldErrors = (data as { fieldErrors?: Record<string, string> }).fieldErrors;
    err.adminAuthRequired = (data as { adminAuthRequired?: boolean }).adminAuthRequired;
    throw err;
  }
  return data as T;
}

async function fetchWithFallback<T>(
  request: () => Promise<Response>,
  fallback: () => Promise<T> | T
): Promise<T> {
  try {
    const res = await request();
    if (res.status === 404) {
      return await fallback();
    }
    return await handleJson<T>(res);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || err instanceof TypeError) {
      return await fallback();
    }
    throw err;
  }
}

export async function fetchAuditReport(): Promise<{
  report: LibraryAuditReport;
  job: IngestionJobState;
}> {
  return fetchWithFallback(
    () => fetch('/api/karta/audit'),
    async () => (await import('./kartaLocalFallback')).fallbackFetchAuditReport()
  );
}

export async function fetchTemplates(params: {
  q?: string;
  categoryGroup?: string;
  rawCategory?: string;
  tag?: string;
  reviewStatus?: string;
  processingStatus?: string;
  page?: number;
  limit?: number;
}): Promise<TemplateQueryResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.categoryGroup && params.categoryGroup !== 'all') {
    sp.set('categoryGroup', params.categoryGroup);
  }
  if (params.rawCategory && params.rawCategory !== 'all') {
    sp.set('rawCategory', params.rawCategory);
  }
  if (params.tag && params.tag !== 'all') sp.set('tag', params.tag);
  if (params.reviewStatus && params.reviewStatus !== 'all') {
    sp.set('reviewStatus', params.reviewStatus);
  }
  if (params.processingStatus && params.processingStatus !== 'all') {
    sp.set('processingStatus', params.processingStatus);
  }
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  return fetchWithFallback(
    () => fetch(`/api/karta/templates?${sp.toString()}`),
    async () => (await import('./kartaLocalFallback')).fallbackFetchTemplates(params)
  );
}

export async function fetchTemplateDetail(id: string): Promise<TemplateDetail> {
  return fetchWithFallback(
    () => fetch(`/api/karta/templates/${encodeURIComponent(id)}`),
    async () => (await import('./kartaLocalFallback')).fallbackFetchTemplateDetail(id)
  );
}

export async function renderDraft(payload: {
  templateId: string;
  formValues: Record<string, string>;
  repeatableValues?: Record<string, Array<Record<string, string>>>;
}): Promise<GeneratedDocumentResult> {
  return fetchWithFallback(
    () =>
      fetch('/api/karta/drafts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    async () => (await import('./kartaLocalFallback')).fallbackRenderDraft(payload)
  );
}

export async function validateDocument(payload: {
  content: string;
  title?: string;
  rawCategory?: string;
  jurisdictionState?: string;
  executionDate?: string;
  hasSignature?: boolean;
  eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
  eStampCertNumber?: string;
}): Promise<DocumentValidationReport> {
  return fetchWithFallback(
    () =>
      fetch('/api/karta/validate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    async () => (await import('./kartaLocalFallback')).fallbackValidateDocument(payload)
  );
}

export async function validateUploadedDocument(payload: {
  filename: string;
  base64Content: string;
  jurisdictionState?: string;
}): Promise<{
  filename: string;
  format: 'pdf' | 'txt';
  extractedText: string;
  report: DocumentValidationReport;
}> {
  const res = await fetch('/api/karta/validate-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function askLegalAssistant(payload: {
  question: string;
  documentTitle?: string;
  documentCategory?: string;
  jurisdictionState?: string;
  documentExcerpt?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ answer: string; timestamp: string }> {
  const res = await fetch('/api/karta/legal-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleJson(res);
}

export async function downloadExportFile(
  format: 'docx' | 'pdf',
  payload: {
    documentId?: string;
    templateId: string;
    templateTitle: string;
    templateVersion: string;
    sourcePath: string;
    jurisdictionState: string;
    executionDate: string;
    isReconstructedFromPdf?: boolean;
    disclaimerBanner: string;
    title: string;
    content: string;
    eStamp?: EStampConfig;
    signature?: SignatureConfig;
  }
): Promise<void> {
  const res = await fetch(`/api/karta/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || `Failed to export ${format.toUpperCase()}`
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug =
    payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'legal_draft';
  a.href = url;
  a.download = `${slug}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchProviderStatus(): Promise<PublicProviderStatus> {
  return fetchWithFallback(
    () => fetch('/api/karta/providers/status'),
    async () => (await import('./kartaLocalFallback')).fallbackFetchProviderStatus()
  );
}

export async function verifyEStampCertificate(payload: {
  certificateNumber: string;
  state?: string;
  purchaseDate?: string;
}): Promise<EStampVerifyResult> {
  return fetchWithFallback(
    () =>
      fetch('/api/karta/estamp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    async () => (await import('./kartaLocalFallback')).fallbackVerifyEStamp(payload)
  );
}

export async function requestEStampQuote(payload: {
  state: string;
  articleDescription: string;
  denominationInr: string;
  considerationPriceInr?: string;
  purchasedBy: string;
  secondParty?: string;
  documentTitle?: string;
}): Promise<EStampQuoteResult> {
  return fetchWithFallback(
    () =>
      fetch('/api/karta/estamp/request-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    async () => (await import('./kartaLocalFallback')).fallbackRequestEStampQuote(payload)
  );
}

export async function fetchAdminProviderConfig(): Promise<AdminProviderConfig> {
  const headers = await getAdminHeaders();
  const res = await fetch('/api/karta/admin/providers', {
    headers,
  });
  return handleJson(res);
}
