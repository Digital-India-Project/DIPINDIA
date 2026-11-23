import { Trash2, FileDown, FolderOpen, Copy, ShieldCheck } from 'lucide-react';
import { SavedUserDocument } from '../shared/types';
import { downloadExportFile } from '../lib/api';
import { NON_EXECUTED_STATUS_NOTICE } from '../shared/constants';
import { useState } from 'react';

interface Props {
  drafts: SavedUserDocument[];
  ephemeralMode: boolean;
  onToggleEphemeral: (val: boolean) => void;
  onOpenDraft: (draft: SavedUserDocument, asDuplicate?: boolean) => void;
  onDeleteDraft: (id: string) => void;
  onWipeAll: () => void;
}

export function SavedDraftsVault({
  drafts,
  ephemeralMode,
  onToggleEphemeral,
  onOpenDraft,
  onDeleteDraft,
  onWipeAll,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleQuickDownload = async (draft: SavedUserDocument, format: 'docx' | 'pdf') => {
    setBusyId(`${draft.id}_${format}`);
    setError(null);
    try {
      await downloadExportFile(format, {
        documentId: draft.id,
        templateId: draft.templateId,
        templateTitle: draft.templateTitle,
        templateVersion: draft.templateVersion,
        sourcePath: `local-vault/${draft.templateId}`,
        jurisdictionState: draft.formValues['jurisdiction_state'] || 'Not Specified',
        executionDate: draft.formValues['execution_date'] || 'Not Specified',
        disclaimerBanner: NON_EXECUTED_STATUS_NOTICE,
        title: draft.label || draft.templateTitle,
        content: draft.renderedText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-6 flex flex-wrap items-start md:items-end justify-between gap-4">
        <div className="flex-[1_1_280px] min-w-0">
          <p className="text-xs tracking-widest uppercase text-[#FF671F] font-semibold mb-1.5">
            Privacy &amp; Version Controls
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#202124] dark:text-white tracking-tight">
            Browser-Local Saved Drafts
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Personal form values and completed draft versions are stored strictly inside your own browser&apos;s local storage — never persisted or logged on the server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 max-w-full">
          <label className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-[#202124] dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={ephemeralMode}
              onChange={(e) => onToggleEphemeral(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-[#FF671F] focus:ring-[#FF671F]"
            />
            <span>Private Session (Disable Local Save)</span>
          </label>

          {drafts.length > 0 && (
            <button
              type="button"
              onClick={onWipeAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#991B1B] dark:text-rose-300 bg-white dark:bg-slate-900 border border-[#FECACA] dark:border-rose-800 rounded-lg hover:bg-[#FEF2F2] dark:hover:bg-rose-950/40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Wipe All Local Data
            </button>
          )}
        </div>
      </div>

      {ephemeralMode && (
        <div className="p-4 bg-[#FFF5F0] dark:bg-orange-950/35 border border-[#FED7AA] dark:border-orange-800 rounded-xl text-sm text-[#202124] dark:text-orange-100 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#FF671F] shrink-0" />
          <span>
            Private Session Mode is active. New drafts stay in active memory only and will vanish when you close this tab.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#FEF2F2] dark:bg-rose-950/40 border border-[#FECACA] dark:border-rose-800 rounded-xl text-sm text-[#991B1B] dark:text-rose-300">
          {error}
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-2 shadow-2xs">
          <p className="text-base font-semibold text-[#202124] dark:text-white">No locally saved drafts</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Open any document template, fill in party details, and click &ldquo;Save Locally&rdquo; to keep multiple party versions here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{d.templateTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">v{d.templateVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    Saved {new Date(d.updatedAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#202124] dark:text-white">{d.label}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  State: {d.formValues['jurisdiction_state'] || 'Unspecified'} · Date:{' '}
                  {d.formValues['execution_date'] || 'Unspecified'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenDraft(d, false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Resume Editing
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDraft(d, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone for New Party
                </button>
                <button
                  type="button"
                  disabled={busyId === `${d.id}_docx`}
                  onClick={() => handleQuickDownload(d, 'docx')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  DOCX
                </button>
                <button
                  type="button"
                  disabled={busyId === `${d.id}_pdf`}
                  onClick={() => handleQuickDownload(d, 'pdf')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDraft(d.id)}
                  aria-label={`Delete ${d.label}`}
                  className="p-1.5 text-slate-400 hover:text-[#991B1B] dark:hover:text-rose-400 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
