import { Hono } from 'hono';
import type { Env } from '../types';
import { verifyImageSignature } from '../utils/crypto';

export const imageProxyRoutes = new Hono<{ Bindings: Env }>();

const BLOCKED_SCRAPER_ASNS = new Set([14061, 16509, 14618, 24940, 16276, 20473, 63949]);

async function fetchFromTelegram(fileId: string, botToken: string): Promise<Response | null> {
  try {
    const infoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
    const infoRes = await fetch(infoUrl);
    if (!infoRes.ok) return null;

    const infoJson = (await infoRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };

    const filePath = infoJson.result?.file_path;
    if (!infoJson.ok || !filePath) return null;

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok || !fileRes.body) return null;

    return fileRes;
  } catch {
    return null;
  }
}

async function fetchFromGithubBackup(
  ghPath: string,
  ghRepo: string,
  ghToken: string
): Promise<Response | null> {
  if (!ghPath || !ghRepo || !ghToken) return null;
  try {
    const rawUrl = `https://raw.githubusercontent.com/${ghRepo}/main/${ghPath.replace(/^\/+/, '')}`;
    const res = await fetch(rawUrl, {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        'User-Agent': 'VinaReader-EdgeProxy/1.0',
      },
    });
    if (!res.ok || !res.body) return null;
    return res;
  } catch {
    return null;
  }
}

imageProxyRoutes.get('/:fileId/:sig/:expFile', async (c) => {
  const fileId = decodeURIComponent(c.req.param('fileId') || '');
  const sig = c.req.param('sig') || '';
  const expFile = c.req.param('expFile') || '';
  const expStr = expFile.replace(/\.(avif|webp)$/i, '');
  const ghFallbackPath = c.req.query('fb') || '';

  const cfData = (c.req.raw as unknown as { cf?: { asn?: number } }).cf;
  if (cfData?.asn && BLOCKED_SCRAPER_ASNS.has(cfData.asn)) {
    return c.text('Truy cập bị từ chối.', 403);
  }

  const fetchSite = c.req.header('Sec-Fetch-Site');
  if (fetchSite && fetchSite === 'cross-site') {
    return c.text('Không được phép nhúng ảnh từ tên miền khác.', 403);
  }

  const isValid = await verifyImageSignature(fileId, sig, expStr, c.env.HMAC_SECRET_KEY);
  if (!isValid) {
    return c.text('Liên kết ảnh đã hết hạn hoặc không hợp lệ.', 403);
  }

  const cache = caches.default;
  const normalizedCacheKey = new Request(`https://cdn-edge.internal/v1/img/${encodeURIComponent(fileId)}.avif`);
  const cachedResponse = await cache.match(normalizedCacheKey);

  if (cachedResponse) {
    const hitHeaders = new Headers(cachedResponse.headers);
    hitHeaders.set('X-Cache', 'HIT');
    return new Response(cachedResponse.body, {
      status: 200,
      headers: hitHeaders,
    });
  }

  let upstreamRes = await fetchFromTelegram(fileId, c.env.TG_BOT_TOKEN);
  let sourceHeader = 'telegram';

  if (!upstreamRes && ghFallbackPath) {
    upstreamRes = await fetchFromGithubBackup(
      ghFallbackPath,
      c.env.GH_BACKUP_REPO,
      c.env.GH_TOKEN
    );
    sourceHeader = 'github-backup';
  }

  if (!upstreamRes || !upstreamRes.body) {
    return c.text('Không thể tải dữ liệu hình ảnh.', 502);
  }

  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', 'image/avif');
  responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
  responseHeaders.set('CDN-Cache-Control', 'max-age=31536000');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('X-Cache', 'MISS');
  responseHeaders.set('X-Origin-Source', sourceHeader);

  const [streamForClient, streamForCache] = upstreamRes.body.tee();

  const cacheResponse = new Response(streamForCache, {
    status: 200,
    headers: responseHeaders,
  });
  c.executionCtx.waitUntil(cache.put(normalizedCacheKey, cacheResponse));

  return new Response(streamForClient, {
    status: 200,
    headers: responseHeaders,
  });
});
