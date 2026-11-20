import crypto from 'node:crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DocumentValidationReport, ValidationCheckItem } from '../../src/karta/shared/types';
import { detectStatutoryWarnings } from './textCleaner';

export function validateLegalDocumentContent(params: {
  content: string;
  title?: string;
  rawCategory?: string;
  jurisdictionState?: string;
  executionDate?: string;
  hasSignature?: boolean;
  eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
  eStampCertNumber?: string;
}): DocumentValidationReport {
  const text = (params.content || '').trim();
  const checks: ValidationCheckItem[] = [];
  const lower = text.toLowerCase();
  const catLower = (params.rawCategory || params.title || '').toLowerCase();

  // 1. Unfilled placeholders / blanks check
  const underscoreBlanks = text.match(/_{4,}/g) || [];
  // Ignore signature line underscores preceded by Signature/Witness/Deponent/Licensor/etc.
  const lines = text.split('\n');
  let nonSigBlanks = 0;
  for (const line of lines) {
    const hasSigLabel = /^\s*(?:witness|signature|deponent|executant|licensor|licensee|testator|vendor|purchaser|donor|donee|principal|attorney|plaintiff|petitioner|advocate|for employer|employee)/i.test(
      line.trim()
    );
    if (!hasSigLabel) {
      nonSigBlanks += (line.match(/(?:_{4,}|\.{5,}|…{3,})/g) || []).length;
    }
  }
  const bracketBlanks = (text.match(/\[(?:insert|enter|specify|verify|not provided)[^\]]*\]/gi) || []).length;
  const mustacheBlanks = (text.match(/\{\{[a-z0-9_]+\}\}/gi) || []).length;
  const angleBlanks = (text.match(/<<[^>]+>>|<DD\/MM\/YYYY>/gi) || []).length;
  const totalUnfilled = nonSigBlanks + bracketBlanks + mustacheBlanks + angleBlanks;

  if (totalUnfilled === 0) {
    checks.push({
      id: 'blanks_check',
      category: 'Completeness',
      title: 'No Unfilled Variable Placeholders Detected',
      severity: 'pass',
      detail: 'All mapped placeholders, brackets, and dotted/underscore body blanks appear populated.',
    });
  } else {
    checks.push({
      id: 'blanks_check',
      category: 'Completeness',
      title: `${totalUnfilled} Unfilled Placeholder(s) Remaining`,
      severity: 'error',
      detail: `Found ${nonSigBlanks} body blank lines, ${bracketBlanks} bracket placeholders, ${mustacheBlanks} unreplaced tokens, and ${angleBlanks} angle placeholders.`,
      suggestion: 'Complete all highlighted fields in Step 1 or edit the text directly before final export.',
    });
  }

  // 2. Minimum content & word count
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 25) {
    checks.push({
      id: 'content_length',
      category: 'Completeness',
      title: 'Document Body Too Short',
      severity: 'error',
      detail: `Document contains only ${words.length} words. Verify the full source text loaded properly.`,
    });
  } else {
    checks.push({
      id: 'content_length',
      category: 'Completeness',
      title: 'Document Structure & Length Verified',
      severity: 'pass',
      detail: `${words.length.toLocaleString('en-IN')} words across ${lines.length} lines preserved.`,
    });
  }

  // 3. Explicit State / Jurisdiction Check
  const state = (params.jurisdictionState || '').trim();
  if (!state || state === 'Not Specified') {
    checks.push({
      id: 'jurisdiction_check',
      category: 'Jurisdiction & Date',
      title: 'State / UT Jurisdiction Not Explicitly Selected',
      severity: 'warning',
      detail: 'Indian stamp duty, registration rules, and territorial court jurisdiction depend on the State/UT.',
      suggestion: 'Select the governing Indian State or Union Territory explicitly.',
    });
  } else {
    checks.push({
      id: 'jurisdiction_check',
      category: 'Jurisdiction & Date',
      title: `Jurisdiction Specified: ${state}`,
      severity: 'pass',
      detail: 'Governing Indian State/UT is explicitly recorded for stamp duty and court verification.',
    });
  }

  // 4. Execution / Filing Date Check
  const execDate = (params.executionDate || '').trim();
  if (!execDate || execDate === 'Not Specified') {
    checks.push({
      id: 'date_check',
      category: 'Jurisdiction & Date',
      title: 'Execution / Filing Date Missing',
      severity: 'warning',
      detail: 'No explicit execution or filing date has been set.',
      suggestion: 'Specify the intended date of execution or court filing.',
    });
  } else {
    checks.push({
      id: 'date_check',
      category: 'Jurisdiction & Date',
      title: `Execution Date Set: ${execDate}`,
      severity: 'pass',
      detail: 'Explicit date recorded.',
    });
  }

  // 5. Verification Clause for Affidavits / Plaints / Petitions
  const needsVerification = /\b(affidavit|plaint|petition|complaint|writ|written statement)\b/.test(catLower) ||
    /\bsolemnly affirm\b/i.test(text);
  if (needsVerification) {
    const hasVerification = /\bverification\b|\bverified at\b/i.test(text);
    checks.push({
      id: 'verification_clause',
      category: 'Execution & Witnesses',
      title: hasVerification
        ? 'Verification Clause Present'
        : 'Missing Verification Clause (Order VI Rule 15 CPC / Oaths Act)',
      severity: hasVerification ? 'pass' : 'warning',
      detail: hasVerification
        ? 'Includes formal Verification block affirming truth of paragraphs.'
        : 'Affidavits, plaints, and petitions in India require a signed Verification paragraph stating place and date.',
    });
  }

  // 6. Witness Attestation Check for Wills, Deeds, Agreements, POAs
  const needsWitness = /\b(will|codicil|sale|gift|partition|lease|rent|power of attorney|deed)\b/.test(catLower);
  if (needsWitness) {
    const hasWitness = /\bwitness(?:es)?\b|\battest/i.test(text);
    checks.push({
      id: 'witness_block',
      category: 'Execution & Witnesses',
      title: hasWitness ? 'Witness Attestation Section Present' : 'No Witness Attestation Section Found',
      severity: hasWitness ? 'pass' : 'warning',
      detail: hasWitness
        ? 'Document includes witness attestation lines (mandatory 2 witnesses for Wills u/s 63 Indian Succession Act).'
        : 'Consider adding two independent witness signature blocks via the Repeatable Witnesses section.',
    });
  }

  // 7. e-Stamp & Signature Attachment Check
  if (params.eStampMode === 'existing_certificate') {
    const validCert = /^IN-[A-Z0-9\-]{8,30}$/i.test((params.eStampCertNumber || '').trim());
    checks.push({
      id: 'estamp_cert',
      category: 'Execution & Witnesses',
      title: validCert
        ? `e-Stamp Reference Attached (${params.eStampCertNumber?.trim()})`
        : 'Check e-Stamp Certificate Number Format',
      severity: validCert ? 'pass' : 'warning',
      detail: validCert
        ? 'Note: Verify certificate authenticity directly on shcilestamp.com / State GRAS portal.'
        : 'SHCIL e-Stamp certificate numbers typically begin with "IN-" followed by state code and alphanumeric digits.',
    });
  } else {
    checks.push({
      id: 'estamp_cert',
      category: 'Execution & Witnesses',
      title: 'No Live Government e-Stamp Attached',
      severity: 'warning',
      detail:
        params.eStampMode === 'sample_preview'
          ? 'Draft uses a sample non-judicial stamp layout preview only. Purchase an actual e-Stamp before execution.'
          : 'Attach a purchased SHCIL e-Stamp reference or print onto state non-judicial stamp paper if required.',
    });
  }

  if (params.hasSignature) {
    checks.push({
      id: 'signature_status',
      category: 'Execution & Witnesses',
      title: 'Visual Draft Signature Embedded (Not Aadhaar e-Sign)',
      severity: 'pass',
      detail:
        'Drawn/typed signature image will be embedded into DOCX/PDF as a draft signature placeholder. Use Aadhaar e-Sign / wet ink for legal execution.',
    });
  }

  // 8. Statutory Currency & PII Exposure Check
  const statWarnings = detectStatutoryWarnings(text, params.rawCategory || '');
  if (statWarnings.length === 0) {
    checks.push({
      id: 'statutory_currency',
      category: 'Statutory Currency',
      title: 'No Legacy Statute Citations Flagged',
      severity: 'pass',
      detail: 'Automated scan did not detect pre-2013 Companies Act, 1940 Arbitration Act, or IPC/CrPC references.',
    });
  } else {
    statWarnings.forEach((w, i) => {
      checks.push({
        id: `statutory_warn_${i}`,
        category: 'Statutory Currency',
        title: 'Legacy Statutory Reference Requires Verification',
        severity: 'warning',
        detail: w,
      });
    });
  }

  // Check for accidental full 12-digit Aadhaar number exposure
  if (/\b[2-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/.test(text) && /aadhaar|uid/i.test(lower)) {
    checks.push({
      id: 'aadhaar_privacy',
      category: 'Format Integrity',
      title: 'Possible Full 12-Digit Aadhaar Number Detected',
      severity: 'warning',
      detail:
        'Under UIDAI guidelines, prefer masked Aadhaar (XXXX-XXXX-1234) in private agreements unless statutorily required.',
    });
  }

  // Preserve unused underscoreBlanks check lint clean
  void underscoreBlanks;

  const passedCount = checks.filter((c) => c.severity === 'pass').length;
  const warningCount = checks.filter((c) => c.severity === 'warning').length;
  const errorCount = checks.filter((c) => c.severity === 'error').length;

  const overallStatus: DocumentValidationReport['overallStatus'] =
    errorCount > 0
      ? 'incomplete'
      : warningCount > 0
      ? 'needs_attention'
      : 'ready_for_advocate_review';

  const sha256Digest = crypto.createHash('sha256').update(text, 'utf8').digest('hex');

  return {
    overallStatus,
    passedCount,
    warningCount,
    errorCount,
    unfilledBlankCount: totalUnfilled,
    wordCount: words.length,
    sha256Digest,
    checks,
    validatedAt: new Date().toISOString(),
  };
}

