export type TemplateReviewStatus = 'approved' | 'needs_review' | 'disabled';

export type ProcessingStatus =
  | 'processed_ready'
  | 'processed_pdf_text'
  | 'processed_pdf_acroform'
  | 'needs_ocr_scanned_pdf'
  | 'unsupported_legacy_doc'
  | 'invalid_lock_artifact'
  | 'extraction_failed';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'select'
  | 'email'
  | 'phone';

export type FieldGroup =
  | 'Applicant details'
  | 'First party details'
  | 'Second party details'
  | 'Property details'
  | 'Financial details'
  | 'Witness details'
  | 'Court details'
  | 'Execution details';

export interface ConditionalRule {
  dependsOnFieldId: string;
  operator: 'equals' | 'not_empty';
  value?: string;
}

export interface ValidationRule {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternHint?: string;
}

export interface PlaceholderMapping {
  matchToken: string;
  matchRegex?: string;
  occurrenceCount: number;
  confidence: 'high' | 'medium' | 'ai_suggested' | 'manual';
}

export interface FormFieldSchema {
  fieldId: string;
  label: string;
  type: FieldType;
  group: FieldGroup;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  defaultValue?: string;
  options?: string[];
  validation?: ValidationRule;
  conditionalOn?: ConditionalRule;
  repeatableGroupId?: string;
  mappings: PlaceholderMapping[];
}

export interface RepeatableSectionSchema {
  groupId: string;
  title: string;
  itemLabel: string;
  minItems: number;
  maxItems: number;
  appendFormat: 'numbered_list' | 'witness_block' | 'party_block';
}

export interface AuditEntry {
  timestamp: string;
  action:
    | 'ingested'
    | 'ai_variables_detected'
    | 'fields_updated'
    | 'approved'
    | 'disabled'
    | 'marked_needs_review'
    | 'version_bumped';
  note: string;
  version: string;
  actor: string;
}

export interface TemplateSummary {
  id: string;
  title: string;
  categoryGroup: string;
  rawCategory: string;
  sourcePath: string;
  textFile: string;
  originalFormat: string;
  originalSizeBytes: number;
  processingStatus: ProcessingStatus;
  reviewStatus: TemplateReviewStatus;
  version: string;
  description: string;
  jurisdictionScope: string;
  disclaimer: string;
  statutoryWarnings: string[];
  tags: string[];
  batchFile: string | null;
  fieldCount: number;
  hasAcroForm: boolean;
  isReconstructedFromPdf: boolean;
  aiSuggested: boolean;
  errorReason: string | null;
  updatedAt: string;
}

export interface TemplateDetail extends TemplateSummary {
  preservedSourceText: string;
  tokenizedTemplate: string;
  fields: FormFieldSchema[];
  repeatableSections: RepeatableSectionSchema[];
  rawNoiseRemovedChars: number;
  auditHistory: AuditEntry[];
}

export interface GeneratedDocumentResult {
  documentId: string;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  categoryGroup: string;
  rawCategory: string;
  sourcePath: string;
  originalFormat: string;
  reviewStatus: TemplateReviewStatus;
  isReconstructedFromPdf: boolean;
  hasFillablePdfOutput: boolean;
  renderedText: string;
  replacedOccurrences: Array<{
    fieldId: string;
    label: string;
    count: number;
  }>;
  unmappedBlankCount: number;
  jurisdictionState: string;
  executionDate: string;
  disclaimerBanner: string;
  statutoryWarnings: string[];
  generatedAt: string;
}

export interface ProcessingErrorRecord {
  id: string;
  sourcePath: string;
  rawCategory: string;
  originalFormat: string;
  processingStatus: ProcessingStatus;
  reason: string;
  fileSizeBytes: number;
}

export interface BatchManifestEntry {
  category: string;
  file: string;
  source_documents: number;
  size_bytes: number;
}

export interface LibraryAuditReport {
  totalFilesDiscovered: number;
  catalogueJsonCount: number;
  catalogueCsvCount: number;
  batchManifestCount: number;
  uploadBatchSourceDocs: number;
  originalPdfsDirCount: number;
  originalUnconvertedDirCount: number;
  totalSupportedFiles: number;
  totalSuccessfullyProcessed: number;
  totalTemplatesCreated: number;
  filesNeedingManualReview: number;
  approvedTemplatesCount: number;
  disabledTemplatesCount: number;
  unsupportedOrFailedCount: number;
  breakdownByFormat: Record<string, number>;
  breakdownByStatus: Record<ProcessingStatus, number>;
  categoryGroups: Array<{
    name: string;
    total: number;
    processed: number;
    approved: number;
    unsupported: number;
  }>;
  rawCategories: Array<{
    name: string;
    group: string;
    total: number;
    processed: number;
  }>;
  tagCounts: Array<{
    tag: string;
    count: number;
  }>;
  lastIngestedAt: string;
  geminiConfigured: boolean;
  adminAuthConfigured: boolean;
}

