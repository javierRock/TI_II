import { cookieName, tokenHash, validToken } from '../core/seguridad.js';
import { HttpError } from '../shared/errors.js';
import { findSession } from '../modules/autenticacion/autenticacion.repository.js';

export function authenticate(pool) {
  return async (request, _response, next) => {
    const token = request.cookies[cookieName];
    if (!validToken(token)) throw new HttpError(401, 'Debes iniciar sesión', 'NO_AUTENTICADO');
    const session = await findSession(pool, tokenHash(token));
    if (!session) throw new HttpError(401, 'Sesión inválida o vencida', 'NO_AUTENTICADO');
    request.auth = { ...session, token };
    next();
  };
}

export function requireAdmin(request, _response, next) {
  if (!request.auth.atribucion_admin || request.auth.rol === 'estudiante') {
    throw new HttpError(403, 'Se requiere atribución administrativa', 'SIN_PERMISO');
  }
  next();
}
