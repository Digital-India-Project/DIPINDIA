import {
  FieldGroup,
  FieldType,
  FormFieldSchema,
  PlaceholderMapping,
  RepeatableSectionSchema,
} from '../../src/karta/shared/types';
import { INDIAN_STATES_AND_UTS } from '../../src/karta/shared/constants';

export interface VariableDetectionResult {
  fields: FormFieldSchema[];
  repeatableSections: RepeatableSectionSchema[];
  tokenizedTemplate: string;
}

interface PatternSpec {
  fieldId: string;
  label: string;
  type: FieldType;
  group: FieldGroup;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
  regex: RegExp;
  /** Group index in regex that contains the exact blank/token to replace (default 1) */
  captureGroup?: number;
  validation?: FormFieldSchema['validation'];
}

const CONTEXTUAL_PATTERNS: PatternSpec[] = [
  {
    fieldId: 'court_or_authority',
    label: 'Court / Tribunal / Magistrate / Authority Name',
    type: 'text',
    group: 'Court details',
    required: true,
    placeholder: 'e.g., District Magistrate, Bengaluru / High Court of Delhi',
    regex: /\b(?:BEFORE THE|IN THE COURT OF(?: THE)?|IN THE HIGH COURT OF(?: JUDICATURE AT)?)\s+([A-Z\s,\.]*?(?:_{3,}|\.{4,}|\[[^\]]{2,40}\]|<[^>]{2,40}>))/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'case_or_suit_number',
    label: 'Case / Suit / Petition / Application Number',
    type: 'text',
    group: 'Court details',
    required: false,
    placeholder: 'e.g., CS No. 142 of 2026',
    regex: /\b(?:Suit|Case|Petition|Appeal|Application|Complaint|Writ Petition|FIR)\s+No\.?\s*[:\-]?\s*(_{2,}|\.{3,}|\[[^\]]{2,30}\]|<[^>]{2,30}>)/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'jurisdiction_state',
    label: 'State / Union Territory Jurisdiction',
    type: 'select',
    group: 'Execution details',
    required: true,
    options: INDIAN_STATES_AND_UTS,
    helperText: 'Explicit Indian state/UT governing stamp duty and local court rules.',
    regex: /(?:<<\s*State\s*>>|\[\s*State\s*\]|State\s+of\s+(_{3,}|\.{4,}))/gi,
    captureGroup: 0,
  },
  {
    fieldId: 'execution_place',
    label: 'Place / City of Execution',
    type: 'text',
    group: 'Execution details',
    required: true,
    placeholder: 'e.g., New Delhi / Mumbai / Chennai',
    regex: /\b(?:made at|executed at|verified at|signed at|dated at|Place\s*[:\-])\s*(_{3,}|\.{4,}|\[[^\]]{2,35}\]|<[^>]{2,35}>)/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'execution_date',
    label: 'Date of Execution / Filing',
    type: 'date',
    group: 'Execution details',
    required: true,
    helperText: 'Exact date of agreement, affidavit, notice, or filing.',
    regex: /(?:\bthis\s+(?:_{2,}|\.{3,})\s+day\s+of\s+(?:_{2,}|\.{3,})(?:\s*,?\s*(?:19|20)?_{2,})?|<\s*DD\/MM\/YYYY\s*>|\[\s*Date\s*\]|\bDate\s*[:\-]\s*(?:_{3,}|\.{4,}))/gi,
    captureGroup: 0,
  },
  {
    fieldId: 'applicant_or_first_party_name',
    label: 'Applicant / Deponent / First Party Full Name',
    type: 'text',
    group: 'First party details',
    required: true,
    placeholder: 'Full legal name',
    regex: /\b(?:Affidavit of|I,|BETWEEN\s+|Petition of)\s*(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.)?\s*([A-Z]{2,4}\b|\[(?:Name|Full Name)[^\]]*\]|_{3,}|\.{4,})/g,
    captureGroup: 1,
  },
  {
    fieldId: 'parent_or_spouse_name',
    label: "Father's / Mother's / Spouse's Full Name",
    type: 'text',
    group: 'First party details',
    required: false,
    placeholder: 'Full name of father / husband / parent',
    regex: /\b(?:S\/o|D\/o|W\/o|son of|daughter of|wife of)\s+(?:Shri|Smt\.|Mr\.)?\s*([A-Z]{2,4}\b|_{3,}|\.{4,}|\[[^\]]{2,35}\])/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'party_age',
    label: 'Age (Years)',
    type: 'number',
    group: 'First party details',
    required: false,
    placeholder: 'e.g., 36',
    regex: /\baged\s+(?:about\s+)?(_{2,}|\.{2,}|\[age\])\s+years/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'residential_address',
    label: 'Residential / Registered Address',
    type: 'textarea',
    group: 'First party details',
    required: true,
    placeholder: 'House/Flat No., Street, Locality, City, State, PIN Code',
    regex: /\b(?:R\/o|residing at|resident of|registered office at|having its office at)\s*(_{3,}|\.{4,}|\[[^\]]{2,50}\])/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'gstin_number',
    label: 'GSTIN (15-Character GST Registration)',
    type: 'text',
    group: 'Financial details',
    required: false,
    placeholder: 'e.g., 29ABCDE1234F1Z5',
    validation: {
      pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
      patternHint: '15-character Indian GSTIN format (e.g., 29ABCDE1234F1Z5)',
    },
    regex: /\b(?:GSTIN|GST\s+No\.?)\s*[:\-]?\s*(_{3,}|\.{4,}|\[[^\]]{2,25}\]|\(GSTIN\))/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'pan_number',
    label: 'PAN (Permanent Account Number)',
    type: 'text',
    group: 'Financial details',
    required: false,
    placeholder: 'e.g., ABCDE1234F',
    validation: {
      pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      patternHint: '10-character Indian PAN format (e.g., ABCDE1234F)',
    },
    regex: /\bPAN\s*(?:No\.?)?\s*[:\-]?\s*(_{3,}|\.{4,}|\[[^\]]{2,20}\])/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'amount_inr',
    label: 'Monetary Amount / Consideration / Rent (INR)',
    type: 'text',
    group: 'Financial details',
    required: false,
    placeholder: 'e.g., 50,000/-',
    regex: /\b(?:Rs\.?|INR|Rupees)\s*(_{2,}|\.{3,}|\[[^\]]{2,25}\])/gi,
    captureGroup: 1,
  },
  {
    fieldId: 'property_survey_or_address',
    label: 'Property Schedule / Survey / Plot Details',
    type: 'textarea',
    group: 'Property details',
    required: false,
    placeholder: 'Survey/Gat/Plot No., Village/Taluka/District, Area, and Boundaries',
    regex: /\b(?:Gat No\.|Survey No\.|Plot No\.|Flat No\.|Premises situated at)\s*(_{2,}|\.{3,}|\[[^\]]{2,45}\])/gi,
    captureGroup: 1,
  },
];

