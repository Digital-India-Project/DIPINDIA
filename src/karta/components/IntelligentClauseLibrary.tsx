import { useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  PlusCircle,
  Search,
  Sparkles,
  Undo2,
} from 'lucide-react';
import {
  ClauseContextHints,
  SuggestedClauseItem,
  getSuggestedClausesForDocument,
  injectClauseIntoDraft,
} from '../shared/clauseLibrary';

interface Props {
  categoryGroup: string;
  rawCategory?: string;
  documentTitle: string;
  activeContent: string;
  hints: ClauseContextHints;
  canUndo: boolean;
  onInjectClause: (nextContent: string, clauseTitle: string, assignedNumber: number | null) => void;
  onUndoLastInjection: () => void;
}

const TOPIC_FILTERS = [
  'All Suggested',
  'Indemnity',
  'Force Majeure',
  'Termination',
  'Dispute & Arbitration',
  'Property & Possession',
  'Verification & Statutory',
] as const;

export function IntelligentClauseLibrary({
  categoryGroup,
  rawCategory,
  documentTitle,
  activeContent,
  hints,
  canUndo,
  onInjectClause,
  onUndoLastInjection,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('All Suggested');
  const [expandedClauseId, setExpandedClauseId] = useState<string | null>(null);
  const [recentlyInjectedId, setRecentlyInjectedId] = useState<string | null>(null);

  const suggestedClauses = useMemo(
    () =>
      getSuggestedClausesForDocument({
        categoryGroup,
        rawCategory,
        title: documentTitle,
        content: activeContent,
        hints,
      }),
    [categoryGroup, rawCategory, documentTitle, activeContent, hints]
  );

  const recommendedMissingCount = useMemo(
    () =>
      suggestedClauses.filter((c) => c.isRecommendedForCategory && !c.alreadyPresentInDraft).length,
    [suggestedClauses]
  );

  const filteredClauses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return suggestedClauses.filter((c) => {
      if (topicFilter !== 'All Suggested' && c.topic !== topicFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.statutoryBasis.toLowerCase().includes(q) ||
        c.topic.toLowerCase().includes(q)
      );
    });
  }, [suggestedClauses, searchQuery, topicFilter]);

  const handleInject = (clause: SuggestedClauseItem) => {
    const { nextContent, assignedNumber } = injectClauseIntoDraft(
      activeContent,
      clause.heading,
      clause.renderedBody
    );
    onInjectClause(nextContent, clause.title, assignedNumber);
    setRecentlyInjectedId(clause.id);
    window.setTimeout(() => {
      setRecentlyInjectedId((curr) => (curr === clause.id ? null : curr));
    }, 2400);
  };

  return (
    <section
      aria-label="Intelligent Clause Library"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
    >
      {/* Header / Toggle Bar */}
      <div className="px-4 py-3 bg-[#F7F8FA] border-b border-slate-200 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
        >
          <BookMarked className="w-4 h-4 text-[#FF671F] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#202124]">
                Intelligent Clause Library
              </span>
              <span className="text-[11px] font-mono-tabular text-[#138808] font-medium">
                {recommendedMissingCount > 0
                  ? `${recommendedMissingCount} suggested for ${categoryGroup}`
                  : `${categoryGroup} clauses`}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 truncate">
              Context-aware Indian clauses numbered &amp; formatted on injection
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {canUndo && (
            <button
              type="button"
              onClick={onUndoLastInjection}
              title="Revert last clause injection"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#C2410C] bg-[#FFF5F0] border border-[#FED7AA] rounded hover:bg-[#FFEDD5] transition-colors cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            aria-label={isOpen ? 'Collapse Clause Library' : 'Expand Clause Library'}
            className="p-1 text-slate-500 hover:text-[#202124] rounded cursor-pointer"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3.5 space-y-3">
          {/* Search & Topic Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search indemnity, force majeure, arbitration, rent..."
                aria-label="Filter clause library"
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-slate-300 rounded-lg text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#FF671F]/20 focus:border-[#FF671F]"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {TOPIC_FILTERS.map((topic) => {
                const active = topicFilter === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setTopicFilter(topic)}
                    className={`px-2 py-1 text-[11px] rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#FF671F] text-white border-[#FF671F] font-semibold'
                        : 'bg-[#F7F8FA] text-slate-600 border-slate-200 hover:border-[#FF671F]/50 hover:text-[#202124]'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Suggested Clause List */}
          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-0.5">
            {filteredClauses.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No matching clauses for this filter. Try &ldquo;All Suggested&rdquo;.
              </p>
            ) : (
              filteredClauses.map((clause) => {
                const isExpanded = expandedClauseId === clause.id;
                const justInjected = recentlyInjectedId === clause.id;

                return (
                  <div
                    key={clause.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      clause.isRecommendedForCategory && !clause.alreadyPresentInDraft
                        ? 'bg-[#FFFDF8] border-[#FED7AA]'
                        : 'bg-[#F7F8FA] border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-xs font-semibold text-[#202124]">{clause.title}</h4>
                          {clause.alreadyPresentInDraft ? (
                            <span className="text-[10px] font-mono-tabular text-[#138808] font-medium">
                              · Present in draft
                            </span>
                          ) : clause.isRecommendedForCategory ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#FF671F]">
                              <Sparkles className="w-2.5 h-2.5" />
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {clause.summary}
                        </p>
                        <p className="text-[10px] font-mono-tabular text-slate-500">
                          {clause.statutoryBasis}
                        </p>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-2.5 p-2.5 bg-white border border-slate-200 rounded-lg text-[11.5px] font-editorial leading-relaxed text-[#202124]">
                        <p className="font-semibold text-[10.5px] uppercase tracking-wider text-[#FF671F] mb-1">
                          {clause.heading}
                        </p>
                        <p>{clause.renderedBody}</p>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedClauseId((curr) => (curr === clause.id ? null : clause.id))
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-[#FF671F] cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        {isExpanded ? 'Hide Clause Text' : 'Preview Wording'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleInject(clause)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          justInjected
                            ? 'bg-[#138808] text-white'
                            : 'bg-[#202124] text-white hover:bg-[#FF671F]'
                        }`}
                      >
                        {justInjected ? (
                          <>
                            <Check className="w-3 h-3" />
                            Injected
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3 h-3" />
                            Inject into Draft
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
