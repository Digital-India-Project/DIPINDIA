import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  firebaseMetadata,
  handleFirestoreError,
  OperationType,
  syncFirebaseUserProfile,
} from '../services/firebase';
import { syncServicesCatalogueToFirestore } from './firestoreCatalogueSync';
import { initializeWorkspaceIfEmpty } from './legacySeeds';
import { INITIAL_BLOG_POSTS } from '../data/initialBlogPosts';
import { DEFAULT_ROLE_PERMISSIONS, type RolePermissionMap } from './rbac';
import type { BlogPost, BusinessSettings, User } from '../types';

export interface RecreateCollectionStat {
  collection: string;
  sourceCount: number;
  targetCount: number;
  copiedCount: number;
  skippedExistingCount: number;
  failedCount: number;
  note?: string;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function sanitizeBlogPostForFirestore(post: BlogPost): Record<string, any> {
  const payload: Record<string, any> = {
    id: String(post.id).slice(0, 64),
    slug: String(post.slug).slice(0, 110),
    title: String(post.title).slice(0, 180),
    excerpt: String(post.excerpt).slice(0, 400),
    content: String(post.content).slice(0, 20000),
    category: String(post.category || 'Citizen Guides').slice(0, 64),
    tags: Array.isArray(post.tags)
      ? post.tags.map((t) => String(t)).filter(Boolean).slice(0, 10)
      : ['Digital India'],
    status: post.status || 'published',
    featured: Boolean(post.featured),
    authorName: String(post.authorName || 'Suraj Singh').slice(0, 100),
    publishedAt: String(post.publishedAt || new Date().toISOString()).slice(0, 50),
    updatedAt: String(post.updatedAt || post.publishedAt || new Date().toISOString()).slice(0, 50),
    readingTimeMinutes: Math.max(1, Math.min(120, Math.round(Number(post.readingTimeMinutes || 4)))),
  };
  if (post.titleHi) payload.titleHi = String(post.titleHi).slice(0, 200);
  if (post.excerptHi) payload.excerptHi = String(post.excerptHi).slice(0, 420);
  if (post.contentHi) payload.contentHi = String(post.contentHi).slice(0, 20000);
  if (post.authorRole) payload.authorRole = String(post.authorRole).slice(0, 100);
  if (post.relatedServiceSlug) payload.relatedServiceSlug = String(post.relatedServiceSlug).slice(0, 100);
  if (post.seoTitle) payload.seoTitle = String(post.seoTitle).slice(0, 110);
  if (post.seoDescription) payload.seoDescription = String(post.seoDescription).slice(0, 200);
  if (post.focusKeyword) payload.focusKeyword = String(post.focusKeyword).slice(0, 100);
  if (post.canonicalUrl) payload.canonicalUrl = String(post.canonicalUrl).slice(0, 250);
  if (post.featuredImageUrl) payload.featuredImageUrl = String(post.featuredImageUrl).slice(0, 500);
  if (Array.isArray(post.faqItems) && post.faqItems.length > 0) {
    payload.faqItems = post.faqItems.slice(0, 8);
  }
  return payload;
}

export async function inspectActiveDatabaseState(): Promise<{
  initialized: boolean;
  settingsExists: boolean;
  hasServices: boolean;
  error?: string;
}> {
  if (!auth.currentUser) {
    return {
      initialized: false,
      settingsExists: false,
      hasServices: false,
      error: 'Google Sign-In required before inspecting or initializing Firestore.',
    };
  }
  try {
    const [settingsSnap, servicesSnap] = await Promise.all([
      getDoc(doc(db, 'business_settings', 'default')),
      getDocs(query(collection(db, 'services'), limit(1))),
    ]);
    const settingsExists = settingsSnap.exists();
    const hasServices = !servicesSnap.empty;
    return {
      initialized: settingsExists && hasServices,
      settingsExists,
      hasServices,
    };
  } catch (err: any) {
    return {
      initialized: false,
      settingsExists: false,
      hasServices: false,
      error: String(err?.message || 'Unable to read Firestore database state.'),
    };
  }
}

export async function checkActiveDatabaseInitialized(): Promise<boolean> {
  const state = await inspectActiveDatabaseState();
  return state.initialized;
}

export async function recreateAllFirestoreDatabaseFiles(params: {
  user: User | null;
  businessSettings: BusinessSettings;
  rolePermissions?: RolePermissionMap;
}): Promise<{
  stats: RecreateCollectionStat[];
  totalWritten: number;
  targetDbId: string;
}> {
  const fbUser = auth.currentUser;
  if (!fbUser || !params.user) {
    throw new Error('Please sign in with your verified Super Admin Google account first.');
  }
  if (!fbUser.emailVerified) {
    throw new Error('Verified email is required to write to Firestore collections.');
  }

  const uid = fbUser.uid;
  const targetDbId = firebaseMetadata.firestoreDatabaseId;
  const recreatedStats: RecreateCollectionStat[] = [];

  // 1. Admins grant & User profile
  let adminCreated = 0;
  let adminSkipped = 0;
  const adminRef = doc(db, 'admins', uid);
  const existingAdmin = await getDoc(adminRef);
  if (!existingAdmin.exists()) {
    await setDoc(adminRef, {
      uid,
      grantedBy: uid,
      createdAt: serverTimestamp(),
    });
    adminCreated = 1;
  } else {
    adminSkipped = 1;
  }
  recreatedStats.push({
    collection: 'admins',
    sourceCount: 1,
    targetCount: 1,
    copiedCount: adminCreated,
    skippedExistingCount: adminSkipped,
    failedCount: 0,
    note: 'Super Admin grant verified',
  });

  await syncFirebaseUserProfile(fbUser, {
    displayName: params.user.name || fbUser.displayName || 'Super Admin',
    mobile: params.user.mobile || '',
  });
  recreatedStats.push({
    collection: 'users',
    sourceCount: 1,
    targetCount: 1,
    copiedCount: 1,
    skippedExistingCount: 0,
    failedCount: 0,
    note: 'Active Super Admin profile synced',
  });

  // 2. Services Catalogue (all 149+ core services, digital products & compliance packages)
  const servicesRes = await syncServicesCatalogueToFirestore({
    userRole: params.user.role || 'super_admin',
    actorName: params.user.name || fbUser.email || 'Super Admin',
    includePackages: true,
    dryRun: false,
    forceRefreshSeo: true,
    preserveExistingCustomizations: true,
  });
  recreatedStats.push({
    collection: 'services',
    sourceCount: servicesRes.report.totalProcessed,
    targetCount: servicesRes.report.totalProcessed,
    copiedCount: servicesRes.createdIds.length + servicesRes.updatedIds.length,
    skippedExistingCount: servicesRes.skippedIds.length,
    failedCount: servicesRes.report.errorsCount,
    note: 'Full catalog + packages + SEO',
  });

  // 3. Blog Posts (all 106+ bilingual SEO articles)
  let blogCopied = 0;
  let blogSkipped = 0;
  let blogFailed = 0;
  let blogNote = '106+ bilingual guides recreated';
  try {
    const existingBlogSnap = await getDocs(collection(db, 'blog_posts'));
    const existingBlogIds = new Set(existingBlogSnap.docs.map((d) => d.id));
    const pendingBlogs = INITIAL_BLOG_POSTS.filter((p) => !existingBlogIds.has(p.id));
    blogSkipped = INITIAL_BLOG_POSTS.length - pendingBlogs.length;

    for (let i = 0; i < pendingBlogs.length; i += 50) {
      const chunk = pendingBlogs.slice(i, i + 50);
      const batch = writeBatch(db);
      for (const post of chunk) {
        batch.set(doc(db, 'blog_posts', post.id), sanitizeBlogPostForFirestore(post));
      }
      try {
        await batch.commit();
        blogCopied += chunk.length;
      } catch (err: any) {
        blogFailed += chunk.length;
        blogNote = String(err?.message || 'Blog batch write warning');
      }
    }
    recreatedStats.push({
      collection: 'blog_posts',
      sourceCount: INITIAL_BLOG_POSTS.length,
      targetCount: existingBlogIds.size + blogCopied,
      copiedCount: blogCopied,
      skippedExistingCount: blogSkipped,
      failedCount: blogFailed,
      note: blogNote,
    });
  } catch (err: any) {
    recreatedStats.push({
      collection: 'blog_posts',
      sourceCount: INITIAL_BLOG_POSTS.length,
      targetCount: 0,
      copiedCount: 0,
      skippedExistingCount: 0,
      failedCount: INITIAL_BLOG_POSTS.length,
      note: String(err?.message || 'Unable to write blog_posts'),
    });
  }

  // 4. Business Settings & RBAC Matrix
  let settingsCopied = 0;
  let settingsSkipped = 0;
  const defaultSettingsRef = doc(db, 'business_settings', 'default');
  const existingDefault = await getDoc(defaultSettingsRef);
  if (!existingDefault.exists()) {
    await setDoc(
      defaultSettingsRef,
      stripUndefinedDeep({
        ...params.businessSettings,
        id: 'default',
        updatedAt: new Date().toISOString(),
        updatedBy: params.user.email || fbUser.email || 'Super Admin',
      })
    );
    settingsCopied += 1;
  } else {
    settingsSkipped += 1;
  }

  const rbacRef = doc(db, 'business_settings', 'rbac_matrix');
  const existingRbac = await getDoc(rbacRef);
  if (!existingRbac.exists()) {
    await setDoc(
      rbacRef,
      stripUndefinedDeep({
        matrix: params.rolePermissions || DEFAULT_ROLE_PERMISSIONS,
        updatedAt: new Date().toISOString(),
        updatedBy: params.user.email || fbUser.email || 'Super Admin',
      })
    );
    settingsCopied += 1;
  } else {
    settingsSkipped += 1;
  }
  recreatedStats.push({
    collection: 'business_settings',
    sourceCount: 2,
    targetCount: 2,
    copiedCount: settingsCopied,
    skippedExistingCount: settingsSkipped,
    failedCount: 0,
    note: 'Corporate GSTIN + RBAC matrix',
  });

  // 5. Preserved R1/R2 (10+1), D1/D2 (10+1), Firebase bindings & Tools-Tray configs
  try {
    const seededBindings = await initializeWorkspaceIfEmpty(uid);
    recreatedStats.push({
      collection: 'infra_bindings + tools_configs',
      sourceCount: 31,
      targetCount: 31,
      copiedCount: seededBindings ? 31 : 0,
      skippedExistingCount: seededBindings ? 0 : 31,
      failedCount: 0,
      note: '25 infra bindings + 6 tool configs',
    });
  } catch (err: any) {
    recreatedStats.push({
      collection: 'infra_bindings + tools_configs',
      sourceCount: 31,
      targetCount: 0,
      copiedCount: 0,
      skippedExistingCount: 0,
      failedCount: 31,
      note: String(err?.message || 'Workspace bindings write warning'),
    });
  }

  // 6. Audit Log Entry
  let auditCreated = 0;
  let auditFailed = 0;
  try {
    const auditId = `rebuild_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', auditId), {
      actorId: uid,
      actorRole: params.user.role || 'super_admin',
      module: 'Migration',
      action: 'RECREATE_ALL_DB_COLLECTIONS',
      resourcePath: `databases/${targetDbId}`,
      severity: 'info',
      details: `Rebuilt core collections into ${targetDbId} (services, blog_posts, business_settings, admins, users, infra_bindings, tools_configs).`,
      createdAt: serverTimestamp(),
    });
    auditCreated = 1;
  } catch {
    auditFailed = 1;
  }
  recreatedStats.push({
    collection: 'audit_logs',
    sourceCount: 1,
    targetCount: auditCreated,
    copiedCount: auditCreated,
    skippedExistingCount: 0,
    failedCount: auditFailed,
    note: 'Database rebuild audit log',
  });

  const totalWritten = recreatedStats.reduce((s, r) => s + r.copiedCount, 0);
  return {
    stats: recreatedStats,
    totalWritten,
    targetDbId,
  };
}

let autoPopulatePromise: Promise<{
  initialized: boolean;
  ranRebuild: boolean;
  result: Awaited<ReturnType<typeof recreateAllFirestoreDatabaseFiles>> | null;
}> | null = null;
let autoPopulateUid: string | null = null;

export async function ensureActiveDatabasePopulatedIfEmpty(params: {
  user: User | null;
  businessSettings: BusinessSettings;
  rolePermissions?: RolePermissionMap;
}) {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified || !params.user) {
    return { initialized: false, ranRebuild: false, result: null };
  }

  if (autoPopulatePromise && autoPopulateUid === fbUser.uid) {
    return autoPopulatePromise;
  }

  autoPopulateUid = fbUser.uid;
  autoPopulatePromise = (async () => {
    try {
      const state = await inspectActiveDatabaseState();
      if (state.initialized) {
        return { initialized: true, ranRebuild: false, result: null };
      }
      const result = await recreateAllFirestoreDatabaseFiles(params);
      return { initialized: true, ranRebuild: true, result };
    } catch (err) {
      autoPopulatePromise = null;
      throw err;
    }
  })();

  return autoPopulatePromise;
}

