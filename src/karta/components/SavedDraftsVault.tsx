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
      <div className="border-b border-slate-200 pb-6 flex flex-wrap items-start md:items-end justify-between gap-4">
        <div className="flex-[1_1_280px] min-w-0">
          <p className="text-xs tracking-widest uppercase text-[#FF671F] font-semibold mb-1.5">
            Privacy &amp; Version Controls
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#202124] tracking-tight">
            Browser-Local Saved Drafts
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Personal form values and completed draft versions are stored strictly inside your own browser&apos;s local storage — never persisted or logged on the server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 max-w-full">
          <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-[#202124] cursor-pointer">
            <input
              type="checkbox"
              checked={ephemeralMode}
              onChange={(e) => onToggleEphemeral(e.target.checked)}
              className="rounded border-slate-300 text-[#FF671F] focus:ring-[#FF671F]"
            />
            <span>Private Session (Disable Local Save)</span>
          </label>

          {drafts.length > 0 && (
            <button
              type="button"
              onClick={onWipeAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#991B1B] bg-white border border-[#FECACA] rounded-lg hover:bg-[#FEF2F2] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Wipe All Local Data
            </button>
          )}
        </div>
      </div>

      {ephemeralMode && (
        <div className="p-4 bg-[#FFF5F0] border border-[#FED7AA] rounded-xl text-sm text-[#202124] flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#FF671F] shrink-0" />
          <span>
            Private Session Mode is active. New drafts stay in active memory only and will vanish when you close this tab.
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {drafts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2 shadow-2xs">
          <p className="text-base font-semibold text-[#202124]">No locally saved drafts</p>
          <p className="text-sm text-slate-600">
            Open any document template, fill in party details, and click &ldquo;Save Locally&rdquo; to keep multiple party versions here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl shadow-2xs">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{d.templateTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">v{d.templateVersion}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    Saved {new Date(d.updatedAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#202124]">{d.label}</h3>
                <p className="text-xs text-slate-600">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone for New Party
                </button>
                <button
                  type="button"
                  disabled={busyId === `${d.id}_docx`}
                  onClick={() => handleQuickDownload(d, 'docx')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#202124] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  DOCX
                </button>
                <button
                  type="button"
                  disabled={busyId === `${d.id}_pdf`}
                  onClick={() => handleQuickDownload(d, 'pdf')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#202124] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDraft(d.id)}
                  aria-label={`Delete ${d.label}`}
                  className="p-1.5 text-slate-400 hover:text-[#991B1B] rounded-lg cursor-pointer"
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
