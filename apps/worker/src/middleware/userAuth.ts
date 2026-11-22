import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { verifyUserToken } from '../utils/crypto';

export async function requireUserAuth(
  c: Context<{
    Bindings: Env;
    Variables: { user: { id: number; username: string; role: string } };
  }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return c.json({ success: false, message: 'Vui lòng đăng nhập để thực hiện hành động này.' }, 401);
  }

  const user = await verifyUserToken(token, c.env.HMAC_SECRET_KEY);
  if (!user) {
    return c.json({ success: false, message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.' }, 401);
  }

  c.set('user', user);
  return next();
}

export async function optionalUserAuth(
  c: Context<{
    Bindings: Env;
    Variables: { user?: { id: number; username: string; role: string } };
  }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (token) {
    const user = await verifyUserToken(token, c.env.HMAC_SECRET_KEY);
    if (user) {
      c.set('user', user);
    }
  }
  return next();
}
