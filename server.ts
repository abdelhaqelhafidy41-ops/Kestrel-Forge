import 'dotenv/config';
import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = isProd ? Number(process.env.PORT) || 3000 : 3000;
  const httpServer = http.createServer(app);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // Fast healthcheck so readiness probes pass immediately on startup
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(cookieParser());

  // Serve uploaded product images
  let uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.accessSync(uploadsDir, fs.constants.W_OK);
  } catch {
    uploadsDir = path.join(os.tmpdir(), 'kestrel-forge-uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Initialize SQLite database & API router asynchronously after binding port
  const backendPromise = (async () => {
    const [{ db, initDatabase }, { apiRouter }] = await Promise.all([
      import('./server/db.ts'),
      import('./server/routes.ts'),
    ]);
    initDatabase();
    return { db, apiRouter };
  })();

  // Dynamic robots.txt & sitemap.xml for SEO
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', async (req, res, next) => {
    try {
      const { db } = await backendPromise;
      const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const staticPaths = ['/', '/products', '/games', '/android', '/windows', '/web-apps', '/about', '/contact', '/privacy', '/terms'];
      const products = db
        .prepare('SELECT slug, updated_at FROM products WHERE published = 1')
        .all() as Array<{ slug: string; updated_at: string }>;

      const urls = [
        ...staticPaths.map((p) => `<url><loc>${baseUrl}${p}</loc><changefreq>weekly</changefreq></url>`),
        ...products.map(
          (p) =>
            `<url><loc>${baseUrl}/product/${encodeURIComponent(p.slug)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url>`
        ),
      ].join('\n  ');

      res
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls}\n</urlset>`);
    } catch (err) {
      next(err);
    }
  });

  // Mount API routes once initialized
  app.use('/api', async (req, res, next) => {
    try {
      const { apiRouter } = await backendPromise;
      apiRouter(req, res, next);
    } catch (err) {
      next(err);
    }
  });

  let viteInstance: { close: () => Promise<void>; middlewares: express.RequestHandler } | null = null;

  if (!isProd) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vitePromise = import('vite').then(async ({ createServer: createViteServer }) => {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          hmr: disableHmr ? false : { server: httpServer },
          ws: disableHmr ? false : { server: httpServer },
        },
        appType: 'spa',
      });
      viteInstance = vite;
      return vite;
    });
    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  let retries = 0;
  const startListening = () => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Kestrel Forge server listening on http://localhost:${PORT} (0.0.0.0:${PORT})`);
    });
  };

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && retries < 15) {
      retries += 1;
      setTimeout(startListening, 300);
      return;
    }
    console.error('Server error:', err);
    process.exit(1);
  });

  const shutdown = () => {
    httpServer.close(() => {
      if (viteInstance) {
        viteInstance.close().finally(() => process.exit(0));
      } else {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  startListening();
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
