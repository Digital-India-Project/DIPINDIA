import { useState } from 'react';
import { FileCheck2, FileUp, Scale, ShieldCheck, Upload } from 'lucide-react';
import { DocumentValidationReport } from '../shared/types';
import { INDIAN_STATES_AND_UTS } from '../shared/constants';
import { validateDocument, validateUploadedDocument } from '../lib/api';
import { DocumentValidatorPanel } from './DocumentValidatorPanel';
import { LegalAssistantPanel } from './LegalAssistantPanel';

export function ValidateAndAidHub() {
  const [title, setTitle] = useState('Uploaded / Pasted Legal Instrument');
  const [jurisdictionState, setJurisdictionState] = useState('');
  const [textContent, setTextContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [report, setReport] = useState<DocumentValidationReport | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<'validate' | 'aid'>('validate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 2 * 1024 * 1024) {
      setError('File exceeds 2 MB limit.');
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        const res = await validateUploadedDocument({
          filename: file.name,
          base64Content: base64,
          jurisdictionState: jurisdictionState || undefined,
        });
        setUploadedFileName(res.filename);
        setTitle(res.filename);
        setTextContent(res.extractedText);
        setReport(res.report);
        setActiveRightTab('validate');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to parse uploaded document.');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setLoading(false);
      setError('Unable to read selected file.');
    };
    reader.readAsDataURL(file);
  };

  const handleManualValidate = async () => {
    if (!textContent.trim()) {
      setError('Paste document text or upload a .txt / .pdf file first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await validateDocument({
        content: textContent,
        title,
        jurisdictionState: jurisdictionState || undefined,
      });
      setReport(res);
      setActiveRightTab('validate');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6 flex flex-wrap items-start lg:items-end justify-between gap-4">
        <div className="space-y-2 flex-[1_1_320px] min-w-0">
          <p className="text-xs tracking-widest uppercase text-[#138808] font-semibold">
            Document Scrutiny &amp; Clause Guidance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#202124] tracking-tight">
            Validate Legal Documents &amp; Consult Legal Assistance
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Upload an existing Indian legal <span className="font-mono-tabular">.pdf</span> or{' '}
            <span className="font-mono-tabular">.txt</span> file (up to 2 MB) or paste draft clauses below to verify unfilled blanks, jurisdiction, witness attestation, and statutory currency.
          </p>
        </div>

        <div className="text-xs text-[#138808] bg-[#ECFDF5] border border-[#BBF7D0] rounded-xl px-3.5 py-2.5 flex items-center gap-2 max-w-full">
          <ShieldCheck className="w-4 h-4 text-[#138808] shrink-0" />
          <span>In-memory scrutiny only · Uploaded files are not stored on server</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT: Upload & Text Input */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#202124]">
              Upload Document (.PDF or .TXT, max 2 MB)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 p-5 border border-dashed border-[#FF671F]/50 bg-[#FFF5F0]/60 rounded-xl cursor-pointer hover:bg-[#FFF5F0] transition-colors">
              <FileUp className="w-6 h-6 text-[#FF671F]" />
              <span className="text-xs font-medium text-[#FF671F]">
                {uploadedFileName
                  ? `Loaded: ${uploadedFileName} (click to replace)`
                  : 'Choose selectable-text PDF or TXT file'}
              </span>
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium text-[#202124] mb-1">Document Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#202124] mb-1">Governing State / UT</label>
              <select
                value={jurisdictionState}
                onChange={(e) => setJurisdictionState(e.target.value)}
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
              >
                <option value="">Select State / UT...</option>
                {INDIAN_STATES_AND_UTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#202124]">
              Document Text to Inspect
            </label>
            <textarea
              rows={14}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste any legal agreement, affidavit, notice, plaint, or upload a PDF/TXT file above..."
              className="w-full p-3 font-editorial text-sm leading-relaxed bg-[#F7F8FA] border border-slate-300 rounded-lg text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
            />
          </div>

          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleManualValidate}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {loading ? 'Analyzing Document...' : 'Run Validation & Scrutiny Checks'}
          </button>
        </div>

        {/* RIGHT: Validation Report + Legal Assistance Tabs */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-2xs">
          <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveRightTab('validate')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeRightTab === 'validate'
                  ? 'bg-white text-[#202124] shadow-2xs'
                  : 'text-slate-600 hover:text-[#202124]'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-[#FF671F]" />
              Validation Report
            </button>
            <button
              type="button"
              onClick={() => setActiveRightTab('aid')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeRightTab === 'aid'
                  ? 'bg-white text-[#202124] shadow-2xs'
                  : 'text-slate-600 hover:text-[#202124]'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-[#138808]" />
              Legal Assistance
            </button>
          </div>

          {activeRightTab === 'validate' ? (
            textContent.trim() ? (
              <DocumentValidatorPanel
                content={textContent}
                title={title}
                jurisdictionState={jurisdictionState}
                externalReport={report}
                onReportReady={setReport}
              />
            ) : (
              <div className="py-16 text-center space-y-2 text-sm text-slate-600">
                <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-[#202124]">No Document Loaded Yet</p>
                <p className="text-xs max-w-md mx-auto">
                  Upload a .pdf or .txt legal document or paste its clauses on the left to run automated scrutiny checks and compute its SHA-256 verification digest.
                </p>
              </div>
            )
          ) : (
            <LegalAssistantPanel
              documentTitle={title}
              jurisdictionState={jurisdictionState || 'Not Specified'}
              documentExcerpt={textContent}
            />
          )}
        </div>
      </div>
    </div>
  );
}
