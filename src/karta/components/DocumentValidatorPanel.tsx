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
    containerClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200',
    titleClass: 'text-[#138808] dark:text-emerald-300',
  },
  needs_attention: {
    label: 'Draft Validated with Advisory Warnings',
    desc: 'Body placeholders appear filled, but stamp, witness, date, or statutory checks need verification.',
    containerClass: 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200',
    titleClass: 'text-amber-800 dark:text-amber-300',
  },
  incomplete: {
    label: 'Incomplete — Unfilled Blanks or Errors Found',
    desc: 'Unfilled placeholders or structural errors remain in the draft. Complete them before exporting.',
    containerClass: 'bg-red-50 dark:bg-rose-950/40 border-red-200 dark:border-rose-800 text-red-900 dark:text-rose-200',
    titleClass: 'text-red-700 dark:text-rose-300',
  },
};

function renderSeverityIcon(severity: ValidationCheckItem['severity']) {
  if (severity === 'pass') {
    return <CheckCircle2 className="w-4 h-4 text-[#138808] dark:text-emerald-400 shrink-0 mt-0.5" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
  }
  return <ShieldAlert className="w-4 h-4 text-red-600 dark:text-rose-400 shrink-0 mt-0.5" />;
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
          <h3 className="text-sm font-display font-bold text-[#202124] dark:text-white flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4 text-[#FF671F]" />
            Indian Legal Document Validator
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Automated checks for unfilled blanks, jurisdiction, verification clauses, witnesses, Aadhaar masking, and configured API provider rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onJumpToForm && (
            <button
              type="button"
              onClick={onJumpToForm}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#FF671F] dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-950/70 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Wrench className="w-3.5 h-3.5" />
              Edit Fields
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={runValidation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-[#FF671F] hover:text-[#FF671F] dark:hover:border-orange-500 dark:hover:text-orange-300 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking...' : 'Re-Run Checks'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-rose-950/40 border border-red-200 dark:border-rose-800 rounded-lg text-xs text-red-800 dark:text-rose-300">
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
            <div className="px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#202124] dark:text-slate-100">
                <Server className="w-3.5 h-3.5 text-[#FF671F] shrink-0" />
                <span className="font-semibold">{report.providerMeta.providerName}</span>
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className="text-slate-600 dark:text-slate-300">{report.providerMeta.note}</span>
              </div>
              <div className="flex items-center gap-2 font-mono-tabular text-[11px] text-slate-500 dark:text-slate-400">
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 bg-[#F7F8FA] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Passed</span>
              <strong className="text-base font-mono-tabular text-[#138808] dark:text-emerald-400">
                {report.passedCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Warnings</span>
              <strong className="text-base font-mono-tabular text-amber-700 dark:text-amber-400">
                {report.warningCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Errors</span>
              <strong className="text-base font-mono-tabular text-red-700 dark:text-rose-400">
                {report.errorCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Unfilled Blanks</span>
              <strong className="text-base font-mono-tabular text-[#202124] dark:text-white">
                {report.unfilledBlankCount}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Word Count</span>
              <strong className="text-base font-mono-tabular text-[#202124] dark:text-white">
                {report.wordCount.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          {/* Individual Check Cards */}
          <div className="space-y-2">
            {report.checks.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start gap-2.5 text-xs"
              >
                {renderSeverityIcon(item.severity)}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#202124] dark:text-white">{item.title}</span>
                    <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                      {item.category} · {item.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{item.detail}</p>
                  {item.suggestion && (
                    <p className="text-[11px] font-medium text-[#FF671F] dark:text-orange-400">
                      Next step: {item.suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* SHA-256 Digest */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
            <span className="font-semibold block text-[#202124] dark:text-white">Draft Integrity Digest (SHA-256)</span>
            <code className="font-mono-tabular break-all block text-slate-700 dark:text-slate-300">
              {report.sha256Digest}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
