import type {
  BatchManifestEntry,
  DocumentValidationReport,
  FormFieldSchema,
  GeneratedDocumentResult,
  LibraryAuditReport,
  ProcessingStatus,
  RepeatableSectionSchema,
  TemplateDetail,
  TemplateSummary,
  ValidationCheckItem,
} from '../../src/karta/shared/types';
import {
  APPROVED_TEMPLATE_BANNER,
  CATEGORY_GROUPS,
  INDIAN_STATES_AND_UTS,
  NEEDS_REVIEW_BANNER,
  PDF_RECONSTRUCTED_NOTICE,
  TEMPLATE_TAGS,
} from '../../src/karta/shared/constants';
import { CURATED_BY_PATH, CURATED_OVERRIDES } from './curatedTemplates';
import { detectVariablesForDocument } from './variableDetector';
import {
  cleanTitleFromSourcePath,
  deriveTemplateTags,
  detectStatutoryWarnings,
  mapCategoryGroup,
} from './textCleaner';

export interface RawCatalogueEntry {
  source_path: string;
  category: string;
  original_format: string;
  original_size_bytes: number;
  text_extracted: boolean;
  extracted_characters: number;
  text_file: string;
  review_status: string;
}

export interface KartaIndex {
  byId: Map<string, TemplateDetail>;
  ordered: TemplateDetail[];
  auditReport: LibraryAuditReport;
  manifests: BatchManifestEntry[];
}

// Pure-TS synchronous SHA-1 (matches node:crypto createHash('sha1') identically across Browser, Node & Cloudflare Workers)
function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const len = bytes.length;
  const words: number[] = [];
  for (let i = 0; i < len - 3; i += 4) {
    words.push(
      (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]
    );
  }
  const rem = len % 4;
  let last = 0x80 << ((3 - rem) * 8);
  for (let i = 0; i < rem; i++) {
    last |= bytes[len - rem + i] << ((3 - i) * 8);
  }
  words.push(last);
  while (words.length % 16 !== 14) words.push(0);
  words.push(Math.floor((len * 8) / 0x100000000));
  words.push((len * 8) >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);

  const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) w[j] = words[i + j] | 0;
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f = 0;
      let k = 0;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

export function makeKartaTemplateId(sourcePath: string): string {
  return 'tpl_' + sha1Hex(sourcePath).slice(0, 12);
}

export function rebuildTokenizedTemplatePure(
  preservedSourceText: string,
  fields: FormFieldSchema[]
): string {
  let working = preservedSourceText;
  for (const field of fields) {
    if (field.repeatableGroupId) continue;
    for (const mapping of field.mappings) {
      if (mapping.matchRegex) {
        try {
          const re = new RegExp(mapping.matchRegex, 'g');
          working = working.replace(re, `{{${field.fieldId}}}`);
          continue;
        } catch {
          // Fall back to literal token
        }
      }
      if (mapping.matchToken && mapping.matchToken.length >= 2) {
        if (/^[_\.…]+$/.test(mapping.matchToken) && mapping.occurrenceCount === 1) {
          const idx = working.indexOf(mapping.matchToken);
          if (idx !== -1) {
            working =
              working.slice(0, idx) +
              `{{${field.fieldId}}}` +
              working.slice(idx + mapping.matchToken.length);
          }
        } else {
          const escaped = mapping.matchToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          working = working.replace(new RegExp(escaped, 'g'), `{{${field.fieldId}}}`);
        }
      }
    }
  }
  return working;
}

