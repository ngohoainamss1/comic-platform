const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MIRROR_GIST_URL = (import.meta.env.VITE_MIRROR_GIST_URL || '').trim();

export interface GenreItem {
  id: number;
  slug: string;
  name: string;
  comic_count?: number;
}

export interface ComicSummary {
  id: number;
  slug: string;
  title: string;
  description?: string;
  cover_url: string;
  status: string;
  is_featured?: number;
  views_day: number;
  views_week: number;
  views_month: number;
  views_total: number;
  rating_avg: number;
  latest_chapter: number | null;
  updated_at: string;
}

export interface ChapterItem {
  id: number;
  chapter_number: number;
  title: string;
  views: number;
  created_at: string;
  page_count?: number;
}

export interface AuthorItem {
  id: number;
  slug: string;
  name: string;
}

export interface ComicDetail extends ComicSummary {
  alt_titles: string;
  description: string;
  rating_count: number;
  author?: AuthorItem | null;
  same_author_comics?: ComicSummary[];
  genres: GenreItem[];
  chapters: ChapterItem[];
}

export interface PageItem {
  id?: number;
  index: number;
  page_index?: number;
  url: string;
  width: number;
  height: number;
  format?: string;
}

export interface ChapterPagesPayload {
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
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface HistoryItem {
  slug: string;
  title: string;
  cover_url: string;
  chapter_id: number;
  chapter_number: number;
  read_at: number;
  progress?: number;
  total_pages?: number;
}

export interface PublicSettings {
  site_name: string;
  announcement_enabled: string;
  announcement_text: string;
  maintenance_mode: string;
}

export interface FetchComicsParams {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  status?: string;
  author?: string;
  featured?: string;
  inc?: string[];
  exc?: string[];
}

export interface AdminStats {
  comics_total: number;
  comics_hidden: number;
  comics_featured: number;
  chapters_total: number;
  pages_total: number;
  views_day: number;
  views_week: number;
  views_month: number;
  views_total: number;
  jobs_pending: number;
  jobs_failed: number;
  jobs_published: number;
  open_reports: number;
  active_watchlists: number;
  sources_total: number;
  sources_active: number;
  recent_comics: Array<{ id: number; slug: string; title: string; views_day: number; views_total: number; updated_at: string }>;
}

export interface AdminComicRow {
  id: number;
  slug: string;
  title: string;
  alt_titles: string;
  description: string;
  cover_url: string;
  status: string;
  is_featured: number;
  is_hidden: number;
  views_total: number;
  rating_avg: number;
  updated_at: string;
  author_name: string;
  chapter_count: number;
  genre_ids: number[];
}

export interface AdminSourceRow {
  id: number;
  name: string;
  base_url: string;
  feed_url: string;
  adapter_type: string;
  is_active: number;
  last_synced_at: string | null;
}

export interface AdminWatchlistRow {
  id: number;
  comic_id: number;
  comic_title: string;
  comic_slug: string;
  source_comic_url: string;
  last_known_chapter: number;
  check_interval_mins: number;
  priority: number;
  next_check_at: string;
  consecutive_errors: number;
  status: string;
}

export interface AdminJobRow {
  id: number;
  source_id: number;
  comic_slug: string;
  chapter_number: number;
  source_chapter_url: string;
  status: string;
  retry_count: number;
  error_log: string;
  created_at: string;
}

export interface AdminReportRow {
  id: number;
  comic_id: number;
  chapter_id: number | null;
  comic_title: string | null;
  comic_slug: string | null;
  chapter_number: number | null;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
}

const BOOKMARKS_KEY = 'vr_bookmarks';
const HISTORY_KEY = 'vr_history_v2';
const ADMIN_TOKEN_KEY = 'vr_admin_token';

export function resolveAssetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${API_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T } & T;
  if (!res.ok) {
    throw new Error(data.message || `Lỗi máy chủ (${res.status})`);
  }
  return data;
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  try {
    const res = await requestJson<{ data: PublicSettings }>('/api/settings/public');
    return res.data;
  } catch {
    return { site_name: 'VinaReader', announcement_enabled: '0', announcement_text: '', maintenance_mode: '0' };
  }
}

export async function fetchGenres(): Promise<GenreItem[]> {
  const res = await requestJson<{ data: GenreItem[] }>('/api/genres');
  return res.data || [];
}

