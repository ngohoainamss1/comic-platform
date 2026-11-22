import type { Context, Next } from 'hono';
import type { Env } from '../types';

const RATE_LIMIT_MAX = 80;
const WINDOW_SECONDS = 60;

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.req.path.startsWith('/api/admin')) {
    return next();
  }

  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  if (ip === '127.0.0.1' || ip === '::1') {
    return next();
  }

  const currentWindow = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const cacheKeyUrl = `https://rate-limit.internal/${encodeURIComponent(ip)}/${currentWindow}`;
  const cacheKey = new Request(cacheKeyUrl);
  const cache = caches.default;

  try {
    const cachedRes = await cache.match(cacheKey);
    let count = 0;

    if (cachedRes) {
      const text = await cachedRes.text();
      count = parseInt(text, 10) || 0;
    }

    if (count >= RATE_LIMIT_MAX) {
      return c.json(
        { success: false, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.' },
        429,
        { 'Retry-After': String(WINDOW_SECONDS) }
      );
    }

    const nextCount = count + 1;
    const newRes = new Response(String(nextCount), {
      headers: { 'Cache-Control': `public, max-age=${WINDOW_SECONDS}`, 'Content-Type': 'text/plain' },
    });

    c.executionCtx.waitUntil(cache.put(cacheKey, newRes));
  } catch {}

  return next();
}
