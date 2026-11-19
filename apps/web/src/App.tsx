import React, { useEffect, useState, useRef } from 'react';
import {
  Home,
  Compass,
  Trophy,
  Bookmark,
  Search,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Play,
  Pause,
  ArrowUpDown,
  Eye,
  Star,
  BookOpen,
  Layers,
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
} from './lib/api';

type TabKey = 'home' | 'explore' | 'ranking' | 'bookmarks';
type GenreFilterState = 'neutral' | 'include' | 'exclude';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [comics, setComics] = useState<ComicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState('latest');
  const [genreStates, setGenreStates] = useState<Record<string, GenreFilterState>>({});

  const [selectedComic, setSelectedComic] = useState<ComicDetail | null>(null);
  const [chapterOrderAsc, setChapterOrderAsc] = useState(false);
  const [readerData, setReaderData] = useState<{
    chapter: { id: number; comic_id: number; chapter_number: number; title: string; comic_slug: string; comic_title: string };
    prev_chapter: { id: number; chapter_number: number } | null;
    next_chapter: { id: number; chapter_number: number } | null;
    pages: PageItem[];
  } | null>(null);

  const [readMode, setReadMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [autoScroll, setAutoScroll] = useState(false);

  const [bookmarks, setBookmarks] = useState<ComicSummary[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vr_bookmarks') || '[]');
    } catch {
      return [];
    }
  });
  const [readHistory, setReadHistory] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('vr_history') || '{}');
    } catch {
      return {};
    }
  });

  const autoScrollRef = useRef<number | null>(null);

  useEffect(() => {
    fetchGenres().then(setGenres).catch(() => {});
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

    fetchComics({
      page: 1,
      limit: 30,
      q: searchQuery,
      sort: activeTab === 'ranking' && !sortMode.startsWith('top') ? 'top-day' : sortMode,
      inc,
      exc,
    })
      .then((res) => {
        if (!cancelled && res.success) {
          setComics(res.data || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, sortMode, genreStates, activeTab]);

  useEffect(() => {
    if (!readerData) return;
    const nextIndexes = [currentPageIdx + 1, currentPageIdx + 2];
    nextIndexes.forEach((idx) => {
      const page = readerData.pages[idx];
      if (page?.url) {
        const img = new Image();
        img.src = resolveAssetUrl(page.url);
      }
    });
  }, [readerData, currentPageIdx]);

  useEffect(() => {
    if (autoScroll && readerData && readMode === 'vertical') {
      autoScrollRef.current = window.setInterval(() => {
        window.scrollBy({ top: 3, behavior: 'auto' });
      }, 16);
    } else if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [autoScroll, readerData, readMode]);

  const cycleGenreState = (slug: string) => {
    setGenreStates((prev) => {
      const cur = prev[slug] || 'neutral';
      const next: GenreFilterState =
        cur === 'neutral' ? 'include' : cur === 'include' ? 'exclude' : 'neutral';
      return { ...prev, [slug]: next };
    });
  };

  const openComic = async (slug: string) => {
    setLoading(true);
    try {
      const detail = await fetchComicDetail(slug);
      setSelectedComic(detail);
      setReaderData(null);
      window.scrollTo({ top: 0 });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openChapter = async (chapterId: number) => {
    setLoading(true);
    try {
      const data = await fetchChapterPages(chapterId);
      setReaderData(data);
      setCurrentPageIdx(0);
      setHudVisible(true);
      setAutoScroll(false);
      window.scrollTo({ top: 0 });

      recordComicView(data.chapter.comic_id);
      const updatedHistory = {
        ...readHistory,
        [data.chapter.comic_slug]: data.chapter.chapter_number,
      };
      setReadHistory(updatedHistory);
      localStorage.setItem('vr_history', JSON.stringify(updatedHistory));
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

  if (readerData) {
    const totalPages = readerData.pages.length;

    const handleReaderTap = (e: React.MouseEvent<HTMLDivElement>) => {
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
      <div className="min-h-screen bg-black text-zinc-100 select-none">
        {hudVisible && (
          <header className="fixed top-0 inset-x-0 z-50 bg-[#0b0b0e]/90 backdrop-blur-md border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
            <button
              onClick={() => {
                setAutoScroll(false);
                setReaderData(null);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-pink-400 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="truncate max-w-[180px]">{readerData.chapter.comic_title}</span>
            </button>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10">
              Chap {readerData.chapter.chapter_number}
            </span>
          </header>
        )}

        <div
          onClick={handleReaderTap}
          className="pt-12 pb-24 flex flex-col items-center justify-center min-h-screen"
        >
          {totalPages === 0 ? (
            <p className="text-zinc-400 text-sm py-20">Chương này chưa có dữ liệu trang ảnh.</p>
          ) : readMode === 'vertical' ? (
            <div style={{ width: `${zoomPercent}%` }} className="max-w-3xl flex flex-col">
              {readerData.pages.map((p) => (
                <img
                  key={p.index}
                  src={resolveAssetUrl(p.url)}
                  alt={`Trang ${p.index + 1}`}
                  loading={p.index < 3 ? 'eager' : 'lazy'}
                  className="w-full h-auto block bg-zinc-950"
                />
              ))}
            </div>
          ) : (
            <div className="w-full max-w-3xl flex flex-col items-center px-2">
              <img
                src={resolveAssetUrl(readerData.pages[currentPageIdx]?.url || '')}
                alt={`Trang ${currentPageIdx + 1}`}
                className="max-h-[82vh] w-auto object-contain"
              />
              <span className="mt-3 text-xs text-zinc-400">
                Trang {currentPageIdx + 1} / {totalPages} (Chạm trái/phải để lật trang)
              </span>
            </div>
          )}
        </div>

        {hudVisible && (
          <footer className="fixed bottom-0 inset-x-0 z-50 bg-[#0b0b0e]/95 backdrop-blur-md border-t border-white/10 px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <button
                onClick={() => setReadMode((m) => (m === 'vertical' ? 'horizontal' : 'vertical'))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 font-medium"
              >
                <Layers className="w-4 h-4 text-pink-400" />
                {readMode === 'vertical' ? 'Cuộn dọc' : 'Lật trang'}
              </button>

              {readMode === 'vertical' && (
                <>
                  <div className="flex items-center gap-2 flex-1 max-w-[160px]">
                    <span className="text-zinc-400">Zoom</span>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      value={zoomPercent}
                      onChange={(e) => setZoomPercent(Number(e.target.value))}
                      className="w-full accent-pink-500"
                    />
                  </div>
                  <button
                    onClick={() => setAutoScroll((s) => !s)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium ${
                      autoScroll ? 'bg-pink-600 text-white' : 'bg-white/10 text-zinc-200'
                    }`}
                  >
                    {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    Tự cuộn
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                disabled={!readerData.prev_chapter}
                onClick={() => readerData.prev_chapter && openChapter(readerData.prev_chapter.id)}
                className="flex-1 py-2 rounded-xl bg-white/10 disabled:opacity-30 font-semibold text-xs flex items-center justify-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Chap trước
              </button>
              <button
                disabled={!readerData.next_chapter}
                onClick={() => readerData.next_chapter && openChapter(readerData.next_chapter.id)}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 disabled:opacity-30 font-semibold text-xs flex items-center justify-center gap-1"
              >
                Chap sau <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </footer>
        )}
      </div>
    );
  }

  if (selectedComic) {
    const isBookmarked = bookmarks.some((b) => b.slug === selectedComic.slug);
    const orderedChapters = chapterOrderAsc
      ? [...selectedComic.chapters].reverse()
      : selectedComic.chapters;
    const lastReadNum = readHistory[selectedComic.slug];

    return (
      <div className="min-h-screen bg-[#0b0b0e] pb-20">
        <div className="relative overflow-hidden">
          {selectedComic.cover_url && (
            <img
              src={resolveAssetUrl(selectedComic.cover_url)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-25 scale-110 pointer-events-none"
            />
          )}
          <div className="relative z-10 px-4 pt-3 pb-5 bg-gradient-to-b from-black/40 to-[#0b0b0e]">
            <button
              onClick={() => setSelectedComic(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-zinc-200 bg-white/10 px-3 py-1.5 rounded-full"
            >
              <ChevronLeft className="w-4 h-4" /> Quay lại
            </button>

            <div className="flex gap-4">
              <div className="w-28 aspect-[2/3] rounded-xl overflow-hidden bg-[#14141a] shrink-0 border border-white/10 shadow-lg">
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

              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold leading-snug line-clamp-2">{selectedComic.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                  <span className="px-2 py-0.5 rounded bg-pink-500/20 text-pink-400 font-semibold">
                    {selectedComic.status === 'completed' ? 'Hoàn thành' : 'Đang tiến hành'}
                  </span>
                  <span className="flex items-center gap-1 text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400" /> {selectedComic.rating_avg.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Eye className="w-3.5 h-3.5" /> {selectedComic.views_total.toLocaleString()}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {selectedComic.genres.map((g) => (
                    <span
                      key={g.id}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-zinc-300"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2.5">
              {selectedComic.chapters.length > 0 && (
                <button
                  onClick={() =>
                    openChapter(selectedComic.chapters[selectedComic.chapters.length - 1].id)
                  }
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-pink-500/20"
                >
                  <BookOpen className="w-4 h-4" /> Đọc từ đầu
                </button>
              )}
              <button
                onClick={() => toggleBookmark(selectedComic)}
                className={`px-4 py-2.5 rounded-xl font-semibold text-sm border ${
                  isBookmarked
                    ? 'bg-pink-500/20 border-pink-500 text-pink-400'
                    : 'bg-[#14141a] border-white/10 text-zinc-200'
                }`}
              >
                {isBookmarked ? 'Đã theo dõi' : '+ Theo dõi'}
              </button>
            </div>

            {selectedComic.description && (
              <p className="mt-4 text-xs text-zinc-400 leading-relaxed line-clamp-4">
                {selectedComic.description}
              </p>
            )}
          </div>
        </div>

        <div className="px-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">
              Danh sách chương ({selectedComic.chapters.length})
            </h2>
            <button
              onClick={() => setChapterOrderAsc((o) => !o)}
              className="flex items-center gap-1 text-xs text-zinc-400 bg-[#14141a] px-2.5 py-1.5 rounded-lg border border-white/5"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {chapterOrderAsc ? 'Cũ nhất' : 'Mới nhất'}
            </button>
          </div>

          <div className="space-y-2">
            {orderedChapters.map((ch) => {
              const isRead = lastReadNum === ch.chapter_number;
              return (
                <button
                  key={ch.id}
                  onClick={() => openChapter(ch.id)}
                  className={`w-full text-left px-3.5 py-3 rounded-xl border flex items-center justify-between ${
                    isRead
                      ? 'bg-[#14141a]/50 border-pink-500/30 text-zinc-400'
                      : 'bg-[#14141a] border-white/5 text-zinc-100 active:bg-[#1c1c24]'
                  }`}
                >
                  <span className="text-sm font-medium">
                    Chapter {ch.chapter_number} {isRead && '(Đang đọc)'}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {new Date(ch.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const displayedComics = activeTab === 'bookmarks' ? bookmarks : comics;

  return (
    <div className="min-h-screen bg-[#0b0b0e]">
      <header className="sticky top-0 z-40 bg-[#0b0b0e]/90 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-extrabold text-white">
              V
            </div>
            <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-pink-400 to-violet-400 bg-clip-text text-transparent">
              VinaReader
            </span>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên truyện..."
              className="w-full bg-[#14141a] border border-white/10 rounded-full pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-pink-500"
            />
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-5">
        {activeTab === 'explore' && (
          <section className="bg-[#14141a] p-3.5 rounded-2xl border border-white/5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5 text-zinc-200">
                <SlidersHorizontal className="w-3.5 h-3.5 text-pink-400" />
                Lọc thể loại (Chạm để [+] Bao gồm / [-] Loại trừ)
              </span>
              <button
                onClick={() => setGenreStates({})}
                className="text-pink-400 font-medium"
              >
                Đặt lại
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => {
                const st = genreStates[g.slug] || 'neutral';
                return (
                  <button
                    key={g.id}
                    onClick={() => cycleGenreState(g.slug)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition ${
                      st === 'include'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : st === 'exclude'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 line-through'
                        : 'bg-[#0b0b0e] border-white/10 text-zinc-400'
                    }`}
                  >
                    {st === 'include' ? '+ ' : st === 'exclude' ? '- ' : ''}
                    {g.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'ranking' && (
          <div className="grid grid-cols-3 gap-2 bg-[#14141a] p-1 rounded-xl border border-white/5">
            {[
              { key: 'top-day', label: 'Top Ngày' },
              { key: 'top-week', label: 'Top Tuần' },
              { key: 'top-month', label: 'Top Tháng' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSortMode(tab.key)}
                className={`py-2 rounded-lg text-xs font-bold transition ${
                  sortMode === tab.key
                    ? 'bg-gradient-to-r from-pink-500 to-violet-600 text-white'
                    : 'text-zinc-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">
              {activeTab === 'home' && 'Mới cập nhật'}
              {activeTab === 'explore' && 'Kết quả lọc thể loại'}
              {activeTab === 'ranking' && 'Bảng xếp hạng lượt đọc'}
              {activeTab === 'bookmarks' && `Truyện đang theo dõi (${bookmarks.length})`}
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="space-y-2 animate-pulse">
                  <div className="aspect-[2/3] rounded-xl bg-[#14141a]" />
                  <div className="h-3 bg-[#14141a] rounded w-4/5" />
                </div>
              ))}
            </div>
          ) : displayedComics.length === 0 ? (
            <div className="text-center py-16 text-xs text-zinc-500 bg-[#14141a] rounded-2xl border border-white/5">
              Chưa có dữ liệu truyện phù hợp. Hãy chạy Crawler tự động trên GitHub Actions để nạp truyện mới!
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {displayedComics.map((item, idx) => (
                <button
                  key={item.slug}
                  onClick={() => openComic(item.slug)}
                  className="text-left group space-y-1.5"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#14141a] border border-white/5">
                    {item.cover_url ? (
                      <img
                        src={resolveAssetUrl(item.cover_url)}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-active:scale-105 transition"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600 p-2 text-center">
                        {item.title}
                      </div>
                    )}

                    {activeTab === 'ranking' && (
                      <span
                        className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center ${
                          idx === 0
                            ? 'bg-amber-500 text-black'
                            : idx === 1
                            ? 'bg-zinc-300 text-black'
                            : idx === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-black/75 text-white'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    )}

                    {item.latest_chapter !== null && (
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-semibold text-pink-400">
                        Ch.{item.latest_chapter}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xs font-semibold line-clamp-2 leading-snug text-zinc-100">
                    {item.title}
                  </h3>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <nav
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        className="fixed bottom-0 inset-x-0 z-40 bg-[#0b0b0e]/95 backdrop-blur-md border-t border-white/10"
      >
        <div className="grid grid-cols-4 h-14">
          {[
            { key: 'home', label: 'Trang chủ', icon: Home },
            { key: 'explore', label: 'Thể loại', icon: Compass },
            { key: 'ranking', label: 'Xếp hạng', icon: Trophy },
            { key: 'bookmarks', label: 'Theo dõi', icon: Bookmark },
          ].map((nav) => {
            const Icon = nav.icon;
            const active = activeTab === nav.key;
            return (
              <button
                key={nav.key}
                onClick={() => {
                  setActiveTab(nav.key as TabKey);
                  if (nav.key === 'home') setSortMode('latest');
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  active ? 'text-pink-400' : 'text-zinc-500'
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