export async function fetchComics(params: FetchComicsParams = {}): Promise<{ items: ComicSummary[]; pagination: PaginationMeta }> {
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.q) sp.set('q', params.q);
  if (params.sort) sp.set('sort', params.sort);
  if (params.status && params.status !== 'all') sp.set('status', params.status);
  if (params.author) sp.set('author', params.author);
  if (params.featured) sp.set('featured', params.featured);
  if (params.inc && params.inc.length > 0) sp.set('inc', params.inc.join(','));
  if (params.exc && params.exc.length > 0) sp.set('exc', params.exc.join(','));

  const res = await requestJson<{ data: ComicSummary[]; pagination: PaginationMeta }>(`/api/comics?${sp.toString()}`);
  return {
    items: res.data || [],
    pagination: res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
  };
}

export async function fetchComicDetail(slug: string): Promise<ComicDetail> {
  const res = await requestJson<{ data: ComicDetail }>(`/api/comics/${encodeURIComponent(slug)}`);
  return res.data;
}

export async function fetchChapterPages(chapterId: number): Promise<ChapterPagesPayload> {
  const res = await requestJson<{ data: ChapterPagesPayload }>(`/api/chapters/${chapterId}/pages`);
  return res.data;
}

export async function incrementComicView(comicId: number): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/comics/${comicId}/view`, { method: 'POST' });
  } catch {}
}

export async function rateComic(comicId: number, rating: number): Promise<{ rating_avg: number; rating_count: number }> {
  const res = await requestJson<{ data: { rating_avg: number; rating_count: number } }>(`/api/comics/${comicId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
  return res.data;
}

export async function submitReport(payload: { comic_id: number; chapter_id?: number | null; reason: string; detail?: string }): Promise<string> {
  const res = await requestJson<{ message?: string }>('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.message || 'Đã gửi báo lỗi thành công!';
}

// LocalStorage: Bookmarks & History & Backup
export function getBookmarks(): ComicSummary[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? (JSON.parse(raw) as ComicSummary[]) : [];
  } catch {
    return [];
  }
}

export function isBookmarked(slug: string): boolean {
  return getBookmarks().some((b) => b.slug === slug);
}

export function toggleBookmark(comic: ComicSummary): boolean {
  const list = getBookmarks();
  const idx = list.findIndex((b) => b.slug === comic.slug);
  let added = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift(comic);
    added = true;
  }
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list.slice(0, 200)));
  return added;
}

export function getHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(item: HistoryItem): void {
  const list = getHistory().filter((h) => h.slug !== item.slug);
  list.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 120)));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function exportUserData(): string {
  return JSON.stringify(
    {
      version: 2,
      exported_at: new Date().toISOString(),
      bookmarks: getBookmarks(),
      history: getHistory(),
    },
    null,
    2
  );
}

export function importUserData(rawJson: string): { bookmarks: number; history: number } {
  const parsed = JSON.parse(rawJson) as { bookmarks?: ComicSummary[]; history?: HistoryItem[] };
  if (!parsed || (!Array.isArray(parsed.bookmarks) && !Array.isArray(parsed.history))) {
    throw new Error('Mã sao lưu không đúng định dạng JSON.');
  }
  let bCount = 0;
  let hCount = 0;
  if (Array.isArray(parsed.bookmarks)) {
    const merged = [...parsed.bookmarks, ...getBookmarks()];
    const uniq = Array.from(new Map(merged.map((c) => [c.slug, c])).values()).slice(0, 200);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(uniq));
    bCount = uniq.length;
  }
  if (Array.isArray(parsed.history)) {
    const merged = [...parsed.history, ...getHistory()].sort((a, b) => (b.read_at || 0) - (a.read_at || 0));
    const uniq = Array.from(new Map(merged.map((h) => [h.slug, h])).values()).slice(0, 120);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(uniq));
    hCount = uniq.length;
  }
  return { bookmarks: bCount, history: hCount };
}

export async function fetchMirrorList(): Promise<string[]> {
  if (!MIRROR_GIST_URL) return [];
  try {
    const res = await fetch(MIRROR_GIST_URL);
    const data = (await res.json()) as { mirrors?: string[] };
    return Array.isArray(data.mirrors) ? data.mirrors : [];
  } catch {
    return [];
  }
}

export async function syncMirrorListToServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const mirrors = await fetchMirrorList();
  if (mirrors.length === 0) return;

  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: 'SYNC_MIRRORS', mirrors });
}


// ==================== ADMIN API ====================
export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function setAdminToken(token: string): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/admin${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: T } & T;
  if (res.status === 401) {
    setAdminToken('');
    throw new Error(data.message || 'Phiên quản trị hết hạn. Vui lòng đăng nhập lại.');
  }
  if (!res.ok) {
    throw new Error(data.message || `Lỗi Admin API (${res.status})`);
  }
  return data;
}

