import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../../middleware/validacion.js';
import { authenticate } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { cookieName, cookieOptions, csrfToken } from '../../core/seguridad.js';
import { publicUser } from './autenticacion.repository.js';
import { loginSchema } from './autenticacion.schemas.js';
import { login, logout } from './autenticacion.service.js';

export function authRoutes(pool, config) {
  const router = Router();
  const cookies = cookieOptions(config.production);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.loginLimit,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Demasiados intentos de acceso; intenta más tarde', codigo: 'LIMITE_ACCESO' } });

  router.post('/login', limiter, validate({ body: loginSchema }), async (request, response) => {
    const result = await login(pool, request.data.body, request.cookies[cookieName], config.sessionHours);
    response.cookie(cookieName, result.token, { ...cookies, maxAge: config.sessionHours * 3600000 }).json(result.payload);
  });
  router.get('/me', authenticate(pool), (request, response) => {
    response.json({ usuario: publicUser(request.auth), csrf_token: csrfToken(request.auth.token), expira_en: request.auth.expira_en });
  });
  router.post('/logout', authenticate(pool), requireCsrf, async (request, response) => {
    await logout(pool, request.auth);
    response.clearCookie(cookieName, cookies).status(204).end();
  });
  return router;
}
