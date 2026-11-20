import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Scale, X } from 'lucide-react';
import { LegalGlossaryEntry, scanTextForLegalTerms } from '../shared/legalGlossary';

export interface ActiveLegalTooltip {
  entry: LegalGlossaryEntry;
  matchedText: string;
  anchorRect: {
    top: number;
    bottom: number;
    left: number;
    width: number;
  };
}

interface TextProps {
  text: string;
  enabled: boolean;
  onActivateTerm: (tooltip: ActiveLegalTooltip) => void;
  onScheduleClose: () => void;
}

export function LegalTermHighlightedText({
  text,
  enabled,
  onActivateTerm,
  onScheduleClose,
}: TextProps) {
  if (!enabled) {
    return <>{text}</>;
  }

  const slices = scanTextForLegalTerms(text);
  if (slices.length === 1 && !slices[0].entry) {
    return <>{text}</>;
  }

  const triggerFromElement = (el: HTMLElement, entry: LegalGlossaryEntry, matchedText: string) => {
    const rect = el.getBoundingClientRect();
    onActivateTerm({
      entry,
      matchedText,
      anchorRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
      },
    });
  };

  return (
    <>
      {slices.map((slice, idx) =>
        slice.entry ? (
          <span
            key={idx}
            role="button"
            tabIndex={0}
            aria-label={`Legal term definition: ${slice.text}`}
            onMouseEnter={(e) => triggerFromElement(e.currentTarget, slice.entry!, slice.text)}
            onMouseLeave={onScheduleClose}
            onFocus={(e) => triggerFromElement(e.currentTarget, slice.entry!, slice.text)}
            onBlur={onScheduleClose}
            onClick={(e) => {
              e.stopPropagation();
              triggerFromElement(e.currentTarget, slice.entry!, slice.text);
            }}
            className="border-b border-dotted border-[#1B365D]/55 text-[#1B365D] hover:bg-[#EFF6FF] focus:bg-[#EFF6FF] focus:outline-none rounded-xs px-0.5 -mx-0.5 cursor-help transition-colors print:border-0 print:text-inherit print:bg-transparent print:px-0 print:mx-0"
          >
            {slice.text}
          </span>
        ) : (
          <Fragment key={idx}>{slice.text}</Fragment>
        )
      )}
    </>
  );
}

interface PopoverProps {
  tooltip: ActiveLegalTooltip | null;
  onKeepOpen: () => void;
  onClose: () => void;
}

export function LegalTermTooltipOverlay({ tooltip, onKeepOpen, onClose }: PopoverProps) {
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const sync = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  if (!tooltip) return null;

  const cardWidth = Math.min(340, viewportSize.w - 24);
  const centerX = tooltip.anchorRect.left + tooltip.anchorRect.width / 2;
  const clampedLeft = Math.max(
    12,
    Math.min(viewportSize.w - cardWidth - 12, centerX - cardWidth / 2)
  );

  // Prefer displaying above the hovered phrase unless near the top edge
  const showBelow = tooltip.anchorRect.top < 220;
  const topPos = showBelow
    ? Math.min(viewportSize.h - 210, tooltip.anchorRect.bottom + 8)
    : undefined;
  const bottomPos = !showBelow ? viewportSize.h - tooltip.anchorRect.top + 8 : undefined;

  return (
    <div
      role="tooltip"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onClose}
      style={{
        position: 'fixed',
        left: `${clampedLeft}px`,
        top: topPos !== undefined ? `${topPos}px` : undefined,
        bottom: bottomPos !== undefined ? `${bottomPos}px` : undefined,
        width: `${cardWidth}px`,
        zIndex: 60,
      }}
      className="bg-[#FFFEFA] border border-[#1B365D]/35 rounded-lg shadow-[0_12px_30px_rgba(27,54,93,0.2)] overflow-hidden text-left print:hidden"
    >
      <div className="bg-[#1B365D] text-white px-3.5 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Scale className="w-3.5 h-3.5 text-[#FCD34D] shrink-0" />
          <span className="text-xs font-semibold truncate">{tooltip.entry.term}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close legal term definition"
          className="text-white/75 hover:text-white p-0.5 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-tabular text-[#0F766E] font-medium">
          <span>{tooltip.entry.category}</span>
          <span className="text-[#78716C]">Matched: &ldquo;{tooltip.matchedText}&rdquo;</span>
        </div>

        <p className="text-[#1C1917] leading-relaxed">{tooltip.entry.plainEnglish}</p>

        <div className="pt-2 border-t border-[#E5DFD3] flex items-start gap-1.5 text-[11px] text-[#57534E]">
          <BookOpen className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong className="text-[#1C1917] font-semibold">Indian Legal Context: </strong>
            {tooltip.entry.indianContext}
          </p>
        </div>
      </div>
    </div>
  );
}

export function useLegalTermTooltipState() {
  const [activeTooltip, setActiveTooltip] = useState<ActiveLegalTooltip | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const activateTerm = useCallback(
    (tooltip: ActiveLegalTooltip) => {
      clearTimer();
      setActiveTooltip(tooltip);
    },
    [clearTimer]
  );

  const scheduleClose = useCallback(() => {
    clearTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveTooltip(null);
    }, 180);
  }, [clearTimer]);

  const closeImmediately = useCallback(() => {
    clearTimer();
    setActiveTooltip(null);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    activeTooltip,
    activateTerm,
    scheduleClose,
    keepOpen: clearTimer,
    closeImmediately,
  };
}