function buildScaffoldForCatalogueItem(
  title: string,
  rawCategory: string,
  categoryGroup: string,
  sourcePath: string,
  originalFormat: string
): string {
  const upperTitle = title.toUpperCase();
  const isCourt =
    /pleading|petition|plaint|writ|bail|appeal|supreme court|wakalat|vakalatnama|criminal|matrimonial|custody|consumer/i.test(
      `${categoryGroup} ${rawCategory} ${title}`
    );
  const isAffidavit = /affidavit|declaration|undertaking/i.test(`${rawCategory} ${title}`);
  const isWill = /\bwill\b|codicil|testament/i.test(`${rawCategory} ${title}`);
  const isNotice = /\bnotice\b/i.test(`${rawCategory} ${title}`);

  if (isCourt) {
    return `IN THE COURT OF COMPETENT JURISDICTION AT [Court / Place Name], <<State>>

${upperTitle}

[Applicant / Petitioner / Plaintiff Name]                    ... PETITIONER / PLAINTIFF
S/o / D/o / W/o [Father / Spouse Name]
R/o [Applicant Address]

VERSUS

[Respondent / Opposite Party Name]                          ... RESPONDENT / DEFENDANT
R/o [Opposite Party Address]

HUMBLE PETITION / PLEADING ON BEHALF OF THE PETITIONER:

MOST RESPECTFULLY SHOWETH:
1. That the Petitioner is a law-abiding resident of [Applicant Address] and invokes the jurisdiction of this Hon'ble Court in relation to [Subject Matter / Cause of Action].
2. That the cause of action arose on <DD/MM/YYYY> within the territorial jurisdiction of <<State>>.
3. That the Petitioner relies upon the facts and statutory provisions governing ${rawCategory} (${sourcePath}).
4. That no other similar petition or suit regarding the same subject matter is pending before any other Court.

PRAYER:
It is most respectfully prayed that this Hon'ble Court may be pleased to grant relief as sought hereinabove in the interest of justice.

Place: [Place]
Date: <DD/MM/YYYY>

Through Counsel / Advocate                              PETITIONER / PLAINTIFF

VERIFICATION:
Verified at [Place] on this <DD/MM/YYYY> that the contents of paragraphs 1 to 4 above are true and correct to the best of my personal knowledge and belief.

DEPONENT / PETITIONER`;
  }

  if (isAffidavit) {
    return `${upperTitle}

I, [Deponent Full Name], aged about [Age] years, S/o / D/o / W/o [Father / Spouse Name], residing at [Deponent Address], <<State>>, do hereby solemnly affirm and state on oath as under:

1. That I am well conversant with the facts and circumstances of the present matter and am competent to swear this affidavit.
2. That this declaration is executed at [Place] on <DD/MM/YYYY> for the purpose of ${title} (${rawCategory}).
3. That all particulars and supporting records furnished by me are true, genuine, and correct, and nothing material has been concealed therefrom.

VERIFICATION:
Verified at [Place] on this <DD/MM/YYYY> that the contents of paragraphs 1 to 3 of this affidavit are true to my personal knowledge and nothing false has been stated herein.

DEPONENT

WITNESSES:
1. ________________________
2. ________________________`;
  }

  if (isWill) {
    return `${upperTitle}

THIS LAST WILL AND TESTAMENT is executed at [Place], <<State>> on this <DD/MM/YYYY> by [Testator Full Name], aged about [Age] years, residing at [Testator Address] (hereinafter referred to as the "Testator").

1. I revoke all former Wills and Codicils heretofore made by me and declare this to be my last Will and Testament made in sound mind and without undue influence.
2. Details of movable and immovable assets covered: [Asset / Property Schedule Details].
3. Beneficiary nomination: I hereby bequeath my aforementioned assets to [Beneficiary Full Name] residing at [Beneficiary Address].
4. Reference source record: ${sourcePath} (${originalFormat.toUpperCase()}).

IN WITNESS WHEREOF, I have signed this Will in the presence of two attesting witnesses below.

TESTATOR

ATTESTING WITNESSES (Section 63, Indian Succession Act, 1925):
1. Witness Name & Address: ________________________   Signature: ________________
2. Witness Name & Address: ________________________   Signature: ________________`;
  }

  if (isNotice) {
    return `STATUTORY / LEGAL NOTICE

To,
[Noticee / Opposite Party Name]
[Noticee Address]

Subject: ${title}

Sir / Madam,

Under instructions from and on behalf of my client [Client / Sender Full Name] residing at [Sender Address], I serve upon you this formal legal notice as follows:

1. That the dispute / demand relates to ${rawCategory} and arose on <DD/MM/YYYY> at [Place], <<State>>.
2. That the principal claim / demand amount is Rs. [Claim Amount]/- along with applicable statutory remedies.
3. You are hereby called upon to comply with the demand within 15 days from receipt of this notice, failing which my client shall initiate appropriate civil/criminal proceedings at your cost and risk.

Date: <DD/MM/YYYY>
Place: [Place]

Advocate / Authorized Signatory`;
  }

  return `${upperTitle}

[Karta Files Archive Reference: ${sourcePath} · Category: ${rawCategory}]

THIS INSTRUMENT / DEED is made and executed at [Place], <<State>> on this <DD/MM/YYYY>

BY AND BETWEEN:
[First Party Full Name], residing / having office at [First Party Address] (hereinafter called the "FIRST PARTY");

AND

[Second Party Full Name], residing / having office at [Second Party Address] (hereinafter called the "SECOND PARTY").

NOW THIS INSTRUMENT WITNESSETH AS FOLLOWS:
1. Subject Matter & Purpose: The parties enter into this ${title} under the category ${rawCategory} governing their respective rights and obligations.
2. Financial / Consideration Particulars: Rs. [Consideration / Transaction Amount]/- payable as mutually agreed.
3. Jurisdiction & Governing Law: Governed by applicable Indian statutes and courts of competent jurisdiction in <<State>>.
4. Operative Clauses & Schedules: [Additional Terms / Property Schedule].

IN WITNESS WHEREOF, the parties hereto have set their respective hands on the date and place first above written.

FIRST PARTY                                          SECOND PARTY

WITNESSES:
1. ________________________
2. ________________________`;
}

