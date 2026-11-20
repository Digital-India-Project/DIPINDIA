import { SavedUserDocument } from '../shared/types';

const VAULT_STORAGE_KEY = 'digital_india_legal_private_vault_v1';
const PRIVATE_MODE_KEY = 'digital_india_legal_ephemeral_mode';

export function isEphemeralPrivateMode(): boolean {
  try {
    return localStorage.getItem(PRIVATE_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setEphemeralPrivateMode(enabled: boolean): void {
  try {
    localStorage.setItem(PRIVATE_MODE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage restriction
  }
}

export function loadSavedDrafts(): SavedUserDocument[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDraftToVault(draft: SavedUserDocument): SavedUserDocument[] {
  if (isEphemeralPrivateMode()) {
    return loadSavedDrafts();
  }
  const list = loadSavedDrafts();
  const idx = list.findIndex((d) => d.id === draft.id);
  const next = idx >= 0 ? list.map((d, i) => (i === idx ? draft : d)) : [draft, ...list];
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
  } catch {
    // Ignore quota exceeded
  }
  return next;
}

export function deleteSavedDraft(id: string): SavedUserDocument[] {
  const next = loadSavedDrafts().filter((d) => d.id !== id);
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function wipeAllLocalPersonalData(): void {
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    sessionStorage.clear();
  } catch {
    // Ignore
  }
}
