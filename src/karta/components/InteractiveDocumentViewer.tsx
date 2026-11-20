import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FileCode2,
  FileImage,
  FileScan,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Layers,
  Lock,
  RotateCcw,
  Save,
  ScanText,
  Search,
  Sparkles,
  Stamp,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  STAMP_BACKGROUND_PATTERNS,
  getStampBackgroundPattern,
  type StampBackgroundPatternId,
} from '../../assets/stamp-papers';
import { triggerHaptic } from '../../lib/haptics';
import type { KartaOcrMetadata, KartaStampMetadata } from '../lib/kartaSyncService';
import {
  embedGoIStampOnPdfPage,
  getGoIStampById,
  type GoIStampDefinition,
} from '../lib/goiStamps';
import { GoIStampLibrary, GoIStampPreview } from './GoIStampLibrary';
import {
  createSampleScannedDeedDataUrl,
  runOcrOnImageSource,
  runOcrOnPdfBytes,
  type OcrExtractionResult,
  type OcrLanguageCode,
  type OcrProgressUpdate,
} from '../lib/ocrEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type ViewerFileKind = 'pdf' | 'docx' | 'text' | 'image' | 'vault';

export interface ViewerSourceDocument {
  id: string;
  vaultDocId?: string;
  vaultVersion?: number;
  templateId?: string;
  title: string;
  fileName: string;
  kind: ViewerFileKind;
  pdfBytes?: Uint8Array;
  textContent?: string;
  imageUrl?: string;
  fileSizeBytes?: number;
  initialStamp?: KartaStampMetadata | null;
  initialOcr?: KartaOcrMetadata | null;
  initialTags?: string[];
  autoRunOcr?: boolean;
}

interface Props {
  externalDocument?: ViewerSourceDocument | null;
  onSaveDraftToVault?: (params: {
    vaultDocId?: string;
    vaultVersion?: number;
    templateId?: string;
    title: string;
    textContent: string;
    stampOverlay: KartaStampMetadata | null;
    ocrMetadata?: KartaOcrMetadata | null;
    customTags?: string[];
  }) => void;
  isOnline: boolean;
}

interface PageThumbnailItem {
  pageNumber: number;
  label: string;
  thumbDataUrl?: string;
  excerpt?: string;
  kind: ViewerFileKind;
}

function stripRtfControlWords(raw: string): string {
  return raw
    .replace(/\{\\[^{}]*\}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '  ')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocxParagraphs(bytes: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) {
    throw new Error('Selected .docx archive does not contain word/document.xml.');
  }
  const xmlText = await xmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const paragraphs = Array.from(doc.getElementsByTagName('w:p'));
  const lines: string[] = [];
  for (const p of paragraphs) {
    const texts = Array.from(p.getElementsByTagName('w:t')).map(
      (n) => n.textContent || ''
    );
    const joined = texts.join('');
    if (joined.trim()) lines.push(joined);
  }
  return lines.join('\n\n') || 'Document contains no extractable text paragraphs.';
}

function splitTextIntoPages(text: string, charsPerPage = 2200): string[] {
  const normalized = (text || '').trim();
  if (!normalized) return ['(Empty Document)'];
  const paragraphs = normalized.split(/\n{2,}/);
  const pages: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length > charsPerPage && current.length > 0) {
      pages.push(current.trim());
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages.length > 0 ? pages : ['(Empty Document)'];
}

function fileBadgeMeta(kind: ViewerFileKind): {
  label: string;
  Icon: typeof FileText;
} {
  switch (kind) {
    case 'pdf':
      return { label: 'PDF Document', Icon: FileText };
    case 'docx':
      return { label: 'Word DOCX', Icon: FileSpreadsheet };
    case 'image':
      return { label: 'Scanned Image', Icon: FileImage };
    case 'vault':
      return { label: 'Vault Draft', Icon: FolderLock };
    default:
      return { label: 'Text / RTF', Icon: FileCode2 };
  }
}

