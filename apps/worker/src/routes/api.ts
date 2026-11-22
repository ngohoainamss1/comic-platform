import { Hono } from 'hono';
import type { InValue } from '@libsql/client/web';
import type { Env } from '../types';
import { getDb } from '../db/client';
import { ensureSchemaMigrated } from '../db/migrate';
import { signImageUrl } from '../utils/crypto';

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/settings/public', async (c) => {
  try {
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);
    const res = await db.execute(
      "SELECT key, value FROM site_settings WHERE key IN ('site_name', 'announcement_enabled', 'announcement_text', 'maintenance_mode')"
    );
    const settings: Record<string, string> = {
      site_name: 'VinaReader',
      announcement_enabled: '0',
      announcement_text: '',
      maintenance_mode: '0',
    };
    for (const row of res.rows) {
      settings[String(row.key)] = String(row.value ?? '');
    }
    return c.json({ success: true, data: settings });
  } catch {
    return c.json({
      success: true,
      data: { site_name: 'VinaReader', announcement_enabled: '0', announcement_text: '', maintenance_mode: '0' },
    });
  }
});

apiRoutes.get('/genres', async (c) => {
  try {
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);
    const result = await db.execute(`
      SELECT g.id, g.slug, g.name, g.description,
             (SELECT COUNT(*) FROM comic_genres cg WHERE cg.genre_id = g.id) AS comic_count
      FROM genres g
      ORDER BY g.name ASC
    `);
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return c.json({ success: true, data: result.rows });
  } catch {
    return c.json({ success: false, message: 'Không thể tải danh sách thể loại.' }, 500);
  }
});

