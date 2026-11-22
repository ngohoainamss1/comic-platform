const SHELL_CACHE = 'vinareader-shell-v2';
const MIRROR_CACHE = 'vinareader-mirrors-v2';
let mirrorList = [];
let activeMirrorIndex = 0;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', '/index.html', '/manifest.json']))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== MIRROR_CACHE) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_MIRRORS' && Array.isArray(event.data.mirrors)) {
    mirrorList = event.data.mirrors;
    caches.open(MIRROR_CACHE).then((cache) => {
      cache.put('/mirrors.json', new Response(JSON.stringify({ mirrors: mirrorList })));
    });
  }
});

async function fetchWithTimeout(request, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function handleApiOrImageWithFailover(request) {
  const url = new URL(request.url);
  const candidates = [url.origin, ...mirrorList.filter((m) => m !== url.origin)];

  for (let i = 0; i < candidates.length; i++) {
    const idx = (activeMirrorIndex + i) % candidates.length;
    const base = candidates[idx];
    const targetUrl = `${base}${url.pathname}${url.search}`;

    try {
      const clonedReq = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        mode: 'cors',
      });
      const res = await fetchWithTimeout(clonedReq, 2500);
      if (res.ok || res.status < 500) {
        activeMirrorIndex = idx;
        return res;
      }
    } catch {
      // Tự động thử tên miền dự phòng tiếp theo nếu bị chặn hoặc timeout
    }
  }

  return new Response(
    JSON.stringify({ success: false, message: 'Đang kết nối lại máy chủ dự phòng...' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/img/')) {
    event.respondWith(handleApiOrImageWithFailover(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  if (event.request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
