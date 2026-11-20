import jsQR from 'jsqr';
import * as pdfjsLib from 'pdfjs-dist';
import QRCode from 'qrcode';
import type { KartaLocalRecord } from './kartaSyncService';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type QrVerificationStatus =
  | 'verified_vault_match'
  | 'verified_official_format'
  | 'parsed_metadata';

export interface ParsedQrDocumentMetadata {
  rawData: string;
  formatLabel: string;
  verificationStatus: QrVerificationStatus;
  verificationSummary: string;
  matchedVaultDoc?: {
    id: string;
    title: string;
    version: number;
    integrityHash: string;
  } | null;
  title: string;
  documentType: string;
  certificateNo?: string;
  issuedBy?: string;
  issuedDate?: string;
  jurisdictionState?: string;
  amountInr?: string;
  parties?: string;
  integrityHash?: string;
  verificationUrl?: string;
  suggestedTemplateId: string;
  suggestedTags: string[];
  summaryText: string;
  fields: Array<{ label: string; value: string }>;
}

/**
 * Decodes a QR code directly from an HTMLCanvasElement.
 * Adds a fallback white quiet-zone pass if the tight crop fails to trigger jsQR finder patterns.
 */
export function decodeQrFromCanvas(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const direct = jsQR(imgData.data, imgData.width, imgData.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (direct?.data) return direct.data;

  // Retry with 32px white quiet-zone border (helps when screenshot crops tightly around QR)
  const pad = 32;
  const padded = document.createElement('canvas');
  padded.width = canvas.width + pad * 2;
  padded.height = canvas.height + pad * 2;
  const pCtx = padded.getContext('2d', { willReadFrequently: true });
  if (!pCtx) return null;
  pCtx.fillStyle = '#FFFFFF';
  pCtx.fillRect(0, 0, padded.width, padded.height);
  pCtx.drawImage(canvas, pad, pad);
  const pData = pCtx.getImageData(0, 0, padded.width, padded.height);
  const retry = jsQR(pData.data, pData.width, pData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return retry?.data || null;
}

export function decodeQrFromVideoFrame(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement
): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  scratchCanvas.width = video.videoWidth;
  scratchCanvas.height = video.videoHeight;
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, scratchCanvas.width, scratchCanvas.height);
  return decodeQrFromCanvas(scratchCanvas);
}

export async function decodeQrFromImageSource(
  source: File | Blob | string
): Promise<{ data: string | null; previewUrl: string }> {
  const isUrl = typeof source === 'string';
  const previewUrl = isUrl ? source : URL.createObjectURL(source);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image for QR decoding.'));
      el.src = previewUrl;
    });

    const maxDim = 1400;
    const minDim = 360;
    const baseW = img.naturalWidth || img.width || 512;
    const baseH = img.naturalHeight || img.height || 512;
    let scale = 1;
    if (Math.max(baseW, baseH) > maxDim) {
      scale = maxDim / Math.max(baseW, baseH);
    } else if (Math.min(baseW, baseH) < minDim) {
      scale = minDim / Math.max(1, Math.min(baseW, baseH));
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(baseW * scale));
    canvas.height = Math.max(64, Math.round(baseH * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { data: null, previewUrl };

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const decoded = decodeQrFromCanvas(canvas);
    return { data: decoded, previewUrl };
  } catch (err) {
    if (!isUrl) URL.revokeObjectURL(previewUrl);
    throw err;
  }
}

export async function decodeQrFromPdfFile(
  file: File
): Promise<{ data: string | null; previewUrl?: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  let firstPagePreview: string | undefined;
  try {
    const pagesToScan = Math.min(pdf.numPages, 3);
    for (let pageNo = 1; pageNo <= pagesToScan; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      if (pageNo === 1) {
        firstPagePreview = canvas.toDataURL('image/png');
      }

      const decoded = decodeQrFromCanvas(canvas);
      if (decoded) {
        return { data: decoded, previewUrl: canvas.toDataURL('image/png') };
      }
    }
    return { data: null, previewUrl: firstPagePreview };
  } finally {
    await loadingTask.destroy();
  }
}