export async function adminLogin(password: string): Promise<string> {
  const res = await requestJson<{ token: string }>('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  setAdminToken(res.token);
  return res.token;
}

export const adminApi = {
  getStats: async () => (await adminReq<{ data: AdminStats }>('/stats')).data,
  resetViews: (period: 'day' | 'week' | 'month') =>
    adminReq<{ message: string }>('/stats/reset-views', { method: 'POST', body: JSON.stringify({ period }) }),
  getComics: (page = 1, q = '', filter = 'all') =>
    adminReq<{ data: AdminComicRow[]; pagination: PaginationMeta }>(
      `/comics?page=${page}&limit=20&q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`
    ),
  updateComic: (id: number, payload: Record<string, unknown>) =>
    adminReq<{ message: string }>(`/comics/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteComic: (id: number) => adminReq<{ message: string }>(`/comics/${id}`, { method: 'DELETE' }),
  getChapters: async (comicId: number) => (await adminReq<{ data: ChapterItem[] }>(`/comics/${comicId}/chapters`)).data,
  updateChapter: (id: number, payload: { chapter_number?: number; title?: string }) =>
    adminReq<{ message: string }>(`/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteChapter: (id: number) => adminReq<{ message: string }>(`/chapters/${id}`, { method: 'DELETE' }),
  getPages: async (chapterId: number) => (await adminReq<{ data: PageItem[] }>(`/chapters/${chapterId}/pages`)).data,
  deletePage: (pageId: number) => adminReq<{ message: string }>(`/pages/${pageId}`, { method: 'DELETE' }),
  reorderPages: (chapterId: number, pageIds: number[]) =>
    adminReq<{ message: string }>(`/chapters/${chapterId}/pages/reorder`, {
      method: 'POST',
      body: JSON.stringify({ page_ids: pageIds }),
    }),
  getGenres: async () => (await adminReq<{ data: GenreItem[] }>('/genres')).data,
  createGenre: (name: string, slug?: string) =>
    adminReq<{ message: string }>('/genres', { method: 'POST', body: JSON.stringify({ name, slug }) }),
  deleteGenre: (id: number) => adminReq<{ message: string }>(`/genres/${id}`, { method: 'DELETE' }),
  mergeGenres: (source_id: number, target_id: number) =>
    adminReq<{ message: string }>('/genres/merge', { method: 'POST', body: JSON.stringify({ source_id, target_id }) }),
  getSources: async () => (await adminReq<{ data: AdminSourceRow[] }>('/sources')).data,
  createSource: (payload: { name: string; base_url: string; feed_url: string; adapter_type?: string; is_active?: number }) =>
    adminReq<{ message: string }>('/sources', { method: 'POST', body: JSON.stringify(payload) }),
  updateSource: (id: number, payload: Record<string, unknown>) =>
    adminReq<{ success: boolean }>(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSource: (id: number) => adminReq<{ success: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
  getWatchlist: async () => (await adminReq<{ data: AdminWatchlistRow[] }>('/watchlist')).data,
  updateWatchlist: (id: number, payload: { priority?: number; status?: string; force_now?: boolean }) =>
    adminReq<{ message: string }>(`/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteWatchlist: (id: number) => adminReq<{ success: boolean }>(`/watchlist/${id}`, { method: 'DELETE' }),
  getJobs: async (status: string) => (await adminReq<{ data: AdminJobRow[] }>(`/jobs?status=${encodeURIComponent(status)}`)).data,
  retryJob: (id: number) => adminReq<{ message: string }>(`/jobs/${id}/retry`, { method: 'POST' }),
  retryAllFailedJobs: () => adminReq<{ message: string }>('/jobs/retry-all-failed', { method: 'POST' }),
  deleteJob: (id: number) => adminReq<{ success: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),
  triggerCrawler: (comicUrl = '') =>
    adminReq<{ message: string }>('/crawler/trigger', { method: 'POST', body: JSON.stringify({ comic_url: comicUrl }) }),
  getReports: async () => (await adminReq<{ data: AdminReportRow[] }>('/reports')).data,
  updateReport: (id: number, status: 'open' | 'resolved') =>
    adminReq<{ success: boolean }>(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteReport: (id: number) => adminReq<{ success: boolean }>(`/reports/${id}`, { method: 'DELETE' }),
  getSettings: async () => (await adminReq<{ data: PublicSettings }>('/settings')).data,
  updateSettings: (payload: Partial<PublicSettings>) =>
    adminReq<{ message: string }>('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
};
