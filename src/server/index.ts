import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';

const app = createApp();
const port = Number(process.env.PORT ?? 3000);
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});

if (process.env.NODE_ENV === 'production') {
  app.use('*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

const listener = getRequestListener(app.fetch);
const server = createServer();
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
  server.on('request', (req, res) => {
    if (req.url?.startsWith('/api/')) return listener(req, res);
    vite.middlewares(req, res, () => listener(req, res));
  });
} else server.on('request', listener);

server.listen(port, '0.0.0.0', () =>
  console.log(`PennSpots listening on port ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
