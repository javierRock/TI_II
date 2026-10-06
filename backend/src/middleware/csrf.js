import { HttpError } from '../shared/errors.js';
import { csrfToken, sameToken } from '../core/seguridad.js';

export function sameOrigin(appOrigin) {
  return (request, _response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    if (request.get('sec-fetch-site') === 'cross-site' || (request.get('origin') && request.get('origin') !== appOrigin)) {
      return next(new HttpError(403, 'Origen de solicitud no permitido', 'ORIGEN_NO_PERMITIDO'));
    }
    if (!request.is('application/json')) return next(new HttpError(415, 'Utiliza Content-Type: application/json'));
    next();
  };
}

export function requireCsrf(request, _response, next) {
  if (!sameToken(request.get('x-csrf-token'), csrfToken(request.auth.token))) {
    return next(new HttpError(403, 'Token CSRF inválido o ausente', 'CSRF'));
  }
  next();
}
