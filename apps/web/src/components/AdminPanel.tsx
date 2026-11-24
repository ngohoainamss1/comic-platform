import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookMarked,
  Bot,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  LayoutDashboard,
  Layers,
  LogOut,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  ExternalLink,
  Settings as SettingsTabIcon,
  
  Shield,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {
  adminApi,
  adminLogin,
  type AdminComicRow,
  type AdminJobRow,
  type AdminReportRow,
  type AdminSpotlightRow,
  type AdminSourceRow,
  type AdminStats,
  type AdminWatchlistRow,
  type ChapterItem,
  type GenreItem,
  getAdminToken,
  type PageItem,
  type PublicSettings,
  
  
  resolveAssetUrl,
  setAdminToken,
} from '../lib/api';

interface AdminPanelProps {
  onExit: () => void;
  onSettingsUpdated?: () => void;
}

type AdminTab = 'dashboard' | 'comics' | 'genres' | 'crawler' | 'reports' | 'spotlights' | 'settings';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onExit, onSettingsUpdated }) => {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getAdminToken()));
  const [password, setPassword] = useState('123456');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Dashboard
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Comics
  const [comics, setComics] = useState<AdminComicRow[]>([]);
  const [comicPage, setComicPage] = useState(1);
  const [comicTotalPages, setComicTotalPages] = useState(1);
  const [comicQuery, setComicQuery] = useState('');
  const [comicFilter, setComicFilter] = useState('all');
  const [editingComic, setEditingComic] = useState<AdminComicRow | null>(null);

  // Chapters & Pages modal
  const [chaptersComic, setChaptersComic] = useState<AdminComicRow | null>(null);
  const [chaptersList, setChaptersList] = useState<ChapterItem[]>([]);
  const [pagesChapter, setPagesChapter] = useState<ChapterItem | null>(null);
  const [pagesList, setPagesList] = useState<PageItem[]>([]);

  // Genres
  const [genres, setGenres] = useState<GenreItem[]>([]);
  const [newGenreName, setNewGenreName] = useState('');
  const [mergeSrc, setMergeSrc] = useState<number>(0);
  const [mergeTgt, setMergeTgt] = useState<number>(0);

  // Crawler
  const [sources, setSources] = useState<AdminSourceRow[]>([]);
  const [watchlists, setWatchlists] = useState<AdminWatchlistRow[]>([]);
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState('failed');
  const [crawlUrl, setCrawlUrl] = useState('');
  const [newSource, setNewSource] = useState({ name: '', base_url: '', feed_url: '', adapter_type: 'standard' });

  // Reports
  const [reports, setReports] = useState<AdminReportRow[]>([]);

  // Spotlights
  const [spotlightRows, setSpotlightRows] = useState<AdminSpotlightRow[]>([]);
  const [editingSpotlight, setEditingSpotlight] = useState<Partial<AdminSpotlightRow> | null>(null);

  // Settings
  const [settings, setSettings] = useState<PublicSettings>({
    site_name: 'VinaReader',
    announcement_enabled: '0',
    announcement_text: '',
    maintenance_mode: '0',
  });

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginErr('');
    try {
      await adminLogin(password);
      setAuthed(true);
      setPassword('');
    } catch (err) {
      setLoginErr((err as Error).message);
    } finally {
      setLoginBusy(false);
    }
  };

  const loadCurrentTab = async () => {
    if (!authed) return;
    try {
      if (tab === 'dashboard') {
        setStats(await adminApi.getStats());
      } else if (tab === 'comics') {
        const [cRes, gRes] = await Promise.all([
          adminApi.getComics(comicPage, comicQuery, comicFilter),
          adminApi.getGenres(),
        ]);
        setComics(cRes.data);
        setComicTotalPages(cRes.pagination.totalPages || 1);
        setGenres(gRes);
      } else if (tab === 'genres') {
        setGenres(await adminApi.getGenres());
      } else if (tab === 'crawler') {
        const [sRes, wRes, jRes] = await Promise.all([
          adminApi.getSources(),
          adminApi.getWatchlist(),
          adminApi.getJobs(jobStatusFilter),
        ]);
        setSources(sRes);
        setWatchlists(wRes);
        setJobs(jRes);
      } else if (tab === 'spotlights') {
        setSpotlightRows(await adminApi.getSpotlights());
      } else if (tab === 'reports') {
        setReports(await adminApi.getReports());
      } else if (tab === 'settings') {
        setSettings(await adminApi.getSettings());
      }
    } catch (err) {
      const msg = (err as Error).message;
      showToast(msg, 'err');
      if (!getAdminToken()) setAuthed(false);
    }
  };

  useEffect(() => {
    loadCurrentTab();
  }, [authed, tab, comicPage, comicFilter, jobStatusFilter]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#07070a] text-zinc-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-3xl bg-[#111117] border border-white/10 p-6 space-y-5 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-black text-lg text-white">Admin Panel</h1>
                <p className="text-[11px] text-zinc-400">Đăng nhập quản trị hệ thống</p>
              </div>
            </div>
            <button type="button" onClick={onExit} className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-400">Mật khẩu quản trị (ADMIN_PASSWORD)</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              className="w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-2.5 text-sm text-white outline-none focus:border-rose-500"
            />
          </div>

          {loginErr && <p className="text-xs font-semibold text-rose-400">{loginErr}</p>}

          <button
            type="submit"
            disabled={loginBusy}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 font-bold text-sm text-white hover:brightness-110 disabled:opacity-50"
          >
            {loginBusy ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    );
  }

  const openChaptersModal = async (comic: AdminComicRow) => {
    setChaptersComic(comic);
    setPagesChapter(null);
    try {
      setChaptersList(await adminApi.getChapters(comic.id));
    } catch (err) {
      showToast((err as Error).message, 'err');
    }
  };

  const openPagesModal = async (ch: ChapterItem) => {
    setPagesChapter(ch);
    try {
      setPagesList(await adminApi.getPages(ch.id));
    } catch (err) {
      showToast((err as Error).message, 'err');
    }
  };

  const movePage = async (idx: number, dir: -1 | 1) => {
    if (!pagesChapter) return;
    const target = idx + dir;
    if (target < 0 || target >= pagesList.length) return;
    const next = [...pagesList];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setPagesList(next);
    try {
      await adminApi.reorderPages(
        pagesChapter.id,
        next.map((p) => Number(p.id))
      );
      showToast('Đã cập nhật thứ tự trang');
    } catch (err) {
      showToast((err as Error).message, 'err');
    }
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'comics', label: 'Truyện & Ảnh', icon: <BookMarked className="w-4 h-4" /> },
    { id: 'genres', label: 'Thể loại', icon: <Tags className="w-4 h-4" /> },
    { id: 'crawler', label: 'Crawler & Jobs', icon: <Bot className="w-4 h-4" /> },
    { id: 'spotlights', label: 'Affiliate & Deal', icon: <ExternalLink className="w-4 h-4" /> },
    { id: 'reports', label: 'Báo lỗi', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'settings', label: 'Cấu hình Web', icon: <SettingsTabIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#07070a] text-zinc-100 pb-16">
      {/* Header Admin */}
      <header className="sticky top-0 z-40 bg-[#0c0c12]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Về Web
            </button>
            <h1 className="font-black text-base sm:text-lg text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-rose-500" /> Trung tâm Quản trị
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadCurrentTab}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Làm mới
            </button>
            <button
              onClick={() => {
                setAdminToken('');
                setAuthed(false);
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition ${
                tab === n.id
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl border ${
            toast.type === 'ok'
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/95 border-rose-500/40 text-rose-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 pt-6 space-y-6">
        {/* TAB 1: DASHBOARD */}
        {tab === 'dashboard' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Tổng bộ truyện', val: stats.comics_total, sub: `${stats.comics_featured} ghim • ${stats.comics_hidden} ẩn` },
                { label: 'Tổng chương / Trang', val: `${stats.chapters_total.toLocaleString()}`, sub: `${stats.pages_total.toLocaleString()} ảnh AVIF` },
                { label: 'Lượt xem hôm nay', val: stats.views_day.toLocaleString(), sub: `Tổng: ${stats.views_total.toLocaleString()}` },
                { label: 'Jobs / Báo lỗi', val: `${stats.jobs_failed} lỗi`, sub: `${stats.jobs_pending} chờ • ${stats.open_reports} báo lỗi` },
              ].map((card, i) => (
                <div key={i} className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-1">
                  <p className="text-[11px] font-bold uppercase text-zinc-400">{card.label}</p>
                  <p className="text-2xl font-black text-white">{card.val}</p>
                  <p className="text-[11px] text-zinc-500">{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-white">Quản lý Bảng Xếp Hạng (Reset Views)</h3>
                <p className="text-xs text-zinc-400">
                  Ngày: {stats.views_day.toLocaleString()} • Tuần: {stats.views_week.toLocaleString()} • Tháng:{' '}
                  {stats.views_month.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                {(['day', 'week', 'month'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={async () => {
                      if (!confirm(`Reset lượt xem (${p}) về 0?`)) return;
                      const res = await adminApi.resetViews(p);
                      showToast(res.message);
                      loadCurrentTab();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-xs font-bold text-zinc-200"
                  >
                    Reset {p === 'day' ? 'Ngày' : p === 'week' ? 'Tuần' : 'Tháng'}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
              <h3 className="font-bold text-sm text-white">Cập nhật gần nhất</h3>
              <div className="divide-y divide-white/5">
                {stats.recent_comics.map((c) => (
                  <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200 truncate pr-4">{c.title}</span>
                    <span className="text-zinc-400 shrink-0">
                      {c.views_day} hôm nay / {c.views_total} tổng
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COMICS */}
        {tab === 'comics' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setComicPage(1);
                  loadCurrentTab();
                }}
                className="flex-1 min-w-[220px] flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={comicQuery}
                    onChange={(e) => setComicQuery(e.target.value)}
                    placeholder="Tìm theo tên truyện, slug..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#111118] border border-white/10 text-xs text-white outline-none focus:border-rose-500"
                  />
                </div>
                <button className="px-4 py-2 rounded-xl bg-rose-500 text-xs font-bold text-white">Tìm</button>
              </form>

              <select
                value={comicFilter}
                onChange={(e) => {
                  setComicPage(1);
                  setComicFilter(e.target.value);
                }}
                className="px-3 py-2 rounded-xl bg-[#111118] border border-white/10 text-xs text-white"
              >
                <option value="all">Tất cả truyện</option>
                <option value="featured">Đang ghim Banner</option>
                <option value="hidden">Đang bị ẩn</option>
                <option value="completed">Đã hoàn thành</option>
                <option value="no-genres">Thiếu thể loại</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {comics.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl bg-[#111118] border border-white/10 p-3 flex gap-3 items-start"
                >
                  <img
                    src={resolveAssetUrl(c.cover_url)}
                    alt={c.title}
                    className="w-16 h-24 rounded-xl object-cover bg-zinc-900 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-sm text-white truncate">{c.title}</h4>
                      <div className="flex items-center gap-1 shrink-0">
                        {c.is_featured === 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                            Ghim
                          </span>
                        )}
                        {c.is_hidden === 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 text-[10px] font-bold">
                            Ẩn
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {c.chapter_count} chương • {c.views_total.toLocaleString()} xem •{' '}
                      {c.status === 'completed' ? 'Full' : 'Đang ra'}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      Tác giả: {c.author_name || 'Chưa rõ'} • Thể loại: {c.genre_ids.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        onClick={() => setEditingComic(c)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Sửa
                      </button>
                      <button
                        onClick={() => openChaptersModal(c)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Layers className="w-3 h-3" /> Chương
                      </button>
                      <button
                        onClick={async () => {
                          await adminApi.updateComic(c.id, { is_featured: c.is_featured ? 0 : 1 });
                          showToast(c.is_featured ? 'Đã bỏ ghim Banner' : 'Đã ghim lên Banner');
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Pin className="w-3 h-3" /> {c.is_featured ? 'Bỏ ghim' : 'Ghim'}
                      </button>
                      <button
                        onClick={async () => {
                          await adminApi.updateComic(c.id, { is_hidden: c.is_hidden ? 0 : 1 });
                          showToast(c.is_hidden ? 'Đã hiện truyện' : 'Đã ẩn truyện');
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        {c.is_hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {c.is_hidden ? 'Hiện' : 'Ẩn'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Xóa vĩnh viễn "${c.title}"?`)) return;
                          await adminApi.deleteComic(c.id);
                          showToast('Đã xóa truyện');
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Xóa
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {comicTotalPages > 1 && (
              <div className="flex justify-center items-center gap-2 pt-2">
                <button
                  disabled={comicPage <= 1}
                  onClick={() => setComicPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 disabled:opacity-30 text-xs font-bold"
                >
                  Trang trước
                </button>
                <span className="text-xs text-zinc-400">
                  {comicPage} / {comicTotalPages}
                </span>
                <button
                  disabled={comicPage >= comicTotalPages}
                  onClick={() => setComicPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 disabled:opacity-30 text-xs font-bold"
                >
                  Trang sau
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GENRES */}
        {tab === 'genres' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newGenreName.trim()) return;
                  try {
                    const res = await adminApi.createGenre(newGenreName.trim());
                    setNewGenreName('');
                    showToast(res.message);
                    loadCurrentTab();
                  } catch (err) {
                    showToast((err as Error).message, 'err');
                  }
                }}
                className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3"
              >
                <h3 className="font-bold text-sm text-white">Thêm thể loại mới</h3>
                <div className="flex gap-2">
                  <input
                    value={newGenreName}
                    onChange={(e) => setNewGenreName(e.target.value)}
                    placeholder="Ví dụ: Tu Tiên, Hệ Thống..."
                    className="flex-1 rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                  <button className="px-4 py-2 rounded-xl bg-rose-500 text-xs font-bold text-white flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
              </form>

              <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
                <h3 className="font-bold text-sm text-white">Gộp thể loại trùng lặp</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={mergeSrc}
                    onChange={(e) => setMergeSrc(Number(e.target.value))}
                    className="flex-1 rounded-xl bg-black/50 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value={0}>Thể loại bị gộp (sẽ xóa)...</option>
                    {genres.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.comic_count || 0})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">→</span>
                  <select
                    value={mergeTgt}
                    onChange={(e) => setMergeTgt(Number(e.target.value))}
                    className="flex-1 rounded-xl bg-black/50 border border-white/10 px-2.5 py-2 text-xs text-white"
                  >
                    <option value={0}>Thể loại đích (giữ lại)...</option>
                    {genres.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.comic_count || 0})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        const res = await adminApi.mergeGenres(mergeSrc, mergeTgt);
                        showToast(res.message);
                        setMergeSrc(0);
                        setMergeTgt(0);
                        loadCurrentTab();
                      } catch (err) {
                        showToast((err as Error).message, 'err');
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold"
                  >
                    Gộp
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <div
                  key={g.id}
                  className="px-3 py-1.5 rounded-xl bg-[#111118] border border-white/10 text-xs flex items-center gap-2"
                >
                  <span className="font-semibold text-white">{g.name}</span>
                  <span className="text-zinc-500">({g.comic_count || 0})</span>
                  <button
                    onClick={async () => {
                      if (!confirm(`Xóa thể loại "${g.name}"?`)) return;
                      await adminApi.deleteGenre(g.id);
                      showToast('Đã xóa thể loại');
                      loadCurrentTab();
                    }}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: CRAWLER & JOBS */}
        {tab === 'crawler' && (
          <div className="space-y-6">
            {/* Cào ngay qua GitHub Actions */}
            <div className="rounded-2xl bg-gradient-to-br from-rose-500/10 to-purple-500/10 border border-rose-500/20 p-4 space-y-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-rose-400" /> Kích hoạt Crawler trực tiếp (GitHub Actions)
              </h3>
              <div className="flex flex-wrap gap-2">
                <input
                  value={crawlUrl}
                  onChange={(e) => setCrawlUrl(e.target.value)}
                  placeholder="Dán URL bộ truyện muốn cào ngay (để trống để chạy phiên quét tự động)..."
                  className="flex-1 min-w-[240px] rounded-xl bg-black/60 border border-white/10 px-3 py-2 text-xs text-white"
                />
                <button
                  onClick={async () => {
                    try {
                      const res = await adminApi.triggerCrawler(crawlUrl);
                      showToast(res.message);
                      setCrawlUrl('');
                    } catch (err) {
                      showToast((err as Error).message, 'err');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white"
                >
                  Chạy Crawler ngay
                </button>
              </div>
            </div>

            {/* Nguồn cào */}
            <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
              <h3 className="font-bold text-sm text-white">Nguồn cào (sync_sources)</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await adminApi.createSource({ ...newSource, is_active: 1 });
                    setNewSource({ name: '', base_url: '', feed_url: '', adapter_type: 'standard' });
                    showToast('Đã thêm nguồn cào');
                    loadCurrentTab();
                  } catch (err) {
                    showToast((err as Error).message, 'err');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2"
              >
                <input
                  placeholder="Tên nguồn"
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                />
                <input
                  placeholder="Base URL (https://...)"
                  value={newSource.base_url}
                  onChange={(e) => setNewSource({ ...newSource, base_url: e.target.value })}
                  className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                />
                <input
                  placeholder="Feed URL (trang mới cập nhật)"
                  value={newSource.feed_url}
                  onChange={(e) => setNewSource({ ...newSource, feed_url: e.target.value })}
                  className="rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                />
                <button className="rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white py-2">
                  + Thêm nguồn
                </button>
              </form>

              <div className="divide-y divide-white/5">
                {sources.map((s) => (
                  <div key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-white">{s.name}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{s.feed_url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          await adminApi.updateSource(s.id, { is_active: s.is_active ? 0 : 1 });
                          loadCurrentTab();
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          s.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {s.is_active ? 'Đang bật' : 'Đã tắt'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Xóa nguồn cào này?')) return;
                          await adminApi.deleteSource(s.id);
                          loadCurrentTab();
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hàng đợi Jobs */}
            <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-white">Hàng đợi chương (sync_jobs)</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={jobStatusFilter}
                    onChange={(e) => setJobStatusFilter(e.target.value)}
                    className="rounded-xl bg-black/50 border border-white/10 px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="failed">Job lỗi (retry ≥ 3)</option>
                    <option value="pending">Đang chờ (pending)</option>
                    <option value="published">Đã đăng (published)</option>
                  </select>
                  <button
                    onClick={async () => {
                      const res = await adminApi.retryAllFailedJobs();
                      showToast(res.message);
                      loadCurrentTab();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold"
                  >
                    Hồi sinh tất cả lỗi
                  </button>
                </div>
              </div>

              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                {jobs.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">Không có job nào trong mục này.</p>
                ) : (
                  jobs.map((j) => (
                    <div key={j.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-zinc-200 truncate">
                          {j.comic_slug} — Ch.{j.chapter_number}{' '}
                          <span className="text-zinc-500 font-normal">(retry: {j.retry_count})</span>
                        </p>
                        {j.error_log && <p className="text-[11px] text-rose-400 truncate">{j.error_log}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            await adminApi.retryJob(j.id);
                            showToast('Đã đưa job chạy lại');
                            loadCurrentTab();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-bold"
                        >
                          Retry
                        </button>
                        <button
                          onClick={async () => {
                            await adminApi.deleteJob(j.id);
                            loadCurrentTab();
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Watchlist */}
            <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
              <h3 className="font-bold text-sm text-white">Smart Watchlist ({watchlists.length})</h3>
              <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                {watchlists.map((w) => (
                  <div key={w.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">{w.comic_title}</p>
                      <p className="text-[11px] text-zinc-500">
                        Ch.{w.last_known_chapter} • Ưu tiên: {w.priority} • Quét tiếp: {w.next_check_at}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          await adminApi.updateWatchlist(w.id, { force_now: true });
                          showToast('Đã đặt lịch quét ngay ở phiên tới');
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold"
                      >
                        Ép quét
                      </button>
                      <button
                        onClick={async () => {
                          await adminApi.updateWatchlist(w.id, {
                            status: w.status === 'active' ? 'paused' : 'active',
                          });
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/10 text-zinc-300 font-bold"
                      >
                        {w.status === 'active' ? 'Tạm dừng' : 'Kích hoạt'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: REPORTS */}
        {tab === 'reports' && (
          <div className="rounded-2xl bg-[#111118] border border-white/10 p-4 space-y-3">
            <h3 className="font-bold text-sm text-white">Báo lỗi từ độc giả ({reports.length})</h3>
            {reports.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">Chưa có báo lỗi nào.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {reports.map((r) => (
                  <div key={r.id} className="py-3 flex flex-wrap items-start justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === 'open'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {r.status === 'open' ? 'Chưa xử lý' : 'Đã xong'}
                        </span>
                        <span className="font-bold text-white">
                          {r.comic_title || `Comic #${r.comic_id}`}
                          {r.chapter_number !== null ? ` — Chương ${r.chapter_number}` : ''}
                        </span>
                      </div>
                      <p className="text-rose-300 font-semibold">{r.reason}</p>
                      {r.detail && <p className="text-zinc-400">{r.detail}</p>}
                      <p className="text-[10px] text-zinc-500">{r.created_at}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={async () => {
                          await adminApi.updateReport(r.id, r.status === 'open' ? 'resolved' : 'open');
                          loadCurrentTab();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {r.status === 'open' ? 'Đánh dấu xong' : 'Mở lại'}
                      </button>
                      <button
                        onClick={async () => {
                          await adminApi.deleteReport(r.id);
                          loadCurrentTab();
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        
        {/* TAB: SPOTLIGHTS */}
        {tab === 'spotlights' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">Quản lý Affiliate & Spotlight Deals</h3>
              <button
                onClick={() => setEditingSpotlight({ platform: 'shopee', placement: 'gesture_pop', priority: 10, is_active: 1, code: '' })}
                className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Thêm chiến dịch
              </button>
            </div>

            <div className="rounded-2xl bg-[#111118] border border-white/10 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Tiêu đề & Code</th>
                    <th className="p-3">Nền tảng</th>
                    <th className="p-3">Vị trí</th>
                    <th className="p-3">Ưu tiên</th>
                    <th className="p-3">Clicks (24h / Tổng)</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {spotlightRows.map((s) => (
                    <tr key={s.id} className="hover:bg-white/5">
                      <td className="p-3 space-y-0.5">
                        <p className="font-bold text-white line-clamp-1">{s.title}</p>
                        <p className="text-[11px] text-zinc-400 font-mono">code: {s.code}</p>
                      </td>
                      <td className="p-3 uppercase font-bold text-amber-400">{s.platform}</td>
                      <td className="p-3 text-zinc-300">{s.placement}</td>
                      <td className="p-3 text-zinc-300">{s.priority}</td>
                      <td className="p-3 font-semibold text-emerald-400">
                        {s.clicks_24h || 0} / <span className="text-zinc-300">{s.clicks_total || 0}</span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={async () => {
                            await adminApi.updateSpotlight(s.id, { is_active: s.is_active ? 0 : 1 });
                            setSpotlightRows(await adminApi.getSpotlights());
                            showToast('Đã đổi trạng thái');
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold ${s.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-500/20 text-zinc-400'}`}
                        >
                          {s.is_active ? 'Đang chạy' : 'Đã tạm dừng'}
                        </button>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => window.open(`/go/${encodeURIComponent(s.code)}?ref=admin-test`, '_blank')}
                          className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 font-bold"
                        >
                          Test Link
                        </button>
                        <button
                          onClick={() => setEditingSpotlight(s)}
                          className="px-2 py-1 rounded bg-white/10 text-white font-bold"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Xóa chiến dịch "${s.title}"?`)) return;
                            await adminApi.deleteSpotlight(s.id);
                            setSpotlightRows((prev) => prev.filter((x) => x.id !== s.id));
                            showToast('Đã xóa chiến dịch');
                          }}
                          className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 font-bold"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingSpotlight && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                <div className="w-full max-w-lg rounded-3xl bg-[#12121a] border border-white/10 p-5 space-y-4 my-8">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-base text-white">
                      {editingSpotlight.id ? 'Sửa chiến dịch Affiliate' : 'Thêm chiến dịch Affiliate mới'}
                    </h3>
                    <button onClick={() => setEditingSpotlight(null)} className="text-zinc-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        if (!editingSpotlight?.target_url) {
                          showToast('Vui lòng nhập Link Affiliate đích (Target URL)', 'err');
                          return;
                        }
                        const payload = {
                          ...editingSpotlight,
                          placement: 'gesture_pop',
                          image_url: editingSpotlight.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300'
                        };
                        if (editingSpotlight.id) {
                          await adminApi.updateSpotlight(editingSpotlight.id, payload);
                          showToast('Đã cập nhật chiến dịch');
                        } else {
                          await adminApi.createSpotlight(payload);
                          showToast('Đã tạo chiến dịch mới');
                        }
                        setEditingSpotlight(null);
                        setSpotlightRows(await adminApi.getSpotlights());
                      } catch (err) {
                        showToast((err as Error).message, 'err');
                      }
                    }}
                    className="space-y-3 text-xs"
                  >
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Tiêu đề chiến dịch</label>
                      <input
                        value={editingSpotlight.title || ''}
                        onChange={(e) => setEditingSpotlight({ ...editingSpotlight, title: e.target.value })}
                        className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                        placeholder="Ví dụ: Shopee Sale 12.12 (Để trống sẽ tự đặt tên)"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-zinc-400 font-bold block mb-1">Mã Code (slug duy nhất)</label>
                        <input
                          value={editingSpotlight.code || ''}
                          onChange={(e) => setEditingSpotlight({ ...editingSpotlight, code: e.target.value })}
                          className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white font-mono"
                          placeholder="vd: shopee-sale-1212 (để trống tự tạo)"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 font-bold block mb-1">Nền tảng</label>
                        <select
                          value={editingSpotlight.platform || 'shopee'}
                          onChange={(e) => setEditingSpotlight({ ...editingSpotlight, platform: e.target.value as any })}
                          className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                        >
                          <option value="shopee">Shopee</option>
                          <option value="tiktok">TikTok Shop</option>
                          <option value="other">Khác</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Link Affiliate đích (Target URL) *</label>
                      <input
                        required
                        type="url"
                        value={editingSpotlight.target_url || ''}
                        onChange={(e) => setEditingSpotlight({ ...editingSpotlight, target_url: e.target.value })}
                        className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                        placeholder="https://s.shopee.vn/..."
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Độ ưu tiên (Priority - số càng cao ưu tiên càng lớn)</label>
                      <input
                        type="number"
                        value={editingSpotlight.priority ?? 10}
                        onChange={(e) => setEditingSpotlight({ ...editingSpotlight, priority: Number(e.target.value) })}
                        className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingSpotlight(null)}
                        className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold cursor-pointer"
                      >
                        Lưu chiến dịch
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}


        {/* TAB 6: SETTINGS */}
        {tab === 'settings' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await adminApi.updateSettings(settings);
                showToast(res.message);
                onSettingsUpdated?.();
              } catch (err) {
                showToast((err as Error).message, 'err');
              }
            }}
            className="max-w-xl rounded-2xl bg-[#111118] border border-white/10 p-5 space-y-4"
          >
            <h3 className="font-bold text-base text-white">Cấu hình toàn trang Web</h3>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400">Tên thương hiệu Web</label>
              <input
                value={settings.site_name}
                onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-sm text-white"
              />
            </div>

            <label className="flex items-center justify-between text-xs font-bold text-zinc-300 cursor-pointer">
              <span>Bật thanh thông báo toàn trang (Global Banner)</span>
              <input
                type="checkbox"
                checked={settings.announcement_enabled === '1'}
                onChange={(e) =>
                  setSettings({ ...settings, announcement_enabled: e.target.checked ? '1' : '0' })
                }
                className="accent-rose-500 w-4 h-4"
              />
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400">Nội dung thông báo</label>
              <textarea
                rows={3}
                value={settings.announcement_text}
                onChange={(e) => setSettings({ ...settings, announcement_text: e.target.value })}
                placeholder="Ví dụ: Lưu tên miền dự phòng mới tại..."
                className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
              />
            </div>

            <label className="flex items-center justify-between text-xs font-bold text-amber-300 cursor-pointer">
              <span>Chế độ bảo trì (hiển thị cảnh báo bảo trì cho khách)</span>
              <input
                type="checkbox"
                checked={settings.maintenance_mode === '1'}
                onChange={(e) =>
                  setSettings({ ...settings, maintenance_mode: e.target.checked ? '1' : '0' })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </label>

            <div className="pt-3 border-t border-white/10 space-y-3">
              <p className="text-xs font-extrabold uppercase text-rose-400">Cấu hình tần suất chuyển hướng Affiliate</p>
              <label className="flex items-center justify-between text-xs font-bold text-zinc-300 cursor-pointer">
                <span>Bật tự mở tab Shopee/TikTok khi chuyển chap</span>
                <input
                  type="checkbox"
                  checked={settings.aff_smart_redirect_enabled !== '0'}
                  onChange={(e) =>
                    setSettings({ ...settings, aff_smart_redirect_enabled: e.target.checked ? '1' : '0' })
                  }
                  className="accent-rose-500 w-4 h-4"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Thời gian nghỉ (Giờ / lần)</label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={settings.aff_cooldown_hours || '6'}
                    onChange={(e) => setSettings({ ...settings, aff_cooldown_hours: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Giới hạn tối đa (Lần / 24h)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.aff_daily_cap || '2'}
                    onChange={(e) => setSettings({ ...settings, aff_daily_cap: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <button className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white flex items-center gap-1.5">
              <Save className="w-4 h-4" /> Lưu cấu hình
            </button>
          </form>
        )}
      </main>

      {/* Modal Sửa Truyện */}
      {editingComic && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-[#12121a] border border-white/10 p-5 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-white">Sửa thông tin truyện</h3>
              <button onClick={() => setEditingComic(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 font-bold block mb-1">Tên truyện</label>
                <input
                  value={editingComic.title}
                  onChange={(e) => setEditingComic({ ...editingComic, title: e.target.value })}
                  className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Tác giả</label>
                  <input
                    value={editingComic.author_name}
                    onChange={(e) => setEditingComic({ ...editingComic, author_name: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Trạng thái</label>
                  <select
                    value={editingComic.status}
                    onChange={(e) => setEditingComic({ ...editingComic, status: e.target.value })}
                    className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                  >
                    <option value="ongoing">Đang tiến hành</option>
                    <option value="completed">Hoàn thành</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-zinc-400 font-bold block mb-1">Mô tả</label>
                <textarea
                  rows={3}
                  value={editingComic.description}
                  onChange={(e) => setEditingComic({ ...editingComic, description: e.target.value })}
                  className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-zinc-400 font-bold block mb-1.5">Thể loại</label>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-black/40 border border-white/5">
                  {genres.map((g) => {
                    const active = editingComic.genre_ids.includes(g.id);
                    return (
                      <button
                        type="button"
                        key={g.id}
                        onClick={() => {
                          const next = active
                            ? editingComic.genre_ids.filter((id) => id !== g.id)
                            : [...editingComic.genre_ids, g.id];
                          setEditingComic({ ...editingComic, genre_ids: next });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          active ? 'bg-rose-500 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingComic(null)}
                className="px-4 py-2 rounded-xl bg-white/5 text-xs font-bold text-zinc-300"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await adminApi.updateComic(editingComic.id, {
                      title: editingComic.title,
                      alt_titles: editingComic.alt_titles,
                      description: editingComic.description,
                      status: editingComic.status,
                      author_name: editingComic.author_name,
                      genre_ids: editingComic.genre_ids,
                    });
                    showToast(res.message);
                    setEditingComic(null);
                    loadCurrentTab();
                  } catch (err) {
                    showToast((err as Error).message, 'err');
                  }
                }}
                className="px-5 py-2 rounded-xl bg-rose-500 text-xs font-bold text-white"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Quản lý Chương & Trang ảnh */}
      {chaptersComic && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] rounded-3xl bg-[#12121a] border border-white/10 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base text-white truncate pr-4">
                {pagesChapter
                  ? `${chaptersComic.title} — Trang ảnh Ch.${pagesChapter.chapter_number}`
                  : `Chương của: ${chaptersComic.title}`}
              </h3>
              <div className="flex items-center gap-2">
                {pagesChapter && (
                  <button
                    onClick={() => setPagesChapter(null)}
                    className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold"
                  >
                    ← DS Chương
                  </button>
                )}
                <button
                  onClick={() => {
                    setChaptersComic(null);
                    setPagesChapter(null);
                  }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {!pagesChapter ? (
                chaptersList.map((ch) => (
                  <div
                    key={ch.id}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">Chương {ch.chapter_number}</span>
                      {ch.title && <span className="text-zinc-400"> — {ch.title}</span>}
                      <span className="text-zinc-500 ml-2">({ch.page_count || 0} ảnh)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openPagesModal(ch)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-bold"
                      >
                        Sửa ảnh
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Xóa Chương ${ch.chapter_number}?`)) return;
                          await adminApi.deleteChapter(ch.id);
                          setChaptersList((prev) => prev.filter((x) => x.id !== ch.id));
                          showToast('Đã xóa chương');
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {pagesList.map((p, idx) => (
                    <div
                      key={p.id ?? idx}
                      className="rounded-xl bg-black/50 border border-white/10 p-2 space-y-2"
                    >
                      <img
                        src={resolveAssetUrl(p.url)}
                        alt={`Trang ${idx + 1}`}
                        className="w-full h-44 object-cover rounded-lg bg-zinc-900"
                      />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-zinc-300">#{idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => movePage(idx, -1)}
                            className="p-1 rounded bg-white/10 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            disabled={idx === pagesList.length - 1}
                            onClick={() => movePage(idx, 1)}
                            className="p-1 rounded bg-white/10 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!p.id || !confirm(`Xóa trang #${idx + 1}?`)) return;
                              await adminApi.deletePage(p.id);
                              setPagesList((prev) => prev.filter((x) => x.id !== p.id));
                              showToast('Đã xóa trang ảnh');
                            }}
                            className="p-1 rounded bg-rose-500/20 text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