apiRoutes.get('/comics', async (c) => {
  try {
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20));
    const offset = (page - 1) * limit;

    const q = (c.req.query('q') || '').trim();
    const sort = c.req.query('sort') || 'latest';
    const status = c.req.query('status') || 'all';
    const authorSlug = (c.req.query('author') || '').trim();
    const featured = c.req.query('featured') || '';
    const incRaw = (c.req.query('inc') || '').trim();
    const excRaw = (c.req.query('exc') || '').trim();

    const incSlugs = incRaw ? incRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const excSlugs = excRaw ? excRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const conditions: string[] = ['COALESCE(c.is_hidden, 0) = 0'];
    const args: InValue[] = [];

    if (q) {
      conditions.push('(c.title LIKE ? OR c.alt_titles LIKE ?)');
      const keyword = `%${q}%`;
      args.push(keyword, keyword);
    }
    if (status === 'ongoing' || status === 'completed') {
      conditions.push('c.status = ?');
      args.push(status);
    }
    if (featured === '1') {
      conditions.push('COALESCE(c.is_featured, 0) = 1');
    }
    if (authorSlug) {
      conditions.push('EXISTS (SELECT 1 FROM authors a WHERE a.id = c.author_id AND a.slug = ?)');
      args.push(authorSlug);
    }
    for (const slug of incSlugs) {
      conditions.push(
        'EXISTS (SELECT 1 FROM comic_genres cg JOIN genres g ON cg.genre_id = g.id WHERE cg.comic_id = c.id AND g.slug = ?)'
      );
      args.push(slug);
    }
    for (const slug of excSlugs) {
      conditions.push(
        'NOT EXISTS (SELECT 1 FROM comic_genres cg JOIN genres g ON cg.genre_id = g.id WHERE cg.comic_id = c.id AND g.slug = ?)'
      );
      args.push(slug);
    }

    const whereClause = conditions.join(' AND ');
    let orderBy = 'c.updated_at DESC';
    switch (sort) {
      case 'top-day': orderBy = 'c.views_day DESC, c.updated_at DESC'; break;
      case 'top-week': orderBy = 'c.views_week DESC, c.updated_at DESC'; break;
      case 'top-month': orderBy = 'c.views_month DESC, c.updated_at DESC'; break;
      case 'all-time': orderBy = 'c.views_total DESC, c.updated_at DESC'; break;
      case 'rating': orderBy = 'c.rating_avg DESC, c.views_total DESC'; break;
      default: orderBy = 'c.updated_at DESC';
    }

    const countRes = await db.execute({ sql: `SELECT COUNT(*) AS total FROM comics c WHERE ${whereClause}`, args });
    const total = Number(countRes.rows[0]?.total || 0);

    const listRes = await db.execute({
      sql: `
        SELECT c.id, c.slug, c.title, c.description, c.cover_file_id, c.cover_gh_path,
               c.status, COALESCE(c.is_featured, 0) AS is_featured,
               c.views_day, c.views_week, c.views_month, c.views_total,
               c.rating_avg, c.updated_at,
               (SELECT MAX(ch.chapter_number) FROM chapters ch WHERE ch.comic_id = c.id) AS latest_chapter
        FROM comics c
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    const ttl = Number(c.env.IMAGE_TOKEN_TTL_SECONDS || 900);
    const items = await Promise.all(
      listRes.rows.map(async (row) => {
        const cf = String(row.cover_file_id || '');
        const cg = String(row.cover_gh_path || '');
        return {
          id: Number(row.id),
          slug: String(row.slug),
          title: String(row.title),
          description: String(row.description || ''),
          cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
          status: String(row.status),
          is_featured: Number(row.is_featured || 0),
          views_day: Number(row.views_day || 0),
          views_week: Number(row.views_week || 0),
          views_month: Number(row.views_month || 0),
          views_total: Number(row.views_total || 0),
          rating_avg: Number(row.rating_avg || 5.0),
          latest_chapter: row.latest_chapter !== null ? Number(row.latest_chapter) : null,
          updated_at: String(row.updated_at),
        };
      })
    );

    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return c.json({
      success: true,
      data: items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return c.json({ success: false, message: 'Không thể tải danh sách truyện.' }, 500);
  }
});

apiRoutes.get('/comics/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const comicRes = await db.execute({
      sql: 'SELECT * FROM comics WHERE slug = ? AND COALESCE(is_hidden, 0) = 0 LIMIT 1',
      args: [slug],
    });
    if (comicRes.rows.length === 0) {
      return c.json({ success: false, message: 'Không tìm thấy bộ truyện này.' }, 404);
    }

    const comic = comicRes.rows[0];
    const comicId = Number(comic.id);

    const [genresRes, chaptersRes] = await Promise.all([
      db.execute({
        sql: `SELECT g.id, g.slug, g.name FROM genres g JOIN comic_genres cg ON g.id = cg.genre_id WHERE cg.comic_id = ? ORDER BY g.name ASC`,
        args: [comicId],
      }),
      db.execute({
        sql: `SELECT id, chapter_number, title, views, created_at FROM chapters WHERE comic_id = ? ORDER BY chapter_number DESC`,
        args: [comicId],
      }),
    ]);

    const ttl = Number(c.env.IMAGE_TOKEN_TTL_SECONDS || 900);
    const cf = String(comic.cover_file_id || '');
    const cg = String(comic.cover_gh_path || '');
    const coverUrl = cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '';

    let authorObj: { id: number; slug: string; name: string } | null = null;
    let sameAuthorComics: Record<string, unknown>[] = [];
    const authorId = comic.author_id !== null && comic.author_id !== undefined ? Number(comic.author_id) : null;
    if (authorId && Number.isFinite(authorId)) {
      try {
        const [aRes, relRes] = await Promise.all([
          db.execute({ sql: 'SELECT id, slug, name FROM authors WHERE id = ? LIMIT 1', args: [authorId] }),
          db.execute({
            sql: `SELECT c.id, c.slug, c.title, c.cover_file_id, c.cover_gh_path, c.status,
                         c.views_day, c.views_week, c.views_month, c.views_total, c.rating_avg, c.updated_at,
                         (SELECT MAX(ch.chapter_number) FROM chapters ch WHERE ch.comic_id = c.id) AS latest_chapter
                  FROM comics c WHERE c.author_id = ? AND c.id != ? AND COALESCE(c.is_hidden, 0) = 0
                  ORDER BY c.updated_at DESC LIMIT 8`,
            args: [authorId, comicId],
          }),
        ]);
        if (aRes.rows.length > 0) {
          authorObj = { id: Number(aRes.rows[0].id), slug: String(aRes.rows[0].slug), name: String(aRes.rows[0].name) };
        }
        sameAuthorComics = await Promise.all(
          relRes.rows.map(async (row) => {
            const rf = String(row.cover_file_id || '');
            const rg = String(row.cover_gh_path || '');
            return {
              id: Number(row.id),
              slug: String(row.slug),
              title: String(row.title),
              cover_url: rf ? await signImageUrl(rf, c.env.HMAC_SECRET_KEY, ttl, rg) : '',
              status: String(row.status),
              views_day: Number(row.views_day || 0),
              views_week: Number(row.views_week || 0),
              views_month: Number(row.views_month || 0),
              views_total: Number(row.views_total || 0),
              rating_avg: Number(row.rating_avg || 5.0),
              latest_chapter: row.latest_chapter !== null ? Number(row.latest_chapter) : null,
              updated_at: String(row.updated_at),
            };
          })
        );
      } catch {
        authorObj = null;
        sameAuthorComics = [];
      }
    }

    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return c.json({
      success: true,
      data: {
        id: comicId,
        slug: String(comic.slug),
        title: String(comic.title),
        alt_titles: String(comic.alt_titles || ''),
        description: String(comic.description || ''),
        cover_url: coverUrl,
        status: String(comic.status),
        translator: String(comic.translator || ''),
        likes_count: Number(comic.likes_count || 0),
        views_total: Number(comic.views_total || 0),
        rating_avg: Number(comic.rating_avg || 5.0),
        rating_count: Number(comic.rating_count || 1),
        updated_at: String(comic.updated_at),
        author: authorObj,
        same_author_comics: sameAuthorComics,
        genres: genresRes.rows,
        chapters: chaptersRes.rows,
      },
    });
  } catch {
    return c.json({ success: false, message: 'Không thể tải thông tin chi tiết truyện.' }, 500);
  }
});

apiRoutes.get('/chapters/:id/pages', async (c) => {
  try {
    const chapterId = Number(c.req.param('id'));
    if (!Number.isFinite(chapterId) || chapterId <= 0) {
      return c.json({ success: false, message: 'Mã chương không hợp lệ.' }, 400);
    }
    const db = getDb(c.env);
    const chapterRes = await db.execute({
      sql: `SELECT ch.id, ch.comic_id, ch.chapter_number, ch.title, c.slug AS comic_slug, c.title AS comic_title
            FROM chapters ch JOIN comics c ON ch.comic_id = c.id WHERE ch.id = ? LIMIT 1`,
      args: [chapterId],
    });
    if (chapterRes.rows.length === 0) {
      return c.json({ success: false, message: 'Không tìm thấy chương truyện này.' }, 404);
    }

    const comicId = Number(chapterRes.rows[0].comic_id);
    const [pagesRes, navRes, comicRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, page_index, tg_file_id, gh_fallback_path, width, height, format FROM chapter_pages WHERE chapter_id = ? ORDER BY page_index ASC`,
        args: [chapterId],
      }),
      db.execute({
        sql: `SELECT id, chapter_number, title FROM chapters WHERE comic_id = ? ORDER BY chapter_number ASC`,
        args: [comicId],
      }),
      db.execute({
        sql: `SELECT id, slug, title, cover_file_id, cover_gh_path, status, views_total, rating_avg, updated_at FROM comics WHERE id != ? AND COALESCE(is_hidden, 0) = 0 ORDER BY RANDOM() LIMIT 6`,
        args: [comicId],
      }),
    ]);

    const ttl = Number(c.env.IMAGE_TOKEN_TTL_SECONDS || 900);
    const pages = await Promise.all(
      pagesRes.rows.map(async (row) => ({
        index: Number(row.page_index),
        url: await signImageUrl(String(row.tg_file_id), c.env.HMAC_SECRET_KEY, ttl, String(row.gh_fallback_path || '')),
        width: Number(row.width || 1080),
        height: Number(row.height || 1400),
        format: String(row.format || 'avif'),
      }))
    );

    const recommendedComics = await Promise.all(
      comicRes.rows.map(async (row) => {
        const rf = String(row.cover_file_id || '');
        const rg = String(row.cover_gh_path || '');
        return {
          id: Number(row.id),
          slug: String(row.slug),
          title: String(row.title),
          cover_url: rf ? await signImageUrl(rf, c.env.HMAC_SECRET_KEY, ttl, rg) : '',
          status: String(row.status),
          views_total: Number(row.views_total || 0),
          rating_avg: Number(row.rating_avg || 5.0),
          updated_at: String(row.updated_at),
        };
      })
    );

    const allChapters = navRes.rows;
    const currentIdx = allChapters.findIndex((ch) => Number(ch.id) === chapterId);
    const prevChapter = currentIdx > 0 ? allChapters[currentIdx - 1] : null;
    const nextChapter = currentIdx >= 0 && currentIdx < allChapters.length - 1 ? allChapters[currentIdx + 1] : null;

    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return c.json({
      success: true,
      data: {
        chapter: chapterRes.rows[0],
        prev_chapter: prevChapter,
        next_chapter: nextChapter,
        pages,
        all_chapters: allChapters,
        recommended_comics: recommendedComics,
      },
    });
  } catch {
    return c.json({ success: false, message: 'Không thể tải danh sách trang ảnh.' }, 500);
  }
});

