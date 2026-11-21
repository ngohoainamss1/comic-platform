import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  Home,
  Compass,
  Trophy,
  Bookmark,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Play,
  Pause,
  ArrowUpDown,
  Eye,
  Star,
  BookOpen,
  Layers,
  Flame,
  Clock,
  History,
  Sparkles,
  RotateCcw,
  List,
  Trash2,
  ArrowUp,
  Sun,
  Moon,
  Dices
} from 'lucide-react';
import {
  fetchGenres,
  fetchComics,
  fetchComicDetail,
  fetchChapterPages,
  recordComicView,
  resolveAssetUrl,
  type GenreItem,
  type ComicSummary,
  type ComicDetail,
  type PageItem,
  type PaginationMeta,
  type HistoryItem,
} from './lib/api';

type TabKey = 'home' | 'explore' | 'ranking' | 'library';
type GenreFilterState = 'neutral' | 'include' | 'exclude';

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num || 0);
}

function formatTimeAgo(dateStr: string | number): string {
  if (!dateStr) return 'Mới đây';
  const raw = typeof dateStr === 'number' ? dateStr : Date.parse(dateStr.includes('T') ? dateStr : `${dateStr}Z`);
  if (Number.isNaN(raw)) return 'Mới đây';
  const diffSec = Math.max(1, Math.floor((Date.now() - raw) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(raw).toLocaleDateString('vi-VN');
}

const SkeletonComic = () => (
  <div className="space-y-2">
    <div className="aspect-[2/3] rounded-xl animate-shimmer" />
    <div className="h-3.5 rounded w-4/5 animate-shimmer" />
    <div className="h-3 rounded w-1/2 animate-shimmer" />
  </div>
);

interface ComicCardProps {
  item: ComicSummary;
  onSelect: (slug: string) => void;
  rankBadge?: number;
  lastReadChapter?: number;
}

function ComicCard({ item, onSelect, rankBadge, lastReadChapter }: ComicCardProps) {
  return (
    <button
      onClick={() => onSelect(item.slug)}
      className="group text-left flex flex-col bg-[#121218] hover:bg-[#1a1a24] rounded-xl overflow-hidden border border-white/[0.05] hover:border-rose-500/50 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-rose-500/10 hover:-translate-y-1"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#181822]">
        {item.cover_url ? (
          <img
            src={resolveAssetUrl(item.cover_url)}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500 p-3 text-center">
            {item.title}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#09090c] via-black/50 to-transparent pointer-events-none" />

        {typeof rankBadge === 'number' ? (
          <span
            className={`absolute top-2 left-2 w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center shadow-lg backdrop-blur-md border ${
              rankBadge === 1
                ? 'bg-gradient-to-br from-amber-200 to-amber-500 text-black border-amber-300/50'
                : rankBadge === 2
                ? 'bg-gradient-to-br from-zinc-100 to-zinc-400 text-black border-white/50'
                : rankBadge === 3
                ? 'bg-gradient-to-br from-orange-300 to-orange-600 text-white border-orange-400/50'
                : 'bg-black/60 text-zinc-200 border-white/10'
            }`}
          >
            {rankBadge}
          </span>
        ) : (
          <span
            className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest uppercase backdrop-blur-md shadow-md ${
              item.status === 'completed'
                ? 'bg-emerald-500/90 text-white shadow-emerald-500/30'
                : 'bg-rose-600/90 text-white shadow-rose-500/30'
            }`}
          >
            {item.status === 'completed' ? 'Full' : 'Hot'}
          </span>
        )}

        {typeof lastReadChapter === 'number' && item.latest_chapter !== null && item.latest_chapter > lastReadChapter ? (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-gradient-to-r from-rose-600 to-orange-500 text-white text-[10px] font-black shadow-lg shadow-rose-600/40 backdrop-blur-md animate-pulse">
            +{Math.max(1, Math.round(item.latest_chapter - lastReadChapter))} mới
          </span>
        ) : typeof lastReadChapter === 'number' ? (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-violet-600/90 text-white text-[10px] font-bold shadow-md shadow-violet-600/30 backdrop-blur-md">
            Đọc Ch.{lastReadChapter}
          </span>
        ) : null}

        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[10px] text-zinc-200 font-medium">
          <span className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10">
            <Eye className="w-3 h-3 text-rose-400" />
            {formatCompactNumber(item.views_total)}
          </span>
          <span className="flex items-center gap-0.5 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10 text-amber-400">
            <Star className="w-3 h-3 fill-amber-400" />
            {Number(item.rating_avg || 5).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col justify-between gap-1.5 bg-[#121218]">
        <h3 className="text-xs sm:text-[13px] font-bold line-clamp-2 leading-snug text-zinc-100 group-hover:text-rose-400 transition-colors">
          {item.title}
        </h3>

        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/[0.03] text-[11px]">
          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-500 truncate">
            {item.latest_chapter !== null ? `Chapter ${item.latest_chapter}` : 'Sắp ra mắt'}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0 font-medium">
            {formatTimeAgo(item.updated_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [librarySubTab, setLibrarySubTab] = useState<'bookmarks' | 'history'>('bookmarks');

  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [comics, setComics] = useState<ComicSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1, limit: 24, total: 0, totalPages: 1,
  });
  const [page, setPage] = useState(1);

  const [featuredComics, setFeaturedComics] = useState<ComicSummary[]>([]);
  const [sidebarTopComics, setSidebarTopComics] = useState<ComicSummary[]>([]);
  const [sidebarTopPeriod, setSidebarTopPeriod] = useState<'top-day' | 'top-week' | 'top-month'>('top-day');

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickResults, setQuickResults] = useState<ComicSummary[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);

  const [sortMode, setSortMode] = useState('latest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [genreStates, setGenreStates] = useState<Record<string, GenreFilterState>>({});
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(true);

  const [selectedComic, setSelectedComic] = useState<ComicDetail | null>(null);
  const [chapterOrderAsc, setChapterOrderAsc] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  // VIP Features
  const [eyeCareMode, setEyeCareMode] = useState(false);

  const [readerData, setReaderData] = useState<{
    chapter: { id: number; comic_id: number; chapter_number: number; title: string; comic_slug: string; comic_title: string; };
    prev_chapter: { id: number; chapter_number: number } | null;
    next_chapter: { id: number; chapter_number: number } | null;
    pages: PageItem[];
  } | null>(null);

  const [readMode, setReadMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0);
  const [readerChapterDrawerOpen, setReaderChapterDrawerOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [bookmarks, setBookmarks] = useState<ComicSummary[]>(() => {
    try { return JSON.parse(localStorage.getItem('vr_bookmarks') || '[]'); } catch { return []; }
  });

  const [readHistory, setReadHistory] = useState<Record<string, HistoryItem>>(() => {
    try {
      const v2 = JSON.parse(localStorage.getItem('vr_history_v2') || '{}');
      if (v2 && typeof v2 === 'object' && Object.keys(v2).length > 0) return v2;
      return {};
    } catch { return {}; }
  });

  const autoScrollRef = useRef<number | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchGenres().then(setGenres).catch(() => {});
    fetchComics({ page: 1, limit: 12, sort: 'top-week' })
      .then((res) => { if (res.success) setFeaturedComics(res.data || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchComics({ page: 1, limit: 8, sort: sidebarTopPeriod })
      .then((res) => { if (res.success) setSidebarTopComics(res.data || []); })
      .catch(() => {});
  }, [sidebarTopPeriod]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setQuickResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      fetchComics({ page: 1, limit: 6, q: trimmed })
        .then((res) => { if (res.success) setQuickResults(res.data || []); })
        .catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const applyHashRoute = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('/truyen/')) {
        const slug = decodeURIComponent(hash.replace('/truyen/', ''));
        if (slug && selectedComic?.slug !== slug) openComic(slug, false);
      } else if (hash.startsWith('/doc/')) {
        const chId = Number(hash.replace('/doc/', ''));
        if (Number.isFinite(chId) && chId > 0 && readerData?.chapter.id !== chId) openChapter(chId, false);
      } else if (hash === '/the-loai') {
        setSelectedComic(null); setReaderData(null); setActiveTab('explore');
      } else if (hash === '/bxh') {
        setSelectedComic(null); setReaderData(null); setActiveTab('ranking');
      } else if (hash === '/tu-truyen') {
        setSelectedComic(null); setReaderData(null); setActiveTab('library');
      } else if (hash === '' || hash === '/') {
        setSelectedComic(null); setReaderData(null); setActiveTab('home');
      }
    };

    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const inc = Object.entries(genreStates).filter(([, st]) => st === 'include').map(([slug]) => slug);
    const exc = Object.entries(genreStates).filter(([, st]) => st === 'exclude').map(([slug]) => slug);
    const effectiveSort = activeTab === 'ranking' && !sortMode.startsWith('top') && sortMode !== 'rating' ? 'top-day' : sortMode;

    fetchComics({ page, limit: 24, q: searchQuery, sort: effectiveSort, status: statusFilter, inc, exc })
      .then((res) => {
        if (!cancelled && res.success) {
          setComics(res.data || []);
          if (res.pagination) setPagination(res.pagination);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [page, searchQuery, sortMode, statusFilter, genreStates, activeTab]);

  // Observer cho tiến trình đọc
  useEffect(() => {
    if (!readerData || readMode !== 'vertical' || !readerContainerRef.current) return;
    
    let debounceTimer: number;
    const observer = new IntersectionObserver((entries) => {
      let maxIdx = -1;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.getAttribute('data-index'));
          if (idx > maxIdx) maxIdx = idx;
        }
      });
      if (maxIdx > -1) {
        setCurrentPageIdx(maxIdx);
        // Lưu tiến trình ngầm
        window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          setReadHistory(prev => {
            const entry = prev[readerData.chapter.comic_slug];
            if (!entry) return prev;
            const progress = readerData.pages.length > 0 ? Math.round(((maxIdx + 1) / readerData.pages.length) * 100) : 0;
            const updated = { ...prev, [readerData.chapter.comic_slug]: { ...entry, progress, total_pages: readerData.pages.length } };
            localStorage.setItem('vr_history_v2', JSON.stringify(updated));
            return updated;
          });
        }, 1000);
      }
    }, { rootMargin: '0px 0px -50% 0px', threshold: 0.1 });

    const nodes = document.querySelectorAll('.reader-page');
    nodes.forEach(n => observer.observe(n));
    return () => { observer.disconnect(); window.clearTimeout(debounceTimer); };
  }, [readerData, readMode]);

  useEffect(() => {
    if (autoScrollSpeed > 0 && readerData && readMode === 'vertical') {
      autoScrollRef.current = window.setInterval(() => {
        window.scrollBy({ top: autoScrollSpeed, behavior: 'auto' });
      }, 16);
    } else if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    return () => { if (autoScrollRef.current) clearInterval(autoScrollRef.current); };
  }, [autoScrollSpeed, readerData, readMode]);

  useEffect(() => {
    if (!readerData) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (readMode === 'horizontal' && currentPageIdx > 0) setCurrentPageIdx(p => p - 1);
        else if (readerData.prev_chapter) openChapter(readerData.prev_chapter.id);
      } else if (e.key === 'ArrowRight') {
        if (readMode === 'horizontal' && currentPageIdx < readerData.pages.length - 1) setCurrentPageIdx(p => p + 1);
        else if (readerData.next_chapter) openChapter(readerData.next_chapter.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readerData, readMode, currentPageIdx]);

  const navigateTab = (tab: TabKey) => {
    setSelectedComic(null); setReaderData(null); setActiveTab(tab); setPage(1);
    const hashMap: Record<TabKey, string> = { home: '#/', explore: '#/the-loai', ranking: '#/bxh', library: '#/tu-truyen' };
    window.history.replaceState(null, '', hashMap[tab]);
    window.scrollTo({ top: 0 });
  };

  const cycleGenreState = (slug: string) => {
    setPage(1);
    setGenreStates(prev => {
      const cur = prev[slug] || 'neutral';
      const next: GenreFilterState = cur === 'neutral' ? 'include' : cur === 'include' ? 'exclude' : 'neutral';
      return { ...prev, [slug]: next };
    });
  };

  const jumpToGenre = (slug: string) => {
    setSelectedComic(null); setReaderData(null); setGenreStates({ [slug]: 'include' });
    setStatusFilter('all'); setSearchQuery(''); setPage(1); setActiveTab('explore');
    window.history.replaceState(null, '', '#/the-loai');
    window.scrollTo({ top: 0 });
  };

  const resetAllFilters = () => { setGenreStates({}); setStatusFilter('all'); setSearchQuery(''); setSortMode('latest'); setPage(1); };

  const openComic = async (slug: string, pushHash = true) => {
    setLoading(true); setSearchFocused(false);
    try {
      const detail = await fetchComicDetail(slug);
      setSelectedComic(detail); setReaderData(null); setChapterSearch(''); setDescExpanded(false);
      if (pushHash) window.location.hash = `/truyen/${encodeURIComponent(slug)}`;
      window.scrollTo({ top: 0 });
    } catch (e) { alert((e as Error).message); } finally { setLoading(false); }
  };

  const openChapter = async (chapterId: number, pushHash = true) => {
    setLoading(true); setReaderChapterDrawerOpen(false);
    try {
      const data = await fetchChapterPages(chapterId);
      setReaderData(data); setCurrentPageIdx(0); setHudVisible(true); setAutoScrollSpeed(0);
      if (pushHash) window.location.hash = `/doc/${chapterId}`;
      window.scrollTo({ top: 0 });

      recordComicView(data.chapter.comic_id);

      const knownComic = selectedComic?.slug === data.chapter.comic_slug
          ? selectedComic
          : comics.find(c => c.slug === data.chapter.comic_slug) || featuredComics.find(c => c.slug === data.chapter.comic_slug);

      const updatedEntry: HistoryItem = {
        slug: data.chapter.comic_slug,
        title: data.chapter.comic_title,
        cover_url: knownComic?.cover_url || readHistory[data.chapter.comic_slug]?.cover_url || '',
        chapter_id: data.chapter.id,
        chapter_number: data.chapter.chapter_number,
        read_at: Date.now(),
        progress: 0,
        total_pages: data.pages.length
      };
      
      const updatedHistory = { ...readHistory, [data.chapter.comic_slug]: updatedEntry };
      setReadHistory(updatedHistory);
      localStorage.setItem('vr_history_v2', JSON.stringify(updatedHistory));

      if (!selectedComic || selectedComic.slug !== data.chapter.comic_slug) {
        fetchComicDetail(data.chapter.comic_slug).then(setSelectedComic).catch(() => {});
      }
    } catch (e) { alert((e as Error).message); } finally { setLoading(false); }
  };

  const playRandomComic = () => {
    const pool = featuredComics.length > 0 ? featuredComics : comics;
    if (pool.length > 0) {
      const random = pool[Math.floor(Math.random() * pool.length)];
      openComic(random.slug);
    }
  };

  const toggleBookmark = (comic: ComicDetail) => {
    const exists = bookmarks.some(b => b.slug === comic.slug);
    const updated = exists ? bookmarks.filter(b => b.slug !== comic.slug) : [comic, ...bookmarks];
    setBookmarks(updated);
    localStorage.setItem('vr_bookmarks', JSON.stringify(updated));
  };

  const removeHistoryItem = (slug: string) => {
    const copy = { ...readHistory }; delete copy[slug];
    setReadHistory(copy); localStorage.setItem('vr_history_v2', JSON.stringify(copy));
  };

  useEffect(() => {
    const freshMap = new Map<string, ComicSummary>();
    [...featuredComics, ...comics].forEach((c) => freshMap.set(c.slug, c));
    if (freshMap.size === 0) return;

    setBookmarks((prev) => {
      let changed = false;
      const next = prev.map((b) => {
        const fresh = freshMap.get(b.slug);
        if (fresh && (fresh.latest_chapter !== b.latest_chapter || fresh.updated_at !== b.updated_at)) {
          changed = true;
          return { ...b, latest_chapter: fresh.latest_chapter, updated_at: fresh.updated_at, status: fresh.status };
        }
        return b;
      });
      if (changed) {
        localStorage.setItem('vr_bookmarks', JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, [comics, featuredComics]);

  const unreadBookmarkCount = useMemo(() => {
    return bookmarks.filter((b) => {
      const h = readHistory[b.slug];
      return h && b.latest_chapter !== null && b.latest_chapter > h.chapter_number;
    }).length;
  }, [bookmarks, readHistory]);

  const historyList = useMemo(() => Object.values(readHistory).sort((a, b) => b.read_at - a.read_at), [readHistory]);
  const activeFilterCount = useMemo(() => Object.values(genreStates).filter(v => v !== 'neutral').length + (statusFilter !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0), [genreStates, statusFilter, searchQuery]);

  if (readerData) {
    const totalPages = readerData.pages.length;

    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 select-none">
        {eyeCareMode && <div className="eye-care-overlay" />}

        {hudVisible && (
          <header className="fixed top-0 inset-x-0 z-50 bg-[#09090c]/85 backdrop-blur-2xl border-b border-white/5 px-3 py-2.5 shadow-xl transition-all">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
              <button
                onClick={() => { setAutoScrollSpeed(0); openComic(readerData.chapter.comic_slug); }}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-zinc-200 hover:text-white active:scale-95 min-w-0"
              >
                <ChevronLeft className="w-5 h-5 shrink-0 text-rose-500" />
                <span className="truncate">{readerData.chapter.comic_title}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEyeCareMode(m => !m)}
                  className={`p-1.5 rounded-full border transition ${eyeCareMode ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'}`}
                  title="Chế độ bảo vệ mắt"
                >
                  {eyeCareMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setReaderChapterDrawerOpen(o => !o)}
                  className="flex items-center gap-1.5 text-xs font-extrabold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 shrink-0 text-zinc-100 shadow-md"
                >
                  <span>Ch.{readerData.chapter.chapter_number}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-rose-500" />
                </button>
              </div>
            </div>
          </header>
        )}

        {readerChapterDrawerOpen && selectedComic && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-md bg-[#121218] border border-white/10 rounded-t-3xl sm:rounded-3xl max-h-[75vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <span className="text-sm font-extrabold flex items-center gap-2">
                  <List className="w-4 h-4 text-rose-500" />
                  Chọn chương ({selectedComic.chapters.length})
                </span>
                <button onClick={() => setReaderChapterDrawerOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto grid grid-cols-3 gap-2">
                {selectedComic.chapters.map((ch) => {
                  const isCurrent = ch.id === readerData.chapter.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => openChapter(ch.id)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold truncate border transition ${
                        isCurrent
                          ? 'bg-gradient-to-r from-rose-500 to-pink-600 border-transparent text-white shadow-lg shadow-rose-500/30'
                          : 'bg-[#181822] border-white/5 text-zinc-300 hover:border-rose-500/50'
                      }`}
                    >
                      Chap {ch.chapter_number}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div
          ref={readerContainerRef}
          onClick={(e) => {
            if (readerChapterDrawerOpen) { setReaderChapterDrawerOpen(false); return; }
            const w = window.innerWidth, x = e.clientX;
            if (readMode === 'horizontal') {
              if (x < w * 0.3) setCurrentPageIdx(p => Math.max(0, p - 1));
              else if (x > w * 0.7) setCurrentPageIdx(p => Math.min(totalPages - 1, p + 1));
              else setHudVisible(v => !v);
            } else {
              setHudVisible(v => !v);
            }
          }}
          className="pt-14 pb-28 flex flex-col items-center min-h-screen"
        >
          {totalPages === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-32">
               <span className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                 <X className="w-6 h-6 text-zinc-500" />
               </span>
               <p className="text-zinc-500 text-sm font-medium">Chương này chưa có dữ liệu ảnh.</p>
            </div>
          ) : readMode === 'vertical' ? (
            <>
              <div style={{ width: `${zoomPercent}%` }} className="max-w-3xl flex flex-col transition-all duration-300">
                {readerData.pages.map((p, i) => (
                  <div key={p.index} data-index={i} className="reader-page w-full bg-[#050507]">
                    <img
                      src={resolveAssetUrl(p.url)}
                      alt={`Trang ${p.index + 1}`}
                      loading={p.index < 2 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-auto object-contain block"
                    />
                  </div>
                ))}
              </div>
              
              {/* End of chapter box */}
              <div onClick={e => e.stopPropagation()} className="w-full max-w-xl px-4 mt-12 space-y-3 mb-10">
                <div className="p-5 rounded-3xl bg-gradient-to-b from-[#121218] to-[#0d0d12] border border-white/5 text-center shadow-2xl">
                  <div className="w-12 h-12 mx-auto bg-rose-500/20 rounded-full flex items-center justify-center mb-3">
                     <Sparkles className="w-6 h-6 text-rose-400" />
                  </div>
                  <p className="text-sm text-zinc-400 mb-4">
                    Đã đọc hết <strong className="text-white text-base">Chương {readerData.chapter.chapter_number}</strong>
                  </p>
                  <div className="flex gap-3">
                    <button disabled={!readerData.prev_chapter} onClick={() => readerData.prev_chapter && openChapter(readerData.prev_chapter.id)}
                      className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 disabled:opacity-30 font-bold text-sm flex items-center justify-center gap-1.5 transition">
                      <ChevronLeft className="w-4 h-4" /> Trước
                    </button>
                    <button disabled={!readerData.next_chapter} onClick={() => readerData.next_chapter && openChapter(readerData.next_chapter.id)}
                      className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 disabled:opacity-30 font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/25 transition hover:scale-[1.02] active:scale-95">
                      Chương sau <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full max-w-4xl flex flex-col items-center justify-center flex-1 px-2 h-[80vh]">
              <img
                src={resolveAssetUrl(readerData.pages[currentPageIdx]?.url || '')}
                alt={`Trang ${currentPageIdx + 1}`}
                className="max-h-full max-w-full object-contain rounded-md shadow-2xl"
              />
            </div>
          )}
        </div>

        {/* Cục hiển thị % nhỏ xíu luôn hiện ở góc khi cuộn dọc */}
        {!hudVisible && readMode === 'vertical' && totalPages > 0 && (
          <div className="fixed bottom-4 right-4 z-40 bg-black/60 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-full text-[10px] font-black text-white shadow-lg">
            {currentPageIdx + 1} / {totalPages}
          </div>
        )}

        {hudVisible && (
          <footer className="fixed bottom-0 inset-x-0 z-50 bg-[#09090c]/90 backdrop-blur-2xl border-t border-white/5 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-all">
            <div className="max-w-3xl mx-auto space-y-3">
              
              {readMode === 'vertical' && (
                <div className="flex items-center gap-3 px-1">
                   <Play className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                   <input 
                     type="range" min={0} max={10} step={1} value={autoScrollSpeed}
                     onChange={(e) => setAutoScrollSpeed(Number(e.target.value))}
                     className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-rose-500" 
                   />
                   <span className="text-[10px] font-bold text-rose-400 w-6 shrink-0">{autoScrollSpeed > 0 ? `${autoScrollSpeed}x` : 'Tắt'}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 text-xs">
                <button onClick={() => setReadMode(m => m === 'vertical' ? 'horizontal' : 'vertical')}
                  className="flex flex-col items-center justify-center gap-1 w-12 text-zinc-400 hover:text-white transition">
                  <Layers className="w-5 h-5 text-rose-400" />
                  <span className="text-[9px] font-bold uppercase">{readMode === 'vertical' ? 'Cuộn' : 'Lật'}</span>
                </button>

                <div className="flex flex-1 items-center justify-center gap-2 max-w-[200px]">
                  <button disabled={!readerData.prev_chapter} onClick={() => readerData.prev_chapter && openChapter(readerData.prev_chapter.id)}
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"><ChevronLeft className="w-5 h-5" /></button>
                  
                  <div className="flex flex-col items-center min-w-[70px]">
                    <span className="text-sm font-black text-white">{currentPageIdx + 1}</span>
                    <span className="text-[9px] text-zinc-500 uppercase font-bold">/ {totalPages} Trang</span>
                  </div>

                  <button disabled={!readerData.next_chapter} onClick={() => readerData.next_chapter && openChapter(readerData.next_chapter.id)}
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 transition"><ChevronRight className="w-5 h-5" /></button>
                </div>

                <button onClick={() => setReaderChapterDrawerOpen(true)}
                  className="flex flex-col items-center justify-center gap-1 w-12 text-zinc-400 hover:text-white transition">
                  <List className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase">Mục lục</span>
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    );
  }

  if (selectedComic) {
    const isBookmarked = bookmarks.some(b => b.slug === selectedComic.slug);
    const historyEntry = readHistory[selectedComic.slug];
    const filteredChapters = selectedComic.chapters.filter(ch => {
      if (!chapterSearch.trim()) return true;
      const q = chapterSearch.trim().toLowerCase();
      return String(ch.chapter_number).includes(q) || (ch.title || '').toLowerCase().includes(q);
    });
    const orderedChapters = chapterOrderAsc ? [...filteredChapters].reverse() : filteredChapters;
    const firstChapter = selectedComic.chapters.length > 0 ? selectedComic.chapters[selectedComic.chapters.length - 1] : null;
    const latestChapter = selectedComic.chapters.length > 0 ? selectedComic.chapters[0] : null;
    const resumeChapter = historyEntry ? selectedComic.chapters.find(c => c.id === historyEntry.chapter_id || c.chapter_number === historyEntry.chapter_number) : null;

    return (
      <div className="min-h-screen bg-[#09090c] pb-20">
        <div className="relative overflow-hidden border-b border-white/[0.03]">
          {selectedComic.cover_url && (
            <img src={resolveAssetUrl(selectedComic.cover_url)} alt="" className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-20 scale-125 pointer-events-none" />
          )}
          <div className="relative z-10 max-w-5xl mx-auto px-4 pt-4 pb-8 bg-gradient-to-b from-[#09090c]/40 via-[#09090c]/90 to-[#09090c]">
            <div className="flex items-center justify-between gap-2 mb-6">
              <button onClick={() => navigateTab(activeTab)} className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-300 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full transition shadow-sm backdrop-blur-md">
                <ChevronLeft className="w-4 h-4 text-rose-500" /> Quay lại
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="w-36 sm:w-48 aspect-[2/3] rounded-2xl overflow-hidden bg-[#14141c] shrink-0 border border-white/10 shadow-2xl shadow-black/50 relative group">
                {selectedComic.cover_url ? (
                  <img src={resolveAssetUrl(selectedComic.cover_url)} alt={selectedComic.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">No Cover</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left w-full">
                <h1 className="text-2xl sm:text-3xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400">
                  {selectedComic.title}
                </h1>

                {selectedComic.alt_titles && (
                  <p className="mt-1.5 text-xs text-zinc-400 line-clamp-1">
                    <span className="text-zinc-500 font-bold uppercase text-[10px] mr-1 border border-white/10 px-1.5 py-0.5 rounded">Tên khác</span>
                    {selectedComic.alt_titles}
                  </p>
                )}

                {selectedComic.author && (
                  <p className="mt-2 text-xs text-zinc-300">
                    <span className="text-zinc-500 font-bold uppercase text-[10px] mr-1.5 border border-white/10 px-1.5 py-0.5 rounded">Tác giả</span>
                    <span className="font-bold text-rose-400">{selectedComic.author.name}</span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs">
                  <span className={`px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider text-[10px] shadow-sm ${selectedComic.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/20 text-rose-400 border border-rose-500/20'}`}>
                    {selectedComic.status === 'completed' ? 'Hoàn thành' : 'Đang ra'}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-amber-400 font-bold border border-white/5">
                    <Star className="w-3.5 h-3.5 fill-amber-400" /> {Number(selectedComic.rating_avg || 5).toFixed(1)} <span className="text-zinc-500 text-[10px]">({selectedComic.rating_count || 1})</span>
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-200 font-bold border border-white/5">
                    <Eye className="w-3.5 h-3.5 text-rose-400" /> {formatCompactNumber(selectedComic.views_total)}
                  </span>
                </div>

                {selectedComic.genres.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                    {selectedComic.genres.map(g => (
                      <button key={g.id} onClick={() => jumpToGenre(g.slug)} className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#161622] hover:bg-rose-500/20 text-zinc-300 hover:text-rose-300 border border-white/5 hover:border-rose-500/30 transition shadow-sm">
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-3 w-full">
                  {resumeChapter && (
                    <button onClick={() => openChapter(resumeChapter.id)} className="flex-1 sm:flex-none min-w-[150px] py-3 px-5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 font-black text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-violet-600/25 transition active:scale-95">
                      <Play className="w-4 h-4 fill-white" /> Đọc tiếp Ch.{resumeChapter.chapter_number}
                    </button>
                  )}
                  {firstChapter && (
                    <button onClick={() => openChapter(firstChapter.id)} className="flex-1 sm:flex-none min-w-[140px] py-3 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-95 font-black text-sm text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 transition active:scale-95">
                      <BookOpen className="w-4 h-4" /> Từ đầu
                    </button>
                  )}
                  <button onClick={() => toggleBookmark(selectedComic)} className={`py-3 px-5 rounded-2xl font-black text-sm border-2 flex items-center justify-center gap-2 transition active:scale-95 ${isBookmarked ? 'bg-rose-500/10 border-rose-500 text-rose-400' : 'bg-transparent border-white/10 text-zinc-200 hover:border-rose-500/50 hover:bg-rose-500/5'}`}>
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-rose-400' : ''}`} /> {isBookmarked ? 'Đã lưu' : 'Lưu'}
                  </button>
                </div>
              </div>
            </div>

            {selectedComic.description && (
              <div className="mt-8 p-4 rounded-3xl bg-[#121218]/80 backdrop-blur-md border border-white/5 relative group">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Nội dung
                </h2>
                <p className={`text-[13px] text-zinc-300 leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>
                  {selectedComic.description}
                </p>
                {selectedComic.description.length > 150 && (
                  <button onClick={() => setDescExpanded(v => !v)} className="mt-2 text-xs font-bold text-rose-400 flex items-center gap-1 hover:text-rose-300 transition">
                    {descExpanded ? 'Thu gọn' : 'Xem thêm'} {descExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#121218] p-2 rounded-2xl border border-white/5">
            <h2 className="text-sm font-black flex items-center gap-2 px-2 text-white">
              <span className="bg-rose-500/20 p-1.5 rounded-lg text-rose-500"><List className="w-4 h-4" /></span>
              Danh sách ({selectedComic.chapters.length})
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" value={chapterSearch} onChange={e => setChapterSearch(e.target.value)} placeholder="Tìm chap..." className="w-full bg-[#181822] border-none rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition" />
              </div>
              <button onClick={() => setChapterOrderAsc(o => !o)} className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 bg-[#181822] hover:bg-white/10 px-3 py-2 rounded-xl transition shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
                {chapterOrderAsc ? 'Cũ trước' : 'Mới trước'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {orderedChapters.map(ch => {
              const isLastRead = historyEntry?.chapter_number === ch.chapter_number;
              return (
                <button key={ch.id} onClick={() => openChapter(ch.id)} className={`text-left px-4 py-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${isLastRead ? 'bg-rose-500/10 border-rose-500/30 shadow-inner' : 'bg-[#121218] hover:bg-[#1a1a24] border-white/5 hover:border-white/10'}`}>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-black block truncate ${isLastRead ? 'text-rose-400' : 'text-zinc-200'}`}>
                      Chapter {ch.chapter_number}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">{formatTimeAgo(ch.created_at)}</span>
                  </div>
                  {isLastRead && <span className="shrink-0 px-2 py-1 bg-rose-500/20 text-rose-400 rounded-lg text-[9px] font-black uppercase tracking-wider">Đang đọc</span>}
                </button>
              );
            })}
          </div>

          {selectedComic.same_author_comics && selectedComic.same_author_comics.length > 0 && (
            <div className="mt-10 space-y-4">
              <h2 className="text-base font-black flex items-center gap-2 text-white">
                <Sparkles className="w-4 h-4 text-rose-500" />
                Cùng tác giả: <span className="text-rose-400">{selectedComic.author?.name}</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {selectedComic.same_author_comics.map((rel) => (
                  <ComicCard
                    key={rel.slug}
                    item={rel}
                    onSelect={openComic}
                    lastReadChapter={readHistory[rel.slug]?.chapter_number}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090c] text-zinc-100 font-sans">
      <header className="sticky top-0 z-40 bg-[#09090c]/80 backdrop-blur-2xl border-b border-white/[0.04] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={() => { resetAllFilters(); navigateTab('home'); }} className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center font-black text-white shadow-lg shadow-rose-500/30 group-hover:scale-105 group-active:scale-95 transition-all">
              V
            </div>
            <div className="text-left hidden sm:block">
              <span className="font-black text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent block leading-none">VinaReader</span>
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-rose-500 block mt-0.5">VIP Pro Max</span>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1.5 bg-[#121218]/50 p-1.5 rounded-2xl border border-white/5">
            {[ { key: 'home', label: 'Trang chủ', icon: Home }, { key: 'explore', label: 'Khám phá', icon: Compass }, { key: 'ranking', label: 'Xếp hạng', icon: Trophy }, { key: 'library', label: unreadBookmarkCount > 0 ? `Tủ sách (+${unreadBookmarkCount})` : `Tủ sách ${bookmarks.length>0 ? `(${bookmarks.length})` : ''}`, icon: Bookmark } ].map(nav => {
              const Icon = nav.icon;
              const active = activeTab === nav.key;
              return (
                <button key={nav.key} onClick={() => navigateTab(nav.key as TabKey)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${active ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
                  <Icon className="w-4 h-4" /> {nav.label}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-1 md:flex-none justify-end items-center gap-2 max-w-sm w-full">
            <button onClick={playRandomComic} className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl bg-[#121218] border border-white/5 text-zinc-400 hover:text-amber-400 hover:border-amber-400/30 transition shadow-sm" title="Truyện ngẫu nhiên">
              <Dices className="w-4 h-4" />
            </button>
            <div ref={searchBoxRef} className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input type="text" value={searchQuery} onFocus={() => setSearchFocused(true)} onChange={(e) => { setSearchQuery(e.target.value); setSearchFocused(true); setPage(1); }} onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery.trim()) { setSearchFocused(false); setActiveTab('explore'); } }} placeholder="Tìm kiếm truyện..." className="w-full bg-[#121218] border border-white/5 rounded-2xl pl-10 pr-9 py-2 text-[13px] font-medium text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all shadow-inner" />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setQuickResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"><X className="w-3.5 h-3.5" /></button>
              )}

              {searchFocused && searchQuery.trim() && (
                <div className="absolute right-0 left-0 mt-3 bg-[#161622]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                  {quickResults.length === 0 ? (
                    <div className="p-5 text-center text-xs text-zinc-500 font-bold">Không tìm thấy kết quả</div>
                  ) : (
                    <div className="divide-y divide-white/[0.03] p-1.5">
                      {quickResults.map((item) => (
                        <button key={item.slug} onClick={() => openComic(item.slug)} className="w-full p-2 flex items-center gap-3 hover:bg-white/5 rounded-xl text-left transition group">
                          <img src={resolveAssetUrl(item.cover_url)} alt="" className="w-10 h-14 rounded-lg object-cover bg-[#09090c] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black text-zinc-200 group-hover:text-rose-400 truncate">{item.title}</p>
                            <p className="text-[10px] text-zinc-500 font-bold mt-0.5">{item.latest_chapter !== null ? `Ch.${item.latest_chapter}` : 'Mới'}</p>
                          </div>
                        </button>
                      ))}
                      <button onClick={() => { setSearchFocused(false); setActiveTab('explore'); }} className="w-full mt-1 py-2.5 text-center text-[11px] font-black uppercase tracking-wider text-rose-400 hover:bg-rose-500/10 rounded-xl">Xem tất cả</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {genres.length > 0 && activeTab === 'home' && (
          <div className="border-t border-white/[0.02] bg-[#09090c]/40">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button onClick={() => { resetAllFilters(); setActiveTab('explore'); }} className="shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition">Tất cả</button>
              {genres.slice(0, 12).map(g => (
                <button key={g.id} onClick={() => jumpToGenre(g.slug)} className="shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold bg-[#121218] border border-white/5 text-zinc-300 hover:text-white hover:border-rose-500/30 transition shadow-sm">{g.name}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 pb-24 space-y-8">
        {activeTab === 'home' && (
          <>
            {featuredComics.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-black flex items-center gap-2 text-white">
                    <span className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                      <Flame className="w-4 h-4 text-rose-500" />
                    </span>
                    Đề Cử Nổi Bật
                  </h2>
                </div>

                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
                  {featuredComics.map((item, idx) => (
                    <button key={item.slug} onClick={() => openComic(item.slug)} className="snap-start shrink-0 w-36 sm:w-48 group text-left relative rounded-2xl overflow-hidden shadow-lg border border-white/5 hover:border-rose-500/50 transition duration-300">
                      <div className="aspect-[2/3] bg-zinc-900">
                        <img src={resolveAssetUrl(item.cover_url)} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition duration-500 ease-out" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-black text-white">TOP #{idx + 1}</span>
                        <div className="absolute bottom-3 inset-x-3">
                          <p className="text-[13px] font-black text-white line-clamp-2 leading-snug">{item.title}</p>
                          <p className="text-[10px] text-rose-400 font-bold mt-1">{item.latest_chapter !== null ? `Ch.${item.latest_chapter}` : 'Mới'}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {historyList.length > 0 && (
              <section className="p-5 rounded-3xl bg-[#121218] border border-white/5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-black flex items-center gap-2 text-zinc-100">
                    <History className="w-4 h-4 text-violet-400" /> Đọc tiếp gần đây
                  </h2>
                  <button onClick={() => { setLibrarySubTab('history'); navigateTab('library'); }} className="text-[11px] font-black uppercase text-zinc-500 hover:text-violet-400 transition">Tất cả ({historyList.length})</button>
                </div>

                <div className="flex gap-3 overflow-x-auto no-scrollbar">
                  {historyList.slice(0, 6).map((h) => {
                    const pct = h.progress || 0;
                    return (
                      <div key={h.slug} className="shrink-0 w-64 p-2.5 rounded-2xl bg-[#181822] border border-white/5 flex items-center gap-3 hover:bg-white/[0.03] transition">
                        <button onClick={() => openComic(h.slug)} className="w-12 h-16 rounded-xl overflow-hidden bg-[#09090c] shrink-0 relative">
                          {h.cover_url && <img src={resolveAssetUrl(h.cover_url)} alt="" className="w-full h-full object-cover" />}
                        </button>
                        <div className="min-w-0 flex-1 space-y-1">
                          <button onClick={() => openComic(h.slug)} className="text-[13px] font-bold text-zinc-200 hover:text-white truncate block w-full text-left">{h.title}</button>
                          
                          <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden">
                             <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[9px] text-zinc-500 font-bold">{pct}%</span>
                            <button onClick={() => h.chapter_id > 0 ? openChapter(h.chapter_id) : openComic(h.slug)} className="text-[10px] font-black text-violet-400 hover:text-violet-300">Đọc Ch.{h.chapter_number}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-8 xl:col-span-9 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-pink-400" />
                    </span>
                    Mới Cập Nhật
                  </h2>
                  <div className="flex items-center bg-[#121218] p-1 rounded-xl border border-white/5 text-[11px]">
                    {[ { key: 'latest', label: 'Mới' }, { key: 'rating', label: 'VIP' }, { key: 'top-day', label: 'Hot' } ].map(s => (
                      <button key={s.key} onClick={() => { setSortMode(s.key); setPage(1); }} className={`px-4 py-1.5 rounded-lg font-bold transition ${sortMode === s.key ? 'bg-rose-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, idx) => <SkeletonComic key={idx} />)}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {comics.map(item => <ComicCard key={item.slug} item={item} onSelect={openComic} lastReadChapter={readHistory[item.slug]?.chapter_number} />)}
                    </div>
                    {pagination.totalPages > 1 && (
                      <div className="pt-6 flex justify-center gap-2">
                        <button disabled={page <= 1} onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0 }); }} className="px-4 py-2 rounded-xl bg-[#121218] border border-white/5 text-xs font-bold disabled:opacity-30">←</button>
                        <span className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-black border border-rose-500/20">{page} / {pagination.totalPages}</span>
                        <button disabled={page >= pagination.totalPages} onClick={() => { setPage(p => Math.min(pagination.totalPages, p + 1)); window.scrollTo({ top: 0 }); }} className="px-4 py-2 rounded-xl bg-[#121218] border border-white/5 text-xs font-bold disabled:opacity-30">→</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <aside className="lg:col-span-4 xl:col-span-3 bg-[#121218] rounded-3xl border border-white/5 p-5 lg:sticky lg:top-24 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black flex items-center gap-2 text-white">
                    <Trophy className="w-4 h-4 text-amber-400" /> Bảng Xếp Hạng
                  </h3>
                </div>
                <div className="flex gap-1 bg-[#09090c] p-1 rounded-xl border border-white/5 text-[10px] mb-4">
                  {[ { key: 'top-day', label: 'Ngày' }, { key: 'top-week', label: 'Tuần' }, { key: 'top-month', label: 'Tháng' } ].map(t => (
                    <button key={t.key} onClick={() => setSidebarTopPeriod(t.key as any)} className={`flex-1 py-1.5 rounded-lg font-black uppercase tracking-wider ${sidebarTopPeriod === t.key ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  {sidebarTopComics.map((item, idx) => {
                    const rank = idx + 1;
                    return (
                      <button key={item.slug} onClick={() => openComic(item.slug)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.03] text-left group transition">
                        <span className={`w-6 text-center font-black text-base shrink-0 ${rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-zinc-300' : rank === 3 ? 'text-orange-400' : 'text-zinc-700'}`}>
                          {rank}
                        </span>
                        <img src={resolveAssetUrl(item.cover_url)} alt="" className="w-12 h-16 rounded-xl object-cover bg-[#09090c] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-zinc-200 group-hover:text-rose-400 truncate">{item.title}</p>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="text-rose-400 font-bold">{item.latest_chapter !== null ? `Ch.${item.latest_chapter}` : 'Mới'}</span>
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatCompactNumber(item.views_total)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
          </>
        )}

        {activeTab === 'explore' && (
          <section className="space-y-6">
            <div className="bg-[#121218] p-5 rounded-3xl border border-white/5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setFilterDrawerOpen(v => !v)} className="text-base font-black flex items-center gap-2 text-white">
                  <SlidersHorizontal className="w-5 h-5 text-rose-500" />
                  Bộ Lọc Truyện
                  {activeFilterCount > 0 && <span className="px-2 py-0.5 rounded-md bg-rose-500 text-[10px] font-black text-white">{activeFilterCount}</span>}
                </button>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && <button onClick={resetAllFilters} className="flex items-center gap-1 text-[11px] font-black uppercase text-rose-400 hover:text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-lg"><RotateCcw className="w-3 h-3" /> Xóa lọc</button>}
                  <button onClick={() => setFilterDrawerOpen(v => !v)} className="text-[11px] font-black uppercase text-zinc-500 bg-white/5 px-3 py-1.5 rounded-lg">{filterDrawerOpen ? 'Thu gọn' : 'Mở rộng'}</button>
                </div>
              </div>

              {filterDrawerOpen && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Tình trạng</label>
                      <div className="grid grid-cols-3 gap-1 bg-[#09090c] p-1 rounded-xl">
                        {[ { key: 'all', label: 'Tất cả' }, { key: 'ongoing', label: 'Đang ra' }, { key: 'completed', label: 'Full' } ].map(st => (
                          <button key={st.key} onClick={() => { setStatusFilter(st.key as any); setPage(1); }} className={`py-2 rounded-lg text-xs font-bold transition ${statusFilter === st.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{st.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Sắp xếp</label>
                      <div className="grid grid-cols-3 gap-1 bg-[#09090c] p-1 rounded-xl">
                        {[ { key: 'latest', label: 'Mới' }, { key: 'top-week', label: 'Hot' }, { key: 'rating', label: 'Điểm' } ].map(so => (
                          <button key={so.key} onClick={() => { setSortMode(so.key); setPage(1); }} className={`py-2 rounded-lg text-xs font-bold transition ${sortMode === so.key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{so.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block">Thể loại</label>
                      <span className="text-[9px] text-zinc-600 font-bold">1 chạm: Thích | 2 chạm: Loại trừ</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {genres.map(g => {
                        const st = genreStates[g.slug] || 'neutral';
                        return (
                          <button key={g.id} onClick={() => cycleGenreState(g.slug)} className={`text-[11px] px-3 py-1.5 rounded-lg font-bold border transition ${st === 'include' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : st === 'exclude' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400 line-through' : 'bg-transparent border-white/5 text-zinc-400 hover:border-white/20'}`}>
                            {st === 'include' ? '✓ ' : st === 'exclude' ? '× ' : ''}{g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-zinc-500 font-bold px-2">Tìm thấy <span className="text-white">{pagination.total}</span> kết quả</div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, idx) => <SkeletonComic key={idx} />)}
              </div>
            ) : comics.length === 0 ? (
              <div className="text-center py-20 bg-[#121218] rounded-3xl border border-white/5">
                <p className="text-sm font-bold text-zinc-400 mb-4">Không có bộ truyện nào khớp với lọc hiện tại.</p>
                <button onClick={resetAllFilters} className="px-5 py-2.5 rounded-xl bg-rose-600 font-black text-xs text-white">Xóa lọc ngay</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  {comics.map(item => <ComicCard key={item.slug} item={item} onSelect={openComic} lastReadChapter={readHistory[item.slug]?.chapter_number} />)}
                </div>
                {pagination.totalPages > 1 && (
                  <div className="pt-6 flex justify-center gap-2">
                    <button disabled={page <= 1} onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0 }); }} className="px-4 py-2 rounded-xl bg-[#121218] border border-white/5 text-xs font-bold disabled:opacity-30">←</button>
                    <span className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-black border border-rose-500/20">{page} / {pagination.totalPages}</span>
                    <button disabled={page >= pagination.totalPages} onClick={() => { setPage(p => Math.min(pagination.totalPages, p + 1)); window.scrollTo({ top: 0 }); }} className="px-4 py-2 rounded-xl bg-[#121218] border border-white/5 text-xs font-bold disabled:opacity-30">→</button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'ranking' && (
          <section className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#121218] p-2 rounded-3xl border border-white/5">
              {[ { key: 'top-day', label: 'Top Ngày' }, { key: 'top-week', label: 'Top Tuần' }, { key: 'top-month', label: 'Top Tháng' }, { key: 'rating', label: 'Điểm Cao' } ].map(tab => (
                <button key={tab.key} onClick={() => { setSortMode(tab.key); setPage(1); }} className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition ${sortMode === tab.key ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            {!loading && comics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {comics.map((item, idx) => <ComicCard key={item.slug} item={item} onSelect={openComic} rankBadge={(page - 1) * 24 + idx + 1} lastReadChapter={readHistory[item.slug]?.chapter_number} />)}
              </div>
            )}
          </section>
        )}

        {activeTab === 'library' && (
          <section className="space-y-6">
            <div className="grid grid-cols-2 gap-2 bg-[#121218] p-2 rounded-2xl border border-white/5 max-w-sm mx-auto">
              <button onClick={() => setLibrarySubTab('bookmarks')} className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition ${librarySubTab === 'bookmarks' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white'}`}>Đã lưu ({bookmarks.length})</button>
              <button onClick={() => setLibrarySubTab('history')} className={`py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition ${librarySubTab === 'history' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-white'}`}>Lịch sử ({historyList.length})</button>
            </div>

            {librarySubTab === 'bookmarks' ? (
              bookmarks.length === 0 ? <div className="text-center py-20 text-sm font-bold text-zinc-500">Chưa có truyện nào trong tủ.</div> : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  {bookmarks.map(item => <ComicCard key={item.slug} item={item} onSelect={openComic} lastReadChapter={readHistory[item.slug]?.chapter_number} />)}
                </div>
              )
            ) : historyList.length === 0 ? (
              <div className="text-center py-20 text-sm font-bold text-zinc-500">Chưa có lịch sử đọc.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyList.map(h => (
                  <div key={h.slug} className="p-4 rounded-3xl bg-[#121218] border border-white/5 flex items-center gap-4 group hover:bg-[#1a1a24] transition">
                    <button onClick={() => openComic(h.slug)} className="w-16 h-24 rounded-2xl overflow-hidden bg-zinc-900 shrink-0 relative shadow-md">
                      {h.cover_url && <img src={resolveAssetUrl(h.cover_url)} alt="" className="w-full h-full object-cover group-hover:scale-110 transition" />}
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                      <button onClick={() => openComic(h.slug)} className="text-sm font-black text-zinc-100 hover:text-rose-400 line-clamp-2 text-left block w-full leading-snug">{h.title}</button>
                      <div className="space-y-1">
                         <div className="flex justify-between text-[9px] font-bold text-zinc-500">
                           <span>Đã đọc: {h.progress || 0}%</span>
                           <span>{formatTimeAgo(h.read_at)}</span>
                         </div>
                         <div className="w-full bg-black/40 rounded-full h-1.5">
                            <div className="h-full bg-violet-500 rounded-full" style={{width: `${h.progress || 0}%`}} />
                         </div>
                      </div>
                      <div className="pt-1 flex gap-2">
                        <button onClick={() => h.chapter_id > 0 ? openChapter(h.chapter_id) : openComic(h.slug)} className="flex-1 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[10px] font-black uppercase tracking-wider transition">Ch.{h.chapter_number}</button>
                        <button onClick={() => removeHistoryItem(h.slug)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="fixed bottom-24 md:bottom-8 right-5 z-40 w-12 h-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/30 flex items-center justify-center backdrop-blur-md transition-all hover:-translate-y-1">
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#09090c]/90 backdrop-blur-2xl border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {[ { key: 'home', label: 'Trang chủ', icon: Home }, { key: 'explore', label: 'Khám phá', icon: Compass }, { key: 'ranking', label: 'Xếp hạng', icon: Trophy }, { key: 'library', label: 'Tủ sách', icon: Bookmark } ].map(nav => {
            const Icon = nav.icon;
            const active = activeTab === nav.key;
            return (
              <button key={nav.key} onClick={() => navigateTab(nav.key as TabKey)} className={`relative flex flex-col items-center justify-center gap-1 w-full h-full transition ${active ? 'text-rose-500' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'fill-rose-500/20' : ''}`} />
                  {nav.key === 'library' && unreadBookmarkCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center shadow">
                      {unreadBookmarkCount}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-black uppercase">{nav.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
