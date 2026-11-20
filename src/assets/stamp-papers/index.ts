import emeraldUrl from './shcil-guilloche-emerald.svg';
import saffronUrl from './non-judicial-saffron-bond.svg';
import indigoUrl from './court-fee-indigo-ledger.svg';
import rosetteUrl from './security-rosette-watermark.svg';

export type StampBackgroundPatternId =
  | 'none'
  | 'shcil_emerald'
  | 'saffron_bond'
  | 'indigo_judicial'
  | 'rosette_watermark';

export interface StampBackgroundPatternOption {
  id: StampBackgroundPatternId;
  label: string;
  subtitle: string;
  accentHex: string;
  url: string | null;
}

export const STAMP_BACKGROUND_PATTERNS: StampBackgroundPatternOption[] = [
  {
    id: 'none',
    label: 'Plain Archival Paper',
    subtitle: 'Clean unpatterned vellum bond',
    accentHex: '#78716C',
    url: null,
  },
  {
    id: 'shcil_emerald',
    label: 'SHCIL Emerald Guilloche',
    subtitle: 'Teal-green e-Stamp security wave',
    accentHex: '#047857',
    url: emeraldUrl,
  },
  {
    id: 'saffron_bond',
    label: 'Saffron Treasury Bond',
    subtitle: 'Traditional non-judicial amber lattice',
    accentHex: '#B45309',
    url: saffronUrl,
  },
  {
    id: 'indigo_judicial',
    label: 'Indigo Judicial Ledger',
    subtitle: 'Navy court-fee security grid',
    accentHex: '#1B365D',
    url: indigoUrl,
  },
  {
    id: 'rosette_watermark',
    label: 'Rosette Draft Watermark',
    subtitle: 'Repeating security medallion mesh',
    accentHex: '#57534E',
    url: rosetteUrl,
  },
];

export function getStampBackgroundPattern(id?: StampBackgroundPatternId): StampBackgroundPatternOption {
  return (
    STAMP_BACKGROUND_PATTERNS.find((p) => p.id === id) ||
    STAMP_BACKGROUND_PATTERNS[0]
  );
}
