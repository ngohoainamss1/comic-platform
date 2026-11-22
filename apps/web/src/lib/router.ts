export type ViewMode = 'home' | 'browse' | 'ranking' | 'library' | 'detail' | 'reader' | 'admin' | 'summon' | 'profile';
export type ModalType = 'filter' | 'backup' | null;

export interface RouteState {
  view: ViewMode;
  slug?: string;
  chapterId?: number;
  libraryTab?: 'bookmarks' | 'history';
  q?: string;
  sort?: string;
  status?: string;
  author?: string;
  inc?: string[];
  exc?: string[];
  page?: number;
}

export function parseRouteFromLocation(loc: Location = window.location): RouteState {
  const path = loc.pathname;
  const searchParams = new URLSearchParams(loc.search);

  if (path === '/admin' || loc.hash === '#/admin') {
    return { view: 'admin' };
  }

  if (path === '/waifu/summon' || path === '/summon') {
    return { view: 'summon' };
  }

  if (path === '/leaderboard') {
    return { view: 'ranking', sort: 'top-day' };
  }

  if (path.startsWith('/profile')) {
    return { view: 'profile' };
  }

  if (path.startsWith('/comic/')) {
    const slug = decodeURIComponent(path.replace('/comic/', '').replace(/\/$/, ''));
    return { view: 'detail', slug };
  }

  if (path.startsWith('/read/')) {
    const chapterIdStr = path.replace('/read/', '').replace(/\/$/, '');
    const chapterId = Number(chapterIdStr);
    return { view: 'reader', chapterId: Number.isFinite(chapterId) ? chapterId : undefined };
  }

  if (path === '/browse' || path === '/search' || path === '/search/advanced') {
    const q = searchParams.get('q') || undefined;
    const sort = searchParams.get('sort') || undefined;
    const status = searchParams.get('status') || undefined;
    const author = searchParams.get('author') || undefined;
    const incRaw = searchParams.get('inc');
    const excRaw = searchParams.get('exc');
    const pageStr = searchParams.get('page');
    const page = pageStr ? Number(pageStr) : undefined;

    return {
      view: 'browse',
      q,
      sort,
      status,
      author,
      inc: incRaw ? incRaw.split(',').filter(Boolean) : undefined,
      exc: excRaw ? excRaw.split(',').filter(Boolean) : undefined,
      page: Number.isFinite(page) && page! > 1 ? page : undefined,
    };
  }

  if (path === '/ranking') {
    const sort = searchParams.get('sort') || undefined;
    const pageStr = searchParams.get('page');
    const page = pageStr ? Number(pageStr) : undefined;
    return {
      view: 'ranking',
      sort,
      page: Number.isFinite(page) && page! > 1 ? page : undefined,
    };
  }

  if (path === '/library') {
    const tab = searchParams.get('tab');
    return {
      view: 'library',
      libraryTab: tab === 'history' ? 'history' : 'bookmarks',
    };
  }

  return { view: 'home' };
}

export function buildUrlFromRoute(route: RouteState): string {
  const params = new URLSearchParams();

  switch (route.view) {
    case 'admin':
      return '/admin';
    case 'summon':
      return '/waifu/summon';
    case 'profile':
      return '/profile';
    case 'detail':
      return route.slug ? `/comic/${encodeURIComponent(route.slug)}` : '/';
    case 'reader':
      return route.chapterId ? `/read/${route.chapterId}` : '/';
    case 'browse': {
      if (route.q) params.set('q', route.q);
      if (route.sort && route.sort !== 'latest') params.set('sort', route.sort);
      if (route.status && route.status !== 'all') params.set('status', route.status);
      if (route.author) params.set('author', route.author);
      if (route.inc && route.inc.length > 0) params.set('inc', route.inc.join(','));
      if (route.exc && route.exc.length > 0) params.set('exc', route.exc.join(','));
      if (route.page && route.page > 1) params.set('page', String(route.page));
      const qs = params.toString();
      return qs ? `/browse?${qs}` : '/browse';
    }
    case 'ranking': {
      if (route.sort && route.sort !== 'top-day') params.set('sort', route.sort);
      if (route.page && route.page > 1) params.set('page', String(route.page));
      const qs = params.toString();
      return qs ? `/ranking?${qs}` : '/ranking';
    }
    case 'library': {
      if (route.libraryTab && route.libraryTab !== 'bookmarks') params.set('tab', route.libraryTab);
      const qs = params.toString();
      return qs ? `/library?${qs}` : '/library';
    }
    case 'home':
    default:
      return '/';
  }
}

export function pushRoute(route: RouteState, extraState?: Record<string, unknown>) {
  const url = buildUrlFromRoute(route);
  const currentUrl = window.location.pathname + window.location.search;
  if (url !== currentUrl) {
    window.history.pushState({ route, ...(extraState || {}), fromApp: true }, '', url);
  } else {
    window.history.replaceState({ route, ...(extraState || {}), fromApp: true }, '', url);
  }
}

export function replaceRoute(route: RouteState, extraState?: Record<string, unknown>) {
  const url = buildUrlFromRoute(route);
  window.history.replaceState({ route, ...(extraState || {}), fromApp: true }, '', url);
}

export function pushModalState(modal: 'filter' | 'backup') {
  const currentState = (window.history.state as Record<string, unknown>) || {};
  window.history.pushState({ ...currentState, modal, fromApp: true }, '', window.location.href);
}
