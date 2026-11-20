import { PDFPage, PDFFont, degrees, rgb } from 'pdf-lib';
import type { KartaStampMetadata } from './kartaSyncService';

export type GoIStampCategory = 'all' | 'verification' | 'workflow' | 'registry';
export type GoIStampShape = 'double-box' | 'circular-seal' | 'oval-emblem';

export interface GoIStampDefinition {
  id: string;
  label: string;
  subtitle: string;
  authorityLine: string;
  actReference: string;
  category: Exclude<GoIStampCategory, 'all'>;
  shape: GoIStampShape;
  colorHex: string;
  rgbTuple: [number, number, number];
  defaultRotationDeg: number;
  showEmblem?: boolean;
}

export const GOI_STAMP_CATEGORY_TABS: Array<{
  id: GoIStampCategory;
  label: string;
}> = [
  { id: 'all', label: 'All Official Stamps' },
  { id: 'verification', label: 'Verification & Attestation' },
  { id: 'workflow', label: 'Draft & Workflow' },
  { id: 'registry', label: 'Revenue & Registry' },
];

export const GOI_STAMP_CATALOG: GoIStampDefinition[] = [
  {
    id: 'verified',
    label: 'VERIFIED',
    subtitle: 'DOCUMENT SCRUTINY PASSED',
    authorityLine: 'GOVERNMENT OF INDIA · DIP COMPLIANCE DESK',
    actReference: 'Rule 4 Scrutiny',
    category: 'verification',
    shape: 'double-box',
    colorHex: '#138808',
    rgbTuple: [0.075, 0.533, 0.031],
    defaultRotationDeg: -10,
  },
  {
    id: 'certified_true_copy',
    label: 'CERTIFIED TRUE COPY',
    subtitle: 'EXACT REPRODUCTION OF ORIGINAL',
    authorityLine: 'SEC. 76 INDIAN EVIDENCE ACT, 1872',
    actReference: 'Sec. 76 Evidence Act',
    category: 'verification',
    shape: 'double-box',
    colorHex: '#B91C1C',
    rgbTuple: [0.725, 0.11, 0.11],
    defaultRotationDeg: -8,
  },
  {
    id: 'attested_gazetted',
    label: 'ATTESTED',
    subtitle: 'GAZETTED OFFICER / NOTARY',
    authorityLine: 'OFFICIAL SEAL · GOVT. OF INDIA',
    actReference: 'Notaries Act, 1952',
    category: 'verification',
    shape: 'circular-seal',
    colorHex: '#1E3A8A',
    rgbTuple: [0.118, 0.227, 0.541],
    defaultRotationDeg: -6,
    showEmblem: true,
  },
  {
    id: 'self_attested',
    label: 'SELF ATTESTED',
    subtitle: 'SIGNED BY APPLICANT / EXECUTANT',
    authorityLine: 'TRUE COPY DECLARATION',
    actReference: 'Self-Attestation Reform',
    category: 'verification',
    shape: 'double-box',
    colorHex: '#3730A3',
    rgbTuple: [0.216, 0.188, 0.639],
    defaultRotationDeg: -11,
  },
  {
    id: 'draft',
    label: 'DRAFT',
    subtitle: 'UNEXECUTED · FOR REVIEW ONLY',
    authorityLine: 'NOT VALID FOR LEGAL FILING',
    actReference: 'Pre-Execution Copy',
    category: 'workflow',
    shape: 'double-box',
    colorHex: '#475569',
    rgbTuple: [0.278, 0.333, 0.412],
    defaultRotationDeg: -14,
  },
  {
    id: 'received',
    label: 'RECEIVED',
    subtitle: 'DAK / PUBLIC RECEIPT DESK',
    authorityLine: 'CENTRALIZED FILING COUNTER',
    actReference: 'CSMOP Receipt Manual',
    category: 'workflow',
    shape: 'circular-seal',
    colorHex: '#0F766E',
    rgbTuple: [0.059, 0.463, 0.431],
    defaultRotationDeg: -5,
    showEmblem: true,
  },
  {
    id: 'urgent_priority',
    label: 'IMMEDIATE',
    subtitle: 'TIME-BOUND STATUTORY DISPOSAL',
    authorityLine: 'PRIORITY CLEARANCE DESK',
    actReference: 'Citizen Charter SLA',
    category: 'workflow',
    shape: 'double-box',
    colorHex: '#C2410C',
    rgbTuple: [0.761, 0.255, 0.047],
    defaultRotationDeg: -9,
  },
  {
    id: 'shcil_estamped',
    label: 'SHCIL E-STAMPED',
    subtitle: 'NON-JUDICIAL REVENUE BOND',
    authorityLine: 'STOCK HOLDING CORP. OF INDIA',
    actReference: 'Indian Stamp Act, 1899',
    category: 'registry',
    shape: 'double-box',
    colorHex: '#047857',
    rgbTuple: [0.016, 0.471, 0.341],
    defaultRotationDeg: -7,
  },
  {
    id: 'sub_registrar_presented',
    label: 'PRESENTED',
    subtitle: 'OFFICE OF THE SUB-REGISTRAR',
    authorityLine: 'INDIAN REGISTRATION ACT, 1908',
    actReference: 'Sec. 52 Regn. Act',
    category: 'registry',
    shape: 'oval-emblem',
    colorHex: '#881337',
    rgbTuple: [0.533, 0.075, 0.216],
    defaultRotationDeg: -6,
    showEmblem: true,
  },
  {
    id: 'confidential',
    label: 'CONFIDENTIAL',
    subtitle: 'RESTRICTED OFFICIAL RECORD',
    authorityLine: 'AES-256-GCM E2EE VAULT',
    actReference: 'Official Classification',
    category: 'registry',
    shape: 'double-box',
    colorHex: '#4338CA',
    rgbTuple: [0.263, 0.22, 0.792],
    defaultRotationDeg: -12,
  },
];

