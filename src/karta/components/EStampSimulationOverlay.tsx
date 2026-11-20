import { useState } from 'react';
import { Eye, Settings2, Stamp, X } from 'lucide-react';
import { EStampConfig } from '../shared/types';
import { INDIAN_STATES_AND_UTS } from '../shared/constants';
import {
  STAMP_BACKGROUND_PATTERNS,
  StampBackgroundPatternId,
  getStampBackgroundPattern,
} from '../../assets/stamp-papers';

export interface StampRequirementAssessment {
  required: boolean;
  defaultDenominationInr: string;
  defaultArticle: string;
  reason: string;
}

/**
 * Determines whether an Indian legal draft typically requires Non-Judicial Stamp Paper
 * under the Indian Stamp Act, 1899 / State Stamp Acts (as opposed to Court Fee stamps or plain paper).
 */
export function detectStampPaperRequirement(
  categoryGroup: string,
  rawCategory: string,
  title: string,
  bodyText = ''
): StampRequirementAssessment {
  const combined = `${categoryGroup} ${rawCategory} ${title}`.toLowerCase();
  const bodyHead = bodyText.slice(0, 600).toLowerCase();

  // Court filings, notices, and wills generally do NOT use Non-Judicial e-Stamp paper
  if (
    /\b(petition|plaint|writ|appeal|complaint|written statement|reply|rejoinder|vakalatnama|notice of motion|caveat|bail|quashing|criminal|matrimonial|divorce|execution petition|review petition)\b/.test(
      combined
    ) ||
    /\b(in the supreme court|in the high court|in the district court)\b/.test(bodyHead)
  ) {
    return {
      required: false,
      defaultDenominationInr: '100',
      defaultArticle: 'Court Filing / Pleadings (Court Fee Rules Apply)',
      reason: 'Court pleadings typically use Court Fee stamps rather than Non-Judicial e-Stamp paper.',
    };
  }

  if (/\b(will|codicil|testament|legal notice|demand notice|eviction notice|gst|income tax)\b/.test(combined)) {
    return {
      required: false,
      defaultDenominationInr: '100',
      defaultArticle: 'Plain Paper / Advocate Letterhead',
      reason: 'Wills, notices, and tax filings do not mandatorily require Non-Judicial stamp paper.',
    };
  }

  if (/\b(affidavit|declaration|undertaking)\b/.test(combined)) {
    return {
      required: true,
      defaultDenominationInr: '100',
      defaultArticle: 'Article 4 — Affidavit / Affirmation',
      reason: 'Affidavits and sworn undertakings typically require Non-Judicial Stamp Paper (₹10–₹100 by State).',
    };
  }

  if (/\b(power of attorney|poa|gpa|spa|attorney)\b/.test(combined)) {
    return {
      required: true,
      defaultDenominationInr: '500',
      defaultArticle: 'Article 48 — Power of Attorney',
      reason: 'Powers of Attorney require Non-Judicial Stamp Paper under State Stamp schedules.',
    };
  }

  if (/\b(sale deed|conveyance|gift|partition|mortgage|release|relinquishment|settlement|exchange|trust)\b/.test(combined)) {
    return {
      required: true,
      defaultDenominationInr: '500',
      defaultArticle: 'Conveyance / Deed Instrument (Ad Valorem Tariff Applies)',
      reason: 'Deeds and property conveyances require Non-Judicial e-Stamp payment based on State tariff.',
    };
  }

  if (/\b(rent|lease|leave and licen|tenancy|sub-lease)\b/.test(combined)) {
    return {
      required: true,
      defaultDenominationInr: '500',
      defaultArticle: 'Article 35 / Leave & Licence — Lease Agreement',
      reason: 'Rent, lease, and Leave & Licence agreements typically require Non-Judicial e-Stamp paper.',
    };
  }

  if (/\b(agreement|deed|indemnity|bond|mou|memorandum|partnership|llp|franchise|joint venture|nda|employment|contract)\b/.test(combined)) {
    return {
      required: true,
      defaultDenominationInr: '100',
      defaultArticle: 'Article 5 — Agreement / Memorandum',
      reason: 'Commercial and civil agreements require Non-Judicial e-Stamp paper under State Stamp Acts.',
    };
  }

  return {
    required: false,
    defaultDenominationInr: '100',
    defaultArticle: rawCategory || categoryGroup || 'General Instrument',
    reason: 'Optional e-Stamp reference header (enable if required under your State Stamp Act).',
  };
}

interface Props {
  eStamp: EStampConfig;
  jurisdictionState?: string;
  executionDate?: string;
  documentTitle: string;
  firstPartyFallback?: string;
  secondPartyFallback?: string;
  onQuickUpdate: (patch: Partial<EStampConfig>) => void;
  onOpenFullConfig?: () => void;
  onDismiss?: () => void;
}