export const InteractiveDocumentViewer: React.FC<Props> = ({
  externalDocument,
  onSaveDraftToVault,
  isOnline,
}) => {
  const [docSource, setDocSource] = useState<ViewerSourceDocument | null>(
    externalDocument || null
  );
  const [thumbnails, setThumbnails] = useState<PageThumbnailItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [loadingDoc, setLoadingDoc] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // PDFjs document handle & page text extraction
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [extractedPdfText, setExtractedPdfText] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Tesseract.js OCR state
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageCode>('eng');
  const [ocrScope, setOcrScope] = useState<'current' | 'all'>('current');
  const [ocrRunning, setOcrRunning] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressUpdate | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrExtractionResult | null>(null);

  // Inline editable text (for text / docx / vault / OCR documents, works offline)
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [editableTitle, setEditableTitle] = useState<string>('');
  const [editableText, setEditableText] = useState<string>('');

  // Government of India Stamp Library overlay state
  const [showStampLibrary, setShowStampLibrary] = useState<boolean>(true);
  const [activeStamp, setActiveStamp] = useState<KartaStampMetadata | null>(
    externalDocument?.initialStamp || null
  );
  const [stampOfficer, setStampOfficer] = useState<string>(
    externalDocument?.initialStamp?.officerName || 'DIP Authorized Desk'
  );
  const [stampReferenceNo, setStampReferenceNo] = useState<string>(
    externalDocument?.initialStamp?.referenceNo || ''
  );
  const [stampPosition, setStampPosition] = useState<KartaStampMetadata['position']>(
    externalDocument?.initialStamp?.position || 'top-right'
  );
  const [stampScale, setStampScale] = useState<number>(
    externalDocument?.initialStamp?.scale || 1
  );
  const [stampOpacity, setStampOpacity] = useState<number>(
    externalDocument?.initialStamp?.opacity || 0.88
  );
  const [applyAllPages, setApplyAllPages] = useState<boolean>(
    Boolean(externalDocument?.initialStamp?.applyAllPages)
  );
  const [stampAnimNonce, setStampAnimNonce] = useState<number>(0);
  const [paperPattern, setPaperPattern] =
    useState<StampBackgroundPatternId>('shcil_emerald');
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // Sync external document when switched from Vault or Studio
  useEffect(() => {
    if (externalDocument) {
      setDocSource(externalDocument);
      setActiveStamp(externalDocument.initialStamp || null);
      if (externalDocument.initialStamp) {
        setStampOfficer(externalDocument.initialStamp.officerName || 'DIP Authorized Desk');
        setStampReferenceNo(externalDocument.initialStamp.referenceNo || '');
        setStampPosition(externalDocument.initialStamp.position || 'top-right');
        setStampScale(externalDocument.initialStamp.scale || 1);
        setStampOpacity(externalDocument.initialStamp.opacity || 0.88);
        setApplyAllPages(Boolean(externalDocument.initialStamp.applyAllPages));
      }
      setEditableTitle(externalDocument.title);
      setEditableText(
        externalDocument.initialOcr?.ocrText || externalDocument.textContent || ''
      );
      if (externalDocument.initialOcr?.ocrText) {
        setOcrResult({
          text: externalDocument.initialOcr.ocrText,
          confidence: externalDocument.initialOcr.ocrConfidence,
          wordCount: externalDocument.initialOcr.ocrWordCount,
          lineCount: externalDocument.initialOcr.ocrText.split(/\r?\n/).length,
          language: (externalDocument.initialOcr.ocrLanguage as OcrLanguageCode) || 'eng',
          durationMs: 0,
          pageTexts: [
            {
              pageNumber: 1,
              text: externalDocument.initialOcr.ocrText,
              confidence: externalDocument.initialOcr.ocrConfidence,
            },
          ],
        });
      } else {
        setOcrResult(null);
      }
      setIsEditingText(false);
    }
  }, [externalDocument]);

  // Keep active stamp metadata synced if officer / position / scale / opacity changes
  useEffect(() => {
    setActiveStamp((prev) =>
      prev
        ? {
            ...prev,
            officerName: stampOfficer.trim() || 'DIP Authorized Desk',
            referenceNo: stampReferenceNo.trim() || undefined,
            position: stampPosition,
            scale: stampScale,
            opacity: stampOpacity,
            applyAllPages,
          }
        : null
    );
  }, [
    stampOfficer,
    stampReferenceNo,
    stampPosition,
    stampScale,
    stampOpacity,
    applyAllPages,
  ]);

  // Generate sample multi-page Indian legal deed PDF using pdf-lib
  const handleLoadSamplePdf = useCallback(async () => {
    setLoadingDoc(true);
    setErrorMsg(null);
    setOcrResult(null);
    try {
      const pdf = await PDFDocument.create();
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);

      const pagesContent = [
        {
          heading: 'INDIA NON JUDICIAL — SHCIL E-STAMP SPECIMEN INSTRUMENT',
          sub: 'Certificate No: IN-DL98421055431209W | Denomination: Rs. 100/-',
          body: [
            'SPECIAL POWER OF ATTORNEY (REGISTRATION & REPRESENTATION)',
            '',
            'KNOWN ALL MEN BY THESE PRESENTS that I, Shri Rajeshwar Sharma, S/o Late Shri',
            'Mohan Lal Sharma, residing at B-42, Defence Colony, New Delhi - 110024,',
            'hereinafter referred to as the "EXECUTANT / PRINCIPAL", do hereby nominate,',
            'constitute, and appoint Smt. Ananya Sharma, R/o New Delhi as my true and',
            'lawful Special Attorney for the limited purposes set forth below:',
            '',
            '1. To appear before the Sub-Registrar of Assurances, NCT of Delhi, and admit',
            '   execution of the Sale / Conveyance Instrument dated 18 November 2026.',
            '2. To present necessary identity credentials, pay applicable registration and',
            '   e-Stamp duties, and collect the duly registered instrument receipt.',
            '3. To sign any statutory declaration or Section 32A endorsement required',
            '   under the Registration Act, 1908.',
          ],
        },
        {
          heading: 'PAGE 2 — SCHEDULE OF PROPERTY & WITNESS ATTESTATION',
          sub: 'Continuation Sheet (Plain Bond) | Digital India Project Karta-Files',
          body: [
            'SCHEDULE OF IMMOVABLE PROPERTY:',
            'All that piece and parcel of Residential Unit No. B-42 (Second Floor),',
            'admeasuring 185 Sq. Yards situated in Block B, Defence Colony, New Delhi,',
            'bounded by North: Road 12m, South: Service Lane, East: Plot B-43, West: B-41.',
            '',
            'IN WITNESS WHEREOF I have set and subscribed my hand on this 18th day',
            'of November, 2026 at New Delhi in the presence of two attesting witnesses.',
            '',
            'EXECUTANT SIGNATURE: ________________________',
            '',
            'WITNESS 1: Name: Vikram Verma   | Address: Lajpat Nagar II, New Delhi',
            'WITNESS 2: Name: Meera Iyer     | Address: Kailash Colony, New Delhi',
          ],
        },
      ];

      for (const spec of pagesContent) {
        const page = pdf.addPage(PageSizes.A4);
        const { width, height } = page.getSize();
        page.drawRectangle({
          x: 34,
          y: 34,
          width: width - 68,
          height: height - 68,
          borderColor: rgb(0.08, 0.48, 0.34),
          borderWidth: 1.2,
          color: rgb(0.996, 0.992, 0.972),
        });
        page.drawText(spec.heading, {
          x: 56,
          y: height - 76,
          size: 12.5,
          font: fontBold,
          color: rgb(0.08, 0.32, 0.2),
        });
        page.drawText(spec.sub, {
          x: 56,
          y: height - 96,
          size: 9.5,
          font: fontRegular,
          color: rgb(0.35, 0.38, 0.42),
        });
        page.drawLine({
          start: { x: 56, y: height - 108 },
          end: { x: width - 56, y: height - 108 },
          thickness: 0.75,
          color: rgb(0.8, 0.82, 0.85),
        });
        let cursorY = height - 138;
        for (const line of spec.body) {
          page.drawText(line, {
            x: 56,
            y: cursorY,
            size: 10.5,
            font: line === line.toUpperCase() && line.length > 6 ? fontBold : fontRegular,
            color: rgb(0.12, 0.14, 0.17),
          });
          cursorY -= 20;
        }
      }

      const bytes = await pdf.save();
      setDocSource({
        id: `sample_pdf_${Date.now()}`,
        templateId: 'tpl_ca9c3a3ff6ba',
        title: 'Special Power of Attorney (SHCIL e-Stamp Specimen)',
        fileName: 'special_poa_shcil_specimen.pdf',
        kind: 'pdf',
        pdfBytes: new Uint8Array(bytes),
        fileSizeBytes: bytes.length,
      });
      setEditableTitle('Special Power of Attorney (SHCIL e-Stamp Specimen)');
      setIsEditingText(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate sample PDF.'
      );
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  const handleLoadScannedDeedImage = useCallback(() => {
    const dataUrl = createSampleScannedDeedDataUrl();
    if (!dataUrl) return;
    setOcrResult(null);
    setExtractedPdfText('');
    setDocSource({
      id: `scan_sample_${Date.now()}`,
      templateId: 'ocr_scanned_deed',
      title: 'Scanned Leave and License Stamp Paper (SHCIL)',
      fileName: 'scanned_leave_license_deed.png',
      kind: 'image',
      imageUrl: dataUrl,
      fileSizeBytes: Math.round((dataUrl.length * 3) / 4),
    });
    setEditableTitle('Scanned Leave and License Stamp Paper (SHCIL)');
    setIsEditingText(false);
    triggerHaptic('light');
  }, []);

  // Load initial sample PDF if no document has been selected yet
  useEffect(() => {
    if (!docSource && !externalDocument) {
      void handleLoadSamplePdf();
    }
  }, [docSource, externalDocument, handleLoadSamplePdf]);

  // Build thumbnails and parse content whenever docSource changes
  useEffect(() => {
    let cancelled = false;

    async function loadAndThumbnail() {
      if (!docSource) return;
      setLoadingDoc(true);
      setErrorMsg(null);
      setCurrentPage(1);

      try {
        if (docSource.kind === 'pdf' && docSource.pdfBytes) {
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(docSource.pdfBytes),
          });
          const pdf = await loadingTask.promise;
          if (cancelled) {
            await loadingTask.destroy();
            return;
          }
          pdfDocRef.current = pdf;
          setTotalPages(pdf.numPages);

          const generatedThumbs: PageThumbnailItem[] = [];
          const textChunks: string[] = [];

          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            if (cancelled) break;
            const page = await pdf.getPage(pageNo);
            const vp = page.getViewport({ scale: 0.28 });
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = Math.max(80, Math.floor(vp.width));
            thumbCanvas.height = Math.max(100, Math.floor(vp.height));
            const ctx = thumbCanvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
              await page.render({ canvasContext: ctx, viewport: vp, canvas: thumbCanvas }).promise;
            }

            const tc = await page.getTextContent();
            const pageStr = tc.items
              .map((it) => ('str' in it ? it.str : ''))
              .join(' ')
              .trim();
            textChunks.push(`[Page ${pageNo}]\n${pageStr}`);

            generatedThumbs.push({
              pageNumber: pageNo,
              label: `Page ${pageNo}`,
              thumbDataUrl: thumbCanvas.toDataURL('image/png'),
              excerpt: pageStr.slice(0, 64),
              kind: 'pdf',
            });
          }

          if (!cancelled) {
            setThumbnails(generatedThumbs);
            const combined = textChunks.join('\n\n').trim();
            setExtractedPdfText(combined);
            if (!docSource.initialOcr?.ocrText) {
              setEditableText(combined);
            }
          }
        } else if (docSource.kind === 'image' && docSource.imageUrl) {
          pdfDocRef.current = null;
          setTotalPages(1);
          setExtractedPdfText('');
          setThumbnails([
            {
              pageNumber: 1,
              label: docSource.fileName,
              thumbDataUrl: docSource.imageUrl,
              kind: 'image',
            },
          ]);
        } else {
          pdfDocRef.current = null;
          const pages = splitTextIntoPages(
            isEditingText ? editableText : docSource.textContent || '',
            2200
          );
          setTotalPages(pages.length);
          setExtractedPdfText('');
          setThumbnails(
            pages.map((txt, idx) => ({
              pageNumber: idx + 1,
              label: `Sheet ${idx + 1}`,
              excerpt: txt.slice(0, 110),
              kind: docSource.kind,
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Unable to render document.'
          );
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    }

    void loadAndThumbnail();

    return () => {
      cancelled = true;
    };
  }, [docSource, isEditingText, editableText]);

  // Render active PDF page canvas whenever currentPage or zoom changes
  useEffect(() => {
    let cancelled = false;
    async function renderActivePdfPage() {
      const pdf = pdfDocRef.current;
      const canvas = mainCanvasRef.current;
      if (!pdf || !canvas || docSource?.kind !== 'pdf') return;

      try {
        const page = await pdf.getPage(Math.min(Math.max(1, currentPage), pdf.numPages));
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = 1.25 * zoom * dpr;
        const viewport = page.getViewport({ scale: renderScale });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'PDF page render failed.');
        }
      }
    }
    void renderActivePdfPage();
    return () => {
      cancelled = true;
    };
  }, [docSource, currentPage, zoom]);

  const handleRunOcr = useCallback(async () => {
    if (!docSource || ocrRunning) return;
    if (docSource.kind !== 'image' && docSource.kind !== 'pdf') return;

    setOcrRunning(true);
    setErrorMsg(null);
    setOcrProgress({ phase: 'Initializing Tesseract OCR engine', progressPercent: 4 });

    try {
      let result: OcrExtractionResult;
      if (docSource.kind === 'image' && docSource.imageUrl) {
        result = await runOcrOnImageSource(docSource.imageUrl, {
          language: ocrLanguage,
          onProgress: (p) => setOcrProgress(p),
        });
      } else if (docSource.kind === 'pdf' && docSource.pdfBytes) {
        const targetPages =
          ocrScope === 'all'
            ? Array.from({ length: totalPages }, (_, i) => i + 1)
            : [currentPage];
        result = await runOcrOnPdfBytes(docSource.pdfBytes, targetPages, {
          language: ocrLanguage,
          onProgress: (p) => setOcrProgress(p),
        });
      } else {
        return;
      }

      setOcrResult(result);
      if (result.text) {
        setEditableText(result.text);
      }
      triggerHaptic('success');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Tesseract OCR failed to process the document.'
      );
      triggerHaptic('warning');
    } finally {
      setOcrRunning(false);
    }
  }, [docSource, ocrRunning, ocrLanguage, ocrScope, totalPages, currentPage]);

  // Trigger automatic OCR when opened from Vault "Scan & OCR Upload"
  const autoOcrTriggeredForIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      docSource?.autoRunOcr &&
      autoOcrTriggeredForIdRef.current !== docSource.id &&
      (docSource.kind === 'image' || docSource.kind === 'pdf') &&
      !loadingDoc
    ) {
      autoOcrTriggeredForIdRef.current = docSource.id;
      void handleRunOcr();
    }
  }, [docSource, loadingDoc, handleRunOcr]);

  const handleFileSelect = async (file?: File) => {
    if (!file) return;
    setErrorMsg(null);
    setLoadingDoc(true);
    setOcrResult(null);

    try {
      const lower = file.name.toLowerCase();
      if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setDocSource({
          id: `upload_${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ''),
          fileName: file.name,
          kind: 'pdf',
          pdfBytes: bytes,
          fileSizeBytes: file.size,
        });
        setEditableTitle(file.name.replace(/\.pdf$/i, ''));
      } else if (lower.endsWith('.docx')) {
        const buf = await file.arrayBuffer();
        const text = await extractDocxParagraphs(buf);
        setDocSource({
          id: `upload_${Date.now()}`,
          title: file.name.replace(/\.docx$/i, ''),
          fileName: file.name,
          kind: 'docx',
          textContent: text,
          fileSizeBytes: file.size,
        });
        setEditableTitle(file.name.replace(/\.docx$/i, ''));
        setEditableText(text);
      } else if (
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|webp|svg)$/i.test(lower)
      ) {
        const imageUrl = URL.createObjectURL(file);
        setDocSource({
          id: `upload_${Date.now()}`,
          title: file.name,
          fileName: file.name,
          kind: 'image',
          imageUrl,
          fileSizeBytes: file.size,
        });
        setEditableTitle(file.name);
        setEditableText('');
      } else {
        const rawText = await file.text();
        const cleaned = lower.endsWith('.rtf')
          ? stripRtfControlWords(rawText)
          : rawText;
        setDocSource({
          id: `upload_${Date.now()}`,
          title: file.name,
          fileName: file.name,
          kind: 'text',
          textContent: cleaned,
          fileSizeBytes: file.size,
        });
        setEditableTitle(file.name);
        setEditableText(cleaned);
      }
      setIsEditingText(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to open file.');
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleApplyGoIStamp = (def: GoIStampDefinition) => {
    const nextStamp: KartaStampMetadata = {
      presetId: def.id,
      label: def.label,
      subtitle: def.subtitle,
      authorityLine: def.authorityLine,
      shape: def.shape,
      officerName: stampOfficer.trim() || 'DIP Authorized Desk',
      referenceNo: stampReferenceNo.trim() || undefined,
      stampedAtIso: new Date().toISOString(),
      colorHex: def.colorHex,
      position: stampPosition,
      scale: stampScale,
      opacity: stampOpacity,
      applyAllPages,
    };
    setActiveStamp(nextStamp);
    setStampAnimNonce((n) => n + 1);
    triggerHaptic('medium');
  };

  const handleDownloadStampedPdf = async () => {
    if (!docSource) return;
    setExportingPdf(true);
    setErrorMsg(null);
    try {
      let pdfDoc: PDFDocument;
      if (docSource.kind === 'pdf' && docSource.pdfBytes) {
        pdfDoc = await PDFDocument.load(docSource.pdfBytes, {
          ignoreEncryption: true,
        });
      } else if (docSource.kind === 'image' && docSource.imageUrl) {
        pdfDoc = await PDFDocument.create();
        const imgResp = await fetch(docSource.imageUrl);
        const imgBytes = await imgResp.arrayBuffer();
        const page = pdfDoc.addPage(PageSizes.A4);
        const { width, height } = page.getSize();
        const isJpg =
          docSource.imageUrl.startsWith('data:image/jpeg') ||
          /\.jpe?g$/i.test(docSource.fileName);
        const embeddedImg = isJpg
          ? await pdfDoc.embedJpg(imgBytes)
          : await pdfDoc.embedPng(imgBytes);
        const dims = embeddedImg.scaleToFit(width - 48, height - 48);
        page.drawImage(embeddedImg, {
          x: (width - dims.width) / 2,
          y: (height - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      } else {
        pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const textPages = splitTextIntoPages(
          isEditingText ? editableText : docSource.textContent || docSource.title,
          2200
        );
        for (let i = 0; i < textPages.length; i++) {
          const p = pdfDoc.addPage(PageSizes.A4);
          const { height } = p.getSize();
          p.drawText(editableTitle || docSource.title, {
            x: 48,
            y: height - 56,
            size: 13,
            font: fontBold,
            color: rgb(0.12, 0.14, 0.18),
          });
          const lines = textPages[i].split('\n').slice(0, 44);
          let y = height - 86;
          for (const ln of lines) {
            p.drawText(ln.slice(0, 92), {
              x: 48,
              y,
              size: 10,
              font,
              color: rgb(0.15, 0.17, 0.2),
            });
            y -= 15;
          }
        }
      }

      if (activeStamp) {
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pages = pdfDoc.getPages();
        const targetIndices = activeStamp.applyAllPages
          ? pages.map((_, idx) => idx)
          : [Math.min(Math.max(0, currentPage - 1), pages.length - 1)];

        for (const pageIdx of targetIndices) {
          embedGoIStampOnPdfPage({
            pdfPage: pages[pageIdx],
            stamp: activeStamp,
            fontBold,
            fontRegular,
          });
        }
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(editableTitle || docSource.fileName || 'document')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')}_stamped.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      triggerHaptic('success');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to generate stamped PDF.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const textPages = useMemo(() => {
    if (!docSource || docSource.kind === 'pdf' || docSource.kind === 'image') {
      return [];
    }
    return splitTextIntoPages(
      isEditingText ? editableText : docSource.textContent || '',
      2200
    );
  }, [docSource, isEditingText, editableText]);

  const activePattern = useMemo(
    () => getStampBackgroundPattern(paperPattern),
    [paperPattern]
  );

  const activeStampDef = activeStamp
    ? getGoIStampById(activeStamp.presetId)
    : null;

  const badge = docSource ? fileBadgeMeta(docSource.kind) : null;

  const combinedSearchableText = useMemo(() => {
    if (ocrResult?.text) return ocrResult.text;
    if (extractedPdfText) return extractedPdfText;
    return '';
  }, [ocrResult, extractedPdfText]);

  const stampPositionClasses =
    stampPosition === 'top-right'
      ? 'top-6 right-6'
      : stampPosition === 'center'
      ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
      : stampPosition === 'bottom-left'
      ? 'bottom-8 left-6'
      : 'bottom-8 right-6';

  const buildVaultOcrPayload = (): KartaOcrMetadata | null => {
    if (!ocrResult?.text) return docSource?.initialOcr || null;
    return {
      ocrText: ocrResult.text,
      ocrLanguage: ocrResult.language,
      ocrConfidence: ocrResult.confidence,
      ocrWordCount: ocrResult.wordCount,
      ocrIndexedAt: new Date().toISOString(),
      sourceFileName: docSource?.fileName,
    };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Viewer Top Control Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF671F]/10 text-[#FF671F] flex items-center justify-center shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#202124] dark:text-white">
                Document Viewer, Tesseract OCR &amp; Government of India Stamp Library
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {badge && (
                  <>
                    <span className="inline-flex items-center gap-1 font-medium text-[#202124] dark:text-slate-200">
                      <badge.Icon className="w-3.5 h-3.5 text-[#FF671F]" />
                      {badge.label}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>Multi-format thumbnails (PDF, DOCX, RTF, Scanned Images)</span>
                <span aria-hidden="true">·</span>
                <span>Tesseract.js OCR indexing</span>
                <span aria-hidden="true">·</span>
                <span>Official GoI PDF overlays</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF671F] text-white text-xs font-semibold hover:bg-[#E55A16] cursor-pointer shadow-xs whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Open Scan / PDF / DOCX
              <input
                type="file"
                accept=".pdf,.docx,.txt,.rtf,.md,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  void handleFileSelect(f);
                  e.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => void handleLoadSamplePdf()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#138808]" />
              Specimen PDF
            </button>

            <button
              type="button"
              onClick={handleLoadScannedDeedImage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileScan className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Scanned Deed Sample
            </button>

            <button
              type="button"
              onClick={() => setShowStampLibrary((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                showStampLibrary
                  ? 'border-[#FF671F] bg-[#FFF5F0] dark:bg-orange-950/30 text-[#FF671F]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Stamp className="w-3.5 h-3.5" />
              {showStampLibrary ? 'Hide Stamp Library' : 'Stamp Library'}
            </button>

            <button
              type="button"
              disabled={!docSource || exportingPdf}
              onClick={() => void handleDownloadStampedPdf()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#138808] text-white text-xs font-semibold hover:bg-[#0F6D06] disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingPdf ? 'Embedding Seal...' : 'Export Stamped PDF'}
            </button>
          </div>
        </div>

        {/* Tesseract.js OCR Extraction Bar (for Scanned Images & Scanned PDFs) */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ScanText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="font-bold text-[#202124] dark:text-white">
              Tesseract.js Document OCR
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 dark:text-slate-400">
              Extract text from scanned physical documents to search &amp; index inside your Vault
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ocrLanguage}
              onChange={(e) => setOcrLanguage(e.target.value as OcrLanguageCode)}
              aria-label="OCR Language"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100"
            >
              <option value="eng">OCR Language: English</option>
              <option value="eng+hin">OCR Language: English + Hindi</option>
              <option value="hin">OCR Language: Hindi</option>
            </select>

            {docSource?.kind === 'pdf' && totalPages > 1 && (
              <select
                value={ocrScope}
                onChange={(e) => setOcrScope(e.target.value as 'current' | 'all')}
                aria-label="OCR Page Scope"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100"
              >
                <option value="current">Scan Page {currentPage}</option>
                <option value="all">Scan All {totalPages} Pages</option>
              </select>
            )}

            <select
              value={paperPattern}
              onChange={(e) =>
                setPaperPattern(e.target.value as StampBackgroundPatternId)
              }
              aria-label="Stamp Paper Backdrop"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100"
            >
              {STAMP_BACKGROUND_PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  Backdrop: {p.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={
                ocrRunning ||
                !docSource ||
                (docSource.kind !== 'image' && docSource.kind !== 'pdf')
              }
              onClick={() => void handleRunOcr()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ScanText className={`w-3.5 h-3.5 ${ocrRunning ? 'animate-pulse' : ''}`} />
              {ocrRunning
                ? `Extracting (${ocrProgress?.progressPercent ?? 0}%)...`
                : 'Extract Text (OCR)'}
            </button>
          </div>
        </div>

        {/* Live Tesseract OCR Progress Bar */}
        {ocrRunning && ocrProgress && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>{ocrProgress.phase}</span>
              <span className="font-mono tabular-nums font-semibold">
                {ocrProgress.progressPercent}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-200"
                style={{ width: `${ocrProgress.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Government of India Stamp Selection UI Library */}
        {showStampLibrary && (
          <GoIStampLibrary
            activeStamp={activeStamp}
            officerName={stampOfficer}
            onOfficerNameChange={setStampOfficer}
            referenceNo={stampReferenceNo}
            onReferenceNoChange={setStampReferenceNo}
            position={stampPosition}
            onPositionChange={setStampPosition}
            stampScale={stampScale}
            onStampScaleChange={setStampScale}
            stampOpacity={stampOpacity}
            onStampOpacityChange={setStampOpacity}
            applyAllPages={applyAllPages}
            onApplyAllPagesChange={setApplyAllPages}
            onSelectStamp={handleApplyGoIStamp}
            onClearStamp={() => setActiveStamp(null)}
          />
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Main Viewer Split: Left Multi-Type Thumbnails + Right Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT RAIL: Thumbnails Strip */}
        <aside className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#FF671F]" />
              Page Thumbnails ({thumbnails.length})
            </span>
            {docSource?.fileSizeBytes ? (
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {Math.max(1, Math.round(docSource.fileSizeBytes / 1024))} KB
              </span>
            ) : null}
          </div>

          <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {thumbnails.map((thumb) => {
              const active = thumb.pageNumber === currentPage;
              const tb = fileBadgeMeta(thumb.kind);
              return (
                <button
                  key={thumb.pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(thumb.pageNumber)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex gap-3 items-start ${
                    active
                      ? 'border-[#FF671F] bg-[#FFF5F0] dark:bg-orange-950/30 ring-1 ring-[#FF671F]'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {thumb.thumbDataUrl ? (
                    <img
                      src={thumb.thumbDataUrl}
                      alt={thumb.label}
                      className="w-16 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-white shrink-0 shadow-2xs"
                    />
                  ) : (
                    <div className="w-16 h-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-[#FFFDF8] p-1.5 flex flex-col justify-between shrink-0 overflow-hidden">
                      <span className="text-[9px] font-semibold text-slate-600 truncate">
                        {tb.label}
                      </span>
                      <p className="text-[7px] leading-tight text-slate-500 line-clamp-4 font-serif">
                        {thumb.excerpt || docSource?.title}
                      </p>
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-[#202124] dark:text-white truncate">
                        {thumb.label}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        {thumb.pageNumber}
                      </span>
                    </div>
                    {thumb.excerpt && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
                        {thumb.excerpt}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT STAGE: Interactive Document Canvas & OCR Inspector */}
        <section className="lg:col-span-9 space-y-3">
          {/* Canvas Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono tabular-nums font-semibold px-2">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-slate-300 dark:text-slate-700 mx-1">|</span>

              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))
                }
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono tabular-nums w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(1.75, Number((z + 0.15).toFixed(2))))
                }
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1.0)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {docSource &&
                (docSource.kind === 'text' ||
                  docSource.kind === 'docx' ||
                  docSource.kind === 'vault' ||
                  Boolean(combinedSearchableText)) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isEditingText && !editableText && combinedSearchableText) {
                        setEditableText(combinedSearchableText);
                      }
                      setIsEditingText((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
                      isEditingText
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {isEditingText ? 'Done Editing' : 'Edit Text'}
                  </button>
                )}

              {onSaveDraftToVault && docSource && (
                <button
                  type="button"
                  onClick={() =>
                    onSaveDraftToVault({
                      vaultDocId: docSource.vaultDocId,
                      vaultVersion: docSource.vaultVersion,
                      templateId:
                        docSource.templateId ||
                        (ocrResult?.text ? 'ocr_scanned_doc' : 'viewer_doc'),
                      title: editableTitle || docSource.title,
                      textContent:
                        editableText ||
                        ocrResult?.text ||
                        docSource.textContent ||
                        extractedPdfText ||
                        `Stamped document: ${docSource.title}`,
                      stampOverlay: activeStamp,
                      ocrMetadata: buildVaultOcrPayload(),
                      customTags: docSource.initialTags,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isOnline ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {ocrResult?.text
                    ? isOnline
                      ? 'Index OCR & Seal to Vault'
                      : 'Queue OCR & Edit Offline'
                    : isOnline
                    ? docSource.vaultDocId
                      ? 'Save & Sync Edit'
                      : 'Seal to Vault'
                    : 'Queue Offline Edit'}
                </button>
              )}
            </div>
          </div>

          {/* Interactive Document Surface */}
          <div className="bg-slate-200/75 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 rounded-2xl p-4 sm:p-6 min-h-[540px] flex flex-col items-center justify-center overflow-auto">
            {loadingDoc && (
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 py-12">
                Rendering pages and generating file thumbnails...
              </div>
            )}

            {!loadingDoc && isEditingText && docSource && (
              <div className="w-full max-w-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    Offline-Ready Document &amp; OCR Text Editor
                  </span>
                  <span className="text-xs text-slate-500">
                    {isOnline
                      ? 'Online: Saves sync directly to Firestore'
                      : 'Offline: Cached to IndexedDB for auto-sync'}
                  </span>
                </div>
                <input
                  type="text"
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#202124] dark:text-white"
                  placeholder="Document Title"
                />
                <textarea
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  rows={18}
                  className="w-full px-3 py-2.5 text-xs font-mono leading-relaxed rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#202124] dark:text-slate-100"
                />
              </div>
            )}

            {!loadingDoc && !isEditingText && docSource && (
              <div
                className="relative bg-[#FFFDF8] shadow-xl border border-stone-300 rounded-sm overflow-hidden transition-all"
                style={{
                  backgroundImage: activePattern.url
                    ? `url("${activePattern.url}")`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {docSource.kind === 'pdf' && (
                  <canvas ref={mainCanvasRef} className="block max-w-full" />
                )}

                {docSource.kind === 'image' && docSource.imageUrl && (
                  <img
                    src={docSource.imageUrl}
                    alt={docSource.title}
                    style={{ width: `${Math.round(580 * zoom)}px` }}
                    className="block max-w-full h-auto"
                  />
                )}

                {(docSource.kind === 'text' ||
                  docSource.kind === 'docx' ||
                  docSource.kind === 'vault') && (
                  <div
                    className="p-8 sm:p-12 text-[#1F2937] font-editorial leading-relaxed whitespace-pre-wrap"
                    style={{
                      width: `${Math.round(640 * zoom)}px`,
                      fontSize: `${Math.round(13.5 * zoom)}px`,
                    }}
                  >
                    <div className="border-b border-stone-300 pb-3 mb-5 flex items-center justify-between gap-2">
                      <h3 className="font-bold text-base text-[#111827]">
                        {editableTitle || docSource.title}
                      </h3>
                      <span className="text-xs font-mono tabular-nums text-stone-500">
                        Sheet {currentPage} of {totalPages}
                      </span>
                    </div>
                    {textPages[currentPage - 1] || ''}
                  </div>
                )}

                {/* Animated Government of India Stamp Overlay */}
                {activeStamp && activeStampDef && (
                  <div
                    key={stampAnimNonce}
                    className={`pointer-events-none absolute z-20 ${stampPositionClasses}`}
                  >
                    <div
                      className="animate-karta-stamp-ring absolute inset-0 rounded-xl border-2"
                      style={{ borderColor: activeStamp.colorHex }}
                    />
                    <GoIStampPreview
                      definition={activeStampDef}
                      officerName={activeStamp.officerName}
                      referenceNo={activeStamp.referenceNo}
                      stampedAtIso={activeStamp.stampedAtIso}
                      opacity={activeStamp.opacity ?? 0.9}
                      scale={activeStamp.scale ?? 1}
                      animated
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Searchable OCR & PDF Extracted Text Inspector */}
          {combinedSearchableText && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[#202124] dark:text-white flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-[#FF671F]" />
                    {ocrResult
                      ? 'Tesseract.js OCR Extracted Text Index'
                      : 'Searchable PDF Text Layer'}
                  </span>
                  {ocrResult && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Confidence: {ocrResult.confidence}% · {ocrResult.wordCount} words ·{' '}
                      {ocrResult.lineCount} lines · Language: {ocrResult.language.toUpperCase()}
                      {ocrResult.durationMs > 0
                        ? ` · ${(ocrResult.durationMs / 1000).toFixed(1)}s`
                        : ''}
                    </p>
                  )}
                </div>

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search extracted text..."
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100 w-60"
                />
              </div>

              <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                {searchTerm.trim()
                  ? combinedSearchableText
                      .split('\n')
                      .filter((l) =>
                        l.toLowerCase().includes(searchTerm.trim().toLowerCase())
                      )
                      .join('\n') || 'No matching lines found in extracted text.'
                  : combinedSearchableText}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
