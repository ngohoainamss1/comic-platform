import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { apiRoutes } from './routes/api';
import { imageProxyRoutes } from './routes/imageProxy';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'comic-edge-worker',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/*', rateLimitMiddleware);
app.route('/api', apiRoutes);
app.route('/img', imageProxyRoutes);

app.notFound((c) => {
  return c.json({ success: false, message: 'Đường dẫn không tồn tại.' }, 404);
});

export default app;
