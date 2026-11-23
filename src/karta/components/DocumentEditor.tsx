import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileDown,
  FileText,
  Lock,
  PenLine,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Scale,
  ShieldCheck,
  Stamp,
  Trash2,
} from 'lucide-react';
import {
  DocumentValidationReport,
  EStampConfig,
  FormFieldSchema,
  GeneratedDocumentResult,
  SavedUserDocument,
  SignatureConfig,
  TemplateDetail,
} from '../shared/types';
import {
  APPROVED_TEMPLATE_BANNER,
  CATEGORY_THEMES,
  FIELD_GROUP_ORDER,
  INDIAN_STATES_AND_UTS,
  NEEDS_REVIEW_BANNER,
  NON_EXECUTED_STATUS_NOTICE,
  PDF_RECONSTRUCTED_NOTICE,
} from '../shared/constants';
import { downloadExportFile, fetchTemplateDetail, renderDraft } from '../lib/api';
import { DocumentValidatorPanel } from './DocumentValidatorPanel';
import { EStampPanel } from './EStampPanel';
import { SignaturePad } from './SignaturePad';
import { LegalAssistantPanel } from './LegalAssistantPanel';
import {
  DigitalSignatureGeneratorControls,
  detectPartiesAndWitnessesFromSchema,
} from './DigitalSignatureArea';
import { detectStampPaperRequirement } from './EStampSimulationOverlay';
import { STAMP_BACKGROUND_PATTERNS } from '../../assets/stamp-papers';
import { FlippableDocumentPreview } from './FlippableDocumentPreview';
import { IntelligentClauseLibrary } from './IntelligentClauseLibrary';

interface Props {
  templateId: string | null;
  initialDraft?: SavedUserDocument | null;
  ephemeralMode: boolean;
  onBackToLibrary: () => void;
  onSaveLocalDraft: (draft: SavedUserDocument) => void;
  onSealToCloudVault?: (draft: SavedUserDocument) => void;
}

type StudioStep = 'form' | 'validate' | 'stamp_sign' | 'aid_export';

function isFieldVisibleClient(field: FormFieldSchema, values: Record<string, string>): boolean {
  if (!field.conditionalOn) return true;
  const depVal = (values[field.conditionalOn.dependsOnFieldId] ?? '').trim();
  if (field.conditionalOn.operator === 'not_empty') return depVal.length > 0;
  if (field.conditionalOn.operator === 'equals') return depVal === (field.conditionalOn.value ?? '');
  return true;
}


function extractPartyHints(values: Record<string, string>) {
  const firstParty =
    values['applicant_name'] ||
    values['applicant_or_first_party_name'] ||
    values['first_party_name'] ||
    values['deponent_name'] ||
    values['licensor_name'] ||
    values['petitioner_name'] ||
    values['testator_name'] ||
    values['primaryPartyName'] ||
    '';

  const secondParty =
    values['second_party_name'] ||
    values['licensee_name'] ||
    values['respondent_name'] ||
    values['opposite_party_name'] ||
    values['advocate_name'] ||
    '';

  const place =
    values['place_of_execution'] ||
    values['execution_place'] ||
    values['city'] ||
    values['district'] ||
    '';

  const execDate = values['execution_date'] || '';

  const consideration =
    values['consideration_amount'] ||
    values['sale_consideration'] ||
    values['rent_amount'] ||
    values['monthly_rent'] ||
    values['amount'] ||
    '';

  return { firstParty, secondParty, place, execDate, consideration };
}

