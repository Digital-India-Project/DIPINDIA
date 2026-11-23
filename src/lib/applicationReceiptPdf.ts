import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Application, BusinessSettings } from '../types';
import { getApplicationProgress, resolveApplicationVisualState } from './workflow';

const SOURCE_LABELS: Record<string, string> = {
  web_b2c: 'Web B2C Portal',
  b2b_portal: 'B2B Corporate Portal',
  operator_assisted: 'Operator Desk Assisted',
  partner_assisted: 'Authorized Partner Assisted',
  google_forms: 'Google Forms Intake',
  admin_manual: 'Admin Manual Entry',
};

/**
 * Normalizes text for PDF WinAnsi encoding so rupee signs, dashes, bullets,
 * and non-ASCII characters never trigger encoding exceptions inside pdf-lib.
 */
export function toWinAnsiSafe(value: unknown): string {
  const raw = String(value ?? '');
  return raw
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022|\u00B7/g, '|')
    .replace(/\u2192/g, '->')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatInrSafe(amount: number | undefined): string {
  const num = Number(amount || 0);
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateSafe(iso?: string): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toWinAnsiSafe(iso);
  return toWinAnsiSafe(
    d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  );
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = toWinAnsiSafe(text);
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
      } else {
        // Hard-break long unbroken tokens such as order IDs / URLs
        let slice = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(slice + ch, fontSize) > maxWidth && slice) {
            lines.push(slice);
            slice = ch;
          } else {
            slice += ch;
          }
        }
        current = slice;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export async function generateApplicationReceiptPdf(
  application: Application,
  businessSettings?: Partial<BusinessSettings>
): Promise<{
  bytes: Uint8Array;
  blob: Blob;
  filename: string;
}> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const [pageWidth, pageHeight] = PageSizes.A4;
  const contentWidth = pageWidth - margin * 2;
  const footerReserved = 52;

  const slate900 = rgb(0.059, 0.09, 0.165);
  const slate700 = rgb(0.2, 0.255, 0.333);
  const slate500 = rgb(0.392, 0.455, 0.545);
  const slate200 = rgb(0.886, 0.91, 0.941);
  const slate50 = rgb(0.973, 0.98, 0.988);
  const brandOrange = rgb(1, 0.404, 0.122);
  const darkHeader = rgb(0.098, 0.137, 0.216);

  const visual = resolveApplicationVisualState(application.status);
  const progress = getApplicationProgress(application.status);
  const accentColor = rgb(...visual.pdfAccentRgb);
  const badgeBgColor = rgb(...visual.pdfBgRgb);
  const badgeTextColor = rgb(...visual.pdfTextRgb);

  const pages: PDFPage[] = [];
  let page = pdf.addPage(PageSizes.A4);
  pages.push(page);
  let y = pageHeight - 36;

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < footerReserved) {
      page = pdf.addPage(PageSizes.A4);
      pages.push(page);
      y = pageHeight - 40;
    }
  };

  const drawSectionHeading = (title: string) => {
    ensureSpace(26);
    y -= 6;
    page.drawText(toWinAnsiSafe(title.toUpperCase()), {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: slate700,
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.75,
      color: slate200,
    });
    y -= 14;
  };

  // ---------------------------------------------------
  // 1. CORPORATE HEADER BAND
  // ---------------------------------------------------
  const headerH = 84;
  page.drawRectangle({
    x: 0,
    y: pageHeight - headerH,
    width: pageWidth,
    height: headerH,
    color: darkHeader,
  });
  page.drawRectangle({
    x: 0,
    y: pageHeight - headerH,
    width: pageWidth,
    height: 3,
    color: brandOrange,
  });

  const orgName = toWinAnsiSafe(
    businessSettings?.legalName || businessSettings?.tradeName || 'Digital India Project'
  );
  const regMetaParts = [
    businessSettings?.gstin ? `GSTIN: ${businessSettings.gstin}` : 'GSTIN: 26EXIPK0151F1ZQ',
    businessSettings?.udyamNumber ? `UDYAM: ${businessSettings.udyamNumber}` : '',
    businessSettings?.supportPhone ? `Helpline: ${businessSettings.supportPhone}` : '',
  ].filter(Boolean);

  page.drawText(orgName, {
    x: margin,
    y: pageHeight - 32,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(toWinAnsiSafe(regMetaParts.join('  |  ')), {
    x: margin,
    y: pageHeight - 49,
    size: 8.5,
    font: regular,
    color: rgb(0.82, 0.86, 0.91),
  });
  if (businessSettings?.registeredAddress || businessSettings?.supportEmail) {
    const line2 = [
      businessSettings?.registeredAddress,
      businessSettings?.supportEmail ? `Support: ${businessSettings.supportEmail}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    const wrappedAddr = wrapTextLines(line2, regular, 8, contentWidth - 190);
    page.drawText(wrappedAddr[0] || '', {
      x: margin,
      y: pageHeight - 63,
      size: 8,
      font: regular,
      color: rgb(0.7, 0.76, 0.84),
    });
  }

  const rightTitle = 'APPLICATION STATUS RECEIPT';
  const rtW = bold.widthOfTextAtSize(rightTitle, 11);
  page.drawText(rightTitle, {
    x: pageWidth - margin - rtW,
    y: pageHeight - 32,
    size: 11,
    font: bold,
    color: rgb(1, 0.65, 0.42),
  });
  const receiptRef = toWinAnsiSafe(`Ref: ${application.id}`);
  const refW = bold.widthOfTextAtSize(receiptRef, 9.5);
  page.drawText(receiptRef, {
    x: pageWidth - margin - refW,
    y: pageHeight - 48,
    size: 9.5,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const generatedLabel = toWinAnsiSafe(`Printed: ${formatDateSafe(new Date().toISOString())}`);
  const genW = regular.widthOfTextAtSize(generatedLabel, 8);
  page.drawText(generatedLabel, {
    x: pageWidth - margin - genW,
    y: pageHeight - 62,
    size: 8,
    font: regular,
    color: rgb(0.75, 0.8, 0.87),
  });

  y = pageHeight - headerH - 18;

  // ---------------------------------------------------
  // 2. COLOR-CODED APPLICATION STATUS BANNER
  // ---------------------------------------------------
  const serviceLines = wrapTextLines(application.serviceName, bold, 12.5, contentWidth - 175);
  const bannerHeight = Math.max(76, 48 + serviceLines.length * 15);
  ensureSpace(bannerHeight + 10);

  page.drawRectangle({
    x: margin,
    y: y - bannerHeight,
    width: contentWidth,
    height: bannerHeight,
    color: badgeBgColor,
    borderColor: accentColor,
    borderWidth: 1.25,
  });

  page.drawText(toWinAnsiSafe(`APPLICATION ID: ${application.id}`), {
    x: margin + 14,
    y: y - 18,
    size: 9.5,
    font: bold,
    color: badgeTextColor,
  });

  let sy = y - 35;
  for (const line of serviceLines) {
    page.drawText(line, {
      x: margin + 14,
      y: sy,
      size: 12.5,
      font: bold,
      color: slate900,
    });
    sy -= 15;
  }

  const stageInfo = toWinAnsiSafe(
    `Stage: ${visual.stageLabel}  |  Workflow Progress: ${progress.percent}%  |  Updated: ${formatDateSafe(
      application.updatedAt || application.submissionDate
    )}`
  );
  page.drawText(stageInfo, {
    x: margin + 14,
    y: y - bannerHeight + 12,
    size: 8.5,
    font: regular,
    color: slate700,
  });

  // Status Pill Box inside banner right side
  const pillLabel = toWinAnsiSafe(visual.label.toUpperCase());
  const pillTextW = bold.widthOfTextAtSize(pillLabel, 10);
  const pillW = Math.max(94, pillTextW + 24);
  const pillH = 26;
  const pillX = pageWidth - margin - 14 - pillW;
  const pillY = y - 38;
  page.drawRectangle({
    x: pillX,
    y: pillY,
    width: pillW,
    height: pillH,
    color: accentColor,
  });
  page.drawText(pillLabel, {
    x: pillX + (pillW - pillTextW) / 2,
    y: pillY + 9,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  y -= bannerHeight + 16;

  // ---------------------------------------------------
  // 3. APPLICANT & FILING METADATA GRID
  // ---------------------------------------------------
  drawSectionHeading('Applicant & Processing Details');

  const metaRows: Array<[string, string, string, string]> = [
    [
      'Applicant Name',
      toWinAnsiSafe(application.userName || 'N/A'),
      'Submission Date',
      formatDateSafe(application.submissionDate),
    ],
    [
      'Mobile Number',
      toWinAnsiSafe(application.userMobile || 'N/A'),
      'Source Channel',
      toWinAnsiSafe(SOURCE_LABELS[application.sourceChannel || 'web_b2c'] || 'Web Portal'),
    ],
    [
      'Email Address',
      toWinAnsiSafe(application.userEmail || 'N/A'),
      'Assigned Officer',
      toWinAnsiSafe(application.assignedOperatorName || 'Pending Desk Assignment'),
    ],
    [
      'Filing Mode',
      toWinAnsiSafe(application.filingMode === 'assisted' ? 'Operator / Partner Assisted' : 'Self-Filed Online'),
      'SLA / Reference',
      toWinAnsiSafe(application.partnerName ? `Partner: ${application.partnerName}` : application.consentId || application.id),
    ],
  ];

  const colW = contentWidth / 2 - 6;
  for (const [lLabel, lVal, rLabel, rVal] of metaRows) {
    ensureSpace(28);
    page.drawRectangle({
      x: margin,
      y: y - 22,
      width: colW,
      height: 24,
      color: slate50,
      borderColor: slate200,
      borderWidth: 0.6,
    });
    page.drawRectangle({
      x: margin + colW + 12,
      y: y - 22,
      width: colW,
      height: 24,
      color: slate50,
      borderColor: slate200,
      borderWidth: 0.6,
    });

    page.drawText(toWinAnsiSafe(lLabel), {
      x: margin + 8,
      y: y - 9,
      size: 7.5,
      font: regular,
      color: slate500,
    });
    page.drawText(wrapTextLines(lVal, bold, 9, colW - 16)[0], {
      x: margin + 8,
      y: y - 19,
      size: 9,
      font: bold,
      color: slate900,
    });

    page.drawText(toWinAnsiSafe(rLabel), {
      x: margin + colW + 20,
      y: y - 9,
      size: 7.5,
      font: regular,
      color: slate500,
    });
    page.drawText(wrapTextLines(rVal, bold, 9, colW - 16)[0], {
      x: margin + colW + 20,
      y: y - 19,
      size: 9,
      font: bold,
      color: slate900,
    });

    y -= 28;
  }

  y -= 8;

  // ---------------------------------------------------
  // 4. PAYMENT & FEE SUMMARY TABLE
  // ---------------------------------------------------
  drawSectionHeading('Fee & Payment Summary');

  const p = application.payment || {
    orderId: 'N/A',
    amount: 0,
    govtFee: 0,
    totalAmount: 0,
    status: 'Pending' as const,
  };

  const feeRows: Array<{ desc: string; value: string; isTotal?: boolean }> = [
    { desc: 'Professional / Service Fee', value: formatInrSafe(p.amount) },
    { desc: 'Government / Statutory Fee', value: formatInrSafe(p.govtFee) },
  ];
  if (Number(p.thirdPartyFee || 0) > 0) {
    feeRows.push({ desc: 'Third-Party / Pass-Through Fee', value: formatInrSafe(p.thirdPartyFee) });
  }
  if (Number(p.additionalCharge || 0) > 0) {
    feeRows.push({ desc: 'Additional Service Charges', value: formatInrSafe(p.additionalCharge) });
  }
  if (Number(p.urgentFee || 0) > 0) {
    feeRows.push({ desc: 'Priority Processing Fee', value: formatInrSafe(p.urgentFee) });
  }
  if (Number(p.taxAmount || 0) > 0) {
    feeRows.push({ desc: 'Applicable GST / Taxes', value: formatInrSafe(p.taxAmount) });
  }
  if (Number(p.discountAmount || 0) > 0) {
    feeRows.push({
      desc: `Promo / Coupon Discount${p.couponCode ? ` (${p.couponCode})` : ''}`,
      value: `- ${formatInrSafe(p.discountAmount)}`,
    });
  }
  feeRows.push({
    desc: `Total Amount (${toWinAnsiSafe(p.status)})`,
    value: formatInrSafe(p.totalAmount),
    isTotal: true,
  });

  ensureSpace(22);
  page.drawRectangle({
    x: margin,
    y: y - 18,
    width: contentWidth,
    height: 18,
    color: darkHeader,
  });
  page.drawText('FEE COMPONENT / DESCRIPTION', {
    x: margin + 10,
    y: y - 12,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const amtHeaderW = bold.widthOfTextAtSize('AMOUNT (INR)', 8);
  page.drawText('AMOUNT (INR)', {
    x: pageWidth - margin - 10 - amtHeaderW,
    y: y - 12,
    size: 8,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y -= 18;

  for (const row of feeRows) {
    ensureSpace(20);
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 18,
      color: row.isTotal ? badgeBgColor : rgb(1, 1, 1),
      borderColor: slate200,
      borderWidth: 0.5,
    });
    page.drawText(toWinAnsiSafe(row.desc), {
      x: margin + 10,
      y: y - 12,
      size: row.isTotal ? 9.5 : 8.5,
      font: row.isTotal ? bold : regular,
      color: row.isTotal ? slate900 : slate700,
    });
    const valFont = row.isTotal ? bold : regular;
    const valSize = row.isTotal ? 9.5 : 8.5;
    const valW = valFont.widthOfTextAtSize(row.value, valSize);
    page.drawText(row.value, {
      x: pageWidth - margin - 10 - valW,
      y: y - 12,
      size: valSize,
      font: valFont,
      color: row.isTotal ? badgeTextColor : slate900,
    });
    y -= 18;
  }

  ensureSpace(22);
  const paymentMetaLine = toWinAnsiSafe(
    `Order ID: ${p.orderId || 'N/A'}  |  Transaction Ref: ${p.cfPaymentId || 'N/A'}  |  Method: ${
      p.paymentMethod || 'Online Checkout'
    }${p.invoiceNumber ? `  |  Invoice: ${p.invoiceNumber}` : ''}`
  );
  const paymentMetaLines = wrapTextLines(paymentMetaLine, regular, 8, contentWidth);
  y -= 12;
  for (const line of paymentMetaLines) {
    ensureSpace(12);
    page.drawText(line, {
      x: margin,
      y,
      size: 8,
      font: regular,
      color: slate500,
    });
    y -= 11;
  }

  // ---------------------------------------------------
  // 5. LATEST DESK REMARK (IF PRESENT)
  // ---------------------------------------------------
  if (application.customerRemarks) {
    drawSectionHeading('Latest Desk Remark');
    const remarkLines = wrapTextLines(application.customerRemarks, regular, 9, contentWidth - 20);
    const boxH = Math.max(28, remarkLines.length * 13 + 14);
    ensureSpace(boxH + 8);
    page.drawRectangle({
      x: margin,
      y: y - boxH,
      width: contentWidth,
      height: boxH,
      color: slate50,
      borderColor: slate200,
      borderWidth: 0.75,
    });
    let ry = y - 14;
    for (const rl of remarkLines) {
      page.drawText(rl, {
        x: margin + 10,
        y: ry,
        size: 9,
        font: regular,
        color: slate900,
      });
      ry -= 13;
    }
    y -= boxH + 10;
  }

  // ---------------------------------------------------
  // 6. SUBMITTED SUPPORTING DOCUMENTS
  // ---------------------------------------------------
  if (application.documents && application.documents.length > 0) {
    drawSectionHeading(`Submitted Documents (${application.documents.length})`);
    for (const docItem of application.documents) {
      ensureSpace(20);
      page.drawRectangle({
        x: margin,
        y: y - 17,
        width: contentWidth,
        height: 17,
        color: rgb(1, 1, 1),
        borderColor: slate200,
        borderWidth: 0.5,
      });
      const leftText = wrapTextLines(
        `${docItem.documentType} (${docItem.fileName})`,
        regular,
        8.5,
        contentWidth - 130
      )[0];
      page.drawText(leftText, {
        x: margin + 8,
        y: y - 11.5,
        size: 8.5,
        font: regular,
        color: slate900,
      });
      const st = toWinAnsiSafe(docItem.verificationStatus || 'Pending');
      const stW = bold.widthOfTextAtSize(st, 8);
      page.drawText(st, {
        x: pageWidth - margin - 8 - stW,
        y: y - 11.5,
        size: 8,
        font: bold,
        color:
          st === 'Verified'
            ? rgb(0.075, 0.533, 0.031)
            : st === 'Rejected' || st === 'Re-upload Requested'
            ? rgb(0.745, 0.071, 0.235)
            : rgb(0.573, 0.251, 0.055),
      });
      y -= 17;
    }
    y -= 8;
  }

  // ---------------------------------------------------
  // 7. CHRONOLOGICAL STATUS HISTORY TIMELINE
  // ---------------------------------------------------
  if (application.statusHistory && application.statusHistory.length > 0) {
    drawSectionHeading('Application Lifecycle Timeline');
    for (const entry of application.statusHistory) {
      const msgLines = wrapTextLines(entry.customerMessage || '', regular, 8.5, contentWidth - 26);
      const itemH = 16 + msgLines.length * 11.5;
      ensureSpace(itemH + 4);

      page.drawCircle({
        x: margin + 5,
        y: y - 5,
        size: 2.8,
        color: brandOrange,
      });

      const titleText = toWinAnsiSafe(
        `${entry.newStatus}${entry.previousStatus && entry.previousStatus !== entry.newStatus ? ` (from ${entry.previousStatus})` : ''}`
      );
      page.drawText(titleText, {
        x: margin + 15,
        y: y - 8,
        size: 9,
        font: bold,
        color: slate900,
      });

      const tsLabel = formatDateSafe(entry.timestamp);
      const tsW = regular.widthOfTextAtSize(tsLabel, 7.5);
      page.drawText(tsLabel, {
        x: pageWidth - margin - tsW,
        y: y - 8,
        size: 7.5,
        font: regular,
        color: slate500,
      });

      let ty = y - 20;
      for (const ml of msgLines) {
        page.drawText(ml, {
          x: margin + 15,
          y: ty,
          size: 8.5,
          font: regular,
          color: slate700,
        });
        ty -= 11.5;
      }
      y -= itemH + 6;
    }
  }

  // ---------------------------------------------------
  // 8. CONSISTENT PRINTABLE FOOTER ACROSS ALL PAGES
  // ---------------------------------------------------
  const totalPages = pages.length;
  pages.forEach((pg, index) => {
    pg.drawLine({
      start: { x: margin, y: 38 },
      end: { x: pageWidth - margin, y: 38 },
      thickness: 0.6,
      color: slate200,
    });
    pg.drawText(
      toWinAnsiSafe(
        `Official printable status receipt generated by ${orgName}. Verify live status anytime using ID ${application.id}.`
      ),
      {
        x: margin,
        y: 24,
        size: 7.5,
        font: regular,
        color: slate500,
      }
    );
    const pageStr = `Page ${index + 1} of ${totalPages}`;
    const pgW = bold.widthOfTextAtSize(pageStr, 7.5);
    pg.drawText(pageStr, {
      x: pageWidth - margin - pgW,
      y: 24,
      size: 7.5,
      font: bold,
      color: slate700,
    });
  });

  const bytes = await pdf.save();
  const safeCopy = new Uint8Array(bytes.byteLength);
  safeCopy.set(bytes);
  const blob = new Blob([safeCopy], { type: 'application/pdf' });
  const safeId = toWinAnsiSafe(application.id || 'application').replace(/[^A-Za-z0-9_-]/g, '-');
  const filename = `DIP-Receipt-${safeId}.pdf`;

  return { bytes, blob, filename };
}

export async function downloadApplicationReceiptPdf(
  application: Application,
  businessSettings?: Partial<BusinessSettings>
): Promise<string> {
  const { blob, filename } = await generateApplicationReceiptPdf(application, businessSettings);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  return filename;
}
