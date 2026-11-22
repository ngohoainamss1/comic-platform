import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns,
  Flag,
  Pause,
  Play,
  ScrollText,
  Settings,
  X,
} from 'lucide-react';
import {
  type ChapterPagesPayload,
  type UserProfile,
  resolveAssetUrl,
  submitReport,
} from '../lib/api';
import { CommentSection } from './CommentSection';

interface ReaderViewProps {
  data: ChapterPagesPayload;
  onBack: () => void;
  onOpenChapter: (chapterId: number) => void;
  onProgress?: (pageIndex: number, totalPages: number) => void;
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
}

type ReadTheme = 'oled' | 'dim' | 'warm';

const THEME_BG: Record<ReadTheme, string> = {
  oled: 'bg-[#050507] text-zinc-100',
  dim: 'bg-[#14151a] text-zinc-100',
  warm: 'bg-[#1b1814] text-amber-50',
};

export const ReaderView: React.FC<ReaderViewProps> = ({
  data,
  onBack,
  onOpenChapter,
  onProgress,
  currentUser,
  onRequireAuth,
}) => {
  const totalPages = data.pages.length;

  const isWebtoonStrip = React.useMemo(() => {
    if (totalPages === 0) return true;
    const tallCount = data.pages.filter((p) => p.width > 0 && p.height / p.width >= 1.8).length;
    return tallCount >= Math.ceil(totalPages * 0.4);
  }, [data.pages, totalPages]);

  const [readMode, setReadMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [maxWidthPct, setMaxWidthPct] = useState<number>(() => {
    const saved = Number(localStorage.getItem('vr_reader_width') || '100');
    return Number.isFinite(saved) && saved >= 60 && saved <= 100 ? saved : 100;
  });
  const [theme, setTheme] = useState<ReadTheme>(() => {
    const saved = localStorage.getItem('vr_reader_theme') as ReadTheme | null;
    return saved && ['oled', 'dim', 'warm'].includes(saved) ? saved : 'oled';
  });
  const [gapMode, setGapMode] = useState<boolean>(() => localStorage.getItem('vr_reader_gap') === '1');

  // Auto-scroll state & refs
  const [autoScrollPps, setAutoScrollPps] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const subPixelRef = useRef<number>(0);

  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const verticalContainerRef = useRef<HTMLDivElement | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Ảnh bị lỗi / không tải được');
  const [reportDetail, setReportDetail] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [reportSending, setReportSending] = useState(false);

  useEffect(() => {
    setCurrentPageIdx(0);
    setAutoScrollPps(0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [data.chapter.id]);

  useEffect(() => {
    localStorage.setItem('vr_reader_width', String(maxWidthPct));
    localStorage.setItem('vr_reader_theme', theme);
    localStorage.setItem('vr_reader_gap', gapMode ? '1' : '0');
  }, [maxWidthPct, theme, gapMode]);

  useEffect(() => {
    if (readMode !== 'vertical' || !verticalContainerRef.current) return;
    const nodes = verticalContainerRef.current.querySelectorAll<HTMLElement>('[data-page-idx]');
    if (!nodes.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute('data-page-idx'));
            if (idx > bestIdx) bestIdx = idx;
          }
        }
        if (bestIdx >= 0) {
          setCurrentPageIdx(bestIdx);
          onProgress?.(bestIdx, totalPages);
        }
      },
      { rootMargin: '-20% 0px -50% 0px', threshold: 0.01 }
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [data.chapter.id, readMode, totalPages, onProgress]);

  useEffect(() => {
    if (readMode === 'horizontal') {
      onProgress?.(currentPageIdx, totalPages);
      if (horizontalScrollRef.current) {
        horizontalScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }, [currentPageIdx, readMode, totalPages, onProgress]);

  // Preload 3 trang tiếp theo ở mọi chế độ đọc
  useEffect(() => {
    [currentPageIdx + 1, currentPageIdx + 2, currentPageIdx + 3].forEach((idx) => {
      const p = data.pages[idx];
      if (p?.url) {
        const img = new Image();
        img.src = resolveAssetUrl(p.url);
      }
    });
  }, [currentPageIdx, data.pages]);

  // Vòng lặp requestAnimationFrame cho Auto-scroll siêu mượt, loại bỏ xung đột scroll-behavior: smooth trên mobile
  useEffect(() => {
    if (autoScrollPps <= 0 || readMode !== 'vertical') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlScroll = htmlEl.style.scrollBehavior;
    const prevBodyScroll = bodyEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = 'auto';
    bodyEl.style.scrollBehavior = 'auto';

    lastFrameRef.current = performance.now();
    subPixelRef.current = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const maxScrollY = docHeight - window.innerHeight;
      if (maxScrollY > 0 && window.scrollY >= maxScrollY - 2) {
        setAutoScrollPps(0);
        return;
      }

      subPixelRef.current += autoScrollPps * dt;
      const moveY = Math.floor(subPixelRef.current);
      if (moveY >= 1) {
        window.scrollBy({ top: moveY, left: 0, behavior: 'instant' as ScrollBehavior });
        subPixelRef.current -= moveY;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      htmlEl.style.scrollBehavior = prevHtmlScroll;
      bodyEl.style.scrollBehavior = prevBodyScroll;
    };
  }, [autoScrollPps, readMode]);

  // Dừng tự cuộn khi người dùng lăn chuột (wheel)
  useEffect(() => {
    if (autoScrollPps <= 0) return;
    const handleWheel = () => {
      setAutoScrollPps(0);
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [autoScrollPps]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reportOpen) return;
      if (e.key === 'ArrowLeft') {
        if (readMode === 'horizontal') setCurrentPageIdx((p) => Math.max(0, p - 1));
        else if (data.prev_chapter) onOpenChapter(data.prev_chapter.id);
      } else if (e.key === 'ArrowRight') {
        if (readMode === 'horizontal') setCurrentPageIdx((p) => Math.min(totalPages - 1, p + 1));
        else if (data.next_chapter) onOpenChapter(data.next_chapter.id);
      } else if (e.key === ' ') {
        if (readMode === 'vertical') {
          e.preventDefault();
          setAutoScrollPps((p) => (p > 0 ? 0 : 120));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readMode, totalPages, data.prev_chapter, data.next_chapter, onOpenChapter, reportOpen]);

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
    const w = window.innerWidth;
    const x = e.clientX;
    if (readMode === 'horizontal') {
      if (x < w * 0.28) {
        if (currentPageIdx > 0) setCurrentPageIdx((p) => p - 1);
        else if (data.prev_chapter) onOpenChapter(data.prev_chapter.id);
        return;
      }
      if (x > w * 0.72) {
        if (currentPageIdx < totalPages - 1) setCurrentPageIdx((p) => p + 1);
        else if (data.next_chapter) onOpenChapter(data.next_chapter.id);
        return;
      }
    }
    setHudVisible((v) => !v);
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportSending(true);
    setReportMsg('');
    try {
      const msg = await submitReport({
        comic_id: data.chapter.comic_id,
        chapter_id: data.chapter.id,
        reason: reportReason,
        detail: reportDetail,
      });
      setReportMsg(msg);
      setReportDetail('');
      setTimeout(() => {
        setReportOpen(false);
        setReportMsg('');
      }, 1200);
    } catch (err) {
      setReportMsg((err as Error).message || 'Gửi báo lỗi thất bại.');
    } finally {
      setReportSending(false);
    }
  };

  const currentPage = data.pages[currentPageIdx];
  const currentIsTall = currentPage && currentPage.width > 0 && currentPage.height / currentPage.width > 1.75;

  return (
    <div className={`min-h-dvh flex flex-col select-none transition-colors duration-300 ${THEME_BG[theme]}`}>
      {/* Thanh điều hướng trên cùng */}
      {hudVisible && (
        <header className="fixed top-0 inset-x-0 z-50 bg-[#09090d]/90 backdrop-blur-2xl border-b border-white/10 pt-[calc(0.625rem+var(--sat))] px-safe pb-2.5 shadow-lg">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-5">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-semibold text-white transition min-h-[38px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Chi tiết</span>
            </button>

            <div className="flex-1 min-w-0 text-center">
              <p className="text-xs sm:text-sm font-bold text-white truncate">{data.chapter.comic_title}</p>
              <p className="text-[11px] text-rose-400 font-semibold">
                Chương {data.chapter.chapter_number}
                {data.chapter.title ? ` — ${data.chapter.title}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setReportOpen(true)}
                title="Báo lỗi chương"
                className="p-2 rounded-xl bg-white/5 hover:bg-amber-500/20 text-zinc-300 hover:text-amber-400 transition min-w-[38px] min-h-[38px] flex items-center justify-center"
              >
                <Flag className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSettingsOpen((s) => !s)}
                title="Cài đặt trình đọc"
                className={`p-2 rounded-xl transition min-w-[38px] min-h-[38px] flex items-center justify-center ${
                  settingsOpen ? 'bg-rose-500 text-white' : 'bg-white/5 hover:bg-white/10 text-zinc-200'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Bảng cài đặt nhanh */}
      {settingsOpen && hudVisible && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-14 sm:right-6 z-50 w-full sm:w-80 rounded-t-3xl sm:rounded-2xl bg-[#121218]/95 backdrop-blur-2xl border border-white/10 p-5 sm:p-4 shadow-2xl space-y-4 pb-[calc(1.25rem+var(--sab))] sm:pb-4 max-h-[85dvh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">Cài đặt trình đọc</span>
            <button onClick={() => setSettingsOpen(false)} className="text-zinc-400 hover:text-white p-2">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Chiều rộng khung đọc</span>
              <span className="font-bold text-rose-400">{maxWidthPct}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={100}
              step={5}
              value={maxWidthPct}
              onChange={(e) => setMaxWidthPct(Number(e.target.value))}
              className="w-full accent-rose-500 py-2"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-zinc-400 block">Màu nền bảo vệ mắt</span>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['oled', 'Đen OLED'],
                ['dim', 'Xám dịu'],
                ['warm', 'Ấm mắt'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    theme === key
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer py-1">
            <span>Tách khoảng cách giữa các ảnh</span>
            <input
              type="checkbox"
              checked={gapMode}
              onChange={(e) => setGapMode(e.target.checked)}
              className="accent-rose-500 w-4 h-4"
            />
          </label>
        </div>
      )}

      {/* Vùng hiển thị ảnh chính */}
      <main
        onClick={handleStageClick}
        className="flex-1 w-full flex flex-col items-center pt-16 pb-28"
      >
        {totalPages === 0 ? (
          <div className="py-24 text-center text-zinc-400">Chương này chưa có trang ảnh nào.</div>
        ) : readMode === 'vertical' ? (
          <div
            ref={verticalContainerRef}
            style={{ width: `${maxWidthPct}%` }}
            className={`max-w-4xl mx-auto flex flex-col items-center ${gapMode ? 'gap-3 px-2' : 'gap-0'}`}
          >
            {data.pages.map((p, idx) => (
              <img
                key={`${data.chapter.id}-${p.index}-${idx}`}
                data-page-idx={idx}
                src={resolveAssetUrl(p.url)}
                alt={`Trang ${idx + 1}`}
                loading={idx < 3 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-auto block select-none bg-zinc-900/40"
              />
            ))}

            {/* Khối chuyển chương cuối trang */}
            <div className="w-full max-w-2xl px-4 py-10 space-y-4">
              <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/10 text-center space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Hết Chương {data.chapter.chapter_number}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    disabled={!data.prev_chapter}
                    onClick={() => data.prev_chapter && onOpenChapter(data.prev_chapter.id)}
                    className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 disabled:opacity-30 font-bold text-sm flex items-center justify-center gap-1.5 transition min-h-[44px]"
                  >
                    <ChevronLeft className="w-4 h-4" /> Chương trước
                  </button>
                  <button
                    disabled={!data.next_chapter}
                    onClick={() => data.next_chapter && onOpenChapter(data.next_chapter.id)}
                    className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 disabled:opacity-30 font-bold text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-500/25 transition min-h-[44px]"
                  >
                    Chương sau <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Khu vực Bình luận dưới Chapter */}
            <div className="w-full max-w-3xl px-4 pt-4 pb-12">
              <CommentSection
                comicId={data.chapter.comic_id}
                chapterId={data.chapter.id}
                currentUser={currentUser}
                onRequireAuth={onRequireAuth}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col items-center px-2">
            {isWebtoonStrip && (
              <div className="mb-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-200 flex items-center gap-2">
                <span>Truyện khổ dài (Webtoon) — đọc mượt hơn ở chế độ Cuộn dọc.</span>
                <button
                  onClick={() => setReadMode('vertical')}
                  className="underline font-bold text-amber-300 hover:text-white"
                >
                  Chuyển ngay
                </button>
              </div>
            )}

            <div
              ref={horizontalScrollRef}
              style={{ width: `${maxWidthPct}%` }}
              className="w-full h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain rounded-xl bg-black/40 border border-white/5 flex flex-col items-center justify-center"
            >
              {currentPage && (
                <img
                  src={resolveAssetUrl(currentPage.url)}
                  alt={`Trang ${currentPageIdx + 1}`}
                  className={
                    currentIsTall
                      ? 'w-full h-auto block'
                      : 'max-h-[calc(100dvh-12rem)] max-w-full object-contain my-auto'
                  }
                />
              )}
            </div>

            {/* Bình luận dưới Chapter cho chế độ lật trang */}
            <div className="w-full max-w-3xl px-4 pt-8 pb-12">
              <CommentSection
                comicId={data.chapter.comic_id}
                chapterId={data.chapter.id}
                currentUser={currentUser}
                onRequireAuth={onRequireAuth}
              />
            </div>
          </div>
        )}
      </main>

      {/* NÚT DỪNG NỔI GỌN GÀNG Ở GÓC PHẢI DƯỚI KHI TỰ CUỘN */}
      {autoScrollPps > 0 && readMode === 'vertical' && (
        <div className="fixed bottom-24 right-4 z-50">
          <button
            onClick={() => setAutoScrollPps(0)}
            className="bg-rose-500/95 hover:bg-rose-600 backdrop-blur-xl px-4 py-2.5 rounded-full text-xs font-black text-white shadow-[0_8px_25px_rgba(244,63,94,0.5)] flex items-center gap-1.5 transition animate-pulse cursor-pointer border border-white/20 min-h-[40px]"
          >
            <Pause className="w-4 h-4" /> Dừng tự cuộn
          </button>
        </div>
      )}

      {/* Nút nổi trạng thái nhỏ khi ẩn HUD */}
      {!hudVisible && totalPages > 0 && autoScrollPps === 0 && (
        <div className="fixed bottom-[calc(1rem+var(--sab))] right-[calc(1rem+var(--sar))] z-40 flex items-center gap-2">
          <div className="bg-black/70 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-full text-[11px] font-black text-white shadow-lg">
            {currentPageIdx + 1} / {totalPages}
          </div>
        </div>
      )}

      {/* Thanh công cụ dưới cùng */}
      {hudVisible && (
        <footer className="fixed bottom-0 inset-x-0 z-50 bg-[#09090d]/92 backdrop-blur-2xl border-t border-white/10 pb-[calc(0.75rem+var(--sab))] px-safe pt-3 shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
          <div className="max-w-3xl mx-auto space-y-2.5 px-3 sm:px-5">
            {readMode === 'vertical' ? (
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
                <button
                  onClick={() => {
                    if (autoScrollPps > 0) {
                      setAutoScrollPps(0);
                    } else {
                      setAutoScrollPps(120);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition min-h-[36px] ${
                    autoScrollPps > 0
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 animate-pulse'
                      : 'bg-white/10 text-zinc-200 hover:bg-white/15'
                  }`}
                >
                  {autoScrollPps > 0 ? (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Dừng
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Tự cuộn
                    </>
                  )}
                </button>

                <input
                  type="range"
                  min={30}
                  max={450}
                  step={30}
                  value={autoScrollPps || 120}
                  onChange={(e) => setAutoScrollPps(Number(e.target.value))}
                  className="flex-1 accent-rose-500 h-2 py-2"
                />

                <div className="flex items-center gap-1 shrink-0">
                  {[60, 120, 240, 360].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setAutoScrollPps(spd)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                        autoScrollPps === spd
                          ? 'bg-rose-500 text-white'
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {Math.round(spd / 60)}x
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
                <span className="text-[11px] font-bold text-zinc-400 shrink-0">Trang</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalPages - 1)}
                  value={currentPageIdx}
                  onChange={(e) => setCurrentPageIdx(Number(e.target.value))}
                  className="flex-1 accent-rose-500 h-2 py-2"
                />
                <span className="text-[11px] font-extrabold text-white w-14 text-right shrink-0">
                  {currentPageIdx + 1}/{totalPages}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                disabled={!data.prev_chapter}
                onClick={() => data.prev_chapter && onOpenChapter(data.prev_chapter.id)}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-xs font-bold flex items-center gap-1 transition min-h-[40px]"
              >
                <ChevronLeft className="w-4 h-4" /> Trước
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReadMode((m) => (m === 'vertical' ? 'horizontal' : 'vertical'))}
                  className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-1.5 transition min-h-[40px]"
                >
                  {readMode === 'vertical' ? (
                    <>
                      <ScrollText className="w-3.5 h-3.5 text-rose-400" /> Cuộn dọc
                    </>
                  ) : (
                    <>
                      <Columns className="w-3.5 h-3.5 text-sky-400" /> Lật trang
                    </>
                  )}
                </button>
                <span className="text-xs font-black text-zinc-300 px-2">
                  {currentPageIdx + 1} / {totalPages}
                </span>
              </div>

              <button
                disabled={!data.next_chapter}
                onClick={() => data.next_chapter && onOpenChapter(data.next_chapter.id)}
                className="px-3.5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-30 text-xs font-bold text-white flex items-center gap-1 transition min-h-[40px]"
              >
                Sau <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Modal Báo lỗi chương */}
      {reportOpen && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSendReport}
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#121218] border border-white/10 p-5 space-y-4 shadow-2xl pb-[calc(1.25rem+var(--sab))] sm:pb-5 max-h-[85dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" /> Báo lỗi Chương {data.chapter.chapter_number}
              </h3>
              <button type="button" onClick={() => setReportOpen(false)} className="text-zinc-400 hover:text-white p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Vấn đề gặp phải</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-3 text-sm text-white outline-none focus:border-rose-500 min-h-[44px]"
              >
                <option>Ảnh bị lỗi / không tải được</option>
                <option>Thiếu trang hoặc trùng lặp trang</option>
                <option>Ảnh bị cắt chữ / sai thứ tự</option>
                <option>Chứa ảnh quảng cáo nguồn khác</option>
                <option>Lỗi khác</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-400">Mô tả thêm (không bắt buộc)</label>
              <textarea
                rows={3}
                value={reportDetail}
                onChange={(e) => setReportDetail(e.target.value)}
                placeholder="Ví dụ: Trang 4 bị mất hình..."
                className="w-full rounded-xl bg-black/50 border border-white/10 p-3 text-sm text-white outline-none focus:border-rose-500"
              />
            </div>

            {reportMsg && <p className="text-xs font-semibold text-emerald-400">{reportMsg}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 min-h-[40px]"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={reportSending}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-xs font-bold text-white min-h-[40px]"
              >
                {reportSending ? 'Đang gửi...' : 'Gửi báo lỗi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
