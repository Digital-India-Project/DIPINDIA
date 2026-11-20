import {
  FormFieldSchema,
  GeneratedDocumentResult,
  TemplateDetail,
} from '../../src/karta/shared/types';
import {
  APPROVED_TEMPLATE_BANNER,
  NEEDS_REVIEW_BANNER,
  PDF_RECONSTRUCTED_NOTICE,
} from '../../src/karta/shared/constants';
import crypto from 'node:crypto';

export function isFieldVisible(
  field: FormFieldSchema,
  formValues: Record<string, string>
): boolean {
  if (!field.conditionalOn) return true;
  const depVal = (formValues[field.conditionalOn.dependsOnFieldId] ?? '').trim();
  if (field.conditionalOn.operator === 'not_empty') {
    return depVal.length > 0;
  }
  if (field.conditionalOn.operator === 'equals') {
    return depVal === (field.conditionalOn.value ?? '');
  }
  return true;
}

export function validateFormInput(
  fields: FormFieldSchema[],
  formValues: Record<string, string>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (field.repeatableGroupId) continue;
    if (!isFieldVisible(field, formValues)) continue;

    const rawVal = (formValues[field.fieldId] ?? field.defaultValue ?? '').trim();

    if (field.required && !rawVal) {
      errors[field.fieldId] = `${field.label} is required.`;
      continue;
    }

    if (!rawVal) continue;

    if (field.validation?.minLength && rawVal.length < field.validation.minLength) {
      errors[field.fieldId] = `${field.label} must be at least ${field.validation.minLength} characters.`;
      continue;
    }

    if (field.validation?.maxLength && rawVal.length > field.validation.maxLength) {
      errors[field.fieldId] = `${field.label} must be at most ${field.validation.maxLength} characters.`;
      continue;
    }

    if (field.validation?.pattern) {
      try {
        const re = new RegExp(field.validation.pattern);
        if (!re.test(rawVal)) {
          errors[field.fieldId] =
            field.validation.patternHint || `${field.label} does not match the required format.`;
        }
      } catch {
        // Ignore invalid admin regex
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Rebuild tokenizedTemplate from preservedSourceText whenever an administrator updates
 * field mappings (matchToken or matchRegex). Preserves all original wording verbatim.
 */
export function rebuildTokenizedTemplate(
  preservedSourceText: string,
  fields: FormFieldSchema[]
): string {
  let working = preservedSourceText;

  // Apply multi-occurrence literal / regex mappings first
  for (const field of fields) {
    if (field.repeatableGroupId) continue;
    for (const mapping of field.mappings) {
      if (mapping.matchRegex) {
        try {
          const re = new RegExp(mapping.matchRegex, 'g');
          working = working.replace(re, `{{${field.fieldId}}}`);
          continue;
        } catch {
          // Fall back to literal token
        }
      }
      if (mapping.matchToken && mapping.matchToken.length >= 2) {
        // Only replace generic blank tokens once if occurrenceCount === 1
        if (/^[_\.…]+$/.test(mapping.matchToken) && mapping.occurrenceCount === 1) {
          const idx = working.indexOf(mapping.matchToken);
          if (idx !== -1) {
            working =
              working.slice(0, idx) +
              `{{${field.fieldId}}}` +
              working.slice(idx + mapping.matchToken.length);
          }
        } else {
          const escaped = mapping.matchToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          working = working.replace(new RegExp(escaped, 'g'), `{{${field.fieldId}}}`);
        }
      }
    }
  }

  return working;
}

export function renderCompletedDocument(
  template: TemplateDetail,
  formValues: Record<string, string>,
  repeatableValues: Record<string, Array<Record<string, string>>> = {}
): GeneratedDocumentResult {
  let rendered = template.tokenizedTemplate || template.preservedSourceText;
  const replacedOccurrences: GeneratedDocumentResult['replacedOccurrences'] = [];

  for (const field of template.fields) {
    if (field.repeatableGroupId) continue;
    const token = `{{${field.fieldId}}}`;
    const occurrences = rendered.split(token).length - 1;
    if (occurrences === 0) continue;

    const val = (formValues[field.fieldId] ?? field.defaultValue ?? '').trim();
    const replacement = val || `[${field.label}]`;
    rendered = rendered.split(token).join(replacement);
    replacedOccurrences.push({
      fieldId: field.fieldId,
      label: field.label,
      count: occurrences,
    });
  }

  // Append repeatable party or witness blocks cleanly at the end without altering original clauses
  const extraParties = repeatableValues['additional_parties'] || [];
  if (extraParties.length > 0) {
    const lines = extraParties
      .map((p, idx) => {
        const name = (p.extra_party_name || '').trim();
        const role = (p.extra_party_role || 'Party').trim();
        const addr = (p.extra_party_address || '').trim();
        if (!name && !addr) return '';
        return `${idx + 1}. ${name}${role ? ` (${role})` : ''}${addr ? ` — ${addr}` : ''}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      rendered += `\n\nADDITIONAL PARTIES SCHEDULE:\n${lines.join('\n')}`;
    }
  }

  const extraWitnesses = repeatableValues['witnesses'] || [];
  if (extraWitnesses.length > 0) {
    const lines = extraWitnesses
      .map((w, idx) => {
        const name = (w.witness_name || '').trim();
        const addr = (w.witness_address || '').trim();
        if (!name && !addr) return '';
        return `Additional Witness ${idx + 1}: ${name}${addr ? `, Address: ${addr}` : ''}   Signature: ________________`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      rendered += `\n\nADDITIONAL WITNESS ATTESTATION:\n${lines.join('\n')}`;
    }
  }

  const remainingBlanks = (rendered.match(/(?:_{5,}|\.{6,})/g) || []).length;
  const jurisdictionState = (formValues['jurisdiction_state'] || 'Not Specified').trim();
  const executionDate = (formValues['execution_date'] || 'Not Specified').trim();

  let disclaimerBanner =
    template.reviewStatus === 'approved' ? APPROVED_TEMPLATE_BANNER : NEEDS_REVIEW_BANNER;
  if (template.isReconstructedFromPdf) {
    disclaimerBanner = `${PDF_RECONSTRUCTED_NOTICE} ${disclaimerBanner}`;
  }

  return {
    documentId: `doc_${crypto.randomUUID().slice(0, 12)}`,
    templateId: template.id,
    templateTitle: template.title,
    templateVersion: template.version,
    categoryGroup: template.categoryGroup,
    rawCategory: template.rawCategory,
    sourcePath: template.sourcePath,
    originalFormat: template.originalFormat,
    reviewStatus: template.reviewStatus,
    isReconstructedFromPdf: template.isReconstructedFromPdf,
    hasFillablePdfOutput: template.hasAcroForm,
    renderedText: rendered,
    replacedOccurrences,
    unmappedBlankCount: remainingBlanks,
    jurisdictionState,
    executionDate,
    disclaimerBanner,
    statutoryWarnings: template.statutoryWarnings,
    generatedAt: new Date().toISOString(),
  };
}
