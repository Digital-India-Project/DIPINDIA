import { LibraryAuditReport, PublicProviderStatus } from '../shared/types';

interface Props {
  report: LibraryAuditReport | null;
  providerStatus: PublicProviderStatus | null;
  onNavigateAdmin: () => void;
}

export function LibraryAuditView({ report, providerStatus, onNavigateAdmin }: Props) {
  if (!report) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12 text-sm text-slate-500">
        Loading repository audit report...
      </div>
    );
  }

  const integrations = [
    {
      name: 'Document Validation API Provider',
      status: providerStatus?.validationProvider.externalConfigured
        ? `Connected (${providerStatus.validationProvider.name})`
        : `Built-in Engine (${providerStatus?.validationProvider.name || 'Digital India Legal Validator'})`,
      connected: Boolean(providerStatus?.validationProvider.externalConfigured),
      notes: providerStatus?.validationProvider.externalConfigured
        ? 'External REST validation API runs alongside built-in Indian statutory checks with automatic local fallback.'
        : 'Runs deterministic local Indian legal checks. Connect an external Validation REST API in Admin → API Providers & DIP.',
    },
    {
      name: 'SHCIL / State Treasury e-Stamping API',
      status:
        providerStatus?.eStampProvider.verifyConfigured || providerStatus?.eStampProvider.quoteConfigured
          ? `Connected (${providerStatus.eStampProvider.name})`
          : 'DIP-Desk Facilitation & Format Check',
      connected: Boolean(
        providerStatus?.eStampProvider.verifyConfigured || providerStatus?.eStampProvider.quoteConfigured
      ),
      notes:
        providerStatus?.eStampProvider.verifyConfigured || providerStatus?.eStampProvider.quoteConfigured
          ? 'Live e-Stamp verification/quote endpoint configured in Admin → API Providers & DIP.'
          : 'Performs SHCIL certificate pattern verification and generates pre-filled digitalindiaproject.com facilitation handoff links.',
    },
    {
      name: 'Digital India Project Main Portal Integration',
      status:
        providerStatus?.deploymentMode === 'embedded'
          ? `Embedded (${providerStatus.mainSiteUrl})`
          : `Subdomain Add-on (${providerStatus?.subdomainHost || 'legal.digitalindiaproject.com'})`,
      connected: true,
      notes: `CORS enabled for digitalindiaproject.com & subdomains. Supports standalone subdomain hosting and ?embed=1 direct integration.`,
    },
    {
      name: 'Aadhaar e-Sign / Notary / Sub-Registrar (IGRS)',
      status: 'Manual Execution Required',
      connected: false,
      notes: 'Exported DOCX/PDF files are unexecuted drafts. Complete official e-Sign, notarization, or Registration Act, 1908 registration separately.',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs tracking-widest uppercase font-semibold text-[#FF671F] mb-2">
          API Providers, Integration &amp; Archive Audit
        </p>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-[#202124] tracking-tight text-balance">
          Digital India Project Legal Add-on Inventory
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
          Complete inventory of <span className="font-mono-tabular text-[#202124]">Digital-India-Project/karta-files</span>{' '}
          and active API provider adapters for Document Validation, e-Stamping, and{' '}
          <span className="font-mono-tabular text-[#202124]">digitalindiaproject.com</span>.
        </p>
      </div>

      {/* Primary Audit Metrics Grid */}
      <section aria-label="Ingestion summary metrics">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Files Discovered', value: report.totalFilesDiscovered },
            { label: 'Supported Formats', value: report.totalSupportedFiles },
            { label: 'Successfully Processed', value: report.totalSuccessfullyProcessed },
            { label: 'Templates Created', value: report.totalTemplatesCreated },
            { label: 'Needing Manual Review', value: report.filesNeedingManualReview },
            { label: 'Unsupported / Failed', value: report.unsupportedOrFailedCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs"
            >
              <span className="text-xs text-slate-500 leading-snug">{stat.label}</span>
              <span className="mt-3 text-2xl font-semibold text-[#202124] font-mono-tabular">
                {stat.value.toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Format & Processing Status Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
          <h2 className="text-xl font-display font-bold text-[#202124] mb-4">
            Source Formats &amp; Directory Cross-Check
          </h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">catalogue.json / catalogue.csv entries</dt>
              <dd className="font-mono-tabular text-[#202124]">
                {report.catalogueJsonCount.toLocaleString()} / {report.catalogueCsvCount.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">upload_batches manifests (source docs linked)</dt>
              <dd className="font-mono-tabular text-[#202124]">
                {report.batchManifestCount} batches ({report.uploadBatchSourceDocs.toLocaleString()} docs)
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">original_pdfs/ directory binaries</dt>
              <dd className="font-mono-tabular text-[#202124]">{report.originalPdfsDirCount}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">original_unconverted/ directory files</dt>
              <dd className="font-mono-tabular text-[#202124]">{report.originalUnconvertedDirCount}</dd>
            </div>
            {Object.entries(report.breakdownByFormat).map(([fmt, cnt]) => (
              <div key={fmt} className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-600">Catalogue format {fmt}</dt>
                <dd className="font-mono-tabular text-[#202124]">{cnt.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
          <h2 className="text-xl font-display font-bold text-[#202124] mb-4">
            Processing Status &amp; Review Governance
          </h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">Extracted RTF / DOCX ready</dt>
              <dd className="font-mono-tabular text-[#202124]">
                {report.breakdownByStatus.processed_ready.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">Text PDFs extracted (reconstructed editable templates)</dt>
              <dd className="font-mono-tabular text-[#202124]">
                {report.breakdownByStatus.processed_pdf_text.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600">Fillable AcroForm PDFs</dt>
              <dd className="font-mono-tabular text-[#202124]">
                {report.breakdownByStatus.processed_pdf_acroform.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-amber-700">Scanned / image-only PDFs (OCR required)</dt>
              <dd className="font-mono-tabular text-amber-700">
                {report.breakdownByStatus.needs_ocr_scanned_pdf.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-amber-700">Legacy binary .doc files (conversion required)</dt>
              <dd className="font-mono-tabular text-amber-700">
                {report.breakdownByStatus.unsupported_legacy_doc.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Word temporary ~$ lock artifacts flagged</dt>
              <dd className="font-mono-tabular text-slate-500">
                {report.breakdownByStatus.invalid_lock_artifact.toLocaleString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#138808] font-semibold">Admin-approved templates</dt>
              <dd className="font-mono-tabular text-[#138808] font-semibold">
                {report.approvedTemplatesCount.toLocaleString()}
              </dd>
            </div>
          </dl>
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Last ingested: {new Date(report.lastIngestedAt).toLocaleString('en-IN')}
            </span>
            <button
              type="button"
              onClick={onNavigateAdmin}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Configure API Providers in Admin
            </button>
          </div>
        </div>
      </section>

      {/* API Provider & External Integration Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <h2 className="text-xl font-display font-bold text-[#202124] mb-2">
          API Providers &amp; Main-Site Integration Status
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Live status of configured Document Validation, e-Stamp, and Digital India Project subdomain/embed adapters:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-4 font-semibold">Integration</th>
                <th className="py-2.5 pr-4 font-semibold">Status</th>
                <th className="py-2.5 font-semibold">Operational Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {integrations.map((row) => (
                <tr key={row.name}>
                  <td className="py-3 pr-4 font-semibold text-[#202124] whitespace-nowrap">
                    {row.name}
                  </td>
                  <td
                    className={`py-3 pr-4 font-mono-tabular whitespace-nowrap font-medium ${
                      row.connected ? 'text-[#138808]' : 'text-amber-700'
                    }`}
                  >
                    {row.status}
                  </td>
                  <td className="py-3 text-slate-600">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
