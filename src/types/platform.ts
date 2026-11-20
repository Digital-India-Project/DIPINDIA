export type UserRole = 'admin' | 'operator' | 'auditor' | 'viewer';
export type SupportedLang = 'en' | 'hi' | 'ta' | 'es' | 'ja';
export type ThemeMode = 'light' | 'dark';
export type BindingType = 'r1' | 'r2' | 'd1' | 'd2' | 'firebase';
export type SourceRepo = 'karta-files' | 'DIP-Official' | 'Tools-Tray';
export type MigrationStatus = 'legacy-active' | 'migrating' | 'migrated' | 'conflict-resolved';
export type ConflictPolicy = 'keep-latest' | 'merge-persistent-state' | 'legacy-d1-priority';
export type NavModule =
  | 'dashboard'
  | 'karta-files'
  | 'tools-tray'
  | 'migration'
  | 'audit'
  | 'security'
  | 'docs';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface UserProfile {
  uid: string;
  displayName: string;
  role: UserRole;
  preferredLang: SupportedLang;
  theme: ThemeMode;
  hapticsEnabled: boolean;
  twoFactorEnabled: boolean;
  biometricEnabled: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface UserPrivateSecurity {
  uid: string;
  email: string;
  totpSecretEncrypted?: string;
  biometricCredentialId?: string;
  keyFingerprint?: string;
  recoveryHash?: string;
  updatedAt: unknown;
}

export interface InfraBinding {
  id: string;
  ownerId: string;
  bindingKey: string;
  bindingType: BindingType;
  sourceRepo: SourceRepo;
  legacyNamespace: string;
  migrationStatus: MigrationStatus;
  conflictPolicy: ConflictPolicy;
  recordCount: number;
  checksum: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface KartaFileRecord {
  id: string;
  ownerId: string;
  title: string;
  bucketSlot: string;
  d1Shard: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPayload: string;
  iv: string;
  salt: string;
  keyFingerprint: string;
  integrityHash: string;
  status: 'encrypted' | 'synced' | 'archived';
  version: number;
  tags: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export type ToolKey =
  | 'schema-migrator'
  | 'payload-encryptor'
  | 'totp-vault'
  | 'locale-inspector'
  | 'backup-utility'
  | 'voice-console';

export interface ToolConfigRecord {
  id: string;
  ownerId: string;
  toolKey: ToolKey;
  displayName: string;
  enabled: boolean;
  legacyD1Binding: string;
  legacyR2Binding: string;
  configSummary: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorRole: UserRole;
  module: 'DIP-Desk' | 'karta-files' | 'Tools-Tray' | 'Security' | 'Migration';
  action: string;
  resourcePath: string;
  severity: 'info' | 'warning' | 'critical';
  details: string;
  createdAt: unknown;
}

export interface CloudBackupRecord {
  id: string;
  ownerId: string;
  label: string;
  scope: 'full' | 'karta-files' | 'infra-configs';
  encryptedSnapshot: string;
  iv: string;
  salt: string;
  checksum: string;
  itemCount: number;
  status: 'verified' | 'restored';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface OfflineMutation {
  id: string;
  collectionName: 'karta_files' | 'infra_bindings' | 'tools_configs';
  docId: string;
  operation: 'set' | 'update';
  payload: Record<string, unknown>;
  queuedAt: number;
}