export function DocumentEditor({
  templateId,
  initialDraft,
  ephemeralMode,
  onBackToLibrary,
  onSaveLocalDraft,
  onSealToCloudVault,
}: Props) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [studioStep, setStudioStep] = useState<StudioStep>('form');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [repeatableValues, setRepeatableValues] = useState<
    Record<string, Array<Record<string, string>>>
  >({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [generated, setGenerated] = useState<GeneratedDocumentResult | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [lastPreClauseSnapshot, setLastPreClauseSnapshot] = useState<{
    content: string;
    wasManualEdit: boolean;
  } | null>(null);
  const [previewTab, setPreviewTab] = useState<'preview' | 'edit' | 'original'>('preview');
  const [highlightReplaced, setHighlightReplaced] = useState(true);
  const [showLegalTermHelper, setShowLegalTermHelper] = useState(true);

  const [validationReport, setValidationReport] = useState<DocumentValidationReport | null>(null);

  const [eStamp, setEStamp] = useState<EStampConfig>({
    mode: 'none',
    state: '',
    denominationInr: '100',
    certificateNumber: '',
    purchasedBy: '',
    purchaseDate: '',
    articleDescription: '',
    secondParty: '',
    showSimulationOverlay: false,
  });

  const [signature, setSignature] = useState<SignatureConfig>({
    enabled: true,
    layoutPreset: 'two_party',
    signerName: '',
    signerRole: 'First Party / Executant',
    secondPartyName: '',
    secondPartyRole: 'Second Party / Counterparty',
    signedAtPlace: '',
    signatureDate: '',
    includeDateLines: true,
    signatureDataUrl: '',
    witnessCount: 2,
    witness1Name: '',
    witness1Address: '',
    witness2Name: '',
    witness2Address: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState('');

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setFieldErrors({});
    setSubmitError(null);
    setSaveMessage(null);
    setValidationReport(null);
    setLastPreClauseSnapshot(null);
    setStudioStep('form');

    fetchTemplateDetail(templateId)
      .then((detail) => {
        if (cancelled) return;
        setTemplate(detail);

        const defaults: Record<string, string> = {};
        for (const f of detail.fields) {
          if (f.repeatableGroupId) continue;
          defaults[f.fieldId] = f.defaultValue || '';
        }
        const initialVals =
          initialDraft?.templateId === detail.id
            ? { ...defaults, ...initialDraft.formValues }
            : defaults;
        setFormValues(initialVals);

        const initRepeatables: Record<string, Array<Record<string, string>>> =
          initialDraft?.templateId === detail.id
            ? initialDraft.repeatableValues || {}
            : {};
        setRepeatableValues(initRepeatables);

        setVersionLabel(
          initialDraft?.templateId === detail.id
            ? initialDraft.label
            : `${detail.title} — Draft`
        );

        const hints = extractPartyHints(initialVals);
        const detected = detectPartiesAndWitnessesFromSchema(
          detail,
          initialVals,
          initRepeatables
        );

        const stampAssessment = detectStampPaperRequirement(
          detail.categoryGroup,
          detail.rawCategory,
          detail.title,
          detail.preservedSourceText
        );
        const firstP = detected.signerName || hints.firstParty;
        const secondP = detected.secondPartyName || hints.secondParty;

        setEStamp({
          mode: stampAssessment.required ? 'sample_preview' : 'none',
          state: initialVals['jurisdiction_state'] || 'Karnataka',
          denominationInr: stampAssessment.defaultDenominationInr,
          certificateNumber: '',
          purchasedBy: firstP,
          purchaseDate: detected.signatureDate || hints.execDate || new Date().toISOString().slice(0, 10),
          articleDescription: stampAssessment.defaultArticle,
          secondParty: secondP,
          accountReference: 'DRAFT-ACC-REF',
          uniqueDocReference: 'DRAFT-UDR-REF',
          documentSubDescription: detail.title,
          considerationPriceInr: hints.consideration || '0',
          stampDutyPaidBy: firstP,
          backgroundPattern: stampAssessment.required ? 'shcil_emerald' : 'none',
          backgroundScope: 'stamp_only',
          showSimulationOverlay: stampAssessment.required,
        });

        setSignature({
          enabled: true,
          layoutPreset: detected.preset,
          signerName: detected.signerName || hints.firstParty,
          signerRole: detected.signerRole,
          secondPartyName: detected.secondPartyName || hints.secondParty,
          secondPartyRole: detected.secondPartyRole,
          signedAtPlace: detected.signedAtPlace || hints.place,
          signatureDate: detected.signatureDate || hints.execDate,
          includeDateLines: true,
          signatureDataUrl: '',
          witnessCount: detected.witnessCount,
          witness1Name: detected.witness1Name,
          witness1Address: detected.witness1Address,
          witness2Name: detected.witness2Name,
          witness2Address: detected.witness2Address,
          witness3Name: detected.witness3Name,
          witness3Address: detected.witness3Address,
          additionalSignatories: detected.additionalSignatories,
        });

        if (initialDraft?.templateId === detail.id && initialDraft.renderedText) {
          setEditedContent(initialDraft.renderedText);
          setIsManualEdit(true);
          setGenerated({
            documentId: initialDraft.id,
            templateId: detail.id,
            templateTitle: detail.title,
            templateVersion: detail.version,
            categoryGroup: detail.categoryGroup,
            rawCategory: detail.rawCategory,
            sourcePath: detail.sourcePath,
            originalFormat: detail.originalFormat,
            reviewStatus: detail.reviewStatus,
            isReconstructedFromPdf: detail.isReconstructedFromPdf,
            hasFillablePdfOutput: detail.hasAcroForm,
            renderedText: initialDraft.renderedText,
            replacedOccurrences: [],
            unmappedBlankCount: 0,
            jurisdictionState: initialVals['jurisdiction_state'] || 'Not Specified',
            executionDate: initialVals['execution_date'] || 'Not Specified',
            disclaimerBanner:
              detail.reviewStatus === 'approved'
                ? APPROVED_TEMPLATE_BANNER
                : NEEDS_REVIEW_BANNER,
            statutoryWarnings: detail.statutoryWarnings,
            generatedAt: initialDraft.updatedAt,
          });
        } else {
          setGenerated(null);
          setEditedContent('');
          setIsManualEdit(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load template.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [templateId, initialDraft]);

  const livePreviewData = useMemo(() => {
    if (!template) {
      return { text: '', segments: [] as Array<{ text: string; replaced: boolean }> };
    }
    const working = template.tokenizedTemplate || template.preservedSourceText;

    const segments: Array<{ text: string; replaced: boolean }> = [];
    const tokenRegex = /\{\{([a-z0-9_]+)\}\}/g;
    const fieldById = new Map(template.fields.map((f) => [f.fieldId, f]));

    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = tokenRegex.exec(working)) !== null) {
      if (m.index > lastIdx) {
        segments.push({ text: working.slice(lastIdx, m.index), replaced: false });
      }
      const fid = m[1];
      const val = (formValues[fid] || '').trim();
      if (val) {
        segments.push({ text: val, replaced: true });
      } else {
        const f = fieldById.get(fid);
        segments.push({ text: `[${f?.label || fid}]`, replaced: false });
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < working.length) {
      segments.push({ text: working.slice(lastIdx), replaced: false });
    }

    const extraParties = repeatableValues['additional_parties'] || [];
    if (extraParties.length > 0) {
      const lines = extraParties
        .map((p, i) => {
          const n = (p.extra_party_name || '').trim();
          const r = (p.extra_party_role || 'Party').trim();
          const a = (p.extra_party_address || '').trim();
          return n || a ? `${i + 1}. ${n}${r ? ` (${r})` : ''}${a ? ` — ${a}` : ''}` : '';
        })
        .filter(Boolean);
      if (lines.length > 0) {
        segments.push({
          text: `\n\nADDITIONAL PARTIES SCHEDULE:\n${lines.join('\n')}`,
          replaced: true,
        });
      }
    }
    const extraWitnesses = repeatableValues['witnesses'] || [];
    if (extraWitnesses.length > 0) {
      const lines = extraWitnesses
        .map((w, i) => {
          const n = (w.witness_name || '').trim();
          const a = (w.witness_address || '').trim();
          return n || a
            ? `Additional Witness ${i + 1}: ${n}${a ? `, Address: ${a}` : ''}   Signature: ________________`
            : '';
        })
        .filter(Boolean);
      if (lines.length > 0) {
        segments.push({
          text: `\n\nADDITIONAL WITNESS ATTESTATION:\n${lines.join('\n')}`,
          replaced: true,
        });
      }
    }

    const plainText = segments.map((s) => s.text).join('');
    return { text: plainText, segments };
  }, [template, formValues, repeatableValues]);

  const activeContent = isManualEdit
    ? editedContent
    : generated?.renderedText || livePreviewData.text;

  const groupedFields = useMemo(() => {
    if (!template) return [];
    const groups = new Map<string, FormFieldSchema[]>();
    for (const g of FIELD_GROUP_ORDER) groups.set(g, []);

    for (const f of template.fields) {
      if (f.repeatableGroupId) continue;
      if (!isFieldVisibleClient(f, formValues)) continue;
      const arr = groups.get(f.group) || [];
      arr.push(f);
      groups.set(f.group, arr);
    }
    return Array.from(groups.entries()).filter(([, arr]) => arr.length > 0);
  }, [template, formValues]);

  const partyHints = useMemo(() => extractPartyHints(formValues), [formValues]);

  const schemaDetection = useMemo(() => {
    if (!template) return null;
    return detectPartiesAndWitnessesFromSchema(template, formValues, repeatableValues);
  }, [template, formValues, repeatableValues]);

  const stampAssessment = useMemo(() => {
    if (!template) return null;
    return detectStampPaperRequirement(
      template.categoryGroup,
      template.rawCategory,
      template.title,
      template.preservedSourceText
    );
  }, [template]);

  const isStampOverlayVisible =
    Boolean(eStamp.showSimulationOverlay) || eStamp.mode !== 'none';
  const isSignatureAreaVisible = signature.enabled !== false;

  const toggleStampOverlay = () => {
    if (isStampOverlayVisible) {
      setEStamp((prev) => ({ ...prev, mode: 'none', showSimulationOverlay: false }));
    } else {
      setPreviewTab('preview');
      setEStamp((prev) => ({
        ...prev,
        mode: prev.mode === 'none' ? 'sample_preview' : prev.mode,
        state: prev.state || formValues['jurisdiction_state'] || 'Karnataka',
        purchasedBy: prev.purchasedBy || partyHints.firstParty,
        secondParty: prev.secondParty || partyHints.secondParty,
        considerationPriceInr: prev.considerationPriceInr || partyHints.consideration || '0',
        stampDutyPaidBy: prev.stampDutyPaidBy || prev.purchasedBy || partyHints.firstParty,
        backgroundPattern:
          prev.backgroundPattern && prev.backgroundPattern !== 'none'
            ? prev.backgroundPattern
            : 'shcil_emerald',
        backgroundScope: prev.backgroundScope || 'stamp_only',
        purchaseDate: prev.purchaseDate || partyHints.execDate || new Date().toISOString().slice(0, 10),
        showSimulationOverlay: true,
      }));
    }
  };

  const toggleSignatureArea = () => {
    setSignature((prev) => ({
      ...prev,
      enabled: !isSignatureAreaVisible,
      signerName: prev.signerName || partyHints.firstParty,
      secondPartyName: prev.secondPartyName || partyHints.secondParty,
      signedAtPlace: prev.signedAtPlace || partyHints.place,
      signatureDate: prev.signatureDate || partyHints.execDate,
    }));
  };

  const handleSyncSignatureFromSchema = () => {
    if (!template) return;
    const detected = detectPartiesAndWitnessesFromSchema(
      template,
      formValues,
      repeatableValues
    );
    setSignature((prev) => ({
      ...prev,
      enabled: true,
      layoutPreset: detected.preset,
      signerName: detected.signerName || prev.signerName,
      signerRole: detected.signerRole || prev.signerRole,
      secondPartyName: detected.secondPartyName || prev.secondPartyName,
      secondPartyRole: detected.secondPartyRole || prev.secondPartyRole,
      signedAtPlace: detected.signedAtPlace || prev.signedAtPlace,
      signatureDate: detected.signatureDate || prev.signatureDate,
      witnessCount: detected.witnessCount,
      witness1Name: detected.witness1Name || prev.witness1Name,
      witness1Address: detected.witness1Address || prev.witness1Address,
      witness2Name: detected.witness2Name || prev.witness2Name,
      witness2Address: detected.witness2Address || prev.witness2Address,
      witness3Name: detected.witness3Name || prev.witness3Name,
      witness3Address: detected.witness3Address || prev.witness3Address,
      additionalSignatories:
        detected.additionalSignatories.length > 0
          ? detected.additionalSignatories
          : prev.additionalSignatories,
    }));
    setSaveMessage(`Synced signature area (${detected.summaryText}).`);
  };

  const handleInjectSignatureTextBlock = (blockText: string) => {
    const baseText = activeContent.trimEnd();
    const combined = `${baseText}\n${blockText}\n`;
    setEditedContent(combined);
    setIsManualEdit(true);
    setPreviewTab('edit');
    setSaveMessage('Signature, date, and witness block appended to editable document text.');
  };

  const handleInjectLibraryClause = (
    nextContent: string,
    clauseTitle: string,
    assignedNumber: number | null
  ) => {
    setLastPreClauseSnapshot({
      content: isManualEdit ? editedContent : activeContent,
      wasManualEdit: isManualEdit,
    });
    setEditedContent(nextContent);
    setIsManualEdit(true);
    setPreviewTab('preview');
    setSaveMessage(
      `Injected "${clauseTitle}"${
        assignedNumber ? ` as Clause ${assignedNumber}` : ''
      } into the draft preview.`
    );
  };

  const handleUndoClauseInjection = () => {
    if (!lastPreClauseSnapshot) return;
    setEditedContent(lastPreClauseSnapshot.content);
    setIsManualEdit(lastPreClauseSnapshot.wasManualEdit);
    setLastPreClauseSnapshot(null);
    setSaveMessage('Reverted last clause injection.');
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!template) return;
    setSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);
    setSaveMessage(null);

    try {
      const res = await renderDraft({
        templateId: template.id,
        formValues,
        repeatableValues,
      });
      setGenerated(res);
      setEditedContent(res.renderedText);
      setIsManualEdit(false);
      setPreviewTab('preview');
      // Sync schema-detected parties, dates, and witnesses into signature & stamp if empty
      const hints = extractPartyHints(formValues);
      const detected = detectPartiesAndWitnessesFromSchema(
        template,
        formValues,
        repeatableValues
      );
      setSignature((prev) => ({
        ...prev,
        signerName: prev.signerName || detected.signerName || hints.firstParty,
        secondPartyName: prev.secondPartyName || detected.secondPartyName || hints.secondParty,
        signedAtPlace: prev.signedAtPlace || detected.signedAtPlace || hints.place,
        signatureDate: prev.signatureDate || detected.signatureDate || hints.execDate,
        witnessCount:
          repeatableValues['witnesses']?.length
            ? Math.min(3, repeatableValues['witnesses'].length)
            : prev.witnessCount,
        witness1Name: prev.witness1Name || detected.witness1Name,
        witness1Address: prev.witness1Address || detected.witness1Address,
        witness2Name: prev.witness2Name || detected.witness2Name,
        witness2Address: prev.witness2Address || detected.witness2Address,
        witness3Name: prev.witness3Name || detected.witness3Name,
        witness3Address: prev.witness3Address || detected.witness3Address,
        additionalSignatories:
          detected.additionalSignatories.length > 0
            ? detected.additionalSignatories
            : prev.additionalSignatories,
      }));
      setEStamp((prev) => ({
        ...prev,
        state: prev.state || formValues['jurisdiction_state'] || '',
        purchasedBy: prev.purchasedBy || detected.signerName || hints.firstParty,
        secondParty: prev.secondParty || detected.secondPartyName || hints.secondParty,
        purchaseDate: prev.purchaseDate || detected.signatureDate || hints.execDate,
      }));
      setStudioStep('validate');
    } catch (err) {
      const e2 = err as Error & { fieldErrors?: Record<string, string> };
      if (e2.fieldErrors) setFieldErrors(e2.fieldErrors);
      setSubmitError(e2.message || 'Validation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!template) return;
    setExporting(format);
    setSubmitError(null);
    try {
      let finalPayloadText = activeContent;
      let docId = generated?.documentId;
      let banner = generated?.disclaimerBanner || NON_EXECUTED_STATUS_NOTICE;

      if (!generated && !isManualEdit) {
        const res = await renderDraft({
          templateId: template.id,
          formValues,
          repeatableValues,
        });
        setGenerated(res);
        setEditedContent(res.renderedText);
        finalPayloadText = res.renderedText;
        docId = res.documentId;
        banner = res.disclaimerBanner;
      }

      await downloadExportFile(format, {
        documentId: docId,
        templateId: template.id,
        templateTitle: template.title,
        templateVersion: template.version,
        sourcePath: template.sourcePath,
        jurisdictionState: formValues['jurisdiction_state'] || eStamp.state || 'Not Specified',
        executionDate: formValues['execution_date'] || 'Not Specified',
        isReconstructedFromPdf: template.isReconstructedFromPdf,
        disclaimerBanner: banner,
        title: versionLabel || template.title,
        content: finalPayloadText,
        eStamp: isStampOverlayVisible
          ? {
              ...eStamp,
              mode: eStamp.mode === 'none' ? 'sample_preview' : eStamp.mode,
            }
          : undefined,
        signature: isSignatureAreaVisible ? signature : undefined,
      });
    } catch (err) {
      const e2 = err as Error & { fieldErrors?: Record<string, string> };
      if (e2.fieldErrors) setFieldErrors(e2.fieldErrors);
      setSubmitError(e2.message || `Export to ${format.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  };

  const handleSaveLocally = () => {
    if (!template) return;
    if (ephemeralMode) {
      setSubmitError(
        'Private Session mode is active. Disable it in Saved Drafts to store drafts locally.'
      );
      return;
    }
    const partyHint =
      formValues['applicant_name'] ||
      formValues['applicant_or_first_party_name'] ||
      formValues['primaryPartyName'] ||
      '';
    const label = versionLabel.trim() || `${template.title}${partyHint ? ` (${partyHint})` : ''}`;
    onSaveLocalDraft({
      id: `local_${Date.now()}`,
      templateId: template.id,
      templateTitle: template.title,
      templateVersion: template.version,
      label,
      formValues,
      repeatableValues,
      renderedText: activeContent,
      updatedAt: new Date().toISOString(),
    });
    setSaveMessage('Saved version locally in your browser vault.');
  };

  const handleSealToCloudVaultClick = () => {
    if (!template || !onSealToCloudVault) return;
    const partyHint =
      formValues['applicant_name'] ||
      formValues['applicant_or_first_party_name'] ||
      formValues['primaryPartyName'] ||
      '';
    const label = versionLabel.trim() || `${template.title}${partyHint ? ` (${partyHint})` : ''}`;
    onSealToCloudVault({
      id: `cloud_pending_${Date.now()}`,
      templateId: template.id,
      templateTitle: template.title,
      templateVersion: template.version,
      label,
      formValues,
      repeatableValues,
      renderedText: activeContent,
      updatedAt: new Date().toISOString(),
    });
  };

  if (!templateId) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-4">
        <FileText className="w-10 h-10 text-[#FF671F] mx-auto" />
        <h1 className="text-2xl font-bold text-[#202124] dark:text-white">No Document Selected</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          Choose any supported legal template from the Digital India Project library to open the 4-step studio for editing, validation, E-Stamp Simulation overlay, Digital Signature Area generation, and legal guidance.
        </p>
        <button
          type="button"
          onClick={onBackToLibrary}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] cursor-pointer"
        >
          Browse Document Library
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12 text-sm text-slate-600 dark:text-slate-300">
        Loading document schema and preserved original text...
      </div>
    );
  }

  if (loadError || !template) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-4">
        <div className="p-4 bg-[#FEF2F2] dark:bg-rose-950/40 border border-[#FECACA] dark:border-rose-800 rounded-xl text-sm text-[#991B1B] dark:text-rose-300">
          {loadError || 'Template unavailable.'}
        </div>
        <button
          type="button"
          onClick={onBackToLibrary}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF671F] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Library
        </button>
      </div>
    );
  }

  const theme = CATEGORY_THEMES[template.categoryGroup] || {
    accentHex: '#FF671F',
    softBgClass: 'bg-[#FFF5F0] dark:bg-orange-950/35',
    borderClass: 'border-[#FED7AA] dark:border-orange-800',
    textClass: 'text-[#FF671F] dark:text-orange-400',
    shortDesc: '',
  };

  const hasSignaturePrepared = Boolean(signature.signatureDataUrl);

  const steps: Array<{
    id: StudioStep;
    num: string;
    label: string;
    icon: typeof ClipboardList;
    activeBg: string;
    activeText: string;
  }> = [
    {
      id: 'form',
      num: '1',
      label: 'Fill Form',
      icon: ClipboardList,
      activeBg: 'bg-[#FF671F] text-white border-[#FF671F]',
      activeText: 'text-[#FF671F]',
    },
    {
      id: 'validate',
      num: '2',
      label: 'Validate',
      icon: FileCheck2,
      activeBg: 'bg-[#202124] dark:bg-slate-700 text-white border-[#202124] dark:border-slate-600',
      activeText: 'text-[#202124] dark:text-slate-200',
    },
    {
      id: 'stamp_sign',
      num: '3',
      label: 'e-Stamp & Sign',
      icon: Stamp,
      activeBg: 'bg-[#B45309] text-white border-[#B45309]',
      activeText: 'text-[#B45309] dark:text-amber-400',
    },
    {
      id: 'aid_export',
      num: '4',
      label: 'Legal Aid & Export',
      icon: Scale,
      activeBg: 'bg-[#138808] text-white border-[#138808]',
      activeText: 'text-[#138808] dark:text-emerald-400',
    },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs print:hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: theme.accentHex }} />
        <div className="p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 flex-[1_1_320px] min-w-0">
            <button
              type="button"
              onClick={onBackToLibrary}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#FF671F] dark:hover:text-[#FF8A4C] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Document Library
            </button>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`font-semibold ${theme.textClass}`}>{template.categoryGroup}</span>
              <span aria-hidden="true">·</span>
              <span>{template.rawCategory}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular uppercase">{template.originalFormat}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">v{template.version}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  template.reviewStatus === 'approved'
                    ? 'text-[#138808] dark:text-emerald-400 font-medium'
                    : 'text-[#B45309] dark:text-amber-400 font-medium'
                }
              >
                {template.reviewStatus === 'approved' ? 'Admin-Approved Template' : 'Needs Legal Review'}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-[#202124] dark:text-white tracking-tight">
              {template.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">{template.description}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular break-all sm:break-normal">
              Source: {template.sourcePath} · Scope: {template.jurisdictionScope}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 max-w-full">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('docx')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exporting === 'docx' ? 'Preparing DOCX...' : 'Download DOCX'}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleExport('pdf')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#138808] rounded-lg hover:bg-[#0F6D06] disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exporting === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Organized 4-Step Studio Progress Bar */}
      <nav
        aria-label="Document studio workflow steps"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden"
      >
        {steps.map((s) => {
          const Icon = s.icon;
          const active = studioStep === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStudioStep(s.id)}
              className={`text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                active
                  ? s.activeBg
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-[#202124] dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 h-6 rounded-lg text-xs font-mono-tabular font-semibold inline-flex items-center justify-center shrink-0 ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s.num}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{s.label}</p>
                  <p
                    className={`text-[11px] truncate ${
                      active ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.id === 'form' &&
                      `${template.fields.filter((f) => !f.repeatableGroupId).length} dynamic fields`}
                    {s.id === 'validate' &&
                      (validationReport
                        ? `${validationReport.passedCount} pass · ${validationReport.errorCount} err`
                        : 'Blanks & statutory check')}
                    {s.id === 'stamp_sign' &&
                      `${isStampOverlayVisible ? 'Stamp Overlay' : 'No Stamp'} · ${
                        isSignatureAreaVisible ? 'Sig Block ON' : 'Sig OFF'
                      }`}
                    {s.id === 'aid_export' && 'Clause guidance & download'}
                  </p>
                </div>
              </div>
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : s.activeText}`} />
            </button>
          );
        })}
      </nav>

      {/* Jurisdiction & Statutory Disclaimer Strip */}
      <div className="bg-[#FFFDF8] dark:bg-amber-950/30 border border-[#F1E8D9] dark:border-amber-900/50 rounded-xl p-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 print:hidden">
        <div className="flex items-start gap-2.5">
          {template.reviewStatus === 'approved' ? (
            <ShieldCheck className="w-4 h-4 text-[#138808] dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#B45309] dark:text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold text-[#202124] dark:text-white">
              {template.reviewStatus === 'approved'
                ? 'Original Clauses Preserved — Unexecuted Draft Only'
                : 'Unreviewed Repository Template — Advocate Verification Required'}
            </p>
            <p>{template.disclaimer}</p>
            {template.isReconstructedFromPdf && (
              <p className="text-[#9A3412] dark:text-orange-300 font-medium">{PDF_RECONSTRUCTED_NOTICE}</p>
            )}
            {template.statutoryWarnings.length > 0 && (
              <ul className="list-disc pl-4 space-y-0.5 text-[#7C2D12] dark:text-amber-300 pt-1">
                {template.statutoryWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Main Split: Step Workspace (Left) + Preserved Document Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: DocumentEditor Sidebar */}
        <div className="lg:col-span-5 space-y-4 print:hidden">
          {/* Sidebar E-Stamp Simulation & Digital Signature Area Quick Controls */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-2xs">
            {/* E-Stamp Simulation Sidebar Control */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Stamp className="w-4 h-4 text-[#B45309] dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#202124] dark:text-white">
                      E-Stamp Reference Sheet
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                      {stampAssessment?.required
                        ? 'Auto-enabled: Stamp paper typically required'
                        : 'Optional: Court-fee / plain paper applies'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isStampOverlayVisible}
                  aria-label="Toggle E-Stamp Simulation header in preview"
                  onClick={toggleStampOverlay}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    isStampOverlayVisible
                      ? 'bg-[#138808] border-[#138808]'
                      : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isStampOverlayVisible ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {isStampOverlayVisible && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-[#FFFBEB] dark:bg-amber-950/30 border border-[#FDE68A] dark:border-amber-800/60 rounded-md text-xs">
                  <div>
                    <label
                      htmlFor="sidebar_estamp_state"
                      className="block text-[11px] font-medium text-[#78350F] dark:text-amber-300 mb-1"
                    >
                      State / UT Branding
                    </label>
                    <select
                      id="sidebar_estamp_state"
                      value={eStamp.state || formValues['jurisdiction_state'] || ''}
                      onChange={(e) => {
                        setPreviewTab('preview');
                        setEStamp((prev) => ({
                          ...prev,
                          mode: prev.mode === 'none' ? 'sample_preview' : prev.mode,
                          showSimulationOverlay: true,
                          state: e.target.value,
                        }));
                      }}
                      className="w-full h-8 px-2 bg-white dark:bg-slate-950 border border-[#D6CEBE] dark:border-slate-700 rounded text-xs text-[#1C1917] dark:text-slate-100"
                    >
                      <option value="">Select State / UT...</option>
                      {INDIAN_STATES_AND_UTS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="sidebar_estamp_value"
                      className="block text-[11px] font-medium text-[#78350F] dark:text-amber-300 mb-1"
                    >
                      Stamp Duty Value (INR)
                    </label>
                    <select
                      id="sidebar_estamp_value"
                      value={
                        ['10', '20', '50', '100', '200', '500', '1000', '2000', '5000'].includes(
                          eStamp.denominationInr
                        )
                          ? eStamp.denominationInr
                          : 'custom'
                      }
                      onChange={(e) => {
                        setPreviewTab('preview');
                        if (e.target.value !== 'custom') {
                          setEStamp((prev) => ({
                            ...prev,
                            mode: prev.mode === 'none' ? 'sample_preview' : prev.mode,
                            showSimulationOverlay: true,
                            denominationInr: e.target.value,
                          }));
                        }
                      }}
                      className="w-full h-8 px-2 bg-white dark:bg-slate-950 border border-[#D6CEBE] dark:border-slate-700 rounded text-xs font-mono-tabular text-[#1C1917] dark:text-slate-100"
                    >
                      {['10', '20', '50', '100', '200', '500', '1000', '2000', '5000'].map((amt) => (
                        <option key={amt} value={amt}>
                          Rs. {amt}/-
                        </option>
                      ))}
                      {!['10', '20', '50', '100', '200', '500', '1000', '2000', '5000'].includes(
                        eStamp.denominationInr
                      ) && (
                        <option value="custom">Custom (Rs. {eStamp.denominationInr})</option>
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* High-Resolution Stamp Paper Security Pattern Overlay Controls */}
              <div className="pt-2 border-t border-[#F0ECE1] dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#1B365D] dark:text-sky-300">
                    Security Background Pattern Overlay
                  </span>
                  <div className="inline-flex items-center bg-[#F3EFE7] dark:bg-slate-950 rounded p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewTab('preview');
                        setEStamp((prev) => ({ ...prev, backgroundScope: 'stamp_only' }));
                      }}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        (eStamp.backgroundScope || 'stamp_only') === 'stamp_only'
                          ? 'bg-white dark:bg-slate-800 text-[#1B365D] dark:text-white font-semibold shadow-2xs'
                          : 'text-[#57534E] dark:text-slate-400'
                      }`}
                    >
                      Stamp Header
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewTab('preview');
                        setEStamp((prev) => ({
                          ...prev,
                          backgroundScope: 'full_page',
                          backgroundPattern:
                            prev.backgroundPattern && prev.backgroundPattern !== 'none'
                              ? prev.backgroundPattern
                              : 'shcil_emerald',
                        }));
                      }}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        eStamp.backgroundScope === 'full_page'
                          ? 'bg-white dark:bg-slate-800 text-[#1B365D] dark:text-white font-semibold shadow-2xs'
                          : 'text-[#57534E] dark:text-slate-400'
                      }`}
                    >
                      Full Sheets
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {STAMP_BACKGROUND_PATTERNS.map((pat) => {
                    const selected = (eStamp.backgroundPattern || 'none') === pat.id;
                    return (
                      <button
                        key={pat.id}
                        type="button"
                        title={`${pat.label} — ${pat.subtitle}`}
                        onClick={() => {
                          setPreviewTab('preview');
                          setEStamp((prev) => ({
                            ...prev,
                            backgroundPattern: pat.id,
                            mode:
                              pat.id !== 'none' && prev.mode === 'none' && prev.backgroundScope !== 'full_page'
                                ? 'sample_preview'
                                : prev.mode,
                            showSimulationOverlay:
                              pat.id !== 'none' && prev.backgroundScope !== 'full_page'
                                ? true
                                : prev.showSimulationOverlay,
                          }));
                        }}
                        className={`group flex flex-col items-center p-1.5 rounded border text-center transition-colors ${
                          selected
                            ? 'border-[#1B365D] dark:border-sky-400 bg-[#EFF6FF] dark:bg-sky-950/50'
                            : 'border-[#D6CEBE] dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-[#1B365D]/60 dark:hover:border-slate-500'
                        }`}
                      >
                        <span
                          className="w-full h-7 rounded-xs border border-[#D6CEBE]/80 dark:border-slate-700 block mb-1"
                          style={
                            pat.url
                              ? {
                                  backgroundImage: `url("${pat.url}")`,
                                  backgroundSize: '120px 120px',
                                  backgroundRepeat: 'repeat',
                                }
                              : { backgroundColor: '#FFFEFA' }
                          }
                        />
                        <span className="text-[10px] leading-tight font-medium text-[#1C1917] dark:text-slate-200 line-clamp-1">
                          {pat.id === 'none'
                            ? 'Plain'
                            : pat.id === 'shcil_emerald'
                            ? 'Emerald'
                            : pat.id === 'saffron_bond'
                            ? 'Saffron'
                            : pat.id === 'indigo_judicial'
                            ? 'Indigo'
                            : 'Rosette'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Digital Signature Area Sidebar Toggle */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <PenLine className="w-4 h-4 text-[#FF671F] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#202124] dark:text-white">
                    Digital Signature Area
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate font-mono-tabular">
                    {schemaDetection?.summaryText || 'Auto-detects parties & witnesses'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setStudioStep('stamp_sign')}
                  className="text-[11px] font-semibold text-[#FF671F] hover:underline cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isSignatureAreaVisible}
                  aria-label="Toggle Digital Signature Area in preview"
                  onClick={toggleSignatureArea}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    isSignatureAreaVisible
                      ? 'bg-[#FF671F] border-[#FF671F]'
                      : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isSignatureAreaVisible ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Intelligent Context-Aware Clause Library Sidebar */}
          <IntelligentClauseLibrary
            categoryGroup={template.categoryGroup}
            rawCategory={template.rawCategory}
            documentTitle={template.title}
            activeContent={activeContent}
            hints={{
              firstParty: partyHints.firstParty,
              secondParty: partyHints.secondParty,
              jurisdictionState: formValues['jurisdiction_state'] || eStamp.state,
              place: partyHints.place,
            }}
            canUndo={lastPreClauseSnapshot !== null}
            onInjectClause={handleInjectLibraryClause}
            onUndoLastInjection={handleUndoClauseInjection}
          />

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-2xs">
            {studioStep === 'form' && (
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#202124] dark:text-white">
                    Step 1: Document Variables Form
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Original legal wording stays untouched; values populate every matching slot.
                  </p>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 shrink-0">
                  {template.fields.filter((f) => !f.repeatableGroupId).length} fields
                </span>
              </div>

              {submitError && (
                <div className="p-3 bg-[#FEF2F2] dark:bg-rose-950/40 border border-[#FECACA] dark:border-rose-800 rounded-lg text-xs text-[#991B1B] dark:text-rose-300">
                  {submitError}
                </div>
              )}

              {saveMessage && (
                <div className="p-3 bg-[#ECFDF5] dark:bg-emerald-950/40 border border-[#A7F3D0] dark:border-emerald-800 rounded-lg text-xs text-[#065F46] dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveMessage}</span>
                </div>
              )}

              {groupedFields.map(([groupName, fields]) => (
                <fieldset
                  key={groupName}
                  className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4 first:border-t-0 first:pt-0"
                >
                  <legend className="text-xs font-semibold uppercase tracking-wider text-[#FF671F]">
                    {groupName}
                  </legend>

                  {fields.map((field) => {
                    const totalOccurrences = field.mappings.reduce(
                      (sum, m) => sum + (m.occurrenceCount || 0),
                      0
                    );
                    const err = fieldErrors[field.fieldId];
                    const inputId = `field_${field.fieldId}`;

                    return (
                      <div key={field.fieldId} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <label
                            htmlFor={inputId}
                            className="block text-xs font-medium text-[#202124] dark:text-slate-200"
                          >
                            {field.label}
                            {field.required && <span className="text-[#FF671F] ml-1">*</span>}
                          </label>
                          {totalOccurrences > 0 && (
                            <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 shrink-0">
                              {totalOccurrences}{' '}
                              {totalOccurrences === 1 ? 'slot' : 'occurrences'}
                            </span>
                          )}
                        </div>

                        {field.type === 'textarea' ? (
                          <textarea
                            id={inputId}
                            rows={3}
                            value={formValues[field.fieldId] || ''}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.fieldId]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            id={inputId}
                            value={formValues[field.fieldId] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormValues((prev) => ({ ...prev, [field.fieldId]: val }));
                              if (field.fieldId === 'jurisdiction_state' && val) {
                                setEStamp((prev) => ({
                                  ...prev,
                                  state: prev.state || val,
                                }));
                              }
                            }}
                            className="w-full h-10 px-3 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
                          >
                            <option value="">Select {field.label}...</option>
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={inputId}
                            type={field.type === 'phone' ? 'tel' : field.type}
                            value={formValues[field.fieldId] || ''}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.fieldId]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            className="w-full h-10 px-3 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
                          />
                        )}

                        {field.helperText && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{field.helperText}</p>
                        )}
                        {err && <p className="text-xs text-[#991B1B] dark:text-rose-400 font-medium">{err}</p>}
                      </div>
                    );
                  })}
                </fieldset>
              ))}

              {/* Repeatable Sections */}
              {template.repeatableSections.map((section) => {
                const subFields = template.fields.filter(
                  (f) => f.repeatableGroupId === section.groupId
                );
                const entries = repeatableValues[section.groupId] || [];
                if (subFields.length === 0) return null;

                return (
                  <div key={section.groupId} className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF671F]">
                          {section.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Optional repeatable section appended to schedule/attestation
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={entries.length >= section.maxItems}
                        onClick={() =>
                          setRepeatableValues((prev) => ({
                            ...prev,
                            [section.groupId]: [...(prev[section.groupId] || []), {}],
                          }))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#FF671F] dark:text-orange-300 bg-[#FFF5F0] dark:bg-orange-950/40 border border-[#FED7AA] dark:border-orange-800 rounded-lg hover:bg-[#FFEDD5] dark:hover:bg-orange-950/70 disabled:opacity-40 whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add {section.itemLabel}
                      </button>
                    </div>

                    {entries.map((itemVals, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-[#F7F8FA] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#202124] dark:text-white">
                            {section.itemLabel} #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRepeatableValues((prev) => ({
                                ...prev,
                                [section.groupId]: (prev[section.groupId] || []).filter(
                                  (_, i) => i !== idx
                                ),
                              }))
                            }
                            className="text-xs text-[#991B1B] dark:text-rose-400 inline-flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                        {subFields.map((sf) => (
                          <div key={sf.fieldId} className="space-y-1">
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              {sf.label}
                            </label>
                            <input
                              type="text"
                              value={itemVals[sf.fieldId] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRepeatableValues((prev) => {
                                  const arr = [...(prev[section.groupId] || [])];
                                  arr[idx] = { ...arr[idx], [sf.fieldId]: val };
                                  return { ...prev, [section.groupId]: arr };
                                });
                              }}
                              className="w-full h-9 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100"
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Version Label & Submit */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                <div className="space-y-1">
                  <label htmlFor="draft_label" className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Draft Version Label (for Saved Versions / Export Filename)
                  </label>
                  <input
                    id="draft_label"
                    type="text"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {submitting ? 'Rendering Draft...' : 'Generate & Proceed to Validate →'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveLocally}
                    disabled={ephemeralMode}
                    title={
                      ephemeralMode
                        ? 'Disabled in Private Session mode'
                        : 'Save a browser-local copy'
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Locally
                  </button>
                </div>
              </div>
            </form>
          )}

          {studioStep === 'validate' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-[#202124] dark:text-white">
                  Step 2: Validate Draft &amp; Statutory Checks
                </h2>
              </div>
              <DocumentValidatorPanel
                content={activeContent}
                title={versionLabel || template.title}
                rawCategory={template.rawCategory}
                jurisdictionState={formValues['jurisdiction_state'] || eStamp.state}
                executionDate={formValues['execution_date']}
                hasSignature={hasSignaturePrepared}
                eStampMode={eStamp.mode}
                eStampCertNumber={eStamp.certificateNumber}
                onJumpToForm={() => setStudioStep('form')}
                onReportReady={setValidationReport}
              />
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStudioStep('form')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-[#202124] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  ← Back to Form
                </button>
                <button
                  type="button"
                  onClick={() => setStudioStep('stamp_sign')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] cursor-pointer"
                >
                  Next: e-Stamp &amp; Signature →
                </button>
              </div>
            </div>
          )}

          {studioStep === 'stamp_sign' && (
            <div className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-[#202124] dark:text-white">
                  Step 3: E-Stamp Simulation &amp; Digital Signature Area
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Configure the stamp paper header simulation overlay and generate guided signature, date, and witness blocks.
                </p>
              </div>

              {saveMessage && (
                <div className="p-3 bg-[#ECFDF5] dark:bg-emerald-950/40 border border-[#A7F3D0] dark:border-emerald-800 rounded-lg text-xs text-[#065F46] dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{saveMessage}</span>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B45309] dark:text-amber-400">
                  E-Stamp Simulation &amp; Stamp Duty Guide
                </h3>
                <EStampPanel value={eStamp} onChange={setEStamp} />
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <DigitalSignatureGeneratorControls
                  value={signature}
                  schemaSummary={schemaDetection?.summaryText}
                  onChange={setSignature}
                  onSyncFromSchema={handleSyncSignatureFromSchema}
                  onInjectIntoText={handleInjectSignatureTextBlock}
                />

                <div className="pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF671F] mb-3">
                    Visual Signature Pad &amp; Signatory Details
                  </h3>
                  <SignaturePad value={signature} onChange={setSignature} />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStudioStep('validate')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-[#202124] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  ← Back to Validate
                </button>
                <button
                  type="button"
                  onClick={() => setStudioStep('aid_export')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#138808] rounded-lg hover:bg-[#0F6D06] cursor-pointer"
                >
                  Next: Legal Aid &amp; Export →
                </button>
              </div>
            </div>
          )}

          {studioStep === 'aid_export' && (
            <div className="space-y-6">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-[#202124] dark:text-white">
                  Step 4: Legal Assistance &amp; Document Export
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Review export readiness, consult clause explanations, or download DOCX/PDF with your E-Stamp header and Digital Signature Area.
                </p>
              </div>

              <div className="p-4 bg-[#ECFDF5] dark:bg-emerald-950/40 border border-[#A7F3D0] dark:border-emerald-800 rounded-xl space-y-3">
                <div className="text-xs text-[#065F46] dark:text-emerald-300 space-y-1">
                  <p className="font-semibold">Ready to Export Draft Package</p>
                  <p className="font-mono-tabular">
                    E-Stamp Overlay:{' '}
                    {!isStampOverlayVisible
                      ? 'Off (Plain Paper)'
                      : eStamp.mode === 'existing_certificate'
                      ? `Attached SHCIL ${eStamp.certificateNumber || '(serial pending)'}`
                      : `Simulation Facsimile (Rs. ${eStamp.denominationInr || '100'})`}
                    {' · '}
                    Signature Area: {isSignatureAreaVisible ? 'Included' : 'Hidden'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={exporting !== null}
                    onClick={() => handleExport('docx')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    {exporting === 'docx' ? 'Preparing DOCX...' : 'Export DOCX'}
                  </button>
                  <button
                    type="button"
                    disabled={exporting !== null}
                    onClick={() => handleExport('pdf')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#138808] rounded-lg hover:bg-[#0F6D06] disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    {exporting === 'pdf' ? 'Preparing PDF...' : 'Export PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLocally}
                    disabled={ephemeralMode}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Locally
                  </button>
                  {onSealToCloudVault && (
                    <button
                      type="button"
                      onClick={handleSealToCloudVaultClick}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Encrypt to Cloud Vault
                    </button>
                  )}
                </div>
              </div>

              <LegalAssistantPanel
                documentTitle={template.title}
                documentCategory={template.rawCategory}
                jurisdictionState={formValues['jurisdiction_state'] || eStamp.state || 'Not Specified'}
                documentExcerpt={activeContent}
              />

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-start">
                <button
                  type="button"
                  onClick={() => setStudioStep('stamp_sign')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:text-[#202124] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  ← Back to e-Stamp &amp; Sign
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* RIGHT COLUMN: Preserved Document Paper Preview & Editor */}
        <div className="lg:col-span-7 space-y-3">
          {/* Preview Toolbar with Quick Overlay & Signature Area Toggles */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs print:hidden">
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setPreviewTab('preview')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewTab === 'preview' ? 'bg-white dark:bg-slate-800 text-[#202124] dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-[#202124] dark:hover:text-slate-200'
                }`}
              >
                Completed Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isManualEdit) setEditedContent(activeContent);
                  setPreviewTab('edit');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewTab === 'edit' ? 'bg-white dark:bg-slate-800 text-[#202124] dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-[#202124] dark:hover:text-slate-200'
                }`}
              >
                Edit Generated Text
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('original')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  previewTab === 'original' ? 'bg-white dark:bg-slate-800 text-[#202124] dark:text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-[#202124] dark:hover:text-slate-200'
                }`}
              >
                Original Source (Read-Only)
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleStampOverlay}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  isStampOverlayVisible
                    ? 'bg-[#FFFBEB] dark:bg-amber-950/40 border-[#B45309] dark:border-amber-700 text-[#92400E] dark:text-amber-300'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#B45309]'
                }`}
              >
                <Stamp className="w-3.5 h-3.5 text-[#B45309] dark:text-amber-400" />
                {isStampOverlayVisible ? 'E-Stamp Overlay: ON' : '+ E-Stamp Simulation'}
              </button>

              <button
                type="button"
                onClick={toggleSignatureArea}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  isSignatureAreaVisible
                    ? 'bg-[#FFF5F0] dark:bg-orange-950/40 border-[#FF671F] dark:border-orange-700 text-[#C2410C] dark:text-orange-300'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#FF671F]'
                }`}
              >
                <PenLine className="w-3.5 h-3.5 text-[#FF671F]" />
                {isSignatureAreaVisible ? 'Signature Area: ON' : '+ Signature Area'}
              </button>

              {previewTab === 'preview' && (
                <button
                  type="button"
                  onClick={() => setShowLegalTermHelper((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    showLegalTermHelper
                      ? 'bg-[#ECFDF5] dark:bg-emerald-950/40 border-[#138808] dark:border-emerald-700 text-[#138808] dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#138808]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {showLegalTermHelper ? 'Legal Terms: ON' : 'Legal Terms: OFF'}
                </button>
              )}

              {previewTab === 'preview' && !isManualEdit && (
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={highlightReplaced}
                    onChange={(e) => setHighlightReplaced(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-[#FF671F]"
                  />
                  <span>Highlight fields</span>
                </label>
              )}
              {isManualEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setIsManualEdit(false);
                    setLastPreClauseSnapshot(null);
                    setEditedContent(generated?.renderedText || livePreviewData.text);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#FF671F] hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Document Paper Canvas: Flippable A4 Pages in Preview Mode */}
          {previewTab === 'preview' ? (
            <FlippableDocumentPreview
              segments={
                isManualEdit
                  ? [{ text: editedContent, replaced: false }]
                  : livePreviewData.segments
              }
              highlightReplaced={highlightReplaced && !isManualEdit}
              showLegalTermHelper={showLegalTermHelper}
              showStampOverlay={isStampOverlayVisible}
              showSignatureArea={isSignatureAreaVisible}
              eStamp={eStamp}
              signature={signature}
              jurisdictionState={formValues['jurisdiction_state']}
              executionDate={formValues['execution_date']}
              documentTitle={versionLabel || template.title}
              categoryGroup={template.categoryGroup}
              firstPartyFallback={partyHints.firstParty}
              secondPartyFallback={partyHints.secondParty}
              schemaSummary={schemaDetection?.summaryText}
              onQuickUpdateStamp={(patch) => setEStamp((prev) => ({ ...prev, ...patch }))}
              onDismissStamp={() =>
                setEStamp((prev) => ({ ...prev, mode: 'none', showSimulationOverlay: false }))
              }
              onOpenStampSignStep={() => setStudioStep('stamp_sign')}
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 md:p-10 shadow-2xs min-h-[700px] space-y-6 print:border-0 print:shadow-none print:p-0">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap justify-between gap-2">
                <span>{NON_EXECUTED_STATUS_NOTICE}</span>
                <span className="font-mono-tabular">
                  State: {formValues['jurisdiction_state'] || eStamp.state || 'Not Specified'} · Date:{' '}
                  {formValues['execution_date'] || 'Not Specified'}
                </span>
              </div>

              {previewTab === 'original' ? (
                <pre className="whitespace-pre-wrap font-editorial text-[15px] leading-[1.75] text-[#202124] dark:text-slate-200">
                  {template.preservedSourceText}
                </pre>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Manual edits apply directly to your DOCX/PDF export without altering the library template.
                  </p>
                  <textarea
                    value={isManualEdit ? editedContent : activeContent}
                    onChange={(e) => {
                      setIsManualEdit(true);
                      setEditedContent(e.target.value);
                    }}
                    rows={28}
                    aria-label="Editable completed legal document text"
                    className="w-full p-4 font-editorial text-[15px] leading-[1.75] bg-[#F7F8FA] dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
