import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  Scale,
  Search,
  ShieldAlert,
  Stamp,
  X,
} from 'lucide-react';
import { LibraryAuditReport, PublicProviderStatus, TemplateSummary } from '../shared/types';
import { CATEGORY_GROUPS, CATEGORY_THEMES, TEMPLATE_TAGS } from '../shared/constants';
import { fetchTemplates } from '../lib/api';

interface Props {
  report: LibraryAuditReport | null;
  providerStatus: PublicProviderStatus | null;
  onSelectTemplate: (templateId: string) => void;
  onOpenValidateAid: () => void;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  selectedCategoryTag?: string;
  onSelectCategoryTag?: (value: string) => void;
  categoryGroup?: string;
  onCategoryGroupChange?: (value: string) => void;
  rawCategory?: string;
  onRawCategoryChange?: (value: string) => void;
  reviewStatus?: string;
  onReviewStatusChange?: (value: string) => void;
  processingStatus?: string;
  onProcessingStatusChange?: (value: string) => void;
  page?: number;
  onPageChange?: (value: number) => void;
  onResetFilters?: () => void;
  onResultMetaChange?: (meta: { total: number; loading: boolean }) => void;
  hideInternalSearchAndTags?: boolean;
}

const REVIEW_FILTERS = [
  { value: 'all', label: 'All Usable Templates' },
  { value: 'approved', label: 'Verified' },
  { value: 'needs_review', label: 'Needs Legal Review' },
];

const FORMAT_FILTERS = [
  { value: 'all', label: 'All Formats' },
  { value: 'processed_ready', label: 'RTF / DOCX Text' },
  { value: 'processed_pdf_text', label: 'Reconstructed PDF' },
];