export function getGoIStampById(id?: string | null): GoIStampDefinition {
  if (!id) return GOI_STAMP_CATALOG[0];
  const aliasMap: Record<string, string> = {
    verified_original: 'verified',
    certified_copy: 'certified_true_copy',
    draft_unexecuted: 'draft',
    notarized_draft: 'attested_gazetted',
    confidential_e2ee: 'confidential',
  };
  const resolved = aliasMap[id] || id;
  return (
    GOI_STAMP_CATALOG.find((s) => s.id === resolved) || GOI_STAMP_CATALOG[0]
  );
}

export function embedGoIStampOnPdfPage(params: {
  pdfPage: PDFPage;
  stamp: KartaStampMetadata;
  fontBold: PDFFont;
  fontRegular: PDFFont;
}): void {
  const { pdfPage, stamp, fontBold, fontRegular } = params;
  const def = getGoIStampById(stamp.presetId);
  const [r, g, b] = def.rgbTuple;
  const color = rgb(r, g, b);
  const scale = stamp.scale || 1;
  const opacity = typeof stamp.opacity === 'number' ? stamp.opacity : 0.88;
  const angleDeg = def.defaultRotationDeg;
  const dateStr = new Date(stamp.stampedAtIso).toLocaleDateString('en-IN');
  const officerStr = (stamp.officerName || 'DIP Authorized Desk').slice(0, 28);
  const refStr = stamp.referenceNo ? `Ref: ${stamp.referenceNo.slice(0, 18)}` : '';

  const { width, height } = pdfPage.getSize();

  if (def.shape === 'circular-seal') {
    const radius = 48 * scale;
    const cx =
      stamp.position === 'center'
        ? width / 2
        : stamp.position === 'bottom-left'
        ? radius + 48
        : width - radius - 48;
    const cy =
      stamp.position === 'top-right'
        ? height - radius - 48
        : stamp.position === 'center'
        ? height / 2
        : radius + 48;

    pdfPage.drawCircle({
      x: cx,
      y: cy,
      size: radius,
      borderColor: color,
      borderWidth: 2,
      color: rgb(1, 1, 1),
      opacity: opacity * 0.9,
      borderOpacity: opacity,
    });
    pdfPage.drawCircle({
      x: cx,
      y: cy,
      size: radius - 5 * scale,
      borderColor: color,
      borderWidth: 1,
      borderOpacity: opacity,
    });

    const titleSize = 9.5 * scale;
    const titleWidth = fontBold.widthOfTextAtSize(stamp.label, titleSize);
    pdfPage.drawText(stamp.label, {
      x: cx - titleWidth / 2,
      y: cy + 6 * scale,
      size: titleSize,
      font: fontBold,
      color,
      opacity,
    });

    const subText = officerStr.slice(0, 20);
    const subSize = 6.5 * scale;
    const subWidth = fontRegular.widthOfTextAtSize(subText, subSize);
    pdfPage.drawText(subText, {
      x: cx - subWidth / 2,
      y: cy - 8 * scale,
      size: subSize,
      font: fontRegular,
      color,
      opacity,
    });

    const dtWidth = fontRegular.widthOfTextAtSize(dateStr, subSize);
    pdfPage.drawText(dateStr, {
      x: cx - dtWidth / 2,
      y: cy - 19 * scale,
      size: subSize,
      font: fontRegular,
      color,
      opacity,
    });
    return;
  }

  if (def.shape === 'oval-emblem') {
    const xScale = 96 * scale;
    const yScale = 38 * scale;
    const cx =
      stamp.position === 'center'
        ? width / 2
        : stamp.position === 'bottom-left'
        ? xScale + 40
        : width - xScale - 40;
    const cy =
      stamp.position === 'top-right'
        ? height - yScale - 46
        : stamp.position === 'center'
        ? height / 2
        : yScale + 46;

    pdfPage.drawEllipse({
      x: cx,
      y: cy,
      xScale,
      yScale,
      borderColor: color,
      borderWidth: 2,
      color: rgb(1, 1, 1),
      opacity: opacity * 0.9,
      borderOpacity: opacity,
    });
    pdfPage.drawEllipse({
      x: cx,
      y: cy,
      xScale: xScale - 4 * scale,
      yScale: yScale - 4 * scale,
      borderColor: color,
      borderWidth: 0.9,
      borderOpacity: opacity,
    });

    const lblSize = 10.5 * scale;
    const lblW = fontBold.widthOfTextAtSize(stamp.label, lblSize);
    pdfPage.drawText(stamp.label, {
      x: cx - lblW / 2,
      y: cy + 5 * scale,
      size: lblSize,
      font: fontBold,
      color,
      opacity,
    });

    const meta = `${officerStr} | ${dateStr}`.slice(0, 34);
    const metaSize = 7 * scale;
    const metaW = fontRegular.widthOfTextAtSize(meta, metaSize);
    pdfPage.drawText(meta, {
      x: cx - metaW / 2,
      y: cy - 12 * scale,
      size: metaSize,
      font: fontRegular,
      color,
      opacity,
    });
    return;
  }

  // Default rectangular double-box GoI stamp
  const boxW = 210 * scale;
  const boxH = 68 * scale;
  const bx =
    stamp.position === 'center'
      ? (width - boxW) / 2
      : stamp.position === 'bottom-left'
      ? 42
      : width - boxW - 42;
  const by =
    stamp.position === 'top-right'
      ? height - boxH - 46
      : stamp.position === 'center'
      ? height / 2 - boxH / 2
      : 48;

  pdfPage.drawRectangle({
    x: bx,
    y: by,
    width: boxW,
    height: boxH,
    borderColor: color,
    borderWidth: 2,
    color: rgb(1, 1, 1),
    opacity: opacity * 0.9,
    borderOpacity: opacity,
    rotate: degrees(angleDeg),
  });
  pdfPage.drawRectangle({
    x: bx + 3 * scale,
    y: by + 3 * scale,
    width: boxW - 6 * scale,
    height: boxH - 6 * scale,
    borderColor: color,
    borderWidth: 0.75,
    borderOpacity: opacity,
    rotate: degrees(angleDeg),
  });

  pdfPage.drawText((def.authorityLine || 'GOVERNMENT OF INDIA').slice(0, 38), {
    x: bx + 11 * scale,
    y: by + 50 * scale,
    size: 6.5 * scale,
    font: fontBold,
    color,
    opacity,
    rotate: degrees(angleDeg),
  });

  pdfPage.drawText(stamp.label, {
    x: bx + 11 * scale,
    y: by + 31 * scale,
    size: 11.5 * scale,
    font: fontBold,
    color,
    opacity,
    rotate: degrees(angleDeg),
  });

  const footerLine = refStr
    ? `${officerStr} · ${dateStr} · ${refStr}`
    : `${officerStr} · ${dateStr}`;
  pdfPage.drawText(footerLine.slice(0, 46), {
    x: bx + 11 * scale,
    y: by + 13 * scale,
    size: 7.2 * scale,
    font: fontRegular,
    color,
    opacity,
    rotate: degrees(angleDeg),
  });
}
