import { Hono } from 'hono';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { AppVariables, Env } from '../types';
import { resolveUserFromRequest } from '../middleware/auth';
import { isSuperAdminRole } from '../../src/lib/rbac';
import { runMultiProviderAssistant } from '../lib/aiProviders';
import {
  buildKartaIndexFromData,
  getKartaTemplateByIdFromIndex,
  queryKartaTemplatesFromIndex,
  renderCompletedDocumentPure,
  validateFormInputPure,
  validateLegalDocumentContentPure,
  type KartaIndex,
  type RawCatalogueEntry,
} from '../../server/karta/kartaIndexCore';
import type {
  AdminProviderConfig,
  BatchManifestEntry,
  EStampConfig,
  EStampQuoteResult,
  EStampVerifyResult,
  PublicProviderStatus,
  SignatureConfig,
} from '../../src/karta/shared/types';
import { NON_EXECUTED_STATUS_NOTICE } from '../../src/karta/shared/constants';
import { typesetPlainTextBlocks } from '../../src/karta/shared/legalTypesetter';
import rawCatalogueJson from '../../data/karta-source/catalogue.json';
import batchManifestJson from '../../data/karta-source/batch_manifest.json';

export const kartaRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

let cachedWorkerIndex: KartaIndex | null = null;

function getWorkerKartaIndex(env: Env): KartaIndex {
  if (!cachedWorkerIndex) {
    const rawCat = Array.isArray(rawCatalogueJson)
      ? (rawCatalogueJson as RawCatalogueEntry[])
      : (Object.values(rawCatalogueJson as Record<string, RawCatalogueEntry>) as RawCatalogueEntry[]);
    const manifests = Array.isArray(batchManifestJson)
      ? (batchManifestJson as BatchManifestEntry[])
      : [];
    cachedWorkerIndex = buildKartaIndexFromData(rawCat, manifests, {
      geminiConfigured: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      adminAuthConfigured: true,
    });
  }
  return cachedWorkerIndex;
}

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

function getPublicStatus(env: Env): PublicProviderStatus {
  const mainSiteUrl = (env.APP_DOMAIN || 'https://digitalindiaproject.com').trim();
  return {
    mainSiteUrl,
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

kartaRouter.get('/health', (c) => {
  const idx = getWorkerKartaIndex(c.env);
  return c.json({
    ok: true,
    service: 'karta-files-desk',
    templatesCount: idx.ordered.length,
    timestamp: new Date().toISOString(),
  });
});

kartaRouter.get('/audit', (c) => {
  const idx = getWorkerKartaIndex(c.env);
  const report = idx.auditReport;
  return c.json({
    report,
    job: {
      running: false,
      lastError: null,
      startedAt: report.lastIngestedAt,
      finishedAt: report.lastIngestedAt,
      processedCount: report.totalSuccessfullyProcessed,
      totalCount: report.totalFilesDiscovered,
    },
  });
});

kartaRouter.get('/summary', (c) => {
  const idx = getWorkerKartaIndex(c.env);
  const curated = idx.ordered
    .filter((t) => t.reviewStatus === 'approved')
    .map((t) => ({
      id: t.id,
      title: t.title,
      categoryGroup: t.categoryGroup,
      rawCategory: t.rawCategory,
      sourcePath: t.sourcePath,
      fieldCount: t.fieldCount,
      reviewStatus: t.reviewStatus,
    }));
  return c.json({
    curated,
    curatedCount: idx.auditReport.approvedTemplatesCount,
    catalogueTotal: idx.auditReport.catalogueJsonCount,
    manifests: idx.manifests,
  });
});

kartaRouter.get('/templates', (c) => {
  const idx = getWorkerKartaIndex(c.env);
  const q = c.req.query('q');
  const categoryGroup = c.req.query('categoryGroup');
  const rawCategory = c.req.query('rawCategory');
  const tag = c.req.query('tag');
  const reviewStatus = c.req.query('reviewStatus');
  const processingStatus = c.req.query('processingStatus');
  const usableOnly = c.req.query('usableOnly') !== 'false';
  const page = parseInt(c.req.query('page') || '1', 10) || 1;
  const limit = parseInt(c.req.query('limit') || '18', 10) || 18;

  return c.json(
    queryKartaTemplatesFromIndex(idx, {
      q,
      categoryGroup,
      rawCategory,
      tag,
      reviewStatus,
      processingStatus,
      usableOnly,
      page,
      limit,
    })
  );
});

kartaRouter.get('/templates/:id', (c) => {
  const idx = getWorkerKartaIndex(c.env);
  const detail = getKartaTemplateByIdFromIndex(idx, c.req.param('id'));
  if (!detail) {
    return c.json({ error: 'Template not found.' }, 404);
  }
  return c.json(detail);
});

kartaRouter.post('/drafts/render', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    templateId?: string;
    formValues?: Record<string, string>;
    repeatableValues?: Record<string, Array<Record<string, string>>>;
  } | null;

  if (!body || !body.templateId || typeof body.formValues !== 'object' || !body.formValues) {
    return c.json({ error: 'Invalid render payload.' }, 400);
  }

  const idx = getWorkerKartaIndex(c.env);
  const template = getKartaTemplateByIdFromIndex(idx, body.templateId);
  if (!template) {
    return c.json({ error: 'Template not found.' }, 404);
  }

  const validation = validateFormInputPure(template.fields, body.formValues);
  if (!validation.valid) {
    return c.json(
      {
        error: 'Please correct highlighted form validation errors.',
        fieldErrors: validation.errors,
      },
      422
    );
  }

  return c.json(
    renderCompletedDocumentPure(template, body.formValues, body.repeatableValues || {})
  );
});

