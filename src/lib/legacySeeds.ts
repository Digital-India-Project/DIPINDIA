import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { BindingType, ConflictPolicy, MigrationStatus, SourceRepo, ToolKey } from '../types/platform';
import { db, firebaseMetadata } from './firebase';

interface SeedBindingDef {
  bindingKey: string;
  bindingType: BindingType;
  sourceRepo: SourceRepo;
  legacyNamespace: string;
  migrationStatus: MigrationStatus;
  conflictPolicy: ConflictPolicy;
  recordCount: number;
  checksum: string;
}

const LOGICAL_R2_BUCKETS: Array<{ slot: string; name: string; repo: SourceRepo; records: number }> = [
  { slot: 'r2-01', name: 'documents', repo: 'DIP-Official', records: 1420 },
  { slot: 'r2-02', name: 'dip-public-assets', repo: 'DIP-Official', records: 318 },
  { slot: 'r2-03', name: 'dip-generated-files', repo: 'karta-files', records: 894 },
  { slot: 'r2-04', name: 'dip-backups', repo: 'DIP-Official', records: 92 },
  { slot: 'r2-05', name: 'dip-api-storage', repo: 'DIP-Official', records: 412 },
  { slot: 'r2-06', name: 'dip-customer-uploads', repo: 'karta-files', records: 1105 },
  { slot: 'r2-07', name: 'dip-partner-files', repo: 'DIP-Official', records: 530 },
  { slot: 'r2-08', name: 'dip-api-archives', repo: 'Tools-Tray', records: 274 },
  { slot: 'r2-09', name: 'dip-media-library', repo: 'DIP-Official', records: 645 },
  { slot: 'r2-10', name: 'dip-export-reports', repo: 'Tools-Tray', records: 188 },
];

const LOGICAL_D1_DATABASES: Array<{ shard: string; name: string; repo: SourceRepo; records: number }> = [
  { shard: 'd1-01', name: 'dip_core', repo: 'DIP-Official', records: 2410 },
  { shard: 'd1-02', name: 'dip_workflow', repo: 'DIP-Official', records: 3190 },
  { shard: 'd1-03', name: 'dip_partners', repo: 'DIP-Official', records: 740 },
  { shard: 'd1-04', name: 'dip_content', repo: 'DIP-Official', records: 520 },
  { shard: 'd1-05', name: 'dip_api', repo: 'DIP-Official', records: 1860 },
  { shard: 'd1-06', name: 'dip_billing', repo: 'DIP-Official', records: 1430 },
  { shard: 'd1-07', name: 'dip_audit', repo: 'DIP-Official', records: 4210 },
  { shard: 'd1-08', name: 'dip_services', repo: 'karta-files', records: 5100 },
  { shard: 'd1-09', name: 'dip_integrations', repo: 'Tools-Tray', records: 615 },
  { shard: 'd1-10', name: 'dip_analytics', repo: 'Tools-Tray', records: 980 },
];

export function buildLegacyBindingDefinitions(): SeedBindingDef[] {
  const defs: SeedBindingDef[] = [];

  for (const r of LOGICAL_R2_BUCKETS) {
    const isConflict = r.slot === 'r2-03' || r.slot === 'r2-08';
    defs.push({
      bindingKey: r.slot,
      bindingType: 'r2',
      sourceRepo: r.repo,
      legacyNamespace: r.name,
      migrationStatus: isConflict ? 'migrating' : 'migrated',
      conflictPolicy: 'merge-persistent-state',
      recordCount: r.records,
      checksum: `r2_${r.name.replace(/[^a-z0-9]/g, '')}_${r.slot}`,
    });
  }

  // Preserved R1 legacy storage alias
  defs.push({
    bindingKey: 'r1-01',
    bindingType: 'r1',
    sourceRepo: 'karta-files',
    legacyNamespace: 'karta-legacy-r1',
    migrationStatus: 'conflict-resolved',
    conflictPolicy: 'merge-persistent-state',
    recordCount: 418,
    checksum: 'r1_kartalegacy_01',
  });

  for (const d of LOGICAL_D1_DATABASES) {
    const isConflict = d.shard === 'd1-02' || d.shard === 'd1-08';
    defs.push({
      bindingKey: d.shard,
      bindingType: 'd1',
      sourceRepo: d.repo,
      legacyNamespace: d.name,
      migrationStatus: isConflict ? 'legacy-active' : 'migrated',
      conflictPolicy: d.shard === 'd1-08' ? 'legacy-d1-priority' : 'merge-persistent-state',
      recordCount: d.records,
      checksum: `d1_${d.name}_${d.shard}`,
    });
  }

  // Preserved D2 legacy SQL database alias (Tools-Tray D1/D2 schema)
  defs.push({
    bindingKey: 'd2-01',
    bindingType: 'd2',
    sourceRepo: 'Tools-Tray',
    legacyNamespace: 'digital-tools-tray-db',
    migrationStatus: 'migrated',
    conflictPolicy: 'merge-persistent-state',
    recordCount: 1290,
    checksum: 'd2_toolstraydb_01',
  });

  // Preserved Firebase configurations across all 3 projects
  defs.push(
    {
      bindingKey: 'firebase-dip-official',
      bindingType: 'firebase',
      sourceRepo: 'DIP-Official',
      legacyNamespace: 'gen-lang-client-0294214396',
      migrationStatus: 'migrated',
      conflictPolicy: 'merge-persistent-state',
      recordCount: 1,
      checksum: 'fb_0294214396_prod',
    },
    {
      bindingKey: 'firebase-tools-tray',
      bindingType: 'firebase',
      sourceRepo: 'Tools-Tray',
      legacyNamespace: 'gen-lang-client-0226759782',
      migrationStatus: 'migrated',
      conflictPolicy: 'merge-persistent-state',
      recordCount: 1,
      checksum: 'fb_0226759782_tray',
    },
    {
      bindingKey: 'firebase-dip-desk',
      bindingType: 'firebase',
      sourceRepo: 'DIP-Official',
      legacyNamespace: firebaseMetadata.projectId,
      migrationStatus: 'migrated',
      conflictPolicy: 'merge-persistent-state',
      recordCount: 1,
      checksum: `fb_${firebaseMetadata.firestoreDatabaseId.slice(0, 12)}`,
    }
  );

  return defs;
}

