import { FieldGroup } from './types';

export const INDIAN_STATES_AND_UTS: string[] = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi (NCT)',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
  'All-India / Central Authority',
];

export const CATEGORY_GROUPS: string[] = [
  'Affidavits',
  'Agreements & MoUs',
  'Deeds & Conveyancing',
  'Rent & Lease',
  'Powers of Attorney',
  'Legal Notices',
  'Petitions, Plaints & Pleadings',
  'Wills & Family Law',
  'GST, Income Tax & Finance',
  'Corporate, IPR & Regulatory',
];

export const TEMPLATE_TAGS: string[] = [
  'Popular',
  'New',
  'Business',
  'Personal',
  'Property',
  'Litigation',
  'Tax & Compliance',
];

export interface CategoryVisualTheme {
  accentHex: string;
  softBgClass: string;
  borderClass: string;
  textClass: string;
  shortDesc: string;
}

export const CATEGORY_THEMES: Record<string, CategoryVisualTheme> = {
  Affidavits: {
    accentHex: '#1E3A8A',
    softBgClass: 'bg-[#EFF6FF]',
    borderClass: 'border-[#BFDBFE]',
    textClass: 'text-[#1E3A8A]',
    shortDesc: 'Sworn declarations, identity, citizenship & court affidavits',
  },
  'Agreements & MoUs': {
    accentHex: '#0F766E',
    softBgClass: 'bg-[#F0FDFA]',
    borderClass: 'border-[#99F6E4]',
    textClass: 'text-[#0F766E]',
    shortDesc: 'Service contracts, partnerships, MoUs, franchises & IT agreements',
  },
  'Deeds & Conveyancing': {
    accentHex: '#9A3412',
    softBgClass: 'bg-[#FFF7ED]',
    borderClass: 'border-[#FED7AA]',
    textClass: 'text-[#9A3412]',
    shortDesc: 'Sale, gift, partition, release, trust & property conveyancing',
  },
  'Rent & Lease': {
    accentHex: '#047857',
    softBgClass: 'bg-[#ECFDF5]',
    borderClass: 'border-[#A7F3D0]',
    textClass: 'text-[#047857]',
    shortDesc: 'Leave & license, residential/commercial leases & rent appeals',
  },
  'Powers of Attorney': {
    accentHex: '#B45309',
    softBgClass: 'bg-[#FFFBEB]',
    borderClass: 'border-[#FDE68A]',
    textClass: 'text-[#B45309]',
    shortDesc: 'General (GPA) and special (SPA) authority & registration deeds',
  },
  'Legal Notices': {
    accentHex: '#B91C1C',
    softBgClass: 'bg-[#FEF2F2]',
    borderClass: 'border-[#FECACA]',
    textClass: 'text-[#B91C1C]',
    shortDesc: 'Sec 138 NI Act cheque notices, Sec 80 CPC & civil demand notices',
  },
  'Petitions, Plaints & Pleadings': {
    accentHex: '#4338CA',
    softBgClass: 'bg-[#EEF2FF]',
    borderClass: 'border-[#C7D2FE]',
    textClass: 'text-[#4338CA]',
    shortDesc: 'Writ petitions, civil plaints, bail, SLP & consumer complaints',
  },
  'Wills & Family Law': {
    accentHex: '#7E22CE',
    softBgClass: 'bg-[#FAF5FF]',
    borderClass: 'border-[#E9D5FF]',
    textClass: 'text-[#7E22CE]',
    shortDesc: 'Wills, codicils, adoption, matrimonial & succession petitions',
  },
  'GST, Income Tax & Finance': {
    accentHex: '#0369A1',
    softBgClass: 'bg-[#F0F9FF]',
    borderClass: 'border-[#BAE6FD]',
    textClass: 'text-[#0369A1]',
    shortDesc: 'GST refund forms, IT forms, banking, bonds & guarantees',
  },
  'Corporate, IPR & Regulatory': {
    accentHex: '#334155',
    softBgClass: 'bg-[#F8FAFC]',
    borderClass: 'border-[#CBD5E1]',
    textClass: 'text-[#334155]',
    shortDesc: 'Employment, company filings, trademarks, copyright & consumer acts',
  },
};

export const FIELD_GROUP_ORDER: FieldGroup[] = [
  'Applicant details',
  'First party details',
  'Second party details',
  'Court details',
  'Property details',
  'Financial details',
  'Execution details',
  'Witness details',
];

export const NON_EXECUTED_STATUS_NOTICE =
  'UNEXECUTED DRAFT ONLY — Generated from original library template with mapped variable replacements. Not notarized, not e-stamped by a government treasury, not registered under the Registration Act, 1908, and not legal advice.';

export const NEEDS_REVIEW_BANNER =
  'SOURCE TEMPLATE PENDING LEGAL REVIEW — Original clauses preserved verbatim from repository. Verify state stamp duty, court rules, and current Indian statutory citations (including BNS/BNSS/BSA 2023 or Companies Act 2013 updates) with an Advocate before execution.';

export const APPROVED_TEMPLATE_BANNER =
  'ADMIN-APPROVED TEMPLATE — Original legal wording preserved with form-mapped variable substitution. Confirm applicable state stamp paper, court fees, and execution formalities before signing.';

export const PDF_RECONSTRUCTED_NOTICE =
  'RECONSTRUCTED FROM SOURCE PDF — Original PDF lacked fillable AcroForm fields. Text was extracted verbatim and reconstructed into an editable DOCX/PDF rendition; verify layout against the original PDF form.';

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
