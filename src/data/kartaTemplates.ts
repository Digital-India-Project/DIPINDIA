import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import kartaCuratedRaw from './kartaCuratedDump.json';
import emeraldUrl from '../assets/stamp-papers/shcil-guilloche-emerald.svg';
import saffronUrl from '../assets/stamp-papers/non-judicial-saffron-bond.svg';
import indigoUrl from '../assets/stamp-papers/court-fee-indigo-ledger.svg';
import rosetteUrl from '../assets/stamp-papers/security-rosette-watermark.svg';

export type StampBackgroundPatternId =
  | 'none'
  | 'shcil_emerald'
  | 'saffron_bond'
  | 'indigo_judicial'
  | 'rosette_watermark';

export interface StampBackgroundPatternOption {
  id: StampBackgroundPatternId;
  label: string;
  subtitle: string;
  accentHex: string;
  url: string | null;
}

export const STAMP_BACKGROUND_PATTERNS: StampBackgroundPatternOption[] = [
  {
    id: 'none',
    label: 'Plain Archival Paper',
    subtitle: 'Clean unpatterned vellum bond',
    accentHex: '#78716C',
    url: null,
  },
  {
    id: 'shcil_emerald',
    label: 'SHCIL Emerald Guilloche',
    subtitle: 'Teal-green e-Stamp security wave',
    accentHex: '#047857',
    url: emeraldUrl,
  },
  {
    id: 'saffron_bond',
    label: 'Saffron Treasury Bond',
    subtitle: 'Traditional non-judicial amber lattice',
    accentHex: '#B45309',
    url: saffronUrl,
  },
  {
    id: 'indigo_judicial',
    label: 'Indigo Judicial Ledger',
    subtitle: 'Navy court-fee security grid',
    accentHex: '#1B365D',
    url: indigoUrl,
  },
  {
    id: 'rosette_watermark',
    label: 'Rosette Draft Watermark',
    subtitle: 'Repeating security medallion mesh',
    accentHex: '#57534E',
    url: rosetteUrl,
  },
];

export interface KartaFieldSchema {
  fieldId: string;
  label: string;
  type: string;
  group: string;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
  matchTokens: string[];
}

export interface KartaTemplate {
  id: string;
  sourcePath: string;
  category: string;
  title: string;
  description: string;
  jurisdictionScope: string;
  reviewStatus: string;
  version: string;
  disclaimer: string;
  statutoryWarnings: string[];
  tags: string[];
  preferredFields: KartaFieldSchema[];
  fallbackSourceText: string;
}

export interface StateStampGuide {
  state: string;
  portalName: string;
  affidavitIndicative: string;
  agreementIndicative: string;
  poaIndicative: string;
  leaseIndicative: string;
  notes: string;
}

