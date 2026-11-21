import React, { useEffect, useState, useRef, useMemo } from 'react';
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
      className="group text-left flex flex-col bg-[#121218] hover:bg-[#171720] rounded-xl overflow-hidden border border-white/[0.06] hover:border-rose-500/40 transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-rose-500/5"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#181822]">
        {item.cover_url ? (
          <img
            src={resolveAssetUrl(item.cover_url)}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500 p-3 text-center">
            {item.title}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

        {typeof rankBadge === 'number' ? (
          <span
            className={`absolute top-2 left-2 w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shadow-md ${
              rankBadge === 1
                ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-black'
                : rankBadge === 2
                ? 'bg-gradient-to-br from-zinc-200 to-zinc-400 text-black'
                : rankBadge === 3
                ? 'bg-gradient-to-br from-orange-400 to-amber-700 text-white'
                : 'bg-black/80 text-zinc-200 border border-white/10'
            }`}
          >
            {rankBadge}
          </span>
        ) : (
          <span
            className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase backdrop-blur-md ${
              item.status === 'completed'
                ? 'bg-emerald-500/85 text-white'
                : 'bg-rose-600/85 text-white'
            }`}
          >
            {item.status === 'completed' ? 'Full' : 'Hot'}
          </span>
        )}

        {typeof lastReadChapter === 'number' && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-violet-600/90 text-white text-[10px] font-bold shadow">
            Đọc Ch.{lastReadChapter}
          </span>
        )}

        <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[10px] text-zinc-200 font-medium">
          <span className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded">
            <Eye className="w-3 h-3 text-rose-400" />
            {formatCompactNumber(item.views_total)}
          </span>
          <span className="flex items-center gap-0.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-amber-400">
            <Star className="w-3 h-3 fill-amber-400" />
            {Number(item.rating_avg || 5).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5">
        <h3 className="text-xs sm:text-[13px] font-bold line-clamp-2 leading-snug text-zinc-100 group-hover:text-rose-400 transition-colors">
          {item.title}
        </h3>

        <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/[0.05] text-[11px]">
          <span className="font-semibold text-rose-400 truncate">
            {item.latest_chapter !== null ? `Chapter ${item.latest_chapter}` : 'Sắp ra mắt'}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0">
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
    page: 1,
    limit: 24,
    total: 0,
    totalPages: 1,
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

  const [readerData, setReaderData] = useState<{
    chapter: {
      id: number;
      comic_id: number;
      chapter_number: number;
      title: string;
      comic_slug: string;
      comic_title: string;
    };
    prev_chapter: { id: number; chapter_number: number } | null;
    next_chapter: { id: number; chapter_number: number } | null;
    pages: PageItem[];
  } | null>(null);

  const [readMode, setReadMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<0 | 1 | 2 | 3>(0);
  const [readerChapterDrawerOpen, setReaderChapterDrawerOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [bookmarks, setBookmarks] = useState<ComicSummary[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vr_bookmarks') || '[]');
    } catch {
      return [];
    }
  });

  const [readHistory, setReadHistory] = useState<Record<string, HistoryItem>>(() => {
    try {
      const v2 = JSON.parse(localStorage.getItem('vr_history_v2') || '{}');
      if (v2 && typeof v2 === 'object' && Object.keys(v2).length > 0) return v2;
      const legacy = JSON.parse(localStorage.getItem('vr_history') || '{}');
      const migrated: Record<string, HistoryItem> = {};
      for (const [slug, chNum] of Object.entries(legacy || {})) {
        migrated[slug] = {
          slug,
          title: slug,
          cover_url: '',
          chapter_id: 0,
          chapter_number: Number(chNum),
          read_at: Date.now(),
        };
      }
      return migrated;
    } catch {
      return {};
    }
  });

  const autoScrollRef = useRef<number | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchGenres().then(setGenres).catch(() => {});
    fetchComics({ page: 1, limit: 10, sort: 'top-week' })
      .then((res) => {
        if (res.success) setFeaturedComics(res.data || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchComics({ page: 1, limit: 8, sort: sidebarTopPeriod })
      .then((res) => {
        if (res.success) setSidebarTopComics(res.data || []);
      })
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
        .then((res) => {
          if (res.success) setQuickResults(res.data || []);
        })
        .catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const applyHashRoute = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('/truyen/')) {
        const slug = decodeURIComponent(hash.replace('/truyen/', ''));
        if (slug && selectedComic?.slug !== slug) {
          openComic(slug, false);
        }
      } else if (hash.startsWith('/doc/')) {
        const chId = Number(hash.replace('/doc/', ''));
        if (Number.isFinite(chId) && chId > 0 && readerData?.chapter.id !== chId) {
          openChapter(chId, false);
        }
      } else if (hash === '/the-loai') {
        setSelectedComic(null);
        setReaderData(null);
        setActiveTab('explore');
      } else if (hash === '/bxh') {
        setSelectedComic(null);
        setReaderData(null);
        setActiveTab('ranking');
      } else if (hash === '/tu-truyen') {
        setSelectedComic(null);
        setReaderData(null);
        setActiveTab('library');
      } else if (hash === '' || hash === '/') {
        setSelectedComic(null);
        setReaderData(null);
        setActiveTab('home');
      }
    };

    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const inc = Object.entries(genreStates)
      .filter(([, st]) => st === 'include')
      .map(([slug]) => slug);
    const exc = Object.entries(genreStates)
      .filter(([, st]) => st === 'exclude')
      .map(([slug]) => slug);

    const effectiveSort =
      activeTab === 'ranking' && !sortMode.startsWith('top') && sortMode !== 'rating'
        ? 'top-day'
        : sortMode;

    fetchComics({
      page,
      limit: 24,
      q: searchQuery,
      sort: effectiveSort,
      status: statusFilter,
      inc,
      exc,
    })
      .then((res) => {
        if (!cancelled && res.success) {
          setComics(res.data || []);
          if (res.pagination) {
            setPagination(res.pagination);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, searchQuery, sortMode, statusFilter, genreStates, activeTab]);

  useEffect(() => {
    if (!readerData) return;
    const nextIndexes = [currentPageIdx + 1, currentPageIdx + 2];
    nextIndexes.forEach((idx) => {
      const p = readerData.pages[idx];
      if (p?.url) {
        const img = new Image();
        img.src = resolveAssetUrl(p.url);
      }
    });
  }, [readerData, currentPageIdx]);

  useEffect(() => {
    if (autoScrollSpeed > 0 && readerData && readMode === 'vertical') {
      const stepPx = autoScrollSpeed === 1 ? 2 : autoScrollSpeed === 2 ? 4 : 7;
      autoScrollRef.current = window.setInterval(() => {
        window.scrollBy({ top: stepPx, behavior: 'auto' });
      }, 16);
    } else if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [autoScrollSpeed, readerData, readMode]);

  useEffect(() => {
    if (!readerData) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (readMode === 'horizontal' && currentPageIdx > 0) {
          setCurrentPageIdx((p) => p - 1);
        } else if (readerData.prev_chapter) {
          openChapter(readerData.prev_chapter.id);
        }
      } else if (e.key === 'ArrowRight') {
        if (readMode === 'horizontal' && currentPageIdx < readerData.pages.length - 1) {
          setCurrentPageIdx((p) => p + 1);
        } else if (readerData.next_chapter) {
          openChapter(readerData.next_chapter.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readerData, readMode, currentPageIdx]);

  const navigateTab = (tab: TabKey) => {
    setSelectedComic(null);
    setReaderData(null);
    setActiveTab(tab);
    setPage(1);
    const hashMap: Record<TabKey, string> = {
      home: '#/',
      explore: '#/the-loai',
      ranking: '#/bxh',
      library: '#/tu-truyen',
    };
    window.history.replaceState(null, '', hashMap[tab]);
    window.scrollTo({ top: 0 });
  };

  const cycleGenreState = (slug: string) => {
    setPage(1);
    setGenreStates((prev) => {
      const cur = prev[slug] || 'neutral';
      const next: GenreFilterState =
        cur === 'neutral' ? 'include' : cur === 'include' ? 'exclude' : 'neutral';
      return { ...prev, [slug]: next };
    });
  };

  const jumpToGenre = (slug: string) => {
    setSelectedComic(null);
    setReaderData(null);
    setGenreStates({ [slug]: 'include' });
    setStatusFilter('all');
    setSearchQuery('');
    setPage(1);
    setActiveTab('explore');
    window.history.replaceState(null, '', '#/the-loai');
    window.scrollTo({ top: 0 });
  };

  const resetAllFilters = () => {
    setGenreStates({});
    setStatusFilter('all');
    setSearchQuery('');
    setSortMode('latest');
    setPage(1);
  };

  const openComic = async (slug: string, pushHash = true) => {
    setLoading(true);
    setSearchFocused(false);
    try {
      const detail = await fetchComicDetail(slug);
      setSelectedComic(detail);
      setReaderData(null);
      setChapterSearch('');
      setDescExpanded(false);
      if (pushHash) {
        window.location.hash = `/truyen/${encodeURIComponent(slug)}`;
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openChapter = async (chapterId: number, pushHash = true) => {
    setLoading(true);
    setReaderChapterDrawerOpen(false);
    try {
      const data = await fetchChapterPages(chapterId);
      setReaderData(data);
      setCurrentPageIdx(0);
      setHudVisible(true);
      setAutoScrollSpeed(0);
      if (pushHash) {
        window.location.hash = `/doc/${chapterId}`;
      }
      window.scrollTo({ top: 0 });

      recordComicView(data.chapter.comic_id);

      const knownComic =
        selectedComic?.slug === data.chapter.comic_slug
          ? selectedComic
          : comics.find((c) => c.slug === data.chapter.comic_slug) ||
            featuredComics.find((c) => c.slug === data.chapter.comic_slug);

      const updatedEntry: HistoryItem = {
        slug: data.chapter.comic_slug,
        title: data.chapter.comic_title,
        cover_url: knownComic?.cover_url || readHistory[data.chapter.comic_slug]?.cover_url || '',
        chapter_id: data.chapter.id,
        chapter_number: data.chapter.chapter_number,
        read_at: Date.now(),
      };
      const updatedHistory = {
        ...readHistory,
        [data.chapter.comic_slug]: updatedEntry,
      };
      setReadHistory(updatedHistory);
      localStorage.setItem('vr_history_v2', JSON.stringify(updatedHistory));

      if (!selectedComic || selectedComic.slug !== data.chapter.comic_slug) {
        fetchComicDetail(data.chapter.comic_slug).then(setSelectedComic).catch(() => {});
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBookmark = (comic: ComicDetail) => {
    const exists = bookmarks.some((b) => b.slug === comic.slug);
    const updated = exists
      ? bookmarks.filter((b) => b.slug !== comic.slug)
      : [comic, ...bookmarks];
    setBookmarks(updated);
    localStorage.setItem('vr_bookmarks', JSON.stringify(updated));
  };

  const removeHistoryItem = (slug: string) => {
    const copy = { ...readHistory };
    delete copy[slug];
    setReadHistory(copy);
    localStorage.setItem('vr_history_v2', JSON.stringify(copy));
  };

  const historyList = useMemo(
    () => Object.values(readHistory).sort((a, b) => b.read_at - a.read_at),
    [readHistory]
  );

  const activeFilterCount = useMemo(() => {
    const genreCount = Object.values(genreStates).filter((v) => v !== 'neutral').length;
    return genreCount + (statusFilter !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0);
  }, [genreStates, statusFilter, searchQuery]);

  if (readerData) {
    const totalPages = readerData.pages.length;

    const handleReaderTap = (e: React.MouseEvent<HTMLDivElement>) => {
      if (readerChapterDrawerOpen) {
        setReaderChapterDrawerOpen(false);
        return;
      }
      const width = window.innerWidth;
      const x = e.clientX;
      if (readMode === 'horizontal') {
        if (x < width * 0.3) {
          setCurrentPageIdx((p) => Math.max(0, p - 1));
          return;
        }
        if (x > width * 0.7) {
          setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1));
          return;
        }
      }
      setHudVisible((v) => !v);
    };

    return (
      <div className="min-h-screen bg-[#050507] text-zinc-100 select-none">
        {hudVisible && (
          <header className="fixed top-0 inset-x-0 z-50 bg-[#0d0d12]/95 backdrop-blur-lg border-b border-white/10 px-3 py-2.5">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setAutoScrollSpeed(0);
                  openComic(readerData.chapter.comic_slug);
                }}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-rose-400 hover:text-rose-300 active:scale-95 min-w-0"
              >
                <ChevronLeft className="w-5 h-5 shrink-0" />
                <span className="truncate">{readerData.chapter.comic_title}</span>
              </button>

              <button
                onClick={() => setReaderChapterDrawerOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 shrink-0"
              >
                <span>Chap {readerData.chapter.chapter_number}</span>
                <ChevronDown className="w-3.5 h-3.5 text-rose-400" />
              </button>
            </div>
          </header>
        )}

        {readerChapterDrawerOpen && selectedComic && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full max-w-md bg-[#121218] border border-white/10 rounded-t-2xl sm:rounded-2xl max-h-[75vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold">
                  Chọn chương ({selectedComic.chapters.length})
                </span>
                <button
                  onClick={() => setReaderChapterDrawerOpen(false)}
                  className="p-1 rounded-lg bg-white/10 text-zinc-300"
                >
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
                      className={`py-2 px-2 rounded-lg text-xs font-semibold truncate border ${
                        isCurrent
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-[#181822] border-white/5 text-zinc-300 hover:border-rose-500/40'
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
          onClick={handleReaderTap}
          className="pt-14 pb-28 flex flex-col items-center justify-center min-h-screen"
        >
          {totalPages === 0 ? (
            <p className="text-zinc-400 text-sm py-20">Chương này chưa có dữ liệu trang ảnh.</p>
          ) : readMode === 'vertical' ? (
            <>
              <div style={{ width: `${zoomPercent}%` }} className="max-w-3xl flex flex-col">
                {readerData.pages.map((p) => (
                  <div
                    key={p.index}
                    style={{ aspectRatio: p.width && p.height ? `${p.width} / ${p.height}` : undefined }}
                    className="w-full bg-[#0e0e14] overflow-hidden"
                  >
                    <img
                      src={resolveAssetUrl(p.url)}
                      alt={`Trang ${p.index + 1}`}
                      loading={p.index < 2 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-contain block"
                    />
                  </div>
                ))}
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xl px-4 mt-8 space-y-3"
              >
                <div className="p-4 rounded-2xl bg-[#121218] border border-white/10 text-center space-y-3">
                  <p className="text-xs text-zinc-400">
                    Bạn đã đọc xong <strong className="text-zinc-100">Chapter {readerData.chapter.chapter_number}</strong>
                  </p>
                  <div className="flex gap-2.5">
                    <button
                      disabled={!readerData.prev_chapter}
                      onClick={() => readerData.prev_chapter && openChapter(readerData.prev_chapter.id)}
                      className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-30 font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Chap trước
                    </button>
                    <button
                      disabled={!readerData.next_chapter}
                      onClick={() => readerData.next_chapter && openChapter(readerData.next_chapter.id)}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 disabled:opacity-30 font-bold text-xs flex items-center justify-center gap-1 shadow-lg shadow-rose-500/20"
                    >
                      Chap sau <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full max-w-4xl flex flex-col items-center px-2">
              <img
                src={resolveAssetUrl(readerData.pages[currentPageIdx]?.url || '')}
                alt={`Trang ${currentPageIdx + 1}`}
                className="max-h-[82vh] w-auto object-contain rounded"
              />
              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                <span>
                  Trang <strong className="text-white">{currentPageIdx + 1}</strong> / {totalPages}
                </span>
                <span>•</span>
                <span>Chạm cạnh trái/phải hoặc dùng phím ← →</span>
              </div>
            </div>
          )}
        </div>

        {hudVisible && (
          <footer className="fixed bottom-0 inset-x-0 z-50 bg-[#0d0d12]/95 backdrop-blur-lg border-t border-white/10 px-4 py-3">
            <div className="max-w-3xl mx-auto space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => setReadMode((m) => (m === 'vertical' ? 'horizontal' : 'vertical'))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 font-semibold"
                >
                  <Layers className="w-4 h-4 text-rose-400" />
                  {readMode === 'vertical' ? 'Cuộn dọc' : 'Lật trang'}
                </button>

                {readMode === 'vertical' && (
                  <>
                    <div className="flex items-center gap-2 flex-1 max-w-[170px]">
                      <span className="text-zinc-400 shrink-0">{zoomPercent}%</span>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={5}
                        value={zoomPercent}
                        onChange={(e) => setZoomPercent(Number(e.target.value))}
                        className="w-full accent-rose-500"
                      />
                    </div>

                    <button
                      onClick={() =>
                        setAutoScrollSpeed((s) => ((s + 1) % 4) as 0 | 1 | 2 | 3)
                      }
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold ${
                        autoScrollSpeed > 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-white/10 text-zinc-200'
                      }`}
                    >
                      {autoScrollSpeed > 0 ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      {autoScrollSpeed > 0 ? `Cuộn ${autoScrollSpeed}x` : 'Tự cuộn'}
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  disabled={!readerData.prev_chapter}
                  onClick={() => readerData.prev_chapter && openChapter(readerData.prev_chapter.id)}
                  className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-30 font-bold text-xs flex items-center justify-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Chap trước
                </button>
                <button
                  onClick={() => setReaderChapterDrawerOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 font-bold text-xs flex items-center justify-center gap-1"
                  title="Danh sách chương"
                >
                  <List className="w-4 h-4 text-rose-400" />
                </button>
                <button
                  disabled={!readerData.next_chapter}
                  onClick={() => readerData.next_chapter && openChapter(readerData.next_chapter.id)}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 disabled:opacity-30 font-bold text-xs flex items-center justify-center gap-1 shadow-md shadow-rose-500/20"
                >
                  Chap sau <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </footer>
        )}
      </div>
    );
  }

  if (selectedComic) {
    const isBookmarked = bookmarks.some((b) => b.slug === selectedComic.slug);
    const historyEntry = readHistory[selectedComic.slug];

    const filteredChapters = selectedComic.chapters.filter((ch) => {
      if (!chapterSearch.trim()) return true;
      const q = chapterSearch.trim().toLowerCase();
      return (
        String(ch.chapter_number).includes(q) ||
        (ch.title || '').toLowerCase().includes(q)
      );
    });

    const orderedChapters = chapterOrderAsc
      ? [...filteredChapters].reverse()
      : filteredChapters;

    const firstChapter =
      selectedComic.chapters.length > 0
        ? selectedComic.chapters[selectedComic.chapters.length - 1]
        : null;
    const latestChapter =
      selectedComic.chapters.length > 0 ? selectedComic.chapters[0] : null;
    const resumeChapter = historyEntry
      ? selectedComic.chapters.find(
          (c) =>
            c.id === historyEntry.chapter_id ||
            c.chapter_number === historyEntry.chapter_number
        )
      : null;

    return (
      <div className="min-h-screen bg-[#09090c] pb-20">
        <div className="relative overflow-hidden border-b border-white/[0.06]">
          {selectedComic.cover_url && (
            <img
              src={resolveAssetUrl(selectedComic.cover_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-25 scale-110 pointer-events-none"
            />
          )}
          <div className="relative z-10 max-w-5xl mx-auto px-4 pt-4 pb-6 bg-gradient-to-b from-black/50 via-[#09090c]/85 to-[#09090c]">
            <div className="flex items-center justify-between gap-2 mb-4">
              <button
                onClick={() => navigateTab(activeTab)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full transition"
              >
                <ChevronLeft className="w-4 h-4 text-rose-400" /> Quay lại
              </button>
              <span className="text-[11px] text-zinc-400 truncate max-w-[220px]">
                Trang chủ / {selectedComic.title}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-5">
              <div className="w-32 sm:w-44 mx-auto sm:mx-0 aspect-[2/3] rounded-2xl overflow-hidden bg-[#14141c] shrink-0 border border-white/10 shadow-2xl">
                {selectedComic.cover_url ? (
                  <img
                    src={resolveAssetUrl(selectedComic.cover_url)}
                    alt={selectedComic.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">
                    No Cover
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <h1 className="text-xl sm:text-2xl font-extrabold leading-snug text-white">
                  {selectedComic.title}
                </h1>

                {selectedComic.alt_titles && (
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                    <span className="text-zinc-500 font-semibold">Tên khác:</span>{' '}
                    {selectedComic.alt_titles}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs">
                  <span
                    className={`px-2.5 py-1 rounded-lg font-bold ${
                      selectedComic.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {selectedComic.status === 'completed' ? 'Hoàn thành' : 'Đang tiến hành'}
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] text-amber-400 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {Number(selectedComic.rating_avg || 5).toFixed(1)} ({selectedComic.rating_count || 1})
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] text-zinc-300">
                    <Eye className="w-3.5 h-3.5 text-rose-400" />
                    {formatCompactNumber(selectedComic.views_total)} lượt xem
                  </span>
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] text-zinc-300">
                    <List className="w-3.5 h-3.5 text-violet-400" />
                    {selectedComic.chapters.length} chương
                  </span>
                </div>

                {selectedComic.genres.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-1.5">
                    {selectedComic.genres.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => jumpToGenre(g.slug)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#161620] hover:bg-rose-500/20 text-zinc-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/40 transition"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2.5">
                  {resumeChapter && (
                    <button
                      onClick={() => openChapter(resumeChapter.id)}
                      className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-violet-600/20"
                    >
                      <Play className="w-4 h-4 fill-white" /> Đọc tiếp Ch.{resumeChapter.chapter_number}
                    </button>
                  )}

                  {firstChapter && (
                    <button
                      onClick={() => openChapter(firstChapter.id)}
                      className="flex-1 min-w-[130px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-95 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/20"
                    >
                      <BookOpen className="w-4 h-4" /> Đọc từ đầu
                    </button>
                  )}

                  {latestChapter && latestChapter.id !== firstChapter?.id && (
                    <button
                      onClick={() => openChapter(latestChapter.id)}
                      className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 font-bold text-xs sm:text-sm text-zinc-100"
                    >
                      Mới nhất (Ch.{latestChapter.chapter_number})
                    </button>
                  )}

                  <button
                    onClick={() => toggleBookmark(selectedComic)}
                    className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm border flex items-center justify-center gap-1.5 transition ${
                      isBookmarked
                        ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                        : 'bg-[#14141c] border-white/10 text-zinc-200 hover:border-rose-500/40'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-rose-400' : ''}`} />
                    {isBookmarked ? 'Đang theo dõi' : 'Theo dõi'}
                  </button>
                </div>
              </div>
            </div>

            {selectedComic.description && (
              <div className="mt-5 p-3.5 rounded-2xl bg-[#121218]/90 border border-white/[0.06]">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Nội dung truyện
                </h2>
                <p
                  className={`text-xs sm:text-[13px] text-zinc-300 leading-relaxed ${
                    descExpanded ? '' : 'line-clamp-3'
                  }`}
                >
                  {selectedComic.description}
                </p>
                {selectedComic.description.length > 180 && (
                  <button
                    onClick={() => setDescExpanded((v) => !v)}
                    className="mt-1.5 text-xs font-semibold text-rose-400 flex items-center gap-1"
                  >
                    {descExpanded ? (
                      <>
                        Thu gọn <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        Xem thêm <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
            <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
              <List className="w-4 h-4 text-rose-500" />
              Danh sách chương ({selectedComic.chapters.length})
            </h2>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Tìm số chap..."
                  className="w-32 sm:w-40 bg-[#121218] border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                />
              </div>
              <button
                onClick={() => setChapterOrderAsc((o) => !o)}
                className="flex items-center gap-1 text-xs font-semibold text-zinc-300 bg-[#121218] hover:bg-[#181822] px-3 py-1.5 rounded-lg border border-white/10"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-rose-400" />
                {chapterOrderAsc ? 'Cũ nhất' : 'Mới nhất'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {orderedChapters.map((ch) => {
              const isLastRead = historyEntry?.chapter_number === ch.chapter_number;
              return (
                <button
                  key={ch.id}
                  onClick={() => openChapter(ch.id)}
                  className={`text-left px-3.5 py-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                    isLastRead
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : 'bg-[#121218] hover:bg-[#181822] border-white/[0.06] text-zinc-100'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-xs sm:text-sm font-bold block truncate">
                      Chapter {ch.chapter_number}
                    </span>
                    {isLastRead && (
                      <span className="text-[10px] font-semibold text-rose-400">
                        Đang đọc dở
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 text-[10px] text-zinc-500">
                    <div>{formatTimeAgo(ch.created_at)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090c] text-zinc-100">
      <header className="sticky top-0 z-40 bg-[#09090c]/90 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              resetAllFilters();
              navigateTab('home');
            }}
            className="flex items-center gap-2 shrink-0 group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center font-black text-white shadow-lg shadow-rose-500/25 group-hover:scale-105 transition">
              V
            </div>
            <div className="text-left">
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-rose-200 to-rose-400 bg-clip-text text-transparent block leading-none">
                VinaReader
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 hidden sm:block">
                AVIF Ultra Reader
              </span>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1 bg-[#121218] p-1 rounded-xl border border-white/[0.06]">
            {[
              { key: 'home', label: 'Trang chủ', icon: Home },
              { key: 'explore', label: 'Thể loại & Lọc', icon: Compass },
              { key: 'ranking', label: 'Bảng xếp hạng', icon: Trophy },
              {
                key: 'library',
                label: `Tủ truyện${bookmarks.length ? ` (${bookmarks.length})` : ''}`,
                icon: Bookmark,
              },
            ].map((nav) => {
              const Icon = nav.icon;
              const active = activeTab === nav.key;
              return (
                <button
                  key={nav.key}
                  onClick={() => navigateTab(nav.key as TabKey)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    active
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/20'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{nav.label}</span>
                </button>
              );
            })}
          </nav>

          <div ref={searchBoxRef} className="relative flex-1 max-w-xs sm:max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchFocused(true);
                setPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setSearchFocused(false);
                  setActiveTab('explore');
                }
              }}
              placeholder="Tìm tên truyện, tác giả..."
              className="w-full bg-[#13131b] border border-white/10 rounded-full pl-9 pr-8 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setQuickResults([]);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchFocused && searchQuery.trim() && (
              <div className="absolute right-0 left-0 mt-2 bg-[#14141d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                {quickResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Không tìm thấy kết quả nhanh cho "{searchQuery}"
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {quickResults.map((item) => (
                      <button
                        key={item.slug}
                        onClick={() => openComic(item.slug)}
                        className="w-full p-2.5 flex items-center gap-3 hover:bg-white/[0.05] text-left transition"
                      >
                        <img
                          src={resolveAssetUrl(item.cover_url)}
                          alt=""
                          className="w-10 h-14 rounded-lg object-cover bg-zinc-900 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 truncate">
                            {item.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                            <span className="text-rose-400 font-semibold">
                              {item.latest_chapter !== null ? `Chap ${item.latest_chapter}` : 'Mới'}
                            </span>
                            <span>•</span>
                            <span>{formatCompactNumber(item.views_total)} xem</span>
                          </div>
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setSearchFocused(false);
                        setActiveTab('explore');
                      }}
                      className="w-full py-2.5 text-center text-xs font-bold text-rose-400 hover:bg-rose-500/10"
                    >
                      Xem tất cả kết quả tìm kiếm →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {genres.length > 0 && (
          <div className="border-t border-white/[0.05] bg-[#0b0b10]/80">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => {
                  resetAllFilters();
                  navigateTab('home');
                }}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition ${
                  activeTab === 'home' && activeFilterCount === 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-white/[0.05] text-zinc-400 hover:text-white'
                }`}
              >
                Tất cả
              </button>
              {genres.slice(0, 16).map((g) => {
                const isSelected = genreStates[g.slug] === 'include';
                return (
                  <button
                    key={g.id}
                    onClick={() => jumpToGenre(g.slug)}
                    className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                      isSelected
                        ? 'bg-rose-600 text-white'
                        : 'bg-white/[0.05] hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-5 space-y-6">
        {activeTab === 'home' && (
          <>
            {featuredComics.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2 text-white">
                    <span className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                      <Flame className="w-4 h-4 text-rose-500 fill-rose-500" />
                    </span>
                    Truyện Đề Cử Hot Trong Tuần
                  </h2>
                  <button
                    onClick={() => navigateTab('ranking')}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300"
                  >
                    Xem BXH →
                  </button>
                </div>

                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 snap-x">
                  {featuredComics.map((item, idx) => (
                    <button
                      key={item.slug}
                      onClick={() => openComic(item.slug)}
                      className="snap-start shrink-0 w-36 sm:w-44 group text-left bg-[#121218] rounded-xl overflow-hidden border border-white/[0.07] hover:border-rose-500/50 transition"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
                        <img
                          src={resolveAssetUrl(item.cover_url)}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-gradient-to-r from-rose-500 to-pink-600 text-[10px] font-black text-white shadow">
                          TOP #{idx + 1}
                        </span>
                        <div className="absolute bottom-2 inset-x-2">
                          <p className="text-xs font-bold text-white line-clamp-1">
                            {item.title}
                          </p>
                          <p className="text-[10px] text-rose-400 font-semibold mt-0.5">
                            {item.latest_chapter !== null ? `Chapter ${item.latest_chapter}` : 'Đang cập nhật'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {historyList.length > 0 && (
              <section className="p-3.5 rounded-2xl bg-[#121218] border border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5 text-zinc-100">
                    <History className="w-4 h-4 text-violet-400" />
                    Đọc tiếp gần đây
                  </h2>
                  <button
                    onClick={() => {
                      setLibrarySubTab('history');
                      navigateTab('library');
                    }}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-rose-400"
                  >
                    Tất cả ({historyList.length})
                  </button>
                </div>

                <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                  {historyList.slice(0, 8).map((h) => (
                    <div
                      key={h.slug}
                      className="shrink-0 w-60 p-2 rounded-xl bg-[#181822] border border-white/[0.06] flex items-center gap-2.5"
                    >
                      <button
                        onClick={() => openComic(h.slug)}
                        className="w-11 h-14 rounded-lg overflow-hidden bg-zinc-900 shrink-0"
                      >
                        {h.cover_url && (
                          <img
                            src={resolveAssetUrl(h.cover_url)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => openComic(h.slug)}
                          className="text-xs font-bold text-zinc-100 hover:text-rose-400 truncate block w-full text-left"
                        >
                          {h.title}
                        </button>
                        <button
                          onClick={() =>
                            h.chapter_id > 0 ? openChapter(h.chapter_id) : openComic(h.slug)
                          }
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-violet-400 hover:text-violet-300"
                        >
                          <Play className="w-3 h-3 fill-violet-400" />
                          Đọc tiếp Ch.{h.chapter_number}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 xl:col-span-9 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-pink-400" />
                    </span>
                    Truyện Mới Cập Nhật
                  </h2>

                  <div className="flex items-center gap-1.5 bg-[#121218] p-1 rounded-xl border border-white/[0.06] text-[11px]">
                    {[
                      { key: 'latest', label: 'Mới nhất' },
                      { key: 'rating', label: 'Đánh giá cao' },
                      { key: 'top-day', label: 'Xem nhiều' },
                    ].map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          setSortMode(s.key);
                          setPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold transition ${
                          sortMode === s.key
                            ? 'bg-rose-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="space-y-2 animate-pulse">
                        <div className="aspect-[2/3] rounded-xl bg-[#14141c]" />
                        <div className="h-3.5 bg-[#14141c] rounded w-4/5" />
                        <div className="h-3 bg-[#14141c] rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : comics.length === 0 ? (
                  <div className="text-center py-16 px-4 text-xs text-zinc-400 bg-[#121218] rounded-2xl border border-white/[0.06] space-y-2">
                    <p className="font-bold text-zinc-200">Chưa có truyện nào trong cơ sở dữ liệu.</p>
                    <p>Hãy chạy Crawler trên GitHub Actions để tự động cào và xuất bản truyện mới.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {comics.map((item) => (
                        <ComicCard
                          key={item.slug}
                          item={item}
                          onSelect={openComic}
                          lastReadChapter={readHistory[item.slug]?.chapter_number}
                        />
                      ))}
                    </div>

                    {pagination.totalPages > 1 && (
                      <div className="pt-4 flex items-center justify-center gap-2">
                        <button
                          disabled={page <= 1}
                          onClick={() => {
                            setPage((p) => Math.max(1, p - 1));
                            window.scrollTo({ top: 0 });
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#14141c] border border-white/10 disabled:opacity-30 text-xs font-bold hover:border-rose-500/40"
                        >
                          ← Trang trước
                        </button>
                        <span className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-extrabold text-rose-400">
                          Trang {page} / {pagination.totalPages}
                        </span>
                        <button
                          disabled={page >= pagination.totalPages}
                          onClick={() => {
                            setPage((p) => Math.min(pagination.totalPages, p + 1));
                            window.scrollTo({ top: 0 });
                          }}
                          className="px-3.5 py-2 rounded-xl bg-[#14141c] border border-white/10 disabled:opacity-30 text-xs font-bold hover:border-rose-500/40"
                        >
                          Trang sau →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <aside className="lg:col-span-4 xl:col-span-3 bg-[#121218] rounded-2xl border border-white/[0.07] p-4 space-y-3.5 lg:sticky lg:top-28">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold flex items-center gap-1.5 text-white">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Bảng Xếp Hạng
                  </h3>
                  <div className="flex gap-1 bg-[#09090c] p-0.5 rounded-lg border border-white/5 text-[10px]">
                    {[
                      { key: 'top-day', label: 'Ngày' },
                      { key: 'top-week', label: 'Tuần' },
                      { key: 'top-month', label: 'Tháng' },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() =>
                          setSidebarTopPeriod(t.key as 'top-day' | 'top-week' | 'top-month')
                        }
                        className={`px-2 py-1 rounded-md font-bold ${
                          sidebarTopPeriod === t.key
                            ? 'bg-rose-600 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {sidebarTopComics.map((item, idx) => {
                    const rank = idx + 1;
                    const viewVal =
                      sidebarTopPeriod === 'top-day'
                        ? item.views_day
                        : sidebarTopPeriod === 'top-week'
                        ? item.views_week
                        : item.views_month;
                    return (
                      <button
                        key={item.slug}
                        onClick={() => openComic(item.slug)}
                        className="w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/[0.04] text-left group transition"
                      >
                        <span
                          className={`w-6 text-center font-black text-sm shrink-0 ${
                            rank === 1
                              ? 'text-amber-400'
                              : rank === 2
                              ? 'text-zinc-300'
                              : rank === 3
                              ? 'text-orange-400'
                              : 'text-zinc-600'
                          }`}
                        >
                          {String(rank).padStart(2, '0')}
                        </span>
                        <img
                          src={resolveAssetUrl(item.cover_url)}
                          alt=""
                          className="w-11 h-14 rounded-lg object-cover bg-zinc-900 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-100 group-hover:text-rose-400 truncate">
                            {item.title}
                          </p>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                            <span className="text-rose-400 font-semibold">
                              {item.latest_chapter !== null ? `Chap ${item.latest_chapter}` : 'Mới'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {formatCompactNumber(viewVal || item.views_total)}
                            </span>
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
          <section className="space-y-4">
            <div className="bg-[#121218] p-4 rounded-2xl border border-white/[0.07] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setFilterDrawerOpen((v) => !v)}
                  className="text-sm font-extrabold flex items-center gap-2 text-white"
                >
                  <SlidersHorizontal className="w-4 h-4 text-rose-500" />
                  Bộ Lọc Truyện Nâng Cao
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-[10px] font-black">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetAllFilters}
                      className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2.5 py-1.5 rounded-lg"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Đặt lại
                    </button>
                  )}
                  <button
                    onClick={() => setFilterDrawerOpen((v) => !v)}
                    className="text-xs text-zinc-400 px-2.5 py-1.5 rounded-lg bg-white/5"
                  >
                    {filterDrawerOpen ? 'Thu gọn' : 'Mở bộ lọc'}
                  </button>
                </div>
              </div>

              {filterDrawerOpen && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Tình trạng
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 bg-[#09090c] p-1 rounded-xl border border-white/5 text-xs">
                        {[
                          { key: 'all', label: 'Tất cả' },
                          { key: 'ongoing', label: 'Đang ra' },
                          { key: 'completed', label: 'Hoàn thành' },
                        ].map((st) => (
                          <button
                            key={st.key}
                            onClick={() => {
                              setStatusFilter(st.key as 'all' | 'ongoing' | 'completed');
                              setPage(1);
                            }}
                            className={`py-1.5 rounded-lg font-bold transition ${
                              statusFilter === st.key
                                ? 'bg-rose-600 text-white'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Sắp xếp theo
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 bg-[#09090c] p-1 rounded-xl border border-white/5 text-xs">
                        {[
                          { key: 'latest', label: 'Mới cập nhật' },
                          { key: 'top-week', label: 'Hot tuần' },
                          { key: 'rating', label: 'Điểm cao' },
                        ].map((so) => (
                          <button
                            key={so.key}
                            onClick={() => {
                              setSortMode(so.key);
                              setPage(1);
                            }}
                            className={`py-1.5 rounded-lg font-bold transition ${
                              sortMode === so.key
                                ? 'bg-rose-600 text-white'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {so.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-[11px] text-zinc-400">
                      Chạm 1 lần: <span className="text-emerald-400 font-bold">[+] Bao gồm</span> • Chạm 2 lần:{' '}
                      <span className="text-rose-400 font-bold">[-] Loại trừ</span> • Chạm 3 lần: Bỏ chọn
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => {
                        const st = genreStates[g.slug] || 'neutral';
                        return (
                          <button
                            key={g.id}
                            onClick={() => cycleGenreState(g.slug)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold border transition ${
                              st === 'include'
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                : st === 'exclude'
                                ? 'bg-rose-500/20 border-rose-500 text-rose-300 line-through'
                                : 'bg-[#09090c] border-white/10 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {st === 'include' ? '+ ' : st === 'exclude' ? '- ' : ''}
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                Tìm thấy <strong className="text-white">{pagination.total}</strong> bộ truyện phù hợp
              </span>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div key={idx} className="space-y-2 animate-pulse">
                    <div className="aspect-[2/3] rounded-xl bg-[#14141c]" />
                    <div className="h-3 bg-[#14141c] rounded w-4/5" />
                  </div>
                ))}
              </div>
            ) : comics.length === 0 ? (
              <div className="text-center py-16 bg-[#121218] rounded-2xl border border-white/[0.06] space-y-3">
                <p className="text-sm font-bold text-zinc-300">
                  Không có bộ truyện nào khớp với bộ lọc hiện tại.
                </p>
                <button
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white"
                >
                  Xóa toàn bộ bộ lọc
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {comics.map((item) => (
                    <ComicCard
                      key={item.slug}
                      item={item}
                      onSelect={openComic}
                      lastReadChapter={readHistory[item.slug]?.chapter_number}
                    />
                  ))}
                </div>

                {pagination.totalPages > 1 && (
                  <div className="pt-4 flex items-center justify-center gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => {
                        setPage((p) => Math.max(1, p - 1));
                        window.scrollTo({ top: 0 });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#14141c] border border-white/10 disabled:opacity-30 text-xs font-bold"
                    >
                      ← Trước
                    </button>
                    <span className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-extrabold text-rose-400">
                      Trang {page} / {pagination.totalPages}
                    </span>
                    <button
                      disabled={page >= pagination.totalPages}
                      onClick={() => {
                        setPage((p) => Math.min(pagination.totalPages, p + 1));
                        window.scrollTo({ top: 0 });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#14141c] border border-white/10 disabled:opacity-30 text-xs font-bold"
                    >
                      Sau →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'ranking' && (
          <section className="space-y-5">
            <div className="grid grid-cols-4 gap-1.5 bg-[#121218] p-1.5 rounded-2xl border border-white/[0.07]">
              {[
                { key: 'top-day', label: 'Top Ngày' },
                { key: 'top-week', label: 'Top Tuần' },
                { key: 'top-month', label: 'Top Tháng' },
                { key: 'rating', label: 'Đánh Giá Cao' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setSortMode(tab.key);
                    setPage(1);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-extrabold transition ${
                    sortMode === tab.key
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {!loading && comics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {comics.map((item, idx) => (
                  <ComicCard
                    key={item.slug}
                    item={item}
                    onSelect={openComic}
                    rankBadge={(page - 1) * 24 + idx + 1}
                    lastReadChapter={readHistory[item.slug]?.chapter_number}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'library' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-2 gap-1.5 bg-[#121218] p-1 rounded-xl border border-white/[0.07] w-full max-w-sm">
                <button
                  onClick={() => setLibrarySubTab('bookmarks')}
                  className={`py-2 rounded-lg text-xs font-extrabold transition ${
                    librarySubTab === 'bookmarks'
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white'
                      : 'text-zinc-400'
                  }`}
                >
                  Đang theo dõi ({bookmarks.length})
                </button>
                <button
                  onClick={() => setLibrarySubTab('history')}
                  className={`py-2 rounded-lg text-xs font-extrabold transition ${
                    librarySubTab === 'history'
                      ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white'
                      : 'text-zinc-400'
                  }`}
                >
                  Lịch sử đọc ({historyList.length})
                </button>
              </div>
            </div>

            {librarySubTab === 'bookmarks' ? (
              bookmarks.length === 0 ? (
                <div className="text-center py-16 bg-[#121218] rounded-2xl border border-white/[0.06] text-xs text-zinc-400 space-y-2">
                  <p className="font-bold text-zinc-200">Bạn chưa theo dõi bộ truyện nào.</p>
                  <p>Bấm nút "Theo dõi" trong trang chi tiết truyện để lưu vào tủ truyện.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {bookmarks.map((item) => (
                    <ComicCard
                      key={item.slug}
                      item={item}
                      onSelect={openComic}
                      lastReadChapter={readHistory[item.slug]?.chapter_number}
                    />
                  ))}
                </div>
              )
            ) : historyList.length === 0 ? (
              <div className="text-center py-16 bg-[#121218] rounded-2xl border border-white/[0.06] text-xs text-zinc-400">
                Chưa có lịch sử đọc truyện nào trên thiết bị này.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {historyList.map((h) => (
                  <div
                    key={h.slug}
                    className="p-3 rounded-2xl bg-[#121218] border border-white/[0.06] flex items-center gap-3"
                  >
                    <button
                      onClick={() => openComic(h.slug)}
                      className="w-14 h-20 rounded-xl overflow-hidden bg-zinc-900 shrink-0"
                    >
                      {h.cover_url && (
                        <img
                          src={resolveAssetUrl(h.cover_url)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <button
                        onClick={() => openComic(h.slug)}
                        className="text-xs sm:text-sm font-bold text-zinc-100 hover:text-rose-400 line-clamp-1 text-left block w-full"
                      >
                        {h.title}
                      </button>
                      <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatTimeAgo(h.read_at)}
                      </p>
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          onClick={() =>
                            h.chapter_id > 0 ? openChapter(h.chapter_id) : openComic(h.slug)
                          }
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                        >
                          Đọc tiếp Chap {h.chapter_number}
                        </button>
                        <button
                          onClick={() => removeHistoryItem(h.slug)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
                          title="Xóa khỏi lịch sử"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 md:bottom-6 right-4 z-40 w-10 h-10 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 flex items-center justify-center backdrop-blur-md transition"
          aria-label="Lên đầu trang"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      <nav
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0b0b10]/95 backdrop-blur-xl border-t border-white/10"
      >
        <div className="grid grid-cols-4 h-14">
          {[
            { key: 'home', label: 'Trang chủ', icon: Home },
            { key: 'explore', label: 'Thể loại', icon: Compass },
            { key: 'ranking', label: 'Xếp hạng', icon: Trophy },
            { key: 'library', label: 'Tủ truyện', icon: Bookmark },
          ].map((nav) => {
            const Icon = nav.icon;
            const active = activeTab === nav.key;
            return (
              <button
                key={nav.key}
                onClick={() => navigateTab(nav.key as TabKey)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition ${
                  active ? 'text-rose-400' : 'text-zinc-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{nav.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