function sanitizeFieldId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
}

function inferGroupFromContext(context: string): FieldGroup {
  const c = context.toLowerCase();
  if (/\b(court|judge|magistrate|tribunal|petition|suit|appeal|writ|fir|police|station)\b/.test(c)) {
    return 'Court details';
  }
  if (/\b(property|land|plot|flat|premises|survey|gat|taluka|village|boundary|east|west|north|south|carpet|sq\.?)\b/.test(c)) {
    return 'Property details';
  }
  if (/\b(rs\.?|rupees|inr|amount|rent|deposit|consideration|cheque|bank|gst|pan|tax|fee|interest|salary)\b/.test(c)) {
    return 'Financial details';
  }
  if (/\b(witness|attested|signed in presence)\b/.test(c)) {
    return 'Witness details';
  }
  if (/\b(second part|other part|respondent|defendant|licensee|tenant|vendee|purchaser|donee|opposite party|accused)\b/.test(c)) {
    return 'Second party details';
  }
  if (/\b(one part|first part|plaintiff|petitioner|applicant|deponent|licensor|landlord|vendor|donor|testator)\b/.test(c)) {
    return 'First party details';
  }
  if (/\b(date|day of|month|year|place|city|state|verified at|executed at)\b/.test(c)) {
    return 'Execution details';
  }
  return 'Applicant details';
}