kartaRouter.get('/providers/status', (c) => {
  return c.json(getPublicStatus(c.env));
});

kartaRouter.get('/admin/providers', async (c) => {
  const user = await resolveUserFromRequest(c.req.header('authorization'), c.env).catch(() => null);
  if (!user || !isSuperAdminRole(user.role)) {
    return c.json(
      {
        error: 'Administrator privileges required.',
        adminAuthRequired: true,
      },
      user ? 403 : 401
    );
  }
  const pub = getPublicStatus(c.env);
  const cfg: AdminProviderConfig = {
    mainSiteUrl: pub.mainSiteUrl,
    deploymentMode: pub.deploymentMode,
    subdomainHost: pub.subdomainHost,
    allowedOrigins: 'https://digitalindiaproject.com,https://www.digitalindiaproject.com',
    dipWebhookUrl: '',
    validationProvider: {
      name: pub.validationProvider.name,
      mode: pub.validationProvider.mode,
      endpointUrl: '',
      authHeader: 'Authorization',
      hasApiKey: false,
      maskedApiKey: '',
    },
    eStampProvider: {
      name: pub.eStampProvider.name,
      mode: pub.eStampProvider.mode,
      verifyEndpointUrl: '',
      quoteEndpointUrl: '',
      authHeader: 'Authorization',
      hasApiKey: false,
      maskedApiKey: '',
    },
  };
  return c.json(cfg);
});

kartaRouter.post('/validate-document', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    content?: string;
    title?: string;
    rawCategory?: string;
    jurisdictionState?: string;
    executionDate?: string;
    hasSignature?: boolean;
    eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
    eStampCertNumber?: string;
  } | null;

  if (!body || !body.content || typeof body.content !== 'string' || !body.content.trim()) {
    return c.json({ error: 'Invalid validation payload.' }, 400);
  }

  const report = await validateLegalDocumentContentPure({
    content: body.content.slice(0, 250000),
    title: body.title,
    rawCategory: body.rawCategory,
    jurisdictionState: body.jurisdictionState,
    executionDate: body.executionDate,
    hasSignature: body.hasSignature,
    eStampMode: body.eStampMode,
    eStampCertNumber: body.eStampCertNumber,
  });

  return c.json({
    ...report,
    providerMeta: {
      providerName: 'Digital India Legal Validator',
      mode: 'built_in',
      externalCalled: false,
      externalSucceeded: false,
      note: 'Using built-in deterministic Indian legal document validator.',
    },
  });
});