apiRoutes.post('/comics/:id/view', async (c) => {
  try {
    const comicId = Number(c.req.param('id'));
    if (!Number.isFinite(comicId) || comicId <= 0) return c.json({ success: false }, 400);
    const db = getDb(c.env);
    await db.execute({
      sql: `UPDATE comics SET views_day = views_day + 1, views_week = views_week + 1, views_month = views_month + 1, views_total = views_total + 1 WHERE id = ?`,
      args: [comicId],
    });
    return c.json({ success: true });
  } catch {
    return c.json({ success: false }, 500);
  }
});

apiRoutes.post('/comics/:id/rate', async (c) => {
  try {
    const comicId = Number(c.req.param('id'));
    if (!Number.isFinite(comicId) || comicId <= 0) return c.json({ success: false, message: 'Mã truyện không hợp lệ.' }, 400);
    const body = (await c.req.json().catch(() => ({}))) as { rating?: number };
    const score = Number(body.rating);
    if (!Number.isFinite(score) || score < 1 || score > 5) return c.json({ success: false, message: 'Điểm từ 1 đến 5 sao.' }, 400);
    const db = getDb(c.env);
    const res = await db.execute({ sql: 'SELECT rating_avg, rating_count FROM comics WHERE id = ? LIMIT 1', args: [comicId] });
    if (res.rows.length === 0) return c.json({ success: false, message: 'Không tìm thấy truyện.' }, 404);
    const curAvg = Number(res.rows[0].rating_avg || 5.0);
    const curCount = Number(res.rows[0].rating_count || 1);
    const nextCount = curCount + 1;
    const nextAvg = Math.round(((curAvg * curCount + score) / nextCount) * 100) / 100;
    await db.execute({ sql: 'UPDATE comics SET rating_avg = ?, rating_count = ? WHERE id = ?', args: [nextAvg, nextCount, comicId] });
    return c.json({ success: true, data: { rating_avg: nextAvg, rating_count: nextCount } });
  } catch {
    return c.json({ success: false, message: 'Không thể gửi đánh giá.' }, 500);
  }
});

