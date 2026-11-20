export interface ClauseContextHints {
  firstParty?: string;
  secondParty?: string;
  jurisdictionState?: string;
  place?: string;
}

export interface LegalClauseTemplate {
  id: string;
  title: string;
  topic:
    | 'Indemnity'
    | 'Force Majeure'
    | 'Termination'
    | 'Dispute & Arbitration'
    | 'Confidentiality'
    | 'Property & Possession'
    | 'Authority & Ratification'
    | 'Verification & Statutory'
    | 'Execution & Boilerplate';
  relevantCategories: string[];
  statutoryBasis: string;
  summary: string;
  presenceKeywords: string[];
  heading: string;
  bodyTemplate: string;
}

export interface SuggestedClauseItem extends LegalClauseTemplate {
  relevanceScore: number;
  isRecommendedForCategory: boolean;
  alreadyPresentInDraft: boolean;
  renderedBody: string;
}

export const LEGAL_CLAUSE_LIBRARY: LegalClauseTemplate[] = [
  {
    id: 'indemnity_general',
    title: 'Indemnity & Hold Harmless',
    topic: 'Indemnity',
    relevantCategories: [
      'Agreements & MoUs',
      'Deeds & Conveyancing',
      'Rent & Lease',
      'Powers of Attorney',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Sections 124 & 125, Indian Contract Act, 1872',
    summary:
      'Protects a party against losses, third-party claims, penalties, or statutory defaults caused by the other party’s breach or misrepresentation.',
    presenceKeywords: ['indemnify', 'indemnity', 'hold harmless', 'save harmless'],
    heading: 'INDEMNITY AND HOLD HARMLESS',
    bodyTemplate:
      '{{FIRST_PARTY}} and {{SECOND_PARTY}} agree that each defaulting Party (the "Indemnifying Party") shall indemnify, defend, and hold harmless the non-defaulting Party (the "Indemnified Party") from and against all direct losses, damages, liabilities, statutory penalties, and reasonable legal costs arising out of any material breach of this instrument, misrepresentation of facts or title, or non-compliance with applicable laws of India, in accordance with Sections 124 and 125 of the Indian Contract Act, 1872.',
  },
  {
    id: 'force_majeure_india',
    title: 'Force Majeure (Vis Major / Act of God)',
    topic: 'Force Majeure',
    relevantCategories: [
      'Agreements & MoUs',
      'Rent & Lease',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Sections 32 & 56, Indian Contract Act, 1872',
    summary:
      'Suspends non-monetary obligations during uncontrollable events (natural calamities, government lockdowns, war) and provides exit after 60 days.',
    presenceKeywords: ['force majeure', 'act of god', 'vis major', 'beyond reasonable control'],
    heading: 'FORCE MAJEURE',
    bodyTemplate:
      'Neither Party shall be liable for any failure or delay in performing its non-monetary obligations hereunder where such failure or delay results from a Force Majeure event beyond the reasonable control of the affected Party, including acts of God, floods, earthquakes, epidemics, war, civil commotion, strikes, or binding orders/notifications of the Central or {{STATE}} State Government. The affected Party shall notify the other Party in writing within seven (7) days of the occurrence. If such Force Majeure event continues uninterrupted for more than sixty (60) days, either Party may terminate this instrument by giving fifteen (15) days prior written notice without further liability other than accrued dues.',
  },
  {
    id: 'termination_notice_cure',
    title: 'Termination for Cause & Convenience',
    topic: 'Termination',
    relevantCategories: [
      'Agreements & MoUs',
      'Rent & Lease',
      'Corporate, IPR & Regulatory',
    ],
    statutoryBasis: 'Sections 39 & 73, Indian Contract Act, 1872',
    summary:
      'Establishes written cure period (15 days) for material breach alongside mutual notice-period termination and post-termination handover.',
    presenceKeywords: ['termination', 'terminate this agreement', 'notice period', 'right to terminate'],
    heading: 'TERMINATION AND CONSEQUENCES',
    bodyTemplate:
      'Either Party may terminate this Agreement: (a) for material breach, if the defaulting Party fails to cure such breach within fifteen (15) days of receiving written notice specifying the breach; or (b) without cause, by serving thirty (30) days prior written notice to the other Party at its address stated herein. Upon termination or expiry, all outstanding undisputed dues shall be settled within fifteen (15) days and all property, keys, records, or confidential materials belonging to the other Party shall be returned forthwith.',
  },
  {
    id: 'arbitration_1996',
    title: 'Arbitration & Conciliation Clause',
    topic: 'Dispute & Arbitration',
    relevantCategories: [
      'Agreements & MoUs',
      'Rent & Lease',
      'Deeds & Conveyancing',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Arbitration and Conciliation Act, 1996 (as amended)',
    summary:
      'Refers unresolved disputes to a sole arbitrator seated in the relevant Indian State under the 1996 Act before court litigation.',
    presenceKeywords: ['arbitration', 'arbitrator', 'conciliation act, 1996', 'sole arbitrator'],
    heading: 'DISPUTE RESOLUTION AND ARBITRATION',
    bodyTemplate:
      'All disputes, differences, or claims arising out of or in connection with this instrument, including its existence, validity, interpretation, or termination, shall first be attempted to be resolved amicably within fifteen (15) days. Failing amicable settlement, the dispute shall be referred to and finally resolved by arbitration by a sole arbitrator mutually appointed by the Parties in accordance with the Arbitration and Conciliation Act, 1996 and the rules framed thereunder. The seat and venue of arbitration shall be at {{PLACE}}, {{STATE}}, and the proceedings shall be conducted in the English language.',
  },
  {
    id: 'governing_law_jurisdiction',
    title: 'Governing Law & Exclusive Court Jurisdiction',
    topic: 'Dispute & Arbitration',
    relevantCategories: [
      'Agreements & MoUs',
      'Deeds & Conveyancing',
      'Rent & Lease',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Section 20, Code of Civil Procedure, 1908',
    summary:
      'Specifies applicability of Indian law and exclusive territorial jurisdiction of courts at the place of execution.',
    presenceKeywords: ['governing law', 'exclusive jurisdiction', 'courts at', 'laws of india'],
    heading: 'GOVERNING LAW AND JURISDICTION',
    bodyTemplate:
      'This instrument shall be governed by, construed, and enforced strictly in accordance with the substantive laws of India. Subject to any applicable arbitration clause herein, the competent civil courts situated at {{PLACE}}, {{STATE}} alone shall have exclusive territorial jurisdiction over any suit, proceeding, or enforcement action arising hereunder.',
  },
  {
    id: 'confidentiality_nda',
    title: 'Confidentiality & Non-Disclosure Covenant',
    topic: 'Confidentiality',
    relevantCategories: [
      'Agreements & MoUs',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Section 27 & Contract Principles; DPDP Act, 2023 alignment',
    summary:
      'Requires both parties to safeguard proprietary business data, personal records, and financial terms during and for 2 years after the term.',
    presenceKeywords: ['confidential', 'confidentiality', 'non-disclosure', 'proprietary information'],
    heading: 'CONFIDENTIALITY AND DATA PROTECTION',
    bodyTemplate:
      'Each Party undertakes to keep strictly confidential all non-public business, financial, technical, and personal information disclosed by the other Party in connection with this instrument and shall not disclose the same to any third party without prior written consent, save as required by a court of competent jurisdiction or statutory authority under Indian law. This obligation of confidentiality shall survive the expiry or earlier termination of this instrument for a period of two (2) years.',
  },
  {
    id: 'lease_deposit_lockin',
    title: 'Security Deposit, Lock-in & Quiet Enjoyment',
    topic: 'Property & Possession',
    relevantCategories: ['Rent & Lease'],
    statutoryBasis: 'Section 108, Transfer of Property Act, 1882 & State Rent Laws',
    summary:
      'Defines interest-free refundable security deposit return timeline upon peaceful vacation and guarantees lawful quiet enjoyment.',
    presenceKeywords: ['quiet enjoyment', 'security deposit', 'peaceful vacant possession', 'lock-in'],
    heading: 'SECURITY DEPOSIT AND QUIET ENJOYMENT',
    bodyTemplate:
      'The Owner/Licensor covenants that upon regular payment of the agreed rent/license fee and observance of covenants herein, the Tenant/Licensee shall peacefully hold and enjoy the demised premises without unlawful interruption. The interest-free refundable security deposit shall be refunded by the Owner/Licensor simultaneously against handover of keys and peaceful vacant possession, after deducting only verified arrears of rent, electricity/water dues, or actual structural damage beyond normal wear and tear.',
  },
  {
    id: 'property_title_encumbrance',
    title: 'Clear Title & Encumbrance-Free Indemnity',
    topic: 'Property & Possession',
    relevantCategories: ['Deeds & Conveyancing', 'Rent & Lease', 'Powers of Attorney'],
    statutoryBasis: 'Sections 54 & 55, Transfer of Property Act, 1882',
    summary:
      'Confirms marketable title free from prior mortgages, court attachments, acquisition notices, or undisclosed litigation.',
    presenceKeywords: ['encumbrance', 'marketable title', 'free from all encumbrances', 'mortgages'],
    heading: 'COVENANT OF TITLE AND NON-ENCUMBRANCE',
    bodyTemplate:
      'The Executant/Transferor hereby represents and warrants that the Scheduled Property is his/her/their absolute property with clear and marketable title, free from all prior sales, mortgages, charges, liens, attachments, court injunctions, or statutory acquisition notices, and that all property taxes and municipal dues up to the date of execution stand duly paid. Should any defect in title or undisclosed encumbrance surface hereafter, the Transferor shall rectify the same at his/her own cost and indemnify the Transferee against all resulting loss.',
  },
  {
    id: 'poa_ratification_revocation',
    title: 'Principal Ratification & Revocation Terms',
    topic: 'Authority & Ratification',
    relevantCategories: ['Powers of Attorney'],
    statutoryBasis: 'Powers-of-Attorney Act, 1882 & Chapter X, Indian Contract Act, 1872',
    summary:
      'Binds the Principal to lawful acts done by the Attorney and clarifies express written revocation & accounting duties.',
    presenceKeywords: ['ratify and confirm', 'revoke', 'revocation', 'true and lawful attorney'],
    heading: 'RATIFICATION, ACCOUNTING, AND REVOCATION',
    bodyTemplate:
      'The Principal hereby agrees to ratify and confirm all lawful acts, deeds, and things done or caused to be done by the said Attorney strictly within the scope of the powers expressly conferred herein. The Attorney shall maintain true and faithful accounts of all receipts and disbursements made on behalf of the Principal and render the same upon demand. This Power of Attorney shall remain valid unless expressly revoked in writing by the Principal (and registered where this instrument is registered), without prejudice to acts lawfully completed prior to notice of revocation.',
  },
  {
    id: 'affidavit_verification_bns',
    title: 'Solemn Verification & Perjury Undertaking',
    topic: 'Verification & Statutory',
    relevantCategories: ['Affidavits', 'Petitions, Plaints & Pleadings'],
    statutoryBasis: 'Order XIX Rule 3 CPC, 1908 & Section 227/229 Bharatiya Nyaya Sanhita, 2023',
    summary:
      'Adds a legally compliant verification clause distinguishing personal knowledge from legal advice/record belief.',
    presenceKeywords: ['solemnly affirm', 'true to my personal knowledge', 'nothing material has been concealed'],
    heading: 'VERIFICATION',
    bodyTemplate:
      'Verified at {{PLACE}}, {{STATE}} on this execution date that the contents of the above paragraphs are true and correct to my personal knowledge and belief derived from official records, no part of it is false, and nothing material has been concealed therefrom. I am aware that making a false statement or declaration is punishable under applicable provisions of the Bharatiya Nyaya Sanhita, 2023.',
  },
  {
    id: 'ni138_demand_notice_clause',
    title: 'Section 138 NI Act 15-Day Statutory Demand',
    topic: 'Verification & Statutory',
    relevantCategories: ['Legal Notices'],
    statutoryBasis: 'Section 138 Proviso (b) & (c), Negotiable Instruments Act, 1881',
    summary:
      'Sets the mandatory 15-day statutory repayment window before filing a criminal complaint u/s 138 NI Act or civil recovery.',
    presenceKeywords: ['within 15 days', 'fifteen (15) days', 'section 138', 'negotiable instruments'],
    heading: 'STATUTORY DEMAND NOTICE (15 DAYS)',
    bodyTemplate:
      'You are hereby called upon under Section 138 of the Negotiable Instruments Act, 1881 to make full payment of the dishonoured instrument/outstanding sum together with applicable interest and notice charges within fifteen (15) days from the date of receipt of this Notice, failing which my Client shall be constrained to initiate appropriate criminal prosecution under Section 138 of the Negotiable Instruments Act, 1881 and/or civil recovery proceedings in the competent court at your sole risk, cost, and consequences.',
  },
  {
    id: 'will_residuary_revocation',
    title: 'Prior Will Revocation & Residuary Estate',
    topic: 'Verification & Statutory',
    relevantCategories: ['Wills & Family Law'],
    statutoryBasis: 'Sections 59, 63 & 70, Indian Succession Act, 1925',
    summary:
      'Expressly revokes all prior testamentary writings and disposes of residual movable/immovable assets to avoid partial intestacy.',
    presenceKeywords: ['revoke all former wills', 'residuary', 'last will and testament', 'sound mind'],
    heading: 'REVOCATION OF FORMER WILLS AND RESIDUARY CLAUSE',
    bodyTemplate:
      'I hereby revoke all former Wills, Codicils, and testamentary dispositions heretofore made by me at any time. All other movable or immovable properties, bank balances, investments, or actionable claims belonging to me at the time of my demise and not specifically bequeathed hereinabove ("Residuary Estate") shall devolve absolutely upon my designated residuary beneficiary named in this Will. I execute this instrument of my own free will while in sound disposing state of mind without coercion or undue influence.',
  },
  {
    id: 'it_act_electronic_execution',
    title: 'Electronic Execution & Counterparts (IT Act)',
    topic: 'Execution & Boilerplate',
    relevantCategories: [
      'Agreements & MoUs',
      'Corporate, IPR & Regulatory',
      'GST, Income Tax & Finance',
    ],
    statutoryBasis: 'Sections 4, 5 & 10A, Information Technology Act, 2000',
    summary:
      'Recognises execution in counterparts and electronic/Aadhaar eSign validity for contracts not excluded under First Schedule of IT Act.',
    presenceKeywords: ['counterparts', 'information technology act', 'electronic signature', '10a'],
    heading: 'COUNTERPARTS AND ELECTRONIC EXECUTION',
    bodyTemplate:
      'This Agreement may be executed in one or more counterparts, each of which when executed shall be deemed an original, and all of which together shall constitute one and the same instrument. Where permitted under Section 10A and the First Schedule of the Information Technology Act, 2000 (excluding negotiable instruments, powers of attorney, trusts, wills, and contracts for sale/conveyance of immovable property requiring physical/registered execution), execution via electronic or digital signatures shall be fully valid and binding.',
  },
  {
    id: 'severability_entire_agreement',
    title: 'Severability & Entire Agreement',
    topic: 'Execution & Boilerplate',
    relevantCategories: [
      'Agreements & MoUs',
      'Rent & Lease',
      'Corporate, IPR & Regulatory',
      'Deeds & Conveyancing',
    ],
    statutoryBasis: 'Sections 24 & 57, Indian Contract Act, 1872',
    summary:
      'Ensures invalidity of one severable clause does not void the whole instrument and supersedes prior oral discussions.',
    presenceKeywords: ['severability', 'entire agreement', 'supersedes all prior', 'invalid or unenforceable'],
    heading: 'SEVERABILITY AND ENTIRE INSTRUMENT',
    bodyTemplate:
      'If any provision of this instrument is held by a court or arbitral tribunal of competent jurisdiction to be invalid, illegal, or unenforceable under Indian law, such provision shall be severed or modified to the minimum extent necessary, and the validity and enforceability of the remaining provisions shall not be affected or impaired. This instrument constitutes the entire understanding between the Parties regarding its subject matter and supersedes all prior oral or written negotiations.',
  },
];

function interpolateClauseBody(template: string, hints: ClauseContextHints): string {
  const p1 = hints.firstParty?.trim() || '[First Party / Executant]';
  const p2 = hints.secondParty?.trim() || '[Second Party / Counterparty]';
  const st = hints.jurisdictionState?.trim() || '[State / Jurisdiction]';
  const pl = hints.place?.trim() || '[City / Place]';

  return template
    .replace(/\{\{FIRST_PARTY\}\}/g, p1)
    .replace(/\{\{SECOND_PARTY\}\}/g, p2)
    .replace(/\{\{STATE\}\}/g, st)
    .replace(/\{\{PLACE\}\}/g, pl);
}

export function getSuggestedClausesForDocument(params: {
  categoryGroup: string;
  rawCategory?: string;
  title?: string;
  content: string;
  hints: ClauseContextHints;
}): SuggestedClauseItem[] {
  const lowerContent = params.content.toLowerCase();
  const titleCat = `${params.title || ''} ${params.rawCategory || ''}`.toLowerCase();

  return LEGAL_CLAUSE_LIBRARY.map((clause) => {
    const isCategoryMatch = clause.relevantCategories.includes(params.categoryGroup);
    const alreadyPresent = clause.presenceKeywords.some((kw) => lowerContent.includes(kw));

    let relevanceScore = isCategoryMatch ? 60 : 15;

    // Boost specific high-value clauses based on title/category nuance
    if (
      (clause.id === 'lease_deposit_lockin' || clause.id === 'property_title_encumbrance') &&
      /(?:lease|rent|license|sale|conveyance|property|flat|plot)/i.test(titleCat)
    ) {
      relevanceScore += 30;
    }
    if (
      clause.id === 'ni138_demand_notice_clause' &&
      /(?:138|cheque|dishonour|negotiable|recovery)/i.test(titleCat)
    ) {
      relevanceScore += 40;
    }
    if (
      clause.id === 'poa_ratification_revocation' &&
      params.categoryGroup === 'Powers of Attorney'
    ) {
      relevanceScore += 35;
    }
    if (clause.id === 'affidavit_verification_bns' && params.categoryGroup === 'Affidavits') {
      relevanceScore += 35;
    }
    if (clause.id === 'will_residuary_revocation' && /will|codicil|testament/i.test(titleCat)) {
      relevanceScore += 40;
    }
    if (
      (clause.id === 'indemnity_general' ||
        clause.id === 'force_majeure_india' ||
        clause.id === 'termination_notice_cure') &&
      params.categoryGroup === 'Agreements & MoUs'
    ) {
      relevanceScore += 25;
    }

    // Slightly prioritize missing recommended clauses over ones already present
    if (!alreadyPresent && isCategoryMatch) {
      relevanceScore += 20;
    }

    return {
      ...clause,
      relevanceScore,
      isRecommendedForCategory: isCategoryMatch,
      alreadyPresentInDraft: alreadyPresent,
      renderedBody: interpolateClauseBody(clause.bodyTemplate, params.hints),
    };
  }).sort((a, b) => {
    if (a.alreadyPresentInDraft !== b.alreadyPresentInDraft) {
      return a.alreadyPresentInDraft ? 1 : -1;
    }
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Injects a clause cleanly into an existing legal draft:
 * - Detects the highest top-level numbered clause (e.g. 1., 2., 5.) so the injected
 *   clause continues the exact sequential numbering (6. HEADING: ...).
 * - Inserts cleanly right before terminal execution sections (IN WITNESS WHEREOF,
 *   THE SCHEDULE, VERIFICATION, PRAYER, WITNESSES) if found, otherwise appends at the end.
 */
export function injectClauseIntoDraft(
  currentContent: string,
  heading: string,
  body: string
): { nextContent: string; assignedNumber: number | null } {
  const normalized = currentContent.replace(/\r\n/g, '\n');

  // Find terminal anchor line where operative clauses end
  const anchorRegex =
    /\n\s*(?:IN\s+WITNESS\s+WHEREOF\b|THE\s+SCHEDULE(?:\s+ABOVE\s+REFERRED\s+TO)?\b|SCHEDULE\s+OF\s+PROPERTY\b|VERIFICATION\b|PRAYER\b|WITNESSES\s*:|SIGNED\s+AND\s+DELIVERED\b|ADDITIONAL\s+PARTIES\s+SCHEDULE\b|ADDITIONAL\s+WITNESS\s+ATTESTATION\b)/i;

  const anchorMatch = anchorRegex.exec(normalized);
  const scanRange = anchorMatch ? normalized.slice(0, anchorMatch.index) : normalized;

  // Detect existing sequential top-level numbered clauses
  const numMatches = Array.from(scanRange.matchAll(/(?:^|\n)\s*(\d{1,2})\.\s+[A-Za-z]/g));
  let maxClauseNum = 0;
  for (const m of numMatches) {
    const n = parseInt(m[1], 10);
    if (n > maxClauseNum && n < 60) {
      maxClauseNum = n;
    }
  }

  const isVerificationHeading = /^VERIFICATION$/i.test(heading.trim());
  const assignedNumber = !isVerificationHeading && maxClauseNum > 0 ? maxClauseNum + 1 : null;

  const formattedClause = isVerificationHeading
    ? `${heading.toUpperCase()}\n\n${body.trim()}`
    : assignedNumber !== null
    ? `${assignedNumber}. ${heading.toUpperCase()}: ${body.trim()}`
    : `${heading.toUpperCase()}:\n${body.trim()}`;

  if (anchorMatch && !isVerificationHeading) {
    const before = normalized.slice(0, anchorMatch.index).trimEnd();
    const after = normalized.slice(anchorMatch.index).replace(/^\n+/, '');
    return {
      nextContent: `${before}\n\n${formattedClause}\n\n${after}`,
      assignedNumber,
    };
  }

  return {
    nextContent: `${normalized.trimEnd()}\n\n${formattedClause}\n`,
    assignedNumber,
  };
}
