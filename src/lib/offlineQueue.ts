import {
  doc,
  Firestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { OfflineMutation } from '../types/platform';

const DB_NAME = 'dip_desk_offline_v1';
const DB_VERSION = 1;
const STORE_MUTATIONS = 'mutations';
const STORE_CACHE = 'snapshots';

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    tx.objectStore(STORE_MUTATIONS).put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readonly');
    const req = tx.objectStore(STORE_MUTATIONS).getAll();
    req.onsuccess = () => resolve((req.result as OfflineMutation[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineMutation(id: string): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
    tx.objectStore(STORE_MUTATIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let activeFlushPromise: Promise<number> | null = null;

export async function flushOfflineQueue(firestoreDb: Firestore): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise = (async () => {
    const pending = await getPendingMutations();
    if (pending.length === 0) return 0;

    let flushed = 0;
    for (const item of pending) {
      try {
        const targetRef = doc(firestoreDb, item.collectionName, item.docId);
        const syncedPayload =
          item.collectionName === 'karta_files' && item.payload.status === 'encrypted'
            ? { ...item.payload, status: 'synced' }
            : item.payload;

        if (item.operation === 'update') {
          await updateDoc(targetRef, {
            ...syncedPayload,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(targetRef, {
            ...syncedPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await removeOfflineMutation(item.id);
        flushed += 1;
      } catch (err) {
        console.warn('Deferred offline sync item kept for retry:', item.id, err);
      }
    }
    return flushed;
  })();

  try {
    return await activeFlushPromise;
  } finally {
    activeFlushPromise = null;
  }
}

export async function cacheSnapshot<T>(key: string, data: T[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).put({ key, data, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal in private browsing
  }
}

export async function getCachedSnapshot<T>(key: string): Promise<T[]> {
  try {
    const db = await openOfflineDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => resolve((req.result?.data as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