export async function extractTextFromSafeUpload(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; format: 'pdf' | 'txt' }> {
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    throw new Error('Uploaded file must be between 1 byte and 2 MB.');
  }

  const ext = filename.toLowerCase().split('.').pop() || '';
  const isPdfMagic = buffer.slice(0, 5).toString('utf8') === '%PDF-';

  if (ext === 'pdf' || isPdfMagic) {
    if (!isPdfMagic) {
      throw new Error('Invalid PDF file signature.');
    }
    const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
    const doc = await task.promise;
    let out = '';
    for (let p = 1; p <= Math.min(doc.numPages, 25); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      out += tc.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n\n';
    }
    if (out.trim().length < 20) {
      throw new Error('Uploaded PDF appears to be scanned/image-only with no selectable text.');
    }
    return { text: out.trim(), format: 'pdf' };
  }

  if (ext === 'txt' || ext === 'md') {
    // Reject binary control bytes (allow tab, LF, CR)
    const sample = buffer.slice(0, 4096);
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b === 0 || (b < 32 && b !== 9 && b !== 10 && b !== 13)) {
        throw new Error('Rejected non-text binary file.');
      }
    }
    return { text: buffer.toString('utf8').trim(), format: 'txt' };
  }

  throw new Error('Only .txt and selectable-text .pdf files are supported for standalone validation.');
}