kartaRouter.post('/validate-upload', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    filename?: string;
    base64Content?: string;
    jurisdictionState?: string;
  } | null;

  if (!body || !body.filename || !body.base64Content) {
    return c.json({ error: 'Invalid uploaded file payload (max 2 MB).' }, 400);
  }

  const ext = body.filename.toLowerCase().split('.').pop() || '';
  if (ext !== 'txt' && ext !== 'md') {
    return c.json(
      {
        error:
          'Standalone edge validator supports .txt and .md uploads directly; paste PDF text into the Document Validator for PDFs.',
      },
      422
    );
  }

  try {
    const bin = atob(body.base64Content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = new TextDecoder().decode(bytes).trim();
    const report = await validateLegalDocumentContentPure({
      content: text,
      title: body.filename,
      jurisdictionState: body.jurisdictionState,
    });
    return c.json({
      filename: body.filename,
      format: 'txt' as const,
      extractedText: text,
      report,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Unable to parse uploaded document.' },
      422
    );
  }
});

kartaRouter.post('/estamp/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    certificateNumber?: string;
    state?: string;
    purchaseDate?: string;
  } | null;

  const cert = (body?.certificateNumber || '').trim().toUpperCase();
  if (cert.length < 4 || cert.length > 80) {
    return c.json({ error: 'Please provide a valid e-Stamp certificate number.' }, 400);
  }

  const match = cert.match(/^IN-([A-Z]{2})([A-Z0-9]{10,20})$/);
  const stateCode = match ? match[1] : undefined;
  const detectedState = stateCode ? SHCIL_STATE_CODES[stateCode] : undefined;
  const validFormat = Boolean(match);

  const result: EStampVerifyResult = {
    validFormat,
    verifiedByProvider: false,
    mode: 'format_check_only',
    providerName: 'SHCIL Format Pre-Check',
    certificateNumber: cert,
    stateCode,
    detectedState,
    message: validFormat
      ? `SHCIL certificate syntax valid${detectedState ? ` (State prefix: ${detectedState})` : ''}. Verify authenticity on shcilestamp.com.`
      : 'Certificate number does not match standard SHCIL format (e.g. IN-DL12345678901234W).',
    checkedAt: new Date().toISOString(),
  };
  return c.json(result);
});

kartaRouter.post('/estamp/request-quote', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    state?: string;
    articleDescription?: string;
    denominationInr?: string;
    considerationPriceInr?: string;
    purchasedBy?: string;
    secondParty?: string;
    documentTitle?: string;
  };
  const mainSiteUrl = (c.env.APP_DOMAIN || 'https://digitalindiaproject.com').trim();
  const quoteId = `DIP-EST-${Date.now().toString(36).toUpperCase()}`;
  const cleanDuty = (body.denominationInr || '100').replace(/[^\d.]/g, '') || '100';
  const sp = new URLSearchParams({
    service: 'estamp',
    ref: quoteId,
    state: body.state || 'Delhi (NCT)',
    duty: cleanDuty,
    article: body.articleDescription || 'Agreement / Affidavit',
    party1: body.purchasedBy || '',
  });
  if (body.secondParty) sp.set('party2', body.secondParty);

  const result: EStampQuoteResult = {
    mode: 'dip_facilitation_handoff',
    providerName: `${mainSiteUrl.replace(/^https?:\/\//, '')} Facilitation`,
    quoteId,
    state: body.state || 'Not Specified',
    estimatedDutyInr: cleanDuty,
    handoffUrl: `${mainSiteUrl}/?${sp.toString()}`,
    message: `Prepared e-Stamp facilitation reference ${quoteId} for Digital India Project (${mainSiteUrl}).`,
    generatedAt: new Date().toISOString(),
  };
  return c.json(result);
});