export const STATE_STAMP_GUIDES: StateStampGuide[] = [
  {
    state: 'Delhi (NCT)',
    portalName: 'SHCIL e-Stamping (shcilestamp.com)',
    affidavitIndicative: 'Rs. 10 / Rs. 50 / Rs. 100 (purpose-dependent)',
    agreementIndicative: 'Rs. 50 / Rs. 100 (general agreements)',
    poaIndicative: 'Rs. 50 (without consideration); ad valorem if for sale',
    leaseIndicative: '2% of average annual rent (up to 5 yrs) + Rs. 100 security deposit',
    notes: 'e-Stamp is mandatory across Delhi NCT via SHCIL authorised ACC centres.',
  },
  {
    state: 'Maharashtra',
    portalName: 'GRAS Maharashtra (gras.mahakosh.gov.in) / e-SBTR',
    affidavitIndicative: 'Rs. 100 / Rs. 500 (Maharashtra Stamp Act Art. 4)',
    agreementIndicative: 'Rs. 500 (Maharashtra Stamp Act Art. 5(h)(B))',
    poaIndicative: 'Rs. 500 (family/general without consideration); ad valorem otherwise',
    leaseIndicative: '0.25% of total rent + refundable deposit factor (Leave & License Art. 36A)',
    notes: 'Compulsory online registration & e-Stamp for Leave & License u/s 55 Maharashtra Rent Control Act.',
  },
  {
    state: 'Karnataka',
    portalName: 'Kaveri 2.0 / SHCIL e-Stamp (kaveri.karnataka.gov.in)',
    affidavitIndicative: 'Rs. 20 / Rs. 100 (Karnataka Stamp Act)',
    agreementIndicative: 'Rs. 200 / Rs. 500 (Art. 5 general)',
    poaIndicative: 'Rs. 200 / Rs. 500 (family vs non-family)',
    leaseIndicative: '0.5%–1% on average annual rent + advance depending on term',
    notes: 'Verify recent Karnataka Stamp (Amendment) Act schedules prior to purchase.',
  },
  {
    state: 'Uttar Pradesh',
    portalName: 'SHCIL UP / IGRSUP (igrsup.gov.in)',
    affidavitIndicative: 'Rs. 10 / Rs. 100',
    agreementIndicative: 'Rs. 100',
    poaIndicative: 'Rs. 100 (general); 2%–7% if empowering immovable transfer',
    leaseIndicative: '2%–4% on annual rent depending on lease duration',
    notes: 'Rent agreements exceeding 11 months require registration under Registration Act.',
  },
  {
    state: 'Tamil Nadu',
    portalName: 'TNREGINET / SHCIL (tnreginet.gov.in)',
    affidavitIndicative: 'Rs. 20 / Rs. 100',
    agreementIndicative: 'Rs. 20 / Rs. 100',
    poaIndicative: 'Rs. 100 (without consideration)',
    leaseIndicative: '1% of total rent + advance (up to 30 yrs)',
    notes: 'Tenancy agreements in Tamil Nadu must also be registered on tenancy.tn.gov.in under TNRRRLT Act.',
  },
  {
    state: 'Gujarat',
    portalName: 'SHCIL Gujarat / Garvi (garvi.gujarat.gov.in)',
    affidavitIndicative: 'Rs. 50 / Rs. 300',
    agreementIndicative: 'Rs. 300 (standard general agreement)',
    poaIndicative: 'Rs. 300 (general); ad valorem if for sale',
    leaseIndicative: '1% of average annual rent for leases >= 1 yr',
    notes: 'Gujarat raised minimum non-judicial stamp slabs to Rs. 300 for several articles; verify locally.',
  },
];

export const NON_EXECUTED_STATUS_NOTICE =
  'UNEXECUTED DRAFT ONLY — Generated from Digital India Project Karta Files library with variable substitution. Not notarized, not e-stamped by a government treasury, and not registered under the Registration Act, 1908.';

export const APPROVED_TEMPLATE_BANNER =
  'ADMIN-APPROVED TEMPLATE — Original legal wording preserved with form-mapped variable substitution. Confirm applicable state stamp paper, court fees, and execution formalities before signing.';

function inferCategory(sourcePath: string): string {
  const lower = sourcePath.toLowerCase();
  if (lower.includes('/affidavit')) return 'Affidavits & Declarations';
  if (lower.includes('/lease')) return 'Rent & Lease';
  if (lower.includes('/negotiable') || lower.includes('/notice')) return 'Legal Notices';
  if (lower.includes('/power of attorney')) return 'Powers of Attorney';
  if (lower.includes('/will')) return 'Wills & Family Law';
  if (lower.includes('/sale') || lower.includes('/gift') || lower.includes('/partition')) {
    return 'Deeds & Conveyancing';
  }
  if (lower.includes('/civil pleadings')) return 'Petitions, Plaints & Pleadings';
  if (lower.includes('/gst')) return 'GST, Income Tax & Finance';
  return 'Corporate, IPR & Regulatory';
}

export const KARTA_TEMPLATES: KartaTemplate[] = (kartaCuratedRaw as any[]).map((item, idx) => ({
  id: `karta-tpl-${idx + 1}-${String(item.title || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`,
  sourcePath: String(item.sourcePath || ''),
  category: inferCategory(String(item.sourcePath || '')),
  title: String(item.title || 'Untitled Draft'),
  description: String(item.description || ''),
  jurisdictionScope: String(item.jurisdictionScope || 'All-India'),
  reviewStatus: String(item.reviewStatus || 'approved'),
  version: String(item.version || '1.0.0'),
  disclaimer: String(item.disclaimer || ''),
  statutoryWarnings: Array.isArray(item.statutoryWarnings) ? item.statutoryWarnings : [],
  tags: Array.isArray(item.tags) ? item.tags : [],
  preferredFields: Array.isArray(item.preferredFields) ? item.preferredFields : [],
  fallbackSourceText:
    String(item.fallbackSourceText || '') ||
    `${String(item.title || '').toUpperCase()}\n\n[Karta Files Library Source: ${String(item.sourcePath || '')}]\n\nThis instrument is prepared between {{first_party_name}} and {{second_party_name}} at {{court_or_authority}} on {{execution_date}}.\n\nDetails & Operative Clauses:\n${(Array.isArray(item.preferredFields) ? item.preferredFields : [])
      .map((f: any) => `- ${f.label}: {{${f.fieldId}}}`)
      .join('\n')}\n\nIN WITNESS WHEREOF the parties have set their hands on the date first written above.`,
}));

