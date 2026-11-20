import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileScan,
  Lock,
  PenTool,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
} from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import {
  KARTA_PRESET_TAGS,
  type KartaLocalRecord,
  sanitizeCustomTags,
} from '../lib/kartaSyncService';
import {
  decodeQrFromImageSource,
  decodeQrFromPdfFile,
  decodeQrFromVideoFrame,
  generateSpecimenQrDataUrl,
  parseAndVerifyOfficialQr,
  type ParsedQrDocumentMetadata,
} from '../lib/qrScanner';

interface KartaQrScannerProps {
  vaultDocs: KartaLocalRecord[];
  onImportToViewer: (meta: ParsedQrDocumentMetadata, customTags: string[]) => void;
  onImportToStudio: (templateId: string) => void;
  onSealQrToVault: (meta: ParsedQrDocumentMetadata, customTags: string[]) => void;
}

export const KartaQrScanner: React.FC<KartaQrScannerProps> = ({
  vaultDocs,
  onImportToViewer,
  onImportToStudio,
  onSealQrToVault,
}) => {
  const [scanningFile, setScanningFile] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [previewQrUrl, setPreviewQrUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string>('');
  const [manualInput, setManualInput] = useState('');
  const [parsedResult, setParsedResult] =
    useState<ParsedQrDocumentMetadata | null>(null);
  const [editableTitle, setEditableTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const applyDecodedPayload = useCallback(
    (rawData: string, qrPreview?: string, label?: string) => {
      const parsed = parseAndVerifyOfficialQr(rawData, vaultDocs);
      setParsedResult(parsed);
      setEditableTitle(parsed.title);
      setSelectedTags(sanitizeCustomTags(parsed.suggestedTags));
      setScanError(null);
      if (qrPreview) setPreviewQrUrl(qrPreview);
      if (label) setPreviewLabel(label);
      triggerHaptic('success');
    },
    [vaultDocs]
  );

  const handleStartCamera = async () => {
    setCameraError(null);
    setScanError(null);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        'Camera capture is unavailable in this browser context. Upload a QR image or scanned PDF instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => {});

        if (!scratchCanvasRef.current) {
          scratchCanvasRef.current = document.createElement('canvas');
        }

        const tick = () => {
          if (!streamRef.current || !videoRef.current || !scratchCanvasRef.current) {
            return;
          }
          const decoded = decodeQrFromVideoFrame(
            videoRef.current,
            scratchCanvasRef.current
          );
          if (decoded) {
            const snapshotUrl = scratchCanvasRef.current.toDataURL('image/png');
            stopCamera();
            applyDecodedPayload(decoded, snapshotUrl, 'Live Camera Capture');
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch (err) {
      stopCamera();
      setCameraError(
        err instanceof Error
          ? `Camera permission denied or device unavailable (${err.message}). Upload a QR image or PDF instead.`
          : 'Unable to access camera. Upload a QR image or PDF instead.'
      );
    }
  };

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    stopCamera();
    setScanningFile(true);
    setScanError(null);

    try {
      const lower = file.name.toLowerCase();
      const res =
        file.type === 'application/pdf' || lower.endsWith('.pdf')
          ? await decodeQrFromPdfFile(file)
          : await decodeQrFromImageSource(file);

      if (res.previewUrl) {
        setPreviewQrUrl(res.previewUrl);
        setPreviewLabel(file.name);
      }

      if (!res.data) {
        setParsedResult(null);
        setScanError(
          `No readable QR code detected in "${file.name}". Ensure the QR square is sharp and uncropped, or paste the verification payload below.`
        );
        triggerHaptic('warning');
        return;
      }

      applyDecodedPayload(res.data, res.previewUrl, file.name);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Unable to scan QR code from file.'
      );
    } finally {
      setScanningFile(false);
    }
  };

  const handleLoadSpecimen = async (
    kind: 'shcil_estamp' | 'tax_tds' | 'educational_degree',
    vaultDoc?: KartaLocalRecord
  ) => {
    stopCamera();
    setScanningFile(true);
    setScanError(null);
    try {
      const specimen = await generateSpecimenQrDataUrl(kind, vaultDoc);
      const decoded = await decodeQrFromImageSource(specimen.dataUrl);
      if (!decoded.data) {
        setScanError('Generated specimen QR could not be decoded.');
        return;
      }
      applyDecodedPayload(decoded.data, specimen.dataUrl, specimen.label);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Specimen QR scan failed.'
      );
    } finally {
      setScanningFile(false);
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== tag.toLowerCase());
      }
      return sanitizeCustomTags([...prev, tag]);
    });
  };

  const handleAddCustomTag = () => {
    const clean = customTagInput.trim().slice(0, 32);
    if (!clean) return;
    setSelectedTags((prev) => sanitizeCustomTags([...prev, clean]));
    setCustomTagInput('');
  };

  const finalizedMeta: ParsedQrDocumentMetadata | null = parsedResult
    ? {
        ...parsedResult,
        title: editableTitle.trim() || parsedResult.title,
      }
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-start lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3 flex-[1_1_300px] min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-[#202124] dark:text-white">
                QR Code Scanner &amp; Official Digital Record Verifier
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Decode SHCIL e-Stamp, DigiLocker/NAD, Income Tax Form 16, or DIP Vault QR codes locally with <span className="font-mono">jsQR</span> to verify SHA-256 integrity and import metadata into Karta Files.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF671F] text-white text-xs font-semibold hover:bg-[#E55A16] cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              {scanningFile ? 'Decoding QR...' : 'Upload QR Image / PDF'}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  void handleFileUpload(f);
                  e.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              onClick={() =>
                cameraActive ? stopCamera() : void handleStartCamera()
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                cameraActive
                  ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="w-3.5 h-3.5" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-[#138808]" />
                  Scan with Camera
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Specimen Official QR Actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-[#FF671F]" />
            Test Specimen QR Records:
          </span>
          <button
            type="button"
            onClick={() => void handleLoadSpecimen('shcil_estamp')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-medium hover:border-[#FF671F] cursor-pointer"
          >
            SHCIL e-Stamp QR
          </button>
          <button
            type="button"
            onClick={() => void handleLoadSpecimen('tax_tds')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-medium hover:border-[#FF671F] cursor-pointer"
          >
            Tax Form 16 QR
          </button>
          <button
            type="button"
            onClick={() => void handleLoadSpecimen('educational_degree')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-medium hover:border-[#FF671F] cursor-pointer"
          >
            NAD Degree QR
          </button>
          {vaultDocs.length > 0 && (
            <button
              type="button"
              onClick={() => void handleLoadSpecimen('shcil_estamp', vaultDocs[0])}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              Verify Saved Vault QR ({vaultDocs[0].title.slice(0, 22)})
            </button>
          )}
        </div>

        {cameraError && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
            {cameraError}
          </div>
        )}

        {scanError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {scanError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Stage: Camera / QR Preview + Manual Payload Fallback */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 flex flex-col items-center justify-center min-h-[270px]">
              {cameraActive ? (
                <div className="w-full space-y-2 text-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full max-h-64 rounded-xl border border-indigo-400 object-cover bg-black"
                  />
                  <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                    Point a printed or digital QR code inside the camera frame...
                  </p>
                </div>
              ) : previewQrUrl ? (
                <div className="space-y-2.5 text-center">
                  <img
                    src={previewQrUrl}
                    alt={previewLabel || 'Scanned QR Code'}
                    className="max-h-56 mx-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-2 shadow-2xs"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">
                    Source: {previewLabel}
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-2 max-w-xs">
                  <FileScan className="w-9 h-9 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    No QR Image Loaded
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Upload a PNG/JPG/PDF document containing a QR code, start camera capture, or click one of the specimen QR generators above.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Or Paste Raw QR Verification String / JSON / URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder='e.g. {"certificateNo":"IN-DL..."} or https://...'
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!manualInput.trim()}
                  onClick={() =>
                    applyDecodedPayload(
                      manualInput.trim(),
                      undefined,
                      'Manual QR String'
                    )
                  }
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  Parse &amp; Verify
                </button>
              </div>
            </div>
          </div>

          {/* Right Stage: Decoded Verification Report & Import Controls */}
          <div className="lg:col-span-7">
            {!finalizedMeta ? (
              <div className="h-full min-h-[270px] rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/60 p-6 flex flex-col items-center justify-center text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Awaiting QR Verification Payload
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                  Decoded document fields, SHA-256 Vault comparison results, custom tag suggestions, and 1-click Karta import options will appear here.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-5 space-y-4">
                {/* Verification Status Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    finalizedMeta.verificationStatus === 'verified_vault_match'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : finalizedMeta.verificationStatus === 'verified_official_format'
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {finalizedMeta.verificationStatus === 'verified_vault_match' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <FileCheck2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-bold">{finalizedMeta.formatLabel}</div>
                    <div>{finalizedMeta.verificationSummary}</div>
                  </div>
                </div>

                {/* Editable Import Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Document Title for Import
                  </label>
                  <input
                    type="text"
                    value={editableTitle}
                    onChange={(e) => setEditableTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#202124] dark:text-white"
                  />
                </div>

                {/* Extracted Metadata Grid */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {finalizedMeta.fields.map((f, idx) => (
                    <div
                      key={`${f.label}_${idx}`}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {f.label}
                      </dt>
                      <dd className="font-semibold text-[#202124] dark:text-slate-100 mt-0.5 break-all tabular-nums">
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Assign Custom Tags before Import */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Tag className="w-3.5 h-3.5 text-[#FF671F]" />
                    <span>Assign Custom Vault Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {KARTA_PRESET_TAGS.map((tag) => {
                      const active = selectedTags.some(
                        (t) => t.toLowerCase() === tag.toLowerCase()
                      );
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#FF671F] text-white border-[#FF671F]'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#FF671F]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    {selectedTags
                      .filter(
                        (t) =>
                          !KARTA_PRESET_TAGS.some(
                            (p) => p.toLowerCase() === t.toLowerCase()
                          )
                      )
                      .map((custom) => (
                        <button
                          key={custom}
                          type="button"
                          onClick={() => handleToggleTag(custom)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer"
                        >
                          {custom} ×
                        </button>
                      ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTagInput}
                      maxLength={32}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder="Add custom label (e.g. FY2026, Court Case)..."
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#202124] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                    >
                      + Tag
                    </button>
                  </div>
                </div>

                {/* 1-Click Import Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onImportToViewer(finalizedMeta, selectedTags)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#138808] text-white text-xs font-semibold hover:bg-[#0F6D06] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Import to Viewer &amp; Stamp
                  </button>
                  <button
                    type="button"
                    onClick={() => onSealQrToVault(finalizedMeta, selectedTags)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Import &amp; Seal to Vault
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onImportToStudio(finalizedMeta.suggestedTemplateId)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#FF671F] bg-white dark:bg-slate-900 text-[#FF671F] text-xs font-semibold hover:bg-[#FFF5F0] cursor-pointer"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    Open Matching Studio Template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