apiRoutes.post('/reports', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      comic_id?: number; chapter_id?: number | null; reason?: string; detail?: string;
    };
    const comicId = Number(body.comic_id);
    const chapterId = body.chapter_id ? Number(body.chapter_id) : null;
    const reason = String(body.reason || '').trim().slice(0, 120);
    const detail = String(body.detail || '').trim().slice(0, 500);
    if (!Number.isFinite(comicId) || comicId <= 0 || !reason) {
      return c.json({ success: false, message: 'Vui lòng chọn lý do báo lỗi.' }, 400);
    }
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);
    await db.execute({
      sql: 'INSERT INTO chapter_reports (comic_id, chapter_id, reason, detail) VALUES (?, ?, ?, ?)',
      args: [comicId, chapterId, reason, detail],
    });
    return c.json({ success: true, message: 'Đã ghi nhận báo lỗi. Cảm ơn bạn!' });
  } catch {
    return c.json({ success: false, message: 'Không thể gửi báo lỗi lúc này.' }, 500);
  }
});

apiRoutes.get('/leaderboard/:category', async (c) => {
  try {
    const category = c.req.param('category');
    const period = c.req.query('period') || 'daily';
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const limit = 30;
    const offset = (page - 1) * limit;

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    let viewCol = 'views_day';
    if (period === 'weekly') viewCol = 'views_week';
    else if (period === 'monthly') viewCol = 'views_month';
    else if (period === 'all-time') viewCol = 'views_total';

    const ttl = Number(c.env.IMAGE_TOKEN_TTL_SECONDS || 900);

    if (category === 'manga' || category === 'waifu') {
      const countRes = await db.execute('SELECT COUNT(*) AS total FROM comics WHERE COALESCE(is_hidden, 0) = 0');
      const total = Number(countRes.rows[0]?.total || 0);

      const listRes = await db.execute({
        sql: `
          SELECT id, slug, title, cover_file_id, cover_gh_path, status, ${viewCol} AS views, likes_count,
                 (SELECT MAX(ch.chapter_number) FROM chapters ch WHERE ch.comic_id = comics.id) AS latest_chapter
          FROM comics
          WHERE COALESCE(is_hidden, 0) = 0
          ORDER BY ${viewCol} DESC, likes_count DESC, updated_at DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset],
      });

      const items = await Promise.all(
        listRes.rows.map(async (row) => {
          const cf = String(row.cover_file_id || '');
          const cg = String(row.cover_gh_path || '');
          return {
            id: Number(row.id),
            slug: String(row.slug),
            title: String(row.title),
            cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
            views: Number(row.views || 0),
            likes_count: Number(row.likes_count || 0),
            status: String(row.status),
            latest_chapter: row.latest_chapter !== null ? Number(row.latest_chapter) : null,
          };
        })
      );

      c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      return c.json({
        success: true,
        data: {
          category,
          period,
          items,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit), startRank: offset + 1 },
        },
      });
    } else if (category === 'artists') {
      const authorsRes = await db.execute({
        sql: `
          SELECT a.id, a.slug, a.name,
                 COALESCE(SUM(c.${viewCol}), 0) AS total_views,
                 COALESCE(SUM(c.likes_count), 0) AS total_likes,
                 COUNT(c.id) AS comic_count,
                 (SELECT c2.cover_file_id FROM comics c2 WHERE c2.author_id = a.id ORDER BY c2.${viewCol} DESC LIMIT 1) AS cover_file_id,
                 (SELECT c2.cover_gh_path FROM comics c2 WHERE c2.author_id = a.id ORDER BY c2.${viewCol} DESC LIMIT 1) AS cover_gh_path
          FROM authors a
          JOIN comics c ON c.author_id = a.id AND COALESCE(c.is_hidden, 0) = 0
          GROUP BY a.id
          ORDER BY total_views DESC, total_likes DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset],
      });

      const items = await Promise.all(
        authorsRes.rows.map(async (row) => {
          const cf = String(row.cover_file_id || '');
          const cg = String(row.cover_gh_path || '');
          return {
            id: Number(row.id),
            slug: String(row.slug),
            name: String(row.name),
            views: Number(row.total_views || 0),
            likes_count: Number(row.total_likes || 0),
            comic_count: Number(row.comic_count || 0),
            cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
          };
        })
      );

      c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      return c.json({
        success: true,
        data: {
          category,
          period,
          items,
          pagination: { page, limit, total: items.length, totalPages: 1, startRank: offset + 1 },
        },
      });
    } else if (category === 'translator') {
      const transRes = await db.execute({
        sql: `
          SELECT TRIM(translator) AS name,
                 COALESCE(SUM(${viewCol}), 0) AS total_views,
                 COALESCE(SUM(likes_count), 0) AS total_likes,
                 COUNT(*) AS comic_count,
                 (SELECT c2.cover_file_id FROM comics c2 WHERE TRIM(c2.translator) = TRIM(comics.translator) ORDER BY c2.${viewCol} DESC LIMIT 1) AS cover_file_id,
                 (SELECT c2.cover_gh_path FROM comics c2 WHERE TRIM(c2.translator) = TRIM(comics.translator) ORDER BY c2.${viewCol} DESC LIMIT 1) AS cover_gh_path
          FROM comics
          WHERE TRIM(COALESCE(translator, '')) != '' AND COALESCE(is_hidden, 0) = 0
          GROUP BY TRIM(translator)
          ORDER BY total_views DESC, total_likes DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset],
      });

      const items = await Promise.all(
        transRes.rows.map(async (row) => {
          const cf = String(row.cover_file_id || '');
          const cg = String(row.cover_gh_path || '');
          const name = String(row.name);
          return {
            id: name,
            slug: name,
            name: name,
            views: Number(row.total_views || 0),
            likes_count: Number(row.total_likes || 0),
            comic_count: Number(row.comic_count || 0),
            cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
          };
        })
      );

      c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      return c.json({
        success: true,
        data: {
          category,
          period,
          items,
          pagination: { page, limit, total: items.length, totalPages: 1, startRank: offset + 1 },
        },
      });
    } else if (category === 'member') {
      const usersRes = await db.execute({
        sql: `
          SELECT u.id, u.username, u.display_name, u.avatar_seed, u.role, u.created_at,
                 (SELECT COUNT(*) FROM comments cm WHERE cm.user_id = u.id) AS comment_count
          FROM users u
          ORDER BY comment_count DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit, offset],
      });

      const items = usersRes.rows.map((row) => {
        const comments = Number(row.comment_count || 0);
        const score = comments * 25 + 100;
        return {
          id: Number(row.id),
          slug: String(row.username),
          name: String(row.display_name || row.username),
          avatar_seed: String(row.avatar_seed || row.username),
          role: String(row.role || 'user'),
          score,
          views: score,
          comic_count: comments,
        };
      });

      c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      return c.json({
        success: true,
        data: {
          category,
          period,
          items,
          pagination: { page, limit, total: items.length, totalPages: 1, startRank: offset + 1 },
        },
      });
    }

    return c.json({ success: true, data: { category, period, items: [], pagination: { page: 1, limit: 30, total: 0, totalPages: 1, startRank: 1 } } });
  } catch {
    return c.json({ success: false, message: 'Không thể tải bảng xếp hạng.' }, 500);
  }
});