function inferLabelFromLeftContext(leftContext: string, index: number): { label: string; type: FieldType } {
  const cleaned = leftContext
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^A-Za-z0-9\s\/\-\(\)\.,]/g, ' ')
    .trim();
  const words = cleaned.split(/\s+/).slice(-6).join(' ').replace(/^[,.\-:\)]+/, '').trim();
  if (!words || words.length < 3) {
    return { label: `Document Field ${index}`, type: 'text' };
  }
  const lower = words.toLowerCase();
  let type: FieldType = 'text';
  if (/\b(date|dated|on)\b/.test(lower)) type = 'date';
  else if (/\b(address|details|schedule|description|facts|grounds|reason|particulars)\b/.test(lower)) type = 'textarea';
  else if (/\b(age|years|months|days|pin|pincode)\b/.test(lower)) type = 'number';
  else if (/\b(email|e-mail)\b/.test(lower)) type = 'email';
  else if (/\b(mobile|phone|tel|contact)\b/.test(lower)) type = 'phone';

  const pretty = words.charAt(0).toUpperCase() + words.slice(1);
  return { label: `${pretty} (Blank #${index})`, type };
}

export function detectVariablesForDocument(
  preservedText: string,
  rawCategory: string
): VariableDetectionResult {
  let working = preservedText;
  const fieldMap = new Map<string, FormFieldSchema>();

  // Helper to replace literal occurrences cleanly and record mapping
  const bindToken = (
    field: Omit<FormFieldSchema, 'mappings'>,
    exactToken: string,
    confidence: PlaceholderMapping['confidence']
  ) => {
    if (!exactToken || exactToken.length < 2) return;
    const escaped = exactToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const matches = working.match(re);
    if (!matches || matches.length === 0) return;

    working = working.replace(re, `{{${field.fieldId}}}`);
    const existing = fieldMap.get(field.fieldId);
    const mapping: PlaceholderMapping = {
      matchToken: exactToken,
      occurrenceCount: matches.length,
      confidence,
    };
    if (existing) {
      existing.mappings.push(mapping);
    } else {
      fieldMap.set(field.fieldId, { ...field, mappings: [mapping] });
    }
  };

  // Phase 1: Contextual Indian legal patterns
  for (const spec of CONTEXTUAL_PATTERNS) {
    const matches = [...working.matchAll(spec.regex)];
    if (matches.length === 0) continue;

    for (const m of matches) {
      const target = spec.captureGroup === 0 ? m[0] : m[spec.captureGroup ?? 1];
      if (!target) continue;
      // Avoid grabbing massive spans
      if (target.length > 90) continue;
      // If it's a short 2-3 letter anonymized initial like MJ or XY, replace all whole-word matches
      if (/^[A-Z]{2,3}$/.test(target.trim())) {
        const wordRe = new RegExp(`\\b${target.trim()}\\b`, 'g');
        const count = (working.match(wordRe) || []).length;
        if (count > 0) {
          working = working.replace(wordRe, `{{${spec.fieldId}}}`);
          const existing = fieldMap.get(spec.fieldId);
          const mapping: PlaceholderMapping = {
            matchToken: target.trim(),
            matchRegex: `\\b${target.trim()}\\b`,
            occurrenceCount: count,
            confidence: 'high',
          };
          if (existing) existing.mappings.push(mapping);
          else {
            fieldMap.set(spec.fieldId, {
              fieldId: spec.fieldId,
              label: spec.label,
              type: spec.type,
              group: spec.group,
              required: spec.required,
              placeholder: spec.placeholder,
              helperText: spec.helperText,
              options: spec.options,
              validation: spec.validation,
              mappings: [mapping],
            });
          }
        }
      } else {
        bindToken(
          {
            fieldId: spec.fieldId,
            label: spec.label,
            type: spec.type,
            group: spec.group,
            required: spec.required,
            placeholder: spec.placeholder,
            helperText: spec.helperText,
            options: spec.options,
            validation: spec.validation,
          },
          target,
          'high'
        );
      }
    }
  }

  // Phase 2: Explicit bracketed/angle placeholders e.g. [Company Name], <<State>>, <Date>
  const explicitTagRe = /(\[[A-Za-z0-9 _\/\-\.,]{2,45}\]|<<[A-Za-z0-9 _\/\-]{2,35}>>|<[A-Za-z0-9 _\/\-]{2,30}>)/g;
  const seenExplicit = new Map<string, string>();
  let tagMatch: RegExpExecArray | null;
  const explicitMatches: Array<{ token: string; index: number }> = [];
  while ((tagMatch = explicitTagRe.exec(working)) !== null) {
    explicitMatches.push({ token: tagMatch[0], index: tagMatch.index });
  }
  for (const em of explicitMatches) {
    if (em.token.startsWith('{{')) continue;
    const inner = em.token.replace(/^[\[<]+|[\]>]+$/g, '').trim();
    const fid = seenExplicit.get(em.token) || `var_${sanitizeFieldId(inner) || 'field'}`;
    if (!fieldMap.has(fid)) {
      const ctx = working.slice(Math.max(0, em.index - 80), em.index);
      const group = inferGroupFromContext(ctx + ' ' + inner);
      let type: FieldType = 'text';
      if (/date|dd\/mm/i.test(inner)) type = 'date';
      else if (/address|description|facts|details/i.test(inner)) type = 'textarea';
      else if (/amount|rs|age|pin/i.test(inner)) type = 'number';
      else if (/state/i.test(inner)) type = 'select';

      seenExplicit.set(em.token, fid);
      bindToken(
        {
          fieldId: fid,
          label: inner.charAt(0).toUpperCase() + inner.slice(1),
          type,
          group,
          required: true,
          options: type === 'select' ? INDIAN_STATES_AND_UTS : undefined,
        },
        em.token,
        'high'
      );
    } else {
      bindToken(fieldMap.get(fid)!, em.token, 'high');
    }
  }

  // Phase 3: Remaining literal blank runs (_____ or ...... or ……) -> sequential contextual fields (capped at 18 to avoid signature-line spam)
  // Note: ignore long signature lines at end of document preceded by "Signature" / "Witness" / "Deponent" unless needed
  const blankRe = /(?:_{4,}|\.{5,}|…{3,})/g;
  let blankIdx = 1;
  let safetyCounter = 0;
  while (safetyCounter < 22) {
    safetyCounter++;
    blankRe.lastIndex = 0;
    const m = blankRe.exec(working);
    if (!m) break;

    const before = working.slice(Math.max(0, m.index - 75), m.index);
    // Skip pure visual signature underlines like "WITNESSES:\n1. ___________"
    const tailLine = before.split('\n').pop() || '';
    if (/^\s*(?:witness(?:es)?|signature|deponent|executant|licensor|licensee|testator|vendor|purchaser|donor|donee|principal|attorney|plaintiff|petitioner|advocate)\s*(?:\d+\.)?\s*[:\-]?\s*$/i.test(tailLine)) {
      // Replace with a stable non-field signature marker temporarily and restore after loop
      working =
        working.slice(0, m.index) +
        '__SIG_LINE__' +
        working.slice(m.index + m[0].length);
      continue;
    }

    const cleanBefore = before.replace(/\{\{[a-z0-9_]+\}\}/g, ' ').replace(/\s+/g, ' ');
    const { label, type } = inferLabelFromLeftContext(cleanBefore, blankIdx);
    const fieldId = `blank_field_${blankIdx}`;
    blankIdx++;
    const group = inferGroupFromContext(cleanBefore);

    // Replace just this specific blank occurrence (not all blanks globally!)
    working =
      working.slice(0, m.index) +
      `{{${fieldId}}}` +
      working.slice(m.index + m[0].length);

    fieldMap.set(fieldId, {
      fieldId,
      label,
      type,
      group,
      required: false,
      placeholder: `Enter ${label.replace(/\s*\(Blank #\d+\)$/, '')}`,
      mappings: [
        {
          matchToken: m[0],
          occurrenceCount: 1,
          confidence: 'medium',
        },
      ],
    });
  }

  // Restore visual signature lines
  working = working.replace(/__SIG_LINE__/g, '___________________________');

  // Ensure every document has an explicit Jurisdiction State & Date control if none detected,
  // mapped safely in metadata without fabricating clauses (or bound if present)
  if (!fieldMap.has('jurisdiction_state')) {
    fieldMap.set('jurisdiction_state', {
      fieldId: 'jurisdiction_state',
      label: 'Governing Indian State / UT (Metadata & Verification)',
      type: 'select',
      group: 'Execution details',
      required: true,
      options: INDIAN_STATES_AND_UTS,
      helperText:
        'Explicit state jurisdiction for stamp duty & court verification. Not injected into clauses unless mapped.',
      mappings: [],
    });
  }
  if (!fieldMap.has('execution_date')) {
    fieldMap.set('execution_date', {
      fieldId: 'execution_date',
      label: 'Document Execution / Reference Date',
      type: 'date',
      group: 'Execution details',
      required: true,
      helperText: 'Explicit execution/filing date for document metadata.',
      mappings: [],
    });
  }

  // Detect repeatable sections (Witnesses / Additional Parties)
  const repeatableSections: RepeatableSectionSchema[] = [];
  if (/\bwitness(?:es)?\b/i.test(preservedText)) {
    repeatableSections.push({
      groupId: 'witnesses',
      title: 'Witnesses',
      itemLabel: 'Witness',
      minItems: 0,
      maxItems: 4,
      appendFormat: 'witness_block',
    });
    fieldMap.set('witness_name', {
      fieldId: 'witness_name',
      label: 'Witness Full Name',
      type: 'text',
      group: 'Witness details',
      required: true,
      repeatableGroupId: 'witnesses',
      mappings: [],
    });
    fieldMap.set('witness_address', {
      fieldId: 'witness_address',
      label: 'Witness Address',
      type: 'text',
      group: 'Witness details',
      required: true,
      repeatableGroupId: 'witnesses',
      mappings: [],
    });
  }

  if (/\b(?:co-sharers|parties|respondents|defendants|petitioners)\b/i.test(preservedText) || /agreement|deed|partition|partnership/i.test(rawCategory)) {
    repeatableSections.push({
      groupId: 'additional_parties',
      title: 'Additional Parties / Co-Applicants',
      itemLabel: 'Additional Party',
      minItems: 0,
      maxItems: 6,
      appendFormat: 'party_block',
    });
    fieldMap.set('extra_party_name', {
      fieldId: 'extra_party_name',
      label: 'Party Full Name',
      type: 'text',
      group: 'Second party details',
      required: true,
      repeatableGroupId: 'additional_parties',
      mappings: [],
    });
    fieldMap.set('extra_party_role', {
      fieldId: 'extra_party_role',
      label: 'Role (e.g., Co-Owner / Respondent / Surety)',
      type: 'text',
      group: 'Second party details',
      required: false,
      repeatableGroupId: 'additional_parties',
      mappings: [],
    });
    fieldMap.set('extra_party_address', {
      fieldId: 'extra_party_address',
      label: 'Address & Particulars',
      type: 'textarea',
      group: 'Second party details',
      required: true,
      repeatableGroupId: 'additional_parties',
      mappings: [],
    });
  }

  return {
    fields: Array.from(fieldMap.values()),
    repeatableSections,
    tokenizedTemplate: working,
  };
}
