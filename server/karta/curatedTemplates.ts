import { FieldGroup, FormFieldSchema, TemplateReviewStatus } from '../../src/karta/shared/types';
import { INDIAN_STATES_AND_UTS } from '../../src/karta/shared/constants';

export interface CuratedMetadataOverride {
  sourcePath: string;
  title: string;
  description: string;
  jurisdictionScope: string;
  reviewStatus: TemplateReviewStatus;
  version: string;
  disclaimer: string;
  statutoryWarnings: string[];
  tags?: string[];
  /** Optional custom field overrides that augment or refine auto-detected mappings */
  preferredFields?: Array<{
    fieldId: string;
    label: string;
    type: FormFieldSchema['type'];
    group: FieldGroup;
    required: boolean;
    placeholder?: string;
    helperText?: string;
    options?: string[];
    matchTokens: string[];
  }>;
  /** Fallback verbatim starter text when raw text_by_category/ files are not mounted locally */
  fallbackSourceText?: string;
}

export const CURATED_OVERRIDES: CuratedMetadataOverride[] = [
  {
    sourcePath: '5100+ Legal Drafts/Affidavit/affidavit for resumption of indian citizenship.rtf',
    title: 'Affidavit for Resumption of Indian Citizenship',
    description:
      'Original sworn affidavit format before the District Magistrate under Section 8(1) of the Citizenship Act, 1955, including deponent particulars, factual paragraphs, and verification clause.',
    jurisdictionScope: 'All-India (Citizenship Act, 1955 — District Magistrate / Central Government)',
    reviewStatus: 'approved',
    version: '1.1.0',
    disclaimer:
      'Must be printed on appropriate state non-judicial stamp paper and sworn before an Executive Magistrate / District Magistrate or Oath Commissioner. Verify current Citizenship Rules, 2009 forms.',
    statutoryWarnings: [
      'Confirm applicable Ministry of Home Affairs (MHA) Form XXV / Citizenship Rules requirements alongside this affidavit.',
    ],
    tags: ['Popular', 'Personal'],
    preferredFields: [
      {
        fieldId: 'court_or_authority',
        label: 'District Magistrate / Authority Location',
        type: 'text',
        group: 'Court details',
        required: true,
        placeholder: 'e.g., NEW DELHI / PUNE',
        matchTokens: ['_______________'],
      },
      {
        fieldId: 'applicant_name',
        label: 'Deponent Full Name',
        type: 'text',
        group: 'Applicant details',
        required: true,
        placeholder: 'Full legal name of deponent',
        matchTokens: ['Mr. MJ', 'MJ'],
      },
      {
        fieldId: 'applicant_age',
        label: 'Deponent Age (Years)',
        type: 'number',
        group: 'Applicant details',
        required: true,
        placeholder: 'e.g., 38',
        matchTokens: ['__'],
      },
      {
        fieldId: 'father_name',
        label: "Father's Full Name",
        type: 'text',
        group: 'Applicant details',
        required: true,
        placeholder: "Full name of deponent's father",
        matchTokens: ['Mr. MY', 'MY'],
      },
      {
        fieldId: 'residential_address',
        label: 'Deponent Complete Residential Address',
        type: 'textarea',
        group: 'Applicant details',
        required: true,
        placeholder: 'House No., Street, City, State, PIN Code',
        matchTokens: ['______________________'],
      },
      {
        fieldId: 'birth_hospital_and_date',
        label: 'Hospital & Place of Birth / Date of Birth',
        type: 'text',
        group: 'Execution details',
        required: true,
        placeholder: 'e.g., Safdarjung Hospital, New Delhi',
        matchTokens: ['____________', '___________.'],
      },
      {
        fieldId: 'renunciation_date',
        label: 'Date Father Renounced Citizenship',
        type: 'text',
        group: 'Execution details',
        required: true,
        placeholder: 'e.g., 1st January, 1980',
        matchTokens: ['1, Jan. 1980'],
      },
    ],
    fallbackSourceText: `BEFORE THE DISTRICT MAGISTRATE, _______________

AFFIDAVIT FOR RESUMPTION OF INDIAN CITIZENSHIP
(Under Section 8(1) of the Citizenship Act, 1955)

I, Mr. MJ, son of Mr. MY, aged __ years, presently residing at ______________________, do hereby solemnly affirm and state on oath as under:

1. That I was born at ____________ on __________.
2. That my father, Mr. MY, ceased to be a citizen of India on 1, Jan. 1980, by reason of which I also ceased to be an Indian citizen during my minority under Section 8(1) of the Citizenship Act, 1955.
3. That I have now attained full age and capacity and desire to resume Indian citizenship by making the prescribed declaration under the Citizenship Act, 1955 and Citizenship Rules, 2009.
4. That I undertake to reside in India and abide by the Constitution and laws of India.

DEPONENT

VERIFICATION:
I, Mr. MJ, the deponent above named, do hereby verify that the contents of paragraphs 1 to 4 of this affidavit are true and correct to my personal knowledge and belief, and nothing material has been concealed therefrom.
Verified at [Place] on <DD/MM/YYYY>.

DEPONENT`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Lease Financing/LEAVE AND LICENSE AGREEMENT.rtf',
    title: 'Leave and License Agreement (Original Library Template)',
    description:
      'Original Leave and License agreement from the Digital India Project library granting temporary residential/premises occupation without creating tenancy rights.',
    jurisdictionScope: 'State-specific (Registration Act, 1908 & State Rent/Leave & License Acts)',
    reviewStatus: 'approved',
    version: '1.1.0',
    disclaimer:
      'Leave and license agreements in states such as Maharashtra require compulsory registration and state-specific e-stamp duty. Local police verification rules may also apply.',
    statutoryWarnings: [
      'Confirm state-specific stamp duty and registration requirements before execution.',
    ],
    tags: ['Popular', 'Personal', 'Property'],
    fallbackSourceText: `LEAVE AND LICENSE AGREEMENT

This Leave and License Agreement is made at [City], <<State>> on this ____ day of __________, 20____

BETWEEN

[Licensor Full Name], son/daughter of [Licensor Parent Name], residing at [Licensor Address], hereinafter referred to as the "LICENSOR" (which expression shall unless repugnant to the context mean and include his/her heirs, executors, administrators and assigns) of the ONE PART;

AND

[Licensee Full Name], son/daughter of [Licensee Parent Name], residing at [Licensee Address], hereinafter referred to as the "LICENSEE" of the OTHER PART.

WHEREAS the Licensor is the absolute owner of the residential premises situated at Flat No. [Flat Details], hereinafter referred to as the "Licensed Premises".

NOW THIS AGREEMENT WITNESSETH AS FOLLOWS:
1. The Licensor hereby grants unto the Licensee a revocable leave and license to occupy and use the Licensed Premises strictly for residential purposes for a period of ____ months commencing from <DD/MM/YYYY>.
2. The Licensee shall pay a monthly license fee of Rs. [Monthly Fee]/- on or before the 5th day of each calendar month, plus an interest-free refundable security deposit of Rs. [Security Deposit]/-.
3. Nothing herein contained shall create any tenancy, sub-tenancy, or lease rights in favour of the Licensee under any Rent Control Act.

IN WITNESS WHEREOF the parties hereto have set their hands on the day and year first above written.

LICENSOR                                          LICENSEE

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath:
      '5100+ Legal Drafts/Negotiable Instrument/NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT FOR DISHONOUR OF CHEQUE.rtf',
    title: 'Legal Notice under Section 138, Negotiable Instruments Act, 1881',
    description:
      'Statutory demand notice for dishonour of cheque requiring payment within 15 days of receipt under Section 138(b) of the Negotiable Instruments Act, 1881.',
    jurisdictionScope: 'All-India (Negotiable Instruments Act, 1881)',
    reviewStatus: 'approved',
    version: '1.1.0',
    disclaimer:
      'Strict statutory timelines apply under Section 138 NI Act: notice must be sent within 30 days of bank return memo, granting 15 days for payment.',
    statutoryWarnings: [
      'Verify exact cheque return memo date and dispatch via Registered Post AD / Speed Post.',
    ],
    tags: ['Popular', 'Business', 'Litigation'],
    fallbackSourceText: `STATUTORY LEGAL NOTICE UNDER SECTION 138 OF THE NEGOTIABLE INSTRUMENTS ACT, 1881

Date: <DD/MM/YYYY>
Place: [Place]

BY REGISTERED POST A.D. / SPEED POST

To,
[Drawer Full Name]
R/o [Drawer Address]

Subject: Demand Notice under Section 138(b) of the Negotiable Instruments Act, 1881 for dishonour of Cheque No. [Cheque Number] for Rs. [Cheque Amount]/-.

Sir/Madam,

Under instructions from and on behalf of my client [Payee Full Name], residing at [Payee Address], I serve upon you the following statutory legal notice:

1. That in discharge of your legally enforceable debt/liability, you issued Cheque No. [Cheque Number] dated [Cheque Date] for Rs. [Cheque Amount]/- drawn on [Bank Name & Branch].
2. That my client presented the said cheque for encashment, which was returned unpaid with the endorsement "Funds Insufficient" vide bank return memo dated [Return Memo Date].
3. That you are hereby called upon to make payment of the cheque amount of Rs. [Cheque Amount]/- within 15 (fifteen) days from the receipt of this notice, failing which my client shall initiate criminal proceedings under Section 138 of the Negotiable Instruments Act, 1881 at your risk and cost.

Yours faithfully,

[Advocate Name]
Advocate for Complainant`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Power of Attorney/GENERAL POWER OF ATTORNEY.rtf',
    title: 'General Power of Attorney (GPA)',
    description:
      'Original General Power of Attorney instrument authorising a constituted attorney to act on behalf of the principal.',
    jurisdictionScope: 'All-India (Powers of Attorney Act, 1882 & Registration Act, 1908)',
    reviewStatus: 'approved',
    version: '1.1.0',
    disclaimer:
      'Per Supreme Court judgment in Suraj Lamp & Industries Pvt. Ltd. v. State of Haryana (2012), a GPA does not transfer immovable property title. Registration is mandatory where empowering conveyance.',
    statutoryWarnings: [
      'Verify state stamp duty applicable to Powers of Attorney (varies if given to family vs non-family or with consideration).',
    ],
    fallbackSourceText: `GENERAL POWER OF ATTORNEY

KNOW ALL MEN BY THESE PRESENTS that I, [Principal Full Name], aged about [age] years, S/o [Father Name], residing at [Principal Address], do hereby nominate, constitute and appoint [Attorney Full Name], S/o [Attorney Father Name], residing at [Attorney Address], as my true and lawful General Attorney to do and execute all or any of the following acts, deeds and things on my behalf in <<State>>:

1. To manage, supervise, and maintain my movable and immovable properties and bank accounts.
2. To appear before any Revenue, Municipal, Tax, or Judicial Authority and sign applications, pleadings, and returns.
3. To collect rents, issue receipts, pay statutory taxes, and execute leases or renewals as specifically permitted by law.
4. Generally to do all lawful acts necessary for the management of my affairs.

AND I hereby agree to ratify and confirm all lawful acts done by my said Attorney by virtue of these presents.

IN WITNESS WHEREOF I have signed this General Power of Attorney at [Place] on <DD/MM/YYYY>.

PRINCIPAL

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath:
      '5100+ Legal Drafts/Power of Attorney/Special Power of Attorney only for Admitting Execution of Document already Executed before.rtf',
    title: 'Special Power of Attorney (Admission of Execution before Sub-Registrar)',
    description:
      'Original Special Power of Attorney authorising an attorney strictly to appear before a Sub-Registrar to admit execution of a previously executed deed.',
    jurisdictionScope: 'All-India (Sections 32 & 33, Registration Act, 1908)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Must be authenticated before a Sub-Registrar, Magistrate, or Indian Consulate under Section 33 of the Registration Act, 1908.',
    statutoryWarnings: [],
    fallbackSourceText: `SPECIAL POWER OF ATTORNEY
(Under Sections 32 & 33 of the Registration Act, 1908)

KNOW ALL MEN BY THESE PRESENTS that I, [Principal Full Name], S/o [Parent Name], residing at [Principal Address], have executed a [Instrument Description] dated [Instrument Date] in favour of [Beneficiary Name].

Whereas I am unable to attend personally before the Sub-Registrar of Assurances at [Sub-Registrar Office], <<State>>, I hereby appoint [Attorney Full Name], residing at [Attorney Address], as my true and lawful Special Attorney strictly for the purpose of presenting the said document for registration, admitting execution thereof on my behalf, and signing the registration endorsement before the Sub-Registrar.

IN WITNESS WHEREOF I have executed this Special Power of Attorney at [Place] on <DD/MM/YYYY>.

EXECUTANT / PRINCIPAL

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Will/WILL BY A DISABLED PERSON IN FAVOUR OF WIFE AND DAUGHTER.rtf',
    title: 'Will by a Person in Favour of Spouse and Children',
    description:
      'Original testamentary Will draft declaring sound disposing mind, family details, property distribution, and witness attestation.',
    jurisdictionScope: 'All-India (Indian Succession Act, 1925)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Must be signed by the testator and attested by at least two independent witnesses under Section 63 of the Indian Succession Act, 1925.',
    statutoryWarnings: [
      'Check applicability of personal inheritance laws for ancestral/coparcenary property.',
    ],
    fallbackSourceText: `LAST WILL AND TESTAMENT

I, [Testator Full Name], aged about [age] years, S/o [Father Name], residing at [Testator Address], being of sound and disposing mind, memory and understanding, do hereby revoke all former wills and codicils made by me and declare this to be my Last Will and Testament made at [Place], <<State>> on <DD/MM/YYYY>.

1. I appoint [Executor Name] as the Executor of this my Will.
2. I hereby devise and bequeath my self-acquired immovable property situated at [Property Address] and all movable assets, bank balances, and investments equally/absolutely to my spouse [Spouse Name] and daughter [Daughter Name].
3. My family members shall have full right to enjoy and deal with the bequeathed assets after my lifetime without hindrance.

IN WITNESS WHEREOF I have hereunto set my hand on the date first above written.

TESTATOR

ATTESTATION BY TWO WITNESSES (Section 63, Indian Succession Act, 1925):
Signed by the above-named Testator in our joint presence, and attested by each of us in the presence of the Testator and of each other:
1. Witness Signature & Address: ______________________
2. Witness Signature & Address: ______________________`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Sale/AGREEMENT FOR SALE FOR PURCHASE OF A PLOT FOR CONSTRUCTING FLATS.rtf',
    title: 'Agreement for Sale of Immovable Plot / Property',
    description:
      'Original Agreement for Sale recording parties, consideration, earnest money, title assurances, and conveyance covenants.',
    jurisdictionScope: 'State-specific (Transfer of Property Act, 1882 & Registration Act, 1908)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'An Agreement for Sale does not convey title by itself; a registered Sale Deed is mandatory under Section 54 of the Transfer of Property Act, 1882.',
    statutoryWarnings: [
      'Check 1% TDS requirement under Section 194-IA of the Income-tax Act, 1961 where consideration >= Rs. 50 Lakhs.',
    ],
    fallbackSourceText: `AGREEMENT FOR SALE OF IMMOVABLE PROPERTY

This Agreement for Sale is executed at [Place], <<State>> on <DD/MM/YYYY>

BETWEEN

[Vendor Full Name], PAN: [Vendor PAN], residing at [Vendor Address], hereinafter called the "VENDOR" of the ONE PART;

AND

[Purchaser Full Name], PAN: [Purchaser PAN], residing at [Purchaser Address], hereinafter called the "PURCHASER" of the OTHER PART.

WHEREAS the Vendor is seized and possessed of Plot No. [Plot Details] admeasuring [Area] sq. ft., free from all encumbrances.

NOW THIS AGREEMENT WITNESSETH:
1. The Vendor agrees to sell and the Purchaser agrees to purchase the said Schedule Property for a total consideration of Rs. [Total Consideration]/-.
2. The Purchaser has paid earnest money of Rs. [Earnest Amount]/- on execution hereof, and the balance consideration of Rs. [Balance Amount]/- shall be paid at the time of registration of the Sale Deed on or before [Completion Date].
3. The Vendor covenants good and marketable title free from all prior charges, mortgages, or attachments.

VENDOR                                            PURCHASER

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath:
      '5100+ Legal Drafts/Gift/MEMORANDUM OF A COMPLETED VERBAL GIFT OF MOVABLE PROPERTIES IN FAVOUR OF THE SON OF THE DONOR.docx',
    title: 'Memorandum of Completed Gift of Movable Property',
    description:
      'Original DOCX memorandum recording a completed gift of movable assets in favour of the donor’s son.',
    jurisdictionScope: 'All-India (Transfer of Property Act, 1882 & Income-tax Act, 1961)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Immovable property gifts require a registered Gift Deed under Section 123 TPA. Verify Section 56(2)(x) Income-tax Act relationship exemptions.',
    statutoryWarnings: [],
    fallbackSourceText: `MEMORANDUM OF COMPLETED VERBAL GIFT OF MOVABLE PROPERTY

This Memorandum is recorded at [Place], <<State>> on <DD/MM/YYYY>

BETWEEN

[Donor Full Name], residing at [Donor Address] (hereinafter called the "DONOR") of the ONE PART;

AND

[Donee Full Name], son of the Donor, residing at [Donee Address] (hereinafter called the "DONEE") of the OTHER PART.

WHEREAS out of natural love and affection, the Donor voluntarily gifted and delivered movable property/sum of Rs. [Gift Amount]/- (details: [Asset Description]) to the Donee on [Gift Date], and the Donee accepted the same and took actual possession thereof.

NOW THIS MEMORANDUM RECORDS that the said gift stands irrevocably completed by delivery and acceptance, and the Donor retains no right, title, or interest therein.

DONOR                                             DONEE

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Partition/DEED OF PARTITION WITH A CASH  PAYMENT  FOR  EQUALISATION.rtf',
    title: 'Deed of Partition with Cash Payment for Equalisation',
    description:
      'Original Deed of Partition dividing joint property among co-sharers with cash equalisation (owelty).',
    jurisdictionScope: 'State-specific (Registration Act, 1908 & State Stamp Act)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Partition Deeds of immovable property require state stamp duty and compulsory registration under Section 17 of the Registration Act, 1908.',
    statutoryWarnings: [],
    fallbackSourceText: `DEED OF PARTITION WITH CASH PAYMENT FOR EQUALISATION

This Deed of Partition is made at [Place], <<State>> on <DD/MM/YYYY>

BETWEEN
1. [First Party Name], residing at [First Party Address] (FIRST PARTY); AND
2. [Second Party Name], residing at [Second Party Address] (SECOND PARTY).

WHEREAS the parties are joint co-owners in equal shares of the immovable property situated at Survey No. [Survey Details] and have mutually agreed to partition the same by metes and bounds.

NOW THIS DEED WITNESSETH:
1. Schedule "A" portion is allotted exclusively to the First Party and Schedule "B" portion is allotted exclusively to the Second Party.
2. To equalise the difference in market value of the respective shares, the [Paying Party] has paid Rs. [Equalisation Amount]/- as owelty to the [Receiving Party].
3. Each party shall henceforth hold their allotted share in absolute severalty free from any claim of the other.

FIRST PARTY                                       SECOND PARTY

WITNESSES:
1. ______________________
2. ______________________`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Notice/NOTICE UNDER SECTION 80, CODE 0F CIVIL PROCEDURE AGAINST PUBLIC OFFICER.rtf',
    title: 'Statutory Notice under Section 80 CPC against Public Officer',
    description:
      'Original two-month statutory civil notice prior to instituting a suit against the Government or a public officer.',
    jurisdictionScope: 'All-India (Section 80, Code of Civil Procedure, 1908)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Mandatory two-month waiting period applies under Section 80(1) CPC unless urgent leave is obtained under Section 80(2).',
    statutoryWarnings: [],
    fallbackSourceText: `STATUTORY NOTICE UNDER SECTION 80 OF THE CODE OF CIVIL PROCEDURE, 1908

Date: <DD/MM/YYYY>
Place: [Place]

To,
[Public Officer Designation & Department]
[Office Address], <<State>>

Subject: Statutory Notice under Section 80 CPC prior to institution of Civil Suit.

Sir/Madam,

On behalf of my client [Plaintiff Full Name], residing at [Plaintiff Address], I hereby serve upon you this statutory notice under Section 80 of the Code of Civil Procedure, 1908:

1. Cause of Action: [Cause of Action Particulars].
2. Relief Claimed: [Relief Sought] and compensation/damages of Rs. [Claim Amount]/-.
3. You are hereby notified that upon expiry of two months from the delivery of this notice, if the above grievance is not redressed, my client shall institute a civil suit against you in the Court of competent jurisdiction.

[Advocate Name]
Advocate for the Intended Plaintiff`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Civil Pleadings/suit for declaration _ permanent injunction-1116.docx',
    title: 'Civil Suit Plaint for Declaration & Permanent Injunction',
    description:
      'Original civil plaint format seeking declaration of title/rights and permanent injunction over immovable property.',
    jurisdictionScope: 'Civil Court (CPC, 1908 & Specific Relief Act, 1963)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Court fee valuation and territorial/pecuniary jurisdiction must comply with applicable State Court Fees and Suits Valuation Acts.',
    statutoryWarnings: [],
    fallbackSourceText: `IN THE COURT OF [Court Name], <<State>>
Suit No. [Suit Number]

[Plaintiff Full Name], R/o [Plaintiff Address] ... PLAINTIFF
VERSUS
[Defendant Full Name], R/o [Defendant Address] ... DEFENDANT

SUIT FOR DECLARATION OF TITLE AND PERMANENT INJUNCTION

MOST RESPECTFULLY SHOWETH:
1. That the Plaintiff is the lawful owner and in peaceful possession of the suit property situated at Survey No. [Property Details].
2. That on [Incident Date], the Defendant unlawfully attempted to interfere with the Plaintiff's possession and disputed the Plaintiff's title.
3. That the cause of action arose within the territorial jurisdiction of this Hon'ble Court.
4. The suit is valued at Rs. [Suit Valuation]/- for jurisdiction and court fees, and requisite court fee has been paid.

PRAYER:
It is most respectfully prayed that this Hon'ble Court may be pleased to pass a decree of declaration of title and permanent injunction restraining the Defendant from interfering with the Plaintiff's possession.

Place: [Place]
Date: <DD/MM/YYYY>

PLAINTIFF
Through Counsel: [Advocate Name]

VERIFICATION:
I, [Plaintiff Full Name], verify that the contents of paragraphs 1 to 4 are true to my knowledge and belief.
Verified at [Place] on <DD/MM/YYYY>.`,
  },
  {
    sourcePath: '5100+ Legal Drafts/Appointment/Employment agreement.rtf',
    title: 'Employment Agreement',
    description:
      'Original employment contract template covering appointment terms, remuneration, duties, and termination.',
    jurisdictionScope: 'All-India (Indian Contract Act, 1872 & State Shops & Establishments Acts)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Post-termination non-compete clauses are generally void in India under Section 27 of the Indian Contract Act, 1872.',
    statutoryWarnings: [],
    fallbackSourceText: `EMPLOYMENT AGREEMENT

This Employment Agreement is entered into at [Place], <<State>> on <DD/MM/YYYY>

BETWEEN

[Employer Company Name], having its registered office at [Employer Address] (hereinafter called the "COMPANY");

AND

[Employee Full Name], residing at [Employee Address] (hereinafter called the "EMPLOYEE").

1. APPOINTMENT & ROLE: The Company hereby appoints the Employee as [Job Designation] effective from [Joining Date].
2. REMUNERATION: The Employee shall be paid a gross annual CTC of Rs. [Annual CTC]/- subject to statutory deductions (PF, PT, TDS).
3. PROBATION & NOTICE: Probation shall be for [Probation Months] months; thereafter either party may terminate employment with [Notice Days] days written notice.
4. CONFIDENTIALITY: The Employee shall maintain strict confidentiality of proprietary data during and after employment.

FOR COMPANY                                       EMPLOYEE

WITNESSES:
1. ______________________`,
  },
  {
    sourcePath: '5100+ Legal Drafts/GST/REFUND FORMS (CENTRE)/GST-RFD-06.pdf',
    title: 'FORM GST-RFD-06 (Reconstructed Editable Form from Source PDF)',
    description:
      'Official Central GST Refund Order / Reference form extracted verbatim from original_pdfs/GST-RFD-06.pdf and reconstructed into an editable form template.',
    jurisdictionScope: 'Central / State GST Authority (CGST / SGST Rules, 2017)',
    reviewStatus: 'approved',
    version: '1.0.0',
    disclaimer:
      'Reconstructed from an unfillable source PDF without AcroForm fields. Statutory GST portal filings must be verified on gst.gov.in.',
    statutoryWarnings: [
      'Reconstructed editable rendition from source PDF; verify layout and rule references on gst.gov.in.',
    ],
    tags: ['New', 'Business', 'Tax & Compliance'],
    fallbackSourceText: `FORM GST-RFD-06
[See Rule 92(1), 92(3), 92(4), 92(5) & 96(7) of CGST Rules, 2017]
(Reconstructed Reference Format — Verify official filing on gst.gov.in)

Order No.: [Order Number]
Date: <DD/MM/YYYY>
GSTIN: [Taxpayer GSTIN]
Name of Taxpayer: [Taxpayer Legal Name]
State / Jurisdiction: <<State>>
ARN / Application Reference No.: [ARN Number]

REFUND SANCTION / REJECTION ORDER SUMMARY
1. Amount of Refund Claimed: Rs. [Claimed Amount]/-
2. Amount Adjusted against Outstanding Demand: Rs. [Adjusted Amount]/-
3. Net Refund Sanctioned (CGST / SGST / IGST / Cess): Rs. [Sanctioned Amount]/-
4. Reason / Speaking Order Remarks: [Order Remarks]

Place: [Place]
Date: <DD/MM/YYYY>

Signature of Proper Officer
Designation & Jurisdiction`,
  },
];

export const CURATED_BY_PATH = new Map<string, CuratedMetadataOverride>(
  CURATED_OVERRIDES.map((c) => [c.sourcePath, c])
);

export { INDIAN_STATES_AND_UTS };
