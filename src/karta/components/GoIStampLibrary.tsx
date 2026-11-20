import React, { useMemo, useState } from 'react';
import { Check, Search, Stamp, Trash2 } from 'lucide-react';
import {
  GOI_STAMP_CATALOG,
  GOI_STAMP_CATEGORY_TABS,
  getGoIStampById,
  type GoIStampCategory,
  type GoIStampDefinition,
} from '../lib/goiStamps';
import type { KartaStampMetadata } from '../lib/kartaSyncService';

/**
 * Vector emblem mark inspired by Indian official seals (minimalist Ashoka wheel geometry).
 */
const AshokaSealWheel: React.FC<{ colorHex: string; className?: string }> = ({
  colorHex,
  className = 'w-4 h-4',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={colorHex}
    strokeWidth="1.5"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.2" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
  </svg>
);

export interface GoIStampPreviewProps {
  definition: GoIStampDefinition;
  officerName?: string;
  referenceNo?: string;
  stampedAtIso?: string;
  opacity?: number;
  scale?: number;
  animated?: boolean;
  compact?: boolean;
}

/**
 * Renders an authentic Government of India ink stamp overlay or miniature gallery preview
 * supporting double-box rectangular stamps, circular official seals, and oval registry seals.
 */
export const GoIStampPreview: React.FC<GoIStampPreviewProps> = ({
  definition,
  officerName = 'DIP Authorized Desk',
  referenceNo,
  stampedAtIso,
  opacity = 0.9,
  scale = 1,
  animated = false,
  compact = false,
}) => {
  const dateLabel = new Date(stampedAtIso || Date.now()).toLocaleDateString('en-IN');
  const effectiveScale = compact ? 0.72 : scale;

  if (definition.shape === 'circular-seal') {
    const dim = compact ? 'w-24 h-24' : 'w-32 h-32';
    return (
      <div
        className={`${animated ? 'animate-karta-stamp' : ''} ${dim} rounded-full border-[2.5px] bg-white/88 backdrop-blur-[1px] flex items-center justify-center p-1.5 shadow-sm select-none`}
        style={{
          borderColor: definition.colorHex,
          color: definition.colorHex,
          opacity,
          transform: compact
            ? undefined
            : `scale(${effectiveScale}) rotate(${definition.defaultRotationDeg}deg)`,
        }}
      >
        <div
          className="w-full h-full rounded-full border border-dashed flex flex-col items-center justify-center text-center px-1.5"
          style={{ borderColor: definition.colorHex }}
        >
          {definition.showEmblem && (
            <AshokaSealWheel
              colorHex={definition.colorHex}
              className={compact ? 'w-3.5 h-3.5 mb-0.5' : 'w-4 h-4 mb-0.5'}
            />
          )}
          <span className="text-[7px] font-bold tracking-[0.12em] uppercase leading-tight opacity-85 line-clamp-1">
            GOVT. OF INDIA
          </span>
          <span
            className={`${
              compact ? 'text-[9px]' : 'text-[11px]'
            } font-black tracking-wider uppercase leading-tight my-0.5`}
          >
            {definition.label}
          </span>
          <span className="text-[7px] font-mono font-semibold leading-tight line-clamp-1">
            {officerName}
          </span>
          <span className="text-[7px] font-mono tabular-nums opacity-85">
            {dateLabel}
          </span>
        </div>
      </div>
    );
  }

  if (definition.shape === 'oval-emblem') {
    return (
      <div
        className={`${animated ? 'animate-karta-stamp' : ''} ${
          compact ? 'px-3 py-1.5 min-w-[140px]' : 'px-5 py-2.5 min-w-[210px]'
        } rounded-full border-[2.5px] bg-white/88 backdrop-blur-[1px] shadow-sm text-center select-none`}
        style={{
          borderColor: definition.colorHex,
          color: definition.colorHex,
          opacity,
          transform: compact
            ? undefined
            : `scale(${effectiveScale}) rotate(${definition.defaultRotationDeg}deg)`,
        }}
      >
        <div
          className="rounded-full border border-dashed px-3 py-1 flex flex-col items-center gap-0.5"
          style={{ borderColor: definition.colorHex }}
        >
          <div className="flex items-center gap-1">
            {definition.showEmblem && (
              <AshokaSealWheel colorHex={definition.colorHex} className="w-3 h-3" />
            )}
            <span className="text-[8px] font-bold tracking-[0.14em] uppercase opacity-85">
              {definition.subtitle}
            </span>
          </div>
          <p
            className={`${
              compact ? 'text-[10px]' : 'text-sm'
            } font-black tracking-wider uppercase whitespace-nowrap`}
          >
            {definition.label}
          </p>
          <p className="text-[8px] font-mono font-semibold tabular-nums whitespace-nowrap">
            {officerName} · {dateLabel}
            {referenceNo ? ` · ${referenceNo}` : ''}
          </p>
        </div>
      </div>
    );
  }

  // Double-box official rectangular ink stamp
  return (
    <div
      className={`${animated ? 'animate-karta-stamp' : ''} ${
        compact ? 'px-2.5 py-1.5' : 'px-4 py-2.5'
      } rounded-md border-[2.5px] bg-white/88 backdrop-blur-[1px] shadow-sm text-center select-none`}
      style={{
        borderColor: definition.colorHex,
        color: definition.colorHex,
        opacity,
        transform: compact
          ? undefined
          : `scale(${effectiveScale}) rotate(${definition.defaultRotationDeg}deg)`,
      }}
    >
      <div
        className={`border border-dashed ${
          compact ? 'px-2 py-1' : 'px-3 py-1.5'
        } rounded-xs space-y-0.5`}
        style={{ borderColor: definition.colorHex }}
      >
        <p
          className={`${
            compact ? 'text-[7px]' : 'text-[9px]'
          } font-bold tracking-[0.16em] uppercase opacity-85 whitespace-nowrap`}
        >
          {definition.authorityLine}
        </p>
        <p
          className={`${
            compact ? 'text-[11px]' : 'text-sm sm:text-base'
          } font-black tracking-wider uppercase whitespace-nowrap`}
        >
          {definition.label}
        </p>
        <p
          className={`${
            compact ? 'text-[7.5px]' : 'text-[9.5px]'
          } font-mono font-semibold tabular-nums whitespace-nowrap`}
        >
          {officerName} · {dateLabel}
          {referenceNo ? ` · ${referenceNo}` : ''}
        </p>
      </div>
    </div>
  );
};

export interface GoIStampLibraryProps {
  activeStamp: KartaStampMetadata | null;
  officerName: string;
  onOfficerNameChange: (val: string) => void;
  referenceNo: string;
  onReferenceNoChange: (val: string) => void;
  position: KartaStampMetadata['position'];
  onPositionChange: (pos: KartaStampMetadata['position']) => void;
  stampScale: number;
  onStampScaleChange: (scale: number) => void;
  stampOpacity: number;
  onStampOpacityChange: (opacity: number) => void;
  applyAllPages: boolean;
  onApplyAllPagesChange: (all: boolean) => void;
  onSelectStamp: (def: GoIStampDefinition) => void;
  onClearStamp: () => void;
}

export const GoIStampLibrary: React.FC<GoIStampLibraryProps> = ({
  activeStamp,
  officerName,
  onOfficerNameChange,
  referenceNo,
  onReferenceNoChange,
  position,
  onPositionChange,
  stampScale,
  onStampScaleChange,
  stampOpacity,
  onStampOpacityChange,
  applyAllPages,
  onApplyAllPagesChange,
  onSelectStamp,
  onClearStamp,
}) => {
  const [category, setCategory] = useState<GoIStampCategory>('all');
  const [query, setQuery] = useState<string>('');

  const filteredStamps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GOI_STAMP_CATALOG.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.authorityLine.toLowerCase().includes(q) ||
        item.actReference.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const activeDef = activeStamp ? getGoIStampById(activeStamp.presetId) : null;

  return (
    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
      {/* Header Row & Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#202124] dark:text-white">
            <Stamp className="w-4 h-4 text-[#FF671F]" />
            <span>Government of India Official Stamp Library</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400 tabular-nums">
              {GOI_STAMP_CATALOG.length} statutory &amp; office seals
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Select any official seal below to stamp the active page with ink-slam animation and vector PDF embedding.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Verified, Draft, Evidence Act..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[#202124] dark:text-slate-100 w-56 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/40"
            />
          </div>

          {activeStamp && (
            <button
              type="button"
              onClick={onClearStamp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Stamp
            </button>
          )}
        </div>
      </div>

      {/* Category Segmented Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
        {GOI_STAMP_CATEGORY_TABS.map((tab) => {
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white dark:bg-slate-800 text-[#202124] dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-[#202124] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Stamp Gallery Grid */}
      {filteredStamps.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
          No Government of India stamp matches &ldquo;{query}&rdquo;. Clear the filter to browse all seals.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {filteredStamps.map((def) => {
            const isSelected = activeDef?.id === def.id && Boolean(activeStamp);
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => onSelectStamp(def)}
                className={`group text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-[#FF671F] bg-[#FFF8F4] dark:bg-orange-950/25 ring-1 ring-[#FF671F]'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <div className="h-24 w-full rounded-lg bg-[#FFFDF8] border border-stone-200/80 flex items-center justify-center overflow-hidden px-1">
                  <GoIStampPreview
                    definition={def}
                    officerName={officerName || 'DIP Authorized Desk'}
                    referenceNo={referenceNo || undefined}
                    compact
                  />
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-[#202124] dark:text-white truncate">
                      {def.label}
                    </span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#FF671F] shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {def.actReference} · {def.shape.replace('-', ' ')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Stamp Customization & Placement Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Officer / Issuing Desk
          </label>
          <input
            type="text"
            value={officerName}
            onChange={(e) => onOfficerNameChange(e.target.value)}
            placeholder="DIP Authorized Desk"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Docket / Ref No. (Optional)
          </label>
          <input
            type="text"
            value={referenceNo}
            onChange={(e) => onReferenceNoChange(e.target.value)}
            placeholder="e.g. DIP/2026/041"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100 font-mono"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Overlay Position
          </label>
          <select
            value={position}
            onChange={(e) =>
              onPositionChange(e.target.value as KartaStampMetadata['position'])
            }
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100"
          >
            <option value="top-right">Top Right</option>
            <option value="center">Center Watermark</option>
            <option value="bottom-right">Bottom Right Seal</option>
            <option value="bottom-left">Bottom Left Seal</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Seal Scale
          </label>
          <select
            value={String(stampScale)}
            onChange={(e) => onStampScaleChange(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100 tabular-nums"
          >
            <option value="0.82">Compact (82%)</option>
            <option value="1">Standard (100%)</option>
            <option value="1.18">Large (118%)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Ink Opacity
          </label>
          <select
            value={String(stampOpacity)}
            onChange={(e) => onStampOpacityChange(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-[#202124] dark:text-slate-100 tabular-nums"
          >
            <option value="0.7">Watermark (70%)</option>
            <option value="0.88">Standard Ink (88%)</option>
            <option value="1">Solid Seal (100%)</option>
          </select>
        </div>

        <div className="flex items-end">
          <label className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-[#202124] dark:text-slate-100 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyAllPages}
              onChange={(e) => onApplyAllPagesChange(e.target.checked)}
              className="rounded border-slate-300 text-[#FF671F] focus:ring-[#FF671F]"
            />
            <span>Stamp All PDF Pages</span>
          </label>
        </div>
      </div>
    </div>
  );
};
