import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../../lib/firebase';
import { decryptPayload } from '../../lib/crypto';
import { triggerHaptic } from '../../lib/haptics';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { OperationType, type KartaFileRecord } from '../../types/platform';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Database,
  Edit3,
  Eye,
  FileCheck2,
  FolderHeart,
  FolderLock,
  Landmark,
  Layers,
  Lock,
  PenTool,
  QrCode,
  RefreshCw,
  Scale,
  ScanText,
  Search,
  ShieldCheck,
  Stamp,
  Tag,
  Trash2,
  Unlock,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  LibraryAuditReport,
  PublicProviderStatus,
  SavedUserDocument,
} from '../../karta/shared/types';
import { STATE_STAMP_GUIDES } from '../../karta/shared/constants';
import { STAMP_BACKGROUND_PATTERNS } from '../../assets/stamp-papers';
import { fetchAuditReport, fetchProviderStatus } from '../../karta/lib/api';
import {
  deleteSavedDraft,
  isEphemeralPrivateMode,
  loadSavedDrafts,
  saveDraftToVault,
  setEphemeralPrivateMode,
  wipeAllLocalPersonalData,
} from '../../karta/lib/localVault';
import {
  KARTA_PRESET_TAGS,
  deleteKartaVaultDocument,
  extractUserCustomTags,
  loadCachedKartaVault,
  mergeCloudWithOfflineCache,
  sanitizeCustomTags,
  saveOrUpdateKartaVaultDocument,
  startKartaSyncService,
  subscribeKartaSyncStatus,
  triggerKartaBackgroundSync,
  updateKartaVaultDocumentTags,
  type KartaLocalRecord,
  type KartaOcrMetadata,
  type KartaStampMetadata,
  type KartaSyncStatus,
  type KartaVaultDecryptedContent,
} from '../../karta/lib/kartaSyncService';
import {
  findOcrExcerpt,
  loadVaultOcrIndex,
  upsertVaultOcrIndexEntry,
  type VaultOcrIndexEntry,
} from '../../karta/lib/ocrEngine';
import type { ParsedQrDocumentMetadata } from '../../karta/lib/qrScanner';
import { LibraryBrowser } from '../../karta/components/LibraryBrowser';
import { DocumentEditor } from '../../karta/components/DocumentEditor';
import { ValidateAndAidHub } from '../../karta/components/ValidateAndAidHub';
import { SavedDraftsVault } from '../../karta/components/SavedDraftsVault';
import { LibraryAuditView } from '../../karta/components/LibraryAuditView';
import {
  InteractiveDocumentViewer,
  type ViewerSourceDocument,
} from '../../karta/components/InteractiveDocumentViewer';
import { KartaQrScanner } from '../../karta/components/KartaQrScanner';

type KartaView =
  | 'library'
  | 'editor'
  | 'viewer'
  | 'qr'
  | 'validate_aid'
  | 'vault'
  | 'audit';

interface KartaFilesPageProps {
  initialTemplateId?: string;
  onNavigate: (route: string, param?: string) => void;
}

interface PendingSealRequest {
  existingDocId?: string;
  existingVersion?: number;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  jurisdictionState: string;
  title: string;
  renderedText: string;
  formValues?: Record<string, string>;
  repeatableValues?: Record<string, Array<Record<string, string>>>;
  stampOverlay?: KartaStampMetadata | null;
  ocrMetadata?: KartaOcrMetadata | null;
  customTags?: string[];
}

