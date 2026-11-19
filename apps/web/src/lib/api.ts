const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const MIRROR_GIST_URL = import.meta.env.VITE_MIRROR_GIST_URL || '';

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

export function resolveAssetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export async function syncMirrorListToServiceWorker(): Promise<void> {
  if (!MIRROR_GIST_URL || !('serviceWorker' in navigator)) return;
  try {
    const res = await fetch(MIRROR_GIST_URL, { cache: 'no-store' });
    const data = await res.json();
    if (Array.isArray(data.mirrors)) {
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'SET_MIRRORS', mirrors: data.mirrors });
    }
  } catch {
    // Dùng danh sách mirror đã cache trong Service Worker
  }
}

export async function fetchGenres(): Promise<GenreItem[]> {
  const res = await fetch(`${API_BASE}/api/genres`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchComics(params: {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  inc?: string[];
  exc?: string[];
}) {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.q) search.set('q', params.q);
  if (params.sort) search.set('sort', params.sort);
  if (params.inc?.length) search.set('inc', params.inc.join(','));
  if (params.exc?.length) search.set('exc', params.exc.join(','));

  const res = await fetch(`${API_BASE}/api/comics?${search.toString()}`);
  return res.json();
}

export async function fetchComicDetail(slug: string): Promise<ComicDetail> {
  const res = await fetch(`${API_BASE}/api/comics/${encodeURIComponent(slug)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Lỗi tải truyện');
  return json.data;
}

export async function fetchChapterPages(chapterId: number) {
  const res = await fetch(`${API_BASE}/api/chapters/${chapterId}/pages`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Lỗi tải chương');
  return json.data as {
    chapter: { id: number; comic_id: number; chapter_number: number; title: string; comic_slug: string; comic_title: string };
    prev_chapter: { id: number; chapter_number: number } | null;
    next_chapter: { id: number; chapter_number: number } | null;
    pages: PageItem[];
  };
}

export async function recordComicView(comicId: number): Promise<void> {
  fetch(`${API_BASE}/api/comics/${comicId}/view`, { method: 'POST' }).catch(() => {});
}
