import { Fragment, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Columns2, Layers } from 'lucide-react';
import { EStampConfig, SignatureConfig } from '../shared/types';
import { getStampBackgroundPattern } from '../../assets/stamp-papers';
import {
  LegalBlock,
  PreviewSegment,
  paginateLegalBlocks,
  parseLegalBlocks,
} from '../shared/legalTypesetter';
import { EStampSimulationOverlay } from './EStampSimulationOverlay';
import { DigitalSignatureAreaPreview } from './DigitalSignatureArea';
import {
  ActiveLegalTooltip,
  LegalTermHighlightedText,
  LegalTermTooltipOverlay,
  useLegalTermTooltipState,
} from './LegalTermTooltipOverlay';

export type { PreviewSegment };

interface Props {
  segments: PreviewSegment[];
  highlightReplaced: boolean;
  showLegalTermHelper?: boolean;
  showStampOverlay: boolean;
  showSignatureArea: boolean;
  eStamp: EStampConfig;
  signature: SignatureConfig;
  jurisdictionState?: string;
  executionDate?: string;
  documentTitle: string;
  categoryGroup?: string;
  firstPartyFallback?: string;
  secondPartyFallback?: string;
  schemaSummary?: string;
  onQuickUpdateStamp: (patch: Partial<EStampConfig>) => void;
  onDismissStamp: () => void;
  onOpenStampSignStep: () => void;
}

interface TermRenderHooks {
  enabled: boolean;
  onActivateTerm: (tooltip: ActiveLegalTooltip) => void;
  onScheduleClose: () => void;
}