function inferTagsAndTemplate(text: string): {
  tags: string[];
  templateId: string;
} {
  const lower = text.toLowerCase();
  const tags: string[] = [];

  if (/tax|tds|form\s*16|gst|itr|income\s*tax|pan|assess/i.test(lower)) {
    tags.push('Tax');
  }
  if (/stamp|shcil|affidavit|poa|power\s*of\s*attorney|deed|legal|contract|agreement|court|notary/i.test(lower)) {
    tags.push('Legal');
  }
  if (/degree|marksheet|university|transcript|school|education|diploma|bonafide/i.test(lower)) {
    tags.push('Educational');
  }
  if (/property|sale\s*deed|lease|rent|license|conveyance|khasra|khata|registry/i.test(lower)) {
    tags.push('Property');
  }
  if (/aadhaar|passport|voter|kyc|identity|driving|birth\s*cert/i.test(lower)) {
    tags.push('Identity');
  }
  if (/compliance|incorporation|roc|mca|msme|udyam/i.test(lower)) {
    tags.push('Compliance');
  }

  let templateId = 'tpl_ca9c3a3ff6ba';
  if (/affidavit|deponent/i.test(lower)) {
    templateId = 'curated_general_affidavit';
  } else if (/leave\s*and\s*license|rent|lease/i.test(lower)) {
    templateId = 'curated_leave_license';
  } else if (/nda|confidentiality/i.test(lower)) {
    templateId = 'curated_nda';
  } else if (/board\s*resolution|company/i.test(lower)) {
    templateId = 'curated_board_resolution';
  }

  return {
    tags: tags.length > 0 ? tags.slice(0, 4) : ['Legal'],
    templateId,
  };
}

function findMatchingVaultDoc(
  vaultDocs: KartaLocalRecord[],
  candidates: {
    docId?: string;
    integrityHash?: string;
    certificateNo?: string;
    title?: string;
  }
): KartaLocalRecord | undefined {
  if (!vaultDocs.length) return undefined;

  if (candidates.docId) {
    const byId = vaultDocs.find((d) => d.id === candidates.docId);
    if (byId) return byId;
  }

  if (candidates.integrityHash && candidates.integrityHash.trim().length >= 8) {
    const cleanHash = candidates.integrityHash.trim().toLowerCase();
    const byHash = vaultDocs.find(
      (d) =>
        d.integrityHash?.toLowerCase() === cleanHash ||
        d.integrityHash?.toLowerCase().startsWith(cleanHash) ||
        cleanHash.startsWith((d.integrityHash || '').toLowerCase())
    );
    if (byHash) return byHash;
  }

  if (candidates.title && candidates.title.trim().length >= 5) {
    const target = candidates.title.trim().toLowerCase();
    const byTitle = vaultDocs.find((d) => d.title.toLowerCase() === target);
    if (byTitle) return byTitle;
  }

  return undefined;
}

