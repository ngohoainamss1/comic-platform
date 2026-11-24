import { Hono } from 'hono';
import type { Env } from '../types';
import { getDb } from '../db/client';
import { ensureSchemaMigrated } from '../db/migrate';

export const spotlightRedirectRoutes = new Hono<{ Bindings: Env }>();

const BOT_UA_RE = /bot|crawler|spider|slurp|facebookexternalhit|telegrambot|whatsapp|zalo|discordbot|headless|lighthouse|preview/i;

function appendAffiliateTracking(rawUrl: string, platform: string, placement: string, refSlug: string, code: string): string {
  try {
    const url = new URL(rawUrl);
    const safeRef = refSlug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'direct';

    if (platform === 'shopee' || url.hostname.includes('shopee')) {
      if (!url.searchParams.has('sub_id')) {
        url.searchParams.set('sub_id', `${placement}_${safeRef}`);
      }
    } else if (platform === 'tiktok' || url.hostname.includes('tiktok')) {
      if (!url.searchParams.has('utm_source')) {
        url.searchParams.set('utm_source', 'comic');
        url.searchParams.set('utm_medium', placement);
        url.searchParams.set('utm_campaign', code);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

spotlightRedirectRoutes.get('/:code', async (c) => {
  const code = (c.req.param('code') || '').trim();
  const refSlug = (c.req.query('ref') || 'direct').slice(0, 100);
  if (!code) return c.redirect('https://s.shopee.vn/9V3HvEQHP3', 302);

  try {
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const res = await db.execute({
      sql: 'SELECT id, platform, placement, target_url FROM spotlight_campaigns WHERE code = ? AND is_active = 1 LIMIT 1',
      args: [code],
    });

    if (res.rows.length === 0) {
      return c.redirect('https://s.shopee.vn/9V3HvEQHP3', 302);
    }

    const row = res.rows[0];
    const campaignId = Number(row.id);
    const platform = String(row.platform || 'shopee');
    const placement = String(row.placement || 'gesture_pop');
    const targetUrl = String(row.target_url || '').trim();

    if (!/^https?:\/\//i.test(targetUrl)) {
      return c.redirect('https://s.shopee.vn/9V3HvEQHP3', 302);
    }

    const finalUrl = appendAffiliateTracking(targetUrl, platform, placement, refSlug, code);

    const ua = c.req.header('user-agent') || '';
    const isBot = BOT_UA_RE.test(ua);
    const isGet = c.req.method === 'GET';

    if (!isBot && isGet) {
      c.executionCtx.waitUntil(
        Promise.all([
          db.execute({
            sql: 'UPDATE spotlight_campaigns SET clicks_total = clicks_total + 1 WHERE id = ?',
            args: [campaignId],
          }),
          db.execute({
            sql: 'INSERT INTO spotlight_clicks (campaign_id, placement, ref_slug) VALUES (?, ?, ?)',
            args: [campaignId, placement, refSlug],
          }),
        ]).catch(() => {})
      );
    }

    return c.redirect(finalUrl, 302);
  } catch {
    return c.redirect('https://s.shopee.vn/9V3HvEQHP3', 302);
  }
});
