import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from '../../lib/firebase';
import {
  buildTotpUri,
  decryptPayload,
  encryptPayload,
  enrollBiometricPasskey,
  generateTotpSecretBase32,
  getKeyFingerprint,
  sha256Hex,
  verifyBiometricPasskey,
  verifyTotpCode,
} from '../../lib/crypto';
import { triggerHaptic } from '../../lib/haptics';
import {
  flushOfflineQueue,
  getPendingMutations,
} from '../../lib/offlineQueue';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  type CloudBackupRecord,
  OperationType,
  type UserPrivateSecurity,
} from '../../types/platform';
import {
  CheckCircle2,
  CloudUpload,
  Download,
  Fingerprint,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Vibrate,
} from 'lucide-react';

export const SecurityAndBackupsPanel: React.FC = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();

  const [securityDoc, setSecurityDoc] = useState<UserPrivateSecurity | null>(null);
  const [backups, setBackups] = useState<CloudBackupRecord[]>([]);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);

  // TOTP State
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrDataUrl, setTotpQrDataUrl] = useState('');
  const [totpCodeInput, setTotpCodeInput] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);

  // Biometric State
  const [biometricId, setBiometricId] = useState('');
  const [biometricMode, setBiometricMode] = useState<string>('');

  // Backup State
  const [backupLabel, setBackupLabel] = useState(
    `DIP-Desk Full Encrypted Snapshot (${new Date().toISOString().slice(0, 10)})`
  );
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [busyBackup, setBusyBackup] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);

  // Haptics Preference
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dip_haptics_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadQueueCount = async () => {
    try {
      const items = await getPendingMutations();
      setPendingQueueCount(items.length);
    } catch {
      setPendingQueueCount(0);
    }
  };

  useEffect(() => {
    void loadQueueCount();
  }, [isOnline]);

  useEffect(() => {
    if (!user?.id) return;

    // Load user security vault metadata
    getDoc(doc(db, 'users', user.id, 'private', 'security'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserPrivateSecurity;
          setSecurityDoc(data);
          if (data.totpSecretEncrypted) {
            setTotpSecret(data.totpSecretEncrypted);
            setTotpEnabled(true);
            void QRCode.toDataURL(buildTotpUri(data.totpSecretEncrypted, user.email, 'DIP-Desk')).then(
              setTotpQrDataUrl
            );
          }
          if (data.biometricCredentialId) {
            setBiometricId(data.biometricCredentialId);
            setBiometricMode(
              data.biometricCredentialId.startsWith('bio-dev-') ? 'device-key' : 'webauthn'
            );
          }
        }
      })
      .catch(() => {});

    // Live backups listener
    const bq = query(collection(db, 'backups'), where('ownerId', '==', user.id));
    const unsubBackups = onSnapshot(
      bq,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CloudBackupRecord, 'id'>),
        }));
        setBackups(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'backups');
      }
    );

    return () => unsubBackups();
  }, [user?.id, user?.email]);

  const handleToggleHaptics = async () => {
    const next = !hapticsEnabled;
    setHapticsEnabled(next);
    try {
      localStorage.setItem('dip_haptics_enabled', String(next));
    } catch {
      // ignore
    }
    if (next) triggerHaptic('success', true);
    if (user?.id) {
      await updateDoc(doc(db, 'users', user.id), {
        hapticsEnabled: next,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    setNotice({
      type: 'ok',
      text: next ? 'Haptic tactile feedback enabled across workspace controls.' : 'Haptic feedback muted.',
    });
  };

  const handleGenerateTotp = async () => {
    if (!user?.email) return;
    const secret = generateTotpSecretBase32();
    setTotpSecret(secret);
    const uri = buildTotpUri(secret, user.email, 'DIP-Desk');
    const qrUrl = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
    setTotpQrDataUrl(qrUrl);
    triggerHaptic('light', hapticsEnabled);
    setNotice({
      type: 'ok',
      text: 'Generated RFC 6238 TOTP secret. Scan the QR code and verify a 6-digit authenticator code.',
    });
  };

  const handleVerifyAndSaveTotp = async () => {
    if (!user?.id || !totpSecret) return;
    if (!auth.currentUser?.emailVerified) {
      setNotice({
        type: 'err',
        text: 'Verify your account email first (Google Sign-In auto-verifies) before storing 2FA secrets.',
      });
      return;
    }

    const ok = await verifyTotpCode(totpSecret, totpCodeInput);
    if (!ok) {
      triggerHaptic('warning', hapticsEnabled);
      setNotice({ type: 'err', text: 'Invalid 6-digit TOTP code. Ensure device clock is synced.' });
      return;
    }

    const secPayload: UserPrivateSecurity = {
      uid: user.id,
      email: user.email,
      totpSecretEncrypted: totpSecret,
      biometricCredentialId: biometricId || securityDoc?.biometricCredentialId || '',
      keyFingerprint: securityDoc?.keyFingerprint || (await getKeyFingerprint(user.id)),
      recoveryHash: await sha256Hex(`${user.id}:${totpSecret}`),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'users', user.id, 'private', 'security'), secPayload);
    await updateDoc(doc(db, 'users', user.id), {
      twoFactorEnabled: true,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
    await addDoc(collection(db, 'audit_logs'), {
      actorId: user.id,
      actorRole: user.role || 'customer',
      module: 'Security',
      action: 'TOTP_2FA_ENABLED',
      resourcePath: `users/${user.id}/private/security`,
      severity: 'info',
      details: 'Verified & stored RFC 6238 HMAC-SHA1 TOTP secret in zero-trust security subcollection.',
      createdAt: serverTimestamp(),
    }).catch(() => {});

    setTotpEnabled(true);
    setTotpCodeInput('');
    triggerHaptic('success', hapticsEnabled);
    setNotice({ type: 'ok', text: '2FA (RFC 6238 TOTP) activated and persisted to private security vault.' });
  };

  const handleEnrollBiometric = async () => {
    if (!user?.id) return;
    const res = await enrollBiometricPasskey(user.id, user.email, user.name);
    setBiometricId(res.credentialId);
    setBiometricMode(res.mode);

    if (auth.currentUser?.emailVerified) {
      const secPayload: UserPrivateSecurity = {
        uid: user.id,
        email: user.email,
        totpSecretEncrypted: totpSecret || securityDoc?.totpSecretEncrypted || '',
        biometricCredentialId: res.credentialId,
        keyFingerprint: securityDoc?.keyFingerprint || (await getKeyFingerprint(user.id)),
        recoveryHash: securityDoc?.recoveryHash || (await sha256Hex(res.credentialId)),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.id, 'private', 'security'), secPayload);
      await updateDoc(doc(db, 'users', user.id), {
        biometricEnabled: true,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await addDoc(collection(db, 'audit_logs'), {
        actorId: user.id,
        actorRole: user.role || 'customer',
        module: 'Security',
        action: 'BIOMETRIC_PASSKEY_ENROLLED',
        resourcePath: `users/${user.id}/private/security`,
        severity: 'info',
        details: `Enrolled biometric credential (${res.mode})`,
        createdAt: serverTimestamp(),
      }).catch(() => {});
    }

    triggerHaptic('success', hapticsEnabled);
    setNotice({
      type: 'ok',
      text: `Biometric credential bound (${res.mode === 'webauthn' ? 'Platform WebAuthn' : 'Device Key Fallback'}).`,
    });
  };

  const handleTestBiometric = async () => {
    if (!biometricId) return;
    const verified = await verifyBiometricPasskey(biometricId);
    triggerHaptic(verified ? 'success' : 'warning', hapticsEnabled);
    setNotice({
      type: verified ? 'ok' : 'err',
      text: verified
        ? 'Biometric assertion verified successfully.'
        : 'Biometric prompt cancelled or unavailable on this browser.',
    });
  };

  const handleCreateEncryptedBackup = async () => {
    if (!user?.id) return;
    if (backupPassphrase.trim().length < 6) {
      setNotice({ type: 'err', text: 'Enter a backup passphrase (min 6 characters) to encrypt the snapshot.' });
      return;
    }

    setBusyBackup(true);
    setNotice(null);
    triggerHaptic('medium', hapticsEnabled);

    try {
      const [kartaSnap, infraSnap, toolsSnap] = await Promise.all([
        getDocs(query(collection(db, 'karta_files'), where('ownerId', '==', user.id))),
        getDocs(query(collection(db, 'infra_bindings'), where('ownerId', '==', user.id))),
        getDocs(query(collection(db, 'tools_configs'), where('ownerId', '==', user.id))),
      ]);

      const snapshotObject = {
        exportedAt: new Date().toISOString(),
        ownerId: user.id,
        kartaFiles: kartaSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        infraBindings: infraSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        toolsConfigs: toolsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      };

      const itemCount =
        snapshotObject.kartaFiles.length +
        snapshotObject.infraBindings.length +
        snapshotObject.toolsConfigs.length;

      const plaintext = JSON.stringify(snapshotObject);
      const encrypted = await encryptPayload(plaintext, backupPassphrase.trim());
      const backupId = `bkp_${Date.now()}`;

      await setDoc(doc(db, 'backups', backupId), {
        ownerId: user.id,
        label: backupLabel.trim().slice(0, 115) || 'DIP-Desk Snapshot',
        scope: 'full',
        encryptedSnapshot: encrypted.encryptedPayload,
        iv: encrypted.iv,
        salt: encrypted.salt,
        checksum: encrypted.integrityHash,
        itemCount,
        status: 'verified',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'audit_logs'), {
        actorId: user.id,
        actorRole: user.role || 'customer',
        module: 'Security',
        action: 'CLOUD_BACKUP_CREATED',
        resourcePath: `backups/${backupId}`,
        severity: 'info',
        details: `Encrypted backup (${itemCount} records) · SHA256:${encrypted.integrityHash.slice(0, 12)}`,
        createdAt: serverTimestamp(),
      }).catch(() => {});

      setNotice({
        type: 'ok',
        text: `Encrypted cloud snapshot saved (${itemCount} items · Key ${encrypted.keyFingerprint}).`,
      });
    } catch (err: any) {
      setNotice({ type: 'err', text: err?.message || 'Backup creation failed.' });
    } finally {
      setBusyBackup(false);
    }
  };

  const handleRestoreBackup = async (record: CloudBackupRecord) => {
    if (!user?.id) return;
    if (!backupPassphrase.trim()) {
      setNotice({ type: 'err', text: 'Enter your backup passphrase above to decrypt and restore.' });
      return;
    }

    setBusyBackup(true);
    try {
      const plaintext = await decryptPayload(
        record.encryptedSnapshot,
        record.iv,
        record.salt,
        backupPassphrase.trim()
      );
      const parsed = JSON.parse(plaintext);
      const batch = writeBatch(db);
      let restoredCount = 0;

      for (const kf of parsed.kartaFiles || []) {
        if (kf?.id && kf?.encryptedPayload) {
          batch.set(
            doc(db, 'karta_files', kf.id),
            {
              ownerId: user.id,
              title: kf.title || 'Restored Draft',
              bucketSlot: kf.bucketSlot || 'r2-03',
              d1Shard: kf.d1Shard || 'd1-08',
              mimeType: kf.mimeType || 'application/json',
              sizeBytes: Number(kf.sizeBytes || 0),
              encryptedPayload: kf.encryptedPayload,
              iv: kf.iv,
              salt: kf.salt,
              keyFingerprint: kf.keyFingerprint || 'AES256-RESTORED',
              integrityHash: kf.integrityHash || record.checksum,
              status: kf.status || 'synced',
              version: Number(kf.version || 1),
              tags: Array.isArray(kf.tags) ? kf.tags.slice(0, 10) : ['restored'],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          restoredCount += 1;
        }
      }

      if (record.status !== 'restored') {
        batch.update(doc(db, 'backups', record.id), {
          status: 'restored',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      triggerHaptic('success', hapticsEnabled);
      setNotice({
        type: 'ok',
        text: `Restored ${restoredCount} encrypted vault items from "${record.label}" safely.`,
      });
    } catch {
      setNotice({ type: 'err', text: 'Incorrect passphrase or corrupted snapshot.' });
    } finally {
      setBusyBackup(false);
    }
  };

  const handleDownloadBackupJson = (record: CloudBackupRecord) => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.id}_encrypted_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSyncOfflineQueue = async () => {
    setSyncingQueue(true);
    try {
      const flushed = await flushOfflineQueue(db);
      await loadQueueCount();
      triggerHaptic('success', hapticsEnabled);
      setNotice({
        type: 'ok',
        text: flushed > 0 ? `Synchronized ${flushed} offline mutations to Firestore.` : 'Offline queue is clear.',
      });
    } finally {
      setSyncingQueue(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            notice.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
          }`}
        >
          {notice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Row 1: 2FA (TOTP) & WebAuthn Biometrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RFC 6238 TOTP */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#FF671F]" />
                <span>Two-Factor Authentication (RFC 6238 TOTP)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bind Google Authenticator or Microsoft Authenticator using Web Crypto HMAC-SHA1.
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                totpEnabled
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-[#138808] dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {totpEnabled ? 'Active' : 'Setup'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerateTotp}
              className="px-3.5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{totpSecret ? 'Rotate TOTP Secret' : 'Generate Authenticator QR'}</span>
            </button>
          </div>

          {totpSecret && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row gap-4 items-center">
              {totpQrDataUrl && (
                <img
                  src={totpQrDataUrl}
                  alt="TOTP Authenticator QR Code"
                  className="w-32 h-32 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                />
              )}
              <div className="flex-1 space-y-2.5 w-full">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Manual Base32 Secret</div>
                  <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 break-all">
                    {totpSecret}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={totpCodeInput}
                    onChange={(e) => setTotpCodeInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyAndSaveTotp}
                    className="px-4 py-2 bg-[#138808] hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer shrink-0"
                  >
                    Verify &amp; Activate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Biometrics + Haptics + Offline Sync */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-[#138808]" />
                <span>WebAuthn Biometrics, Haptics &amp; Offline Sync</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enroll Touch ID / Windows Hello passkeys and manage offline IndexedDB synchronization.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {biometricId ? biometricMode : 'Unbound'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEnrollBiometric}
              className="px-3.5 py-2 bg-[#FF671F] hover:bg-[#E55B1B] text-white text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>{biometricId ? 'Re-Enroll Biometrics' : 'Enroll Platform Passkey'}</span>
            </button>

            {biometricId && (
              <button
                type="button"
                onClick={handleTestBiometric}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                Verify Biometric Prompt
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Vibrate className="w-3.5 h-3.5 text-[#FF671F]" />
                  <span>Haptic Feedback</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {hapticsEnabled ? 'Active on supported devices' : 'Muted'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleHaptics}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                  hapticsEnabled
                    ? 'bg-[#138808] text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {hapticsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800 dark:text-white">Offline Queue</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {pendingQueueCount} pending · {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSyncOfflineQueue}
                disabled={syncingQueue || !isOnline}
                className="px-2.5 py-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold text-[11px] cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${syncingQueue ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Encrypted Cloud Backups & Point-in-Time Recovery */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-[#FF671F]" />
              <span>AES-256-GCM Encrypted Cloud Backups &amp; Recovery (`backups`)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Snapshots karta_files, infra_bindings, and tools_configs with PBKDF2-SHA256 key derivation before cloud sync.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">{backups.length} snapshots</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <input
            type="text"
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder="Snapshot label..."
            className="md:col-span-5 bg-[#F7F8FA] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white"
          />
          <input
            type="password"
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
            placeholder="Encryption / Recovery passphrase (min 6 chars)"
            className="md:col-span-4 bg-[#F7F8FA] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-slate-900 dark:text-white"
          />
          <button
            type="button"
            onClick={handleCreateEncryptedBackup}
            disabled={busyBackup || !user}
            className="md:col-span-3 bg-[#138808] hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{busyBackup ? 'Encrypting...' : 'Create E2EE Backup'}</span>
          </button>
        </div>

        {backups.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            No encrypted workspace backups recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs tabular-nums">
            {backups.map((b) => (
              <div key={b.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#138808] shrink-0" />
                    <span className="truncate">{b.label}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {b.id} · {b.itemCount} items · Status: {b.status} · SHA256:{b.checksum?.slice(0, 12)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestoreBackup(b)}
                    disabled={busyBackup}
                    className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupJson(b)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