export const KARTA_CATEGORIES = Array.from(new Set(KARTA_TEMPLATES.map((t) => t.category)));

export function renderTemplateWithValues(
  template: KartaTemplate,
  values: Record<string, string>
): string {
  let rendered = template.fallbackSourceText;

  // Replace {{fieldId}} tokens first
  for (const [fieldId, val] of Object.entries(values)) {
    const cleanVal = val?.trim();
    if (!cleanVal) continue;
    const mustache = new RegExp(`\\{\\{\\s*${fieldId}\\s*\\}\\}`, 'g');
    rendered = rendered.replace(mustache, cleanVal);
  }

  // Replace matchTokens sequentially when placeholders exist in raw source drafts
  for (const field of template.preferredFields) {
    const val = values[field.fieldId]?.trim();
    if (!val) continue;
    for (const token of field.matchTokens || []) {
      if (token && token !== '__' && token !== '___' && rendered.includes(token)) {
        rendered = rendered.replace(token, val);
      }
    }
  }

  // Append structured field summary if fallbackSourceText has remaining blank underscores
  const filledPairs = template.preferredFields
    .map((f) => ({ label: f.label, val: values[f.fieldId]?.trim() }))
    .filter((p) => Boolean(p.val));

  if (filledPairs.length > 0 && /_{3,}/.test(rendered)) {
    rendered +=
      '\n\n--- MAPPED EXECUTION SCHEDULE (KARTA FILES) ---\n' +
      filledPairs.map((p) => `${p.label}: ${p.val}`).join('\n');
  }

  return rendered;
}

export async function generateSimpleTextPdf(
  title: string,
  body: string
): Promise<{ blob: Blob; filename: string }> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const safeText = (val: string) =>
    String(val || '').replace(/[^\x20-\x7E\n]/g, ' ');

  const margin = 46;
  const pageWidth = PageSizes.A4[0];
  const pageHeight = PageSizes.A4[1];
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 10.5;
  const lineHeight = 14.5;

  let page = pdf.addPage(PageSizes.A4);
  let y = pageHeight - margin;

  const cleanTitle = safeText(title).slice(0, 90) || 'Karta Files Draft';
  page.drawText(cleanTitle, {
    x: margin,
    y,
    size: 14,
    font: bold,
    color: rgb(0.12, 0.14, 0.18),
  });
  y -= 20;

  page.drawText('DIGITAL INDIA PROJECT — KARTA FILES DRAFT (UNEXECUTED PREVIEW)', {
    x: margin,
    y,
    size: 8.5,
    font: bold,
    color: rgb(0.75, 0.3, 0.08),
  });
  y -= 18;

  const rawLines = safeText(body).split('\n');
  for (const rawLine of rawLines) {
    const words = rawLine.trim().length > 0 ? rawLine.split(/\s+/) : [''];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (regular.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (y < margin + 20) {
          page = pdf.addPage(PageSizes.A4);
          y = pageHeight - margin;
        }
        page.drawText(current, {
          x: margin,
          y,
          size: fontSize,
          font: regular,
          color: rgb(0.15, 0.17, 0.2),
        });
        y -= lineHeight;
        current = word;
      }
    }
    if (y < margin + 20) {
      page = pdf.addPage(PageSizes.A4);
      y = pageHeight - margin;
    }
    page.drawText(current, {
      x: margin,
      y,
      size: fontSize,
      font: regular,
      color: rgb(0.15, 0.17, 0.2),
    });
    y -= lineHeight;
  }

  const bytes = await pdf.save();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'karta-draft';
  return {
    blob,
    filename: `${slug}.pdf`,
  };
}
