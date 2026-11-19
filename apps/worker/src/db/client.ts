import { createClient, type Client } from '@libsql/client/web';
import type { Env } from '../types';

export function getDb(env: Env): Client {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error('Thiếu cấu hình kết nối cơ sở dữ liệu Turso.');
  }

  return createClient({
    url: env.TURSO_DATABASE_URL.trim(),
    authToken: env.TURSO_AUTH_TOKEN.trim(),
  });
}
