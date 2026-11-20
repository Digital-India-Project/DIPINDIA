export interface CleanedTextResult {
  cleaned: string;
  removedChars: number;
  hadRtfNoise: boolean;
  hadHexBlob: boolean;
}

export function cleanExtractedText(raw: string): CleanedTextResult {
  if (!raw) {
    return { cleaned: '', removedChars: 0, hadRtfNoise: false, hadHexBlob: false };
  }

  const originalLen = raw.length;
  let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const hadHexBlob = /504b0304[0-9a-fA-F\s]{30,}/i.test(s) || /[0-9a-fA-F]{120,}/.test(s);
  const hadRtfNoise =
    /Times New Roman;|Cambria Math;|schemas\.microsoft\.com\/office\/word\/2003\/wordml/i.test(
      s.slice(0, 6000)
    );

  // Remove embedded PKZip/Office binary hex blobs appended at the end of RTF extractions
  s = s.replace(/504b0304[0-9a-fA-F\s]{30,}[\s\S]*$/m, '');
  s = s.replace(/[0-9a-fA-F]{96,}/g, '');

  // Strip RTF font table + wordml header prefix
  const wordmlMarker = 'http://schemas.microsoft.com/office/word/2003/wordml';
  const wordmlIdx = s.indexOf(wordmlMarker);
  if (wordmlIdx !== -1 && wordmlIdx < 12000) {
    s = s.slice(wordmlIdx + wordmlMarker.length);
    s = s.replace(/^\s*[0-9a-fA-F]{2,6}\s+[A-Za-z]:[^\n]*?\.(?:dot|rtf|doc|docx)\b[^\n]*/i, '');
  } else {
    // Strip leading font-list lines even without wordml URL
    const fontHeaderMatch = s.match(
      /^(?:[\s\S]{0,8000}?(?:Times New Roman|Calibri|Cambria|Arial|Tahoma|Verdana|MS Gothic|MS Mincho|Symbol|Wingdings)[^;\n]{0,60};\s*)+/i
    );
    if (fontHeaderMatch) {
      s = s.slice(fontHeaderMatch[0].length);
    }
  }

  // Strip leading CJK punctuation / RTF symbol list artifacts and .dot path headers
  s = s.replace(/^[\s\S]{0,1200}?\b2450\b(?:\s+[A-Za-z]:[^\n]*?\.dot)?[\s\.\(\)\*\_\-]*/i, (m) =>
    m.length < 1300 ? '' : m
  );
  s = s.replace(/^[\s\(\)\.;,:\[\]\{\}\|\\\/~`'""'’“”<>«»\?\!·ˇˉ―‖∶、。〃々〉》」』】〕〗！＂＇），．：；？］｀｜｝～￠￡￥\-]{6,}/, '');

  // Strip trailing RTF style definitions
  s = s.replace(/\n\s*Default Paragraph Font[\s\S]*$/i, '');
  s = s.replace(/\n\s*Normal\s+Table\s+Normal[\s\S]*$/i, '');
  // Strip stray RTF bookmark codes like C4726
  s = s.replace(/\bC\d{4}\b\s*/g, '');

  // Normalize excessive blank lines while preserving legal paragraph structure
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleaned: s,
    removedChars: Math.max(0, originalLen - s.length),
    hadRtfNoise,
    hadHexBlob,
  };
}

export function mapCategoryGroup(rawCategory: string): string {
  const c = rawCategory.trim().toLowerCase();
  if (c === 'affidavit') return 'Affidavits';
  if (
    [
      'agreement',
      'memorandum of understanding',
      'franchisee',
      'hire-purchase',
      'appranticeship',
      'information technology',
      'infrastructure, development and financing',
    ].includes(c)
  ) {
    return 'Agreements & MoUs';
  }
  if (
    [
      'conveyancing',
      'sale',
      'gift',
      'release',
      'partition',
      'exchange',
      'composition deed',
      'easements',
      'miscellaneous deeds',
      'trust, wakf society',
    ].includes(c)
  ) {
    return 'Deeds & Conveyancing';
  }
  if (['rent', 'lease financing'].includes(c)) {
    return 'Rent & Lease';
  }
  if (c === 'power of attorney') {
    return 'Powers of Attorney';
  }
  if (c === 'notice') {
    return 'Legal Notices';
  }
  if (
    [
      'petition',
      'pleadings',
      'civil pleadings',
      'criminal pleading',
      'plaint and written statement',
      'writ',
      'special leave petition',
      'supreme court forms',
      'vakalatnama',
      'specific relief act',
      'arbitration',
    ].includes(c)
  ) {
    return 'Petitions, Plaints & Pleadings';
  }
  if (
    [
      'will',
      'adoption',
      'matrimonial',
      'hindu marriage act, divorce, maintenance, restitution of conjugal rights',
      'child custody',
    ].includes(c)
  ) {
    return 'Wills & Family Law';
  }
  if (
    [
      'gst',
      'income tax',
      'income tax & gst drafts',
      'banking',
      'bond',
      'guarantee',
      'indemnity',
      'mortgage, pledge , hypothecation and security document',
      'negotiable instrument',
      'acknowledgement',
      'assignment',
    ].includes(c)
  ) {
    return 'GST, Income Tax & Finance';
  }
  return 'Corporate, IPR & Regulatory';
}

export function detectStatutoryWarnings(cleanedText: string, rawCategory: string): string[] {
  const warnings: string[] = [];
  const lower = cleanedText.toLowerCase();

  if (/companies act,?\s*1956/i.test(cleanedText)) {
    warnings.push(
      'Source text references the Companies Act, 1956 (superseded by the Companies Act, 2013). Verify section numbers before use.'
    );
  }
  if (/\b(?:indian penal code|i\.?p\.?c\.?|cr\.?p\.?c\.?|code of criminal procedure|indian evidence act)\b/i.test(cleanedText)) {
    warnings.push(
      'Source text references IPC / CrPC / Indian Evidence Act. For matters after 1 July 2024, map provisions to Bharatiya Nyaya Sanhita (BNS), BNSS, and BSA, 2023.'
    );
  }
  if (/\barbitration act,?\s*1940\b/i.test(cleanedText)) {
    warnings.push(
      'Source text references the Arbitration Act, 1940 (repealed). Update to the Arbitration and Conciliation Act, 1996 (as amended).'
    );
  }
  if (/\b(?:service tax|central excise|sales tax|vat)\b/i.test(cleanedText)) {
    warnings.push(
      'Source text references pre-GST indirect tax regimes (Service Tax / VAT / Excise). Verify applicability under CGST / SGST / IGST Acts, 2017.'
    );
  }
  if (/\/200[_xX]{1,3}|19\d{2}/.test(cleanedText)) {
    warnings.push(
      'Source template contains legacy year placeholders (e.g., 19xx / 200_). Ensure current execution dates are entered explicitly.'
    );
  }
  if (lower.includes('consumer protection act, 1986') || rawCategory.toLowerCase() === 'consumer protection act') {
    warnings.push(
      'Consumer disputes in India are governed by the Consumer Protection Act, 2019 (replacing the 1986 Act) with revised pecuniary jurisdictions.'
    );
  }
  if (rawCategory.toLowerCase() === 'gst' || rawCategory.toLowerCase().includes('gst')) {
    warnings.push(
      'GST forms, notifications, and GSTN rules change frequently. Cross-check current CBIC circulars and portal form versions.'
    );
  }

  return warnings;
}

export function extractDetectedPlaceholders(cleanedText: string): string[] {
  const found = new Set<string>();
  const bracketMatches = cleanedText.match(/\[[A-Za-z0-9 _\/\-]{2,40}\]/g) || [];
  for (const m of bracketMatches) found.add(m);
  const parenMatches = cleanedText.match(/\((?:Full Name|Address|Date|Amount|City|State|Court|Name)[^)]{0,30}\)/gi) || [];
  for (const m of parenMatches) found.add(m);
  if (/_{4,}/.test(cleanedText)) found.add('Blank underscore fields (______)');
  if (/\.{5,}/.test(cleanedText)) found.add('Dotted blank fields (......)');
  return Array.from(found).slice(0, 12);
}


export function cleanTitleFromSourcePath(sourcePath: string): string {
  const filename = sourcePath.split('/').pop() || sourcePath;
  const noExt = filename.replace(/\.(rtf|docx|doc|pdf)$/i, '');
  const normalized = noExt
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-\d{3,4}$/, '')
    .trim();
  if (!normalized) return 'Untitled Legal Draft';
  // Convert ALL CAPS titles to readable Title Case while keeping acronyms
  const upperRatio = (normalized.match(/[A-Z]/g)?.length || 0) / Math.max(1, normalized.length);
  if (upperRatio > 0.65) {
    return normalized
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .replace(/\b(Gst|Ipr|Nri|Cpc|Crpc|Ipc|Art|U\/s|Sec|Rbi|Sebi|Sbi|Hma|Slp)\b/gi, (m) => m.toUpperCase())
      .replace(/\b(Of|For|To|In|And|On|Under|By|With|A|An|The|At|From)\b/g, (m, _, offset) =>
        offset === 0 ? m : m.toLowerCase()
      );
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const CANONICAL_TAG_ORDER = [
  'Popular',
  'New',
  'Business',
  'Personal',
  'Property',
  'Litigation',
  'Tax & Compliance',
];

export function deriveTemplateTags(input: {
  title: string;
  categoryGroup: string;
  rawCategory: string;
  sourcePath: string;
  reviewStatus?: string;
  isReconstructedFromPdf?: boolean;
  hasAcroForm?: boolean;
  curatedTags?: string[];
}): string[] {
  const tags = new Set<string>(input.curatedTags || []);
  const hay = `${input.title} ${input.rawCategory} ${input.sourcePath}`.toLowerCase();
  const grp = input.categoryGroup;

  // Popular: curated approved items + high-frequency everyday Indian instruments
  if (
    input.reviewStatus === 'approved' ||
    /\b(leave and license|rent agreement|lease agreement|general power of attorney|special power of attorney|\bgpa\b|\bspa\b|\bwill\b|sale deed|gift deed|non-disclosure|\bnda\b|memorandum of understanding|\bmou\b|employment agreement|section 138|dishonour of cheque|indemnity bond|partnership deed|partition deed|vakalatnama|promissory note|adoption deed|bail application|mutual consent|affidavit for name|affidavit for marriage|affidavit for address|legal notice)\b/i.test(
      hay
    )
  ) {
    tags.add('Popular');
  }

  // New: modern statutory / digital / GST / IT / reconstructed PDF forms
  if (
    input.isReconstructedFromPdf ||
    input.hasAcroForm ||
    /\b(gst|rfd-|gstr|digital|e-stamp|bns|bnss|bsa|information technology|software|privacy|e-commerce|startup|website|data protection|cyber|modern)\b/i.test(
      hay
    )
  ) {
    tags.add('New');
  }

  // Business: commercial agreements, corporate, employment, finance, IPR
  if (
    grp === 'Agreements & MoUs' ||
    grp === 'Corporate, IPR & Regulatory' ||
    grp === 'GST, Income Tax & Finance' ||
    /\b(business|company|corporate|director|board resolution|shareholder|partnership|franchise|vendor|service agreement|consultancy|nda|non-disclosure|employment|commercial|gst|trademark|copyright|patent|arbitration|joint venture|agency|supply|distributor|loan|hypothecation|guarantee|bank|tender|contract)\b/i.test(
      hay
    )
  ) {
    tags.add('Business');
  }

  // Personal: citizen affidavits, family law, wills, residential, POAs
  if (
    grp === 'Affidavits' ||
    grp === 'Wills & Family Law' ||
    grp === 'Powers of Attorney' ||
    /\b(affidavit|\bwill\b|codicil|adoption|marriage|divorce|matrimonial|maintenance|custody|name change|citizenship|passport|heirship|succession|residential|tenant|family|son\b|daughter|wife|husband|personal|power of attorney|\bgpa\b|\bspa\b|guardian|senior citizen|student)\b/i.test(
      hay
    )
  ) {
    tags.add('Personal');
  }

  // Property: real estate, conveyancing, rent & lease
  if (
    grp === 'Deeds & Conveyancing' ||
    grp === 'Rent & Lease' ||
    /\b(property|land|plot|flat|house|premises|sale deed|gift deed|partition|mortgage|lease|rent|leave and license|tenancy|conveyance|easement|release deed|encumbrance|sub-registrar|immovable)\b/i.test(
      hay
    )
  ) {
    tags.add('Property');
  }

  // Litigation: court pleadings, notices, petitions, criminal/civil suits
  if (
    grp === 'Legal Notices' ||
    grp === 'Petitions, Plaints & Pleadings' ||
    /\b(court|plaint|petition|written statement|\bsuit\b|\bwrit\b|bail|appeal|\bslp\b|vakalatnama|injunction|decree|magistrate|tribunal|section 138|section 80|complaint|consumer|notice)\b/i.test(
      hay
    )
  ) {
    tags.add('Litigation');
  }

  // Tax & Compliance: GST, income tax, statutory forms, ROC/MCA filings
  if (
    grp === 'GST, Income Tax & Finance' ||
    /\b(gst|income tax|tds|assessment|refund|rfd-|gstr|form no|roc\b|mca\b|registrar of companies|compliance|statutory|stamp duty|sebi|rbi|customs|excise|pan\b)\b/i.test(
      hay
    )
  ) {
    tags.add('Tax & Compliance');
  }

  // Guarantee at least one audience tag
  if (tags.size === 0) {
    tags.add('Personal');
  }

  return Array.from(tags).sort((a, b) => {
    const ia = CANONICAL_TAG_ORDER.indexOf(a);
    const ib = CANONICAL_TAG_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

