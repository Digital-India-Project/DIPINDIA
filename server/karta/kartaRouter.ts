import { Router } from 'express';
import { z } from 'zod';
import {
  getKartaAuditReport,
  getKartaCuratedTemplates,
  getKartaReviewStatusCounts,
  getKartaTemplateById,
  queryKartaTemplates,
} from './kartaStore';
import { renderCompletedDocument, validateFormInput } from './templateEngine';
import { askLegalAssistantWithGemini } from './geminiService';
import {
  extractTextFromSafeUpload,
  validateLegalDocumentContent,
} from './validationService';
import {
  getAdminProviderConfigMasked,
  getPublicProviderStatus,
  requestEStampQuoteWithProvider,
  runExternalDocumentValidation,
  verifyEStampWithProvider,
} from './providerService';
import { buildDocxBuffer, buildPdfBuffer } from './exportService';

export function createKartaRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'karta-files-desk', timestamp: new Date().toISOString() });
  });

  router.get('/audit', (_req, res) => {
    try {
      const report = getKartaAuditReport();
      res.json({
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
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load audit.' });
    }
  });

  router.get('/summary', (_req, res) => {
    try {
      const curated = getKartaCuratedTemplates().map((t) => ({
        id: t.id,
        title: t.title,
        categoryGroup: t.categoryGroup,
        rawCategory: t.rawCategory,
        sourcePath: t.sourcePath,
        fieldCount: t.fieldCount,
        reviewStatus: t.reviewStatus,
      }));
      res.json({
        curated,
        ...getKartaReviewStatusCounts(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load summary.' });
    }
  });

  router.get('/templates', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const categoryGroup =
        typeof req.query.categoryGroup === 'string' ? req.query.categoryGroup : undefined;
      const rawCategory =
        typeof req.query.rawCategory === 'string' ? req.query.rawCategory : undefined;
      const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
      const reviewStatus =
        typeof req.query.reviewStatus === 'string' ? req.query.reviewStatus : undefined;
      const processingStatus =
        typeof req.query.processingStatus === 'string' ? req.query.processingStatus : undefined;
      const usableOnly = req.query.usableOnly !== 'false';
      const page = parseInt(String(req.query.page || '1'), 10) || 1;
      const limit = parseInt(String(req.query.limit || '18'), 10) || 18;

      res.json(
        queryKartaTemplates({
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
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Query failed.' });
    }
  });

  router.get('/templates/:id', (req, res) => {
    try {
      const detail = getKartaTemplateById(req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Template lookup failed.' });
    }
  });

  const renderSchema = z.object({
    templateId: z.string().min(3).max(120),
    formValues: z.record(z.string(), z.string().max(10000)),
    repeatableValues: z
      .record(z.string(), z.array(z.record(z.string(), z.string().max(2000))).max(15))
      .optional(),
  });

  router.post('/drafts/render', (req, res) => {
    try {
      const parsed = renderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid render payload.' });
        return;
      }
      const template = getKartaTemplateById(parsed.data.templateId);
      if (!template) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      const validation = validateFormInput(template.fields, parsed.data.formValues);
      if (!validation.valid) {
        res.status(422).json({
          error: 'Please correct highlighted form validation errors.',
          fieldErrors: validation.errors,
        });
        return;
      }
      const rendered = renderCompletedDocument(
        template,
        parsed.data.formValues,
        parsed.data.repeatableValues || {}
      );
      res.json(rendered);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Render failed.' });
    }
  });

  router.get('/providers/status', (_req, res) => {
    try {
      res.json(getPublicProviderStatus());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed.' });
    }
  });

  router.get('/admin/providers', (_req, res) => {
    try {
      res.json(getAdminProviderConfigMasked());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load config.' });
    }
  });

  const validateDocSchema = z.object({
    content: z.string().min(1).max(250000),
    title: z.string().max(300).optional(),
    rawCategory: z.string().max(120).optional(),
    jurisdictionState: z.string().max(120).optional(),
    executionDate: z.string().max(60).optional(),
    hasSignature: z.boolean().optional(),
    eStampMode: z.enum(['none', 'sample_preview', 'existing_certificate']).optional(),
    eStampCertNumber: z.string().max(80).optional(),
  });

  router.post('/validate-document', async (req, res) => {
    try {
      const parsed = validateDocSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid validation payload.' });
        return;
      }
      const localReport = validateLegalDocumentContent(parsed.data);
      const enrichedReport = await runExternalDocumentValidation(parsed.data, localReport);
      res.json(enrichedReport);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Validation failed.' });
    }
  });

  const validateUploadSchema = z.object({
    filename: z.string().min(1).max(200),
    base64Content: z.string().min(4).max(3_000_000),
    jurisdictionState: z.string().max(120).optional(),
  });

  router.post('/validate-upload', async (req, res) => {
    try {
      const parsed = validateUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid uploaded file payload (max 2 MB).' });
        return;
      }
      const buf = Buffer.from(parsed.data.base64Content, 'base64');
      const extracted = await extractTextFromSafeUpload(buf, parsed.data.filename);
      const localReport = validateLegalDocumentContent({
        content: extracted.text,
        title: parsed.data.filename,
        jurisdictionState: parsed.data.jurisdictionState,
      });
      const report = await runExternalDocumentValidation(
        {
          content: extracted.text,
          title: parsed.data.filename,
          jurisdictionState: parsed.data.jurisdictionState,
        },
        localReport
      );
      res.json({
        filename: parsed.data.filename,
        format: extracted.format,
        extractedText: extracted.text,
        report,
      });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Unable to parse uploaded document.',
      });
    }
  });

  const eStampVerifySchema = z.object({
    certificateNumber: z.string().min(4).max(80),
    state: z.string().max(120).optional(),
    purchaseDate: z.string().max(40).optional(),
  });

  router.post('/estamp/verify', async (req, res) => {
    try {
      const parsed = eStampVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please provide a valid e-Stamp certificate number.' });
        return;
      }
      res.json(await verifyEStampWithProvider(parsed.data));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Verify failed.' });
    }
  });

  const eStampQuoteSchema = z.object({
    state: z.string().max(120).default('Delhi (NCT)'),
    articleDescription: z.string().max(240).default('Agreement / Affidavit'),
    denominationInr: z.string().max(40).default('100'),
    considerationPriceInr: z.string().max(60).optional(),
    purchasedBy: z.string().max(160).default(''),
    secondParty: z.string().max(160).optional(),
    documentTitle: z.string().max(300).optional(),
  });

  router.post('/estamp/request-quote', async (req, res) => {
    try {
      const parsed = eStampQuoteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid e-Stamp quote payload.' });
        return;
      }
      res.json(await requestEStampQuoteWithProvider(parsed.data));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Quote failed.' });
    }
  });

  const legalAssistSchema = z.object({
    question: z.string().min(2).max(2000),
    documentTitle: z.string().max(300).optional(),
    documentCategory: z.string().max(120).optional(),
    jurisdictionState: z.string().max(120).optional(),
    documentExcerpt: z.string().max(15000).optional(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        })
      )
      .max(10)
      .optional(),
  });

  router.post('/legal-assist', async (req, res) => {
    try {
      const parsed = legalAssistSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please enter a valid question (2–2000 chars).' });
        return;
      }
      const answer = await askLegalAssistantWithGemini(parsed.data);
      res.json({ answer, timestamp: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Legal information lookup failed.';
      res.status(msg.includes('GEMINI_API_KEY') ? 503 : 502).json({ error: msg });
    }
  });

  router.post('/export/:format', async (req, res) => {
    const format = req.params.format;
    if (format !== 'docx' && format !== 'pdf') {
      res.status(400).json({ error: 'Supported export formats: docx, pdf' });
      return;
    }
    try {
      const b = req.body || {};
      const payload = {
        title: String(b.title || b.templateTitle || 'Karta Legal Draft').slice(0, 260),
        templateTitle: String(b.templateTitle || b.title || 'Legal Draft').slice(0, 260),
        templateVersion: String(b.templateVersion || '1.0.0').slice(0, 32),
        sourcePath: String(b.sourcePath || 'karta-files').slice(0, 260),
        jurisdictionState: String(b.jurisdictionState || 'Not Specified').slice(0, 120),
        executionDate: String(b.executionDate || 'Not Specified').slice(0, 60),
        isReconstructedFromPdf: Boolean(b.isReconstructedFromPdf),
        disclaimerBanner: String(b.disclaimerBanner || '').slice(0, 1000),
        content: String(b.content || '').slice(0, 250000),
        eStamp: b.eStamp,
        signature: b.signature,
      };
      if (!payload.content.trim()) {
        res.status(400).json({ error: 'Document content cannot be empty.' });
        return;
      }

      const slug =
        payload.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 60) || 'karta_legal_draft';

      if (format === 'docx') {
        const buffer = await buildDocxBuffer(payload);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${slug}.docx"`);
        res.send(buffer);
      } else {
        const buffer = await buildPdfBuffer(payload);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
        res.send(buffer);
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed.' });
    }
  });

  return router;
}
