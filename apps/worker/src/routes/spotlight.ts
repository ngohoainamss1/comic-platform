import { Hono } from 'hono';
import type { Env } from '../types';
import { getDb } from '../db/client';
import { ensureSchemaMigrated } from '../db/migrate';

export const spotlightRedirectRoutes = new Hono<{ Bindings: Env }>();

spotlightRedirectRoutes.get('/:code', async (c) => {
  const code = (c.req.param('code') || '').trim();
  const refSlug = (c.req.query('ref') || 'direct').slice(0, 100);
  if (!code) return c.redirect('/', 302);

  try {
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const res = await db.execute({
      sql: 'SELECT id, placement, target_url FROM spotlight_campaigns WHERE code = ? AND is_active = 1 LIMIT 1',
      args: [code],
    });

    if (res.rows.length === 0) {
      return c.redirect('/', 302);
    }

    const row = res.rows[0];
    const campaignId = Number(row.id);
    const placement = String(row.placement || 'unknown');
    const targetUrl = String(row.target_url || '').trim();

    if (!/^https?:\/\//i.test(targetUrl)) {
      return c.redirect('/', 302);
    }

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

    return c.redirect(targetUrl, 302);
  } catch {
    return c.redirect('/', 302);
  }
});
