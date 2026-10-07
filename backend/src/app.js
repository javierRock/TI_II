import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { apiRoutes } from './api/routes.js';
import { sameOrigin } from './middleware/csrf.js';
import { errorHandler } from './middleware/errores.js';

export function createApp(pool, options = {}) {
  const config = { production: false, sessionHours: 8, loginLimit: 10,
    appOrigin: 'http://127.0.0.1:3000', ...options };
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'script-src': ["'self'"], 'style-src': ["'self'"],
    'connect-src': ["'self'"], 'form-action': ["'self'"],
    'upgrade-insecure-requests': config.production ? [] : null,
  } } }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api/v1', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(sameOrigin(config.appOrigin));

  app.get('/api/v1/health', async (_request, response, next) => {
    try {
      await pool.query('SELECT 1');
      response.json({ estado: 'ok', base_datos: 'disponible' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/v1', apiRoutes(pool, config));

  // Exponer únicamente los archivos públicos; nunca la raíz ni el .env.
  app.use(express.static(fileURLToPath(new URL('../../frontend/', import.meta.url)), {
    dotfiles: 'deny', etag: false, maxAge: 0,
    setHeaders(response) { response.set('Cache-Control', 'no-store'); },
  }));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Ruta no encontrada' });
  });
  app.use(errorHandler);
  return app;
}
