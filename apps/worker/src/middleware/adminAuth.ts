import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyAdminToken } from '../utils/crypto';

export async function adminAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return c.json({ success: false, message: 'Chưa đăng nhập quyền quản trị.' }, 401);
  }

  const secret = c.env.HMAC_SECRET_KEY || '';
  const valid = await verifyAdminToken(token, secret);
  if (!valid) {
    return c.json({ success: false, message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.' }, 401);
  }

  return next();
}