const DEFAULT_TOOLS: Array<{
  toolKey: ToolKey;
  displayName: string;
  legacyD1Binding: string;
  legacyR2Binding: string;
  configSummary: string;
}> = [
  {
    toolKey: 'schema-migrator',
    displayName: 'D1/D2 -> Firestore Schema Migrator',
    legacyD1Binding: 'd1-01 (dip_core)',
    legacyR2Binding: 'r2-01 (documents)',
    configSummary: 'Unifies DIP-Official (DIP-Desk), karta-files, and Tools-Tray schemas without state loss.',
  },
  {
    toolKey: 'payload-encryptor',
    displayName: 'Karta AES-256-GCM Encryptor',
    legacyD1Binding: 'd1-08 (dip_services)',
    legacyR2Binding: 'r2-03 (dip-generated-files)',
    configSummary: 'Zero-knowledge client encryption + SHA-256 integrity verification for legal drafts.',
  },
  {
    toolKey: 'totp-vault',
    displayName: 'RFC 6238 TOTP & Passkey Guard',
    legacyD1Binding: 'd1-07 (dip_audit)',
    legacyR2Binding: 'r2-06 (dip-customer-uploads)',
    configSummary: 'Manages two-factor HMAC-SHA1 codes and WebAuthn platform biometric credentials.',
  },
  {
    toolKey: 'locale-inspector',
    displayName: 'Localization & Accessibility Matrix',
    legacyD1Binding: 'd1-04 (dip_content)',
    legacyR2Binding: 'r2-09 (dip-media-library)',
    configSummary: 'Validates 5-language bundles (en, hi, ta, es, ja) and WCAG AA contrast.',
  },
  {
    toolKey: 'backup-utility',
    displayName: 'Encrypted Snapshot & Recovery Engine',
    legacyD1Binding: 'd2-01 (tools-tray-db)',
    legacyR2Binding: 'r2-04 (dip-backups)',
    configSummary: 'Packages encrypted workspace backups into Firestore for point-in-time restoration.',
  },
  {
    toolKey: 'voice-console',
    displayName: 'Hands-Free Voice Command Router',
    legacyD1Binding: 'd1-10 (dip_analytics)',
    legacyR2Binding: 'r2-10 (dip-export-reports)',
    configSummary: 'Web Speech API intent dispatcher for navigation, theme toggling, and vault lock.',
  },
];

export async function initializeWorkspaceIfEmpty(uid: string): Promise<boolean> {
  const existingBindings = await getDocs(
    query(collection(db, 'infra_bindings'), where('ownerId', '==', uid))
  );

  const existingKeys = new Set(
    existingBindings.docs.map((d) => String(d.data().bindingKey || ''))
  );
  const defs = buildLegacyBindingDefinitions().filter((def) => !existingKeys.has(def.bindingKey));

  let seeded = false;
  if (defs.length > 0) {
    const batch = writeBatch(db);
    for (const def of defs) {
      const docId = `${uid}_${def.bindingKey}`;
      batch.set(doc(db, 'infra_bindings', docId), {
        ownerId: uid,
        bindingKey: def.bindingKey,
        bindingType: def.bindingType,
        sourceRepo: def.sourceRepo,
        legacyNamespace: def.legacyNamespace,
        migrationStatus: def.migrationStatus,
        conflictPolicy: def.conflictPolicy,
        recordCount: def.recordCount,
        checksum: def.checksum,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    seeded = true;
  }

  const existingTools = await getDocs(
    query(collection(db, 'tools_configs'), where('ownerId', '==', uid))
  );
  if (existingTools.empty) {
    for (const tool of DEFAULT_TOOLS) {
      const docId = `${uid}_${tool.toolKey}`;
      await setDoc(doc(db, 'tools_configs', docId), {
        ownerId: uid,
        toolKey: tool.toolKey,
        displayName: tool.displayName,
        enabled: true,
        legacyD1Binding: tool.legacyD1Binding,
        legacyR2Binding: tool.legacyR2Binding,
        configSummary: tool.configSummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    seeded = true;
  }

  return seeded;
}
