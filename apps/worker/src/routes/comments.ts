import { Hono } from 'hono';
import type { Env } from '../types';
import { getDb } from '../db/client';
import { ensureSchemaMigrated } from '../db/migrate';
import { hashPassword, verifyPassword, signUserToken, toUtcIso } from '../utils/crypto';
import { requireUserAuth, optionalUserAuth } from '../middleware/userAuth';

export const commentsRoutes = new Hono<{
  Bindings: Env;
  Variables: { user?: { id: number; username: string; role: string } };
}>();

const ALLOWED_MEME_DOMAINS = ['cdn.jsdelivr.net', 'media.giphy.com', 'media.tenor.com', 'i.giphy.com'];

function isValidMemeUrl(url?: string | null): boolean {
  if (!url) return true;
  if (url.startsWith('preset:')) return true;
  if (!url.startsWith('https://')) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_MEME_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

commentsRoutes.get('/recent', async (c) => {
  try {
    const limit = Math.min(Number(c.req.query('limit') || 20), 50);
    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const rs = await db.execute({
      sql: `
        SELECT
          cm.id,
          cm.content,
          cm.meme_url,
          cm.created_at,
          cm.parent_id,
          u.id AS user_id,
          u.username,
          u.display_name,
          u.avatar_seed,
          co.id AS comic_id,
          co.slug AS comic_slug,
          co.title AS comic_title,
          co.cover_url AS comic_cover_url,
          ch.chapter_number,
          pu.display_name AS reply_to_name,
          pu.username AS reply_to_username
        FROM comments cm
        LEFT JOIN users u ON cm.user_id = u.id
        LEFT JOIN comics co ON cm.comic_id = co.id
        LEFT JOIN chapters ch ON cm.chapter_id = ch.id
        LEFT JOIN comments pcm ON cm.parent_id = pcm.id
        LEFT JOIN users pu ON pcm.user_id = pu.id
        WHERE cm.is_deleted = 0
        ORDER BY cm.created_at DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return c.json({ success: true, comments: rs.rows });
  } catch (err: any) {
    return c.json({ success: false, comments: [], message: err?.message || 'Lỗi server' }, 500);
  }
});

commentsRoutes.get('/', optionalUserAuth, async (c) => {
  try {
    let comicId = Number(c.req.query('comic_id'));
    const chapterIdQuery = c.req.query('chapter_id');
    const chapterId = chapterIdQuery !== undefined && chapterIdQuery !== '' ? Number(chapterIdQuery) : null;
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20));
    const offset = (page - 1) * limit;

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    if ((!Number.isFinite(comicId) || comicId <= 0) && chapterId !== null && Number.isFinite(chapterId)) {
      const chRes = await db.execute({
        sql: `SELECT comic_id FROM chapters WHERE id = ?`,
        args: [chapterId],
      });
      if (chRes.rows.length > 0 && chRes.rows[0].comic_id) {
        comicId = Number(chRes.rows[0].comic_id);
      }
    }

    if ((!Number.isFinite(comicId) || comicId <= 0) && body.comic_slug) {
      const slug = String(body.comic_slug).trim();
      const cmRes = await db.execute({
        sql: `SELECT id FROM comics WHERE slug = ? LIMIT 1`,
        args: [slug],
      });
      if (cmRes.rows.length > 0 && cmRes.rows[0].id) {
        comicId = Number(cmRes.rows[0].id);
      }
    }

    if (!Number.isFinite(comicId) || comicId <= 0) {
      return c.json({ success: false, message: 'Mã truyện không hợp lệ.' }, 400);
    }

    const currentUser = c.get('user');
    const currentUserId = currentUser ? currentUser.id : 0;

    let chapterCond = '1 = 1';
    const args: any[] = [currentUserId, comicId];
    if (chapterId !== null && Number.isFinite(chapterId)) {
      chapterCond = 'c.chapter_id = ?';
      args.push(chapterId);
    }

    // Lấy comment gốc (parent_id IS NULL)
    const topRes = await db.execute({
      sql: `
        SELECT c.id, c.comic_id, c.chapter_id, c.user_id, c.parent_id, c.reply_to_name,
               c.content, c.meme_url, c.likes_count, c.is_deleted, c.created_at,
               u.username, u.display_name, u.avatar_seed, u.role,
               ch.chapter_number,
               (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id AND r.is_deleted = 0) AS reply_count,
               (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked_by_me
        FROM comments c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN chapters ch ON ch.id = c.chapter_id
        WHERE c.comic_id = ? AND ${chapterCond} AND c.parent_id IS NULL AND c.is_deleted = 0
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    const comments = await Promise.all(
      topRes.rows.map(async (row) => {
        const commentId = Number(row.id);
        const repliesRes = await db.execute({
          sql: `
            SELECT r.id, r.comic_id, r.chapter_id, r.user_id, r.parent_id, r.reply_to_name,
                   r.content, r.meme_url, r.likes_count, r.is_deleted, r.created_at,
                   u.username, u.display_name, u.avatar_seed, u.role,
                   ch.chapter_number,
                   (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = r.id AND l.user_id = ?) AS liked_by_me
            FROM comments r
            JOIN users u ON u.id = r.user_id
            LEFT JOIN chapters ch ON ch.id = r.chapter_id
            WHERE r.parent_id = ? AND r.is_deleted = 0
            ORDER BY r.created_at ASC
          `,
          args: [currentUserId, commentId],
        });

        const replies = repliesRes.rows.map((rr) => ({
          id: Number(rr.id),
          comic_id: Number(rr.comic_id),
          chapter_id: rr.chapter_id !== null ? Number(rr.chapter_id) : null,
          chapter_number: rr.chapter_number !== null && rr.chapter_number !== undefined ? Number(rr.chapter_number) : null,
          user_id: Number(rr.user_id),
          parent_id: Number(rr.parent_id),
          reply_to_name: rr.reply_to_name ? String(rr.reply_to_name) : null,
          content: String(rr.content || ''),
          meme_url: rr.meme_url ? String(rr.meme_url) : null,
          likes_count: Number(rr.likes_count || 0),
          is_deleted: Number(rr.is_deleted || 0),
          created_at: toUtcIso(String(rr.created_at)),
          liked_by_me: Number(rr.liked_by_me || 0) > 0,
          user: {
            username: String(rr.username),
            display_name: String(rr.display_name),
            avatar_seed: String(rr.avatar_seed),
            role: String(rr.role),
          },
        }));

        return {
          id: commentId,
          comic_id: Number(row.comic_id),
          chapter_id: row.chapter_id !== null ? Number(row.chapter_id) : null,
          chapter_number: row.chapter_number !== null && row.chapter_number !== undefined ? Number(row.chapter_number) : null,
          user_id: Number(row.user_id),
          parent_id: null,
          reply_to_name: null,
          content: String(row.content || ''),
          meme_url: row.meme_url ? String(row.meme_url) : null,
          likes_count: Number(row.likes_count || 0),
          is_deleted: Number(row.is_deleted || 0),
          created_at: toUtcIso(String(row.created_at)),
          reply_count: Number(row.reply_count || 0),
          liked_by_me: Number(row.liked_by_me || 0) > 0,
          user: {
            username: String(row.username),
            display_name: String(row.display_name),
            avatar_seed: String(row.avatar_seed),
            role: String(row.role),
          },
          replies,
        };
      })
    );

    return c.json({ success: true, data: comments });
  } catch {
    return c.json({ success: false, message: 'Không thể tải danh sách bình luận.' }, 500);
  }
});

commentsRoutes.post('/', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const body = (await c.req.json().catch(() => ({}))) as {
      comic_id?: number;
      chapter_id?: number | null;
      parent_id?: number | null;
      reply_to_name?: string | null;
      content?: string;
      meme_url?: string | null;
    };

    let comicId = Number(body.comic_id);
    const chapterId = body.chapter_id !== undefined && body.chapter_id !== null ? Number(body.chapter_id) : null;
    let parentId = body.parent_id !== undefined && body.parent_id !== null ? Number(body.parent_id) : null;
    const replyToName = body.reply_to_name ? String(body.reply_to_name).trim().slice(0, 32) : null;
    const content = String(body.content || '').trim().slice(0, 1000);
    const memeUrl = body.meme_url ? String(body.meme_url).trim() : null;

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    if ((!Number.isFinite(comicId) || comicId <= 0) && chapterId !== null && Number.isFinite(chapterId)) {
      const chRes = await db.execute({
        sql: `SELECT comic_id FROM chapters WHERE id = ?`,
        args: [chapterId],
      });
      if (chRes.rows.length > 0 && chRes.rows[0].comic_id) {
        comicId = Number(chRes.rows[0].comic_id);
      }
    }

    if ((!Number.isFinite(comicId) || comicId <= 0) && body.comic_slug) {
      const slug = String(body.comic_slug).trim();
      const cmRes = await db.execute({
        sql: `SELECT id FROM comics WHERE slug = ? LIMIT 1`,
        args: [slug],
      });
      if (cmRes.rows.length > 0 && cmRes.rows[0].id) {
        comicId = Number(cmRes.rows[0].id);
      }
    }

    if (!Number.isFinite(comicId) || comicId <= 0) {
      return c.json({ success: false, message: 'Mã truyện không hợp lệ.' }, 400);
    }
    if (!content && !memeUrl) {
      return c.json({ success: false, message: 'Bình luận không được để trống nội dung hoặc meme.' }, 400);
    }
    if (!isValidMemeUrl(memeUrl)) {
      return c.json({ success: false, message: 'Đường dẫn meme/sticker không hợp lệ.' }, 400);
    }

    if (parentId !== null && Number.isFinite(parentId)) {
      const parentRes = await db.execute({
        sql: 'SELECT id, parent_id FROM comments WHERE id = ? LIMIT 1',
        args: [parentId],
      });
      if (parentRes.rows.length === 0) {
        return c.json({ success: false, message: 'Không tìm thấy bình luận cần trả lời.' }, 404);
      }
      const pRow = parentRes.rows[0];
      if (pRow.parent_id !== null && pRow.parent_id !== undefined) {
        parentId = Number(pRow.parent_id);
      }
    }

    await db.execute({
      sql: `
        INSERT INTO comments (comic_id, chapter_id, user_id, parent_id, reply_to_name, content, meme_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [comicId, chapterId, authUser.id, parentId, replyToName, content, memeUrl],
    });

    let chapNum = null;
    if (chapterId !== null) {
      const chRes = await db.execute({
        sql: 'SELECT chapter_number FROM chapters WHERE id = ? LIMIT 1',
        args: [chapterId],
      });
      if (chRes.rows.length > 0) {
        chapNum = Number(chRes.rows[0].chapter_number);
      }
    }

    const newRes = await db.execute({
      sql: `
        SELECT c.id, c.comic_id, c.chapter_id, c.user_id, c.parent_id, c.reply_to_name,
               c.content, c.meme_url, c.likes_count, c.is_deleted, c.created_at,
               u.username, u.display_name, u.avatar_seed, u.role
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ?
        ORDER BY c.id DESC
        LIMIT 1
      `,
      args: [authUser.id],
    });

    const row = newRes.rows[0];
    const createdComment = {
      id: Number(row.id),
      comic_id: Number(row.comic_id),
      chapter_id: row.chapter_id !== null ? Number(row.chapter_id) : null,
      chapter_number: chapNum,
      user_id: Number(row.user_id),
      parent_id: row.parent_id !== null ? Number(row.parent_id) : null,
      reply_to_name: row.reply_to_name ? String(row.reply_to_name) : null,
      content: String(row.content || ''),
      meme_url: row.meme_url ? String(row.meme_url) : null,
      likes_count: Number(row.likes_count || 0),
      is_deleted: Number(row.is_deleted || 0),
      created_at: toUtcIso(String(row.created_at)),
      reply_count: 0,
      liked_by_me: false,
      user: {
        username: String(row.username),
        display_name: String(row.display_name),
        avatar_seed: String(row.avatar_seed),
        role: String(row.role),
      },
      replies: [],
    };

    return c.json({ success: true, message: 'Đã đăng bình luận thành công!', data: createdComment });
  } catch {
    return c.json({ success: false, message: 'Không thể đăng bình luận.' }, 500);
  }
});

commentsRoutes.post('/:id/like', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const commentId = Number(c.req.param('id'));
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return c.json({ success: false, message: 'Mã bình luận không hợp lệ.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const check = await db.execute({
      sql: 'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1',
      args: [commentId, authUser.id],
    });

    let liked = false;
    if (check.rows.length > 0) {
      await db.execute({
        sql: 'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
        args: [commentId, authUser.id],
      });
      await db.execute({
        sql: 'UPDATE comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?',
        args: [commentId],
      });
      liked = false;
    } else {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
        args: [commentId, authUser.id],
      });
      await db.execute({
        sql: 'UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?',
        args: [commentId],
      });
      liked = true;
    }

    const countRes = await db.execute({
      sql: 'SELECT likes_count FROM comments WHERE id = ? LIMIT 1',
      args: [commentId],
    });
    const likes_count = countRes.rows[0] ? Number(countRes.rows[0].likes_count) : 0;

    return c.json({ success: true, liked, likes_count });
  } catch {
    return c.json({ success: false, message: 'Không thể thích bình luận.' }, 500);
  }
});

commentsRoutes.delete('/:id', requireUserAuth, async (c) => {
  try {
    const authUser = c.get('user');
    const commentId = Number(c.req.param('id'));
    if (!Number.isFinite(commentId) || commentId <= 0) {
      return c.json({ success: false, message: 'Mã bình luận không hợp lệ.' }, 400);
    }

    const db = getDb(c.env);
    await ensureSchemaMigrated(db);

    const commentRes = await db.execute({
      sql: 'SELECT user_id FROM comments WHERE id = ? LIMIT 1',
      args: [commentId],
    });
    if (commentRes.rows.length === 0) {
      return c.json({ success: false, message: 'Không tìm thấy bình luận.' }, 404);
    }

    const commentUserId = Number(commentRes.rows[0].user_id);
    if (authUser.role !== 'admin' && authUser.id !== commentUserId) {
      return c.json({ success: false, message: 'Bạn không có quyền xóa bình luận này.' }, 403);
    }

    await db.execute({
      sql: 'UPDATE comments SET is_deleted = 1 WHERE id = ? OR parent_id = ?',
      args: [commentId, commentId],
    });

    return c.json({ success: true, message: 'Đã xóa bình luận.' });
  } catch {
    return c.json({ success: false, message: 'Không thể xóa bình luận.' }, 500);
  }
});
