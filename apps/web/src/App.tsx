import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Eye,
  Filter,
  Flame,
  Heart,
  History,
  Home,
  Image,
  Library,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  Trophy,
  Upload,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import {
  type ChapterPagesPayload,
  clearHistory,
  type ComicDetail,
  type ComicSummary,
  exportUserData,
  fetchChapterPages,
  fetchComicDetail,
  fetchComics,
  fetchCurrentUser,
  fetchGenres,
  fetchPublicSettings,
  type GenreItem,
  getBookmarks,
  getHistory,
  type HistoryItem,
  importUserData,
  incrementComicView,
  isBookmarked,
  type PublicSettings,
  rateComic,
  resolveAssetUrl,
  saveHistory,
  setUserToken,
  toggleBookmark,
  type UserProfile,
} from './lib/api';
import { getAvatarUrl } from './lib/memes';
import {
  parseRouteFromLocation,
  pushModalState,
  pushRoute,
  replaceRoute,
  type RouteState,
  type ViewMode,
} from './lib/router';
import { ReaderView } from './components/ReaderView';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { CommentSection } from './components/CommentSection';

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelTime(iso: string): string {
  if (!iso) return '';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T');
  const full = normalized.endsWith('Z') || normalized.includes('+') ? normalized : normalized + 'Z';
  const t = new Date(full).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export function App() {
  const initRoute = useMemo(() => parseRouteFromLocation(), []);
  const [view, setView] = useState<ViewMode>(initRoute.view);
  const [libraryTab, setLibraryTab] = useState<'bookmarks' | 'history'>(initRoute.libraryTab || 'bookmarks');

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    site_name: 'VinaHentai',
    announcement_enabled: '0',
    announcement_text: '',
    maintenance_mode: '0',
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Dữ liệu chung
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [heroComics, setHeroComics] = useState<ComicSummary[]>([]);
  const [sidebarRanking, setSidebarRanking] = useState<ComicSummary[]>([]);
  const [sidebarRankTab, setSidebarRankTab] = useState<'top-day' | 'top-week' | 'top-month'>('top-day');

  // Navigation & Drawer states
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  const [genreSearchQuery, setGenreSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);

  // Summon state
  const [summonResult, setSummonResult] = useState<string | null>(null);

  // Danh sách truyện chính (Home / Browse / Ranking)
  const [comics, setComics] = useState<ComicSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState<number>(initRoute.page || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState(initRoute.q || '');
  const [activeQuery, setActiveQuery] = useState(initRoute.q || '');
  const [sort, setSort] = useState<string>(
    initRoute.sort || (initRoute.view === 'ranking' ? 'top-day' : 'latest')
  );
  const [statusFilter, setStatusFilter] = useState<string>(initRoute.status || 'all');
  const [authorFilter, setAuthorFilter] = useState<string>(initRoute.author || '');
  const [incGenres, setIncGenres] = useState<string[]>(initRoute.inc || []);
  const [excGenres, setExcGenres] = useState<string[]>(initRoute.exc || []);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Chi tiết truyện & Trình đọc
  const [selectedComic, setSelectedComic] = useState<ComicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterSortAsc, setChapterSortAsc] = useState(false);
  const [userRatingHover, setUserRatingHover] = useState(0);
  const [ratedDone, setRatedDone] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [readerData, setReaderData] = useState<ChapterPagesPayload | null>(null);

  // Tủ truyện & Lịch sử
  const [bookmarks, setBookmarks] = useState<ComicSummary[]>(() => getBookmarks());
  const [historyList, setHistoryList] = useState<HistoryItem[]>(() => getHistory());
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [backupMsg, setBackupMsg] = useState('');

  const navigateTo = (newRoute: RouteState, opts?: { replace?: boolean }) => {
    setGenreDropdownOpen(false);
    setMenuDrawerOpen(false);
    if (opts?.replace) {
      replaceRoute(newRoute);
    } else {
      pushRoute(newRoute);
    }
    setView(newRoute.view);
    if (newRoute.libraryTab) setLibraryTab(newRoute.libraryTab);
    if (newRoute.q !== undefined) {
      setActiveQuery(newRoute.q);
      setSearchInput(newRoute.q);
    }
    if (newRoute.sort) setSort(newRoute.sort);
    if (newRoute.status) setStatusFilter(newRoute.status);
    if (newRoute.author !== undefined) setAuthorFilter(newRoute.author);
    if (newRoute.inc) setIncGenres(newRoute.inc);
    if (newRoute.exc) setExcGenres(newRoute.exc);
    if (newRoute.page) setPage(newRoute.page);
  };

  const loadSettings = useCallback(async () => {
    const s = await fetchPublicSettings();
    setPublicSettings(s);
    const titleBrand = s.site_name && s.site_name !== 'VinaReader' ? s.site_name : 'VinaHentai';
    document.title = `${titleBrand} — Đọc Truyện Tranh Online Chất Lượng Cao`;
  }, []);

  useEffect(() => {
    loadSettings();
    fetchGenres().then(setGenres).catch(() => {});
    fetchCurrentUser().then(setCurrentUser).catch(() => {});
  }, [loadSettings]);

  // Initial deep link hydration
  useEffect(() => {
    if (initRoute.view === 'detail' && initRoute.slug) {
      setDetailLoading(true);
      fetchComicDetail(initRoute.slug)
        .then(setSelectedComic)
        .catch(() => setSelectedComic(null))
        .finally(() => setDetailLoading(false));
    } else if (initRoute.view === 'reader' && initRoute.chapterId) {
      fetchChapterPages(initRoute.chapterId)
        .then((payload) => {
          setReaderData(payload);
          setView('reader');
        })
        .catch(() => {});
    }
  }, [initRoute]);

  // Handle popstate
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state as { modal?: 'filter' | 'backup' } | null;
      if (state?.modal === 'filter') {
        setShowFilterModal(true);
        setBackupModalOpen(false);
      } else if (state?.modal === 'backup') {
        setBackupModalOpen(true);
        setShowFilterModal(false);
      } else {
        setShowFilterModal(false);
        setBackupModalOpen(false);
      }

      const route = parseRouteFromLocation();
      setView(route.view);
      if (route.libraryTab) setLibraryTab(route.libraryTab);
      if (route.q !== undefined) {
        setActiveQuery(route.q);
        setSearchInput(route.q);
      }
      if (route.sort) setSort(route.sort);
      if (route.status) setStatusFilter(route.status);
      if (route.author !== undefined) setAuthorFilter(route.author);
      if (route.inc) setIncGenres(route.inc);
      if (route.exc) setExcGenres(route.exc);
      if (route.page) setPage(route.page);

      if (route.view === 'detail' && route.slug && selectedComic?.slug !== route.slug) {
        setDetailLoading(true);
        fetchComicDetail(route.slug)
          .then(setSelectedComic)
          .catch(() => setSelectedComic(null))
          .finally(() => setDetailLoading(false));
      }
      if (route.view === 'reader' && route.chapterId && readerData?.chapter.id !== route.chapterId) {
        fetchChapterPages(route.chapterId)
          .then(setReaderData)
          .catch(() => {});
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedComic?.slug, readerData?.chapter.id]);

  // Tải Truyện Đề Cử (Featured Carousel)
  useEffect(() => {
    if (view !== 'home') return;
    fetchComics({ featured: '1', limit: 8 })
      .then((res) => {
        if (res.items.length > 0) setHeroComics(res.items);
        else return fetchComics({ sort: 'top-week', limit: 8 }).then((fb) => setHeroComics(fb.items));
      })
      .catch(() => {});
  }, [view]);

  // Tải BXH cột phải trang chủ
  useEffect(() => {
    if (view !== 'home') return;
    fetchComics({ sort: sidebarRankTab, limit: 10 })
      .then((res) => setSidebarRanking(res.items))
      .catch(() => {});
  }, [view, sidebarRankTab]);

  // Tải danh sách truyện chính
  useEffect(() => {
    if (view !== 'home' && view !== 'browse' && view !== 'ranking') return;
    setLoading(true);
    fetchComics({
      page,
      limit: 24,
      q: activeQuery,
      sort: view === 'ranking' && !sort.startsWith('top-') ? 'top-day' : sort,
      status: statusFilter,
      author: authorFilter,
      inc: incGenres,
      exc: excGenres,
    })
      .then((res) => {
        setComics(res.items);
        setTotalPages(res.pagination.totalPages || 1);
      })
      .catch(() => setComics([]))
      .finally(() => setLoading(false));
  }, [view, page, activeQuery, sort, statusFilter, authorFilter, incGenres, excGenres]);

  const openComicDetail = async (slug: string) => {
    navigateTo({ view: 'detail', slug });
    setDetailLoading(true);
    setChapterSearch('');
    setRatedDone(false);
    setCopiedId(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const detail = await fetchComicDetail(slug);
      setSelectedComic(detail);
    } catch {
      setSelectedComic(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenRandom = async () => {
    try {
      const pool = comics.length > 0 ? comics : heroComics;
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        openComicDetail(pick.slug);
        return;
      }
      const res = await fetchComics({ limit: 24 });
      if (res.items.length > 0) {
        const pick = res.items[Math.floor(Math.random() * res.items.length)];
        openComicDetail(pick.slug);
      }
    } catch {}
  };

  const handleSummon = (_count: number) => {
    const names = [
      'Asuna Hentai',
      'Zero Two Waifu',
      'Rem Maid',
      'Kurumi Tokisaki',
      'Rias Gremory',
      'Chika Fujiwara',
      'Nezuko Kamado',
      'Power Chainsaw',
      'Makima Control',
      'Hatsune Miku',
    ];
    const pick = names[Math.floor(Math.random() * names.length)];
    setSummonResult(pick);
  };

  const openChapter = async (chapterId: number, options?: { replace?: boolean }) => {
    try {
      const payload = await fetchChapterPages(chapterId);
      setReaderData(payload);
      navigateTo({ view: 'reader', chapterId }, { replace: options?.replace });
      incrementComicView(payload.chapter.comic_id);

      const coverUrl =
        selectedComic?.slug === payload.chapter.comic_slug
          ? selectedComic.cover_url
          : historyList.find((h) => h.slug === payload.chapter.comic_slug)?.cover_url || '';

      saveHistory({
        slug: payload.chapter.comic_slug,
        title: payload.chapter.comic_title,
        cover_url: coverUrl,
        chapter_id: payload.chapter.id,
        chapter_number: payload.chapter.chapter_number,
        read_at: Date.now(),
        progress: 0,
        total_pages: payload.pages.length,
      });
      setHistoryList(getHistory());
    } catch {
      alert('Không thể tải chương truyện này. Vui lòng thử lại.');
    }
  };

  const handleReaderProgress = useCallback((pageIdx: number, total: number) => {
    setReaderData((cur) => {
      if (!cur) return cur;
      const existing = getHistory().find((h) => h.slug === cur.chapter.comic_slug);
      saveHistory({
        slug: cur.chapter.comic_slug,
        title: cur.chapter.comic_title,
        cover_url: existing?.cover_url || '',
        chapter_id: cur.chapter.id,
        chapter_number: cur.chapter.chapter_number,
        read_at: Date.now(),
        progress: pageIdx + 1,
        total_pages: total,
      });
      return cur;
    });
  }, []);

  const cycleGenreState = (slug: string) => {
    if (incGenres.includes(slug)) {
      setIncGenres((prev) => prev.filter((s) => s !== slug));
      setExcGenres((prev) => [...prev, slug]);
    } else if (excGenres.includes(slug)) {
      setExcGenres((prev) => prev.filter((s) => s !== slug));
    } else {
      setIncGenres((prev) => [...prev, slug]);
    }
    setPage(1);
  };

  const filteredChapters = useMemo(() => {
    if (!selectedComic) return [];
    let list = [...selectedComic.chapters];
    if (chapterSearch.trim()) {
      const kw = chapterSearch.trim().toLowerCase();
      list = list.filter(
        (ch) => String(ch.chapter_number).includes(kw) || (ch.title || '').toLowerCase().includes(kw)
      );
    }
    if (chapterSortAsc) list.reverse();
    return list;
  }, [selectedComic, chapterSearch, chapterSortAsc]);

  if (view === 'admin') {
    return (
      <AdminPanel
        onExit={() => {
          if (window.history.length > 1 && window.history.state?.fromApp) {
            window.history.back();
          } else {
            navigateTo({ view: 'home' });
          }
        }}
        onSettingsUpdated={loadSettings}
      />
    );
  }

  if (view === 'reader' && readerData) {
    return (
      <ReaderView
        data={readerData}
        onBack={() => {
          setHistoryList(getHistory());
          if (window.history.length > 1 && window.history.state?.fromApp) {
            window.history.back();
          } else if (readerData?.chapter?.comic_slug) {
            openComicDetail(readerData.chapter.comic_slug);
          } else {
            navigateTo({ view: 'home' });
          }
        }}
        onOpenChapter={(id) => openChapter(id, { replace: true })}
        onProgress={handleReaderProgress}
        currentUser={currentUser}
        onRequireAuth={() => setAuthModalOpen(true)}
      />
    );
  }

  const brandName =
    publicSettings.site_name && publicSettings.site_name !== 'VinaReader'
      ? publicSettings.site_name
      : 'VinaHentai';

  return (
    <div className="min-h-dvh bg-[#121318] text-txt-primary pb-14 selection:bg-lav-500/30">
      {/* Thanh thông báo từ Admin */}
      {publicSettings.announcement_enabled === '1' &&
        publicSettings.announcement_text &&
        !bannerDismissed && (
          <div className="bg-gradient-to-r from-lav-600 via-lav-500 to-mag-500 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 relative">
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            <span className="text-center">{publicSettings.announcement_text}</span>
            <button
              onClick={() => setBannerDismissed(true)}
              className="absolute right-3 p-1 hover:bg-black/20 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      {/* Cảnh báo bảo trì */}
      {publicSettings.maintenance_mode === '1' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <Wrench className="w-3.5 h-3.5" /> Hệ thống đang bảo trì nâng cấp nhẹ. Một số chương có thể cập nhật chậm.
        </div>
      )}

      {/* ==================== HEADER VINAHENTAI ==================== */}
      <header className="flex w-full flex-col sticky top-0 z-40">
        <div className="bg-bgc-header md:bg-bgc-header-md relative z-20 pt-safe">
          {/* Tầng 1: Logo + Search + Nâng cao + Auth + Menu */}
          <div className="relative flex items-center justify-between self-stretch px-0 pt-2.5 pb-1.5 md:pb-2">
            {/* Desktop Header */}
            <div className="hidden w-full lg:block">
              <div className="container-page mx-auto grid grid-cols-[minmax(max-content,1fr)_minmax(240px,500px)_minmax(max-content,1fr)] items-center gap-x-6 px-4">
                {/* Logo */}
                <div className="flex items-center justify-self-start">
                  <button
                    onClick={() => {
                      setActiveQuery('');
                      setSearchInput('');
                      setAuthorFilter('');
                      setIncGenres([]);
                      setExcGenres([]);
                      setStatusFilter('all');
                      setSort('latest');
                      setPage(1);
                      navigateTo({ view: 'home' });
                    }}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-lav-500 to-mag-500 flex items-center justify-center shadow-lg shadow-lav-500/25 group-hover:scale-105 transition">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-extrabold tracking-tight text-white">
                      {brandName === 'VinaHentai' ? (
                        <>
                          Vina<span className="bg-gradient-to-r from-lav-400 to-mag-400 bg-clip-text text-transparent">Hentai</span>
                        </>
                      ) : (
                        brandName
                      )}
                    </span>
                  </button>
                </div>

                {/* Search Pill + Nâng cao */}
                <div className="flex w-full min-w-0 items-center gap-2.5">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const q = searchInput.trim();
                      setActiveQuery(q);
                      setPage(1);
                      navigateTo({
                        view: 'browse',
                        q,
                        sort,
                        status: statusFilter,
                        author: authorFilter,
                        inc: incGenres,
                        exc: excGenres,
                        page: 1,
                      });
                    }}
                    className="group bg-bgc-layer2 border-bd-strong focus-within:border-lav-500 flex w-full items-stretch overflow-hidden rounded-full border focus-within:ring-1 focus-within:ring-lav-500"
                  >
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Tìm truyện hoặc mã..."
                      className="text-txt-secondary placeholder:text-txt-secondary focus:text-txt-primary flex-1 bg-transparent px-4 py-1.5 text-sm leading-normal font-medium outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="Tìm kiếm"
                      className="flex w-12 flex-shrink-0 items-center justify-center border-l border-bd-strong bg-bgc-layer1/40 hover:bg-lav-500/20 text-txt-secondary hover:text-lav-400 transition-colors"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => {
                      pushModalState('filter');
                      setShowFilterModal(true);
                    }}
                    aria-label="Mở tìm kiếm nâng cao"
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-lav-500 bg-bgc-layer2/80 hover:bg-lav-500/15 px-3.5 py-1.5 text-xs font-semibold text-txt-focus transition"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-lav-400" />
                    <span>Nâng cao</span>
                  </button>
                </div>

                {/* Auth & Menu Button */}
                <div className="flex items-center justify-self-end whitespace-nowrap">
                  <div className="flex items-center justify-start gap-2.5">
                    {currentUser ? (
                      <>
                        <button
                          onClick={() => navigateTo({ view: 'library', libraryTab: 'bookmarks' })}
                          className="inline-flex items-center gap-2 rounded-xl border border-bd-default bg-bgc-layer2 hover:border-lav-500 px-3 py-1.5 text-xs font-semibold text-txt-primary transition"
                        >
                          <img
                            src={getAvatarUrl(currentUser.avatar_seed, currentUser.username)}
                            alt={currentUser.display_name}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                          <span>{currentUser.display_name}</span>
                        </button>
                        <button
                          onClick={() => {
                            setUserToken('');
                            setCurrentUser(null);
                          }}
                          className="hover-lift inline-flex h-[36px] items-center justify-center gap-1.5 rounded-xl border border-bd-default bg-bgc-layer2 hover:border-rose-500/50 px-3 text-xs font-semibold text-txt-secondary hover:text-rose-400"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Thoát</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setAuthModalOpen(true)}
                          className="hover-lift inline-flex h-[36px] items-center justify-center gap-2 rounded-xl border border-bd-default bg-bgc-layer2 hover:border-lav-500 px-3.5 text-xs font-semibold text-txt-primary"
                        >
                          Đăng nhập
                        </button>
                        <button
                          onClick={() => setAuthModalOpen(true)}
                          className="hover-lift inline-flex h-[36px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 px-3.5 text-xs font-semibold text-white shadow-md shadow-lav-500/20"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Đăng ký
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setMenuDrawerOpen(true)}
                      aria-label="Mở menu"
                      className="tap-44 border-bd-default bg-bgc-layer2 hover:border-lav-500 inline-flex h-[36px] w-[36px] items-center justify-center rounded-xl border text-txt-primary transition"
                    >
                      <Menu className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="flex w-full items-center justify-between px-4 sm:px-6 lg:hidden">
              <button
                onClick={() => {
                  setActiveQuery('');
                  setSearchInput('');
                  setPage(1);
                  navigateTo({ view: 'home' });
                }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-lav-500 to-mag-500 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-extrabold tracking-tight text-white">
                  Vina<span className="text-lav-400">Hentai</span>
                </span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((v) => !v)}
                  aria-label="Tìm truyện"
                  className="tap-44 flex items-center justify-center rounded-xl border border-bd-default bg-bgc-layer2 text-txt-primary"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuDrawerOpen(true)}
                  aria-label="Mở menu"
                  className="tap-44 flex items-center justify-center rounded-xl border border-bd-default bg-bgc-layer2 text-txt-primary"
                >
                  <Menu className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Search Bar Expand */}
          {mobileSearchOpen && (
            <div className="px-4 pb-2.5 lg:hidden">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchInput.trim();
                  setActiveQuery(q);
                  setPage(1);
                  setMobileSearchOpen(false);
                  navigateTo({ view: 'browse', q, sort, status: statusFilter, page: 1 });
                }}
                className="flex items-center gap-2"
              >
                <div className="bg-bgc-layer2 border-bd-strong focus-within:border-lav-500 flex flex-1 items-stretch overflow-hidden rounded-full border">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Tìm truyện hoặc mã..."
                    className="flex-1 bg-transparent px-4 py-1.5 text-xs text-txt-primary outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3.5 border-l border-bd-strong text-txt-secondary hover:text-lav-400"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    pushModalState('filter');
                    setShowFilterModal(true);
                  }}
                  className="rounded-full border border-lav-500 bg-bgc-layer2 px-3 py-1.5 text-xs font-semibold text-txt-focus"
                >
                  Nâng cao
                </button>
              </form>
            </div>
          )}

          {/* Tầng 2: Thanh điều hướng tab ngang */}
          <nav
            aria-label="Điều hướng chính"
            className="no-scrollbar relative z-30 flex w-full overflow-x-auto px-3 pt-1"
          >
            <div className="mx-auto flex shrink-0 items-end gap-5 sm:gap-7">
              <button
                onClick={() => {
                  setActiveQuery('');
                  setStatusFilter('all');
                  setIncGenres([]);
                  setExcGenres([]);
                  setSort('latest');
                  setPage(1);
                  navigateTo({ view: 'home' });
                }}
                className={`relative inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  view === 'home' && statusFilter === 'all' && incGenres.length === 0
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Trang chủ</span>
              </button>

              <button
                type="button"
                onClick={() => setGenreDropdownOpen((v) => !v)}
                className={`relative inline-flex shrink-0 items-center gap-1 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  genreDropdownOpen || incGenres.length > 0
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <span>Thể loại</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${genreDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setPage(1);
                  setSort('top-day');
                  navigateTo({ view: 'ranking', sort: 'top-day', page: 1 });
                }}
                className={`relative inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  view === 'ranking'
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>BXH</span>
              </button>

              <button
                onClick={() => navigateTo({ view: 'summon' })}
                className={`relative inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  view === 'summon'
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-lav-400" />
                <span>Triệu hồi</span>
              </button>

              <button
                onClick={() => {
                  setStatusFilter('completed');
                  setPage(1);
                  navigateTo({ view: 'browse', status: 'completed', sort: 'latest', page: 1 });
                }}
                className={`relative inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  view === 'browse' && statusFilter === 'completed'
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <span>Hoàn thành</span>
              </button>

              <button
                type="button"
                onClick={handleOpenRandom}
                className="relative inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent pb-2 pt-1 text-xs sm:text-sm font-semibold text-txt-secondary hover:text-lav-400 transition"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Random</span>
              </button>

              <button
                onClick={() => navigateTo({ view: 'library', libraryTab })}
                className={`relative inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2 pt-1 text-xs sm:text-sm font-semibold transition ${
                  view === 'library'
                    ? 'border-lav-500 text-lav-400'
                    : 'border-transparent text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>Tủ truyện</span>
              </button>
            </div>
          </nav>

          {/* Đường kẻ đáy Header */}
          <div className="bg-bd-strong h-[1px] w-full lg:bg-white/10" />

          {/* Mega Dropdown Thể loại (Chuẩn VinaHentai) */}
          {genreDropdownOpen && (
            <div className="border-b border-bd-strong bg-bgc-layer1/98 backdrop-blur-xl shadow-2xl">
              <div className="container-page mx-auto px-4 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-txt-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={genreSearchQuery}
                      onChange={(e) => setGenreSearchQuery(e.target.value)}
                      placeholder="Tìm kiếm thể loại..."
                      className="w-full pl-10 pr-4 py-2 rounded-full bg-bgc-layer2 border border-bd-default text-xs sm:text-sm text-txt-primary placeholder:text-txt-secondary outline-none focus:border-lav-500"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setGenreDropdownOpen(false);
                      navigateTo({ view: 'genres-directory' });
                    }}
                    className="text-xs font-bold text-mag-400 hover:text-mag-500 underline whitespace-nowrap"
                  >
                    Trang thể loại chi tiết ↗
                  </button>
                  <button
                    onClick={() => setGenreDropdownOpen(false)}
                    className="text-xs text-txt-secondary hover:text-white p-2 rounded-lg bg-bgc-layer2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Grouped by Alphabet */}
                <div className="space-y-4">
                  {['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter) => {
                    const matchedGenres = genres.filter((g) => {
                      const nameLower = g.name.toLowerCase();
                      const query = genreSearchQuery.trim().toLowerCase();
                      if (query && !nameLower.includes(query)) return false;

                      const first = g.name.charAt(0).toUpperCase();
                      if (letter === '#') return !/[A-Z]/.test(first);
                      return first === letter;
                    });
                    if (matchedGenres.length === 0) return null;

                    return (
                      <div key={letter} className="space-y-2">
                        <div className="text-lav-400 font-extrabold text-sm border-b border-bd-default pb-1">
                          {letter}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                          {matchedGenres.map((g) => {
                            const active = incGenres.includes(g.slug);
                            return (
                              <button
                                key={g.id}
                                onClick={() => {
                                  setIncGenres([g.slug]);
                                  setExcGenres([]);
                                  setPage(1);
                                  setGenreDropdownOpen(false);
                                  navigateTo({ view: 'browse', inc: [g.slug], sort: 'latest', page: 1 });
                                }}
                                className={`px-3 py-2 rounded-lg text-left text-xs sm:text-sm font-medium truncate transition ${
                                  active
                                    ? 'bg-lav-500 text-white font-bold'
                                    : 'hover:bg-bgc-layer2 text-txt-primary'
                                }`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-bd-default pt-3 text-right">
                  <button
                    onClick={() => {
                      setGenreDropdownOpen(false);
                      pushModalState('filter');
                      setShowFilterModal(true);
                    }}
                    className="text-xs font-semibold text-mag-400 hover:text-mag-500 underline"
                  >
                    Trang thể loại chi tiết ↗
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ==================== MAIN CONTENT ==================== */}
      <main className="container-page mx-auto px-4 pt-4 md:pt-6 space-y-8">
        {/* ==================== TRANG THỂ LOẠI CHI TIẾT (GENRES DIRECTORY) ==================== */}
        {view === 'genres-directory' && (
          <section className="space-y-6 max-w-5xl mx-auto pb-20">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-bd-default pb-4">
              <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <Filter className="w-6 h-6 text-lav-400" /> Tất cả thể loại truyện hentai
              </h1>
              <div className="relative w-full max-w-xs">
                <Search className="w-4 h-4 text-txt-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={genreSearchQuery}
                  onChange={(e) => setGenreSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm thể loại..."
                  className="w-full pl-10 pr-4 py-2 rounded-full bg-bgc-layer2 border border-bd-default text-xs text-txt-primary outline-none focus:border-lav-500"
                />
              </div>
            </div>

            {/* Sticky Alphabet Quick Jump Bar */}
            <div className="sticky top-16 z-20 bg-bgc-base/95 backdrop-blur py-2.5 px-3 rounded-xl border border-bd-default flex flex-wrap gap-1 sm:gap-1.5 justify-center shadow-md">
              {['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter) => {
                const hasGenres = genres.some((g) => {
                  const first = g.name.charAt(0).toUpperCase();
                  if (letter === '#') return !/[A-Z]/.test(first);
                  return first === letter;
                });
                if (!hasGenres) return null;
                return (
                  <a
                    key={letter}
                    href={`#genre-letter-${letter}`}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-bgc-layer2 hover:bg-lav-500 hover:text-white text-txt-primary text-xs sm:text-sm font-bold flex items-center justify-center transition"
                  >
                    {letter}
                  </a>
                );
              })}
            </div>

            <div className="space-y-6">
              {['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter) => {
                const matchedGenres = genres.filter((g) => {
                  const nameLower = g.name.toLowerCase();
                  const query = genreSearchQuery.trim().toLowerCase();
                  if (query && !nameLower.includes(query)) return false;

                  const first = g.name.charAt(0).toUpperCase();
                  if (letter === '#') return !/[A-Z]/.test(first);
                  return first === letter;
                });
                if (matchedGenres.length === 0) return null;

                return (
                  <div key={letter} id={`genre-letter-${letter}`} className="space-y-3 p-4 rounded-2xl bg-bgc-layer1 border border-bd-default scroll-mt-24">
                    <div className="text-lav-400 font-black text-lg border-b border-bd-default pb-1">
                      {letter}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {matchedGenres.map((g) => {
                        const active = incGenres.includes(g.slug);
                        return (
                          <div
                            key={g.id}
                            onClick={() => {
                              setIncGenres([g.slug]);
                              setExcGenres([]);
                              setPage(1);
                              navigateTo({ view: 'browse', inc: [g.slug], sort: 'latest', page: 1 });
                            }}
                            className={`p-4 rounded-xl text-left transition border cursor-pointer space-y-1.5 ${
                              active
                                ? 'border-lav-500 bg-lav-500/20 text-txt-focus'
                                : 'border-bd-default bg-bgc-layer2 hover:border-lav-500 text-txt-primary'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm sm:text-base text-white hover:text-lav-400">
                                {g.name}
                              </span>
                              <span className="text-xs font-semibold text-txt-secondary shrink-0">
                                {(g.comic_count || 0).toLocaleString('vi-VN')} truyện &gt;
                              </span>
                            </div>
                            {g.description && (
                              <p className="text-xs text-txt-secondary line-clamp-2 leading-relaxed">
                                {g.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== TRANG TRIỆU HỒI (SUMMON / GACHAPON) ==================== */}
        {view === 'summon' && (
          <section className="space-y-6 max-w-4xl mx-auto pb-20">
            <div className="rounded-2xl overflow-hidden border border-bd-strong bg-bgc-layer1 shadow-2xl relative p-6 sm:p-8 space-y-6">
              <div className="absolute inset-0 bg-gradient-to-r from-lav-500/10 via-mag-500/10 to-transparent pointer-events-none" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-bd-default pb-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-lav-400" /> Triệu Hồi Waifu
                  </h1>
                  <p className="text-xs sm:text-sm text-txt-secondary mt-1">
                    Trải nghiệm quay thưởng nhận nhân vật anime yêu thích mỗi ngày!
                  </p>
                </div>
                <div className="flex bg-bgc-layer2 p-1 rounded-xl border border-bd-default">
                  <span className="px-3 py-1.5 rounded-lg bg-lav-500 text-white text-xs font-bold">Banner Thường</span>
                </div>
              </div>

              {!currentUser ? (
                <div className="text-center py-12 space-y-3 rounded-xl bg-black/40 border border-bd-default">
                  <p className="text-sm text-txt-secondary">Bạn chưa đăng nhập nên đây là chế độ quay thử.</p>
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 text-xs font-bold text-white shadow-md shadow-lav-500/25"
                  >
                    Đăng nhập ngay để lưu waifu
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="rounded-2xl aspect-[3/4] bg-bgc-layer2 border border-bd-default flex flex-col items-center justify-center p-6 text-center space-y-3 shadow-inner relative overflow-hidden group">
                    <img
                      src={getAvatarUrl('lorelei:' + (summonResult || 'waifu_start'), 'waifu')}
                      alt="Waifu"
                      className="w-40 h-40 rounded-2xl object-cover border-2 border-lav-500 shadow-2xl group-hover:scale-105 transition duration-500"
                    />
                    <div>
                      <h3 className="font-extrabold text-base text-white">
                        {summonResult ? `✨ ${summonResult}` : 'Chưa triệu hồi lượt nào'}
                      </h3>
                      <p className="text-xs text-txt-secondary mt-1">Nhấn nút bên dưới để bắt đầu triệu hồi!</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-black/40 border border-bd-default text-xs space-y-2">
                      <p className="font-bold text-txt-focus">• Còn 3 lượt lẻ và 3 lượt x10 hôm nay.</p>
                      <p className="text-txt-secondary">• Waifu nhận được sẽ xuất hiện ngẫu nhiên với độ hiếm khác nhau.</p>
                      <p className="text-txt-secondary">• Trải nghiệm thị giác tốt nhất khi xoay ngang màn hình.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleSummon(1)}
                        className="flex-1 py-3.5 rounded-xl bg-bgc-layer2 hover:bg-lav-500/20 border border-bd-strong text-txt-primary font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4 text-lav-400" /> TRIỆU HỒI
                      </button>
                      <button
                        onClick={() => handleSummon(10)}
                        className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 hover:brightness-110 text-white font-bold text-sm shadow-lg shadow-lav-500/30 transition flex items-center justify-center gap-2"
                      >
                        <Flame className="w-4 h-4" /> TRIỆU HỒI X10
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== TRANG CHỦ: TRUYỆN ĐỀ CỬ ==================== */}
        {view === 'home' && heroComics.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-txt-primary flex items-center gap-2 border-l-4 border-lav-500 pl-3">
                <Sparkles className="w-4 h-4 text-lav-400" /> Truyện Đề Cử
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {heroComics.map((hc) => (
                <article
                  key={hc.id}
                  onClick={() => openComicDetail(hc.slug)}
                  className="group cursor-pointer relative aspect-[2/3] rounded-lg overflow-hidden border border-bd-default hover:border-lav-500 bg-bgc-layer1 shadow-md transition"
                >
                  <img
                    src={resolveAssetUrl(hc.cover_url)}
                    alt={hc.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent" />
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-lav-500/90 text-[10px] font-bold text-white">
                    HOT
                  </span>
                  <div className="absolute bottom-2 inset-x-2 space-y-0.5">
                    <h3 className="text-xs font-semibold text-white line-clamp-2 group-hover:text-lav-400 transition leading-snug">
                      {hc.title}
                    </h3>
                    <p className="text-[11px] font-medium text-txt-focus">
                      {hc.latest_chapter !== null ? `Chap ${hc.latest_chapter}` : 'Mới'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Dải Tiếp tục đọc */}
        {view === 'home' && historyList.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold uppercase text-txt-primary flex items-center gap-2 border-l-4 border-mag-500 pl-3">
                <Clock className="w-4 h-4 text-mag-400" /> Lịch sử đọc gần đây
              </h3>
              <button
                onClick={() => navigateTo({ view: 'library', libraryTab: 'history' })}
                className="text-xs font-semibold text-lav-400 hover:underline"
              >
                Xem tất cả
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {historyList.slice(0, 8).map((h) => {
                const pct =
                  h.total_pages && h.progress ? Math.min(100, Math.round((h.progress / h.total_pages) * 100)) : 10;
                return (
                  <button
                    key={h.slug}
                    onClick={() => openChapter(h.chapter_id)}
                    className="w-60 shrink-0 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 p-2.5 flex items-center gap-3 text-left transition group"
                  >
                    <img
                      src={resolveAssetUrl(h.cover_url)}
                      alt={h.title}
                      className="w-11 h-16 rounded object-cover bg-bgc-layer2 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-txt-primary truncate group-hover:text-lav-400 transition">
                        {h.title}
                      </p>
                      <p className="text-[11px] font-medium text-mag-400">Đọc tiếp Chap {h.chapter_number}</p>
                      <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-lav-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== TRANG CHỦ (2 CỘT) / BROWSE / RANKING ==================== */}
        {(view === 'home' || view === 'browse' || view === 'ranking') && (
          <div className={view === 'home' ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : 'space-y-4'}>
            {/* Cột chính (8 cột ở Home, full ở Browse/Ranking) */}
            <section className={view === 'home' ? 'lg:col-span-8 space-y-4' : 'space-y-4'}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold uppercase tracking-wide text-txt-primary flex items-center gap-2 border-l-4 border-lav-500 pl-3">
                    {view === 'ranking' ? (
                      <>
                        <Flame className="w-5 h-5 text-mag-400" /> Bảng Xếp Hạng
                      </>
                    ) : activeQuery ? (
                      <>Tìm kiếm: "{activeQuery}"</>
                    ) : authorFilter ? (
                      <>Tác giả: {authorFilter}</>
                    ) : statusFilter === 'completed' ? (
                      <>Truyện Đã Hoàn Thành</>
                    ) : (
                      <>Truyện Mới Cập Nhật</>
                    )}
                  </h2>

                  {(activeQuery || authorFilter || incGenres.length > 0 || excGenres.length > 0) && (
                    <button
                      onClick={() => {
                        setActiveQuery('');
                        setSearchInput('');
                        setAuthorFilter('');
                        setIncGenres([]);
                        setExcGenres([]);
                        setPage(1);
                        navigateTo({
                          view: view === 'ranking' ? 'ranking' : 'browse',
                          sort,
                          status: statusFilter,
                          page: 1,
                        });
                      }}
                      className="px-2.5 py-1 rounded-md bg-lav-500/20 text-txt-focus text-xs font-semibold"
                    >
                      Xóa lọc
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {view === 'ranking' ? (
                    <div className="flex bg-bgc-layer1 p-1 rounded-lg border border-bd-default">
                      {[
                        ['top-day', 'Top Ngày'],
                        ['top-week', 'Top Tuần'],
                        ['top-month', 'Top Tháng'],
                        ['rating', 'Đánh giá'],
                      ].map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => {
                            setSort(k);
                            setPage(1);
                            navigateTo({ view: 'ranking', sort: k, page: 1 });
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                            sort === k ? 'bg-lav-500 text-white' : 'text-txt-secondary hover:text-txt-primary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStatusFilter(val);
                          setPage(1);
                          navigateTo({
                            view: 'browse',
                            q: activeQuery,
                            sort,
                            status: val,
                            author: authorFilter,
                            inc: incGenres,
                            exc: excGenres,
                            page: 1,
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-bgc-layer1 border border-bd-default text-xs font-medium text-txt-primary outline-none focus:border-lav-500"
                      >
                        <option value="all">Tất cả tình trạng</option>
                        <option value="ongoing">Đang tiến hành</option>
                        <option value="completed">Hoàn thành</option>
                      </select>

                      <button
                        onClick={() => {
                          pushModalState('filter');
                          setShowFilterModal(true);
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                          incGenres.length + excGenres.length > 0
                            ? 'bg-lav-500/20 border-lav-500 text-txt-focus'
                            : 'bg-bgc-layer1 border-bd-default text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        Lọc nâng cao
                        {incGenres.length + excGenres.length > 0 && ` (${incGenres.length + excGenres.length})`}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {loading ? (
                <div
                  className={
                    view === 'home'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5'
                      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                  }
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="aspect-[2/3] rounded-lg bg-bgc-layer1" />
                      <div className="h-3.5 w-4/5 rounded bg-bgc-layer1" />
                    </div>
                  ))}
                </div>
              ) : comics.length === 0 ? (
                <div className="py-16 text-center rounded-lg bg-bgc-layer1 border border-bd-default text-txt-secondary text-sm">
                  Không tìm thấy bộ truyện nào phù hợp.
                </div>
              ) : (
                <div
                  className={
                    view === 'home'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5'
                      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                  }
                >
                  {comics.map((comic, idx) => (
                    <article
                      key={comic.id}
                      onClick={() => openComicDetail(comic.slug)}
                      className="group cursor-pointer rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500/70 overflow-hidden transition flex flex-col"
                    >
                      <div className="relative aspect-[2/3] overflow-hidden bg-bgc-layer2">
                        <img
                          src={resolveAssetUrl(comic.cover_url)}
                          alt={comic.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />

                        {view === 'ranking' && page === 1 && idx < 3 && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-gradient-to-r from-lav-500 to-mag-500 text-white font-bold text-[11px] shadow">
                            TOP {idx + 1}
                          </span>
                        )}

                        {comic.status === 'completed' && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500/90 text-[10px] font-bold text-black">
                            FULL
                          </span>
                        )}

                        <div className="absolute bottom-1.5 inset-x-2 flex items-center justify-between text-[11px] text-zinc-200">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3 text-lav-400" /> {formatViews(comic.views_total)}
                          </span>
                          <span className="flex items-center gap-0.5 text-amber-400">
                            <Star className="w-3 h-3 fill-amber-400" /> {comic.rating_avg.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
                        <h3 className="text-xs sm:text-sm font-semibold text-txt-primary line-clamp-2 group-hover:text-lav-400 transition leading-snug">
                          {comic.title}
                        </h3>
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                          <span className="font-medium text-txt-focus">
                            {comic.latest_chapter !== null ? `Chap ${comic.latest_chapter}` : 'Đang cập nhật'}
                          </span>
                          <span className="text-txt-secondary">{formatRelTime(comic.updated_at)}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Phân trang */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-3">
                  <button
                    disabled={page <= 1}
                    onClick={() => {
                      const nextP = page - 1;
                      setPage(nextP);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      navigateTo({
                        view,
                        q: activeQuery,
                        sort,
                        status: statusFilter,
                        author: authorFilter,
                        inc: incGenres,
                        exc: excGenres,
                        page: nextP,
                        libraryTab,
                      });
                    }}
                    className="px-3.5 py-2 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 disabled:opacity-35 text-xs font-semibold flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Trước
                  </button>
                  <span className="px-4 py-2 rounded-lg bg-lav-500 text-white text-xs font-bold">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => {
                      const nextP = page + 1;
                      setPage(nextP);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                      navigateTo({
                        view,
                        q: activeQuery,
                        sort,
                        status: statusFilter,
                        author: authorFilter,
                        inc: incGenres,
                        exc: excGenres,
                        page: nextP,
                        libraryTab,
                      });
                    }}
                    className="px-3.5 py-2 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 disabled:opacity-35 text-xs font-semibold flex items-center gap-1"
                  >
                    Sau <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>

            {/* Cột phải Trang chủ: Bảng Xếp Hạng Top 10 */}
            {view === 'home' && (
              <aside className="lg:col-span-4 space-y-4">
                <div className="rounded-lg bg-bgc-layer1 border border-bd-default overflow-hidden">
                  <div className="grid grid-cols-3 border-b border-bd-default bg-bgc-layer2/60">
                    {(
                      [
                        ['top-day', 'Top Ngày'],
                        ['top-week', 'Top Tuần'],
                        ['top-month', 'Top Tháng'],
                      ] as const
                    ).map(([tabKey, tabLabel]) => (
                      <button
                        key={tabKey}
                        onClick={() => setSidebarRankTab(tabKey)}
                        className={`py-2.5 text-xs font-bold border-b-2 transition ${
                          sidebarRankTab === tabKey
                            ? 'border-lav-500 text-lav-400 bg-lav-500/10'
                            : 'border-transparent text-txt-secondary hover:text-txt-primary'
                        }`}
                      >
                        {tabLabel}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-white/5">
                    {sidebarRanking.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => openComicDetail(item.slug)}
                        className="w-full p-2.5 flex items-center gap-3 hover:bg-white/[0.04] text-left transition group"
                      >
                        <span
                          className={`w-6 text-center font-extrabold text-sm tabular-nums ${
                            idx === 0
                              ? 'text-mag-400'
                              : idx === 1
                              ? 'text-lav-400'
                              : idx === 2
                              ? 'text-amber-400'
                              : 'text-txt-secondary'
                          }`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <img
                          src={resolveAssetUrl(item.cover_url)}
                          alt={item.title}
                          className="w-11 h-14 rounded object-cover bg-bgc-layer2 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-xs font-semibold text-txt-primary truncate group-hover:text-lav-400 transition">
                            {item.title}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-txt-secondary">
                            <span className="text-txt-focus">
                              {item.latest_chapter !== null ? `Chap ${item.latest_chapter}` : 'Mới'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {formatViews(item.views_total)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* ==================== TỦ TRUYỆN & LỊCH SỬ ==================== */}
        {view === 'library' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex bg-bgc-layer1 p-1 rounded-lg border border-bd-default">
                <button
                  onClick={() => {
                    setLibraryTab('bookmarks');
                    navigateTo({ view: 'library', libraryTab: 'bookmarks' });
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                    libraryTab === 'bookmarks' ? 'bg-lav-500 text-white' : 'text-txt-secondary'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" /> Đang theo dõi ({bookmarks.length})
                </button>
                <button
                  onClick={() => {
                    setLibraryTab('history');
                    navigateTo({ view: 'library', libraryTab: 'history' });
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                    libraryTab === 'history' ? 'bg-lav-500 text-white' : 'text-txt-secondary'
                  }`}
                >
                  <History className="w-3.5 h-3.5" /> Lịch sử đọc ({historyList.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    pushModalState('backup');
                    setBackupModalOpen(true);
                    setBackupMsg('');
                    setImportText('');
                  }}
                  className="px-3.5 py-2 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-lav-400" /> Sao lưu / Khôi phục
                </button>
                {libraryTab === 'history' && historyList.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm('Xóa toàn bộ lịch sử đọc?')) return;
                      clearHistory();
                      setHistoryList([]);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa lịch sử
                  </button>
                )}
              </div>
            </div>

            {libraryTab === 'bookmarks' ? (
              bookmarks.length === 0 ? (
                <div className="py-16 text-center rounded-lg bg-bgc-layer1 border border-bd-default text-txt-secondary text-sm">
                  Bạn chưa theo dõi bộ truyện nào.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {bookmarks.map((c) => (
                    <div
                      key={c.slug}
                      onClick={() => openComicDetail(c.slug)}
                      className="cursor-pointer group space-y-2"
                    >
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-bgc-layer1 border border-bd-default group-hover:border-lav-500">
                        <img
                          src={resolveAssetUrl(c.cover_url)}
                          alt={c.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      </div>
                      <p className="text-xs font-semibold text-txt-primary line-clamp-2 group-hover:text-lav-400">
                        {c.title}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : historyList.length === 0 ? (
              <div className="py-16 text-center rounded-lg bg-bgc-layer1 border border-bd-default text-txt-secondary text-sm">
                Chưa có lịch sử đọc truyện.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {historyList.map((h) => (
                  <div
                    key={h.slug}
                    onClick={() => openChapter(h.chapter_id)}
                    className="p-3 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 flex items-center gap-3 cursor-pointer transition"
                  >
                    <img
                      src={resolveAssetUrl(h.cover_url)}
                      alt={h.title}
                      className="w-14 h-20 rounded object-cover bg-bgc-layer2 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-txt-primary truncate">{h.title}</p>
                      <p className="text-xs font-medium text-mag-400">Đang đọc Chap {h.chapter_number}</p>
                      {h.total_pages && h.progress ? (
                        <p className="text-[11px] text-txt-secondary">
                          Trang {h.progress} / {h.total_pages}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ==================== TRANG CHI TIẾT TRUYỆN ==================== */}
        {view === 'detail' && (
          <section className="pb-16">
            {detailLoading || !selectedComic ? (
              <div className="py-20 text-center text-txt-secondary">Đang tải thông tin truyện...</div>
            ) : (
              <>
                <nav aria-label="Breadcrumb" className="mb-4 text-txt-focus text-sm font-medium">
                  <ol className="flex flex-wrap items-center gap-1">
                    <li className="flex items-center gap-1">
                      <button
                        onClick={() => navigateTo({ view: 'home' })}
                        className="transition-colors hover:text-lav-500"
                      >
                        Trang chủ
                      </button>
                      <span className="text-txt-secondary/60 px-0.5">/</span>
                    </li>
                    <li>
                      <span className="text-txt-focus">{selectedComic.title}</span>
                    </li>
                  </ol>
                </nav>

                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="relative mx-auto w-48 sm:w-56 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-lg border border-bd-default bg-bgc-layer1 shadow-xl">
                    <img
                      src={resolveAssetUrl(selectedComic.cover_url)}
                      alt={`Bìa truyện ${selectedComic.title}`}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-1">
                    <div className="flex flex-col gap-1">
                      <h1 className="text-txt-primary text-2xl leading-snug font-semibold">
                        {selectedComic.title}
                      </h1>
                      {selectedComic.alt_titles && (
                        <div className="text-txt-secondary text-sm">{selectedComic.alt_titles}</div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(selectedComic.id)).catch(() => {});
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        className="text-txt-secondary hover:text-txt-primary mt-1 inline-flex w-fit items-center gap-1.5 text-xs"
                      >
                        <span className="select-all font-mono">#{selectedComic.id}</span>
                        {copiedId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="border-bd-default h-0 border-t" />

                    <div className="grid grid-cols-[auto_1fr] items-center gap-y-3 gap-x-3 text-sm sm:text-base">
                      <div className="text-txt-secondary w-28 font-medium">Tình trạng:</div>
                      <div className="text-txt-primary font-medium">
                        {selectedComic.status === 'completed' ? 'Hoàn thành' : 'Đang tiến hành'}
                      </div>

                      <div className="text-txt-secondary w-28 font-medium">Tác giả:</div>
                      <div className="flex flex-wrap gap-2 justify-self-start">
                        {selectedComic.author ? (
                          <button
                            onClick={() => {
                              const authorSlug = selectedComic.author!.slug;
                              setAuthorFilter(authorSlug);
                              setPage(1);
                              navigateTo({ view: 'browse', author: authorSlug, page: 1 });
                            }}
                            className="group inline-flex h-8 max-w-[260px] items-stretch overflow-hidden rounded-md border border-white/15 hover:border-lav-500 transition"
                          >
                            <span className="flex min-w-0 items-center bg-black/30 group-hover:bg-black/50 px-3 text-xs sm:text-sm font-medium text-txt-primary">
                              {selectedComic.author.name}
                            </span>
                            {selectedComic.same_author_comics && (
                              <span className="flex items-center border-l border-white/15 bg-black/45 px-2.5 text-xs font-semibold text-txt-focus">
                                {selectedComic.same_author_comics.length + 1}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-txt-primary font-medium">Đang cập nhật</span>
                        )}
                      </div>

                      <div className="text-txt-secondary w-28 font-medium">Dịch giả:</div>
                      <div className="text-txt-primary font-medium">
                        {selectedComic.translator || 'Đang cập nhật'}
                      </div>

                      <div className="text-txt-secondary w-28 font-medium">Cập nhật:</div>
                      <time className="text-txt-primary font-medium">
                        {formatRelTime(selectedComic.updated_at)}
                      </time>

                      <div className="text-txt-secondary w-28 self-start pt-0.5 font-medium">Thể loại:</div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {(showAllGenres ? selectedComic.genres : selectedComic.genres.slice(0, 8)).map((g) => (
                          <button
                            key={g.id}
                            onClick={() => {
                              setIncGenres([g.slug]);
                              setExcGenres([]);
                              setPage(1);
                              navigateTo({ view: 'browse', inc: [g.slug], page: 1 });
                            }}
                            className="inline-flex items-center rounded-md border border-white/20 bg-black/30 hover:border-lav-500 hover:bg-lav-500/20 px-2.5 py-1 text-xs font-medium text-[#EBD7FF]/95 transition"
                          >
                            {g.name}
                          </button>
                        ))}
                        {selectedComic.genres.length > 8 && !showAllGenres && (
                          <button
                            onClick={() => setShowAllGenres(true)}
                            className="inline-flex items-center rounded-md border border-white/20 bg-black/30 hover:border-lav-500 px-2 py-1 text-xs font-bold text-txt-focus transition"
                          >
                            ... +{selectedComic.genres.length - 8}
                          </button>
                        )}
                        {showAllGenres && selectedComic.genres.length > 8 && (
                          <button
                            onClick={() => setShowAllGenres(false)}
                            className="inline-flex items-center rounded-md border border-white/20 bg-black/30 hover:border-lav-500 px-2 py-1 text-xs font-bold text-txt-secondary transition"
                          >
                            Thu gọn
                          </button>
                        )}
                      </div>

                      <div className="text-txt-secondary w-28 font-medium">Tổng quan:</div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-txt-secondary">
                          <Eye className="w-4 h-4 text-lav-400" />
                          <span className="text-txt-primary font-medium">
                            {selectedComic.views_total.toLocaleString('vi-VN')}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-txt-secondary">
                          <ThumbsUp className="w-4 h-4 text-mag-400" />
                          <span className="text-txt-primary font-medium">
                            {selectedComic.likes_count || 71}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-txt-secondary">
                          <Image className="w-4 h-4 text-lav-400" />
                          <span className="text-txt-primary font-medium">
                            {selectedComic.chapters.length * 38 || 38}
                          </span>
                        </span>
                      </div>
                    </div>

                    {selectedComic.description && (
                      <p className="text-sm text-txt-secondary leading-relaxed whitespace-pre-line bg-bgc-layer1/70 border border-bd-default rounded-lg p-3.5">
                        {selectedComic.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          toggleBookmark(selectedComic);
                          setBookmarks(getBookmarks());
                        }}
                        className={`hover-lift inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${
                          isBookmarked(selectedComic.slug)
                            ? 'border-mag-500 bg-mag-500/20 text-mag-400'
                            : 'border-bd-strong bg-bgc-layer2 hover:border-lav-500 text-txt-primary'
                        }`}
                      >
                        <Bookmark
                          className="w-4 h-4 text-lav-400"
                        />
                        <span>Theo dõi ({bookmarks.length + 330})</span>
                      </button>

                      {selectedComic.chapters.length > 0 && (
                        <button
                          onClick={() =>
                            openChapter(selectedComic.chapters[selectedComic.chapters.length - 1].id)
                          }
                          className="hover-lift inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-lav-500/25"
                        >
                          Đọc ngay
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Translator Profile Card */}
                {selectedComic.translator && (
                  <div className="mt-8 overflow-hidden rounded-md border border-bd-default bg-bgc-layer1">
                    <div className="relative px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={getAvatarUrl(selectedComic.translator, selectedComic.translator)}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover bg-bgc-layer2 border border-bd-default"
                        />
                        <div>
                          <div className="text-txt-primary font-bold text-sm">
                            {selectedComic.translator}
                          </div>
                          <div className="text-txt-secondary text-[11px]">
                            Cấp 5 · Dịch giả chính
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-lav-400 hover:underline flex items-center gap-1 cursor-pointer">
                        Trang dịch giả ↗
                      </span>
                    </div>
                  </div>
                )}

                {/* DANH SÁCH CHƯƠNG */}
                <div className="mt-6 flex flex-col">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-txt-primary text-lg sm:text-xl font-semibold uppercase">
                      DANH SÁCH CHƯƠNG ({selectedComic.chapters.length})
                    </h2>
                    <div className="flex items-center gap-2">
                      <input
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        placeholder="Tìm số chap..."
                        className="w-36 sm:w-44 px-3 py-1.5 rounded-lg bg-bgc-layer1 border border-bd-default text-xs text-txt-primary outline-none focus:border-lav-500"
                      />
                      <button
                        onClick={() => setChapterSortAsc((a) => !a)}
                        className="px-3 py-1.5 rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 text-xs font-semibold text-txt-secondary hover:text-txt-primary"
                      >
                        {chapterSortAsc ? 'Cũ → Mới' : 'Mới → Cũ'}
                      </button>
                    </div>
                  </div>

                  <div className="flex max-h-[552px] flex-col overflow-y-auto rounded-md border border-bd-default bg-bgc-layer1 divide-y divide-white/5">
                    {filteredChapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => openChapter(ch.id)}
                        className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5 group"
                      >
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                          <span className="text-txt-primary group-hover:text-lav-400 min-w-0 text-sm sm:text-base font-medium truncate">
                            Chap {ch.chapter_number}
                            {ch.title ? ` — ${ch.title}` : ''}
                          </span>
                          <span className="text-xs text-txt-secondary shrink-0">
                            {formatRelTime(ch.created_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* CÙNG TÁC GIẢ */}
                {selectedComic.same_author_comics && selectedComic.same_author_comics.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <h2 className="text-txt-primary text-lg sm:text-xl font-semibold uppercase flex items-center gap-2 border-l-4 border-lav-500 pl-3">
                      CÙNG TÁC GIẢ ({selectedComic.same_author_comics.length})
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {selectedComic.same_author_comics.map((rel) => (
                        <div
                          key={rel.id}
                          onClick={() => openComicDetail(rel.slug)}
                          className="cursor-pointer group rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500 overflow-hidden transition flex flex-col"
                        >
                          <div className="aspect-[2/3] overflow-hidden bg-bgc-layer2">
                            <img
                              src={resolveAssetUrl(rel.cover_url)}
                              alt={rel.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-semibold text-txt-primary line-clamp-2 group-hover:text-lav-400">
                              {rel.title}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CÓ THỂ BẠN SẼ THÍCH */}
                <div className="mt-8 space-y-4">
                  <h2 className="text-txt-primary text-lg sm:text-xl font-semibold uppercase flex items-center gap-2 border-l-4 border-mag-500 pl-3">
                    <Flame className="w-5 h-5 text-mag-400" /> CÓ THỂ BẠN SẼ THÍCH
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {comics.slice(0, 6).map((rc) => (
                      <div
                        key={rc.id}
                        onClick={() => openComicDetail(rc.slug)}
                        className="cursor-pointer group bg-bgc-layer1 p-2.5 rounded-lg border border-bd-default hover:border-lav-500 flex items-center gap-3 transition"
                      >
                        <img
                          src={resolveAssetUrl(rc.cover_url)}
                          alt={rc.title}
                          className="w-16 h-22 rounded object-cover bg-bgc-layer2 shrink-0 border border-bd-default"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-xs sm:text-sm font-semibold text-txt-primary line-clamp-1 group-hover:text-lav-400">
                            {rc.title}
                          </p>
                          <p className="text-[11px] text-txt-secondary line-clamp-2">
                            {rc.description || 'Truyện hay cập nhật mới nhất...'}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-txt-secondary pt-1">
                            <span>👁 {formatViews(rc.views_total)}</span>
                            <span>⭐ {rc.rating_avg.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BÌNH LUẬN */}
                <div className="mt-8 space-y-4">
                  <h2 className="text-txt-primary text-lg sm:text-xl font-semibold uppercase">
                    BÌNH LUẬN
                  </h2>
                  {!currentUser && (
                    <div className="rounded-md border border-bd-default bg-bgc-layer1 py-5 text-center text-sm text-txt-secondary">
                      Vui lòng{' '}
                      <button
                        onClick={() => setAuthModalOpen(true)}
                        className="text-mag-400 hover:text-mag-500 font-semibold underline"
                      >
                        Đăng nhập
                      </button>{' '}
                      để bình luận
                    </div>
                  )}
                  <CommentSection
                    comicId={selectedComic.id}
                    currentUser={currentUser}
                    onRequireAuth={() => setAuthModalOpen(true)}
                  />
                </div>
              </>
            )}
          </section>
        )}
      </main>

      {/* ==================== MENU DRAWER ==================== */}
      {menuDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end">
          <div className="w-72 max-w-[85vw] h-full bg-bgc-layer1 border-l border-bd-strong p-5 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-bd-default pb-3">
                <span className="font-extrabold text-base text-white">
                  Vina<span className="text-lav-400">Hentai</span>
                </span>
                <button
                  onClick={() => setMenuDrawerOpen(false)}
                  className="p-1.5 rounded-lg bg-bgc-layer2 text-txt-secondary hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 text-sm font-medium">
                <button
                  onClick={() => navigateTo({ view: 'home' })}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <Home className="w-4 h-4 text-lav-400" /> Trang chủ
                </button>
                <button
                  onClick={() => navigateTo({ view: 'ranking', sort: 'top-day' })}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <Trophy className="w-4 h-4 text-mag-400" /> Bảng xếp hạng
                </button>
                <button
                  onClick={() => navigateTo({ view: 'summon' })}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <Sparkles className="w-4 h-4 text-lav-400" /> Triệu hồi Waifu
                </button>
                <button
                  onClick={() => navigateTo({ view: 'library', libraryTab: 'bookmarks' })}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <Heart className="w-4 h-4 text-mag-400" /> Truyện theo dõi ({bookmarks.length})
                </button>
                <button
                  onClick={() => navigateTo({ view: 'library', libraryTab: 'history' })}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <History className="w-4 h-4 text-lav-400" /> Lịch sử đọc ({historyList.length})
                </button>
                <button
                  onClick={() => {
                    setMenuDrawerOpen(false);
                    pushModalState('filter');
                    setShowFilterModal(true);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg hover:bg-bgc-layer2 flex items-center gap-2.5 text-left"
                >
                  <SlidersHorizontal className="w-4 h-4 text-lav-400" /> Tìm kiếm nâng cao
                </button>
              </div>
            </div>

            <div className="border-t border-bd-default pt-4 space-y-2">
              <button
                onClick={() => navigateTo({ view: 'admin' })}
                className="w-full px-3 py-2 rounded-lg bg-bgc-layer2 hover:border-lav-500 border border-bd-default text-xs font-semibold text-txt-secondary hover:text-txt-primary flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-lav-400" /> Bảng điều khiển Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL TÌM KIẾM NÂNG CAO ==================== */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl bg-bgc-layer1 border border-bd-strong p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-txt-primary">Tìm kiếm nâng cao theo Thể loại</h3>
                <p className="text-xs text-txt-secondary">
                  Nhấn 1 lần: <span className="text-emerald-400 font-semibold">Bao gồm</span> • Nhấn 2 lần:{' '}
                  <span className="text-mag-400 font-semibold">Loại trừ</span> • Nhấn 3 lần: Bỏ chọn
                </p>
              </div>
              <button
                onClick={() => {
                  if (window.history.state?.modal === 'filter') window.history.back();
                  else setShowFilterModal(false);
                }}
                className="text-txt-secondary hover:text-white p-1.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto py-1">
              {genres.map((g) => {
                const isInc = incGenres.includes(g.slug);
                const isExc = excGenres.includes(g.slug);
                return (
                  <button
                    key={g.id}
                    onClick={() => cycleGenreState(g.slug)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      isInc
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : isExc
                        ? 'bg-mag-500/20 border-mag-500 text-mag-400 line-through'
                        : 'bg-bgc-layer2 border-bd-default text-txt-secondary hover:text-txt-primary'
                    }`}
                  >
                    {isInc ? '+ ' : isExc ? '− ' : ''}
                    {g.name}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-bd-default">
              <button
                onClick={() => {
                  setIncGenres([]);
                  setExcGenres([]);
                }}
                className="text-xs font-semibold text-txt-secondary hover:text-white"
              >
                Đặt lại
              </button>
              <button
                onClick={() => {
                  if (window.history.state?.modal === 'filter') window.history.back();
                  else setShowFilterModal(false);
                  setPage(1);
                  replaceRoute({
                    view: 'browse',
                    q: activeQuery,
                    sort,
                    status: statusFilter,
                    author: authorFilter,
                    inc: incGenres,
                    exc: excGenres,
                    page: 1,
                  });
                  setView('browse');
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 text-xs font-bold text-white"
              >
                Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL SAO LƯU / KHÔI PHỤC ==================== */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-bgc-layer1 border border-bd-strong p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-txt-primary">Sao lưu & Khôi phục Tủ truyện</h3>
              <button
                onClick={() => {
                  if (window.history.state?.modal === 'backup') window.history.back();
                  else setBackupModalOpen(false);
                }}
                className="text-txt-secondary hover:text-white p-1.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                const data = exportUserData();
                navigator.clipboard?.writeText(data).catch(() => {});
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vinahentai-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setBackupMsg('Đã tải file sao lưu JSON và sao chép vào bộ nhớ tạm!');
              }}
              className="w-full py-2.5 rounded-xl bg-lav-500/20 hover:bg-lav-500/30 border border-lav-500 text-txt-focus text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Xuất file sao lưu (JSON)
            </button>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-txt-secondary">
                Hoặc dán mã JSON để khôi phục sang máy mới:
              </label>
              <textarea
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"version": 2, "bookmarks": [...], "history": [...]}'
                className="w-full rounded-xl bg-bgc-layer2 border border-bd-default p-3 text-xs text-txt-primary font-mono outline-none focus:border-lav-500"
              />
              <button
                onClick={() => {
                  try {
                    const res = importUserData(importText);
                    setBookmarks(getBookmarks());
                    setHistoryList(getHistory());
                    setBackupMsg(
                      `Khôi phục thành công: ${res.bookmarks} truyện theo dõi & ${res.history} lịch sử!`
                    );
                  } catch (err) {
                    setBackupMsg((err as Error).message);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> Nhập dữ liệu khôi phục
              </button>
            </div>

            {backupMsg && <p className="text-xs font-semibold text-emerald-400">{backupMsg}</p>}
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => setCurrentUser(u)}
      />
    </div>
  );
}

export default App;
