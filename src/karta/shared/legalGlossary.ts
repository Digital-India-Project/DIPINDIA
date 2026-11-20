export interface LegalGlossaryEntry {
  id: string;
  term: string;
  aliases: string[];
  category:
    | 'Contract & Liability'
    | 'Property & Conveyancing'
    | 'Litigation & Court'
    | 'Execution & Stamp Law'
    | 'Wills & Succession';
  plainEnglish: string;
  indianContext: string;
}

export const INDIAN_LEGAL_GLOSSARY: LegalGlossaryEntry[] = [
  {
    id: 'indemnity',
    term: 'Indemnity / Indemnify',
    aliases: ['indemnify', 'indemnity', 'indemnified', 'indemnifying', 'hold harmless'],
    category: 'Contract & Liability',
    plainEnglish:
      'A binding promise by one party to compensate the other party for any financial loss, penalty, or third-party legal claim.',
    indianContext:
      'Governed by Sections 124 and 125 of the Indian Contract Act, 1872.',
  },
  {
    id: 'force_majeure',
    term: 'Force Majeure',
    aliases: ['force majeure', 'vis major', 'act of god'],
    category: 'Contract & Liability',
    plainEnglish:
      'Unforeseeable, extraordinary events beyond either party’s control (like floods, wars, or statutory lockdowns) that temporarily excuse performance.',
    indianContext:
      'Interpreted under Section 32 (contingent contract) or Section 56 (frustration of contract) of the Indian Contract Act, 1872.',
  },
  {
    id: 'hereinafter',
    term: 'Hereinafter',
    aliases: ['hereinafter'],
    category: 'Contract & Liability',
    plainEnglish:
      'A formal shorthand meaning "from this point onward in this document" — usually introducing a shorter defined label like "the Licensor".',
    indianContext:
      'Standard drafting convention in Indian deeds and contracts to avoid repeating full names and addresses.',
  },
  {
    id: 'aforesaid',
    term: 'Aforesaid / Heretofore',
    aliases: ['aforesaid', 'aforementioned', 'heretofore', 'hereinabove', 'hereinbelow'],
    category: 'Contract & Liability',
    plainEnglish:
      'Refers back to something already named or described earlier (or below) in the same legal document.',
    indianContext:
      'Used in conveyances, plaints, and affidavits to link property schedules or party descriptions precisely.',
  },
  {
    id: 'whereas',
    term: 'Whereas / Witnesseth',
    aliases: ['whereas', 'witnesseth'],
    category: 'Contract & Liability',
    plainEnglish:
      '"Whereas" introduces background facts (recitals) explaining why the parties are signing; "Witnesseth" signals that the binding terms begin next.',
    indianContext:
      'Recitals guide Indian courts on parties’ true intention when an operative clause is ambiguous.',
  },
  {
    id: 'consideration',
    term: 'Consideration',
    aliases: ['consideration'],
    category: 'Contract & Liability',
    plainEnglish:
      'The price, money, service, or legal value exchanged by parties that makes an agreement legally enforceable.',
    indianContext:
      'Defined in Section 2(d) of the Indian Contract Act, 1872; agreements without consideration are generally void under Section 25 (with family/gift exceptions).',
  },
  {
    id: 'severability',
    term: 'Severability',
    aliases: ['severability', 'severed'],
    category: 'Contract & Liability',
    plainEnglish:
      'Means that if a court strikes down one invalid clause, the rest of the agreement remains valid and enforceable.',
    indianContext:
      'Aligned with Sections 24 and 57 of the Indian Contract Act, 1872 on separable lawful promises.',
  },
  {
    id: 'liquidated_damages',
    term: 'Liquidated Damages',
    aliases: ['liquidated damages'],
    category: 'Contract & Liability',
    plainEnglish:
      'A pre-agreed sum of money written into a contract as fair compensation if one side breaks the agreement.',
    indianContext:
      'Under Section 74 of the Indian Contract Act, 1872, Indian courts award only reasonable compensation not exceeding the stipulated cap.',
  },
  {
    id: 'arbitration',
    term: 'Arbitration',
    aliases: ['arbitration', 'arbitrator', 'arbitral tribunal'],
    category: 'Litigation & Court',
    plainEnglish:
      'A private, binding dispute-resolution process outside regular courts where a neutral arbitrator hears both sides and passes an enforceable award.',
    indianContext:
      'Governed by the Arbitration and Conciliation Act, 1996; arbitral awards are enforceable like court decrees under Section 36.',
  },
  {
    id: 'encumbrance',
    term: 'Encumbrance',
    aliases: ['encumbrance', 'encumbrances', 'non-encumbrance'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'Any legal burden, mortgage, loan, unpaid tax lien, lease, or court attachment affecting ownership or transfer of a property.',
    indianContext:
      'Buyers verify this via an Encumbrance Certificate (EC) at the local Sub-Registrar office under the Registration Act, 1908.',
  },
  {
    id: 'conveyance',
    term: 'Conveyance / Indenture',
    aliases: ['conveyance', 'convey', 'indenture'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'A formal written deed that legally transfers ownership or rights in immovable property from one person to another.',
    indianContext:
      'Attracts stamp duty under Article 23 of the Indian Stamp Act, 1899 (and State Stamp Acts) and compulsory registration under Section 17 of the Registration Act, 1908.',
  },
  {
    id: 'leave_and_license',
    term: 'Leave and License',
    aliases: ['leave and license', 'leave & license', 'licensor', 'licensee'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'Permission to occupy premises for a fixed period without creating permanent tenancy rights or transferring legal possession interest.',
    indianContext:
      'Governed by Section 52 of the Indian Easements Act, 1882; widely used in Maharashtra (mandatory online registration u/s 55 Maharashtra Rent Control Act).',
  },
  {
    id: 'quiet_enjoyment',
    term: 'Quiet Enjoyment',
    aliases: ['quiet enjoyment'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'The landlord’s legal guarantee that a tenant or buyer can use the property peacefully without unlawful interference or eviction.',
    indianContext:
      'Statutory right protected under Section 108(c) of the Transfer of Property Act, 1882.',
  },
  {
    id: 'mesne_profits',
    term: 'Mesne Profits',
    aliases: ['mesne profits'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'Compensation payable by a person in wrongful or unauthorized occupation of property (such as an overstaying tenant) to the rightful owner.',
    indianContext:
      'Defined under Section 2(12) and claimed under Order XX Rule 12 of the Code of Civil Procedure, 1908.',
  },
  {
    id: 'demised_premises',
    term: 'Demised Premises',
    aliases: ['demised premises'],
    category: 'Property & Conveyancing',
    plainEnglish:
      'The specific flat, building, office, or land that is being rented or leased out under the lease agreement.',
    indianContext:
      'Standard conveyancing phrase derived from "demise" (to grant a lease under the Transfer of Property Act, 1882).',
  },
  {
    id: 'executant',
    term: 'Executant / Execution',
    aliases: ['executant', 'executed', 'execution'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      '"Execution" means completing and signing a legal document; the "Executant" is the person signing to make it legally binding.',
    indianContext:
      'Under Section 2(12) of the Indian Stamp Act, 1899, "executed" means signed — stamp duty must generally be paid before or at the time of execution.',
  },
  {
    id: 'attestation',
    term: 'Attestation / Attesting Witness',
    aliases: ['attestation', 'attested', 'attesting witness'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'Formal witnessing where two independent adults watch the signer sign (or receive confirmation) and sign themselves as witnesses.',
    indianContext:
      'Mandatory under Section 63 of the Indian Succession Act, 1925 (Wills), Section 123 Transfer of Property Act (Gift Deeds), and Mortgages.',
  },
  {
    id: 'deponent',
    term: 'Deponent',
    aliases: ['deponent'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'The person who makes and signs a sworn written statement (an Affidavit) on oath or solemn affirmation.',
    indianContext:
      'Deponents affirm affidavits before an Oath Commissioner, Notary Public, or Magistrate under Section 3 of the Oaths Act, 1969.',
  },
  {
    id: 'perjury',
    term: 'Perjury / False Verification',
    aliases: ['perjury', 'false evidence'],
    category: 'Litigation & Court',
    plainEnglish:
      'Knowingly making a false statement under oath in an affidavit, court pleading, or judicial proceeding.',
    indianContext:
      'Punishable as giving/fabricating false evidence under Sections 227–230 of the Bharatiya Nyaya Sanhita (BNS), 2023 (formerly IPC 191–193).',
  },
  {
    id: 'power_of_attorney',
    term: 'Power of Attorney (GPA / SPA)',
    aliases: ['power of attorney', 'true and lawful attorney', 'constituted attorney'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'Written authorization allowing an agent ("Attorney") to act, sign, or appear on behalf of the owner ("Principal").',
    indianContext:
      'Governed by the Powers-of-Attorney Act, 1882. Note: Under Suraj Lamp & Industries (2011) Supreme Court ruling, GPA sales do not transfer immovable title.',
  },
  {
    id: 'irrevocable',
    term: 'Irrevocable / Revoke',
    aliases: ['irrevocable', 'revocation', 'revoke'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      '"Revoke" means cancelling an authority or will; "Irrevocable" means it cannot be unilaterally cancelled once granted.',
    indianContext:
      'Under Section 202 of the Indian Contract Act, 1872, agency coupled with interest cannot be terminated unilaterally to the agent’s prejudice.',
  },
  {
    id: 'ad_valorem',
    term: 'Ad Valorem',
    aliases: ['ad valorem'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'Latin for "according to the value" — taxes, stamp duty, or court fees calculated as a percentage of the property or claim value rather than a flat fee.',
    indianContext:
      'Applied to Sale Deeds, Conveyances, and money recovery suits under State Stamp Acts and the Court-Fees Act, 1870.',
  },
  {
    id: 'sub_registrar',
    term: 'Sub-Registrar',
    aliases: ['sub-registrar', 'sub registrar'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'The government officer authorized to officially record property deeds, leases over 11 months, and registered wills in public ledgers.',
    indianContext:
      'Appointed under the Registration Act, 1908; registration of non-testamentary property deeds >= Rs. 100 is compulsory u/s 17.',
  },
  {
    id: 'notary_oath',
    term: 'Notary Public / Oath Commissioner',
    aliases: ['notary public', 'oath commissioner', 'notarized', 'notarised'],
    category: 'Execution & Stamp Law',
    plainEnglish:
      'An authorized advocate/officer empowered to verify identity, administer oaths on affidavits, and certify true copies.',
    indianContext:
      'Notaries operate under the Notaries Act, 1952; Oath Commissioners are appointed by High Courts under CPC Section 139.',
  },
  {
    id: 'prima_facie',
    term: 'Prima Facie',
    aliases: ['prima facie'],
    category: 'Litigation & Court',
    plainEnglish:
      'Latin for "at first sight" — evidence that appears sufficient on the surface to support a claim unless disproved.',
    indianContext:
      'Crucial threshold Indian courts check before granting temporary injunctions under Order XXXIX Rules 1–2 CPC or framing charges.',
  },
  {
    id: 'ex_parte',
    term: 'Ex Parte',
    aliases: ['ex parte', 'ex-parte'],
    category: 'Litigation & Court',
    plainEnglish:
      'A court order or hearing conducted in the presence of only one side because the other side failed to appear or urgent relief is needed.',
    indianContext:
      'Regulated under Order IX Rule 6 & Rule 13 of the Code of Civil Procedure, 1908.',
  },
  {
    id: 'status_quo',
    term: 'Status Quo',
    aliases: ['status quo'],
    category: 'Litigation & Court',
    plainEnglish:
      'An order directing parties to preserve existing physical possession or conditions unchanged while the court hears the case.',
    indianContext:
      'Frequently passed as interim relief in Indian civil property suits and Writ Petitions under Article 226.',
  },
  {
    id: 'sub_judice',
    term: 'Sub Judice',
    aliases: ['sub judice', 'sub-judice'],
    category: 'Litigation & Court',
    plainEnglish:
      'Means a legal matter is currently pending consideration before a court of law.',
    indianContext:
      'Section 10 CPC ("stay of suit" / res sub judice) bars parallel civil trials on the exact same issue between the same parties.',
  },
  {
    id: 'res_judicata',
    term: 'Res Judicata',
    aliases: ['res judicata'],
    category: 'Litigation & Court',
    plainEnglish:
      'A rule preventing parties from re-filing the same dispute after a competent court has already finally decided it.',
    indianContext:
      'Codified in Section 11 of the Code of Civil Procedure, 1908 to bring finality to litigation.',
  },
  {
    id: 'locus_standi',
    term: 'Locus Standi',
    aliases: ['locus standi'],
    category: 'Litigation & Court',
    plainEnglish:
      'A person’s legal right or sufficient personal stake to file a lawsuit or petition before a court.',
    indianContext:
      'Strictly checked in civil suits, though relaxed by Indian Constitutional Courts for Public Interest Litigations (PILs).',
  },
  {
    id: 'bona_fide',
    term: 'Bona Fide / Mala Fide',
    aliases: ['bona fide', 'bonafide', 'mala fide', 'malafide'],
    category: 'Litigation & Court',
    plainEnglish:
      '"Bona fide" means acting genuinely in good faith without fraud; "Mala fide" means acting in bad faith or with dishonest intent.',
    indianContext:
      'Protects bona fide purchasers for value without notice under the Transfer of Property Act, 1882 and Specific Relief Act, 1963.',
  },
  {
    id: 'mutatis_mutandis',
    term: 'Mutatis Mutandis',
    aliases: ['mutatis mutandis'],
    category: 'Contract & Liability',
    plainEnglish:
      'Latin for "with the necessary changes having been made" — applying an existing rule or schedule to a new situation with minor adjustments.',
    indianContext:
      'Commonly used in Indian statutes, renewals, and supplemental agreements referencing parent terms.',
  },
  {
    id: 'inter_alia',
    term: 'Inter Alia',
    aliases: ['inter alia'],
    category: 'Litigation & Court',
    plainEnglish:
      'Latin for "among other things" — indicating that the listed items are examples and not the complete exhaustive list.',
    indianContext:
      'Widely used in Supreme Court / High Court pleadings and commercial agreements.',
  },
  {
    id: 'ultra_vires',
    term: 'Ultra Vires',
    aliases: ['ultra vires'],
    category: 'Litigation & Court',
    plainEnglish:
      'Beyond the legal powers or authority granted by a statute, constitution, or company’s Memorandum of Association.',
    indianContext:
      'Central ground in Indian Writ Petitions challenging rules/notifications exceeding parent Parliamentary legislation.',
  },
  {
    id: 'pendente_lite',
    term: 'Pendente Lite / Lis Pendens',
    aliases: ['pendente lite', 'lis pendens'],
    category: 'Property & Conveyancing',
    plainEnglish:
      '"While litigation is pending" — e.g., interim maintenance or restriction against transferring disputed property during an ongoing suit.',
    indianContext:
      'Section 52 of the Transfer of Property Act, 1882 ("lis pendens") binds any buyer during a pending suit to the final court decree.',
  },
  {
    id: 'estoppel',
    term: 'Estoppel',
    aliases: ['estoppel', 'estopped'],
    category: 'Litigation & Court',
    plainEnglish:
      'A legal bar preventing someone from going back on their earlier representation or conduct after another person relied on it.',
    indianContext:
      'Codified in Section 121 of the Bharatiya Sakshya Adhiniyam (BSA), 2023 (formerly Section 115, Indian Evidence Act, 1872).',
  },
  {
    id: 'jurisdiction',
    term: 'Jurisdiction',
    aliases: ['jurisdiction', 'territorial jurisdiction', 'pecuniary jurisdiction'],
    category: 'Litigation & Court',
    plainEnglish:
      'The official authority of a specific court or tribunal to hear and decide a case based on geography, subject matter, or monetary value.',
    indianContext:
      'Determined under Sections 15–20 of the Code of Civil Procedure, 1908 (and Commercial Courts Act, 2015 for commercial disputes).',
  },
  {
    id: 'prayer_relief',
    term: 'Prayer / Interim Relief',
    aliases: ['sheweth', 'most respectfully showeth', 'interim relief'],
    category: 'Litigation & Court',
    plainEnglish:
      '"Sheweth" introduces the facts of a petition; the "Prayer" lists the exact final or interim orders requested from the Judge.',
    indianContext:
      'Mandatory pleading structure under Order VI & VII CPC and Supreme Court / High Court Writ Rules.',
  },
  {
    id: 'testator',
    term: 'Testator / Testatrix',
    aliases: ['testator', 'testatrix', 'testamentary'],
    category: 'Wills & Succession',
    plainEnglish:
      'The person making and signing a Will to direct how their assets should be distributed after death.',
    indianContext:
      'Must be an adult of sound mind under Section 59 of the Indian Succession Act, 1925.',
  },
  {
    id: 'codicil',
    term: 'Codicil',
    aliases: ['codicil'],
    category: 'Wills & Succession',
    plainEnglish:
      'A supplemental legal document executed to explain, modify, add to, or partially revoke an existing Will without rewriting the whole Will.',
    indianContext:
      'Defined under Section 2(b) of the Indian Succession Act, 1925 and requires the same two-witness attestation formalities as a Will.',
  },
  {
    id: 'probate',
    term: 'Probate / Letters of Administration',
    aliases: ['probate', 'letters of administration', 'bequeath', 'bequeathed', 'devise'],
    category: 'Wills & Succession',
    plainEnglish:
      '"Bequeath/Devise" means gifting property via a Will; "Probate" is a court-certified copy of the Will confirming the Executor’s authority.',
    indianContext:
      'Mandatory under Sections 57 & 213 of the Indian Succession Act, 1925 in erstwhile Presidency towns (Mumbai, Kolkata, Chennai) for specified Wills.',
  },
  {
    id: 'caveat',
    term: 'Caveat',
    aliases: ['caveat'],
    category: 'Litigation & Court',
    plainEnglish:
      'A precautionary notice filed in court asking that no ex-parte order be passed against the filer without notifying and hearing them first.',
    indianContext:
      'Filed under Section 148A of the Code of Civil Procedure, 1908 (valid for 90 days) and also in Probate disputes.',
  },
  {
    id: 'covenant',
    term: 'Covenant',
    aliases: ['covenant', 'covenants', 'covenanted'],
    category: 'Contract & Liability',
    plainEnglish:
      'A formal, binding promise or condition written inside a deed or contract.',
    indianContext:
      'Property covenants running with the land are enforced under Section 40 of the Transfer of Property Act, 1882.',
  },
  {
    id: 'suo_motu',
    term: 'Suo Motu',
    aliases: ['suo motu', 'suo moto'],
    category: 'Litigation & Court',
    plainEnglish:
      'Action taken by a court or statutory authority on its own initiative, without any formal complaint or petition filed by a party.',
    indianContext:
      'Frequently exercised by the Supreme Court and High Courts under Articles 32 and 226 of the Constitution of India.',
  },
  {
    id: 'sine_die',
    term: 'Sine Die',
    aliases: ['sine die'],
    category: 'Litigation & Court',
    plainEnglish:
      'Adjourned or suspended indefinitely without fixing a future hearing date.',
    indianContext:
      'Used in court orders when proceedings await outcome of a linked Supreme Court reference or insolvency stay.',
  },
  {
    id: 'dishonour_138',
    term: 'Section 138 Dishonour',
    aliases: ['section 138', 'negotiable instruments act'],
    category: 'Litigation & Court',
    plainEnglish:
      'Criminal offence triggered when a cheque bounces due to insufficient funds and the drawer fails to pay within 15 days of receiving written demand notice.',
    indianContext:
      'Notice must be sent within 30 days of bank return memo under Section 138 Proviso (b) of the Negotiable Instruments Act, 1881.',
  },
];

// Build single longest-match regex across all glossary aliases once at module load
const ALIAS_TO_ENTRY = new Map<string, LegalGlossaryEntry>();
const ALL_ALIASES: string[] = [];

for (const entry of INDIAN_LEGAL_GLOSSARY) {
  for (const alias of entry.aliases) {
    const key = alias.toLowerCase();
    if (!ALIAS_TO_ENTRY.has(key)) {
      ALIAS_TO_ENTRY.set(key, entry);
      ALL_ALIASES.push(alias);
    }
  }
}

ALL_ALIASES.sort((a, b) => b.length - a.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TERM_MATCHER_REGEX =
  ALL_ALIASES.length > 0
    ? new RegExp(`\\b(${ALL_ALIASES.map(escapeRegex).join('|')})\\b`, 'gi')
    : null;

export interface LegalTermSlice {
  text: string;
  entry?: LegalGlossaryEntry;
}

export function scanTextForLegalTerms(text: string): LegalTermSlice[] {
  if (!text || !TERM_MATCHER_REGEX) return [{ text }];

  const slices: LegalTermSlice[] = [];
  TERM_MATCHER_REGEX.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TERM_MATCHER_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      slices.push({ text: text.slice(lastIndex, match.index) });
    }
    const matchedText = match[0];
    const entry = ALIAS_TO_ENTRY.get(matchedText.toLowerCase());
    slices.push({ text: matchedText, entry });
    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < text.length) {
    slices.push({ text: text.slice(lastIndex) });
  }

  return slices.length > 0 ? slices : [{ text }];
}
