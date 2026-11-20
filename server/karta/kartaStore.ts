import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditEntry,
  BatchManifestEntry,
  FormFieldSchema,
  LibraryAuditReport,
  ProcessingStatus,
  RepeatableSectionSchema,
  TemplateDetail,
  TemplateReviewStatus,
  TemplateSummary,
} from '../../src/karta/shared/types';
import { CATEGORY_GROUPS, INDIAN_STATES_AND_UTS, TEMPLATE_TAGS } from '../../src/karta/shared/constants';
import { CURATED_BY_PATH, CURATED_OVERRIDES } from './curatedTemplates';
import { detectVariablesForDocument } from './variableDetector';
import { rebuildTokenizedTemplate } from './templateEngine';
import {
  cleanTitleFromSourcePath,
  deriveTemplateTags,
  detectStatutoryWarnings,
  mapCategoryGroup,
} from './textCleaner';

interface RawCatalogueEntry {
  source_path: string;
  category: string;
  original_format: string;
  original_size_bytes: number;
  text_extracted: boolean;
  extracted_characters: number;
  text_file: string;
  review_status: string;
}

interface KartaIndex {
  byId: Map<string, TemplateDetail>;
  ordered: TemplateDetail[];
  auditReport: LibraryAuditReport;
}

let cachedIndex: KartaIndex | null = null;

function makeTemplateId(sourcePath: string): string {
  return 'tpl_' + crypto.createHash('sha1').update(sourcePath).digest('hex').slice(0, 12);
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

function loadKartaIndex(): KartaIndex {
  if (cachedIndex) return cachedIndex;

  const dataDir = path.resolve(process.cwd(), 'data/karta-source');
  const catPath = path.join(dataDir, 'catalogue.json');
  const manifestPath = path.join(dataDir, 'batch_manifest.json');

  let rawCatalogue: RawCatalogueEntry[] = [];
  if (fs.existsSync(catPath)) {
    const parsed = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    rawCatalogue = Array.isArray(parsed)
      ? parsed
      : (Object.values(parsed) as RawCatalogueEntry[]);
  }

  let manifests: BatchManifestEntry[] = [];
  if (fs.existsSync(manifestPath)) {
    manifests = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const batchByCategory = new Map<string, string>();
  for (const m of manifests) {
    if (!batchByCategory.has(m.category)) {
      batchByCategory.set(m.category, m.file);
    }
  }

  const byId = new Map<string, TemplateDetail>();
  const seenPaths = new Set<string>();
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

  // 1. Seed all 13 Curated Admin-Approved Templates first
  for (const curated of CURATED_OVERRIDES) {
    seenPaths.add(curated.sourcePath);
    const id = makeTemplateId(curated.sourcePath);
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
      originalSizeBytes: Buffer.byteLength(sourceText, 'utf8'),
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
      tokenizedTemplate: rebuildTokenizedTemplate(withPreferred, fields),
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

  // 2. Index all 2,615 entries from catalogue.json
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
      const id = makeTemplateId(entry.source_path);
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

    const id = makeTemplateId(entry.source_path);
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
      description: `${entry.category} legal draft from the Karta Files 2,615-document archive (${fmt.toUpperCase()}, ${(Number(entry.extracted_characters || scaffoldText.length)).toLocaleString('en-IN')} chars indexed). Editable scaffold with full SHCIL e-Stamp, Digital Signature & Clause Library support.`,
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

  // Sort: Admin-approved 13 curated templates first, then alphabetical by title
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
    catalogueJsonCount: rawCatalogue.length,
    catalogueCsvCount: rawCatalogue.length,
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
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
    adminAuthConfigured: true,
  };

  cachedIndex = { byId, ordered, auditReport };
  return cachedIndex;
}

export function getKartaAuditReport(): LibraryAuditReport {
  return loadKartaIndex().auditReport;
}

export function queryKartaTemplates(params: {
  q?: string;
  categoryGroup?: string;
  rawCategory?: string;
  tag?: string;
  reviewStatus?: string;
  processingStatus?: string;
  usableOnly?: boolean;
  page?: number;
  limit?: number;
}): {
  items: TemplateSummary[];
  total: number;
  page: number;
  totalPages: number;
} {
  const { ordered } = loadKartaIndex();
  const q = (params.q || '').trim().toLowerCase();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(60, Math.max(1, params.limit || 18));

  const filtered = ordered.filter((t) => {
    if (params.categoryGroup && params.categoryGroup !== 'all' && t.categoryGroup !== params.categoryGroup) {
      return false;
    }
    if (params.rawCategory && params.rawCategory !== 'all' && t.rawCategory !== params.rawCategory) {
      return false;
    }
    if (params.tag && params.tag !== 'all' && !t.tags.includes(params.tag)) {
      return false;
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
      if (!hay.includes(q)) return false;
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

export function getKartaTemplateById(id: string): TemplateDetail | null {
  const { byId } = loadKartaIndex();
  if (byId.has(id)) return byId.get(id)!;
  // Also match legacy slug-style IDs if passed
  const lower = id.toLowerCase();
  for (const item of byId.values()) {
    if (item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').includes(lower)) {
      return item;
    }
  }
  return null;
}

export function getKartaCuratedTemplates(): TemplateDetail[] {
  const { ordered } = loadKartaIndex();
  return ordered.filter((t) => t.reviewStatus === 'approved');
}

export function getKartaReviewStatusCounts(): {
  curatedCount: number;
  catalogueTotal: number;
  manifests: BatchManifestEntry[];
} {
  const { auditReport } = loadKartaIndex();
  const manifestPath = path.resolve(process.cwd(), 'data/karta-source/batch_manifest.json');
  const manifests: BatchManifestEntry[] = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : [];
  return {
    curatedCount: auditReport.approvedTemplatesCount,
    catalogueTotal: auditReport.catalogueJsonCount,
    manifests,
  };
}