kartaRouter.post('/legal-assist', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    question?: string;
    documentTitle?: string;
    documentCategory?: string;
    jurisdictionState?: string;
    documentExcerpt?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  } | null;

  const question = (body?.question || '').trim();
  if (question.length < 2 || question.length > 2000) {
    return c.json({ error: 'Please enter a valid question (2–2000 chars).' }, 400);
  }

  try {
    const contextPrefix = [
      `Document Title: ${body?.documentTitle || 'General Indian Legal Query'}`,
      `Category: ${body?.documentCategory || 'General'}`,
      `Governing State/UT: ${body?.jurisdictionState || 'Not Specified'}`,
      body?.documentExcerpt ? `Document Excerpt:\n${body.documentExcerpt.slice(0, 8000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await runMultiProviderAssistant({
      payload: {
        prompt: `${contextPrefix}\n\nLegal Information Question: ${question}\n\nProvide structured plain-language Indian procedural/legal information (not binding legal advice; advise review by a qualified Advocate).`,
        language: 'en',
        history: (body?.history || []).slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
        provider: 'auto',
      },
      env: c.env,
    });

    return c.json({
      answer: result.reply || 'No response returned.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Legal information lookup failed.' },
      502
    );
  }
});

kartaRouter.post('/export/:format', async (c) => {
  const format = c.req.param('format');
  if (format !== 'docx' && format !== 'pdf') {
    return c.json({ error: 'Supported export formats: docx, pdf' }, 400);
  }

  const b = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    templateTitle?: string;
    jurisdictionState?: string;
    executionDate?: string;
    disclaimerBanner?: string;
    content?: string;
    eStamp?: EStampConfig;
    signature?: SignatureConfig;
  };

  const title = String(b.title || b.templateTitle || 'Karta Legal Draft').slice(0, 260);
  const content = String(b.content || '').slice(0, 250000);
  if (!content.trim()) {
    return c.json({ error: 'Document content cannot be empty.' }, 400);
  }

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'karta_legal_draft';

  if (format === 'docx') {
    const blocks = typesetPlainTextBlocks(content);
    const paragraphs: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [new TextRun({ text: title, bold: true, size: 28, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: `Jurisdiction: ${b.jurisdictionState || 'Not Specified'}  |  Date: ${b.executionDate || 'Not Specified'}`,
            size: 18,
            color: '475569',
            font: 'Calibri',
          }),
        ],
      }),
    ];

    for (const blk of blocks) {
      const text = blk.spans.map((s) => s.text).join('');
      const isCentered =
        blk.kind === 'court_caption' ||
        blk.kind === 'instrument_title' ||
        blk.kind === 'cause_versus';
      const isBold =
        blk.kind === 'court_caption' ||
        blk.kind === 'instrument_title' ||
        blk.kind === 'section_heading' ||
        blk.kind === 'cause_versus';
      paragraphs.push(
        new Paragraph({
          alignment: isCentered ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          children: [
            new TextRun({
              text,
              bold: isBold,
              size: blk.kind === 'instrument_title' ? 24 : 22,
              font: 'Calibri',
            }),
          ],
        })
      );
    }

    paragraphs.push(
      new Paragraph({
        spacing: { before: 160 },
        children: [
          new TextRun({
            text: b.disclaimerBanner || NON_EXECUTED_STATUS_NOTICE,
            size: 16,
            italics: true,
            color: '64748B',
            font: 'Calibri',
          }),
        ],
      })
    );

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const bytes = await Packer.toBuffer(doc);
    return new Response(new Uint8Array(bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${slug}.docx"`,
      },
    });
  }

  // PDF generation using pdf-lib (pure JS, 100% Cloudflare Workers compatible)
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin + 24) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawWrapped = (text: string, size: number, bold = false, color = rgb(0.11, 0.1, 0.09)) => {
    const f = bold ? fontBold : fontRegular;
    // Strip non-WinAnsi characters safely for StandardFonts
    const safe = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
    const words = safe.split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        ensureSpace(size + 5);
        page.drawText(line, { x: margin, y, size, font: f, color });
        y -= size + 5;
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensureSpace(size + 5);
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 5;
    }
  };

  drawWrapped(title, 14, true);
  y -= 4;
  drawWrapped(
    `Jurisdiction: ${b.jurisdictionState || 'Not Specified'}  |  Date: ${b.executionDate || 'Not Specified'}`,
    9,
    false,
    rgb(0.4, 0.45, 0.5)
  );
  y -= 10;

  for (const para of content.split('\n')) {
    if (!para.trim()) {
      y -= 8;
      continue;
    }
    drawWrapped(para, 11, false);
  }

  y -= 12;
  drawWrapped(b.disclaimerBanner || NON_EXECUTED_STATUS_NOTICE, 8, false, rgb(0.45, 0.45, 0.48));

  const pdfBytes = await pdfDoc.save();
  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${slug}.pdf"`,
    },
  });
});
