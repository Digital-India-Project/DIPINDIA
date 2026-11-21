import React, { useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  app,
  auth,
  db,
  firebaseMetadata,
  handleFirestoreError,
  OperationType,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  recreateAllFirestoreDatabaseFiles,
  type RecreateCollectionStat,
} from '../../lib/firestoreRecreate';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';

export const FirestoreDbMigrator: React.FC = () => {
  const { user } = useAuth();
  const { businessSettings, rolePermissions } = useData();
  const [sourceDbId, setSourceDbId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<RecreateCollectionStat[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const targetDbId = firebaseMetadata.firestoreDatabaseId;
  const currentFbUser = auth.currentUser;

  const formatFirestoreActionError = (err: any, fallback: string): string => {
    const raw = String(err?.message || '');
    const lower = raw.toLowerCase();
    if (
      lower.includes('quota exceeded') ||
      lower.includes('resource-exhausted') ||
      lower.includes('resource_exhausted') ||
      lower.includes('free daily read units')
    ) {
      return `Firestore Spark free-tier quota/database limit reached on "${targetDbId}": ${raw}. Confirm "${targetDbId}" is the sole active database in project "${firebaseMetadata.projectId}" or wait for daily quota reset.`;
    }
    return raw || fallback;
  };

  const getSourceDb = (): Firestore => {
    const cleanId = sourceDbId.trim();
    if (!cleanId) {
      throw new Error('Please enter a valid source Firestore database ID.');
    }
    if (cleanId === targetDbId) {
      throw new Error('Source database ID must be different from the active target database ID.');
    }
    return getFirestore(app, cleanId);
  };

  const ensureVerifiedAdmin = (): string => {
    if (!currentFbUser || !user) {
      throw new Error('Please sign in with your verified Super Admin Google account first.');
    }
    if (!currentFbUser.emailVerified) {
      throw new Error('Verified email is required to write and migrate Firestore collections.');
    }
    return currentFbUser.uid;
  };

  const scanDbCounts = async (uid: string, includeSource: boolean) => {
    const sourceDb = includeSource ? getSourceDb() : null;
    const collectionsToCheck: Array<{ name: string; ownerField?: string; note?: string }> = [
      { name: 'services' },
      { name: 'blog_posts' },
      { name: 'business_settings' },
      { name: 'admins' },
      { name: 'users' },
      { name: 'applications' },
      { name: 'commission_ledger' },
      { name: 'operator_enrollments', note: 'Export-only unless owner-signed' },
      { name: 'partners', note: 'Export-only unless owner-signed' },
      { name: 'settlement_requests', note: 'Export-only unless owner-signed' },
      { name: 'infra_bindings', ownerField: 'ownerId', note: 'Admin-owned' },
      { name: 'karta_files', ownerField: 'ownerId', note: 'Admin-owned' },
      { name: 'tools_configs', ownerField: 'ownerId', note: 'Admin-owned' },
      { name: 'backups', ownerField: 'ownerId', note: 'Admin-owned' },
      { name: 'workspace_audits', ownerField: 'userId', note: 'Admin-owned' },
      { name: 'api_sathi_verifications', ownerField: 'userId', note: 'Admin-owned' },
    ];

    const results: RecreateCollectionStat[] = [];
    for (const item of collectionsToCheck) {
      let sourceCount = 0;
      let targetCount = 0;
      let failedCount = 0;
      let note = item.note;

      const countFrom = async (firestoreInstance: Firestore) => {
        const ref = collection(firestoreInstance, item.name);
        const snap = item.ownerField
          ? await getDocs(query(ref, where(item.ownerField, '==', uid)))
          : await getDocs(ref);
        return snap.size;
      };

      try {
        targetCount = await countFrom(db);
      } catch (err: any) {
        if (String(err?.message || '').toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, item.name);
        }
        failedCount += 1;
        note = err?.message || 'Target read skipped';
      }

      if (sourceDb) {
        try {
          sourceCount = await countFrom(sourceDb);
        } catch (err: any) {
          note = note || err?.message || 'Source DB empty or unavailable';
        }
      }

      results.push({
        collection: item.name,
        sourceCount,
        targetCount,
        copiedCount: 0,
        skippedExistingCount: 0,
        failedCount,
        note,
      });
    }
    return results;
  };

  const handleScanDatabases = async () => {
    setScanning(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const uid = ensureVerifiedAdmin();
      const trimmedSource = sourceDbId.trim();
      const hasSource = Boolean(trimmedSource && trimmedSource !== targetDbId);
      const results = await scanDbCounts(uid, hasSource);
      setStats(results);
      const totalTarget = results.reduce((s, r) => s + r.targetCount, 0);
      const totalSource = results.reduce((s, r) => s + r.sourceCount, 0);
      setStatusMsg(
        hasSource
          ? `Scanned "${targetDbId}" (${totalTarget} docs) and "${trimmedSource}" (${totalSource} docs).`
          : `Scanned active database "${targetDbId}" (${totalTarget} document(s) across ${results.length} collections).`
      );
    } catch (err: any) {
      setErrorMsg(formatFirestoreActionError(err, 'Unable to scan Firestore database.'));
    } finally {
      setScanning(false);
    }
  };

  const handleRecreateAllDatabaseFiles = async () => {
    setRecreating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      ensureVerifiedAdmin();
      const result = await recreateAllFirestoreDatabaseFiles({
        user,
        businessSettings,
        rolePermissions,
      });
      setStats(result.stats);
      setStatusMsg(
        `Recreated database collections in "${result.targetDbId}": wrote ${result.totalWritten} record(s) across services, blog posts, business settings, RBAC, admin grants, workspace bindings, and audit log.`
      );
    } catch (err: any) {
      setErrorMsg(formatFirestoreActionError(err, 'Unable to recreate database collections.'));
    } finally {
      setRecreating(false);
    }
  };

  const handleMigrateData = async () => {
    setMigrating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const uid = ensureVerifiedAdmin();
      const sourceDb = getSourceDb();
      const migrationStats: RecreateCollectionStat[] = [];

      const copyCollection = async (
        colName: string,
        opts?: {
          ownerField?: string;
          setCreateTimestamps?: boolean;
          onlyCreatedAtTimestamp?: boolean;
          note?: string;
        }
      ) => {
        const stat: RecreateCollectionStat = {
          collection: colName,
          sourceCount: 0,
          targetCount: 0,
          copiedCount: 0,
          skippedExistingCount: 0,
          failedCount: 0,
          note: opts?.note,
        };

        const ref = collection(sourceDb, colName);
        const snap = opts?.ownerField
          ? await getDocs(query(ref, where(opts.ownerField, '==', uid)))
          : await getDocs(ref);
        stat.sourceCount = snap.size;

        for (const docSnap of snap.docs) {
          const targetRef = doc(db, colName, docSnap.id);
          try {
            const existingTarget = await getDoc(targetRef);
            if (existingTarget.exists()) {
              stat.skippedExistingCount += 1;
              continue;
            }
            const data: Record<string, any> = { ...docSnap.data() };
            if (opts?.onlyCreatedAtTimestamp) {
              data.createdAt = serverTimestamp();
            } else if (opts?.setCreateTimestamps) {
              data.createdAt = serverTimestamp();
              data.updatedAt = serverTimestamp();
            }
            await setDoc(targetRef, data);
            stat.copiedCount += 1;
          } catch (err) {
            stat.failedCount += 1;
            console.warn(`Migration warning on ${colName}/${docSnap.id}:`, err);
          }
        }
        stat.targetCount = stat.copiedCount + stat.skippedExistingCount;
        migrationStats.push(stat);
        return snap.docs.map((d) => d.id);
      };

      await copyCollection('services');
      await copyCollection('blog_posts');
      await copyCollection('business_settings');
      await copyCollection('admins', { onlyCreatedAtTimestamp: true });

      const userIds = await copyCollection('users');
      const privateStat: RecreateCollectionStat = {
        collection: 'users/*/private/security',
        sourceCount: 0,
        targetCount: 0,
        copiedCount: 0,
        skippedExistingCount: 0,
        failedCount: 0,
      };
      for (const userId of userIds) {
        try {
          const privSnap = await getDoc(doc(sourceDb, 'users', userId, 'private', 'security'));
          if (!privSnap.exists()) continue;
          privateStat.sourceCount += 1;
          const targetPrivRef = doc(db, 'users', userId, 'private', 'security');
          const targetPrivExisting = await getDoc(targetPrivRef);
          if (targetPrivExisting.exists()) {
            privateStat.skippedExistingCount += 1;
            continue;
          }
          await setDoc(targetPrivRef, {
            ...privSnap.data(),
            updatedAt: serverTimestamp(),
          });
          privateStat.copiedCount += 1;
        } catch {
          privateStat.failedCount += 1;
        }
      }
      privateStat.targetCount = privateStat.copiedCount + privateStat.skippedExistingCount;
      migrationStats.push(privateStat);

      const appIds = await copyCollection('applications');
      const trackingStat: RecreateCollectionStat = {
        collection: 'tracking_records',
        sourceCount: 0,
        targetCount: 0,
        copiedCount: 0,
        skippedExistingCount: 0,
        failedCount: 0,
      };
      for (const appId of appIds) {
        try {
          const trackSnap = await getDoc(doc(sourceDb, 'tracking_records', appId));
          if (!trackSnap.exists()) continue;
          trackingStat.sourceCount += 1;
          const targetTrackRef = doc(db, 'tracking_records', appId);
          const targetTrackExisting = await getDoc(targetTrackRef);
          if (targetTrackExisting.exists()) {
            trackingStat.skippedExistingCount += 1;
            continue;
          }
          await setDoc(targetTrackRef, trackSnap.data());
          trackingStat.copiedCount += 1;
        } catch {
          trackingStat.failedCount += 1;
        }
      }
      trackingStat.targetCount = trackingStat.copiedCount + trackingStat.skippedExistingCount;
      migrationStats.push(trackingStat);

      await copyCollection('commission_ledger');
      await copyCollection('infra_bindings', {
        ownerField: 'ownerId',
        setCreateTimestamps: true,
        note: 'Admin-owned',
      });
      await copyCollection('karta_files', {
        ownerField: 'ownerId',
        setCreateTimestamps: true,
        note: 'Admin-owned',
      });
      await copyCollection('tools_configs', {
        ownerField: 'ownerId',
        setCreateTimestamps: true,
        note: 'Admin-owned',
      });
      await copyCollection('backups', {
        ownerField: 'ownerId',
        setCreateTimestamps: true,
        note: 'Admin-owned',
      });
      await copyCollection('workspace_audits', {
        ownerField: 'userId',
        note: 'Admin-owned',
      });
      await copyCollection('api_sathi_verifications', {
        ownerField: 'userId',
        note: 'Admin-owned',
      });

      setStats(migrationStats);
      const totalCopied = migrationStats.reduce((s, r) => s + r.copiedCount, 0);
      const totalSkipped = migrationStats.reduce((s, r) => s + r.skippedExistingCount, 0);
      setStatusMsg(
        `Migration finished: copied ${totalCopied} document(s) from "${sourceDbId.trim()}" to "${targetDbId}" (${totalSkipped} already present).`
      );
    } catch (err: any) {
      setErrorMsg(formatFirestoreActionError(err, 'Migration failed.'));
    } finally {
      setMigrating(false);
    }
  };

  const handleRestoreFromJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setRestoring(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const uid = ensureVerifiedAdmin();
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const collectionsMap = parsed?.collections as Record<string, any[]> | undefined;
      if (!collectionsMap || typeof collectionsMap !== 'object') {
        throw new Error('Invalid backup JSON format: missing "collections" object.');
      }

      const restoreStats: RecreateCollectionStat[] = [];
      const restoreCollection = async (
        colName: string,
        opts?: { onlyCreatedAtTimestamp?: boolean; setCreateTimestamps?: boolean; ownerUidOverride?: boolean; note?: string }
      ) => {
        const docs = Array.isArray(collectionsMap[colName]) ? collectionsMap[colName] : [];
        if (docs.length === 0) return;

        const stat: RecreateCollectionStat = {
          collection: colName,
          sourceCount: docs.length,
          targetCount: 0,
          copiedCount: 0,
          skippedExistingCount: 0,
          failedCount: 0,
          note: opts?.note,
        };

        for (const item of docs) {
          const { _id, ...rest } = item || {};
          const docId = String(_id || item?.id || '').trim();
          if (!docId) {
            stat.failedCount += 1;
            continue;
          }
          try {
            const targetRef = doc(db, colName, docId);
            const existing = await getDoc(targetRef);
            if (existing.exists()) {
              stat.skippedExistingCount += 1;
              continue;
            }
            const data: Record<string, any> = { ...rest };
            if (opts?.ownerUidOverride) {
              if ('ownerId' in data) data.ownerId = uid;
              if ('userId' in data) data.userId = uid;
            }
            if (opts?.onlyCreatedAtTimestamp) {
              data.createdAt = serverTimestamp();
            } else if (opts?.setCreateTimestamps) {
              data.createdAt = serverTimestamp();
              data.updatedAt = serverTimestamp();
            }
            await setDoc(targetRef, data);
            stat.copiedCount += 1;
          } catch {
            stat.failedCount += 1;
          }
        }
        stat.targetCount = stat.copiedCount + stat.skippedExistingCount;
        restoreStats.push(stat);
      };

      await restoreCollection('admins', { onlyCreatedAtTimestamp: true });
      await restoreCollection('users');
      await restoreCollection('business_settings');
      await restoreCollection('services');
      await restoreCollection('blog_posts');
      await restoreCollection('applications');
      await restoreCollection('tracking_records');
      await restoreCollection('commission_ledger');
      await restoreCollection('infra_bindings', { setCreateTimestamps: true, ownerUidOverride: true, note: 'Admin-owned' });
      await restoreCollection('karta_files', { setCreateTimestamps: true, ownerUidOverride: true, note: 'Admin-owned' });
      await restoreCollection('tools_configs', { setCreateTimestamps: true, ownerUidOverride: true, note: 'Admin-owned' });
      await restoreCollection('backups', { setCreateTimestamps: true, ownerUidOverride: true, note: 'Admin-owned' });
      await restoreCollection('workspace_audits', { ownerUidOverride: true, note: 'Admin-owned' });
      await restoreCollection('api_sathi_verifications', { ownerUidOverride: true, note: 'Admin-owned' });

      const privDocs = Array.isArray(collectionsMap.users_private_security)
        ? collectionsMap.users_private_security
        : [];
      if (privDocs.length > 0) {
        const privStat: RecreateCollectionStat = {
          collection: 'users/*/private/security',
          sourceCount: privDocs.length,
          targetCount: 0,
          copiedCount: 0,
          skippedExistingCount: 0,
          failedCount: 0,
        };
        for (const item of privDocs) {
          const { _userId, _id, ...rest } = item || {};
          const userId = String(_userId || rest.uid || '').trim();
          if (!userId) {
            privStat.failedCount += 1;
            continue;
          }
          try {
            const targetRef = doc(db, 'users', userId, 'private', 'security');
            const existing = await getDoc(targetRef);
            if (existing.exists()) {
              privStat.skippedExistingCount += 1;
              continue;
            }
            await setDoc(targetRef, { ...rest, updatedAt: serverTimestamp() });
            privStat.copiedCount += 1;
          } catch {
            privStat.failedCount += 1;
          }
        }
        privStat.targetCount = privStat.copiedCount + privStat.skippedExistingCount;
        restoreStats.push(privStat);
      }

      setStats(restoreStats);
      const totalRestored = restoreStats.reduce((s, r) => s + r.copiedCount, 0);
      const totalSkipped = restoreStats.reduce((s, r) => s + r.skippedExistingCount, 0);
      setStatusMsg(
        `JSON restore finished into "${targetDbId}": wrote ${totalRestored} document(s) (${totalSkipped} already present).`
      );
    } catch (err: any) {
      setErrorMsg(formatFirestoreActionError(err, 'Failed to restore from JSON backup.'));
    } finally {
      setRestoring(false);
    }
  };

  const handleExportJson = async (fromTarget: boolean) => {
    setExporting(true);
    setErrorMsg(null);
    try {
      ensureVerifiedAdmin();
      const chosenDb = fromTarget ? db : getSourceDb();
      const chosenDbId = fromTarget ? targetDbId : sourceDbId.trim();
      const collectionsToDump = [
        'services',
        'blog_posts',
        'business_settings',
        'admins',
        'users',
        'applications',
        'operator_enrollments',
        'partners',
        'commission_ledger',
        'settlement_requests',
        'infra_bindings',
        'karta_files',
        'tools_configs',
        'backups',
        'workspace_audits',
        'api_sathi_verifications',
        'audit_logs',
      ];
      const payload: Record<string, any[]> = {};
      for (const colName of collectionsToDump) {
        try {
          const snap = await getDocs(collection(chosenDb, colName));
          payload[colName] = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
        } catch {
          payload[colName] = [];
        }
      }

      const trackingRecords: any[] = [];
      for (const appDoc of payload.applications || []) {
        const appId = String(appDoc._id || appDoc.id || '').trim();
        if (!appId) continue;
        try {
          const trackSnap = await getDoc(doc(chosenDb, 'tracking_records', appId));
          if (trackSnap.exists()) {
            trackingRecords.push({ _id: trackSnap.id, ...trackSnap.data() });
          }
        } catch {
          // skip unreadable tracking projection
        }
      }
      payload.tracking_records = trackingRecords;

      const privateSecurityRecords: any[] = [];
      for (const uDoc of payload.users || []) {
        const userId = String(uDoc._id || uDoc.uid || '').trim();
        if (!userId) continue;
        try {
          const privSnap = await getDoc(doc(chosenDb, 'users', userId, 'private', 'security'));
          if (privSnap.exists()) {
            privateSecurityRecords.push({ _userId: userId, _id: privSnap.id, ...privSnap.data() });
          }
        } catch {
          // skip unreadable private security record
        }
      }
      payload.users_private_security = privateSecurityRecords;

      const blob = new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              projectId: firebaseMetadata.projectId,
              databaseId: chosenDbId,
              collections: payload,
            },
            null,
            2
          ),
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `firestore-backup-${chosenDbId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(`Downloaded full JSON backup from "${chosenDbId}".`);
    } catch (err: any) {
      setErrorMsg(formatFirestoreActionError(err, 'Failed to export JSON backup.'));
    } finally {
      setExporting(false);
    }
  };

  const busy = scanning || recreating || migrating || restoring || exporting;

  return (
    <div className="bg-white dark:bg-slate-900 border-2 border-[#FF671F]/30 dark:border-orange-900/50 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
      <input
        ref={restoreInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleRestoreFromJsonFile}
      />
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FF671F]">
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <span>Firestore Database Recreate, Migration &amp; Backup</span>
          </div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            Active Database: <span className="font-mono text-[#138808] dark:text-emerald-400">{targetDbId}</span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Recreate all core database collections (149+ services, 106+ blog posts, corporate settings, RBAC, admin grants &amp; 25 infra bindings) directly into <span className="font-mono">{targetDbId}</span>, copy records from your old database, or download JSON backups.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRecreateAllDatabaseFiles}
            disabled={busy}
            className="px-3.5 py-2 bg-[#FF671F] hover:bg-[#E55B1B] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
          >
            <Sparkles className={`w-3.5 h-3.5 ${recreating ? 'animate-spin' : ''}`} />
            <span>{recreating ? 'Recreating All Collections...' : 'Recreate All DB Collections'}</span>
          </button>

          <button
            type="button"
            onClick={handleScanDatabases}
            disabled={busy}
            className="px-3.5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning...' : 'Scan Active DB'}</span>
          </button>

          {sourceDbId.trim() && (
            <>
              <button
                type="button"
                onClick={handleMigrateData}
                disabled={busy}
                className="px-3.5 py-2 bg-[#138808] hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{migrating ? 'Migrating...' : 'Migrate From Optional Source DB'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportJson(false)}
                disabled={busy}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Source DB JSON</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => handleExportJson(true)}
            disabled={busy}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Active DB JSON</span>
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Upload className={`w-3.5 h-3.5 ${restoring ? 'animate-pulse' : ''}`} />
            <span>{restoring ? 'Restoring JSON...' : 'Restore From JSON Backup'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
            Active Target Database ID
          </label>
          <input
            type="text"
            value={targetDbId}
            readOnly
            className="w-full px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 text-xs font-mono text-emerald-900 dark:text-emerald-200"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
            Optional Secondary Source DB ID (if migrating from another DB)
          </label>
          <input
            type="text"
            value={sourceDbId}
            onChange={(e) => setSourceDbId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
            placeholder="Optional old DB ID (if any)"
          />
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {stats.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2 px-3.5">Collection</th>
                <th className="py-2 px-3.5 text-right">Expected / Source</th>
                <th className="py-2 px-3.5 text-right">Active DB</th>
                <th className="py-2 px-3.5 text-right">Written</th>
                <th className="py-2 px-3.5 text-right">Already Present</th>
                <th className="py-2 px-3.5 text-right">Status / Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {stats.map((row) => (
                <tr key={row.collection}>
                  <td className="py-2 px-3.5 font-mono font-bold text-slate-900 dark:text-white">
                    {row.collection}
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono">{row.sourceCount}</td>
                  <td className="py-2 px-3.5 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {row.targetCount}
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono text-[#138808] dark:text-emerald-400 font-bold">
                    {row.copiedCount}
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono text-slate-500">
                    {row.skippedExistingCount}
                  </td>
                  <td className="py-2 px-3.5 text-right text-[11px] text-slate-500">
                    {row.failedCount > 0 ? `${row.failedCount} error(s)` : row.note || 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
          <Sparkles className="w-3.5 h-3.5 text-[#FF671F] shrink-0" />
          <span>Zero-Backup Recreation in {targetDbId} (Project: {firebaseMetadata.projectId})</span>
        </div>
        <p>
          1. Click <strong>Recreate All DB Collections</strong> above to build all core collections directly inside <span className="font-mono">{targetDbId}</span> (admins, users, 149+ services, 106+ bilingual blogs, corporate GSTIN &amp; RBAC settings, 25 infra bindings, 6 tool configs, and audit log).
          <br />
          2. Click <strong>Scan Active DB</strong> to inspect live document counts across every collection, or <strong>Download Active DB JSON</strong> once rebuilt to save a local snapshot.
          <br />
          3. Use <strong>Restore From JSON Backup</strong> if you have an exported JSON snapshot with prior citizen applications or customer profiles to import.
        </p>
      </div>
    </div>
  );
};
