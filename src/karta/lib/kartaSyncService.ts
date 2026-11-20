import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../../lib/firebase';
import { encryptPayload } from '../../lib/crypto';
import {
  cacheSnapshot,
  enqueueOfflineMutation,
  flushOfflineQueue,
  getCachedSnapshot,
  getPendingMutations,
  removeOfflineMutation,
} from '../../lib/offlineQueue';
import { triggerHaptic } from '../../lib/haptics';
import { OperationType, type KartaFileRecord, type OfflineMutation, type UserRole } from '../../types/platform';
import type { UserRole as AppUserRole } from '../../types';
import {
  removeVaultOcrIndexEntry,
  upsertVaultOcrIndexEntry,
} from './ocrEngine';

export interface KartaStampMetadata {
  presetId: string;
  label: string;
  subtitle?: string;
  authorityLine?: string;
  shape?: 'double-box' | 'circular-seal' | 'oval-emblem';
  officerName?: string;
  referenceNo?: string;
  stampedAtIso: string;
  colorHex: string;
  position: 'top-right' | 'center' | 'bottom-right' | 'bottom-left';
  scale?: number;
  opacity?: number;
  applyAllPages?: boolean;
}

export interface KartaOcrMetadata {
  ocrText: string;
  ocrLanguage: string;
  ocrConfidence: number;
  ocrWordCount: number;
  ocrIndexedAt: string;
  sourceFileName?: string;
}

export interface KartaVaultDecryptedContent {
  label: string;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  renderedText: string;
  formValues: Record<string, string>;
  repeatableValues: Record<string, Array<Record<string, string>>>;
  stampOverlay?: KartaStampMetadata | null;
  ocrText?: string;
  ocrLanguage?: string;
  ocrConfidence?: number;
  ocrWordCount?: number;
  ocrIndexedAt?: string;
  customTags?: string[];
  savedAt: string;
}

export const KARTA_PRESET_TAGS = [
  'Tax',
  'Legal',
  'Educational',
  'Property',
  'Identity',
  'Business',
  'Compliance',
  'Medical',
] as const;

const SYSTEM_TAG_EXACT = new Set([
  'ocr_indexed',
  'custom_viewer',
  'viewer_doc',
  'ocr_scanned_doc',
  'ocr_scanned_pdf',
  'qr_imported',
  'karta_draft',
  'all-india',
  'not specified',
  'draft',
]);

export function isSystemKartaTag(tag: string): boolean {
  const lower = (tag || '').trim().toLowerCase();
  if (!lower) return true;
  if (lower.startsWith('tpl_') || lower.startsWith('stamp_')) return true;
  return SYSTEM_TAG_EXACT.has(lower);
}

