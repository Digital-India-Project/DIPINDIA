import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import crypto from 'node:crypto';
import { EStampConfig, SignatureConfig } from '../../src/karta/shared/types';
import { NON_EXECUTED_STATUS_NOTICE } from '../../src/karta/shared/constants';
import { LegalBlock, typesetPlainTextBlocks } from '../../src/karta/shared/legalTypesetter';

export interface ExportPayload {
  title: string;
  templateTitle: string;
  templateVersion: string;
  sourcePath: string;
  jurisdictionState: string;
  executionDate: string;
  isReconstructedFromPdf: boolean;
  disclaimerBanner: string;
  content: string;
  eStamp?: EStampConfig;
  signature?: SignatureConfig;
}

function blockText(block: LegalBlock): string {
  return block.spans.map((s) => s.text).join('');
}

function decodePngDataUrl(dataUrl?: string): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) return null;
  try {
    const b64 = dataUrl.slice('data:image/png;base64,'.length);
    const buf = Buffer.from(b64, 'base64');
    if (
      buf.length > 16 &&
      buf.length < 512 * 1024 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return buf;
    }
  } catch {
    return null;
  }
  return null;
}

export async function buildDocxBuffer(payload: ExportPayload): Promise<Buffer> {
  const blocks = typesetPlainTextBlocks(payload.content);
  const bodyParagraphs: Paragraph[] = [];
  const digest = crypto.createHash('sha256').update(payload.content, 'utf8').digest('hex').slice(0, 16);

  // Optional SHCIL Reference e-Stamp Header Block (12-Field India Non-Judicial Layout)
  if (payload.eStamp && payload.eStamp.mode !== 'none') {
    const isSample = payload.eStamp.mode === 'sample_preview';
    const es = payload.eStamp;
    const stateLabel = es.state || payload.jurisdictionState || 'Karnataka';
    const firstParty = es.purchasedBy || '---';
    const secondParty = es.secondParty || 'Not Applicable';
    const issuedDate = es.purchaseDate || payload.executionDate || '---';
    const certRows: Array<[string, string]> = [
      ['Certificate No.', isSample ? 'SIMULATION-DRAFT-REF' : es.certificateNumber || 'NOT PROVIDED'],
      ['Certificate Issued Date', issuedDate],
      ['Account Reference', es.accountReference || 'DRAFT-ACC-REF (Simulation Layout)'],
      ['Unique Doc. Reference', es.uniqueDocReference || 'DRAFT-UDR-REFERENCE-ONLY'],
      ['Purchased by', firstParty],
      ['Description of Document', es.articleDescription || payload.templateTitle],
      ['Description', es.documentSubDescription || payload.title],
      ['Consideration Price (Rs.)', es.considerationPriceInr ? `${es.considerationPriceInr} (INR)` : '0 (Zero)'],
      ['First Party', firstParty],
      ['Second Party', secondParty],
      ['Stamp Duty Paid By', es.stampDutyPaidBy || firstParty],
      ['Stamp Duty Amount(Rs.)', `${es.denominationInr || '100'}/- (Rupees ${es.denominationInr || '100'} only)`],
    ];

    bodyParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'INDIA NON JUDICIAL\n',
            bold: true,
            size: 20,
            color: '1C1917',
            font: 'Calibri',
          }),
          new TextRun({
            text: `Government of ${stateLabel}\n`,
            bold: true,
            underline: {},
            size: 24,
            color: '1C1917',
            font: 'Calibri',
          }),
          new TextRun({
            text: isSample
              ? 'e-Stamp (SAMPLE REFERENCE LAYOUT ONLY — NOT A VALID GOVERNMENT e-STAMP)'
              : 'e-Stamp Certificate Reference (Verify on shcilestamp.com)',
            bold: true,
            size: 18,
            color: isSample ? '9A3412' : '065F46',
            font: 'Calibri',
          }),
        ],
      })
    );

    for (const [k, v] of certRows) {
      bodyParagraphs.push(
        new Paragraph({
          spacing: { after: k === 'Consideration Price (Rs.)' ? 120 : 30 },
          tabStops: [{ type: TabStopType.LEFT, position: 2900 }],
          children: [
            new TextRun({ text: `${k}\t:  `, bold: false, size: 17, font: 'Calibri', color: '292524' }),
            new TextRun({ text: v, bold: k === 'Certificate No.' || k === 'Stamp Duty Amount(Rs.)', size: 17, font: 'Calibri', color: '1C1917' }),
          ],
        })
      );
    }

    bodyParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 180 },
        border: {
          bottom: { style: BorderStyle.DOTTED, size: 6, color: '57534E' },
        },
        children: [
          new TextRun({
            text: '......................... Please write or type below this line .........................',
            size: 15,
            color: '57534E',
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  // Top Draft Classification Notice
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 120 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: '9A3412' },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '9A3412' },
        left: { style: BorderStyle.SINGLE, size: 6, color: '9A3412' },
        right: { style: BorderStyle.SINGLE, size: 6, color: '9A3412' },
      },
      children: [
        new TextRun({
          text: `${NON_EXECUTED_STATUS_NOTICE}${
            payload.isReconstructedFromPdf
              ? ' [RECONSTRUCTED EDITABLE DOCX FROM SOURCE PDF]'
              : ''
          }`,
          bold: true,
          size: 16,
          color: '7C2D12',
          font: 'Calibri',
        }),
      ],
    })
  );

  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: `Source: ${payload.sourcePath} (v${payload.templateVersion}) | Jurisdiction: ${payload.jurisdictionState} | Date: ${payload.executionDate} | SHA-256: ${digest}`,
          size: 15,
          color: '57534E',
          font: 'Calibri',
        }),
      ],
    })
  );

  // Fallback Formal Instrument Title if raw template prose begins without a title/court caption
  const hasOpeningTitle = blocks
    .slice(0, 3)
    .some((b) => b.kind === 'instrument_title' || b.kind === 'court_caption');
  if (!hasOpeningTitle) {
    bodyParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        spacing: { before: 80, after: 180 },
        border: {
          bottom: { style: BorderStyle.DOUBLE, size: 8, color: 'B8B0A0' },
        },
        children: [
          new TextRun({
            text: payload.title.toUpperCase(),
            bold: true,
            size: 26,
            font: 'Georgia',
            color: '1C1917',
          }),
        ],
      })
    );
  }

  for (const block of blocks) {
    const text = blockText(block);
    if (!text.trim()) continue;

    switch (block.kind) {
      case 'court_caption':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 60, after: 60, line: 276 },
            children: [
              new TextRun({
                text,
                bold: true,
                size: 22,
                font: 'Georgia',
                color: '1B365D',
              }),
            ],
          })
        );
        break;

      case 'instrument_title':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 140, after: 200, line: 288 },
            border: {
              bottom: { style: BorderStyle.DOUBLE, size: 8, color: 'B8B0A0' },
            },
            children: [
              new TextRun({
                text: text.toUpperCase(),
                bold: true,
                size: 26,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
        break;

      case 'cause_versus':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 100, after: 100 },
            children: [
              new TextRun({
                text: '— VERSUS —',
                bold: true,
                italics: true,
                size: 20,
                font: 'Georgia',
                color: '57534E',
              }),
            ],
          })
        );
        break;

      case 'cause_party': {
        const leftText = (block.partyLeft || block.spans).map((s) => s.text).join('').trim();
        const roleText = block.partyRole || '';
        bodyParagraphs.push(
          new Paragraph({
            spacing: { before: 40, after: 60, line: 276 },
            tabStops: [{ type: TabStopType.RIGHT, position: 8640 }],
            children: [
              new TextRun({
                text: `${leftText}\t… ${roleText}`,
                bold: false,
                size: 21,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
        break;
      }

      case 'salutation':
        bodyParagraphs.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 140, after: 100, line: 288 },
            children: [
              new TextRun({
                text,
                bold: true,
                italics: true,
                size: 22,
                font: 'Georgia',
                color: '1B365D',
              }),
            ],
          })
        );
        break;

      case 'section_heading':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 220, after: 120, line: 276 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'D6CEBE' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D6CEBE' },
            },
            children: [
              new TextRun({
                text: text.toUpperCase(),
                bold: true,
                size: 21,
                font: 'Georgia',
                color: '1B365D',
              }),
            ],
          })
        );
        break;

      case 'recital_clause':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 100, after: 120, line: 300 },
            children: [
              ...(block.leadKeyword
                ? [
                    new TextRun({
                      text: `${block.leadKeyword} `,
                      bold: true,
                      size: 22,
                      font: 'Georgia',
                      color: '1B365D',
                    }),
                  ]
                : []),
              new TextRun({
                text,
                size: 22,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
        break;

      case 'numbered_clause':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 520, hanging: 380 },
            spacing: { before: 60, after: 120, line: 300 },
            children: [
              new TextRun({
                text: `${block.clauseMarker || ''}\t`,
                bold: true,
                size: 22,
                font: 'Georgia',
                color: '1B365D',
              }),
              new TextRun({
                text,
                size: 22,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
        break;

      case 'sub_clause':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 960, hanging: 360 },
            spacing: { before: 40, after: 90, line: 288 },
            children: [
              new TextRun({
                text: `${block.clauseMarker || ''}\t`,
                bold: true,
                size: 21,
                font: 'Georgia',
                color: '57534E',
              }),
              new TextRun({
                text,
                size: 21,
                font: 'Georgia',
                color: '292524',
              }),
            ],
          })
        );
        break;

      case 'verification_block':
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 180, after: 120, line: 288 },
            border: {
              top: { style: BorderStyle.DASHED, size: 4, color: 'D6CEBE' },
            },
            children: [
              new TextRun({
                text,
                size: 21,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
        break;

      default:
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 40, after: 110, line: 300 },
            children: [
              new TextRun({
                text,
                size: 22,
                font: 'Georgia',
                color: '1C1917',
              }),
            ],
          })
        );
    }
  }

  // Optional Embedded Draft Signature Area
  const sigPng = decodePngDataUrl(payload.signature?.signatureDataUrl);
  const sigEnabled =
    payload.signature &&
    (payload.signature.enabled ||
      sigPng ||
      payload.signature.signerName ||
      payload.signature.secondPartyName ||
      payload.signature.witness1Name ||
      payload.signature.witness2Name);

  if (sigEnabled && payload.signature) {
    const sig = payload.signature;
    const isTwoParty =
      sig.layoutPreset === 'two_party' ||
      sig.layoutPreset === 'petitioner_advocate' ||
      Boolean(sig.secondPartyName);
    const dateText = sig.signatureDate || payload.executionDate || '__________________';
    const placeText = sig.signedAtPlace || '__________________';
    const includeDates = sig.includeDateLines !== false;

    bodyParagraphs.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 260, after: 100 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '1E3A8A' },
        },
        children: [
          new TextRun({
            text: 'EXECUTION & SIGNATURE BLOCK (DRAFT PLACEHOLDER — NOT AADHAAR e-SIGN / DSC)',
            bold: true,
            size: 16,
            color: '1E3A8A',
            font: 'Calibri',
          }),
        ],
      })
    );

    if (sigPng) {
      bodyParagraphs.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new ImageRun({
              data: sigPng,
              transformation: { width: 165, height: 56 },
              type: 'png',
            }),
          ],
        })
      );
    }

    bodyParagraphs.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `1. ${sig.signerRole || 'Executant'}: ${sig.signerName || '__________________________'}   Signature: ____________________${
              includeDates ? `\n   Date: ${dateText}   |   Place: ${placeText}` : ''
            }`,
            size: 18,
            color: '1C1917',
            font: 'Georgia',
          }),
        ],
      })
    );

    if (isTwoParty) {
      bodyParagraphs.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text: `2. ${sig.secondPartyRole || 'Second Party / Advocate'}: ${
                sig.secondPartyName || '__________________________'
              }   Signature: ____________________${
                includeDates ? `\n   Date: ${dateText}   |   Place: ${placeText}` : ''
              }`,
              size: 18,
              color: '1C1917',
              font: 'Georgia',
            }),
          ],
        })
      );
    }

    if (sig.additionalSignatories && sig.additionalSignatories.length > 0) {
      sig.additionalSignatories.forEach((extra, idx) => {
        bodyParagraphs.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: `${idx + 3}. ${extra.role || 'Additional Party'}: ${
                  extra.name || '__________________________'
                }   Signature: ____________________${
                  includeDates ? `\n   Date: ${dateText}   |   Place: ${placeText}` : ''
                }`,
                size: 18,
                color: '1C1917',
                font: 'Georgia',
              }),
            ],
          })
        );
      });
    }

    const wCount =
      sig.witnessCount ??
      (sig.witness3Name ? 3 : sig.witness1Name || sig.witness2Name ? 2 : 0);
    if (wCount > 0) {
      bodyParagraphs.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text: 'IN PRESENCE OF WITNESSES:',
              bold: true,
              size: 17,
              color: '1C1917',
              font: 'Calibri',
            }),
          ],
        })
      );
      const witnesses = [
        { name: sig.witness1Name, addr: sig.witness1Address },
        { name: sig.witness2Name, addr: sig.witness2Address },
        { name: sig.witness3Name, addr: sig.witness3Address },
      ].slice(0, wCount);
      witnesses.forEach((w, idx) => {
        bodyParagraphs.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `Witness ${idx + 1}: Name: ${w.name || '____________________'}   Address: ${
                  w.addr || '____________________'
                }   Signature: _______________`,
                size: 17,
                color: '1C1917',
                font: 'Georgia',
              }),
            ],
          })
        );
      });
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1320, right: 1260, bottom: 1320, left: 1728 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'UNEXECUTED DRAFT — DIGITAL INDIA LEGAL DOCUMENT PORTAL',
                    size: 15,
                    color: '78716C',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Not notarized, government e-stamped, or registered. Requires Advocate review. Page ',
                    size: 15,
                    color: '78716C',
                    font: 'Calibri',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 15,
                    color: '78716C',
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyParagraphs,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function buildPdfBuffer(payload: ExportPayload): Promise<Buffer> {
  const digest = crypto.createHash('sha256').update(payload.content, 'utf8').digest('hex').slice(0, 16);
  const blocks = typesetPlainTextBlocks(payload.content);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 58, bottom: 58, left: 74, right: 56 },
      bufferPages: true,
      info: {
        Title: payload.title,
        Author: 'Digital India Legal Document Generator (Draft Only)',
        Subject: `Draft generated from ${payload.sourcePath}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - 130; // 74 left, 56 right

    // Optional SHCIL Reference e-Stamp Header Box on Page 1 (12-Field Layout)
    if (payload.eStamp && payload.eStamp.mode !== 'none') {
      const isSample = payload.eStamp.mode === 'sample_preview';
      const es = payload.eStamp;
      const stateLabel = es.state || payload.jurisdictionState || 'Karnataka';
      const firstParty = es.purchasedBy || '---';
      const secondParty = es.secondParty || 'Not Applicable';
      const issuedDate = es.purchaseDate || payload.executionDate || '---';
      const boxTop = doc.y;

      doc
        .rect(74, boxTop, contentWidth, 218)
        .fillAndStroke('#FFFFFF', '#C7BFA9');

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#1C1917')
        .text('INDIA NON JUDICIAL', 84, boxTop + 10, { align: 'center', width: contentWidth - 20 });

      doc
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor('#1C1917')
        .text(`Government of ${stateLabel}`, 84, boxTop + 23, {
          align: 'center',
          width: contentWidth - 20,
          underline: true,
        });

      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(isSample ? '#9A3412' : '#065F46')
        .text(
          isSample
            ? 'e-Stamp (SAMPLE REFERENCE LAYOUT ONLY — NOT GOVT ISSUED)'
            : 'e-Stamp Reference (Verify on shcilestamp.com)',
          84,
          boxTop + 39,
          { align: 'center', width: contentWidth - 20 }
        );

      const certRows: Array<[string, string]> = [
        ['Certificate No.', isSample ? 'SIMULATION-DRAFT-REF' : es.certificateNumber || 'NOT PROVIDED'],
        ['Certificate Issued Date', issuedDate],
        ['Account Reference', es.accountReference || 'DRAFT-ACC-REF (Simulation Layout)'],
        ['Unique Doc. Reference', es.uniqueDocReference || 'DRAFT-UDR-REFERENCE-ONLY'],
        ['Purchased by', firstParty],
        ['Description of Document', es.articleDescription || payload.templateTitle],
        ['Description', es.documentSubDescription || payload.title],
        ['Consideration Price (Rs.)', es.considerationPriceInr ? `${es.considerationPriceInr} (INR)` : '0 (Zero)'],
        ['First Party', firstParty],
        ['Second Party', secondParty],
        ['Stamp Duty Paid By', es.stampDutyPaidBy || firstParty],
        ['Stamp Duty Amount(Rs.)', `${es.denominationInr || '100'}/- (Rupees ${es.denominationInr || '100'} only)`],
      ];

      let rowY = boxTop + 56;
      for (const [k, v] of certRows) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#292524')
          .text(k, 86, rowY, { width: 130 })
          .text(':', 216, rowY, { width: 10 });
        doc
          .font(k === 'Certificate No.' || k === 'Stamp Duty Amount(Rs.)' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8)
          .fillColor('#1C1917')
          .text(v, 228, rowY, { width: contentWidth - 164 });
        rowY += k === 'Consideration Price (Rs.)' ? 16 : 11.5;
      }

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#57534E')
        .text(
          '.......................................... Please write or type below this line ..........................................',
          84,
          boxTop + 203,
          { align: 'center', width: contentWidth - 20 }
        );

      doc.y = boxTop + 228;
      doc.x = 74;
    }

    // Top Draft Banner
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#9A3412')
      .text(
        `${NON_EXECUTED_STATUS_NOTICE}${
          payload.isReconstructedFromPdf ? ' [RECONSTRUCTED FROM SOURCE PDF]' : ''
        }`,
        74,
        doc.y,
        { align: 'left', width: contentWidth }
      );

    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(7.6)
      .fillColor('#57534E')
      .text(
        `Source: ${payload.sourcePath} (v${payload.templateVersion}) · Jurisdiction: ${payload.jurisdictionState} · Date: ${payload.executionDate} · SHA-256: ${digest}`,
        74,
        doc.y,
        { width: contentWidth }
      );

    doc
      .moveDown(0.45)
      .moveTo(74, doc.y)
      .lineTo(74 + contentWidth, doc.y)
      .strokeColor('#D6CEBE')
      .lineWidth(0.75)
      .stroke();
    doc.moveDown(0.75);

    const hasOpeningTitle = blocks
      .slice(0, 3)
      .some((b) => b.kind === 'instrument_title' || b.kind === 'court_caption');
    if (!hasOpeningTitle) {
      doc
        .font('Times-Bold')
        .fontSize(13)
        .fillColor('#1C1917')
        .text(payload.title.toUpperCase(), 74, doc.y, {
          align: 'center',
          width: contentWidth,
        });
      doc
        .moveDown(0.35)
        .moveTo(140, doc.y)
        .lineTo(74 + contentWidth - 66, doc.y)
        .strokeColor('#B8B0A0')
        .lineWidth(0.8)
        .stroke();
      doc.moveDown(0.7);
    }

    for (const block of blocks) {
      const text = blockText(block).trim();
      if (!text) continue;

      // Guard against orphaned headings near page bottom
      if (
        (block.kind === 'section_heading' ||
          block.kind === 'instrument_title' ||
          block.kind === 'salutation') &&
        doc.y > doc.page.height - 135
      ) {
        doc.addPage();
      }

      switch (block.kind) {
        case 'court_caption':
          doc
            .font('Times-Bold')
            .fontSize(11)
            .fillColor('#1B365D')
            .text(text, 74, doc.y, { align: 'center', width: contentWidth, lineGap: 2 });
          doc.moveDown(0.25);
          break;

        case 'instrument_title':
          doc.moveDown(0.25);
          doc
            .font('Times-Bold')
            .fontSize(13)
            .fillColor('#1C1917')
            .text(text.toUpperCase(), 74, doc.y, {
              align: 'center',
              width: contentWidth,
              lineGap: 2,
            });
          doc
            .moveDown(0.3)
            .moveTo(130, doc.y)
            .lineTo(74 + contentWidth - 56, doc.y)
            .strokeColor('#B8B0A0')
            .lineWidth(0.9)
            .stroke();
          doc.moveDown(0.65);
          break;

        case 'cause_versus':
          doc.moveDown(0.2);
          doc
            .font('Times-BoldItalic')
            .fontSize(10.5)
            .fillColor('#57534E')
            .text('— VERSUS —', 74, doc.y, { align: 'center', width: contentWidth });
          doc.moveDown(0.25);
          break;

        case 'cause_party': {
          const leftText = (block.partyLeft || block.spans).map((s) => s.text).join('').trim();
          const roleText = `… ${block.partyRole || ''}`;
          const rowY = doc.y;
          doc
            .font('Times-Roman')
            .fontSize(10.8)
            .fillColor('#1C1917')
            .text(leftText, 74, rowY, { width: contentWidth - 135 });
          const afterLeftY = doc.y;
          doc
            .font('Times-BoldItalic')
            .fontSize(10.5)
            .fillColor('#1B365D')
            .text(roleText, 74 + contentWidth - 130, rowY, {
              width: 130,
              align: 'right',
            });
          doc.y = Math.max(afterLeftY, doc.y);
          doc.x = 74;
          doc.moveDown(0.2);
          break;
        }

        case 'salutation':
          doc.moveDown(0.2);
          doc
            .font('Times-BoldItalic')
            .fontSize(11)
            .fillColor('#1B365D')
            .text(text, 74, doc.y, { width: contentWidth, lineGap: 3 });
          doc.moveDown(0.3);
          break;

        case 'section_heading':
          doc.moveDown(0.4);
          doc
            .moveTo(74, doc.y)
            .lineTo(74 + contentWidth, doc.y)
            .strokeColor('#E5DFD3')
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.35);
          doc
            .font('Times-Bold')
            .fontSize(10.8)
            .fillColor('#1B365D')
            .text(text.toUpperCase(), 74, doc.y, {
              align: 'center',
              width: contentWidth,
            });
          doc
            .moveDown(0.3)
            .moveTo(74, doc.y)
            .lineTo(74 + contentWidth, doc.y)
            .strokeColor('#E5DFD3')
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.45);
          break;

        case 'recital_clause':
          doc
            .font('Times-Bold')
            .fontSize(11)
            .fillColor('#1B365D')
            .text(block.leadKeyword ? `${block.leadKeyword} ` : '', 74, doc.y, {
              continued: true,
              width: contentWidth,
            })
            .font('Times-Roman')
            .fillColor('#1C1917')
            .text(text, { align: 'justify', lineGap: 3.2 });
          doc.moveDown(0.45);
          break;

        case 'numbered_clause': {
          const startY = doc.y;
          doc
            .font('Times-Bold')
            .fontSize(11)
            .fillColor('#1B365D')
            .text(block.clauseMarker || '', 74, startY, { width: 28 });
          doc
            .font('Times-Roman')
            .fontSize(11)
            .fillColor('#1C1917')
            .text(text, 102, startY, {
              width: contentWidth - 28,
              align: 'justify',
              lineGap: 3.2,
            });
          doc.x = 74;
          doc.moveDown(0.4);
          break;
        }

        case 'sub_clause': {
          const startY = doc.y;
          doc
            .font('Times-Bold')
            .fontSize(10.5)
            .fillColor('#57534E')
            .text(block.clauseMarker || '', 102, startY, { width: 24 });
          doc
            .font('Times-Roman')
            .fontSize(10.6)
            .fillColor('#292524')
            .text(text, 126, startY, {
              width: contentWidth - 52,
              align: 'justify',
              lineGap: 3,
            });
          doc.x = 74;
          doc.moveDown(0.32);
          break;
        }

        case 'verification_block':
          doc.moveDown(0.3);
          doc
            .moveTo(74, doc.y)
            .lineTo(74 + contentWidth, doc.y)
            .strokeColor('#D6CEBE')
            .lineWidth(0.5)
            .stroke();
          doc.moveDown(0.35);
          doc
            .font('Times-Roman')
            .fontSize(10.6)
            .fillColor('#1C1917')
            .text(text, 74, doc.y, {
              width: contentWidth,
              align: 'justify',
              lineGap: 3,
            });
          doc.moveDown(0.45);
          break;

        default:
          doc
            .font('Times-Roman')
            .fontSize(11)
            .fillColor('#1C1917')
            .text(text, 74, doc.y, {
              width: contentWidth,
              align: 'justify',
              lineGap: 3.2,
            });
          doc.moveDown(0.42);
      }
    }

    // Optional Embedded Signature Area
    const sigPng = decodePngDataUrl(payload.signature?.signatureDataUrl);
    const sigEnabled =
      payload.signature &&
      (payload.signature.enabled ||
        sigPng ||
        payload.signature.signerName ||
        payload.signature.secondPartyName ||
        payload.signature.witness1Name ||
        payload.signature.witness2Name);

    if (sigEnabled && payload.signature) {
      const sig = payload.signature;
      const isTwoParty =
        sig.layoutPreset === 'two_party' ||
        sig.layoutPreset === 'petitioner_advocate' ||
        Boolean(sig.secondPartyName);
      const dateText = sig.signatureDate || payload.executionDate || '__________________';
      const placeText = sig.signedAtPlace || '__________________';
      const includeDates = sig.includeDateLines !== false;

      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.moveDown(0.9);
      doc
        .moveTo(74, doc.y)
        .lineTo(74 + contentWidth, doc.y)
        .strokeColor('#1E3A8A')
        .lineWidth(0.75)
        .stroke();
      doc.moveDown(0.5);

      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1E3A8A')
        .text('EXECUTION & SIGNATURE BLOCK (DRAFT PLACEHOLDER — NOT AADHAAR e-SIGN / DSC)', 74, doc.y);

      if (sigPng) {
        doc.moveDown(0.3);
        doc.image(sigPng, 74, doc.y, { width: 150, height: 50 });
        doc.y += 54;
      }

      doc
        .font('Times-Roman')
        .fontSize(10)
        .fillColor('#1C1917')
        .text(
          `1. ${sig.signerRole || 'Executant'}: ${sig.signerName || '______________________'}   |   Signature: ______________________`,
          74,
          doc.y + 4
        );
      if (includeDates) {
        doc.text(`   Date: ${dateText}   |   Place: ${placeText}`, 74, doc.y + 2);
      }

      if (isTwoParty) {
        doc.moveDown(0.5);
        doc.text(
          `2. ${sig.secondPartyRole || 'Second Party / Advocate'}: ${
            sig.secondPartyName || '______________________'
          }   |   Signature: ______________________`,
          74,
          doc.y
        );
        if (includeDates) {
          doc.text(`   Date: ${dateText}   |   Place: ${placeText}`, 74, doc.y);
        }
      }

      if (sig.additionalSignatories && sig.additionalSignatories.length > 0) {
        sig.additionalSignatories.forEach((extra, idx) => {
          doc.moveDown(0.5);
          doc.text(
            `${idx + 3}. ${extra.role || 'Additional Party'}: ${
              extra.name || '______________________'
            }   |   Signature: ______________________`,
            74,
            doc.y
          );
          if (includeDates) {
            doc.text(`   Date: ${dateText}   |   Place: ${placeText}`, 74, doc.y);
          }
        });
      }

      const wCount =
        sig.witnessCount ??
        (sig.witness3Name ? 3 : sig.witness1Name || sig.witness2Name ? 2 : 0);
      if (wCount > 0) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(8.5).text('WITNESS ATTESTATION:', 74, doc.y);
        doc.font('Times-Roman').fontSize(9.5);
        const witnesses = [
          { name: sig.witness1Name, addr: sig.witness1Address },
          { name: sig.witness2Name, addr: sig.witness2Address },
          { name: sig.witness3Name, addr: sig.witness3Address },
        ].slice(0, wCount);
        witnesses.forEach((w, idx) => {
          doc.text(
            `Witness ${idx + 1}: ${w.name || '____________________'} (${
              w.addr || 'Address: ____________________'
            })   Sign: ______________`,
            74,
            doc.y
          );
        });
      }
    }

    // Add subtle Advocate Left-Margin Hairline + Page Numbers on every PDF page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .save()
        .moveTo(56, 36)
        .lineTo(56, doc.page.height - 46)
        .strokeColor('#E6C5BE')
        .lineWidth(0.75)
        .stroke()
        .restore();

      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#78716C')
        .text(
          `UNEXECUTED DRAFT — Not notarized / gov e-stamped / legal advice · Page ${i + 1} of ${range.count}`,
          74,
          doc.page.height - 38,
          { align: 'center', width: contentWidth }
        );
    }

    doc.end();
  });
}
