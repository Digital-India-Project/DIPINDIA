export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 12,
  medium: 25,
  heavy: 42,
  success: [15, 35, 25],
  warning: [30, 40, 30],
};

export function triggerHaptic(pattern: HapticPattern, enabled: boolean = true): void {
  if (!enabled) return;
  try {
    const savedPref = typeof localStorage !== 'undefined' ? localStorage.getItem('dip_haptics_enabled') : null;
    if (savedPref === 'false') return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[pattern]);
    }
  } catch {
    // Ignore unsupported browser haptic APIs
  }
}
