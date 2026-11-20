import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  Server,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { DocumentValidationReport, ValidationCheckItem } from '../shared/types';
import { validateDocument } from '../lib/api';

interface Props {
  content: string;
  title?: string;
  rawCategory?: string;
  jurisdictionState?: string;
  executionDate?: string;
  hasSignature?: boolean;
  eStampMode?: 'none' | 'sample_preview' | 'existing_certificate';
  eStampCertNumber?: string;
  externalReport?: DocumentValidationReport | null;
  onJumpToForm?: () => void;
  onReportReady?: (report: DocumentValidationReport) => void;
}

const STATUS_META: Record<
  DocumentValidationReport['overallStatus'],
  {
    label: string;
    desc: string;
    containerClass: string;
    titleClass: string;
  }
> = {
  ready_for_advocate_review: {
    label: 'Complete & Ready for Advocate Review',
    desc: 'All mapped placeholders, jurisdiction, date, and formal checks passed automated verification.',
    containerClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    titleClass: 'text-[#138808]',
  },
  needs_attention: {
    label: 'Draft Validated with Advisory Warnings',
    desc: 'Body placeholders appear filled, but stamp, witness, date, or statutory checks need verification.',
    containerClass: 'bg-amber-50 border-amber-200 text-amber-900',
    titleClass: 'text-amber-800',
  },
  incomplete: {
    label: 'Incomplete — Unfilled Blanks or Errors Found',
    desc: 'Unfilled placeholders or structural errors remain in the draft. Complete them before exporting.',
    containerClass: 'bg-red-50 border-red-200 text-red-900',
    titleClass: 'text-red-700',
  },
};

function renderSeverityIcon(severity: ValidationCheckItem['severity']) {
  if (severity === 'pass') {
    return <CheckCircle2 className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
  }
  return <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />;
}

export function DocumentValidatorPanel({
  content,
  title,
  rawCategory,
  jurisdictionState,
  executionDate,
  hasSignature,
  eStampMode,
  eStampCertNumber,
  externalReport,
  onJumpToForm,
  onReportReady,
}: Props) {
  const [report, setReport] = useState<DocumentValidationReport | null>(externalReport || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalReport) {
      setReport(externalReport);
    }
  }, [externalReport]);

  const runValidation = async () => {
    if (!content.trim()) {
      setError('Document content is empty. Populate or paste text to validate.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await validateDocument({
        content,
        title,
        rawCategory,
        jurisdictionState,
        executionDate,
        hasSignature,
        eStampMode,
        eStampCertNumber,
      });
      setReport(res);
      onReportReady?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run validation checks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalReport) return;
    if (!content.trim()) return;
    const timer = setTimeout(() => {
      void runValidation();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, jurisdictionState, executionDate, hasSignature, eStampMode, eStampCertNumber]);

  const meta = report ? STATUS_META[report.overallStatus] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-display font-bold text-[#202124] flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-[#FF671F]" />
            Indian Legal Document Validator
          </h3>
          <p className="text-xs text-slate-500">
            Automated checks for unfilled blanks, jurisdiction, verification clauses, witnesses, Aadhaar masking, and configured API provider rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onJumpToForm && (
            <button
              type="button"
              onClick={onJumpToForm}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#FF671F] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wrench className="w-3.5 h-3.5" />
              Edit Fields
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={runValidation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] bg-white border border-slate-200 rounded-lg hover:border-[#FF671F] hover:text-[#FF671F] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking...' : 'Re-Run Checks'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      {report && meta && (
        <div className="space-y-4">
          {/* Status Summary Banner */}
          <div className={`p-4 rounded-xl border ${meta.containerClass} space-y-2`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${meta.titleClass}`}>{meta.label}</p>
              <span className="text-[11px] font-mono-tabular">
                Validated {new Date(report.validatedAt).toLocaleTimeString('en-IN')}
              </span>
            </div>
            <p className="text-xs leading-relaxed">{meta.desc}</p>
          </div>

          {/* Active Validation API Provider Strip */}
          {report.providerMeta && (
            <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#202124]">
                <Server className="w-3.5 h-3.5 text-[#FF671F] shrink-0" />
                <span className="font-semibold">{report.providerMeta.providerName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{report.providerMeta.note}</span>
              </div>
              <div className="flex items-center gap-2 font-mono-tabular text-[11px] text-slate-500">
                {report.providerMeta.latencyMs !== undefined && (
                  <span>{report.providerMeta.latencyMs}ms</span>
                )}
                {report.providerMeta.referenceId && (
                  <span>Ref: {report.providerMeta.referenceId}</span>
                )}
              </div>
            </div>
          )}

          {/* Numeric Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 bg-[#F7F8FA] border border-slate-200 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 block">Passed</span>
              <strong className="text-base font-mono-tabular text-[#138808]">
                {report.passedCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Warnings</span>
              <strong className="text-base font-mono-tabular text-amber-700">
                {report.warningCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Errors</span>
              <strong className="text-base font-mono-tabular text-red-700">
                {report.errorCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Unfilled Blanks</span>
              <strong className="text-base font-mono-tabular text-[#202124]">
                {report.unfilledBlankCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Word Count</span>
              <strong className="text-base font-mono-tabular text-[#202124]">
                {report.wordCount.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          {/* Individual Check Cards */}
          <div className="space-y-2">
            {report.checks.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs"
              >
                {renderSeverityIcon(item.severity)}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#202124]">{item.title}</span>
                    <span className="text-[11px] font-mono-tabular text-slate-500">
                      {item.category} · {item.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{item.detail}</p>
                  {item.suggestion && (
                    <p className="text-[11px] font-medium text-[#FF671F]">
                      Next step: {item.suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* SHA-256 Digest */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
            <span className="font-semibold block text-[#202124]">Draft Integrity Digest (SHA-256)</span>
            <code className="font-mono-tabular break-all block text-slate-700">
              {report.sha256Digest}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