function renderSpanTextWithPlaceholders(
  text: string,
  isReplaced: boolean,
  highlightReplaced: boolean,
  termHooks: TermRenderHooks
) {
  if (isReplaced) {
    if (highlightReplaced) {
      return (
        <mark className="bg-[#FEF3C7]/85 text-[#1B365D] border-b border-[#D97706]/65 px-1 rounded-xs font-medium">
          {text}
        </mark>
      );
    }
    return <span className="font-medium text-[#1C1917]">{text}</span>;
  }

  // Highlight unfilled [Bracket Placeholders] subtly so the user can spot uncompleted fields
  const parts = text.split(/(\[[A-Za-z0-9\s\/,'().-]{2,60}\])/g);
  if (parts.length === 1) {
    return (
      <LegalTermHighlightedText
        text={text}
        enabled={termHooks.enabled}
        onActivateTerm={termHooks.onActivateTerm}
        onScheduleClose={termHooks.onScheduleClose}
      />
    );
  }

  return (
    <>
      {parts.map((part, idx) =>
        part.startsWith('[') && part.endsWith(']') ? (
          <span
            key={idx}
            className="text-[#9A3412] bg-[#FFFBEB] px-1 border-b border-dashed border-[#D97706]/60 font-medium text-[0.94em]"
          >
            {part}
          </span>
        ) : (
          <LegalTermHighlightedText
            key={idx}
            text={part}
            enabled={termHooks.enabled}
            onActivateTerm={termHooks.onActivateTerm}
            onScheduleClose={termHooks.onScheduleClose}
          />
        )
      )}
    </>
  );
}

function renderInlineSpans(
  spans: PreviewSegment[],
  highlightReplaced: boolean,
  termHooks: TermRenderHooks
) {
  return spans.map((span, idx) => (
    <Fragment key={idx}>
      {renderSpanTextWithPlaceholders(span.text, span.replaced, highlightReplaced, termHooks)}
    </Fragment>
  ));
}

function renderStyledLegalBlock(
  block: LegalBlock,
  highlightReplaced: boolean,
  termHooks: TermRenderHooks
) {
  switch (block.kind) {
    case 'court_caption':
      return (
        <p
          key={block.id}
          className="text-center font-editorial font-bold text-[14.5px] tracking-[0.04em] text-[#1B365D] leading-snug"
        >
          {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
        </p>
      );

    case 'instrument_title':
      return (
        <div key={block.id} className="pt-2 pb-3 mb-2 border-b-2 border-double border-[#C7BFA9] text-center">
          <h2 className="font-editorial font-bold text-[18px] sm:text-[19px] tracking-[0.06em] uppercase text-[#1C1917] leading-snug">
            {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
          </h2>
        </div>
      );

    case 'cause_versus':
      return (
        <div key={block.id} className="py-1.5 text-center">
          <span className="font-editorial italic font-bold text-[13px] tracking-[0.18em] text-[#57534E]">
            — VERSUS —
          </span>
        </div>
      );

    case 'cause_party':
      return (
        <div
          key={block.id}
          className="flex items-baseline justify-between gap-3 py-0.5 font-editorial text-[14.5px] text-[#1C1917]"
        >
          <div className="min-w-0 flex-1">
            {renderInlineSpans(block.partyLeft || block.spans, highlightReplaced, termHooks)}
          </div>
          <span
            aria-hidden="true"
            className="hidden sm:inline-block flex-1 max-w-[120px] border-b border-dotted border-[#C7BFA9] mx-2"
          />
          <span className="font-semibold italic text-[#1B365D] shrink-0 text-right">
            … {block.partyRole}
          </span>
        </div>
      );

    case 'salutation':
      return (
        <p
          key={block.id}
          className="font-editorial font-semibold italic text-[14.5px] text-[#1B365D] pt-1.5 pb-1 leading-relaxed"
        >
          {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
        </p>
      );

    case 'section_heading':
      return (
        <div key={block.id} className="pt-3 pb-1.5">
          <h3 className="font-editorial font-bold text-[13.5px] tracking-[0.08em] uppercase text-[#1B365D] border-y border-[#E5DFD3] py-1.5 text-center">
            {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
          </h3>
        </div>
      );

    case 'recital_clause':
      return (
        <p
          key={block.id}
          className="font-editorial text-[14.8px] leading-[1.78] text-[#1C1917] text-justify pt-1"
        >
          {block.leadKeyword && (
            <strong className="font-bold tracking-[0.03em] text-[#1B365D] mr-1.5">
              {block.leadKeyword}
            </strong>
          )}
          {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
        </p>
      );

    case 'numbered_clause':
      return (
        <div
          key={block.id}
          className="grid grid-cols-[2.3rem_1fr] gap-1.5 items-baseline font-editorial text-[14.8px] leading-[1.78] text-[#1C1917] pt-0.5"
        >
          <span className="font-bold text-[#1B365D] tabular-nums select-none">
            {block.clauseMarker}
          </span>
          <p className="text-justify min-w-0">
            {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
          </p>
        </div>
      );

    case 'sub_clause':
      return (
        <div
          key={block.id}
          className="pl-7 grid grid-cols-[2rem_1fr] gap-1.5 items-baseline font-editorial text-[14.5px] leading-[1.75] text-[#292524]"
        >
          <span className="font-semibold text-[#57534E] select-none">
            {block.clauseMarker}
          </span>
          <p className="text-justify min-w-0">
            {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
          </p>
        </div>
      );

    case 'verification_block':
      return (
        <div
          key={block.id}
          className="pt-3 mt-2 border-t border-dashed border-[#D6CEBE] font-editorial text-[14.5px] leading-[1.75] text-[#1C1917] text-justify"
        >
          {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
        </div>
      );

    default:
      return (
        <p
          key={block.id}
          className="font-editorial text-[14.8px] leading-[1.78] text-[#1C1917] text-justify"
        >
          {renderInlineSpans(block.spans, highlightReplaced, termHooks)}
        </p>
      );
  }
}

export function FlippableDocumentPreview({
  segments,
  highlightReplaced,
  showLegalTermHelper = true,
  showStampOverlay,
  showSignatureArea,
  eStamp,
  signature,
  jurisdictionState,
  executionDate,
  documentTitle,
  categoryGroup,
  firstPartyFallback,
  secondPartyFallback,
  schemaSummary,
  onQuickUpdateStamp,
  onDismissStamp,
  onOpenStampSignStep,
}: Props) {
  const [viewMode, setViewMode] = useState<'flip' | 'spread' | 'scroll'>('flip');
  const [currentPage, setCurrentPage] = useState(0);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const { activeTooltip, activateTerm, scheduleClose, keepOpen, closeImmediately } =
    useLegalTermTooltipState();

  const termHooks: TermRenderHooks = {
    enabled: showLegalTermHelper,
    onActivateTerm: activateTerm,
    onScheduleClose: scheduleClose,
  };

  const blocks = useMemo(() => parseLegalBlocks(segments), [segments]);

  const pages = useMemo(
    () => paginateLegalBlocks(blocks, showStampOverlay, showSignatureArea),
    [blocks, showStampOverlay, showSignatureArea]
  );

  const hasExplicitTitleOnPage1 = useMemo(
    () =>
      blocks
        .slice(0, 3)
        .some((b) => b.kind === 'instrument_title' || b.kind === 'court_caption'),
    [blocks]
  );

  useEffect(() => {
    if (currentPage >= pages.length) {
      setCurrentPage(Math.max(0, pages.length - 1));
    }
  }, [pages.length, currentPage]);

  const goToPage = (target: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, target));
    if (clamped === currentPage) return;
    setFlipDirection(clamped > currentPage ? 'next' : 'prev');
    setCurrentPage(clamped);
  };

  useEffect(() => {
    if ((viewMode !== 'flip' && viewMode !== 'spread') || pages.length <= 1) return;
    const step = viewMode === 'spread' ? 2 : 1;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        goToPage(currentPage + step);
      } else if (e.key === 'ArrowLeft') {
        goToPage(currentPage - step);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, pages.length, currentPage]);

  const activePattern = getStampBackgroundPattern(eStamp.backgroundPattern);
  const applyFullPagePattern =
    Boolean(activePattern.url) && eStamp.backgroundScope === 'full_page';

  const renderPageSheet = (
    pageBlocks: LegalBlock[],
    pageIdx: number,
    compactSpread = false
  ) => {
    const isFirstPage = pageIdx === 0;
    const isLastPage = pageIdx === pages.length - 1;
    const hasNextPage = pageIdx < pages.length - 1;

    return (
      <article
        key={`${pageIdx}-${pages.length}`}
        aria-label={`Document page ${pageIdx + 1} of ${pages.length}`}
        className={`relative bg-[#FFFEFA] border border-[#C7BFA9] rounded-sm shadow-[0_8px_24px_rgba(27,54,93,0.12)] ${
          compactSpread
            ? 'pl-7 pr-5 py-6 min-h-[680px]'
            : 'pl-9 pr-6 py-7 md:pl-14 md:pr-11 md:py-9 min-h-[780px]'
        } flex flex-col justify-between transition-all duration-200 overflow-hidden print:bg-white print:shadow-none print:border-0 print:min-h-0 print:break-after-page ${
          viewMode === 'flip'
            ? flipDirection === 'next'
              ? 'animate-[pageTurnNext_0.28s_cubic-bezier(0.16,1,0.3,1)]'
              : 'animate-[pageTurnPrev_0.28s_cubic-bezier(0.16,1,0.3,1)]'
            : ''
        }`}
      >
        {/* Optional Full-Page High-Resolution Stamp Paper Security Pattern */}
        {applyFullPagePattern && activePattern.url && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-55 print:opacity-35"
            style={{
              backgroundImage: `url("${activePattern.url}")`,
              backgroundSize: '360px 360px',
              backgroundRepeat: 'repeat',
            }}
          />
        )}

        {/* Authentic Advocate Legal Paper Left Margin Hairline */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-0 bottom-0 ${
            compactSpread ? 'left-5' : 'left-6 md:left-10'
          } w-px bg-[#E6C5BE]`}
        />

        {/* Top-Right Physical Page Edge Corner */}
        <div
          aria-hidden="true"
          className="hidden sm:block pointer-events-none absolute top-0 right-0 w-7 h-7 bg-gradient-to-bl from-[#E9E5DC] via-[#F5F2EB] to-[#FFFEFA] border-b border-l border-[#D6CEBE] print:hidden"
        />

        <div className="relative space-y-4">
          {/* Running Official Legal Folio Header */}
          <div className="border-b border-[#E5DFD3] pb-2.5 text-[11px] text-[#57534E] flex flex-wrap justify-between gap-2">
            <span className="font-medium text-[#57534E]">
              {categoryGroup ? `${categoryGroup} · ` : ''}
              Draft Copy (Not Executed)
            </span>
            <span className="font-mono-tabular font-semibold text-[#1B365D] shrink-0">
              Page {pageIdx + 1} of {pages.length} · State:{' '}
              {jurisdictionState || eStamp.state || 'Not Specified'} · Date:{' '}
              {executionDate || 'Not Specified'}
            </span>
          </div>

          {/* E-Stamp Simulation Header Facsimile on Page 1 */}
          {isFirstPage && showStampOverlay && (
            <EStampSimulationOverlay
              eStamp={eStamp}
              jurisdictionState={jurisdictionState}
              executionDate={executionDate}
              documentTitle={documentTitle}
              firstPartyFallback={firstPartyFallback}
              secondPartyFallback={secondPartyFallback}
              onQuickUpdate={onQuickUpdateStamp}
              onOpenFullConfig={onOpenStampSignStep}
              onDismiss={onDismissStamp}
            />
          )}

          {/* Fallback Formal Instrument Title Masthead if source starts directly with prose */}
          {isFirstPage && !hasExplicitTitleOnPage1 && (
            <div className="pt-1 pb-3 mb-2 border-b-2 border-double border-[#C7BFA9] text-center space-y-1">
              <h2 className="font-editorial font-bold text-[18px] sm:text-[19px] tracking-[0.06em] uppercase text-[#1C1917] leading-snug">
                {documentTitle}
              </h2>
              <p className="text-[11px] font-mono-tabular text-[#78716C]">
                Jurisdiction: {jurisdictionState || eStamp.state || 'State Not Specified'} · Dated:{' '}
                {executionDate || 'Date Not Specified'}
              </p>
            </div>
          )}

          {/* Typeset Expert Legal Clauses */}
          <div className="space-y-2.5">
            {pageBlocks.map((block) => renderStyledLegalBlock(block, highlightReplaced, termHooks))}
          </div>
        </div>

        {/* Bottom Area: Digital Signature Area on Final Page + Running Legal Folio */}
        <div className="relative pt-6 space-y-4">
          {isLastPage && showSignatureArea && (
            <DigitalSignatureAreaPreview
              signature={signature}
              executionDate={executionDate}
              schemaSummary={schemaSummary}
              onConfigureClick={onOpenStampSignStep}
            />
          )}

          <div className="border-t border-[#E5DFD3] pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#57534E]">
            <span className="font-medium text-[#1B365D] truncate max-w-[60%]">{documentTitle}</span>
            <span className="shrink-0">
              Page {pageIdx + 1} of {pages.length} · Draft Copy (Not Notarized, e-Stamped, or Registered)
            </span>
          </div>
        </div>

        {/* Clickable Tactile Page-Turn Curl Corner in Flipbook Mode */}
        {viewMode === 'flip' && hasNextPage && (
          <button
            type="button"
            onClick={() => goToPage(pageIdx + 1)}
            title="Flip to next sheet"
            aria-label="Flip to next sheet"
            className="group absolute bottom-0 right-0 w-10 h-10 bg-gradient-to-tl from-[#D6CEBE] via-[#F3EFE7] to-transparent hover:from-[#1B365D]/20 border-t border-l border-[#C7BFA9]/80 transition-colors print:hidden"
          >
            <ChevronRight className="w-3.5 h-3.5 text-[#57534E] group-hover:text-[#1B365D] absolute bottom-1.5 right-1.5" />
          </button>
        )}
      </article>
    );
  };

  const pageNumbers = useMemo(() => {
    const total = pages.length;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    const set = new Set<number>([0, total - 1, currentPage]);
    if (currentPage > 0) set.add(currentPage - 1);
    if (currentPage < total - 1) set.add(currentPage + 1);
    return Array.from(set).sort((a, b) => a - b);
  }, [pages.length, currentPage]);

  const spreadLeftIdx = currentPage % 2 === 0 ? currentPage : currentPage - 1;
  const spreadRightIdx = spreadLeftIdx + 1 < pages.length ? spreadLeftIdx + 1 : null;

  return (
    <div className="space-y-3">
      {/* Legal Flipbook Control Ribbon */}
      <div className="bg-[#1B365D] text-white rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#FCD34D] shrink-0" />
          <span className="text-xs font-semibold">
            {viewMode === 'flip'
              ? `Sheet ${currentPage + 1} of ${pages.length} · Flipbook View`
              : viewMode === 'spread'
              ? `Pages ${spreadLeftIdx + 1}${spreadRightIdx !== null ? `–${spreadRightIdx + 1}` : ''} of ${pages.length} · Spread`
              : `All ${pages.length} Counsel-Typeset Sheets`}
          </span>
        </div>

        {viewMode !== 'scroll' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - (viewMode === 'spread' ? 2 : 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 disabled:opacity-35 rounded transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>

            <div className="hidden sm:flex items-center gap-1 px-1">
              {pageNumbers.map((pIdx, arrIdx) => {
                const prevNum = arrIdx > 0 ? pageNumbers[arrIdx - 1] : null;
                const needsEllipsis = prevNum !== null && pIdx - prevNum > 1;
                const isActive =
                  viewMode === 'spread'
                    ? pIdx === spreadLeftIdx || pIdx === spreadRightIdx
                    : pIdx === currentPage;
                return (
                  <Fragment key={pIdx}>
                    {needsEllipsis && <span className="text-xs text-white/60 px-1">…</span>}
                    <button
                      type="button"
                      onClick={() => goToPage(pIdx)}
                      className={`w-7 h-7 text-xs font-mono-tabular rounded transition-colors ${
                        isActive
                          ? 'bg-[#EA580C] text-white font-bold'
                          : 'bg-white/10 text-white/85 hover:bg-white/20'
                      }`}
                    >
                      {pIdx + 1}
                    </button>
                  </Fragment>
                );
              })}
            </div>

            <button
              type="button"
              disabled={
                viewMode === 'spread'
                  ? spreadLeftIdx + 2 >= pages.length
                  : currentPage >= pages.length - 1
              }
              onClick={() => goToPage(currentPage + (viewMode === 'spread' ? 2 : 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 disabled:opacity-35 rounded transition-colors"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="inline-flex items-center bg-white/10 rounded p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('flip')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              viewMode === 'flip' ? 'bg-white text-[#1B365D] font-semibold' : 'text-white/85'
            }`}
          >
            Flipbook
          </button>
          <button
            type="button"
            onClick={() => setViewMode('spread')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              viewMode === 'spread' ? 'bg-white text-[#1B365D] font-semibold' : 'text-white/85'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            2-Page Spread
          </button>
          <button
            type="button"
            onClick={() => setViewMode('scroll')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors whitespace-nowrap ${
              viewMode === 'scroll' ? 'bg-white text-[#1B365D] font-semibold' : 'text-white/85'
            }`}
          >
            <Layers className="w-3 h-3" />
            All Pages
          </button>
        </div>
      </div>

      {/* Archival Legal Desk Surface */}
      <div className="bg-[#E8E3D8] border border-[#D6CEBE] rounded-lg p-3 sm:p-5 space-y-6 print:bg-white print:border-0 print:p-0">
        {viewMode === 'flip' ? (
          <>
            {/* Physical Stacked Paper Deck Effect beneath Active Sheet */}
            <div className="relative pb-2 pr-2">
              {pages.length > 2 && currentPage < pages.length - 2 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 bg-[#F5F1E8] border border-[#C7BFA9] rounded-sm print:hidden"
                />
              )}
              {pages.length > 1 && currentPage < pages.length - 1 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 bg-[#FAF7F0] border border-[#C7BFA9] rounded-sm print:hidden"
                />
              )}
              <div className="relative">
                {renderPageSheet(pages[currentPage] || [], currentPage)}
              </div>
            </div>

            {pages.length > 1 && (
              <div className="flex items-center justify-between gap-3 pt-1 print:hidden">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => goToPage(currentPage - 1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#C7BFA9] rounded-md text-[#1C1917] hover:bg-[#FCFBF7] disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous Sheet
                </button>
                <span className="text-xs font-mono-tabular text-[#57534E]">
                  Sheet {currentPage + 1} of {pages.length} · Use ← / → keys or corner curl
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pages.length - 1}
                  onClick={() => goToPage(currentPage + 1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#1B365D] text-white rounded-md hover:bg-[#13294B] disabled:opacity-40"
                >
                  Flip to Next Sheet
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        ) : viewMode === 'spread' ? (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
              {renderPageSheet(pages[spreadLeftIdx] || [], spreadLeftIdx, true)}
              {spreadRightIdx !== null ? (
                renderPageSheet(pages[spreadRightIdx] || [], spreadRightIdx, true)
              ) : (
                <div className="hidden xl:flex flex-col items-center justify-center bg-[#F4F0E6] border border-dashed border-[#C7BFA9] rounded-sm p-8 text-center text-xs text-[#78716C]">
                  End of Legal Instrument · {pages.length} Total {pages.length === 1 ? 'Sheet' : 'Sheets'}
                </div>
              )}
            </div>

            {pages.length > 2 && (
              <div className="flex items-center justify-between gap-3 pt-1 print:hidden">
                <button
                  type="button"
                  disabled={spreadLeftIdx === 0}
                  onClick={() => goToPage(spreadLeftIdx - 2)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#C7BFA9] rounded-md text-[#1C1917] hover:bg-[#FCFBF7] disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous Spread
                </button>
                <span className="text-xs font-mono-tabular text-[#57534E]">
                  Pages {spreadLeftIdx + 1}
                  {spreadRightIdx !== null ? `–${spreadRightIdx + 1}` : ''} of {pages.length}
                </span>
                <button
                  type="button"
                  disabled={spreadLeftIdx + 2 >= pages.length}
                  onClick={() => goToPage(spreadLeftIdx + 2)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#1B365D] text-white rounded-md hover:bg-[#13294B] disabled:opacity-40"
                >
                  Next Spread
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        ) : (
          pages.map((pBlocks, idx) => renderPageSheet(pBlocks, idx))
        )}
      </div>

      {/* Floating Viewport-Clamped Legal Terminology Helper Overlay */}
      <LegalTermTooltipOverlay
        tooltip={activeTooltip}
        onKeepOpen={keepOpen}
        onClose={closeImmediately}
      />
    </div>
  );
}