export const KartaFilesPage: React.FC<KartaFilesPageProps> = ({
  initialTemplateId = '',
  onNavigate,
}) => {
  const { user } = useAuth();
  const online = useOnlineStatus();

  const [view, setView] = useState<KartaView>(() =>
    initialTemplateId ? 'editor' : 'library'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplateId || null
  );
  const [resumedDraft, setResumedDraft] = useState<SavedUserDocument | null>(null);
  const [viewerDocument, setViewerDocument] =
    useState<ViewerSourceDocument | null>(null);

  const [report, setReport] = useState<LibraryAuditReport | null>(null);
  const [providerStatus, setProviderStatus] = useState<PublicProviderStatus | null>(
    null
  );
  const [backendError, setBackendError] = useState<string | null>(null);

  // Browser-local vault state
  const [savedDrafts, setSavedDrafts] = useState<SavedUserDocument[]>(() =>
    loadSavedDrafts()
  );
  const [ephemeralMode, setEphemeralMode] = useState<boolean>(() =>
    isEphemeralPrivateMode()
  );

  // AES-256-GCM Encrypted Cloud Vault + Offline Background Sync + OCR Search + Tagging State
  const [passphrase, setPassphrase] = useState('');
  const [vaultDocs, setVaultDocs] = useState<KartaLocalRecord[]>([]);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [selectedVaultTag, setSelectedVaultTag] = useState<string | null>(null);
  const [tagEditorDocId, setTagEditorDocId] = useState<string | null>(null);
  const [tagDraftByDoc, setTagDraftByDoc] = useState<Record<string, string>>({});
  const [ocrIndexMap, setOcrIndexMap] = useState<Record<string, VaultOcrIndexEntry>>({});
  const [syncStatus, setSyncStatus] = useState<KartaSyncStatus | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<
    Record<
      string,
      {
        title: string;
        content: string;
        templateId: string;
        templateVersion: string;
        formValues?: Record<string, string>;
        repeatableValues?: Record<string, Array<Record<string, string>>>;
        stampOverlay?: KartaStampMetadata | null;
        ocrMetadata?: KartaOcrMetadata | null;
        customTags?: string[];
      }
    >
  >({});

  // Inline offline-ready editor on unlocked Vault cards
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);
  const [editingVaultTitle, setEditingVaultTitle] = useState<string>('');
  const [editingVaultContent, setEditingVaultContent] = useState<string>('');

  // Modal state for sealing new/updated documents from Studio, Viewer, or QR Scanner
  const [pendingSeal, setPendingSeal] = useState<PendingSealRequest | null>(null);
  const [sealTitleInput, setSealTitleInput] = useState('');
  const [sealTagsInput, setSealTagsInput] = useState<string[]>([]);
  const [sealCustomTagDraft, setSealCustomTagDraft] = useState('');
  const [savingVault, setSavingVault] = useState(false);
  const [cloudNotice, setCloudNotice] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Load Karta Files library audit & provider status
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAuditReport(), fetchProviderStatus()])
      .then(([auditRes, provData]) => {
        if (cancelled) return;
        setReport(auditRes.report);
        setProviderStatus(provData);
        setBackendError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setBackendError(
          err instanceof Error
            ? err.message
            : 'Unable to load Karta Files repository index.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize Karta Background Sync Service
  useEffect(() => {
    const stopSync = startKartaSyncService(user?.id || null);
    const unsubSync = subscribeKartaSyncStatus((next) => {
      setSyncStatus(next);
    });
    return () => {
      unsubSync();
      stopSync();
    };
  }, [user?.id]);

  // Sync route param template ID if changed externally
  useEffect(() => {
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
      setResumedDraft(null);
      setView('editor');
    }
  }, [initialTemplateId]);

  // Hydrate offline IndexedDB vault cache & OCR search index immediately, then attach Firestore live listener
  useEffect(() => {
    if (!user?.id) {
      setVaultDocs([]);
      setOcrIndexMap({});
      return;
    }

    let cancelled = false;
    void loadCachedKartaVault(user.id).then((cached) => {
      if (!cancelled && cached.length > 0) {
        setVaultDocs(cached);
      }
    });
    void loadVaultOcrIndex(user.id).then((entries) => {
      if (cancelled) return;
      const mapped: Record<string, VaultOcrIndexEntry> = {};
      for (const item of entries) {
        mapped[item.docId] = item;
      }
      setOcrIndexMap(mapped);
    });

    const q = query(
      collection(db, 'karta_files'),
      where('ownerId', '==', user.id)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const cloudList = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<KartaFileRecord, 'id'>),
        }));
        void mergeCloudWithOfflineCache(user.id, cloudList).then((merged) => {
          if (!cancelled) setVaultDocs(merged);
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'karta_files');
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.id]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setResumedDraft(null);
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleEphemeral = (val: boolean) => {
    setEphemeralPrivateMode(val);
    setEphemeralMode(val);
  };

  const handleSaveLocalDraft = (draft: SavedUserDocument) => {
    if (ephemeralMode) return;
    const next = saveDraftToVault(draft);
    setSavedDrafts(next);
  };

  const handleOpenDraft = (draft: SavedUserDocument, asDuplicate = false) => {
    setSelectedTemplateId(draft.templateId);
    setResumedDraft(
      asDuplicate
        ? {
            ...draft,
            id: `local_${Date.now()}`,
            label: `${draft.label} (Copy)`,
          }
        : draft
    );
    setView('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLocalDraft = (id: string) => {
    setSavedDrafts(deleteSavedDraft(id));
  };

  const handleWipeAllLocal = () => {
    wipeAllLocalPersonalData();
    setEphemeralPrivateMode(false);
    setSavedDrafts([]);
    setEphemeralMode(false);
  };

  const openCloudSealFromStudio = (draft: SavedUserDocument) => {
    const inferredTags = sanitizeCustomTags(
      /tax|itr|gst|tds/i.test(draft.templateTitle)
        ? ['Tax']
        : /school|degree|education/i.test(draft.templateTitle)
        ? ['Educational']
        : ['Legal']
    );
    setPendingSeal({
      templateId: draft.templateId,
      templateTitle: draft.templateTitle,
      templateVersion: draft.templateVersion,
      jurisdictionState:
        draft.formValues['jurisdiction_state'] || 'All-India',
      title: draft.label || draft.templateTitle,
      renderedText: draft.renderedText,
      formValues: draft.formValues,
      repeatableValues: draft.repeatableValues,
      customTags: inferredTags,
    });
    setSealTitleInput(draft.label || draft.templateTitle);
    setSealTagsInput(inferredTags);
    setSealCustomTagDraft('');
    setCloudNotice(null);
  };

  const openCloudSealFromViewer = (params: {
    vaultDocId?: string;
    vaultVersion?: number;
    templateId?: string;
    title: string;
    textContent: string;
    stampOverlay: KartaStampMetadata | null;
    ocrMetadata?: KartaOcrMetadata | null;
    customTags?: string[];
  }) => {
    const existingDoc = params.vaultDocId
      ? vaultDocs.find((d) => d.id === params.vaultDocId)
      : undefined;
    const initialTags = sanitizeCustomTags(
      params.customTags?.length
        ? params.customTags
        : existingDoc
        ? extractUserCustomTags(existingDoc.tags)
        : ['Legal']
    );
    setPendingSeal({
      existingDocId: params.vaultDocId,
      existingVersion: params.vaultVersion,
      templateId: params.templateId || 'viewer_doc',
      templateTitle: params.title,
      templateVersion: String(params.vaultVersion || '1.0'),
      jurisdictionState: 'All-India',
      title: params.title,
      renderedText: params.textContent,
      stampOverlay: params.stampOverlay,
      ocrMetadata: params.ocrMetadata || null,
      customTags: initialTags,
    });
    setSealTitleInput(params.title);
    setSealTagsInput(initialTags);
    setSealCustomTagDraft('');
    setCloudNotice(null);
  };

  const handleImportQrToViewer = (
    meta: ParsedQrDocumentMetadata,
    customTags: string[]
  ) => {
    setViewerDocument({
      id: `qr_import_${Date.now()}`,
      templateId: meta.suggestedTemplateId || 'qr_imported',
      title: meta.title,
      fileName: `${meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.txt`,
      kind: 'text',
      textContent: meta.summaryText,
      fileSizeBytes: new Blob([meta.summaryText]).size,
      initialTags: sanitizeCustomTags(customTags),
    });
    setView('viewer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSealQrToVault = (
    meta: ParsedQrDocumentMetadata,
    customTags: string[]
  ) => {
    const cleanTags = sanitizeCustomTags(customTags);
    setPendingSeal({
      templateId: meta.suggestedTemplateId || 'qr_imported',
      templateTitle: meta.documentType || meta.title,
      templateVersion: '1.0',
      jurisdictionState: meta.jurisdictionState || 'All-India',
      title: meta.title,
      renderedText: meta.summaryText,
      customTags: cleanTags,
    });
    setSealTitleInput(meta.title);
    setSealTagsInput(cleanTags);
    setSealCustomTagDraft('');
    setCloudNotice(null);
  };

  const handleQuickScanUploadToViewer = async (file?: File) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    try {
      if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setViewerDocument({
          id: `vault_scan_${Date.now()}`,
          templateId: 'ocr_scanned_pdf',
          title: file.name.replace(/\.pdf$/i, ''),
          fileName: file.name,
          kind: 'pdf',
          pdfBytes: bytes,
          fileSizeBytes: file.size,
          autoRunOcr: true,
        });
      } else {
        const imageUrl = URL.createObjectURL(file);
        setViewerDocument({
          id: `vault_scan_${Date.now()}`,
          templateId: 'ocr_scanned_doc',
          title: file.name,
          fileName: file.name,
          kind: 'image',
          imageUrl,
          fileSizeBytes: file.size,
          autoRunOcr: true,
        });
      }
      setView('viewer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setCloudNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load scanned file for OCR.',
      });
    }
  };

  const handleConfirmCloudSeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSeal) return;
    if (!user?.id) {
      setCloudNotice({
        type: 'err',
        text: 'Sign in with your DIP-Desk account to seal documents into the Cloud Vault.',
      });
      return;
    }
    if (passphrase.trim().length < 6) {
      setCloudNotice({
        type: 'err',
        text: 'Enter a zero-knowledge vault passphrase (minimum 6 characters).',
      });
      return;
    }

    setSavingVault(true);
    setCloudNotice(null);
    try {
      const result = await saveOrUpdateKartaVaultDocument({
        existingDocId: pendingSeal.existingDocId,
        existingVersion: pendingSeal.existingVersion,
        ownerId: user.id,
        actorRole: user.role,
        title: sealTitleInput.trim() || pendingSeal.title,
        templateId: pendingSeal.templateId,
        templateTitle: pendingSeal.templateTitle,
        templateVersion: pendingSeal.templateVersion,
        jurisdictionState: pendingSeal.jurisdictionState,
        renderedText: pendingSeal.renderedText,
        formValues: pendingSeal.formValues,
        repeatableValues: pendingSeal.repeatableValues,
        stampOverlay: pendingSeal.stampOverlay,
        ocrMetadata: pendingSeal.ocrMetadata,
        customTags: sealTagsInput,
        passphrase,
        isOnline: online,
      });

      // Keep local optimistic copy reflected immediately
      setVaultDocs((prev) => [
        result.localRecord,
        ...prev.filter((d) => d.id !== result.docId),
      ]);
      setDecryptedMap((prev) => ({
        ...prev,
        [result.docId]: {
          title: result.localRecord.title,
          content: pendingSeal.renderedText,
          templateId: pendingSeal.templateId,
          templateVersion: pendingSeal.templateVersion,
          formValues: pendingSeal.formValues,
          repeatableValues: pendingSeal.repeatableValues,
          stampOverlay: pendingSeal.stampOverlay,
          ocrMetadata: pendingSeal.ocrMetadata,
          customTags: sanitizeCustomTags(sealTagsInput),
        },
      }));
      const indexedText = (
        pendingSeal.ocrMetadata?.ocrText || pendingSeal.renderedText || ''
      ).trim();
      if (pendingSeal.ocrMetadata?.ocrText || indexedText.length > 20) {
        setOcrIndexMap((prev) => ({
          ...prev,
          [result.docId]: {
            docId: result.docId,
            ownerId: user.id,
            title: result.localRecord.title,
            extractedText: indexedText,
            confidence: pendingSeal.ocrMetadata?.ocrConfidence ?? 100,
            wordCount:
              pendingSeal.ocrMetadata?.ocrWordCount ??
              indexedText.split(/\s+/).filter(Boolean).length,
            language: pendingSeal.ocrMetadata?.ocrLanguage || 'eng',
            indexedAt:
              pendingSeal.ocrMetadata?.ocrIndexedAt || new Date().toISOString(),
            sourceFileName: pendingSeal.ocrMetadata?.sourceFileName,
          },
        }));
      }

      setCloudNotice({
        type: 'ok',
        text: result.syncedImmediately
          ? `Encrypted with AES-256-GCM & synced to Firestore (${result.docId}, v${result.localRecord.version}).`
          : `Offline edit v${result.localRecord.version} cached locally & queued for automatic background sync once online.`,
      });
      setPendingSeal(null);
      setView('vault');
    } catch (err: any) {
      setCloudNotice({
        type: 'err',
        text: err?.message || 'Failed to encrypt & seal document.',
      });
    } finally {
      setSavingVault(false);
    }
  };

  const handleSaveInlineVaultEdit = async (rec: KartaLocalRecord) => {
    if (!user?.id) return;
    if (passphrase.trim().length < 6) {
      setCloudNotice({
        type: 'err',
        text: 'Enter your vault passphrase (min 6 chars) above before saving edits.',
      });
      return;
    }

    const dec = decryptedMap[rec.id];
    setSavingVault(true);
    setCloudNotice(null);
    try {
      const existingCustomTags = extractUserCustomTags(rec.tags || []);
      const result = await saveOrUpdateKartaVaultDocument({
        existingDocId: rec.id,
        existingVersion: rec.version,
        ownerId: user.id,
        actorRole: user.role,
        title: editingVaultTitle.trim() || rec.title,
        templateId: dec?.templateId || rec.tags?.[0] || 'karta_draft',
        templateTitle: editingVaultTitle.trim() || rec.title,
        templateVersion: dec?.templateVersion || String(rec.version),
        jurisdictionState: rec.tags?.[1] || 'All-India',
        renderedText: editingVaultContent,
        formValues: dec?.formValues,
        repeatableValues: dec?.repeatableValues,
        stampOverlay: dec?.stampOverlay,
        ocrMetadata: dec?.ocrMetadata
          ? {
              ...dec.ocrMetadata,
              ocrText: editingVaultContent,
              ocrWordCount: editingVaultContent.trim().split(/\s+/).filter(Boolean).length,
              ocrIndexedAt: new Date().toISOString(),
            }
          : null,
        customTags: dec?.customTags?.length ? dec.customTags : existingCustomTags,
        passphrase,
        isOnline: online,
      });

      const updatedOcrMeta = dec?.ocrMetadata
        ? {
            ...dec.ocrMetadata,
            ocrText: editingVaultContent,
            ocrWordCount: editingVaultContent.trim().split(/\s+/).filter(Boolean).length,
            ocrIndexedAt: new Date().toISOString(),
          }
        : null;

      setVaultDocs((prev) => [
        result.localRecord,
        ...prev.filter((d) => d.id !== result.docId),
      ]);
      setDecryptedMap((prev) => ({
        ...prev,
        [rec.id]: {
          title: result.localRecord.title,
          content: editingVaultContent,
          templateId: dec?.templateId || rec.tags?.[0] || 'karta_draft',
          templateVersion: dec?.templateVersion || String(result.localRecord.version),
          formValues: dec?.formValues,
          repeatableValues: dec?.repeatableValues,
          stampOverlay: dec?.stampOverlay,
          ocrMetadata: updatedOcrMeta,
          customTags: dec?.customTags?.length ? dec.customTags : existingCustomTags,
        },
      }));
      if (editingVaultContent.trim().length > 20) {
        setOcrIndexMap((prev) => ({
          ...prev,
          [rec.id]: {
            docId: rec.id,
            ownerId: user.id,
            title: result.localRecord.title,
            extractedText: editingVaultContent,
            confidence: updatedOcrMeta?.ocrConfidence ?? 100,
            wordCount:
              updatedOcrMeta?.ocrWordCount ??
              editingVaultContent.trim().split(/\s+/).filter(Boolean).length,
            language: updatedOcrMeta?.ocrLanguage || 'eng',
            indexedAt: updatedOcrMeta?.ocrIndexedAt || new Date().toISOString(),
          },
        }));
      }
      setEditingVaultId(null);
      setCloudNotice({
        type: 'ok',
        text: result.syncedImmediately
          ? `Saved v${result.localRecord.version} edit and synced to Firestore.`
          : `Offline edit v${result.localRecord.version} stored in IndexedDB & queued for background sync.`,
      });
    } catch (err: any) {
      setCloudNotice({
        type: 'err',
        text: err?.message || 'Unable to save vault edit.',
      });
    } finally {
      setSavingVault(false);
    }
  };

  const handleDecryptCloudDoc = async (rec: KartaLocalRecord) => {
    if (!passphrase.trim()) {
      setCloudNotice({
        type: 'err',
        text: 'Enter your vault passphrase above to unlock this document.',
      });
      return;
    }
    try {
      const plain = await decryptPayload(
        rec.encryptedPayload,
        rec.iv,
        rec.salt,
        passphrase
      );
      const parsed = JSON.parse(plain) as Partial<KartaVaultDecryptedContent>;
      const ocrMeta: KartaOcrMetadata | null = parsed.ocrText
        ? {
            ocrText: parsed.ocrText,
            ocrLanguage: parsed.ocrLanguage || 'eng',
            ocrConfidence: parsed.ocrConfidence ?? 100,
            ocrWordCount:
              parsed.ocrWordCount ??
              parsed.ocrText.split(/\s+/).filter(Boolean).length,
            ocrIndexedAt: parsed.ocrIndexedAt || String(rec.updatedAt || new Date().toISOString()),
          }
        : null;
      const unlockedTitle = parsed.label || parsed.templateTitle || rec.title;
      const unlockedContent = parsed.renderedText || plain;

      setDecryptedMap((prev) => ({
        ...prev,
        [rec.id]: {
          title: unlockedTitle,
          content: unlockedContent,
          templateId: parsed.templateId || rec.tags?.[0] || '',
          templateVersion: parsed.templateVersion || String(rec.version || '1.0'),
          formValues: parsed.formValues,
          repeatableValues: parsed.repeatableValues,
          stampOverlay: parsed.stampOverlay || null,
          ocrMetadata: ocrMeta,
          customTags: parsed.customTags || extractUserCustomTags(rec.tags),
        },
      }));

      // Index unlocked text / OCR text locally so Vault search works across devices
      if (user?.id && (ocrMeta?.ocrText || unlockedContent.length > 20)) {
        const indexText = ocrMeta?.ocrText || unlockedContent;
        const entry: VaultOcrIndexEntry = {
          docId: rec.id,
          ownerId: user.id,
          title: unlockedTitle,
          extractedText: indexText,
          confidence: ocrMeta?.ocrConfidence ?? 100,
          wordCount: ocrMeta?.ocrWordCount ?? indexText.split(/\s+/).filter(Boolean).length,
          language: ocrMeta?.ocrLanguage || 'eng',
          indexedAt: ocrMeta?.ocrIndexedAt || new Date().toISOString(),
        };
        setOcrIndexMap((prev) => ({ ...prev, [rec.id]: entry }));
        void upsertVaultOcrIndexEntry(entry);
      }
      triggerHaptic('light');
      setCloudNotice({
        type: 'ok',
        text: `Unlocked "${rec.title}" locally in browser memory.`,
      });
    } catch {
      triggerHaptic('warning');
      setCloudNotice({
        type: 'err',
        text: 'Incorrect passphrase or corrupted AES-256-GCM ciphertext.',
      });
    }
  };

  const handleViewVaultDocInViewer = (rec: KartaLocalRecord) => {
    const dec = decryptedMap[rec.id];
    if (!dec) return;
    setViewerDocument({
      id: `viewer_${rec.id}`,
      vaultDocId: rec.id,
      vaultVersion: rec.version,
      templateId: dec.templateId,
      title: dec.title,
      fileName: `${dec.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.txt`,
      kind: 'vault',
      textContent: dec.content,
      fileSizeBytes: rec.sizeBytes,
      initialStamp: dec.stampOverlay || null,
      initialOcr: dec.ocrMetadata || null,
      initialTags: extractUserCustomTags(rec.tags),
    });
    setView('viewer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRestoreCloudDocToStudio = (rec: KartaLocalRecord) => {
    const dec = decryptedMap[rec.id];
    if (!dec) return;
    const restored: SavedUserDocument = {
      id: `cloud_${rec.id}`,
      templateId: dec.templateId || rec.tags?.[0] || '',
      templateTitle: rec.title,
      templateVersion: dec.templateVersion || String(rec.version || '1.0'),
      label: dec.title,
      formValues: dec.formValues || {},
      repeatableValues: dec.repeatableValues || {},
      renderedText: dec.content,
      updatedAt: String(rec.updatedAt || new Date().toISOString()),
    };
    handleOpenDraft(restored, false);
  };

  const handleDeleteCloudDoc = async (id: string) => {
    if (!user?.id) return;
    const target = vaultDocs.find((d) => d.id === id);
    try {
      await deleteKartaVaultDocument({
        ownerId: user.id,
        docId: id,
        localOnly: target?.localOperation === 'set' && Boolean(target?.pendingSync),
        isOnline: online,
      });
      setVaultDocs((prev) => prev.filter((d) => d.id !== id));
      setDecryptedMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setOcrIndexMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      triggerHaptic('light');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `karta_files/${id}`);
    }
  };

  const handleUpdateVaultDocTags = async (
    rec: KartaLocalRecord,
    nextUserTags: string[]
  ) => {
    if (!user?.id) return;
    try {
      const res = await updateKartaVaultDocumentTags({
        ownerId: user.id,
        actorRole: user.role,
        docId: rec.id,
        existingTags: rec.tags || [],
        nextUserTags,
        isOnline: online,
      });
      setVaultDocs((prev) =>
        prev.map((d) =>
          d.id === rec.id
            ? {
                ...d,
                tags: res.mergedTags,
                pendingSync: !res.syncedImmediately,
              }
            : d
        )
      );
      setDecryptedMap((prev) =>
        prev[rec.id]
          ? {
              ...prev,
              [rec.id]: {
                ...prev[rec.id],
                customTags: extractUserCustomTags(res.mergedTags),
              },
            }
          : prev
      );
      setCloudNotice({
        type: 'ok',
        text: res.syncedImmediately
          ? `Updated labels on "${rec.title}".`
          : `Saved label update offline on "${rec.title}" — queued for background sync.`,
      });
    } catch (err: any) {
      setCloudNotice({
        type: 'err',
        text: err?.message || 'Unable to update document labels.',
      });
    }
  };

  const vaultTagCounts = (() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const rec of vaultDocs) {
      for (const t of extractUserCustomTags(rec.tags || [])) {
        const key = t.toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { label: t, count: 1 });
        }
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  })();

  const filteredVaultDocs = vaultDocs.filter((rec) => {
    if (selectedVaultTag) {
      const userTags = extractUserCustomTags(rec.tags || []);
      const hasTag = userTags.some(
        (t) => t.toLowerCase() === selectedVaultTag.toLowerCase()
      );
      if (!hasTag) return false;
    }

    const q = vaultSearchQuery.trim().toLowerCase();
    if (!q) return true;
    const dec = decryptedMap[rec.id];
    const ocrEntry = ocrIndexMap[rec.id];
    return (
      rec.title.toLowerCase().includes(q) ||
      (rec.tags || []).some((t) => t.toLowerCase().includes(q)) ||
      Boolean(dec?.content?.toLowerCase().includes(q)) ||
      Boolean(ocrEntry?.extractedText?.toLowerCase().includes(q))
    );
  });

  const navTabs: Array<{
    id: KartaView;
    label: string;
    badge?: string | number;
    icon: typeof BookOpen;
  }> = [
    {
      id: 'library',
      label: 'Document Archive',
      badge: report ? report.totalTemplatesCreated.toLocaleString('en-IN') : '2,615+',
      icon: BookOpen,
    },
    {
      id: 'editor',
      label: 'Document Studio',
      badge: selectedTemplateId ? 'Active' : undefined,
      icon: PenTool,
    },
    {
      id: 'viewer',
      label: 'Viewer, OCR & Stamps',
      badge: 'OCR',
      icon: Eye,
    },
    {
      id: 'qr',
      label: 'QR Scanner & Verify',
      badge: 'jsQR',
      icon: QrCode,
    },
    {
      id: 'validate_aid',
      label: 'Validate & Legal Aid',
      icon: FileCheck2,
    },
    {
      id: 'vault',
      label: 'Saved & E2EE Vault',
      badge: savedDrafts.length + vaultDocs.length || undefined,
      icon: FolderHeart,
    },
    {
      id: 'audit',
      label: 'Audit & Stamp Guides',
      icon: ClipboardCheck,
    },
  ];

  const pendingSyncCount = syncStatus?.pendingCount || 0;

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-slate-950 text-[#202124] dark:text-slate-100 pb-16">
      {/* Top Integrated DIP-Desk × Karta Files Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF671F] to-[#138808] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#FF671F]">
                    Digital-India-Project / Karta-Files
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#138808] dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    SHCIL e-Stamp + Interactive Viewer + Offline Background Sync
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#202124] dark:text-white tracking-tight">
                  Karta Files Legal Document Studio &amp; Stamp Paper Workbench
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  13 curated instruments + 2,615 source templates · Interactive multi-format PDF/DOCX/Image Viewer with quick-action stamp animation · Offline IndexedDB Vault Sync
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Live Background Sync Pill */}
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                  !online
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : pendingSyncCount > 0
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {online ? (
                  <Cloud className="w-3.5 h-3.5" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5" />
                )}
                <span>
                  {!online
                    ? `Offline (${pendingSyncCount} queued)`
                    : syncStatus?.isSyncing
                    ? 'Syncing...'
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount} Pending Sync`
                    : 'Vault Synced'}
                </span>
                {online && (
                  <button
                    type="button"
                    disabled={syncStatus?.isSyncing}
                    onClick={() => void triggerKartaBackgroundSync('manual')}
                    className="ml-1 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                    title="Trigger Background Vault Sync"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        syncStatus?.isSyncing ? 'animate-spin' : ''
                      }`}
                    />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setView('qr')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                Scan QR
              </button>
              <button
                type="button"
                onClick={() => onNavigate('tools-tray')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-[#FF671F]" />
                Tools-Tray
              </button>
              <button
                type="button"
                onClick={() => setView('audit')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
              >
                <Stamp className="w-3.5 h-3.5" />
                Stamp Duty Schedule
              </button>
            </div>
          </div>

          {/* 6-Tab Workbench Bar */}
          <nav
            aria-label="Karta Files Workbench Views"
            className="flex flex-wrap items-center gap-1.5 pt-1"
          >
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#FF671F] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {backendError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {backendError}
            </div>
          )}
        </div>
      </div>

      {/* MAIN VIEWS */}
      {view === 'library' && (
        <LibraryBrowser
          report={report}
          providerStatus={providerStatus}
          onSelectTemplate={handleSelectTemplate}
          onOpenValidateAid={() => setView('validate_aid')}
        />
      )}

      {view === 'editor' && (
        <DocumentEditor
          templateId={selectedTemplateId}
          initialDraft={resumedDraft}
          ephemeralMode={ephemeralMode}
          onBackToLibrary={() => setView('library')}
          onSaveLocalDraft={handleSaveLocalDraft}
          onSealToCloudVault={openCloudSealFromStudio}
        />
      )}

      {view === 'viewer' && (
        <InteractiveDocumentViewer
          externalDocument={viewerDocument}
          onSaveDraftToVault={openCloudSealFromViewer}
          isOnline={online}
        />
      )}

      {view === 'qr' && (
        <KartaQrScanner
          vaultDocs={vaultDocs}
          onImportToViewer={handleImportQrToViewer}
          onImportToStudio={handleSelectTemplate}
          onSealQrToVault={handleSealQrToVault}
        />
      )}

      {view === 'validate_aid' && <ValidateAndAidHub />}

      {view === 'vault' && (
        <div className="space-y-8">
          {/* Local Browser Drafts Vault */}
          <SavedDraftsVault
            drafts={savedDrafts}
            ephemeralMode={ephemeralMode}
            onToggleEphemeral={handleToggleEphemeral}
            onOpenDraft={handleOpenDraft}
            onDeleteDraft={handleDeleteLocalDraft}
            onWipeAll={handleWipeAllLocal}
          />

          {/* Firestore AES-256-GCM Zero-Knowledge Cloud Vault + Background Sync Engine */}
          <section className="max-w-5xl mx-auto px-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    <FolderLock className="w-4 h-4" />
                    DIP-Desk E2EE Cloud Vault &amp; Background Sync Engine
                  </div>
                  <h2 className="text-xl font-bold text-[#202124] dark:text-white mt-1">
                    Encrypted Legal Drafts &amp; Deeds ({vaultDocs.length})
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    AES-256-GCM encrypted in your browser with IndexedDB offline caching. Edit any unlocked document while offline — edits automatically sync to Firestore when connectivity returns.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView('qr')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Scan QR
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF671F] text-white text-xs font-semibold hover:bg-[#E55A16] cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    Scan &amp; OCR Upload
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        void handleQuickScanUploadToViewer(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Vault Passphrase (min 6 chars)"
                      className="pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!online || syncStatus?.isSyncing}
                    onClick={() => void triggerKartaBackgroundSync('manual')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        syncStatus?.isSyncing ? 'animate-spin' : ''
                      }`}
                    />
                    Sync Now ({pendingSyncCount})
                  </button>
                </div>
              </div>

              {/* Full-Text OCR Search & Custom Tag Filter Strip */}
              {user && vaultDocs.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={vaultSearchQuery}
                        onChange={(e) => setVaultSearchQuery(e.target.value)}
                        placeholder="Search Vault titles, tags, and Tesseract OCR-indexed text from scanned documents..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-[#202124] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/40"
                      />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      Showing {filteredVaultDocs.length} of {vaultDocs.length} ·{' '}
                      {Object.keys(ocrIndexMap).length} OCR-indexed
                    </div>
                  </div>

                  {/* Interactive Custom Document Tag Filters */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                      <Tag className="w-3.5 h-3.5 text-[#FF671F]" />
                      Filter by Tag:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedVaultTag(null)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                        selectedVaultTag === null
                          ? 'bg-[#202124] dark:bg-white text-white dark:text-slate-950 border-[#202124] dark:border-white'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#FF671F]'
                      }`}
                    >
                      All ({vaultDocs.length})
                    </button>
                    {vaultTagCounts.map((tg) => {
                      const active =
                        selectedVaultTag?.toLowerCase() === tg.label.toLowerCase();
                      return (
                        <button
                          key={tg.label}
                          type="button"
                          onClick={() =>
                            setSelectedVaultTag(active ? null : tg.label)
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                            active
                              ? 'bg-[#FF671F] text-white border-[#FF671F]'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-[#FF671F]'
                          }`}
                        >
                          {tg.label} ({tg.count})
                        </button>
                      );
                    })}
                    {selectedVaultTag && (
                      <button
                        type="button"
                        onClick={() => setSelectedVaultTag(null)}
                        className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Background Sync Activity Telemetry Strip */}
              {syncStatus && syncStatus.recentEvents.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>Background Sync Log</span>
                    {syncStatus.lastSyncAt && (
                      <span className="font-mono text-[10px] text-slate-400">
                        Last Sync:{' '}
                        {new Date(syncStatus.lastSyncAt).toLocaleTimeString('en-IN')}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {syncStatus.recentEvents.slice(0, 4).map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        <span className="truncate">• {evt.message}</span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cloudNotice && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    cloudNotice.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{cloudNotice.text}</span>
                </div>
              )}

              {!user ? (
                <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <p className="text-sm font-semibold text-[#202124] dark:text-white">
                    Sign in to access Firestore AES-256-GCM Cloud Vault &amp; Background Sync
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your browser-local drafts above and Interactive Document Viewer remain usable even without signing in.
                  </p>
                </div>
              ) : filteredVaultDocs.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                  {vaultDocs.length === 0 ? (
                    <>
                      No cloud-sealed instruments yet. Open any template in Document Studio, upload a scanned image/PDF via{' '}
                      <strong className="text-[#FF671F]">Scan &amp; OCR Upload</strong>, or click{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        Seal to Vault
                      </strong>
                      .
                    </>
                  ) : selectedVaultTag && !vaultSearchQuery.trim() ? (
                    <>No documents carry the &ldquo;{selectedVaultTag}&rdquo; tag.</>
                  ) : (
                    <>
                      No documents match
                      {selectedVaultTag ? ` tag "${selectedVaultTag}"` : ''}
                      {vaultSearchQuery.trim() ? ` query "${vaultSearchQuery}"` : ''}.
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredVaultDocs.map((rec) => {
                    const dec = decryptedMap[rec.id];
                    const ocrEntry = ocrIndexMap[rec.id];
                    const ocrMatchExcerpt = vaultSearchQuery.trim()
                      ? findOcrExcerpt(
                          dec?.content || ocrEntry?.extractedText || '',
                          vaultSearchQuery
                        )
                      : null;
                    const isEditing = editingVaultId === rec.id;
                    return (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-sm text-[#202124] dark:text-white">
                                {rec.title}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              v{rec.version} · {rec.status} · {rec.bucketSlot} · {rec.d1Shard} · SHA-256:{' '}
                              {rec.integrityHash?.slice(0, 12)}…
                              {rec.pendingSync ? ' · Pending Offline Sync' : ''}
                              {ocrEntry ? ` · OCR Indexed (${ocrEntry.confidence}%, ${ocrEntry.wordCount} words)` : ''}
                            </p>
                            {ocrMatchExcerpt && (
                              <p className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40 px-2.5 py-1 rounded-md border border-indigo-200/70 dark:border-indigo-900/60 flex items-center gap-1.5">
                                <ScanText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{ocrMatchExcerpt}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!dec ? (
                              <button
                                type="button"
                                onClick={() => handleDecryptCloudDoc(rec)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Unlock
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleViewVaultDocInViewer(rec)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#138808] text-white text-xs font-semibold hover:bg-[#0F6D06] cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View &amp; Stamp
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditingVaultId(null);
                                    } else {
                                      setEditingVaultId(rec.id);
                                      setEditingVaultTitle(dec.title);
                                      setEditingVaultContent(dec.content);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-50 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  {isEditing ? 'Cancel Edit' : 'Edit Offline'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRestoreCloudDocToStudio(rec)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF671F] text-white text-xs font-semibold hover:bg-[#E55A16] cursor-pointer"
                                >
                                  <PenTool className="w-3.5 h-3.5" />
                                  Studio
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteCloudDoc(rec.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Interactive Document Custom Tags Bar */}
                        {(() => {
                          const docCustomTags = extractUserCustomTags(rec.tags || []);
                          const isTagOpen = tagEditorDocId === rec.id;
                          const draftTagVal = tagDraftByDoc[rec.id] || '';
                          return (
                            <div className="space-y-2 pt-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {docCustomTags.map((tg) => (
                                  <span
                                    key={tg}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedVaultTag((cur) =>
                                          cur?.toLowerCase() === tg.toLowerCase()
                                            ? null
                                            : tg
                                        )
                                      }
                                      className="hover:text-[#FF671F] cursor-pointer"
                                      title={`Filter vault by ${tg}`}
                                    >
                                      {tg}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleUpdateVaultDocTags(
                                          rec,
                                          docCustomTags.filter((x) => x !== tg)
                                        )
                                      }
                                      aria-label={`Remove tag ${tg}`}
                                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTagEditorDocId(isTagOpen ? null : rec.id)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-[#FF671F] hover:text-[#FF671F] cursor-pointer"
                                >
                                  <Tag className="w-3 h-3" />
                                  {isTagOpen ? 'Done Tagging' : '+ Tag'}
                                </button>
                              </div>

                              {isTagOpen && (
                                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    {KARTA_PRESET_TAGS.map((preset) => {
                                      const hasPreset = docCustomTags.some(
                                        (t) =>
                                          t.toLowerCase() === preset.toLowerCase()
                                      );
                                      return (
                                        <button
                                          key={preset}
                                          type="button"
                                          onClick={() => {
                                            const next = hasPreset
                                              ? docCustomTags.filter(
                                                  (t) =>
                                                    t.toLowerCase() !==
                                                    preset.toLowerCase()
                                                )
                                              : [...docCustomTags, preset];
                                            void handleUpdateVaultDocTags(rec, next);
                                          }}
                                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                                            hasPreset
                                              ? 'bg-[#FF671F] text-white border-[#FF671F]'
                                              : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#FF671F]'
                                          }`}
                                        >
                                          {hasPreset ? `✓ ${preset}` : `+ ${preset}`}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={draftTagVal}
                                      maxLength={32}
                                      onChange={(e) =>
                                        setTagDraftByDoc((prev) => ({
                                          ...prev,
                                          [rec.id]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && draftTagVal.trim()) {
                                          e.preventDefault();
                                          void handleUpdateVaultDocTags(rec, [
                                            ...docCustomTags,
                                            draftTagVal.trim(),
                                          ]);
                                          setTagDraftByDoc((prev) => ({
                                            ...prev,
                                            [rec.id]: '',
                                          }));
                                        }
                                      }}
                                      placeholder="Custom tag (max 32 chars)..."
                                      className="flex-1 px-2.5 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                                    />
                                    <button
                                      type="button"
                                      disabled={!draftTagVal.trim()}
                                      onClick={() => {
                                        if (!draftTagVal.trim()) return;
                                        void handleUpdateVaultDocTags(rec, [
                                          ...docCustomTags,
                                          draftTagVal.trim(),
                                        ]);
                                        setTagDraftByDoc((prev) => ({
                                          ...prev,
                                          [rec.id]: '',
                                        }));
                                      }}
                                      className="px-2.5 py-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                                    >
                                      Add
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {dec && isEditing && (
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                              <span>
                                Editing Draft v{rec.version} ({online ? 'Online Direct Sync' : 'Offline Cached Queue'})
                              </span>
                            </div>
                            <input
                              type="text"
                              value={editingVaultTitle}
                              onChange={(e) => setEditingVaultTitle(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-white"
                            />
                            <textarea
                              rows={8}
                              value={editingVaultContent}
                              onChange={(e) => setEditingVaultContent(e.target.value)}
                              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                disabled={savingVault}
                                onClick={() => void handleSaveInlineVaultEdit(rec)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                {online
                                  ? `Encrypt & Sync v${rec.version + 1}`
                                  : `Queue Offline Edit v${rec.version + 1}`}
                              </button>
                            </div>
                          </div>
                        )}

                        {dec && !isEditing && (
                          <pre className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-h-56 overflow-y-auto whitespace-pre-wrap">
                            {dec.content}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {view === 'audit' && (
        <div className="space-y-10">
          <LibraryAuditView
            report={report}
            providerStatus={providerStatus}
            onNavigateAdmin={() => onNavigate('admin')}
          />

          {/* Interactive Showcase: 4 Security Stamp Paper Patterns & State Stamp Duty Schedule */}
          <section className="max-w-6xl mx-auto px-6 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#FF671F]">
                    Vector Security &amp; SHCIL Reference Assets
                  </p>
                  <h2 className="text-xl font-bold text-[#202124] dark:text-white mt-0.5">
                    4 Built-In Guilloche Stamp Paper Designs + Reference Sample Sheet
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#138808] dark:text-emerald-400">
                  <Layers className="w-4 h-4" />
                  Selectable Inside Document Studio Step 3 &amp; Viewer
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {STAMP_BACKGROUND_PATTERNS.filter((p) => p.id !== 'none').map(
                  (pat) => (
                    <div
                      key={pat.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-[#FFFDF8]"
                    >
                      <div
                        className="h-32 p-3 flex flex-col justify-between border-b border-slate-200"
                        style={{
                          backgroundImage: pat.url ? `url("${pat.url}")` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        <span
                          className="inline-block self-start px-2 py-0.5 rounded bg-white/90 text-[10px] font-bold uppercase tracking-wider border border-slate-200"
                          style={{ color: pat.accentHex }}
                        >
                          {pat.id.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] font-semibold text-[#202124] bg-white/85 px-2 py-1 rounded">
                          {pat.label}
                        </span>
                      </div>
                      <p className="p-3 text-[11px] text-slate-600 leading-relaxed">
                        {pat.subtitle}
                      </p>
                    </div>
                  )
                )}
              </div>

              {/* Official SHCIL Reference Sample Graphic */}
              <div className="p-4 rounded-xl bg-[#F4FBF6] dark:bg-slate-950 border border-emerald-200 dark:border-emerald-900/60 flex flex-col md:flex-row items-center gap-5">
                <img
                  src="/assets/aistudio/stamp-sample_c88c690a.jpg"
                  alt="Sample Indian e-Stamp Certificate Layout"
                  className="w-56 rounded-lg border border-emerald-300 shadow-xs shrink-0"
                />
                <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  <p className="font-bold text-sm text-[#14532D] dark:text-emerald-300">
                    12-Field SHCIL e-Stamp Certificate Simulation Overlay
                  </p>
                  <p>
                    Renders Certificate No., Certificate Issued Date &amp; Time, Account Reference, Unique Doc. Reference, Purchased by, Description of Document (Article), Property Description, Consideration Price (Rs.), First Party, Second Party, Stamp Duty Paid By, and Stamp Duty Amount (Rs.) right onto Page 1 of your legal deed with automatic plain-paper continuation on Page 2+ — or full-document backdrop when toggled.
                  </p>
                </div>
              </div>
            </div>

            {/* State-wise Indian Stamp Duty Reference Guide */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#FF671F]" />
                <h2 className="text-xl font-bold text-[#202124] dark:text-white">
                  State-Wise Indian Stamp Act &amp; e-Stamping Reference Guide
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {STATE_STAMP_GUIDES.map((g) => (
                  <div
                    key={g.state}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#202124] dark:text-white">
                        {g.state}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold">
                        e-Stamp Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                      {g.portalName}
                    </p>
                    <dl className="space-y-1 text-[11px] pt-1 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Affidavit:</dt>
                        <dd className="font-semibold text-[#202124] dark:text-slate-200 text-right">
                          {g.affidavitIndicative}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Agreement:</dt>
                        <dd className="font-semibold text-[#202124] dark:text-slate-200 text-right">
                          {g.agreementIndicative}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">POA:</dt>
                        <dd className="font-semibold text-[#202124] dark:text-slate-200 text-right">
                          {g.poaIndicative}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">Lease:</dt>
                        <dd className="font-semibold text-[#202124] dark:text-slate-200 text-right">
                          {g.leaseIndicative}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {g.notes}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Cloud Seal / Offline Queue Modal (from Studio Step 4 or Interactive Viewer) */}
      {pendingSeal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCloudSeal}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#202124] dark:text-white">
                    {pendingSeal.existingDocId
                      ? 'Save Updated Version to Karta Vault'
                      : 'Encrypt & Seal to Karta Cloud Vault'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {online
                      ? 'AES-256-GCM Client Encryption → Immediate Firestore Sync'
                      : 'Offline Mode → Saved to IndexedDB & Queued for Auto-Sync'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingSeal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vault Document Label
                </label>
                <input
                  type="text"
                  required
                  value={sealTitleInput}
                  onChange={(e) => setSealTitleInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Document Labels &amp; Custom Tags
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {KARTA_PRESET_TAGS.map((tag) => {
                    const selected = sealTagsInput.some(
                      (t) => t.toLowerCase() === tag.toLowerCase()
                    );
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setSealTagsInput((prev) =>
                            selected
                              ? prev.filter(
                                  (t) => t.toLowerCase() !== tag.toLowerCase()
                                )
                              : sanitizeCustomTags([...prev, tag])
                          )
                        }
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer ${
                          selected
                            ? 'bg-[#FF671F] text-white border-[#FF671F]'
                            : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#FF671F]'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {sealTagsInput
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
                        onClick={() =>
                          setSealTagsInput((prev) =>
                            prev.filter((t) => t !== custom)
                          )
                        }
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-600 text-white border border-indigo-600 cursor-pointer"
                      >
                        {custom} ×
                      </button>
                    ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={sealCustomTagDraft}
                    maxLength={32}
                    onChange={(e) => setSealCustomTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sealCustomTagDraft.trim()) {
                        e.preventDefault();
                        setSealTagsInput((prev) =>
                          sanitizeCustomTags([...prev, sealCustomTagDraft.trim()])
                        );
                        setSealCustomTagDraft('');
                      }
                    }}
                    placeholder="Add custom label (e.g. FY2026, Court)..."
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                  />
                  <button
                    type="button"
                    disabled={!sealCustomTagDraft.trim()}
                    onClick={() => {
                      if (!sealCustomTagDraft.trim()) return;
                      setSealTagsInput((prev) =>
                        sanitizeCustomTags([...prev, sealCustomTagDraft.trim()])
                      );
                      setSealCustomTagDraft('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vault Encryption Passphrase (min 6 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter passphrase to derive AES-256-GCM key"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Passphrase never leaves your browser. Encrypted edits saved offline sync automatically to Firestore when connectivity returns.
                </p>
              </div>
            </div>

            {cloudNotice && (
              <div
                className={`p-2.5 rounded-lg text-xs ${
                  cloudNotice.type === 'err'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {cloudNotice.text}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingSeal(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingVault}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {savingVault ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                {savingVault
                  ? 'Encrypting...'
                  : online
                  ? 'Encrypt & Sync'
                  : 'Encrypt & Queue Offline'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