export function parseAndVerifyOfficialQr(
  rawData: string,
  vaultDocs: KartaLocalRecord[] = []
): ParsedQrDocumentMetadata {
  const trimmed = (rawData || '').trim();
  const inferred = inferTagsAndTemplate(trimmed);

  // 1. Try JSON payload (DIP Vault Verification QR / Official JSON e-Record)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const str = (keys: string[]): string | undefined => {
        for (const k of keys) {
          const val = obj[k];
          if (typeof val === 'string' && val.trim()) return val.trim();
          if (typeof val === 'number') return String(val);
        }
        return undefined;
      };

      const docId = str(['docId', 'id', 'vaultDocId', 'recordId']);
      const title =
        str(['title', 'documentTitle', 'label', 'subject']) ||
        'Verified Digital Record';
      const documentType =
        str(['documentType', 'type', 'instrument', 'article']) ||
        'Official Digital Record';
      const certificateNo = str([
        'certificateNo',
        'certNo',
        'referenceNo',
        'udr',
        'ackNo',
        'acknowledgementNo',
      ]);
      const issuedBy = str([
        'issuedBy',
        'authority',
        'issuer',
        'department',
        'portal',
      ]);
      const issuedDate = str(['issuedDate', 'date', 'stampedAt', 'savedAt']);
      const jurisdictionState = str(['jurisdictionState', 'state', 'jurisdiction']);
      const amountInr = str(['amountInr', 'stampDutyInr', 'considerationInr', 'taxAmount']);
      const parties =
        str(['parties']) ||
        [str(['firstParty', 'party1']), str(['secondParty', 'party2'])]
          .filter(Boolean)
          .join(' / ') ||
        undefined;
      const integrityHash = str([
        'integrityHash',
        'sha256',
        'checksum',
        'hash',
      ]);
      const verificationUrl = str(['verificationUrl', 'url', 'verifyLink']);

      const rawTags = Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : inferred.tags;

      const vaultMatch = findMatchingVaultDoc(vaultDocs, {
        docId,
        integrityHash,
        certificateNo,
        title,
      });

      const isOfficialStructure = Boolean(
        certificateNo ||
          integrityHash ||
          issuedBy ||
          String(obj.issuer || obj.standard || '').match(/DIP|SHCIL|GoI|UIDAI|ITD|GST/i)
      );

      const fields: Array<{ label: string; value: string }> = [
        { label: 'Record Type', value: documentType },
        ...(certificateNo ? [{ label: 'Certificate / Ref No.', value: certificateNo }] : []),
        ...(issuedBy ? [{ label: 'Issuing Authority', value: issuedBy }] : []),
        ...(issuedDate ? [{ label: 'Issued Date', value: issuedDate }] : []),
        ...(jurisdictionState
          ? [{ label: 'Jurisdiction', value: jurisdictionState }]
          : []),
        ...(amountInr ? [{ label: 'Duty / Amount (INR)', value: `Rs. ${amountInr}` }] : []),
        ...(parties ? [{ label: 'Parties / Subject', value: parties }] : []),
        ...(integrityHash
          ? [{ label: 'SHA-256 Digest', value: integrityHash }]
          : []),
      ];

      const summaryLines = [
        `QR VERIFIED DIGITAL METADATA RECORD`,
        `==================================================`,
        `Title: ${title}`,
        ...fields.map((f) => `${f.label}: ${f.value}`),
        ...(verificationUrl ? [`Verification Endpoint: ${verificationUrl}`] : []),
        ``,
        `Imported into DIP-Desk Karta Files via QR Scanner.`,
      ];

      return {
        rawData: trimmed,
        formatLabel: vaultMatch
          ? 'DIP Karta Vault Integrity QR'
          : isOfficialStructure
          ? 'Official Structured JSON Record'
          : 'Structured JSON Metadata',
        verificationStatus: vaultMatch
          ? 'verified_vault_match'
          : isOfficialStructure
          ? 'verified_official_format'
          : 'parsed_metadata',
        verificationSummary: vaultMatch
          ? `Matched Karta Vault record "${vaultMatch.title}" (v${vaultMatch.version}) with verified SHA-256 digest.`
          : isOfficialStructure
          ? `Structured ${issuedBy || 'Official'} digital record validated cleanly.`
          : 'Structured JSON document metadata extracted and ready for Karta Files import.',
        matchedVaultDoc: vaultMatch
          ? {
              id: vaultMatch.id,
              title: vaultMatch.title,
              version: vaultMatch.version,
              integrityHash: vaultMatch.integrityHash,
            }
          : null,
        title,
        documentType,
        certificateNo,
        issuedBy,
        issuedDate,
        jurisdictionState,
        amountInr,
        parties,
        integrityHash,
        verificationUrl,
        suggestedTemplateId: str(['templateId']) || inferred.templateId,
        suggestedTags: rawTags.slice(0, 5),
        summaryText: summaryLines.join('\n'),
        fields,
      };
    } catch {
      // fall through to line/URL parsing
    }
  }

  // 2. Try URL payload (DigiLocker / SHCIL / Income Tax / GST / Generic URL)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const isGovHost =
        /\.(gov\.in|nic\.in)$/i.test(host) ||
        /shcilestamp\.com|digilocker|digitalindiaproject|dip-desk/i.test(host);

      const certNo =
        url.searchParams.get('certNo') ||
        url.searchParams.get('certificateNo') ||
        url.searchParams.get('ref') ||
        url.searchParams.get('udr') ||
        url.searchParams.get('id') ||
        undefined;
      const hash =
        url.searchParams.get('hash') ||
        url.searchParams.get('sha256') ||
        url.searchParams.get('checksum') ||
        undefined;
      const titleParam =
        url.searchParams.get('title') ||
        url.searchParams.get('doc') ||
        (certNo ? `Verification Record ${certNo}` : `Record from ${url.hostname}`);

      const vaultMatch = findMatchingVaultDoc(vaultDocs, {
        docId: url.searchParams.get('docId') || undefined,
        integrityHash: hash,
        certificateNo: certNo,
        title: titleParam,
      });

      const fields: Array<{ label: string; value: string }> = [
        { label: 'Verification Domain', value: url.hostname },
        ...(certNo ? [{ label: 'Reference / Cert No.', value: certNo }] : []),
        ...(hash ? [{ label: 'SHA-256 Digest', value: hash }] : []),
      ];
      url.searchParams.forEach((v, k) => {
        if (!['certNo', 'certificateNo', 'ref', 'udr', 'id', 'hash', 'sha256', 'checksum'].includes(k)) {
          fields.push({ label: k, value: v });
        }
      });

      return {
        rawData: trimmed,
        formatLabel: isGovHost ? 'Official Verification URL' : 'Document Verification Link',
        verificationStatus: vaultMatch
          ? 'verified_vault_match'
          : isGovHost
          ? 'verified_official_format'
          : 'parsed_metadata',
        verificationSummary: vaultMatch
          ? `Verification link matches encrypted Karta Vault document "${vaultMatch.title}".`
          : isGovHost
          ? `Official portal verification URI (${url.hostname}) decoded successfully.`
          : `External document URI (${url.hostname}) parsed into Karta metadata.`,
        matchedVaultDoc: vaultMatch
          ? {
              id: vaultMatch.id,
              title: vaultMatch.title,
              version: vaultMatch.version,
              integrityHash: vaultMatch.integrityHash,
            }
          : null,
        title: titleParam,
        documentType: isGovHost ? 'Official Portal Link' : 'External Verification Link',
        certificateNo: certNo,
        issuedBy: url.hostname,
        integrityHash: hash,
        verificationUrl: trimmed,
        suggestedTemplateId: inferred.templateId,
        suggestedTags: inferred.tags,
        summaryText: [
          `QR VERIFICATION LINK METADATA`,
          `==================================================`,
          `Title: ${titleParam}`,
          `Verification URL: ${trimmed}`,
          ...fields.map((f) => `${f.label}: ${f.value}`),
        ].join('\n'),
        fields,
      };
    } catch {
      // fall through
    }
  }

  // 3. Key-value text payload (e.g. SHCIL e-Stamp multiline barcode payload)
  const lines = trimmed
    .split(/\r?\n|;\s*/)
    .map((l) => l.trim())
    .filter(Boolean);
  const kvFields: Array<{ label: string; value: string }> = [];
  const kvMap = new Map<string, string>();

  for (const line of lines) {
    const idx = line.indexOf(':') > 0 ? line.indexOf(':') : line.indexOf('=');
    if (idx > 0 && idx < 42) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && v) {
        kvFields.push({ label: k, value: v });
        kvMap.set(k.toLowerCase(), v);
      }
    }
  }

  const shcilCert =
    kvMap.get('certificate no') ||
    kvMap.get('cert no') ||
    trimmed.match(/\bIN-[A-Z]{2}[A-Z0-9]{8,20}\b/i)?.[0];
  const amount =
    kvMap.get('stamp duty amount') ||
    kvMap.get('stamp duty') ||
    kvMap.get('amount');
  const firstParty = kvMap.get('first party') || kvMap.get('purchased by');
  const secondParty = kvMap.get('second party');
  const issuedDate =
    kvMap.get('certificate issued date') ||
    kvMap.get('issued date') ||
    kvMap.get('date');
  const article =
    kvMap.get('description of document') ||
    kvMap.get('article') ||
    kvMap.get('document type');
  const hashVal = kvMap.get('sha256') || kvMap.get('integrityhash');

  const derivedTitle =
    kvMap.get('title') ||
    (shcilCert
      ? `SHCIL e-Stamp ${shcilCert}`
      : article || lines[0]?.slice(0, 72) || 'QR Imported Document');

  const vaultMatch = findMatchingVaultDoc(vaultDocs, {
    integrityHash: hashVal,
    certificateNo: shcilCert,
    title: derivedTitle,
  });

  const isShcilOrOfficial = Boolean(
    shcilCert ||
      /SHCIL|INDIA NON JUDICIAL|FORM 16|INCOME TAX|GSTIN|DIGILOCKER/i.test(trimmed)
  );

  const fields =
    kvFields.length > 0
      ? kvFields
      : [{ label: 'Decoded QR Content', value: trimmed.slice(0, 240) }];

  return {
    rawData: trimmed,
    formatLabel: vaultMatch
      ? 'Matched Vault Record'
      : shcilCert
      ? 'SHCIL e-Stamp Barcode Payload'
      : kvFields.length > 1
      ? 'Key-Value Metadata Record'
      : 'Plain QR Payload',
    verificationStatus: vaultMatch
      ? 'verified_vault_match'
      : isShcilOrOfficial
      ? 'verified_official_format'
      : 'parsed_metadata',
    verificationSummary: vaultMatch
      ? `Matched Karta Vault document "${vaultMatch.title}".`
      : shcilCert
      ? `Valid Indian SHCIL e-Stamp Certificate format (${shcilCert}) verified.`
      : kvFields.length > 1
      ? `Extracted ${kvFields.length} structured metadata fields from QR code.`
      : 'Decoded QR content and prepared metadata for Karta Files import.',
    matchedVaultDoc: vaultMatch
      ? {
          id: vaultMatch.id,
          title: vaultMatch.title,
          version: vaultMatch.version,
          integrityHash: vaultMatch.integrityHash,
        }
      : null,
    title: derivedTitle,
    documentType: article || (shcilCert ? 'SHCIL e-Stamp Certificate' : 'Digital Record'),
    certificateNo: shcilCert,
    issuedBy: shcilCert ? 'SHCIL / State Stamp Authority' : kvMap.get('issued by'),
    issuedDate,
    jurisdictionState: kvMap.get('state') || kvMap.get('jurisdiction'),
    amountInr: amount,
    parties: [firstParty, secondParty].filter(Boolean).join(' / ') || undefined,
    integrityHash: hashVal,
    suggestedTemplateId: inferred.templateId,
    suggestedTags: inferred.tags,
    summaryText: [
      `QR EXTRACTED RECORD METADATA`,
      `==================================================`,
      ...fields.map((f) => `${f.label}: ${f.value}`),
    ].join('\n'),
    fields,
  };
}

