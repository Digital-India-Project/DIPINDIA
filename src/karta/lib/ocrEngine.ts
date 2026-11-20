import { createWorker, OEM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { cacheSnapshot, getCachedSnapshot } from '../../lib/offlineQueue';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type OcrLanguageCode = 'eng' | 'eng+hin' | 'hin';

export interface OcrPageBreakdown {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrExtractionResult {
  text: string;
  confidence: number;
  wordCount: number;
  lineCount: number;
  language: OcrLanguageCode;
  durationMs: number;
  pageTexts: OcrPageBreakdown[];
}

export interface OcrProgressUpdate {
  phase: string;
  progressPercent: number;
  pageNumber?: number;
  totalPages?: number;
}

export interface VaultOcrIndexEntry {
  docId: string;
  ownerId: string;
  title: string;
  extractedText: string;
  confidence: number;
  wordCount: number;
  language: string;
  indexedAt: string;
  sourceFileName?: string;
}

const OCR_INDEX_KEY_PREFIX = 'karta_ocr_index_v1_';

function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function countLines(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

function formatTesseractStatus(raw: string): string {
  switch (raw) {
    case 'loading tesseract core':
      return 'Loading Tesseract WASM core';
    case 'initializing tesseract':
      return 'Initializing OCR engine';
    case 'loading language traineddata':
      return 'Downloading language traineddata';
    case 'initializing api':
      return 'Preparing recognition pipeline';
    case 'recognizing text':
      return 'Recognizing document text';
    default:
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Processing OCR';
  }
}

export async function runOcrOnImageSource(
  source: string | HTMLCanvasElement | File | Blob,
  options?: {
    language?: OcrLanguageCode;
    onProgress?: (update: OcrProgressUpdate) => void;
  }
): Promise<OcrExtractionResult> {
  const language: OcrLanguageCode = options?.language || 'eng';
  const start = performance.now();

  const worker = await createWorker(language, OEM.LSTM_ONLY, {
    logger: (msg) => {
      if (options?.onProgress) {
        options.onProgress({
          phase: formatTesseractStatus(msg.status),
          progressPercent: Math.min(99, Math.max(2, Math.round((msg.progress || 0) * 100))),
          pageNumber: 1,
          totalPages: 1,
        });
      }
    },
  });

  try {
    const result = await worker.recognize(source);
    const text = (result.data.text || '').trim();
    const confidence = Math.round(result.data.confidence || 0);
    const durationMs = Math.round(performance.now() - start);

    options?.onProgress?.({
      phase: 'OCR completed',
      progressPercent: 100,
      pageNumber: 1,
      totalPages: 1,
    });

    return {
      text,
      confidence,
      wordCount: countWords(text),
      lineCount: countLines(text),
      language,
      durationMs,
      pageTexts: [{ pageNumber: 1, text, confidence }],
    };
  } finally {
    await worker.terminate();
  }
}

export async function runOcrOnPdfBytes(
  pdfBytes: Uint8Array,
  pageNumbers: number[],
  options?: {
    language?: OcrLanguageCode;
    onProgress?: (update: OcrProgressUpdate) => void;
  }
): Promise<OcrExtractionResult> {
  const language: OcrLanguageCode = options?.language || 'eng';
  const start = performance.now();
  const totalTarget = Math.max(1, pageNumbers.length);
  let activePageIdx = 0;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
  const pdf = await loadingTask.promise;

  const worker = await createWorker(language, OEM.LSTM_ONLY, {
    logger: (msg) => {
      if (options?.onProgress) {
        const basePct = (activePageIdx / totalTarget) * 100;
        const slicePct = ((msg.progress || 0) / totalTarget) * 100;
        options.onProgress({
          phase: `${formatTesseractStatus(msg.status)} (Page ${pageNumbers[activePageIdx] ?? 1})`,
          progressPercent: Math.min(99, Math.max(2, Math.round(basePct + slicePct))),
          pageNumber: pageNumbers[activePageIdx] ?? 1,
          totalPages: totalTarget,
        });
      }
    },
  });

  try {
    const pageTexts: OcrPageBreakdown[] = [];
    for (let i = 0; i < pageNumbers.length; i++) {
      activePageIdx = i;
      const pageNo = pageNumbers[i];
      if (pageNo < 1 || pageNo > pdf.numPages) continue;

      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const res = await worker.recognize(canvas);
      pageTexts.push({
        pageNumber: pageNo,
        text: (res.data.text || '').trim(),
        confidence: Math.round(res.data.confidence || 0),
      });
    }

    const combinedText = pageTexts
      .map((p) => `[Page ${p.pageNumber} — OCR]\n${p.text || '(No text detected on this page)'}`)
      .join('\n\n')
      .trim();

    const avgConfidence =
      pageTexts.length > 0
        ? Math.round(
            pageTexts.reduce((acc, p) => acc + p.confidence, 0) / pageTexts.length
          )
        : 0;

    options?.onProgress?.({
      phase: 'OCR completed',
      progressPercent: 100,
      pageNumber: pageNumbers[pageNumbers.length - 1] ?? 1,
      totalPages: totalTarget,
    });

    return {
      text: combinedText,
      confidence: avgConfidence,
      wordCount: countWords(combinedText),
      lineCount: countLines(combinedText),
      language,
      durationMs: Math.round(performance.now() - start),
      pageTexts,
    };
  } finally {
    await worker.terminate();
    await loadingTask.destroy().catch(() => {});
  }
}

export async function loadVaultOcrIndex(
  ownerId: string
): Promise<VaultOcrIndexEntry[]> {
  if (!ownerId) return [];
  return getCachedSnapshot<VaultOcrIndexEntry>(`${OCR_INDEX_KEY_PREFIX}${ownerId}`);
}

export async function upsertVaultOcrIndexEntry(
  entry: VaultOcrIndexEntry
): Promise<VaultOcrIndexEntry[]> {
  if (!entry.ownerId || !entry.docId) return [];
  const existing = await loadVaultOcrIndex(entry.ownerId);
  const next = [entry, ...existing.filter((item) => item.docId !== entry.docId)];
  await cacheSnapshot(`${OCR_INDEX_KEY_PREFIX}${entry.ownerId}`, next);
  return next;
}

export async function removeVaultOcrIndexEntry(
  ownerId: string,
  docId: string
): Promise<void> {
  if (!ownerId || !docId) return;
  const existing = await loadVaultOcrIndex(ownerId);
  await cacheSnapshot(
    `${OCR_INDEX_KEY_PREFIX}${ownerId}`,
    existing.filter((item) => item.docId !== docId)
  );
}

export function findOcrExcerpt(
  text: string,
  query: string,
  radius = 65
): string | null {
  const q = query.trim().toLowerCase();
  if (!q || !text) return null;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

/**
 * Generates a realistic high-contrast scanned physical deed / e-Stamp image specimen
 * on an offscreen HTML5 canvas so users can benchmark Tesseract.js OCR immediately.
 */
export function createSampleScannedDeedDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Paper background with subtle scan shading
  ctx.fillStyle = '#FAF8F2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle paper border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);

  // SHCIL Header Bar
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText('INDIA NON JUDICIAL — GOVERNMENT OF NCT OF DELHI', 95, 130);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(95, 152);
  ctx.lineTo(985, 152);
  ctx.stroke();

  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 21px monospace';
  const metaLines = [
    'Certificate No.      : IN-DL94827104928174Y',
    'Certificate Issued   : 18-Nov-2026 11:25 AM',
    'Account Reference    : IMPACC (IV)/ dl732103/ DELHI/ DL-DLH',
    'Unique Doc Reference : SUBIN-DLDL73210394817263N',
    'Purchased by         : RAJESH KUMAR SHARMA',
    'Consideration Price  : Rs. 500 (Five Hundred Only)',
    'First Party          : RAJESH KUMAR SHARMA (LESSOR)',
    'Second Party         : ANANYA VERMA (LESSEE)',
    'Stamp Duty Paid By   : ANANYA VERMA — Rs. 500/-',
  ];
  let y = 205;
  for (const line of metaLines) {
    ctx.fillText(line, 95, y);
    y += 38;
  }

  ctx.strokeStyle = '#64748B';
  ctx.beginPath();
  ctx.moveTo(95, 565);
  ctx.lineTo(985, 565);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText('RESIDENTIAL LEAVE AND LICENSE AGREEMENT', 190, 625);

  ctx.font = '23px Georgia, serif';
  const bodyLines = [
    'This Agreement is executed at New Delhi on 18th November 2026 between',
    'Shri Rajesh Kumar Sharma, S/o Late Mohan Lal Sharma, residing at B-42,',
    'Lajpat Nagar II, New Delhi 110024 (hereinafter referred to as the LICENSOR)',
    '',
    'AND Ms. Ananya Verma, D/o Shri Vikram Verma, holding PAN ABCDE1234F,',
    'residing at Sector 18, Noida 201301 (hereinafter called the LICENSEE).',
    '',
    '1. Monthly License Fee is fixed at INR 32,000 payable on or before the',
    '   7th day of each English calendar month via NEFT or UPI transfer.',
    '2. Refundable Security Deposit of INR 64,000 has been acknowledged.',
    '3. Term of license is 11 months commencing 01 December 2026.',
    '4. Subject to exclusive jurisdiction of Courts at Saket, New Delhi.',
    '',
    'WITNESS 1: Arvind Mehta          EXECUTANT SIGNATURES:',
    'WITNESS 2: Priya Nair            [Signed: R.K. Sharma / A. Verma]',
  ];

  y = 690;
  for (const ln of bodyLines) {
    if (ln) {
      ctx.fillText(ln, 95, y);
    }
    y += 42;
  }

  return canvas.toDataURL('image/png');
}
