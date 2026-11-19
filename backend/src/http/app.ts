/**
 * HTTP layer: security headers, health check and (in production) the built SPA.
 * Serving the frontend from the same origin avoids CORS entirely and needs only one free host.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from '../config';

export function createApp(config: Config, stats: () => Record<string, unknown>): Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  // Google Identity Services needs its script, button iframe and profile photos; nothing else is third-party.
  const google = config.GOOGLE_CLIENT_ID !== '';
  const gsi = google ? ['https://accounts.google.com/gsi/'] : [];
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", ...(google ? ['https://accounts.google.com/gsi/client'] : [])],
          'style-src': ["'self'", "'unsafe-inline'", ...(google ? ['https://accounts.google.com/gsi/style'] : [])],
          'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com'],
          'connect-src': ["'self'", 'ws:', 'wss:', ...gsi],
          'frame-src': gsi.length ? gsi : ["'none'"],
          'font-src': ["'self'", 'data:'],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          // Allow plain-HTTP LAN play (e.g. http://192.168.x.x:3001); TLS is the host's job.
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      // Google's sign-in popup must be able to post the result back to this window.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      // Profile photos are cross-origin images; never leak our URLs (room codes) to Google.
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  /** Public runtime config for the SPA (lets one build work on any host). */
  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ googleClientId: config.GOOGLE_CLIENT_ID || null });
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), ...stats() });
  });

  const staticDir = path.resolve(config.STATIC_DIR ?? path.join(import.meta.dirname, '../../../frontend/dist'));
  const indexHtml = path.join(staticDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h', immutable: false }));
    app.use('/assets', express.static(path.join(staticDir, 'assets'), { maxAge: '1y', immutable: true }));
    // SPA fallback for client-side routes such as /r/ABCD
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else if (config.NODE_ENV === 'production') {
    console.warn(`Frontend build not found at ${staticDir} — run "npm run build" first.`);
  }

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  return app;
}