export async function generateSpecimenQrDataUrl(
  kind: 'shcil_estamp' | 'tax_tds' | 'educational_degree',
  vaultDoc?: KartaLocalRecord
): Promise<{ dataUrl: string; label: string; payloadText: string }> {
  let payload: Record<string, unknown>;
  let label = '';

  if (vaultDoc) {
    label = `Vault Verification QR (${vaultDoc.title})`;
    payload = {
      standard: 'DIP-KARTA-VAULT-V1',
      docId: vaultDoc.id,
      title: vaultDoc.title,
      documentType: 'Karta E2EE Sealed Instrument',
      issuedBy: 'Digital India Project · Karta Cloud Vault',
      integrityHash: vaultDoc.integrityHash,
      version: vaultDoc.version,
      tags: vaultDoc.tags,
    };
  } else if (kind === 'tax_tds') {
    label = 'Income Tax Form 16 Part-A QR Specimen';
    payload = {
      standard: 'ITD-TRACES-FORM16',
      certificateNo: 'TRACES-F16-2026-8841209',
      title: 'Form 16 TDS Certificate FY 2025-26',
      documentType: 'Income Tax TDS Certificate',
      issuedBy: 'Income Tax Department · TRACES',
      issuedDate: '2026-06-14',
      jurisdictionState: 'All-India',
      amountInr: '148500',
      parties: 'Deductor: Bharat Infra Tech Pvt Ltd / Deductee: Aarav Mehta',
      tags: ['Tax', 'Compliance'],
    };
  } else if (kind === 'educational_degree') {
    label = 'DigiLocker NAD Degree Certificate QR';
    payload = {
      standard: 'NAD-DIGILOCKER-V2',
      certificateNo: 'NAD-DU-2024-0049182',
      title: 'Bachelor of Technology Degree Certificate',
      documentType: 'University Degree Credential',
      issuedBy: 'University of Delhi · National Academic Depository',
      issuedDate: '2024-07-22',
      jurisdictionState: 'Delhi',
      parties: 'Recipient: Priya Nair',
      tags: ['Educational', 'Identity'],
    };
  } else {
    label = 'SHCIL e-Stamp Certificate QR Specimen';
    payload = {
      standard: 'SHCIL-IN-ESTAMP-V1',
      certificateNo: 'IN-DL98421055431209W',
      title: 'Special Power of Attorney (SHCIL e-Stamp)',
      documentType: 'Article 48(c) Power of Attorney',
      issuedBy: 'Stock Holding Corporation of India Ltd. (SHCIL)',
      issuedDate: '2026-11-18',
      jurisdictionState: 'Delhi',
      amountInr: '100',
      parties: 'Shri Rajeshwar Sharma / Smt. Ananya Sharma',
      templateId: 'tpl_ca9c3a3ff6ba',
      tags: ['Legal', 'Property'],
    };
  }

  const payloadText = JSON.stringify(payload);
  const dataUrl = await QRCode.toDataURL(payloadText, {
    width: 340,
    margin: 3,
    color: {
      dark: '#111827',
      light: '#FFFFFF',
    },
  });

  return { dataUrl, label, payloadText };
}