const QUICK_DENOMINATIONS = ['20', '50', '100', '200', '500', '1000'];

function formatDisplayDate(raw: string): string {
  if (!raw || raw === 'Not Specified') return 'Not Specified';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mo = months[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))];
  return `${m[3]}-${mo}-${m[1]}`;
}

function DeterministicMatrixBarcode({ seed }: { seed: string }) {
  const size = 15;
  const cells: Array<{ x: number; y: number }> = [];
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Standard finder borders along left & bottom edges (DataMatrix style like SHCIL e-Stamp)
      const isFinderEdge =
        c === 0 ||
        r === size - 1 ||
        (r === 0 && c % 2 === 0) ||
        (c === size - 1 && r % 2 === 1);
      const bit = ((hash >>> ((r * 7 + c * 3) % 24)) ^ (r * 13 + c * 17)) & 1;
      if (isFinderEdge || bit === 1) {
        cells.push({ x: c, y: r });
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-20 h-20 border border-[#D6CEBE] p-1 bg-white shrink-0"
      aria-label="Draft layout QR / 2D barcode placeholder (not an active SHCIL code)"
    >
      {cells.map((cell, idx) => (
        <rect key={idx} x={cell.x} y={cell.y} width="0.92" height="0.92" fill="#1C1917" />
      ))}
    </svg>
  );
}

export function EStampSimulationOverlay({
  eStamp,
  jurisdictionState,
  executionDate,
  documentTitle,
  firstPartyFallback,
  secondPartyFallback,
  onQuickUpdate,
  onOpenFullConfig,
  onDismiss,
}: Props) {
  const [showRefImage, setShowRefImage] = useState(false);
  const [refImgFailed, setRefImgFailed] = useState(false);

  const effectiveValue = (eStamp.denominationInr || '100').trim();
  const effectiveDateRaw =
    eStamp.purchaseDate ||
    (executionDate && executionDate !== 'Not Specified' ? executionDate : '') ||
    new Date().toISOString().slice(0, 10);
  const effectiveDate = formatDisplayDate(effectiveDateRaw);

  const effectiveState =
    eStamp.state ||
    (jurisdictionState && jurisdictionState !== 'Not Specified' ? jurisdictionState : '') ||
    'Karnataka';

  const effectiveFirstParty = eStamp.purchasedBy || firstPartyFallback || 'Not Applicable / Specify';
  const effectiveSecondParty = eStamp.secondParty || secondPartyFallback || 'Not Applicable';
  const isCertificateAttached = eStamp.mode === 'existing_certificate';

  const certRows: Array<{ label: string; value: string; bold?: boolean; gapAfter?: boolean }> = [
    {
      label: 'Certificate No.',
      value: isCertificateAttached
        ? eStamp.certificateNumber || '[Enter IN-... SHCIL Certificate No.]'
        : 'SIMULATION-DRAFT-REF',
      bold: true,
    },
    { label: 'Certificate Issued Date', value: effectiveDate },
    {
      label: 'Account Reference',
      value: eStamp.accountReference || 'DRAFT-ACC-REF (Simulation Layout)',
    },
    {
      label: 'Unique Doc. Reference',
      value: eStamp.uniqueDocReference || 'DRAFT-UDR-REFERENCE-ONLY',
    },
    { label: 'Purchased by', value: effectiveFirstParty },
    {
      label: 'Description of Document',
      value: eStamp.articleDescription || documentTitle,
    },
    {
      label: 'Description',
      value: eStamp.documentSubDescription || documentTitle,
    },
    {
      label: 'Consideration Price (Rs.)',
      value: eStamp.considerationPriceInr ? `${eStamp.considerationPriceInr} (INR)` : '0 (Zero)',
      gapAfter: true,
    },
    { label: 'First Party', value: effectiveFirstParty },
    { label: 'Second Party', value: effectiveSecondParty },
    {
      label: 'Stamp Duty Paid By',
      value: eStamp.stampDutyPaidBy || effectiveFirstParty,
    },
    {
      label: 'Stamp Duty Amount(Rs.)',
      value: `${effectiveValue}/- (Rupees ${effectiveValue} only)`,
      bold: true,
    },
  ];

  const activePattern = getStampBackgroundPattern(
    eStamp.backgroundPattern || (eStamp.mode !== 'none' ? 'shcil_emerald' : 'none')
  );

  return (
    <div
      className="relative bg-white border border-[#C7BFA9] rounded-md p-4 sm:p-5 overflow-hidden shadow-xs"
      aria-label="SHCIL Reference e-Stamp Header Layout"
    >
      {/* High-Resolution Security Guilloche / Stamp Paper Background Pattern */}
      {activePattern.url && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage: `url("${activePattern.url}")`,
            backgroundSize: '360px 360px',
            backgroundRepeat: 'repeat',
          }}
        />
      )}

      {/* Interactive Toolbar (Hidden when printing) */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DFD3] pb-2.5 mb-4 print:hidden">
        <div className="flex items-center gap-2 text-[11px] font-mono-tabular">
          <Stamp className="w-3.5 h-3.5 text-[#1B365D]" />
          <span className="font-bold text-[#1B365D] uppercase">
            e-Stamp Reference Header
          </span>
          <span className="text-[#78716C]">·</span>
          <span className="text-[#9A3412] font-semibold">
            {isCertificateAttached ? 'USER CERTIFICATE REF' : 'SAMPLE LAYOUT ONLY (NOT GOVT ISSUED)'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Select State or Union Territory for e-Stamp reference header"
            value={effectiveState}
            onChange={(e) =>
              onQuickUpdate({
                state: e.target.value,
                mode: eStamp.mode === 'none' ? 'sample_preview' : eStamp.mode,
              })
            }
            className="h-7 px-2 text-[11px] bg-[#FCFBF7] border border-[#D6CEBE] rounded text-[#1C1917] max-w-[155px]"
          >
            <option value="">State / UT...</option>
            {INDIAN_STATES_AND_UTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1 flex-wrap">
            {QUICK_DENOMINATIONS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() =>
                  onQuickUpdate({
                    denominationInr: amt,
                    mode: eStamp.mode === 'none' ? 'sample_preview' : eStamp.mode,
                  })
                }
                className={`px-1.5 py-0.5 text-[11px] font-mono-tabular rounded border transition-colors ${
                  effectiveValue === amt
                    ? 'bg-[#1B365D] text-white border-[#1B365D]'
                    : 'bg-white text-[#57534E] border-[#D6CEBE] hover:border-[#1B365D]'
                }`}
              >
                ₹{amt}
              </button>
            ))}
          </div>

          <select
            aria-label="Select e-Stamp security background pattern"
            value={eStamp.backgroundPattern || 'shcil_emerald'}
            onChange={(e) =>
              onQuickUpdate({
                backgroundPattern: e.target.value as StampBackgroundPatternId,
                mode: eStamp.mode === 'none' ? 'sample_preview' : eStamp.mode,
              })
            }
            className="h-7 px-2 text-[11px] bg-[#FCFBF7] border border-[#D6CEBE] rounded text-[#1C1917] max-w-[165px]"
          >
            {STAMP_BACKGROUND_PATTERNS.map((pat) => (
              <option key={pat.id} value={pat.id}>
                Pattern: {pat.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowRefImage((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border ${
              showRefImage
                ? 'bg-[#FFFBEB] border-[#D97706] text-[#9A3412]'
                : 'bg-white border-[#D6CEBE] text-[#57534E] hover:border-[#1B365D]'
            }`}
          >
            <Eye className="w-3 h-3" />
            {showRefImage ? 'Hide Sample' : 'Reference Image'}
          </button>

          {onOpenFullConfig && (
            <button
              type="button"
              onClick={onOpenFullConfig}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#1E3A8A] bg-[#EFF6FF] border border-[#BFDBFE] rounded hover:bg-[#DBEAFE]"
            >
              <Settings2 className="w-3 h-3" />
              Edit Fields
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              title="Hide e-Stamp Header"
              className="p-1 text-[#78716C] hover:text-[#1C1917] rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Side-by-Side Original Sample Stamp Paper Reference */}
      {showRefImage && (
        <div className="mb-4 p-3 bg-[#FCFBF7] border border-[#E5DFD3] rounded-md flex flex-col sm:flex-row items-center gap-4 print:hidden">
          {!refImgFailed ? (
            <img
              src="/assets/aistudio/stamp-sample_c88c690a.jpg"
              alt="Uploaded Government of Karnataka SHCIL e-Stamp reference sheet"
              referrerPolicy="no-referrer"
              onError={() => setRefImgFailed(true)}
              className="w-36 h-48 object-contain border border-[#D6CEBE] bg-white rounded shrink-0"
            />
          ) : (
            <div className="w-36 h-48 border border-[#D6CEBE] bg-[#F3EFE7] rounded flex items-center justify-center text-[11px] text-[#78716C] text-center p-2 shrink-0">
              Sample Stamp Paper Reference
            </div>
          )}
          <div className="text-xs text-[#57534E] space-y-1.5">
            <p className="font-semibold text-[#1C1917]">
              Uploaded Reference Format: India Non-Judicial e-Stamp
            </p>
            <p>
              This draft header mirrors the 12-field SHCIL certificate structure from your reference sample (Certificate No., Issued Date, Account &amp; Unique Doc. Reference, Purchased by, Description, Consideration Price, Parties, Stamp Duty Paid By &amp; Amount, 2D matrix area, and writing boundary line).
            </p>
            <p className="text-[11px] text-[#9A3412] font-medium">
              Note: Visual layout reference only — purchase an official SHCIL / State GRAS e-Stamp before execution.
            </p>
          </div>
        </div>
      )}

      {/* Authentic SHCIL e-Stamp Sheet Facsimile Body */}
      <div className="relative px-2 sm:px-4 py-2">
        {/* Subtle Circular Watermark Ring matching SHCIL layout */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.06]"
        >
          <div className="w-52 h-52 rounded-full border-[14px] border-dashed border-[#78716C] flex items-center justify-center">
            <span className="text-xs font-bold tracking-[0.22em] text-[#57534E] -rotate-12 uppercase text-center">
              {isCertificateAttached ? 'REFERENCE\nCOPY' : 'SAMPLE DRAFT\nSIMULATION'}
            </span>
          </div>
        </div>

        {/* Top Header: Civic Seal Left + INDIA NON JUDICIAL / Government of [State] / e-Stamp */}
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-4">
          {/* Civic Crest Placeholder (explicitly marked SAMPLE REF) */}
          <div className="w-20 shrink-0 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border-2 border-[#44403C] bg-[#FCFBF7] flex flex-col items-center justify-center">
              <svg viewBox="0 0 48 48" className="w-8 h-8 text-[#292524]" aria-hidden="true">
                <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="24" cy="24" r="3.2" fill="currentColor" />
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i * 30 * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1="24"
                      y1="24"
                      x2={24 + Math.cos(angle) * 15}
                      y2={24 + Math.sin(angle) * 15}
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  );
                })}
              </svg>
            </div>
            <span className="text-[8.5px] font-bold tracking-wider uppercase text-[#78716C] mt-1">
              SAMPLE REF
            </span>
          </div>

          <div className="flex-1 text-center space-y-1 sm:pr-12">
            <p className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#1C1917]">
              INDIA NON JUDICIAL
            </p>
            <p className="text-[17px] sm:text-[19px] font-semibold text-[#1C1917] underline decoration-[#1C1917] underline-offset-4">
              Government of {effectiveState}
            </p>
            <p className="text-[14px] font-bold text-[#1C1917] pt-0.5">e-Stamp</p>
          </div>
        </div>

        {/* Exact 12-Row SHCIL Certificate Particulars Table */}
        <div className="relative space-y-1 text-[11.5px] sm:text-[12px] leading-snug text-[#1C1917]">
          {certRows.map((row) => (
            <div
              key={row.label}
              className={`grid grid-cols-[155px_12px_1fr] sm:grid-cols-[185px_16px_1fr] items-baseline ${
                row.gapAfter ? 'pb-2.5' : ''
              }`}
            >
              <span className="font-medium text-[#292524]">{row.label}</span>
              <span className="text-center font-medium">:</span>
              <span
                className={`break-words ${
                  row.bold ? 'font-bold font-mono-tabular text-[#1C1917]' : 'text-[#1C1917]'
                }`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom Barcode + Security Strip */}
        <div className="relative mt-5 flex items-center gap-4">
          <DeterministicMatrixBarcode
            seed={`${effectiveState}|${effectiveValue}|${effectiveFirstParty}|${effectiveDateRaw}`}
          />
          <div className="flex-1 h-12 border border-[#E5DFD3] bg-gradient-to-r from-[#F5F2EB] via-[#FCFBF7] to-[#F5F2EB] flex items-center justify-center px-3">
            <span className="text-[11px] font-mono-tabular tracking-[0.25em] uppercase text-[#78716C]/70 font-bold text-center">
              {isCertificateAttached
                ? 'REFERENCE CERTIFICATE · VERIFY ON SHCIL'
                : 'DRAFT SIMULATION · NOT VALID GOVERNMENT STAMP'}
            </span>
          </div>
        </div>

        {/* Dotted Writing Boundary Line from Reference Image */}
        <div className="mt-4 pt-1 flex items-center gap-2 text-[10.5px] text-[#57534E]">
          <span className="flex-1 border-b border-dotted border-[#44403C]" />
          <span className="shrink-0 font-medium text-[#292524]">
            Please write or type below this line
          </span>
          <span className="flex-1 border-b border-dotted border-[#44403C]" />
        </div>
      </div>
    </div>
  );
}
