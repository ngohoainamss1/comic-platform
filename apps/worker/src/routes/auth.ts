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
  } catch (err) {
    return c.json({ success: false, message: 'Lỗi đăng ký tài khoản.' }, 500);
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
      sql: 'SELECT id, username, display_name, password_hash, avatar_seed, role FROM users WHERE username = ? LIMIT 1',
      args: [username],
    });
    if (userRes.rows.length === 0) {
      return c.json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' }, 401);
    }

    const u = userRes.rows[0];
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
  } catch {
    return c.json({ success: false, message: 'Lỗi đăng nhập.' }, 500);
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
