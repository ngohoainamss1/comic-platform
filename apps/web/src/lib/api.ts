const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MIRROR_GIST_URL = (import.meta.env.VITE_MIRROR_GIST_URL || '').trim();

export interface GenreItem {
  id: number;
  slug: string;
  name: string;
}

export interface ComicSummary {
  id: number;
  slug: string;
  title: string;
  cover_url: string;
  status: string;
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
}

export interface ComicDetail extends ComicSummary {
  alt_titles: string;
  description: string;
  rating_count: number;
  genres: GenreItem[];
  chapters: ChapterItem[];
}

export interface PageItem {
  index: number;
  url: string;
  width: number;
  height: number;
  format: string;
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
  progress?: number; /* Thêm lưu % đọc */
  total_pages?: number;
}

export interface FetchComicsParams {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  status?: string;
  inc?: string[];
  exc?: string[];
  signal?: AbortSignal;
}

export interface ComicListResponse {
  success: boolean;
  data: ComicSummary[];
  pagination?: PaginationMeta;
  message?: string;
}

export interface ChapterPagesData {
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

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const GENRES_TTL_MS = 5 * 60 * 1000;
const DETAIL_TTL_MS = 60 * 1000;
const CHAPTER_TTL_MS = 2 * 60 * 1000;
const VIEW_COOLDOWN_MS = 30 * 60 * 1000;

let genresCache: CacheEntry<GenreItem[]> | null = null;
let genresInFlight: Promise<GenreItem[]> | null = null;

const detailCache = new Map<string, CacheEntry<ComicDetail>>();
const detailInFlight = new Map<string, Promise<ComicDetail>>();

const chapterCache = new Map<number, CacheEntry<ChapterPagesData>>();
const chapterInFlight = new Map<number, Promise<ChapterPagesData>>();

export function resolveAssetUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

export function clearApiCache(): void {
  genresCache = null;
  detailCache.clear();
  chapterCache.clear();
}

async function requestJson<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 12_000, signal: externalSignal, ...fetchInit } = options;
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Phản hồi máy chủ không hợp lệ (HTTP ${res.status})`);
      }
    }

    if (!res.ok) {
      const msg =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : `Lỗi máy chủ (HTTP ${res.status})`;
      throw new Error(msg);
    }

    return payload as T;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      if (externalSignal?.aborted) throw err;
      throw new Error('Kết nối máy chủ quá thời gian chờ. Vui lòng thử lại.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function syncMirrorListToServiceWorker(): Promise<void> {
  if (!MIRROR_GIST_URL || !('serviceWorker' in navigator)) return;
  try {
    const res = await fetch(MIRROR_GIST_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.mirrors)) {
      const mirrors = data.mirrors
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim().replace(/\/$/, ''));
      if (mirrors.length > 0) {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'SET_MIRRORS', mirrors });
      }
    }
  } catch {
    //
  }
}

export async function fetchGenres(): Promise<GenreItem[]> {
  const now = Date.now();
  if (genresCache && genresCache.expiresAt > now) {
    return genresCache.value;
  }
  if (genresInFlight) {
    return genresInFlight;
  }

  genresInFlight = requestJson<{ success: boolean; data?: GenreItem[] }>('/api/genres')
    .then((json) => {
      const list = Array.isArray(json.data) ? json.data : [];
      genresCache = { value: list, expiresAt: Date.now() + GENRES_TTL_MS };
      return list;
    })
    .finally(() => {
      genresInFlight = null;
    });

  return genresInFlight;
}

export async function fetchComics(params: FetchComicsParams = {}): Promise<ComicListResponse> {
  const search = new URLSearchParams();
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.sort) search.set('sort', params.sort);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.inc?.length) search.set('inc', params.inc.join(','));
  if (params.exc?.length) search.set('exc', params.exc.join(','));

  const qs = search.toString();
  const path = qs ? `/api/comics?${qs}` : '/api/comics';

  return requestJson<ComicListResponse>(path, { signal: params.signal });
}

export async function fetchComicDetail(slug: string): Promise<ComicDetail> {
  const normalizedSlug = slug.trim();
  const now = Date.now();
  const cached = detailCache.get(normalizedSlug);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existing = detailInFlight.get(normalizedSlug);
  if (existing) {
    return existing;
  }

  const promise = requestJson<{ success: boolean; data?: ComicDetail; message?: string }>(
    `/api/comics/${encodeURIComponent(normalizedSlug)}`
  )
    .then((json) => {
      if (!json.success || !json.data) {
        throw new Error(json.message || 'Không tìm thấy thông tin truyện.');
      }
      detailCache.set(normalizedSlug, {
        value: json.data,
        expiresAt: Date.now() + DETAIL_TTL_MS,
      });
      return json.data;
    })
    .finally(() => {
      detailInFlight.delete(normalizedSlug);
    });

  detailInFlight.set(normalizedSlug, promise);
  return promise;
}

export async function fetchChapterPages(chapterId: number): Promise<ChapterPagesData> {
  const now = Date.now();
  const cached = chapterCache.get(chapterId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const existing = chapterInFlight.get(chapterId);
  if (existing) {
    return existing;
  }

  const promise = requestJson<{ success: boolean; data?: ChapterPagesData; message?: string }>(
    `/api/chapters/${chapterId}/pages`
  )
    .then((json) => {
      if (!json.success || !json.data) {
        throw new Error(json.message || 'Không thể tải trang ảnh của chương này.');
      }
      chapterCache.set(chapterId, {
        value: json.data,
        expiresAt: Date.now() + CHAPTER_TTL_MS,
      });
      return json.data;
    })
    .finally(() => {
      chapterInFlight.delete(chapterId);
    });

  chapterInFlight.set(chapterId, promise);
  return promise;
}

export async function recordComicView(comicId: number): Promise<void> {
  if (!Number.isFinite(comicId) || comicId <= 0) return;

  const storageKey = `vr_viewed_${comicId}`;
  try {
    const lastViewed = Number(sessionStorage.getItem(storageKey) || '0');
    if (lastViewed > 0 && Date.now() - lastViewed < VIEW_COOLDOWN_MS) {
      return;
    }
    sessionStorage.setItem(storageKey, String(Date.now()));
  } catch {
    //
  }

  fetch(`${API_BASE}/api/comics/${comicId}/view`, {
    method: 'POST',
    keepalive: true,
  }).catch(() => {});
}
