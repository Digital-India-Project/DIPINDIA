import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  ShieldCheck,
  Stamp,
  AlertTriangle,
} from 'lucide-react';
import {
  EStampConfig,
  EStampQuoteResult,
  EStampVerifyResult,
  PublicProviderStatus,
} from '../shared/types';
import { INDIAN_STATES_AND_UTS, STATE_STAMP_GUIDES } from '../shared/constants';
import {
  fetchProviderStatus,
  requestEStampQuote,
  verifyEStampCertificate,
} from '../lib/api';

interface Props {
  value: EStampConfig;
  onChange: (next: EStampConfig) => void;
}

export function EStampPanel({ value, onChange }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [providerStatus, setProviderStatus] = useState<PublicProviderStatus | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<EStampVerifyResult | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteResult, setQuoteResult] = useState<EStampQuoteResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchProviderStatus()
      .then((res) => setProviderStatus(res))
      .catch(() => {});
  }, []);

  const matchedGuide = STATE_STAMP_GUIDES.find((g) => g.state === value.state);

  const handleVerifyCertificate = async () => {
    if (!value.certificateNumber.trim()) {
      setActionError('Enter a SHCIL certificate number (e.g., IN-DL12345678901234W) first.');
      return;
    }
    setVerifyBusy(true);
    setActionError(null);
    try {
      const res = await verifyEStampCertificate({
        certificateNumber: value.certificateNumber,
        state: value.state || undefined,
        purchaseDate: value.purchaseDate || undefined,
      });
      setVerifyResult(res);
      if (res.detectedState && !value.state) {
        onChange({ ...value, state: res.detectedState });
      }
      if (res.denominationInr && !value.denominationInr) {
        onChange({ ...value, denominationInr: res.denominationInr });
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to verify certificate.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleRequestQuote = async () => {
    setQuoteBusy(true);
    setActionError(null);
    try {
      const res = await requestEStampQuote({
        state: value.state || 'Delhi (NCT)',
        articleDescription: value.articleDescription || 'Agreement / Affidavit',
        denominationInr: value.denominationInr || '100',
        considerationPriceInr: value.considerationPriceInr,
        purchasedBy: value.purchasedBy || '',
        secondParty: value.secondParty,
        documentTitle: value.documentSubDescription,
      });
      setQuoteResult(res);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to prepare e-Stamp quote.');
    } finally {
      setQuoteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-[#FFFDF8] border border-[#F1E8D9] rounded-xl text-xs text-slate-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#FF671F] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[#202124]">
              e-Stamp Provider: {providerStatus?.eStampProvider.name || 'DIP-Desk e-Stamp Facilitation'}
            </strong>
            <span className="text-slate-400">·</span>
            <span className="font-mono-tabular text-[11px] text-[#138808] font-medium">
              {providerStatus?.eStampProvider.verifyConfigured
                ? 'Live Verification API Connected'
                : 'SHCIL Layout + DIP-Desk Facilitation'}
            </span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            Required drafts display the 12-field India Non-Judicial e-Stamp reference header. Attach an existing{' '}
            <span className="font-mono-tabular">IN-</span> SHCIL certificate or request e-Stamp procurement through Digital India Project.
          </p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {[
          {
            id: 'none' as const,
            title: 'Plain Draft Paper',
            desc: 'No stamp paper header on export',
          },
          {
            id: 'sample_preview' as const,
            title: 'SHCIL Sample Reference',
            desc: '12-field Non-Judicial e-Stamp layout',
          },
          {
            id: 'existing_certificate' as const,
            title: 'Attach Purchased e-Stamp',
            desc: 'Verify & bind your IN-... serial no.',
          },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() =>
              onChange({ ...value, mode: opt.id, showSimulationOverlay: opt.id !== 'none' })
            }
            className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
              value.mode === opt.id
                ? 'bg-orange-50/70 border-[#FF671F] text-[#202124] ring-1 ring-[#FF671F]/25'
                : 'bg-white border-slate-200 text-slate-600 hover:border-[#FF671F]/50'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#202124]">
              <Stamp className={`w-3.5 h-3.5 ${value.mode === opt.id ? 'text-[#FF671F]' : 'text-slate-500'}`} />
              <span>{opt.title}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{opt.desc}</p>
          </button>
        ))}
      </div>

      {value.mode !== 'none' && (
        <div className="p-4 bg-[#F7F8FA] border border-slate-200 rounded-xl space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Governing State / UT (Government of ___)
              </label>
              <select
                value={value.state}
                onChange={(e) => onChange({ ...value, state: e.target.value })}
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25"
              >
                <option value="">Select State / UT...</option>
                {INDIAN_STATES_AND_UTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Stamp Duty Amount (Rs.)
              </label>
              <input
                type="text"
                value={value.denominationInr}
                onChange={(e) => onChange({ ...value, denominationInr: e.target.value })}
                placeholder="e.g., 100 or 500"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25"
              />
            </div>

            {value.mode === 'existing_certificate' && (
              <div className="sm:col-span-2 space-y-2">
                <label className="block font-medium text-[#202124]">
                  Certificate No. (SHCIL)
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={value.certificateNumber}
                    onChange={(e) => onChange({ ...value, certificateNumber: e.target.value })}
                    placeholder="e.g., IN-KA12345678901234W"
                    className="flex-1 min-w-[200px] h-9 px-2.5 font-mono-tabular bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25"
                  />
                  <button
                    type="button"
                    disabled={verifyBusy}
                    onClick={handleVerifyCertificate}
                    className="inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-semibold text-white bg-[#138808] rounded-lg hover:bg-[#0F6E06] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {verifyBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    {verifyBusy ? 'Verifying...' : 'Verify via Provider'}
                  </button>
                </div>

                {verifyResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                      verifyResult.verifiedByProvider
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : verifyResult.validFormat
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}
                  >
                    {verifyResult.verifiedByProvider ? (
                      <CheckCircle2 className="w-4 h-4 text-[#138808] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-semibold">
                        {verifyResult.providerName} ·{' '}
                        {verifyResult.mode === 'live_api' ? 'Live API Check' : 'Format Pre-Check'}
                      </p>
                      <p>{verifyResult.message}</p>
                      {verifyResult.referenceId && (
                        <p className="font-mono-tabular text-[11px]">
                          Ref: {verifyResult.referenceId}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Certificate Issued Date
              </label>
              <input
                type="date"
                value={value.purchaseDate}
                onChange={(e) => onChange({ ...value, purchaseDate: e.target.value })}
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Consideration Price (Rs.)
              </label>
              <input
                type="text"
                value={value.considerationPriceInr || ''}
                onChange={(e) => onChange({ ...value, considerationPriceInr: e.target.value })}
                placeholder="e.g., 0 or 25,00,000"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Purchased by / First Party
              </label>
              <input
                type="text"
                value={value.purchasedBy}
                onChange={(e) => onChange({ ...value, purchasedBy: e.target.value })}
                placeholder="Name on stamp certificate"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">Second Party</label>
              <input
                type="text"
                value={value.secondParty || ''}
                onChange={(e) => onChange({ ...value, secondParty: e.target.value })}
                placeholder="Counterparty name if applicable"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Description of Document (Article)
              </label>
              <input
                type="text"
                value={value.articleDescription}
                onChange={(e) => onChange({ ...value, articleDescription: e.target.value })}
                placeholder="e.g., Article 4 Affidavit / Article 5 Agreement"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Description (Document Title)
              </label>
              <input
                type="text"
                value={value.documentSubDescription || ''}
                onChange={(e) => onChange({ ...value, documentSubDescription: e.target.value })}
                placeholder="Short instrument summary"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Stamp Duty Paid By
              </label>
              <input
                type="text"
                value={value.stampDutyPaidBy || ''}
                onChange={(e) => onChange({ ...value, stampDutyPaidBy: e.target.value })}
                placeholder="Same as First Party if blank"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Account / Unique Doc. Reference
              </label>
              <input
                type="text"
                value={value.accountReference || ''}
                onChange={(e) => onChange({ ...value, accountReference: e.target.value })}
                placeholder="Optional SHCIL account ref"
                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg font-mono-tabular"
              />
            </div>
          </div>

          {actionError && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {actionError}
            </div>
          )}

          {/* Request e-Stamp Quote / Main Portal Facilitation Handoff */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-600">
              Need an official e-Stamp issued for this draft?
            </div>
            <button
              type="button"
              disabled={quoteBusy}
              onClick={handleRequestQuote}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {quoteBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Stamp className="w-3.5 h-3.5" />
              )}
              {quoteBusy ? 'Preparing Request...' : 'Request e-Stamp via Digital India Project'}
            </button>
          </div>

          {quoteResult && (
            <div className="p-3 bg-white border border-emerald-200 rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#138808]">
                  Quote Reference: <span className="font-mono-tabular">{quoteResult.quoteId}</span>
                </span>
                <span className="font-mono-tabular text-[11px] text-slate-600">
                  Est. Duty: Rs. {quoteResult.estimatedDutyInr}/- ({quoteResult.state})
                </span>
              </div>
              <p className="text-slate-600">{quoteResult.message}</p>
              <a
                href={quoteResult.handoffUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF671F] hover:underline"
              >
                <span>Continue Procurement on {providerStatus?.mainSiteUrl || 'digitalindiaproject.com'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Reference Stamp Thumbnail Card */}
          <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
            {!imgFailed ? (
              <img
                src="/assets/aistudio/stamp-sample_c88c690a.jpg"
                alt="SHCIL India Non-Judicial e-Stamp reference sheet"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-16 h-20 object-contain border border-slate-200 bg-white rounded-lg shrink-0"
              />
            ) : (
              <div className="w-16 h-20 border border-slate-200 bg-slate-100 rounded-lg shrink-0" />
            )}
            <div className="text-[11px] text-slate-600 space-y-0.5">
              <p className="font-semibold text-[#202124]">
                Reference Sample Active (12-Field SHCIL Format)
              </p>
              <p>
                Modeled after the Non-Judicial e-Stamp sheet, including the dotted{' '}
                <em>&ldquo;Please write or type below this line&rdquo;</em> execution divider.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indicative State Stamp Duty Reference */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-[#202124]">
            Indicative State Stamp Duty Reference (Verify Current Tariff Before Purchase)
          </h4>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-[#FF671F]">
            <ExternalLink className="w-3 h-3" />
            shcilestamp.com
          </span>
        </div>

        {matchedGuide ? (
          <div className="text-xs space-y-1.5 text-slate-600">
            <p className="font-medium text-[#202124]">
              {matchedGuide.state} — {matchedGuide.portalName}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                Affidavit: <strong className="text-[#202124]">{matchedGuide.affidavitIndicative}</strong>
              </div>
              <div>
                Agreement: <strong className="text-[#202124]">{matchedGuide.agreementIndicative}</strong>
              </div>
              <div>
                POA: <strong className="text-[#202124]">{matchedGuide.poaIndicative}</strong>
              </div>
              <div>
                Rent / Lease: <strong className="text-[#202124]">{matchedGuide.leaseIndicative}</strong>
              </div>
            </div>
            <p className="text-[11px] text-amber-800 pt-1">{matchedGuide.notes}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Select a state above (such as Karnataka, Delhi (NCT), Maharashtra, Uttar Pradesh, Tamil Nadu, or Gujarat) to view indicative non-judicial e-Stamp reference notes.
          </p>
        )}
      </div>
    </div>
  );
}
