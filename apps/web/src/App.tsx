import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Download,
  Eye,
  Filter,
  Flame,
  Heart,
  History,
  Home,
  Library,
  Megaphone,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Upload,
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
  toggleBookmark,
} from './lib/api';
import { ReaderView } from './components/ReaderView';
import { AdminPanel } from './components/AdminPanel';

type ViewMode = 'home' | 'browse' | 'ranking' | 'library' | 'detail' | 'reader' | 'admin';

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export function App() {
  const [view, setView] = useState<ViewMode>(() => {
    if (window.location.pathname === '/admin' || window.location.hash === '#/admin') return 'admin';
    return 'home';
  });

  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    site_name: 'VinaReader',
    announcement_enabled: '0',
    announcement_text: '',
    maintenance_mode: '0',
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Dữ liệu chung
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [heroComics, setHeroComics] = useState<ComicSummary[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);

  // Danh sách truyện chính (Home / Browse / Ranking)
  const [comics, setComics] = useState<ComicSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [sort, setSort] = useState<string>('latest');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('');
  const [incGenres, setIncGenres] = useState<string[]>([]);
  const [excGenres, setExcGenres] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Chi tiết truyện & Trình đọc
  const [selectedComic, setSelectedComic] = useState<ComicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterSortAsc, setChapterSortAsc] = useState(false);
  const [userRatingHover, setUserRatingHover] = useState(0);
  const [ratedDone, setRatedDone] = useState(false);
  const [readerData, setReaderData] = useState<ChapterPagesPayload | null>(null);

  // Tủ truyện & Lịch sử
  const [libraryTab, setLibraryTab] = useState<'bookmarks' | 'history'>('bookmarks');
  const [bookmarks, setBookmarks] = useState<ComicSummary[]>(() => getBookmarks());
  const [historyList, setHistoryList] = useState<HistoryItem[]>(() => getHistory());
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [backupMsg, setBackupMsg] = useState('');

  const loadSettings = useCallback(async () => {
    const s = await fetchPublicSettings();
    setPublicSettings(s);
    if (s.site_name) document.title = `${s.site_name} — Đọc Truyện Tranh Siêu Tốc`;
  }, []);

  useEffect(() => {
    loadSettings();
    fetchGenres().then(setGenres).catch(() => {});
  }, [loadSettings]);

  // Tải Hero Spotlight
  useEffect(() => {
    if (view !== 'home') return;
    fetchComics({ featured: '1', limit: 6 })
      .then((res) => {
        if (res.items.length > 0) setHeroComics(res.items);
        else return fetchComics({ sort: 'top-week', limit: 6 }).then((fb) => setHeroComics(fb.items));
      })
      .catch(() => {});
  }, [view]);

  // Tự xoay Hero Banner mỗi 6.5s
  useEffect(() => {
    if (view !== 'home' || heroComics.length <= 1) return;
    const t = window.setInterval(() => setHeroIdx((i) => (i + 1) % heroComics.length), 6500);
    return () => window.clearInterval(t);
  }, [view, heroComics.length]);

  // Tải danh sách truyện theo bộ lọc
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
    setDetailLoading(true);
    setView('detail');
    setChapterSearch('');
    setRatedDone(false);
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

  const openChapter = async (chapterId: number) => {
    try {
      const payload = await fetchChapterPages(chapterId);
      setReaderData(payload);
      setView('reader');
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
          setView('home');
          if (window.location.pathname === '/admin') window.history.replaceState({}, '', '/');
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
          openComicDetail(readerData.chapter.comic_slug);
        }}
        onOpenChapter={openChapter}
        onProgress={handleReaderProgress}
      />
    );
  }

  const activeHero = heroComics[heroIdx];

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100 pb-24 md:pb-12 selection:bg-rose-500/30">
      {/* Thanh thông báo toàn trang từ Admin */}
      {publicSettings.announcement_enabled === '1' &&
        publicSettings.announcement_text &&
        !bannerDismissed && (
          <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 relative">
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

      {/* Chế độ bảo trì */}
      {publicSettings.maintenance_mode === '1' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <Wrench className="w-3.5 h-3.5" /> Hệ thống đang bảo trì nâng cấp nhẹ. Một số chương có thể cập nhật chậm.
        </div>
      )}

      {/* Header Glassmorphism */}
      <header className="sticky top-0 z-40 bg-[#09090f]/80 backdrop-blur-2xl border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setView('home');
              setActiveQuery('');
              setSearchInput('');
              setAuthorFilter('');
              setIncGenres([]);
              setExcGenres([]);
              setSort('latest');
              setPage(1);
            }}
            className="flex items-center gap-2.5 shrink-0 group"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30 group-hover:scale-105 transition">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              {publicSettings.site_name || 'VinaReader'}
            </span>
          </button>

          {/* Menu Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { id: 'home', label: 'Trang chủ', icon: <Home className="w-4 h-4" /> },
              { id: 'browse', label: 'Khám phá', icon: <Compass className="w-4 h-4" /> },
              { id: 'ranking', label: 'Bảng xếp hạng', icon: <Trophy className="w-4 h-4" /> },
              { id: 'library', label: 'Tủ truyện', icon: <Library className="w-4 h-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id as ViewMode);
                  setPage(1);
                  if (item.id === 'ranking') setSort('top-day');
                  else if (item.id === 'home') setSort('latest');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  view === item.id
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>

          {/* Thanh tìm kiếm */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setActiveQuery(searchInput.trim());
              setView('browse');
              setPage(1);
            }}
            className="flex-1 max-w-xs relative"
          >
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm truyện..."
              className="w-full pl-9 pr-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-rose-500/60 focus:bg-white/[0.09] transition"
            />
          </form>

          <button
            onClick={() => setView('admin')}
            title="Quản trị hệ thống"
            className="p-2.5 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition shrink-0"
          >
            <Shield className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-5 space-y-8">
        {/* ==================== HOME: HERO SPOTLIGHT + CONTINUE READING ==================== */}
        {view === 'home' && activeHero && (
          <section className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#111119] min-h-[280px] sm:min-h-[340px] flex items-end shadow-2xl">
            <img
              src={resolveAssetUrl(activeHero.cover_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07070b] via-[#07070b]/65 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#07070b]/95 via-[#07070b]/50 to-transparent" />

            <div className="relative z-10 w-full p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-end gap-5">
              <img
                src={resolveAssetUrl(activeHero.cover_url)}
                alt={activeHero.title}
                onClick={() => openComicDetail(activeHero.slug)}
                className="w-28 sm:w-40 aspect-[2/3] object-cover rounded-2xl shadow-2xl border border-white/15 cursor-pointer hover:scale-[1.03] transition shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-extrabold">
                  <Sparkles className="w-3 h-3" /> ĐỀ CỬ NỔI BẬT
                </div>
                <h2
                  onClick={() => openComicDetail(activeHero.slug)}
                  className="text-2xl sm:text-4xl font-black text-white leading-tight line-clamp-2 cursor-pointer hover:text-rose-400 transition"
                >
                  {activeHero.title}
                </h2>
                {activeHero.description && (
                  <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2 max-w-2xl">
                    {activeHero.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => openComicDetail(activeHero.slug)}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-rose-500/30 transition"
                  >
                    Đọc ngay
                  </button>
                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {activeHero.rating_avg.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {formatViews(activeHero.views_total)}
                  </span>
                </div>
              </div>

              {heroComics.length > 1 && (
                <div className="flex items-center gap-1.5 self-end">
                  {heroComics.map((hc, idx) => (
                    <button
                      key={hc.id}
                      onClick={() => setHeroIdx(idx)}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === heroIdx ? 'w-7 bg-rose-500' : 'w-2 bg-white/25 hover:bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Dải Tiếp tục đọc (Continue Reading) */}
        {view === 'home' && historyList.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-400" /> Tiếp tục đọc
              </h3>
              <button
                onClick={() => {
                  setLibraryTab('history');
                  setView('library');
                }}
                className="text-xs font-bold text-rose-400 hover:underline"
              >
                Xem tất cả
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {historyList.slice(0, 8).map((h) => {
                const pct =
                  h.total_pages && h.progress ? Math.min(100, Math.round((h.progress / h.total_pages) * 100)) : 0;
                return (
                  <button
                    key={h.slug}
                    onClick={() => openChapter(h.chapter_id)}
                    className="w-60 shrink-0 rounded-2xl bg-[#111119] border border-white/[0.08] hover:border-rose-500/40 p-2.5 flex items-center gap-3 text-left transition group"
                  >
                    <img
                      src={resolveAssetUrl(h.cover_url)}
                      alt={h.title}
                      className="w-12 h-16 rounded-xl object-cover bg-zinc-900 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-bold text-white truncate group-hover:text-rose-400 transition">
                        {h.title}
                      </p>
                      <p className="text-[11px] font-semibold text-rose-400">Đọc tiếp Ch.{h.chapter_number}</p>
                      <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.max(10, pct)}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== HOME / BROWSE / RANKING GRID ==================== */}
        {(view === 'home' || view === 'browse' || view === 'ranking') && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  {view === 'ranking' ? (
                    <>
                      <Flame className="w-5 h-5 text-orange-400" /> Bảng Xếp Hạng
                    </>
                  ) : activeQuery ? (
                    <>Kết quả cho "{activeQuery}"</>
                  ) : authorFilter ? (
                    <>Tác giả: {authorFilter}</>
                  ) : (
                    <>Mới cập nhật</>
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
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-[11px] font-bold"
                  >
                    Xóa lọc
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {view === 'ranking' ? (
                  <div className="flex bg-white/[0.05] p-1 rounded-xl border border-white/10">
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
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          sort === k ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
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
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#111119] border border-white/10 text-xs font-bold text-zinc-200"
                    >
                      <option value="all">Mọi trạng thái</option>
                      <option value="ongoing">Đang tiến hành</option>
                      <option value="completed">Đã hoàn thành</option>
                    </select>
                    <button
                      onClick={() => setShowFilterModal(true)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                        incGenres.length + excGenres.length > 0
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          : 'bg-[#111119] border-white/10 text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Thể loại
                      {incGenres.length + excGenres.length > 0 && ` (${incGenres.length + excGenres.length})`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-2 animate-pulse">
                    <div className="aspect-[2/3] rounded-2xl bg-white/[0.06]" />
                    <div className="h-3.5 w-3/4 rounded bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            ) : comics.length === 0 ? (
              <div className="py-20 text-center rounded-3xl bg-[#111119] border border-white/5 text-zinc-400 text-sm">
                Không tìm thấy bộ truyện nào phù hợp.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {comics.map((comic, idx) => (
                  <article
                    key={comic.id}
                    onClick={() => openComicDetail(comic.slug)}
                    className="group cursor-pointer space-y-2"
                  >
                    <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#12121b] border border-white/[0.07] group-hover:border-rose-500/50 shadow-lg transition">
                      <img
                        src={resolveAssetUrl(comic.cover_url)}
                        alt={comic.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                      {view === 'ranking' && page === 1 && idx < 3 && (
                        <div className="absolute top-2 left-2 w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-black font-black text-xs flex items-center justify-center shadow-lg">
                          #{idx + 1}
                        </div>
                      )}

                      {comic.status === 'completed' && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-emerald-500/90 text-[10px] font-black text-black">
                          FULL
                        </span>
                      )}

                      <div className="absolute bottom-2 inset-x-2.5 flex items-center justify-between text-[11px] font-bold">
                        <span className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-rose-300 border border-white/10">
                          {comic.latest_chapter !== null ? `Ch.${comic.latest_chapter}` : 'Mới'}
                        </span>
                        <span className="text-zinc-200 flex items-center gap-0.5 drop-shadow">
                          <Eye className="w-3 h-3" /> {formatViews(comic.views_total)}
                        </span>
                      </div>
                    </div>

                    <div className="px-0.5 space-y-0.5">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-100 line-clamp-2 group-hover:text-rose-400 transition leading-snug">
                        {comic.title}
                      </h3>
                      <p className="text-[11px] text-zinc-500">{formatRelTime(comic.updated_at)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Phân trang */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((p) => p - 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Trước
                </button>
                <span className="px-4 py-2 rounded-xl bg-white/[0.04] text-xs font-bold text-zinc-300">
                  Trang {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    setPage((p) => p + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 disabled:opacity-30 text-xs font-bold flex items-center gap-1"
                >
                  Sau <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </section>
        )}

        {/* ==================== LIBRARY (TỦ TRUYỆN + SAO LƯU) ==================== */}
        {view === 'library' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex bg-white/[0.05] p-1 rounded-2xl border border-white/10">
                <button
                  onClick={() => setLibraryTab('bookmarks')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    libraryTab === 'bookmarks' ? 'bg-rose-500 text-white' : 'text-zinc-400'
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" /> Đang theo dõi ({bookmarks.length})
                </button>
                <button
                  onClick={() => setLibraryTab('history')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    libraryTab === 'history' ? 'bg-rose-500 text-white' : 'text-zinc-400'
                  }`}
                >
                  <History className="w-3.5 h-3.5" /> Lịch sử đọc ({historyList.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBackupModalOpen(true);
                    setBackupMsg('');
                    setImportText('');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/15 text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" /> Sao lưu / Khôi phục
                </button>
                {libraryTab === 'history' && historyList.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm('Xóa toàn bộ lịch sử đọc?')) return;
                      clearHistory();
                      setHistoryList([]);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa lịch sử
                  </button>
                )}
              </div>
            </div>

            {libraryTab === 'bookmarks' ? (
              bookmarks.length === 0 ? (
                <div className="py-16 text-center rounded-3xl bg-[#111119] border border-white/5 text-zinc-400 text-sm">
                  Bạn chưa theo dõi bộ truyện nào.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {bookmarks.map((c) => (
                    <div
                      key={c.slug}
                      onClick={() => openComicDetail(c.slug)}
                      className="cursor-pointer group space-y-2"
                    >
                      <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
                        <img
                          src={resolveAssetUrl(c.cover_url)}
                          alt={c.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      </div>
                      <p className="text-xs font-bold text-white line-clamp-2 group-hover:text-rose-400">
                        {c.title}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : historyList.length === 0 ? (
              <div className="py-16 text-center rounded-3xl bg-[#111119] border border-white/5 text-zinc-400 text-sm">
                Chưa có lịch sử đọc truyện.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {historyList.map((h) => (
                  <div
                    key={h.slug}
                    onClick={() => openChapter(h.chapter_id)}
                    className="p-3 rounded-2xl bg-[#111119] border border-white/10 hover:border-rose-500/40 flex items-center gap-3 cursor-pointer transition"
                  >
                    <img
                      src={resolveAssetUrl(h.cover_url)}
                      alt={h.title}
                      className="w-14 h-20 rounded-xl object-cover bg-zinc-900 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-bold text-white truncate">{h.title}</p>
                      <p className="text-xs font-semibold text-rose-400">Đang đọc Chương {h.chapter_number}</p>
                      {h.total_pages && h.progress ? (
                        <p className="text-[11px] text-zinc-500">
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

        {/* ==================== COMIC DETAIL ==================== */}
        {view === 'detail' && (
          <section className="space-y-6">
            <button
              onClick={() => setView('home')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại
            </button>

            {detailLoading || !selectedComic ? (
              <div className="py-20 text-center text-zinc-400">Đang tải thông tin truyện...</div>
            ) : (
              <>
                <div className="rounded-3xl bg-[#111119] border border-white/10 p-5 sm:p-7 flex flex-col sm:flex-row gap-6">
                  <img
                    src={resolveAssetUrl(selectedComic.cover_url)}
                    alt={selectedComic.title}
                    className="w-44 sm:w-56 aspect-[2/3] rounded-2xl object-cover shadow-2xl border border-white/10 self-center sm:self-start shrink-0"
                  />

                  <div className="flex-1 space-y-4">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                        {selectedComic.title}
                      </h1>
                      {selectedComic.alt_titles && (
                        <p className="text-xs text-zinc-400 mt-1">{selectedComic.alt_titles}</p>
                      )}
                    </div>

                    {/* Metadata & Đánh giá sao trực tiếp */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 font-bold">
                        {selectedComic.status === 'completed' ? 'Hoàn thành' : 'Đang tiến hành'}
                      </span>
                      <span className="flex items-center gap-1 text-zinc-300 font-bold">
                        <Eye className="w-3.5 h-3.5 text-sky-400" /> {formatViews(selectedComic.views_total)} lượt xem
                      </span>
                      {selectedComic.author && (
                        <button
                          onClick={() => {
                            setAuthorFilter(selectedComic.author!.slug);
                            setView('browse');
                            setPage(1);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 font-bold hover:bg-sky-500/25"
                        >
                          Tác giả: {selectedComic.author.name}
                        </button>
                      )}
                    </div>

                    {/* Interactive Rating */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            disabled={ratedDone}
                            onMouseEnter={() => setUserRatingHover(star)}
                            onMouseLeave={() => setUserRatingHover(0)}
                            onClick={async () => {
                              try {
                                const res = await rateComic(selectedComic.id, star);
                                setSelectedComic({
                                  ...selectedComic,
                                  rating_avg: res.rating_avg,
                                  rating_count: res.rating_count,
                                });
                                setRatedDone(true);
                              } catch {}
                            }}
                            className="p-0.5 transition hover:scale-110 disabled:cursor-default"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                star <= (userRatingHover || Math.round(selectedComic.rating_avg))
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-zinc-600'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-bold text-amber-300">
                        {selectedComic.rating_avg.toFixed(1)} / 5 ({selectedComic.rating_count} đánh giá)
                      </span>
                      {ratedDone && <span className="text-[11px] text-emerald-400 font-bold">Cảm ơn bạn đã đánh giá!</span>}
                    </div>

                    {/* Genres */}
                    {selectedComic.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedComic.genres.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => {
                              setIncGenres([g.slug]);
                              setExcGenres([]);
                              setView('browse');
                              setPage(1);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-300 text-[11px] font-bold text-zinc-300 transition"
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedComic.description && (
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
                        {selectedComic.description}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2.5 pt-2">
                      {selectedComic.chapters.length > 0 && (
                        <>
                          <button
                            onClick={() =>
                              openChapter(selectedComic.chapters[selectedComic.chapters.length - 1].id)
                            }
                            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 text-xs sm:text-sm font-extrabold text-white shadow-lg shadow-rose-500/25"
                          >
                            Đọc từ đầu
                          </button>
                          <button
                            onClick={() => openChapter(selectedComic.chapters[0].id)}
                            className="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-extrabold text-white"
                          >
                            Đọc mới nhất (Ch.{selectedComic.chapters[0].chapter_number})
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          toggleBookmark(selectedComic);
                          setBookmarks(getBookmarks());
                        }}
                        className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border transition ${
                          isBookmarked(selectedComic.slug)
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'
                        }`}
                      >
                        <Heart
                          className={`w-4 h-4 ${isBookmarked(selectedComic.slug) ? 'fill-rose-500 text-rose-500' : ''}`}
                        />
                        {isBookmarked(selectedComic.slug) ? 'Đang theo dõi' : 'Theo dõi'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Danh sách chương + Ô nhảy chương nhanh */}
                <div className="rounded-3xl bg-[#111119] border border-white/10 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-black text-base text-white">
                      Danh sách chương ({selectedComic.chapters.length})
                    </h2>
                    <div className="flex items-center gap-2">
                      <input
                        value={chapterSearch}
                        onChange={(e) => setChapterSearch(e.target.value)}
                        placeholder="Tìm số chương..."
                        className="w-36 sm:w-48 px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white outline-none focus:border-rose-500"
                      />
                      <button
                        onClick={() => setChapterSortAsc((a) => !a)}
                        className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                      >
                        {chapterSortAsc ? 'Cũ → Mới' : 'Mới → Cũ'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[460px] overflow-y-auto pr-1">
                    {filteredChapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => openChapter(ch.id)}
                        className="p-3 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.06] hover:border-rose-500/40 text-left transition group"
                      >
                        <p className="text-xs font-extrabold text-zinc-100 group-hover:text-rose-300 truncate">
                          Chương {ch.chapter_number}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {ch.title || formatRelTime(ch.created_at)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cùng tác giả */}
                {selectedComic.same_author_comics && selectedComic.same_author_comics.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-black text-base text-white">Truyện cùng tác giả</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                      {selectedComic.same_author_comics.map((rel) => (
                        <div
                          key={rel.id}
                          onClick={() => openComicDetail(rel.slug)}
                          className="cursor-pointer group space-y-1.5"
                        >
                          <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
                            <img
                              src={resolveAssetUrl(rel.cover_url)}
                              alt={rel.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </div>
                          <p className="text-xs font-bold text-zinc-200 line-clamp-2 group-hover:text-rose-400">
                            {rel.title}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0a0a10]/95 backdrop-blur-2xl border-t border-white/10 px-2 py-2 flex items-center justify-around">
        {[
          { id: 'home', label: 'Trang chủ', icon: <Home className="w-5 h-5" /> },
          { id: 'browse', label: 'Khám phá', icon: <Compass className="w-5 h-5" /> },
          { id: 'ranking', label: 'BXH', icon: <Trophy className="w-5 h-5" /> },
          { id: 'library', label: 'Tủ truyện', icon: <Library className="w-5 h-5" /> },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setView(item.id as ViewMode);
              setPage(1);
              if (item.id === 'ranking') setSort('top-day');
            }}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-bold transition ${
              view === item.id ? 'text-rose-400' : 'text-zinc-500'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Modal Lọc Thể Loại (Include / Exclude 3 trạng thái) */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[#12121a] border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-white">Lọc theo Thể loại</h3>
                <p className="text-[11px] text-zinc-400">
                  Nhấn 1 lần: <span className="text-emerald-400 font-bold">Bao gồm</span> • Nhấn 2 lần:{' '}
                  <span className="text-rose-400 font-bold">Loại trừ</span> • Nhấn 3 lần: Bỏ chọn
                </p>
              </div>
              <button onClick={() => setShowFilterModal(false)} className="text-zinc-400 hover:text-white">
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      isInc
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : isExc
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 line-through'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                    }`}
                  >
                    {isInc ? '+ ' : isExc ? '− ' : ''}
                    {g.name}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setIncGenres([]);
                  setExcGenres([]);
                }}
                className="text-xs font-bold text-zinc-400 hover:text-white"
              >
                Đặt lại tất cả
              </button>
              <button
                onClick={() => {
                  setShowFilterModal(false);
                  setView('browse');
                  setPage(1);
                }}
                className="px-5 py-2 rounded-xl bg-rose-500 text-xs font-bold text-white"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sao lưu / Khôi phục tủ truyện */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#12121a] border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-white">Sao lưu & Khôi phục Tủ truyện</h3>
              <button onClick={() => setBackupModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  const data = exportUserData();
                  navigator.clipboard?.writeText(data).catch(() => {});
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `vinareader-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setBackupMsg('Đã tải file sao lưu JSON và sao chép vào bộ nhớ tạm!');
                }}
                className="w-full py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Xuất file sao lưu (JSON)
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400">Hoặc dán mã JSON để khôi phục sang máy mới:</label>
              <textarea
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{"version": 2, "bookmarks": [...], "history": [...]}'
                className="w-full rounded-xl bg-black/50 border border-white/10 p-3 text-xs text-white font-mono"
              />
              <button
                onClick={() => {
                  try {
                    const res = importUserData(importText);
                    setBookmarks(getBookmarks());
                    setHistoryList(getHistory());
                    setBackupMsg(`Khôi phục thành công: ${res.bookmarks} truyện theo dõi & ${res.history} lịch sử!`);
                  } catch (err) {
                    setBackupMsg((err as Error).message);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Upload className="w-4 h-4" /> Nhập dữ liệu khôi phục
              </button>
            </div>

            {backupMsg && <p className="text-xs font-semibold text-emerald-400">{backupMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