export function extractUserCustomTags(tags: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const cleaned = (t || '').trim().slice(0, 32);
    if (!cleaned || isSystemKartaTag(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

export function sanitizeCustomTags(rawTags: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawTags) {
    const cleaned = (raw || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out.slice(0, 8);
}

export interface KartaLocalRecord extends KartaFileRecord {
  pendingSync?: boolean;
  localOperation?: 'set' | 'update';
}

export interface KartaSyncEvent {
  id: string;
  timestamp: string;
  kind: 'queued' | 'synced' | 'error' | 'online_resume';
  message: string;
}

export interface KartaSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  pendingDocIds: string[];
  lastSyncAt: string | null;
  lastError: string | null;
  backgroundSyncSupported: boolean;
  recentEvents: KartaSyncEvent[];
}

const SNAPSHOT_KEY_PREFIX = 'karta_files_cache_v1_';

let state: KartaSyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  pendingDocIds: [],
  lastSyncAt: null,
  lastError: null,
  backgroundSyncSupported:
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'SyncManager' in window,
  recentEvents: [],
};

const listeners = new Set<(next: KartaSyncStatus) => void>();
let serviceInitialized = false;
let activeOwnerId: string | null = null;
let periodicTimer: number | null = null;

function notify() {
  const snapshot: KartaSyncStatus = {
    ...state,
    pendingDocIds: [...state.pendingDocIds],
    recentEvents: [...state.recentEvents],
  };
  listeners.forEach((cb) => cb(snapshot));
}

function pushEvent(kind: KartaSyncEvent['kind'], message: string) {
  const evt: KartaSyncEvent = {
    id: `sync_evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    kind,
    message,
  };
  state.recentEvents = [evt, ...state.recentEvents].slice(0, 12);
}

export function subscribeKartaSyncStatus(
  cb: (next: KartaSyncStatus) => void
): () => void {
  listeners.add(cb);
  cb({
    ...state,
    pendingDocIds: [...state.pendingDocIds],
    recentEvents: [...state.recentEvents],
  });
  return () => {
    listeners.delete(cb);
  };
}

export async function refreshPendingKartaQueue(): Promise<OfflineMutation[]> {
  try {
    const all = await getPendingMutations();
    const kartaPending = all.filter((m) => m.collectionName === 'karta_files');
    state.pendingCount = kartaPending.length;
    state.pendingDocIds = kartaPending.map((m) => m.docId);
    notify();
    return kartaPending;
  } catch {
    return [];
  }
}

async function tryRegisterServiceWorkerSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncMgr = (reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (syncMgr?.register) {
      await syncMgr.register('karta-vault-sync');
    }
  } catch {
    // SyncManager may be restricted in iframe or unsupported browsers
  }
}

export async function loadCachedKartaVault(
  ownerId: string
): Promise<KartaLocalRecord[]> {
  if (!ownerId) return [];
  return getCachedSnapshot<KartaLocalRecord>(`${SNAPSHOT_KEY_PREFIX}${ownerId}`);
}

export async function saveCachedKartaVault(
  ownerId: string,
  records: KartaLocalRecord[]
): Promise<void> {
  if (!ownerId) return;
  await cacheSnapshot(`${SNAPSHOT_KEY_PREFIX}${ownerId}`, records);
}

/**
 * Merges live Firestore cloud documents with any locally queued/offline edits
 * so offline modifications remain visible immediately while waiting to sync.
 */
export async function mergeCloudWithOfflineCache(
  ownerId: string,
  cloudDocs: KartaFileRecord[]
): Promise<KartaLocalRecord[]> {
  const cached = await loadCachedKartaVault(ownerId);
  const pending = await refreshPendingKartaQueue();
  const pendingByDocId = new Map<string, OfflineMutation>();
  for (const m of pending) {
    pendingByDocId.set(m.docId, m);
  }

  const byId = new Map<string, KartaLocalRecord>();

  for (const docItem of cloudDocs) {
    byId.set(docItem.id, { ...docItem, pendingSync: false });
  }

  for (const c of cached) {
    if (pendingByDocId.has(c.id)) {
      byId.set(c.id, {
        ...c,
        pendingSync: true,
        localOperation: pendingByDocId.get(c.id)?.operation,
      });
    } else if (!byId.has(c.id) && c.pendingSync) {
      byId.set(c.id, c);
    }
  }

  for (const [docId, mut] of pendingByDocId.entries()) {
    const p = mut.payload as Partial<KartaFileRecord>;
    const existing = byId.get(docId);
    byId.set(docId, {
      id: docId,
      ownerId: String(p.ownerId || existing?.ownerId || ownerId),
      title: String(p.title || existing?.title || 'Untitled Draft'),
      bucketSlot: String(p.bucketSlot || existing?.bucketSlot || 'r2-03'),
      d1Shard: String(p.d1Shard || existing?.d1Shard || 'd1-08'),
      mimeType: String(p.mimeType || existing?.mimeType || 'application/json'),
      sizeBytes: Number(p.sizeBytes ?? existing?.sizeBytes ?? 0),
      encryptedPayload: String(
        p.encryptedPayload || existing?.encryptedPayload || ''
      ),
      iv: String(p.iv || existing?.iv || ''),
      salt: String(p.salt || existing?.salt || ''),
      keyFingerprint: String(
        p.keyFingerprint || existing?.keyFingerprint || 'AES-256-GCM'
      ),
      integrityHash: String(p.integrityHash || existing?.integrityHash || ''),
      status: 'encrypted',
      version: Number(p.version ?? existing?.version ?? 1),
      tags: Array.isArray(p.tags)
        ? (p.tags as string[])
        : existing?.tags || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pendingSync: true,
      localOperation: mut.operation,
    });
  }

  const merged = Array.from(byId.values()).sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
  await saveCachedKartaVault(ownerId, merged);
  return merged;
}

export async function triggerKartaBackgroundSync(
  reason: 'online' | 'manual' | 'interval' | 'visibility' = 'manual'
): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    state.isOnline = false;
    notify();
    return 0;
  }

  state.isOnline = true;
  const pendingBefore = await refreshPendingKartaQueue();
  if (pendingBefore.length === 0) {
    if (reason === 'manual') {
      state.lastSyncAt = new Date().toISOString();
      state.lastError = null;
      pushEvent('synced', 'Vault is fully synchronized with Firestore.');
      notify();
    }
    return 0;
  }

  state.isSyncing = true;
  state.lastError = null;
  notify();

  try {
    const flushed = await flushOfflineQueue(db);
    const remaining = await refreshPendingKartaQueue();
    state.lastSyncAt = new Date().toISOString();

    if (flushed > 0) {
      pushEvent(
        'synced',
        `Synchronized ${flushed} offline Karta vault edit${flushed === 1 ? '' : 's'} to Firestore (${reason}).`
      );
      if (activeOwnerId) {
        const cached = await loadCachedKartaVault(activeOwnerId);
        const remainingIds = new Set(remaining.map((r) => r.docId));
        const updatedCache = cached.map((item) =>
          remainingIds.has(item.id)
            ? item
            : { ...item, pendingSync: false, status: 'synced' as const }
        );
        await saveCachedKartaVault(activeOwnerId, updatedCache);
      }
      triggerHaptic('success');
    } else if (remaining.length > 0) {
      state.lastError =
        'Some queued edits await Firestore auth or network confirmation.';
      pushEvent('error', state.lastError);
    }
    return flushed;
  } catch (err) {
    state.lastError =
      err instanceof Error ? err.message : 'Background sync encountered an error.';
    pushEvent('error', state.lastError);
    return 0;
  } finally {
    state.isSyncing = false;
    notify();
  }
}

export function startKartaSyncService(ownerId: string | null): () => void {
  activeOwnerId = ownerId;
  void refreshPendingKartaQueue();

  if (serviceInitialized) {
    if (typeof navigator !== 'undefined' && navigator.onLine && ownerId) {
      void triggerKartaBackgroundSync('online');
    }
    return () => {};
  }

  serviceInitialized = true;

  const handleOnline = () => {
    state.isOnline = true;
    pushEvent(
      'online_resume',
      'Connectivity restored — flushing queued offline vault edits...'
    );
    notify();
    void triggerKartaBackgroundSync('online');
  };

  const handleOffline = () => {
    state.isOnline = false;
    notify();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      void triggerKartaBackgroundSync('visibility');
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);

  periodicTimer = window.setInterval(() => {
    if (navigator.onLine && state.pendingCount > 0 && !state.isSyncing) {
      void triggerKartaBackgroundSync('interval');
    }
  }, 20_000);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (periodicTimer !== null) {
      window.clearInterval(periodicTimer);
      periodicTimer = null;
    }
    serviceInitialized = false;
  };
}

function sanitizeRuleTag(raw: string): string {
  const cleaned = (raw || '').trim().slice(0, 32);
  return cleaned || 'draft';
}

export async function saveOrUpdateKartaVaultDocument(params: {
  existingDocId?: string;
  existingVersion?: number;
  ownerId: string;
  actorRole: UserRole | AppUserRole;
  title: string;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  jurisdictionState: string;
  renderedText: string;
  formValues?: Record<string, string>;
  repeatableValues?: Record<string, Array<Record<string, string>>>;
  stampOverlay?: KartaStampMetadata | null;
  ocrMetadata?: KartaOcrMetadata | null;
  customTags?: string[];
  passphrase: string;
  isOnline: boolean;
}): Promise<{
  docId: string;
  operation: 'set' | 'update';
  syncedImmediately: boolean;
  localRecord: KartaLocalRecord;
}> {
  const isUpdate = Boolean(params.existingDocId);
  const docId =
    params.existingDocId ||
    `karta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nextVersion = isUpdate ? Math.max(1, (params.existingVersion || 1) + 1) : 1;
  const safeTitle =
    (params.title || params.templateTitle || 'Legal Draft').trim().slice(0, 155);
  const cleanCustomTags = sanitizeCustomTags(params.customTags || []);

  const payloadObject: KartaVaultDecryptedContent = {
    label: safeTitle,
    templateId: params.templateId || 'custom_viewer',
    templateTitle: params.templateTitle || safeTitle,
    templateVersion: params.templateVersion || '1.0',
    renderedText: params.renderedText,
    formValues: params.formValues || {},
    repeatableValues: params.repeatableValues || {},
    stampOverlay: params.stampOverlay || null,
    ocrText: params.ocrMetadata?.ocrText,
    ocrLanguage: params.ocrMetadata?.ocrLanguage,
    ocrConfidence: params.ocrMetadata?.ocrConfidence,
    ocrWordCount: params.ocrMetadata?.ocrWordCount,
    ocrIndexedAt: params.ocrMetadata?.ocrIndexedAt,
    customTags: cleanCustomTags,
    savedAt: new Date().toISOString(),
  };

  const plaintext = JSON.stringify(payloadObject);
  const encrypted = await encryptPayload(plaintext, params.passphrase);
  if (encrypted.encryptedPayload.length > 195_000) {
    throw new Error(
      'Encrypted document exceeds Firestore 200 KB document ceiling. Shorten attachments or split pages.'
    );
  }

  const systemTags = [
    sanitizeRuleTag(params.templateId || 'karta_draft'),
    ...(params.jurisdictionState && params.jurisdictionState !== 'All-India'
      ? [sanitizeRuleTag(params.jurisdictionState)]
      : []),
    ...(params.stampOverlay ? [sanitizeRuleTag(`stamp_${params.stampOverlay.presetId}`)] : []),
    ...(params.ocrMetadata?.ocrText ? ['ocr_indexed'] : []),
  ];
  const mergedTags: string[] = [];
  const seenTagKeys = new Set<string>();
  for (const t of [...systemTags, ...cleanCustomTags]) {
    const clean = (t || '').trim().slice(0, 32);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seenTagKeys.has(key)) {
      seenTagKeys.add(key);
      mergedTags.push(clean);
    }
    if (mergedTags.length >= 10) break;
  }
  const tags = mergedTags;

  const nowIso = new Date().toISOString();
  const baseFields: Record<string, unknown> = {
    title: safeTitle,
    encryptedPayload: encrypted.encryptedPayload,
    iv: encrypted.iv,
    salt: encrypted.salt,
    keyFingerprint: encrypted.keyFingerprint,
    integrityHash: encrypted.integrityHash,
    sizeBytes: new Blob([plaintext]).size,
    version: nextVersion,
    tags,
  };

  const fullCreateFields: Record<string, unknown> = {
    ownerId: params.ownerId,
    bucketSlot: 'r2-03',
    d1Shard: 'd1-08',
    mimeType: 'application/json',
    ...baseFields,
  };

  const localRecord: KartaLocalRecord = {
    id: docId,
    ownerId: params.ownerId,
    title: safeTitle,
    bucketSlot: 'r2-03',
    d1Shard: 'd1-08',
    mimeType: 'application/json',
    sizeBytes: Number(baseFields.sizeBytes),
    encryptedPayload: encrypted.encryptedPayload,
    iv: encrypted.iv,
    salt: encrypted.salt,
    keyFingerprint: encrypted.keyFingerprint,
    integrityHash: encrypted.integrityHash,
    status: params.isOnline ? 'synced' : 'encrypted',
    version: nextVersion,
    tags,
    createdAt: nowIso,
    updatedAt: nowIso,
    pendingSync: !params.isOnline,
    localOperation: isUpdate ? 'update' : 'set',
  };

  // Always update local IndexedDB cache immediately so UI works seamlessly offline
  const existingCache = await loadCachedKartaVault(params.ownerId);
  const nextCache = [
    localRecord,
    ...existingCache.filter((c) => c.id !== docId),
  ];
  await saveCachedKartaVault(params.ownerId, nextCache);

  // Update local full-text OCR search index if OCR content or document text exists
  const indexableText = (params.ocrMetadata?.ocrText || params.renderedText || '').trim();
  if (params.ocrMetadata?.ocrText || indexableText.length > 20) {
    await upsertVaultOcrIndexEntry({
      docId,
      ownerId: params.ownerId,
      title: safeTitle,
      extractedText: indexableText,
      confidence: params.ocrMetadata?.ocrConfidence ?? 100,
      wordCount:
        params.ocrMetadata?.ocrWordCount ??
        indexableText.split(/\s+/).filter(Boolean).length,
      language: params.ocrMetadata?.ocrLanguage || 'eng',
      indexedAt: params.ocrMetadata?.ocrIndexedAt || nowIso,
      sourceFileName: params.ocrMetadata?.sourceFileName,
    }).catch(() => {});
  }

  const queueAndCacheOffline = async () => {
    const mut: OfflineMutation = {
      id: `karta_mut_${docId}`,
      collectionName: 'karta_files',
      docId,
      operation: isUpdate ? 'update' : 'set',
      payload: isUpdate
        ? { ...baseFields, status: 'encrypted' }
        : { ...fullCreateFields, status: 'encrypted' },
      queuedAt: Date.now(),
    };
    await enqueueOfflineMutation(mut);
    localRecord.pendingSync = true;
    localRecord.status = 'encrypted';
    await saveCachedKartaVault(params.ownerId, [
      localRecord,
      ...existingCache.filter((c) => c.id !== docId),
    ]);
    await refreshPendingKartaQueue();
    await tryRegisterServiceWorkerSync();
    pushEvent(
      'queued',
      `Queued offline ${isUpdate ? `v${nextVersion} edit` : 'draft'} "${safeTitle}" for automatic Firestore sync.`
    );
    notify();
  };

  if (!params.isOnline) {
    await queueAndCacheOffline();
    triggerHaptic('light');
    return {
      docId,
      operation: isUpdate ? 'update' : 'set',
      syncedImmediately: false,
      localRecord,
    };
  }

  try {
    const docRef = doc(db, 'karta_files', docId);
    if (isUpdate) {
      await updateDoc(docRef, {
        ...baseFields,
        status: 'synced',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ...fullCreateFields,
        status: 'synced',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await addDoc(collection(db, 'audit_logs'), {
      actorId: params.ownerId,
      actorRole: params.actorRole,
      module: 'karta-files',
      action: isUpdate ? 'KARTA_VAULT_EDIT_SYNCED' : 'KARTA_VAULT_SEAL',
      resourcePath: `karta_files/${docId}`,
      severity: 'info',
      details: `${isUpdate ? `Updated v${nextVersion}` : 'Sealed'} "${safeTitle}" (${params.templateId})`,
      createdAt: serverTimestamp(),
    }).catch(() => {});

    state.lastSyncAt = new Date().toISOString();
    pushEvent(
      'synced',
      `${isUpdate ? `Updated v${nextVersion}` : 'Sealed'} "${safeTitle}" directly to Firestore.`
    );
    notify();
    triggerHaptic('success');

    return {
      docId,
      operation: isUpdate ? 'update' : 'set',
      syncedImmediately: true,
      localRecord: { ...localRecord, pendingSync: false, status: 'synced' },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Permission error should bubble via handleFirestoreError so rules bugs aren't hidden
    if (/permission|insufficient|unauthorized/i.test(msg)) {
      handleFirestoreError(
        err,
        isUpdate ? OperationType.UPDATE : OperationType.CREATE,
        `karta_files/${docId}`
      );
    }
    // Transient network error -> gracefully degrade to offline queue!
    await queueAndCacheOffline();
    return {
      docId,
      operation: isUpdate ? 'update' : 'set',
      syncedImmediately: false,
      localRecord,
    };
  }
}

export async function updateKartaVaultDocumentTags(params: {
  ownerId: string;
  actorRole: UserRole | AppUserRole;
  docId: string;
  existingTags: string[];
  nextUserTags: string[];
  isOnline: boolean;
}): Promise<{
  mergedTags: string[];
  syncedImmediately: boolean;
}> {
  const preservedSystemTags = (params.existingTags || [])
    .filter((t) => isSystemKartaTag(t))
    .slice(0, 3);
  const cleanCustom = sanitizeCustomTags(params.nextUserTags);

  const mergedTags: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...preservedSystemTags, ...cleanCustom]) {
    const clean = (raw || '').trim().slice(0, 32);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      mergedTags.push(clean);
    }
    if (mergedTags.length >= 10) break;
  }

  const nowIso = new Date().toISOString();
  const cached = await loadCachedKartaVault(params.ownerId);
  const updatedCache = cached.map((item) =>
    item.id === params.docId
      ? {
          ...item,
          tags: mergedTags,
          updatedAt: nowIso,
          pendingSync: !params.isOnline,
        }
      : item
  );
  await saveCachedKartaVault(params.ownerId, updatedCache);

  const queueTagUpdateOffline = async () => {
    const pending = await getPendingMutations();
    const mutId = `karta_mut_${params.docId}`;
    const existingMut = pending.find((m) => m.id === mutId);
    const mut: OfflineMutation = existingMut
      ? {
          ...existingMut,
          payload: {
            ...existingMut.payload,
            tags: mergedTags,
          },
          queuedAt: Date.now(),
        }
      : {
          id: mutId,
          collectionName: 'karta_files',
          docId: params.docId,
          operation: 'update',
          payload: {
            tags: mergedTags,
          },
          queuedAt: Date.now(),
        };
    await enqueueOfflineMutation(mut);
    const finalCache = updatedCache.map((item) =>
      item.id === params.docId ? { ...item, pendingSync: true } : item
    );
    await saveCachedKartaVault(params.ownerId, finalCache);
    await refreshPendingKartaQueue();
    await tryRegisterServiceWorkerSync();
    pushEvent(
      'queued',
      `Queued offline tag update (${cleanCustom.join(', ') || 'cleared'}) for automatic sync.`
    );
    notify();
  };

  if (!params.isOnline) {
    await queueTagUpdateOffline();
    triggerHaptic('light');
    return { mergedTags, syncedImmediately: false };
  }

  try {
    await updateDoc(doc(db, 'karta_files', params.docId), {
      tags: mergedTags,
      updatedAt: serverTimestamp(),
    });
    pushEvent(
      'synced',
      `Updated tags (${cleanCustom.join(', ') || 'none'}) on Karta vault document.`
    );
    notify();
    triggerHaptic('light');
    return { mergedTags, syncedImmediately: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/permission|insufficient|unauthorized/i.test(msg)) {
      handleFirestoreError(err, OperationType.UPDATE, `karta_files/${params.docId}`);
    }
    await queueTagUpdateOffline();
    return { mergedTags, syncedImmediately: false };
  }
}

export async function deleteKartaVaultDocument(params: {
  ownerId: string;
  docId: string;
  localOnly?: boolean;
  isOnline: boolean;
}): Promise<void> {
  await removeOfflineMutation(`karta_mut_${params.docId}`).catch(() => {});
  await removeVaultOcrIndexEntry(params.ownerId, params.docId).catch(() => {});
  const cached = await loadCachedKartaVault(params.ownerId);
  await saveCachedKartaVault(
    params.ownerId,
    cached.filter((item) => item.id !== params.docId)
  );
  await refreshPendingKartaQueue();

  if (params.localOnly && !params.isOnline) {
    pushEvent('queued', `Removed unsynced offline draft (${params.docId}).`);
    notify();
    return;
  }

  try {
    await deleteDoc(doc(db, 'karta_files', params.docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `karta_files/${params.docId}`);
  }
}
