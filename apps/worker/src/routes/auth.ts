import { Hono } from 'hono';
import type { Env } from '../types';
import { getDb } from '../db/client';
import { ensureSchemaMigrated } from '../db/migrate';
import { hashPassword, verifyPassword, signUserToken } from '../utils/crypto';
import { requireUserAuth } from '../middleware/userAuth';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user: { id: number; username: string; role: string } } }>();

authRoutes.post('/register', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      display_name?: string;
      avatar_seed?: string;
    };

    const username = (body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const display_name = (body.display_name || '').trim().slice(0, 32);
    const avatar_seed = (body.avatar_seed || 'adventurer:default').trim();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return c.json({ success: false, message: 'Tên đăng nhập từ 3-24 ký tự (chữ thường, số, gạch dưới).' }, 400);
    }
    if (password.length < 6) {
      return c.json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' }, 400);
    }
    if (!display_name) {
      return c.json({ success: false, message: 'Vui lòng nhập tên hiển thị.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ? LIMIT 1',
      args: [username],
    });
    if (existing.rows.length > 0) {
      return c.json({ success: false, message: 'Tên đăng nhập này đã được sử dụng.' }, 400);
    }

    const password_hash = await hashPassword(password);
    await db.execute({
      sql: 'INSERT INTO users (username, display_name, password_hash, avatar_seed, role) VALUES (?, ?, ?, ?, ?)',
      args: [username, display_name, password_hash, avatar_seed, 'user'],
    });

    const userRes = await db.execute({
      sql: 'SELECT id, username, display_name, avatar_seed, role FROM users WHERE username = ? LIMIT 1',
      args: [username],
    });
    const u = userRes.rows[0];
    const userId = Number(u.id);

    const token = await signUserToken({ id: userId, username, role: String(u.role) }, c.env.HMAC_SECRET_KEY);

    return c.json({
      success: true,
      token,
      user: {
        id: userId,
        username: String(u.username),
        display_name: String(u.display_name),
        avatar_seed: String(u.avatar_seed),
        role: String(u.role),
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: err?.message || 'Lỗi đăng ký tài khoản.' }, 500);
  }
});

authRoutes.post('/login', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string };
    const username = (body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || !password) {
      return c.json({ success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const userRes = await db.execute({
      sql: 'SELECT id, username, display_name, password_hash, avatar_seed, role, is_banned, ban_reason FROM users WHERE username = ? LIMIT 1',
      args: [username],
    });
    if (userRes.rows.length === 0) {
      return c.json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, 401);
    }

    const u = userRes.rows[0];
    if (Number(u.is_banned) === 1) {
      return c.json({ success: false, message: `Tài khoản của bạn đã bị khóa. Lý do: ${String(u.ban_reason || 'Vi phạm nội quy')}` }, 403);
    }
    const valid = await verifyPassword(password, String(u.password_hash));
    if (!valid) {
      return c.json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, 401);
    }

    const userId = Number(u.id);
    const token = await signUserToken({ id: userId, username, role: String(u.role) }, c.env.HMAC_SECRET_KEY);

    return c.json({
      success: true,
      token,
      user: {
        id: userId,
        username: String(u.username),
        display_name: String(u.display_name),
        avatar_seed: String(u.avatar_seed),
        role: String(u.role),
      },
    });
  } catch (err: any) {
    return c.json({ success: false, message: err?.message || 'Lỗi đăng nhập.' }, 500);
  }
});

authRoutes.get('/me', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const db = getDb(c.env);
    const res = await db.execute({
      sql: 'SELECT id, username, display_name, avatar_seed, role FROM users WHERE id = ? LIMIT 1',
      args: [authUser.id],
    });
    if (res.rows.length === 0) {
      return c.json({ success: false, message: 'Không tìm thấy người dùng.' }, 404);
    }
    const u = res.rows[0];
    return c.json({
      success: true,
      user: {
        id: Number(u.id),
        username: String(u.username),
        display_name: String(u.display_name),
        avatar_seed: String(u.avatar_seed),
        role: String(u.role),
      },
    });
  } catch {
    return c.json({ success: false, message: 'Không thể tải thông tin cá nhân.' }, 500);
  }
});

authRoutes.patch('/profile', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const body = (await c.req.json().catch(() => ({}))) as { display_name?: string; avatar_seed?: string };
    const display_name = body.display_name !== undefined ? body.display_name.trim().slice(0, 32) : undefined;
    const avatar_seed = body.avatar_seed !== undefined ? body.avatar_seed.trim() : undefined;

    const db = getDb(c.env);
    const sets: string[] = [];
    const args: any[] = [];

    if (display_name !== undefined) {
      if (!display_name) return c.json({ success: false, message: 'Tên hiển thị không được để trống.' }, 400);
      sets.push('display_name = ?');
      args.push(display_name);
    }
    if (avatar_seed !== undefined) {
      sets.push('avatar_seed = ?');
      args.push(avatar_seed);
    }

    if (sets.length > 0) {
      args.push(authUser.id);
      await db.execute({
        sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
        args,
      });
    }

    const res = await db.execute({
      sql: 'SELECT id, username, display_name, avatar_seed, role FROM users WHERE id = ? LIMIT 1',
      args: [authUser.id],
    });
    const u = res.rows[0];
    return c.json({
      success: true,
      message: 'Đã cập nhật hồ sơ thành công!',
      user: {
        id: Number(u.id),
        username: String(u.username),
        display_name: String(u.display_name),
        avatar_seed: String(u.avatar_seed),
        role: String(u.role),
      },
    });
  } catch {
    return c.json({ success: false, message: 'Không thể cập nhật hồ sơ.' }, 500);
  }
});

