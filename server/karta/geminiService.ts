import { GoogleGenAI, Type } from '@google/genai';
import { FieldGroup, FieldType, FormFieldSchema } from '../../src/karta/shared/types';
import { INDIAN_STATES_AND_UTS } from '../../src/karta/shared/constants';

function getAiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment secrets. Add a valid key in Settings > Secrets to run AI variable detection.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

const VALID_GROUPS: FieldGroup[] = [
  'Applicant details',
  'First party details',
  'Second party details',
  'Property details',
  'Financial details',
  'Witness details',
  'Court details',
  'Execution details',
];

const VALID_TYPES: FieldType[] = ['text', 'textarea', 'date', 'number', 'select', 'email', 'phone'];

export interface GeminiVariableAnalysisResult {
  suggestedDescription: string;
  jurisdictionScope: string;
  statutoryWarnings: string[];
  fields: FormFieldSchema[];
}

export async function analyzeDocumentVariablesWithGemini(
  preservedText: string,
  title: string,
  rawCategory: string
): Promise<GeminiVariableAnalysisResult> {
  const ai = getAiClient();
  const excerpt = preservedText.slice(0, 14000);

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze this Indian legal document template titled "${title}" (category: ${rawCategory}) and extract all variable placeholders, blanks, anonymized sample names (e.g., "Mr. MJ", "Shri ASR", "XY Co. Ltd."), sample addresses, dates, amounts, and repeated values that a user must fill via a form.

CRITICAL RULES:
1. Do NOT rewrite, summarize, or invent any legal clauses.
2. Every "exactMatchTokens" entry MUST be an exact, verbatim substring that exists in the document text below so our engine can replace every occurrence deterministically.
3. Group fields logically using only the allowed group names.
4. Suggest appropriate Indian legal validation hints (e.g. PAN, GSTIN, PIN code, date format) where relevant.

DOCUMENT TEXT:
"""
${excerpt}
"""`,
    config: {
      systemInstruction:
        'You are a legal document schema analyst for Indian law templates. Return strictly structured JSON identifying verbatim variable tokens inside the source document without rewriting or inventing legal text.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedDescription: {
            type: Type.STRING,
            description: 'Concise 1-2 sentence neutral description of what this document is used for.',
          },
          jurisdictionScope: {
            type: Type.STRING,
            description: 'Applicable Indian jurisdiction scope (e.g., All-India / State Stamp Act / High Court).',
          },
          statutoryWarnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Any outdated statute citations or legal review notes observed in the text.',
          },
          detectedFields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fieldId: { type: Type.STRING, description: 'Stable snake_case identifier.' },
                label: { type: Type.STRING, description: 'Clear user-facing form label.' },
                type: { type: Type.STRING, description: 'One of: text, textarea, date, number, select, email, phone.' },
                group: { type: Type.STRING, description: 'Logical group name.' },
                required: { type: Type.BOOLEAN },
                placeholder: { type: Type.STRING },
                helperText: { type: Type.STRING },
                validationHint: { type: Type.STRING },
                validationPattern: { type: Type.STRING },
                exactMatchTokens: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Exact verbatim substrings in the document text to replace with this field.',
                },
              },
              required: ['fieldId', 'label', 'type', 'group', 'required', 'exactMatchTokens'],
            },
          },
        },
        required: ['suggestedDescription', 'jurisdictionScope', 'statutoryWarnings', 'detectedFields'],
      },
    },
  });

  const rawJson = (response.text || '{}').trim();
  const parsed = JSON.parse(rawJson) as {
    suggestedDescription?: string;
    jurisdictionScope?: string;
    statutoryWarnings?: string[];
    detectedFields?: Array<{
      fieldId: string;
      label: string;
      type: string;
      group: string;
      required: boolean;
      placeholder?: string;
      helperText?: string;
      validationHint?: string;
      validationPattern?: string;
      exactMatchTokens?: string[];
    }>;
  };

  const fields: FormFieldSchema[] = [];
  const seenIds = new Set<string>();

  for (const df of parsed.detectedFields || []) {
    const cleanId = (df.fieldId || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!cleanId || seenIds.has(cleanId)) continue;

    // Verify each suggested token actually exists verbatim in preservedText
    const verifiedMappings = (df.exactMatchTokens || [])
      .map((tok) => tok.trim())
      .filter((tok) => tok.length >= 2 && preservedText.includes(tok))
      .map((tok) => {
        const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (preservedText.match(new RegExp(escaped, 'g')) || []).length;
        return {
          matchToken: tok,
          occurrenceCount: count,
          confidence: 'ai_suggested' as const,
        };
      })
      .filter((m) => m.occurrenceCount > 0);

    if (verifiedMappings.length === 0) continue;

    seenIds.add(cleanId);
    const safeType: FieldType = VALID_TYPES.includes(df.type as FieldType)
      ? (df.type as FieldType)
      : 'text';
    const safeGroup: FieldGroup = VALID_GROUPS.includes(df.group as FieldGroup)
      ? (df.group as FieldGroup)
      : 'Applicant details';

    fields.push({
      fieldId: cleanId,
      label: df.label || cleanId,
      type: safeType,
      group: safeGroup,
      required: Boolean(df.required),
      placeholder: df.placeholder,
      helperText: df.helperText,
      options: safeType === 'select' ? INDIAN_STATES_AND_UTS : undefined,
      validation:
        df.validationPattern || df.validationHint
          ? {
              pattern: df.validationPattern || undefined,
              patternHint: df.validationHint || undefined,
            }
          : undefined,
      mappings: verifiedMappings,
    });
  }

  return {
    suggestedDescription:
      parsed.suggestedDescription ||
      `AI-analyzed variable schema for ${title}. Requires administrator verification before approval.`,
    jurisdictionScope: parsed.jurisdictionScope || 'India — Verify State/Court Jurisdiction',
    statutoryWarnings: Array.isArray(parsed.statutoryWarnings) ? parsed.statutoryWarnings : [],
    fields,
  };
}

export async function askLegalAssistantWithGemini(params: {
  question: string;
  documentTitle?: string;
  documentCategory?: string;
  jurisdictionState?: string;
  documentExcerpt?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<string> {
  const ai = getAiClient();
  const excerpt = (params.documentExcerpt || '').slice(0, 10000);
  const historyText = (params.history || [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Context:
- Document Title: ${params.documentTitle || 'General Indian Legal Query'}
- Category: ${params.documentCategory || 'General'}
- Governing State/UT: ${params.jurisdictionState || 'Not explicitly selected (remind user that stamp duty & local rules depend on Indian State/UT)'}

${excerpt ? `Document Excerpt:\n"""\n${excerpt}\n"""\n` : ''}
${historyText ? `Prior Conversation:\n${historyText}\n` : ''}
User Question: ${params.question}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: `You are an Indian Legal Information Assistant inside the Digital India Legal Document Portal.
STRICT RULES:
1. Provide clear, structured, plain-language legal information grounded in Indian law and the supplied document excerpt.
2. NEVER provide binding legal advice, never claim to be an Advocate, and always recommend verification by a qualified Indian Advocate before execution or filing.
3. NEVER invent case citations, fake section numbers, exact local stamp duty rupees unless explicitly verified, or fake portal filing confirmations.
4. Explicitly highlight Indian procedural steps when relevant (e.g., Non-judicial / SHCIL e-Stamp paper, Registration Act 1908 Section 17 compulsory registration, Notary/Oath Commissioner attestation, post-2024 BNS/BNSS/BSA transitions, or limitation windows).
5. Keep answers concise, well-organized with bullet points, and directly focused on the user's question.`,
    },
  });

  return (response.text || '').trim() || 'No response returned from Gemini.';
}