export interface SavedUserDocument {
  id: string;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  label: string;
  formValues: Record<string, string>;
  repeatableValues: Record<string, Array<Record<string, string>>>;
  renderedText: string;
  updatedAt: string;
}

export type ValidationSeverity = 'pass' | 'warning' | 'error';

export interface ValidationCheckItem {
  id: string;
  category: 'Completeness' | 'Jurisdiction & Date' | 'Execution & Witnesses' | 'Statutory Currency' | 'Format Integrity';
  title: string;
  severity: ValidationSeverity;
  detail: string;
  suggestion?: string;
}

export interface ValidationProviderMeta {
  providerName: string;
  mode: 'built_in' | 'external_rest' | 'dip_desk';
  externalCalled: boolean;
  externalSucceeded: boolean;
  referenceId?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  note?: string;
}

export interface DocumentValidationReport {
  overallStatus: 'ready_for_advocate_review' | 'needs_attention' | 'incomplete';
  passedCount: number;
  warningCount: number;
  errorCount: number;
  unfilledBlankCount: number;
  wordCount: number;
  sha256Digest: string;
  checks: ValidationCheckItem[];
  validatedAt: string;
  providerMeta?: ValidationProviderMeta;
}

export interface EStampConfig {
  mode: 'none' | 'sample_preview' | 'existing_certificate';
  state: string;
  denominationInr: string;
  certificateNumber: string;
  purchasedBy: string;
  purchaseDate: string;
  articleDescription: string;
  secondParty?: string;
  accountReference?: string;
  uniqueDocReference?: string;
  documentSubDescription?: string;
  considerationPriceInr?: string;
  stampDutyPaidBy?: string;
  backgroundPattern?: 'none' | 'shcil_emerald' | 'saffron_bond' | 'indigo_judicial' | 'rosette_watermark';
  backgroundScope?: 'stamp_only' | 'full_page';
  showSimulationOverlay?: boolean;
}

export interface EStampVerifyResult {
  validFormat: boolean;
  verifiedByProvider: boolean;
  mode: 'live_api' | 'format_check_only';
  providerName: string;
  certificateNumber: string;
  stateCode?: string;
  detectedState?: string;
  denominationInr?: string;
  issuedDate?: string;
  purchasedBy?: string;
  referenceId?: string;
  message: string;
  checkedAt: string;
}

export interface EStampQuoteResult {
  mode: 'live_api' | 'dip_facilitation_handoff';
  providerName: string;
  quoteId: string;
  state: string;
  estimatedDutyInr: string;
  facilitationFeeInr?: string;
  handoffUrl: string;
  message: string;
  generatedAt: string;
}

export interface PublicProviderStatus {
  mainSiteUrl: string;
  deploymentMode: 'subdomain' | 'embedded';
  subdomainHost: string;
  validationProvider: {
    name: string;
    mode: 'built_in' | 'external_rest' | 'dip_desk';
    externalConfigured: boolean;
  };
  eStampProvider: {
    name: string;
    mode: 'reference_only' | 'external_api' | 'dip_desk';
    verifyConfigured: boolean;
    quoteConfigured: boolean;
  };
}

export interface AdminProviderConfig {
  mainSiteUrl: string;
  deploymentMode: 'subdomain' | 'embedded';
  subdomainHost: string;
  allowedOrigins: string;
  dipWebhookUrl: string;
  validationProvider: {
    name: string;
    mode: 'built_in' | 'external_rest' | 'dip_desk';
    endpointUrl: string;
    authHeader: string;
    apiKey?: string;
    hasApiKey?: boolean;
    maskedApiKey?: string;
  };
  eStampProvider: {
    name: string;
    mode: 'reference_only' | 'external_api' | 'dip_desk';
    verifyEndpointUrl: string;
    quoteEndpointUrl: string;
    authHeader: string;
    apiKey?: string;
    hasApiKey?: boolean;
    maskedApiKey?: string;
  };
}

export type SignatureLayoutPreset =
  | 'single_deponent'
  | 'two_party'
  | 'petitioner_advocate'
  | 'will_attestation';

export interface SignatureConfig {
  enabled?: boolean;
  layoutPreset?: SignatureLayoutPreset;
  signerName: string;
  signerRole: string;
  secondPartyName?: string;
  secondPartyRole?: string;
  signedAtPlace: string;
  signatureDate?: string;
  includeDateLines?: boolean;
  signatureDataUrl: string; // PNG data URL from canvas or generated typed signature
  witnessCount?: number;
  witness1Name?: string;
  witness1Address?: string;
  witness2Name?: string;
  witness2Address?: string;
  witness3Name?: string;
  witness3Address?: string;
  additionalSignatories?: Array<{ name: string; role: string }>;
}

export interface LegalAssistMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