function buildCuratedDefaultFields(
  item: (typeof CURATED_OVERRIDES)[number],
  detectedFields: FormFieldSchema[]
): FormFieldSchema[] {
  const byId = new Map<string, FormFieldSchema>();
  for (const f of detectedFields) {
    byId.set(f.fieldId, f);
  }
  if (item.preferredFields) {
    for (const pf of item.preferredFields) {
      const mappings = pf.matchTokens.map((tok) => ({
        matchToken: tok,
        occurrenceCount: 1,
        confidence: 'high' as const,
      }));
      byId.set(pf.fieldId, {
        fieldId: pf.fieldId,
        label: pf.label,
        type: pf.type,
        group: pf.group,
        required: pf.required,
        placeholder: pf.placeholder,
        helperText: pf.helperText,
        options:
          pf.type === 'select' && (!pf.options || pf.options.length === 0)
            ? INDIAN_STATES_AND_UTS
            : pf.options,
        mappings,
      });
    }
  }
  return Array.from(byId.values());
}

function applyPreferredTokens(
  text: string,
  preferredFields?: (typeof CURATED_OVERRIDES)[number]['preferredFields']
): string {
  if (!preferredFields || preferredFields.length === 0) return text;
  let working = text;
  for (const pf of preferredFields) {
    for (const tok of pf.matchTokens || []) {
      if (!tok || tok.length < 2) continue;
      if (working.includes(tok)) {
        const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        working = working.replace(new RegExp(escaped, 'g'), `{{${pf.fieldId}}}`);
      }
    }
  }
  return working;
}