authRoutes.get('/library', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const [bmRes, histRes] = await Promise.all([
      db.execute({
        sql: `
          SELECT c.id, c.slug, c.title, c.description, c.cover_file_id, c.cover_gh_path,
                 c.status, c.views_day, c.views_week, c.views_month, c.views_total,
                 c.rating_avg, c.updated_at,
                 (SELECT MAX(ch.chapter_number) FROM chapters ch WHERE ch.comic_id = c.id) AS latest_chapter
          FROM user_bookmarks b
          JOIN comics c ON c.id = b.comic_id
          WHERE b.user_id = ?
          ORDER BY b.created_at DESC
        `,
        args: [authUser.id],
      }),
      db.execute({
        sql: `
          SELECT h.comic_id, h.chapter_id, h.chapter_number, h.progress, h.total_pages, h.read_at,
                 c.slug, c.title, c.cover_file_id, c.cover_gh_path
          FROM user_history h
          JOIN comics c ON c.id = h.comic_id
          WHERE h.user_id = ?
          ORDER BY h.read_at DESC
        `,
        args: [authUser.id],
      }),
    ]);

    const ttl = Number(c.env.IMAGE_TOKEN_TTL_SECONDS || 900);
    const { signImageUrl } = await import('../utils/crypto');

    const bookmarks = await Promise.all(
      bmRes.rows.map(async (row) => {
        const cf = String(row.cover_file_id || '');
        const cg = String(row.cover_gh_path || '');
        return {
          id: Number(row.id),
          slug: String(row.slug),
          title: String(row.title),
          description: String(row.description || ''),
          cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
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

    const history = await Promise.all(
      histRes.rows.map(async (row) => {
        const cf = String(row.cover_file_id || '');
        const cg = String(row.cover_gh_path || '');
        return {
          slug: String(row.slug),
          title: String(row.title),
          cover_url: cf ? await signImageUrl(cf, c.env.HMAC_SECRET_KEY, ttl, cg) : '',
          chapter_id: Number(row.chapter_id),
          chapter_number: Number(row.chapter_number),
          progress: Number(row.progress || 0),
          total_pages: Number(row.total_pages || 0),
          read_at: new Date(String(row.read_at)).getTime(),
        };
      })
    );

    return c.json({ success: true, data: { bookmarks, history } });
  } catch {
    return c.json({ success: false, message: 'Không thể tải thư viện cá nhân.' }, 500);
  }
});

authRoutes.post('/bookmarks', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const body = (await c.req.json().catch(() => ({}))) as { comic_id?: number; action?: 'add' | 'remove' };
    const comicId = Number(body.comic_id);
    const action = body.action === 'remove' ? 'remove' : 'add';

    if (!Number.isFinite(comicId) || comicId <= 0) {
      return c.json({ success: false, message: 'Mã truyện không hợp lệ.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    if (action === 'remove') {
      await db.execute({
        sql: 'DELETE FROM user_bookmarks WHERE user_id = ? AND comic_id = ?',
        args: [authUser.id, comicId],
      });
    } else {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO user_bookmarks (user_id, comic_id) VALUES (?, ?)',
        args: [authUser.id, comicId],
      });
    }

    return c.json({ success: true });
  } catch {
    return c.json({ success: false, message: 'Không thể cập nhật theo dõi.' }, 500);
  }
});

authRoutes.post('/history', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const body = (await c.req.json().catch(() => ({}))) as {
      comic_id?: number;
      chapter_id?: number;
      chapter_number?: number;
      progress?: number;
      total_pages?: number;
    };

    const comicId = Number(body.comic_id);
    const chapterId = Number(body.chapter_id);
    const chapterNumber = Number(body.chapter_number);
    const progress = Number(body.progress || 0);
    const totalPages = Number(body.total_pages || 0);

    if (!Number.isFinite(comicId) || !Number.isFinite(chapterId)) {
      return c.json({ success: false, message: 'Dữ liệu lịch sử không hợp lệ.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    await db.execute({
      sql: `
        INSERT INTO user_history (user_id, comic_id, chapter_id, chapter_number, progress, total_pages, read_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, comic_id) DO UPDATE SET
          chapter_id = excluded.chapter_id,
          chapter_number = excluded.chapter_number,
          progress = excluded.progress,
          total_pages = excluded.total_pages,
          read_at = CURRENT_TIMESTAMP
      `,
      args: [authUser.id, comicId, chapterId, chapterNumber, progress, totalPages],
    });

    return c.json({ success: true });
  } catch {
    return c.json({ success: false, message: 'Không thể lưu lịch sử đọc.' }, 500);
  }
});
