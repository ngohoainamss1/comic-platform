import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { apiRoutes } from './routes/api';
import { adminRoutes } from './routes/admin';
import { imageProxyRoutes } from './routes/imageProxy';
import { spotlightRedirectRoutes } from './routes/spotlight';
import { authRoutes } from './routes/auth';
import { commentsRoutes } from './routes/comments';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.get('/health', (c) => c.json({ status: 'ok', service: 'comic-edge-worker', timestamp: new Date().toISOString() }));

app.use('/api/*', rateLimitMiddleware);
app.route('/api/admin', adminRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/comments', commentsRoutes);
app.route('/api', apiRoutes);
app.route('/img', imageProxyRoutes);
app.route('/go', spotlightRedirectRoutes);

app.notFound((c) => c.json({ success: false, message: 'Đường dẫn không tồn tại.' }, 404));

export default app;