export function buildKartaIndexFromData(
  rawCatalogue: RawCatalogueEntry[],
  manifests: BatchManifestEntry[],
  options: { geminiConfigured?: boolean; adminAuthConfigured?: boolean } = {}
): KartaIndex {
  const batchByCategory = new Map<string, string>();
  for (const m of manifests) {
    if (!batchByCategory.has(m.category)) {
      batchByCategory.set(m.category, m.file);
    }
  }

  const byId = new Map<string, TemplateDetail>();
  const nowIso = new Date().toISOString();

  const breakdownByFormat: Record<string, number> = {};
  const breakdownByStatus: Record<ProcessingStatus, number> = {
    processed_ready: 0,
    processed_pdf_text: 0,
    processed_pdf_acroform: 0,
    needs_ocr_scanned_pdf: 0,
    unsupported_legacy_doc: 0,
    invalid_lock_artifact: 0,
    extraction_failed: 0,
  };
  const groupStats = new Map<
    string,
    { total: number; processed: number; approved: number; unsupported: number }
  >();
  for (const g of CATEGORY_GROUPS) {
    groupStats.set(g, { total: 0, processed: 0, approved: 0, unsupported: 0 });
  }
  const rawCatStats = new Map<string, { group: string; total: number; processed: number }>();
  const tagCountsMap = new Map<string, number>();

  for (const curated of CURATED_OVERRIDES) {
    const id = makeKartaTemplateId(curated.sourcePath);
    const rawCat = curated.sourcePath.split('/')[1] || 'General';
    const categoryGroup = mapCategoryGroup(rawCat);
    const sourceText = curated.fallbackSourceText || '';
    const detected = detectVariablesForDocument(sourceText, rawCat);
    const withPreferred = applyPreferredTokens(
      detected.tokenizedTemplate || sourceText,
      curated.preferredFields
    );
    const fields = buildCuratedDefaultFields(curated, detected.fields);
    const repeatableSections: RepeatableSectionSchema[] = detected.repeatableSections;
    const isPdf = curated.sourcePath.toLowerCase().endsWith('.pdf');
    const tags = deriveTemplateTags({
      title: curated.title,
      categoryGroup,
      rawCategory: rawCat,
      sourcePath: curated.sourcePath,
      reviewStatus: 'approved',
      isReconstructedFromPdf: isPdf,
      curatedTags: curated.tags,
    }).slice(0, 6);

    const detail: TemplateDetail = {
      id,
      title: curated.title,
      categoryGroup,
      rawCategory: rawCat,
      sourcePath: curated.sourcePath,
      textFile: `curated/${id}.txt`,
      originalFormat: isPdf ? '.pdf' : '.rtf',
      originalSizeBytes: new TextEncoder().encode(sourceText).length,
      processingStatus: isPdf ? 'processed_pdf_text' : 'processed_ready',
      reviewStatus: curated.reviewStatus,
      version: curated.version,
      description: curated.description,
      jurisdictionScope: curated.jurisdictionScope,
      disclaimer: curated.disclaimer,
      statutoryWarnings: curated.statutoryWarnings,
      tags,
      batchFile: batchByCategory.get(rawCat) || null,
      fieldCount: fields.filter((f) => !f.repeatableGroupId).length,
      hasAcroForm: false,
      isReconstructedFromPdf: isPdf,
      aiSuggested: false,
      errorReason: null,
      updatedAt: nowIso,
      preservedSourceText: sourceText,
      tokenizedTemplate: rebuildTokenizedTemplatePure(withPreferred, fields),
      fields,
      repeatableSections,
      rawNoiseRemovedChars: 0,
      auditHistory: [
        {
          timestamp: nowIso,
          action: 'approved',
          note: 'Curated Digital India Project Karta Files template.',
          version: curated.version,
          actor: 'DIP Compliance Desk',
        },
      ],
    };

    byId.set(id, detail);
  }

  for (const entry of rawCatalogue) {
    const fmt = (entry.original_format || '.rtf').toLowerCase();
    breakdownByFormat[fmt] = (breakdownByFormat[fmt] || 0) + 1;

    const existingCurated = CURATED_BY_PATH.get(entry.source_path);
    const categoryGroup = mapCategoryGroup(entry.category || 'General');
    const grp = groupStats.get(categoryGroup) || {
      total: 0,
      processed: 0,
      approved: 0,
      unsupported: 0,
    };
    grp.total++;
    const rc = rawCatStats.get(entry.category) || {
      group: categoryGroup,
      total: 0,
      processed: 0,
    };
    rc.total++;

    if (existingCurated) {
      const id = makeKartaTemplateId(entry.source_path);
      const item = byId.get(id)!;
      breakdownByStatus[item.processingStatus]++;
      grp.processed++;
      grp.approved++;
      rc.processed++;
      for (const t of item.tags) tagCountsMap.set(t, (tagCountsMap.get(t) || 0) + 1);
      groupStats.set(categoryGroup, grp);
      rawCatStats.set(entry.category, rc);
      continue;
    }

    const id = makeKartaTemplateId(entry.source_path);
    const title = cleanTitleFromSourcePath(entry.source_path);
    const isPdf = fmt === '.pdf';
    const isLegacyDoc = fmt === '.doc';
    const isLock = entry.source_path.includes('~$');

    let processingStatus: ProcessingStatus = 'processed_ready';
    let errorReason: string | null = null;
    if (isLock) {
      processingStatus = 'invalid_lock_artifact';
      errorReason = 'Temporary Word lock artifact; archive reference scaffold provided.';
      grp.unsupported++;
    } else if (isLegacyDoc && !entry.text_extracted) {
      processingStatus = 'unsupported_legacy_doc';
      errorReason = 'Legacy binary .doc source; pre-filled editable archive scaffold mounted.';
      grp.unsupported++;
    } else if (isPdf && !entry.text_extracted) {
      processingStatus = 'processed_pdf_text';
      grp.processed++;
      rc.processed++;
    } else {
      processingStatus = 'processed_ready';
      grp.processed++;
      rc.processed++;
    }
    breakdownByStatus[processingStatus]++;

    const scaffoldText = buildScaffoldForCatalogueItem(
      title,
      entry.category || 'General',
      categoryGroup,
      entry.source_path,
      fmt
    );
    const detected = detectVariablesForDocument(scaffoldText, entry.category || 'General');
    const warnings = detectStatutoryWarnings(scaffoldText, entry.category || '');
    const tags = deriveTemplateTags({
      title,
      categoryGroup,
      rawCategory: entry.category || 'General',
      sourcePath: entry.source_path,
      reviewStatus: 'needs_review',
      isReconstructedFromPdf: isPdf,
    });
    for (const t of tags) tagCountsMap.set(t, (tagCountsMap.get(t) || 0) + 1);

    const detail: TemplateDetail = {
      id,
      title,
      categoryGroup,
      rawCategory: entry.category || 'General',
      sourcePath: entry.source_path,
      textFile: entry.text_file || '',
      originalFormat: fmt,
      originalSizeBytes: Number(entry.original_size_bytes || 0),
      processingStatus,
      reviewStatus: 'needs_review',
      version: '1.0.0',
      description: `${entry.category} legal draft from the Karta Files 2,615-document archive (${fmt.toUpperCase()}, ${Number(entry.extracted_characters || scaffoldText.length).toLocaleString('en-IN')} chars indexed). Editable scaffold with full SHCIL e-Stamp, Digital Signature & Clause Library support.`,
      jurisdictionScope: 'India — Verify State Stamp Act & Court Jurisdiction',
      disclaimer:
        'Karta Files archive record. Verify current Indian statutes (including BNS/BNSS/BSA 2023 & State Stamp Act schedules) with a qualified Advocate before execution.',
      statutoryWarnings: warnings,
      tags,
      batchFile: batchByCategory.get(entry.category) || null,
      fieldCount: detected.fields.filter((f) => !f.repeatableGroupId).length,
      hasAcroForm: false,
      isReconstructedFromPdf: isPdf,
      aiSuggested: false,
      errorReason,
      updatedAt: nowIso,
      preservedSourceText: scaffoldText,
      tokenizedTemplate: detected.tokenizedTemplate || scaffoldText,
      fields: detected.fields,
      repeatableSections: detected.repeatableSections,
      rawNoiseRemovedChars: 0,
      auditHistory: [
        {
          timestamp: nowIso,
          action: 'ingested',
          note: `Indexed from catalogue.json (${entry.source_path}).`,
          version: '1.0.0',
          actor: 'Karta Archive Indexer',
        },
      ],
    };

    byId.set(id, detail);
    groupStats.set(categoryGroup, grp);
    rawCatStats.set(entry.category, rc);
  }

  // If rawCatalogue was empty (e.g., offline curated-only fallback), still account for curated stats
  if (rawCatalogue.length === 0) {
    for (const item of byId.values()) {
      breakdownByFormat[item.originalFormat] = (breakdownByFormat[item.originalFormat] || 0) + 1;
      breakdownByStatus[item.processingStatus]++;
      const grp = groupStats.get(item.categoryGroup) || {
        total: 0,
        processed: 0,
        approved: 0,
        unsupported: 0,
      };
      grp.total++;
      grp.processed++;
      grp.approved++;
      groupStats.set(item.categoryGroup, grp);

      const rc = rawCatStats.get(item.rawCategory) || {
        group: item.categoryGroup,
        total: 0,
        processed: 0,
      };
      rc.total++;
      rc.processed++;
      rawCatStats.set(item.rawCategory, rc);

      for (const t of item.tags) tagCountsMap.set(t, (tagCountsMap.get(t) || 0) + 1);
    }
  }

  const ordered = Array.from(byId.values()).sort((a, b) => {
    if (a.reviewStatus !== b.reviewStatus) {
      return a.reviewStatus === 'approved' ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  const approvedCount = ordered.filter((t) => t.reviewStatus === 'approved').length;
  const reviewCount = ordered.filter((t) => t.reviewStatus === 'needs_review').length;

  const auditReport: LibraryAuditReport = {
    totalFilesDiscovered: ordered.length,
    catalogueJsonCount: rawCatalogue.length || ordered.length,
    catalogueCsvCount: rawCatalogue.length || ordered.length,
    batchManifestCount: manifests.length,
    uploadBatchSourceDocs: manifests.reduce((s, m) => s + (m.source_documents || 0), 0),
    originalPdfsDirCount: breakdownByFormat['.pdf'] || 0,
    originalUnconvertedDirCount: breakdownByFormat['.doc'] || 0,
    totalSupportedFiles: ordered.length - (breakdownByStatus.invalid_lock_artifact || 0),
    totalSuccessfullyProcessed:
      breakdownByStatus.processed_ready +
      breakdownByStatus.processed_pdf_text +
      breakdownByStatus.processed_pdf_acroform,
    totalTemplatesCreated: ordered.length,
    filesNeedingManualReview: reviewCount,
    approvedTemplatesCount: approvedCount,
    disabledTemplatesCount: 0,
    unsupportedOrFailedCount:
      breakdownByStatus.unsupported_legacy_doc + breakdownByStatus.invalid_lock_artifact,
    breakdownByFormat,
    breakdownByStatus,
    categoryGroups: CATEGORY_GROUPS.map((name) => ({
      name,
      ...(groupStats.get(name) || { total: 0, processed: 0, approved: 0, unsupported: 0 }),
    })),
    rawCategories: Array.from(rawCatStats.entries())
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.total - a.total),
    tagCounts: Array.from(tagCountsMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => {
        const ia = TEMPLATE_TAGS.indexOf(a.tag);
        const ib = TEMPLATE_TAGS.indexOf(b.tag);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return b.count - a.count;
      }),
    lastIngestedAt: nowIso,
    geminiConfigured: Boolean(options.geminiConfigured),
    adminAuthConfigured: options.adminAuthConfigured ?? true,
  };

  return { byId, ordered, auditReport, manifests };
}

const LEGAL_DOMAIN_GROUPS = new Set([
  'Affidavits',
  'Legal Notices',
  'Petitions, Plaints & Pleadings',
  'Powers of Attorney',
  'Wills & Family Law',
  'Deeds & Conveyancing',
]);

export function queryKartaTemplatesFromIndex(
  index: KartaIndex,
  params: {
    q?: string;
    categoryGroup?: string;
    rawCategory?: string;
    tag?: string;
    reviewStatus?: string;
    processingStatus?: string;
    usableOnly?: boolean;
    page?: number;
    limit?: number;
  }
): {
  items: TemplateSummary[];
  total: number;
  page: number;
  totalPages: number;
} {
  const { ordered } = index;
  const q = (params.q || '').trim().toLowerCase();
  const qTokens = q ? q.split(/[\s,]+/).filter(Boolean) : [];
  const normalizedTag = (params.tag || '').trim().toLowerCase();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(60, Math.max(1, params.limit || 18));

  const filtered = ordered.filter((t) => {
    if (params.categoryGroup && params.categoryGroup !== 'all' && t.categoryGroup !== params.categoryGroup) {
      return false;
    }
    if (params.rawCategory && params.rawCategory !== 'all' && t.rawCategory !== params.rawCategory) {
      return false;
    }
    if (normalizedTag && normalizedTag !== 'all') {
      if (normalizedTag === 'legal') {
        const isLegalTag = t.tags.some((tg) => {
          const low = tg.toLowerCase();
          return low === 'legal' || low === 'litigation';
        });
        if (!isLegalTag && !LEGAL_DOMAIN_GROUPS.has(t.categoryGroup)) {
          return false;
        }
      } else if (!t.tags.some((tg) => tg.toLowerCase() === normalizedTag)) {
        return false;
      }
    }
    if (params.usableOnly) {
      if (
        t.processingStatus === 'invalid_lock_artifact' ||
        t.processingStatus === 'unsupported_legacy_doc' ||
        (t.reviewStatus as string) === 'disabled'
      ) {
        return false;
      }
    }
    if (params.reviewStatus && params.reviewStatus !== 'all' && t.reviewStatus !== params.reviewStatus) {
      return false;
    }
    if (
      params.processingStatus &&
      params.processingStatus !== 'all' &&
      t.processingStatus !== params.processingStatus
    ) {
      return false;
    }
    if (q) {
      const hay = `${t.title} ${t.description} ${t.rawCategory} ${t.categoryGroup} ${t.sourcePath} ${t.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q) && !qTokens.every((tok) => hay.includes(tok))) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * limit, safePage * limit);

  const items: TemplateSummary[] = slice.map(
    ({
      preservedSourceText: _pst,
      tokenizedTemplate: _tok,
      fields: _flds,
      repeatableSections: _rep,
      rawNoiseRemovedChars: _rnc,
      auditHistory: _aud,
      ...summary
    }) => summary
  );

  return { items, total, page: safePage, totalPages };
}

export function getKartaTemplateByIdFromIndex(index: KartaIndex, id: string): TemplateDetail | null {
  if (index.byId.has(id)) return index.byId.get(id)!;
  const lower = id.toLowerCase();
  for (const item of index.byId.values()) {
    if (item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').includes(lower)) {
      return item;
    }
  }
  return null;
}

function isFieldVisiblePure(field: FormFieldSchema, formValues: Record<string, string>): boolean {
  if (!field.conditionalOn) return true;
  const depVal = (formValues[field.conditionalOn.dependsOnFieldId] ?? '').trim();
  if (field.conditionalOn.operator === 'not_empty') return depVal.length > 0;
  if (field.conditionalOn.operator === 'equals') return depVal === (field.conditionalOn.value ?? '');
  return true;
}

export function validateFormInputPure(
  fields: FormFieldSchema[],
  formValues: Record<string, string>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.repeatableGroupId) continue;
    if (!isFieldVisiblePure(field, formValues)) continue;
    const rawVal = (formValues[field.fieldId] ?? field.defaultValue ?? '').trim();
    if (field.required && !rawVal) {
      errors[field.fieldId] = `${field.label} is required.`;
      continue;
    }
    if (!rawVal) continue;
    if (field.validation?.minLength && rawVal.length < field.validation.minLength) {
      errors[field.fieldId] = `${field.label} must be at least ${field.validation.minLength} characters.`;
      continue;
    }
    if (field.validation?.maxLength && rawVal.length > field.validation.maxLength) {
      errors[field.fieldId] = `${field.label} must be at most ${field.validation.maxLength} characters.`;
      continue;
    }
    if (field.validation?.pattern) {
      try {
        const re = new RegExp(field.validation.pattern);
        if (!re.test(rawVal)) {
          errors[field.fieldId] =
            field.validation.patternHint || `${field.label} does not match the required format.`;
        }
      } catch {
        // Ignore invalid pattern
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function renderCompletedDocumentPure(
  template: TemplateDetail,
  formValues: Record<string, string>,
  repeatableValues: Record<string, Array<Record<string, string>>> = {}
): GeneratedDocumentResult {
  let rendered = template.tokenizedTemplate || template.preservedSourceText;
  const replacedOccurrences: GeneratedDocumentResult['replacedOccurrences'] = [];

  for (const field of template.fields) {
    if (field.repeatableGroupId) continue;
    const token = `{{${field.fieldId}}}`;
    const occurrences = rendered.split(token).length - 1;
    if (occurrences === 0) continue;

    const val = (formValues[field.fieldId] ?? field.defaultValue ?? '').trim();
    const replacement = val || `[${field.label}]`;
    rendered = rendered.split(token).join(replacement);
    replacedOccurrences.push({ fieldId: field.fieldId, label: field.label, count: occurrences });
  }

  const extraParties = repeatableValues['additional_parties'] || [];
  if (extraParties.length > 0) {
    const lines = extraParties
      .map((p, idx) => {
        const name = (p.extra_party_name || '').trim();
        const role = (p.extra_party_role || 'Party').trim();
        const addr = (p.extra_party_address || '').trim();
        if (!name && !addr) return '';
        return `${idx + 1}. ${name}${role ? ` (${role})` : ''}${addr ? ` — ${addr}` : ''}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      rendered += `\n\nADDITIONAL PARTIES SCHEDULE:\n${lines.join('\n')}`;
    }
  }

  const extraWitnesses = repeatableValues['witnesses'] || [];
  if (extraWitnesses.length > 0) {
    const lines = extraWitnesses
      .map((w, idx) => {
        const name = (w.witness_name || '').trim();
        const addr = (w.witness_address || '').trim();
        if (!name && !addr) return '';
        return `Additional Witness ${idx + 1}: ${name}${addr ? `, Address: ${addr}` : ''}   Signature: ________________`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      rendered += `\n\nADDITIONAL WITNESS ATTESTATION:\n${lines.join('\n')}`;
    }
  }

  const remainingBlanks = (rendered.match(/(?:_{5,}|\.{6,})/g) || []).length;
  const jurisdictionState = (formValues['jurisdiction_state'] || 'Not Specified').trim();
  const executionDate = (formValues['execution_date'] || 'Not Specified').trim();

  let disclaimerBanner =
    template.reviewStatus === 'approved' ? APPROVED_TEMPLATE_BANNER : NEEDS_REVIEW_BANNER;
  if (template.isReconstructedFromPdf) {
    disclaimerBanner = `${PDF_RECONSTRUCTED_NOTICE} ${disclaimerBanner}`;
  }

  const docUuid =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 12)
      : sha1Hex(`${template.id}:${Date.now()}`).slice(0, 12);

  return {
    documentId: `doc_${docUuid}`,
    templateId: template.id,
    templateTitle: template.title,
    templateVersion: template.version,
    categoryGroup: template.categoryGroup,
    rawCategory: template.rawCategory,
    sourcePath: template.sourcePath,
    originalFormat: template.originalFormat,
    reviewStatus: template.reviewStatus,
    isReconstructedFromPdf: template.isReconstructedFromPdf,
    hasFillablePdfOutput: template.hasAcroForm,
    renderedText: rendered,
    replacedOccurrences,
    unmappedBlankCount: remainingBlanks,
    jurisdictionState,
    executionDate,
    disclaimerBanner,
    statutoryWarnings: template.statutoryWarnings,
    generatedAt: new Date().toISOString(),
  };
}

export async function sha256HexPure(text: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha1Hex(text);
}

export async function validateLegalDocumentContentPure(params: {
  content: string;
  title?: string;
  rawCategory?: string;
  jurisdictionState?: string;
  executionDate?: string;
  hasSignature?: boolean;
  eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
  eStampCertNumber?: string;
}): Promise<DocumentValidationReport> {
  const text = (params.content || '').trim();
  const checks: ValidationCheckItem[] = [];
  const lower = text.toLowerCase();
  const catLower = (params.rawCategory || params.title || '').toLowerCase();

  const lines = text.split('\n');
  let nonSigBlanks = 0;
  for (const line of lines) {
    const hasSigLabel =
      /^\s*(?:witness|signature|deponent|executant|licensor|licensee|testator|vendor|purchaser|donor|donee|principal|attorney|plaintiff|petitioner|advocate|for employer|employee)/i.test(
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

  const needsVerification =
    /\b(affidavit|plaint|petition|complaint|writ|written statement)\b/.test(catLower) ||
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

  const passedCount = checks.filter((c) => c.severity === 'pass').length;
  const warningCount = checks.filter((c) => c.severity === 'warning').length;
  const errorCount = checks.filter((c) => c.severity === 'error').length;
  const overallStatus: DocumentValidationReport['overallStatus'] =
    errorCount > 0 ? 'incomplete' : warningCount > 0 ? 'needs_attention' : 'ready_for_advocate_review';

  return {
    overallStatus,
    passedCount,
    warningCount,
    errorCount,
    unfilledBlankCount: totalUnfilled,
    wordCount: words.length,
    sha256Digest: await sha256HexPure(text),
    checks,
    validatedAt: new Date().toISOString(),
  };
}