export function LibraryBrowser({
  report,
  providerStatus,
  onSelectTemplate,
  onOpenValidateAid,
  searchQuery: controlledSearchQuery,
  onSearchQueryChange,
  selectedCategoryTag: controlledTag,
  onSelectCategoryTag,
  categoryGroup: controlledCategoryGroup,
  onCategoryGroupChange,
  rawCategory: controlledRawCategory,
  onRawCategoryChange,
  reviewStatus: controlledReviewStatus,
  onReviewStatusChange,
  processingStatus: controlledProcessingStatus,
  onProcessingStatusChange,
  page: controlledPage,
  onPageChange,
  onResetFilters,
  onResultMetaChange,
  hideInternalSearchAndTags = false,
}: Props) {
  const [internalQuery, setInternalQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [internalCategoryGroup, setInternalCategoryGroup] = useState('all');
  const [internalRawCategory, setInternalRawCategory] = useState('all');
  const [internalSelectedTag, setInternalSelectedTag] = useState('all');
  const [internalReviewStatus, setInternalReviewStatus] = useState('all');
  const [internalProcessingStatus, setInternalProcessingStatus] = useState('all');
  const [internalPage, setInternalPage] = useState(1);

  const query = controlledSearchQuery !== undefined ? controlledSearchQuery : internalQuery;
  const setQuery = onSearchQueryChange ?? setInternalQuery;

  const categoryGroup =
    controlledCategoryGroup !== undefined ? controlledCategoryGroup : internalCategoryGroup;
  const setCategoryGroup = onCategoryGroupChange ?? setInternalCategoryGroup;

  const rawCategory =
    controlledRawCategory !== undefined ? controlledRawCategory : internalRawCategory;
  const setRawCategory = onRawCategoryChange ?? setInternalRawCategory;

  const selectedTag = controlledTag !== undefined ? controlledTag : internalSelectedTag;
  const setSelectedTag = onSelectCategoryTag ?? setInternalSelectedTag;

  const reviewStatus =
    controlledReviewStatus !== undefined ? controlledReviewStatus : internalReviewStatus;
  const setReviewStatus = onReviewStatusChange ?? setInternalReviewStatus;

  const processingStatus =
    controlledProcessingStatus !== undefined
      ? controlledProcessingStatus
      : internalProcessingStatus;
  const setProcessingStatus = onProcessingStatusChange ?? setInternalProcessingStatus;

  const page = controlledPage !== undefined ? controlledPage : internalPage;
  const setPage = (next: number | ((prev: number) => number)) => {
    const resolved = typeof next === 'function' ? next(page) : next;
    if (onPageChange) {
      onPageChange(resolved);
    } else {
      setInternalPage(resolved);
    }
  };

  const [items, setItems] = useState<TemplateSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => {
      setDebouncedQuery(trimmed);
      setPage(1);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onResultMetaChange?.({ total, loading: true });
    fetchTemplates({
      q: debouncedQuery,
      categoryGroup,
      rawCategory,
      tag: selectedTag,
      reviewStatus,
      processingStatus,
      page,
      limit: 18,
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        onResultMetaChange?.({ total: res.total, loading: false });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load templates.');
        onResultMetaChange?.({ total: 0, loading: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, categoryGroup, rawCategory, selectedTag, reviewStatus, processingStatus, page]);

  const rawCategoriesForGroup = (report?.rawCategories || []).filter(
    (rc) => categoryGroup === 'all' || rc.group === categoryGroup
  );

  const tagOptions = (
    report?.tagCounts && report.tagCounts.length > 0
      ? report.tagCounts
      : TEMPLATE_TAGS.map((tag) => ({ tag, count: 0 }))
  ).filter((tc) => TEMPLATE_TAGS.includes(tc.tag) || tc.count > 0);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    categoryGroup !== 'all' ||
    rawCategory !== 'all' ||
    selectedTag !== 'all' ||
    reviewStatus !== 'all' ||
    processingStatus !== 'all';

  const resetAllFilters = () => {
    if (onResetFilters) {
      onResetFilters();
      setDebouncedQuery('');
      return;
    }
    setQuery('');
    setDebouncedQuery('');
    setCategoryGroup('all');
    setRawCategory('all');
    setSelectedTag('all');
    setReviewStatus('all');
    setProcessingStatus('all');
    setPage(1);
  };

  return (
    <div className="space-y-8 pb-14">
      {/* DIP-Desk Light Hero Section matching digitalindiaproject.com */}
      <section className="bg-white border-b border-slate-200 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-44 pointer-events-none opacity-60"
          style={{
            background:
              'radial-gradient(circle at 15% 20%, rgba(255,103,31,0.08), transparent 45%), radial-gradient(circle at 85% 30%, rgba(19,136,8,0.07), transparent 42%)',
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-[#FF671F] uppercase tracking-wider">
                  Digital India Project · Legal Add-on
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-slate-500">
                  {providerStatus?.subdomainHost || 'legal.digitalindiaproject.com'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-[#202124] leading-[1.15] tracking-tight text-balance">
                Indian Legal Document Studio, Validation &amp; e-Stamp Desk
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                Draft verified Indian legal instruments from the{' '}
                <span className="font-mono-tabular font-semibold text-[#202124]">karta-files</span>{' '}
                archive without altering legal wording. Run automated validation checks, attach or request SHCIL e-Stamps, place visual signatures, and export print-ready DOCX/PDF.
              </p>
            </div>

            {/* Integrated Portal Search & Actions */}
            <div className="space-y-3">
              {!hideInternalSearchAndTags && (
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-[#FF671F] absolute left-4 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search affidavits, leave & license, Sec 138 notices, GPA, wills, sale deeds, GST..."
                    aria-label="Search legal documents"
                    className="w-full h-12 pl-11 pr-10 bg-[#F7F8FA] border border-slate-200 rounded-xl text-sm text-[#202124] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F] transition-colors"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setDebouncedQuery('');
                        setPage(1);
                      }}
                      aria-label="Clear template search"
                      className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenValidateAid}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  Validate Document &amp; Legal Aid
                </button>
              </div>
            </div>
          </div>

          {/* Right: Institutional Archive Photo + 4 DIP Service Tiles */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-3">
            <div className="h-[196px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative shadow-2xs">
              {!heroImgFailed ? (
                <img
                  src="/assets/images/hero_legal_archive_1794958413624.jpg"
                  alt="Indian legal volumes and drafted documents on a legal desk"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-50">
                  <FileText className="w-8 h-8 text-[#FF671F] mb-2" />
                  <p className="text-sm font-semibold text-[#202124]">
                    Digital India Project Legal Desk
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-slate-200 text-[#202124]">
                <BookOpen className="w-3.5 h-3.5 text-[#FF671F] mb-1" />
                <strong className="block font-semibold">Flippable A4</strong>
                <span className="text-slate-500">Multi-page sheets</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-slate-200 text-[#202124]">
                <Stamp className="w-3.5 h-3.5 text-[#FF671F] mb-1" />
                <strong className="block font-semibold">SHCIL e-Stamp</strong>
                <span className="text-slate-500">Stamp &amp; verify</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-slate-200 text-[#202124]">
                <FileCheck2 className="w-3.5 h-3.5 text-[#138808] mb-1" />
                <strong className="block font-semibold">Legal Validator</strong>
                <span className="text-slate-500">BNS &amp; blanks</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#F7F8FA] border border-slate-200 text-[#202124]">
                <Scale className="w-3.5 h-3.5 text-[#138808] mb-1" />
                <strong className="block font-semibold">Legal Aid</strong>
                <span className="text-slate-500">Clause guidance</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Public Advisory Strip */}
        <div className="bg-[#FFFDF8] border border-[#F1E8D9] rounded-xl px-4 py-3 text-xs text-slate-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#FF671F] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-[#202124]">Add-on Service Advisory:</strong> Generated drafts preserve legal text for rapid preparation. Documents remain unexecuted drafts until e-stamped via SHCIL / State GRAS, verified by an Advocate, and signed or registered as required by Indian law.
          </p>
        </div>

        {/* Repository Summary Metrics */}
        {report && (
          <section aria-label="Library statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Templates
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#202124] font-mono-tabular">
                {report.totalTemplatesCreated.toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                of {report.totalFilesDiscovered.toLocaleString('en-IN')} catalogued records
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#138808]">
                Verified Templates
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#138808] font-mono-tabular">
                {report.approvedTemplatesCount.toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Reviewed clauses &amp; mappings</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FF671F]">
                Practice Categories
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#202124] font-mono-tabular">
                {CATEGORY_GROUPS.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {report.rawCategories.length} archive source folders
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FF671F]">
                Export Formats
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#202124] font-mono-tabular">
                DOCX &amp; PDF
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                A4 print-ready with e-Stamp layout
              </p>
            </div>
          </section>
        )}

        {/* Citizen & Legal Practice Categories Directory */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <h2 className="text-xl font-display font-bold text-[#202124]">
                Citizen &amp; Legal Document Categories
              </h2>
              <p className="text-xs text-slate-500">
                Select any practice area below to filter templates and open the Document Studio.
              </p>
            </div>
            {categoryGroup !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setCategoryGroup('all');
                  setRawCategory('all');
                  setPage(1);
                }}
                className="text-xs font-semibold text-[#FF671F] hover:underline cursor-pointer"
              >
                View All 10 Categories
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {CATEGORY_GROUPS.map((grp) => {
              const theme = CATEGORY_THEMES[grp];
              const grpMeta = report?.categoryGroups.find((c) => c.name === grp);
              const selected = categoryGroup === grp;
              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    setCategoryGroup(selected ? 'all' : grp);
                    setRawCategory('all');
                    setPage(1);
                  }}
                  className={`text-left rounded-xl border overflow-hidden transition-all flex flex-col justify-between cursor-pointer ${
                    selected
                      ? 'bg-orange-50/70 border-[#FF671F] ring-2 ring-[#FF671F]/20'
                      : 'bg-white border-slate-200 hover:border-[#FF671F]/60'
                  }`}
                >
                  <div className="h-1 w-full" style={{ backgroundColor: selected ? '#FF671F' : theme.accentHex }} />
                  <div className="p-3.5 space-y-1.5 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs font-semibold leading-snug ${selected ? 'text-[#FF671F]' : 'text-[#202124]'}`}>
                        {grp}
                      </span>
                      <span className="text-[11px] font-mono-tabular font-semibold text-slate-500 shrink-0">
                        {grpMeta ? grpMeta.processed : '—'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                      {theme.shortDesc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Filter Toolbar */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="inline-flex flex-wrap items-center p-1 bg-slate-100 border border-slate-200 rounded-lg max-w-full">
                {REVIEW_FILTERS.map((rf) => (
                  <button
                    key={rf.value}
                    type="button"
                    onClick={() => {
                      setReviewStatus(rf.value);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      reviewStatus === rf.value
                        ? 'bg-[#FF671F] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-[#202124]'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>

              <select
                value={processingStatus}
                onChange={(e) => {
                  setProcessingStatus(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by source format"
                className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs text-[#202124] w-full sm:w-auto min-w-[140px] max-w-full focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25"
              >
                {FORMAT_FILTERS.map((ff) => (
                  <option key={ff.value} value={ff.value}>
                    {ff.label}
                  </option>
                ))}
              </select>

              <select
                value={rawCategory}
                onChange={(e) => {
                  setRawCategory(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by repository folder category"
                className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs text-[#202124] w-full sm:w-auto min-w-[180px] max-w-full focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25"
              >
                <option value="all">All Source Folders ({rawCategoriesForGroup.length})</option>
                {rawCategoriesForGroup.map((rc) => (
                  <option key={rc.name} value={rc.name}>
                    {rc.name} ({rc.processed})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs font-semibold text-[#FF671F] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear filters
                </button>
              )}
              <p className="text-xs text-slate-500 font-mono-tabular whitespace-nowrap shrink-0">
                Showing {items.length} of {total.toLocaleString('en-IN')} templates
              </p>
            </div>
          </div>

          {/* Interactive Tag Filter Controls (hidden when rendered by KartaFilesPage top filter bar) */}
          {!hideInternalSearchAndTags && (
            <div
              role="group"
              aria-label="Filter templates by tag"
              className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2"
            >
              <span className="text-xs font-semibold text-slate-500 mr-1 whitespace-nowrap shrink-0">
                Tags:
              </span>
              <button
                type="button"
                aria-pressed={selectedTag === 'all'}
                onClick={() => {
                  setSelectedTag('all');
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedTag === 'all'
                    ? 'bg-[#202124] text-white border-[#202124]'
                    : 'bg-[#F7F8FA] text-[#202124] border-slate-200 hover:border-[#FF671F] hover:text-[#FF671F]'
                }`}
              >
                <span>All Tags</span>
              </button>
              {tagOptions.map(({ tag, count }) => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedTag(active ? 'all' : tag);
                      setPage(1);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#FF671F] text-white border-[#FF671F]'
                        : 'bg-[#F7F8FA] text-[#202124] border-slate-200 hover:border-[#FF671F] hover:text-[#FF671F]'
                    }`}
                  >
                    <span>{tag}</span>
                    {count > 0 && (
                      <span
                        className={`font-mono-tabular text-[11px] ${
                          active ? 'text-white/90' : 'text-slate-500'
                        }`}
                      >
                        {count.toLocaleString('en-IN')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Results Grid */}
        <section aria-live="polite">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 bg-white border border-slate-200 rounded-xl p-5 animate-pulse"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 sm:p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 text-[#FF671F] flex items-center justify-center mx-auto">
                <Search className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="text-base font-semibold text-[#202124]">
                  {query.trim()
                    ? `No matching templates found for "${query.trim()}"`
                    : 'No matching legal templates found'}
                </p>
                <p className="text-sm text-slate-500">
                  {selectedTag !== 'all' || categoryGroup !== 'all'
                    ? 'No templates matched the active search and category filter combination. Try clearing your search query or switching back to All Categories.'
                    : 'Try searching by document title or tag (e.g., Affidavit, Business, Personal, Property, NDA, GST).'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setDebouncedQuery('');
                      setPage(1);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-[#202124] bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Clear Search Query
                  </button>
                )}
                {selectedTag !== 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTag('all');
                      setPage(1);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-[#202124] bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    All Categories
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#FF671F] rounded-lg hover:bg-[#E55A16] cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((tpl) => {
                const theme = CATEGORY_THEMES[tpl.categoryGroup] || {
                  accentHex: '#FF671F',
                  softBgClass: 'bg-orange-50',
                  borderClass: 'border-orange-200',
                  textClass: 'text-[#FF671F]',
                  shortDesc: '',
                };
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => onSelectTemplate(tpl.id)}
                    className="group text-left bg-white border border-slate-200 hover:border-[#FF671F] rounded-xl overflow-hidden flex flex-col justify-between transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF671F] cursor-pointer"
                  >
                    <div className="h-1 w-full" style={{ backgroundColor: theme.accentHex }} />
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                          <span className="font-semibold text-[#202124]">
                            {tpl.rawCategory}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular uppercase">
                            {tpl.originalFormat.replace('.', '')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              tpl.reviewStatus === 'approved'
                                ? 'text-[#138808] font-semibold'
                                : 'text-amber-700'
                            }
                          >
                            {tpl.reviewStatus === 'approved' ? 'Verified' : 'Needs Review'}
                          </span>
                        </div>

                        <h3 className="text-base font-display font-bold text-[#202124] group-hover:text-[#FF671F] leading-snug line-clamp-2 transition-colors">
                          {tpl.title}
                        </h3>

                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                          {tpl.description}
                        </p>

                        {tpl.tags && tpl.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                            {tpl.tags.slice(0, 4).map((t, idx) => (
                              <span key={t} className="inline-flex items-center gap-2">
                                {idx > 0 && <span aria-hidden="true">·</span>}
                                <span
                                  className={
                                    t === 'Popular'
                                      ? 'font-semibold text-[#FF671F]'
                                      : t === 'New'
                                      ? 'font-semibold text-[#138808]'
                                      : 'text-slate-600 font-medium'
                                  }
                                >
                                  {t}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-mono-tabular">
                          {tpl.fieldCount} fields · v{tpl.version}
                          {tpl.isReconstructedFromPdf ? ' · PDF' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-[#FF671F] whitespace-nowrap shrink-0">
                          Open Studio
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
              <span className="text-xs text-slate-500 font-mono-tabular">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-[#202124] disabled:opacity-40 hover:border-[#FF671F] cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-[#202124] disabled:opacity-40 hover:border-[#FF671F] cursor-pointer"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
